"""
项目管理服务 — 上下文隔离 + 收藏管理 (Redis 存储)
"""
import logging
import uuid
from typing import Optional, List
from datetime import datetime

from app.core.redis import cache
from app.models.project import (
    ProjectDesign, ProjectContext, ProjectCreateRequest,
    ProjectUpdateRequest, FavoriteItem, FavoriteAddRequest,
)

logger = logging.getLogger(__name__)

# Redis keys
PROJECT_LIST_KEY = "user_projects:{user_id}"       # JSON list of ProjectDesign
PROJECT_ITEM_KEY = "project:{project_id}"           # single project JSON
ACTIVE_PROJECT_KEY = "user_active_project:{user_id}" # stores project_id string
PROJECT_TTL = 60 * 60 * 24 * 90  # 90 days


class ProjectService:
    """项目上下文管理"""

    async def list_projects(self, user_id: str) -> List[ProjectDesign]:
        data = await cache.get_json(PROJECT_LIST_KEY.format(user_id=user_id))
        if not data:
            return []
        return [ProjectDesign(**p) for p in data]

    async def get_project(self, project_id: str) -> Optional[ProjectDesign]:
        data = await cache.get_json(PROJECT_ITEM_KEY.format(project_id=project_id))
        if not data:
            return None
        return ProjectDesign(**data)

    async def create_project(self, req: ProjectCreateRequest) -> ProjectDesign:
        project = ProjectDesign(
            project_id=f"proj_{uuid.uuid4().hex[:12]}",
            user_id=req.user_id,
            name=req.name,
            icon=req.icon,
            context=req.context or ProjectContext(),
        )
        # Save individual project
        await cache.set_json(
            PROJECT_ITEM_KEY.format(project_id=project.project_id),
            project.model_dump(mode="json"),
            expire=PROJECT_TTL,
        )
        # Append to user's project list
        projects = await self.list_projects(req.user_id)
        projects.append(project)
        await self._save_project_list(req.user_id, projects)
        # Set as active if first project
        if len(projects) == 1:
            await self.set_active_project(req.user_id, project.project_id)
        return project

    async def update_project(self, project_id: str, req: ProjectUpdateRequest) -> Optional[ProjectDesign]:
        project = await self.get_project(project_id)
        if not project:
            return None
        if req.name is not None:
            project.name = req.name
        if req.icon is not None:
            project.icon = req.icon
        if req.status is not None:
            project.status = req.status
        if req.context is not None:
            project.context = req.context
        project.updated_at = datetime.now()
        await self._save_project(project)
        return project

    async def delete_project(self, user_id: str, project_id: str) -> bool:
        projects = await self.list_projects(user_id)
        projects = [p for p in projects if p.project_id != project_id]
        await self._save_project_list(user_id, projects)
        await cache.delete(PROJECT_ITEM_KEY.format(project_id=project_id))
        # If active project was deleted, switch to first available
        active = await self.get_active_project_id(user_id)
        if active == project_id:
            if projects:
                await self.set_active_project(user_id, projects[0].project_id)
            else:
                await cache.delete(ACTIVE_PROJECT_KEY.format(user_id=user_id))
        return True

    # ── Active Project (context isolation switch) ─────────────────────────

    async def get_active_project_id(self, user_id: str) -> Optional[str]:
        return await cache.get(ACTIVE_PROJECT_KEY.format(user_id=user_id))

    async def get_active_project(self, user_id: str) -> Optional[ProjectDesign]:
        pid = await self.get_active_project_id(user_id)
        if not pid:
            return None
        return await self.get_project(pid)

    async def set_active_project(self, user_id: str, project_id: str) -> None:
        await cache.set(
            ACTIVE_PROJECT_KEY.format(user_id=user_id),
            project_id,
            expire=PROJECT_TTL,
        )

    # ── Favorites (collection for RAG) ────────────────────────────────────

    async def add_favorite(self, req: FavoriteAddRequest) -> ProjectDesign:
        project = await self.get_project(req.project_id)
        if not project:
            raise ValueError(f"Project {req.project_id} not found")
        # Deduplicate by product_id
        if any(f.product_id == req.product_id for f in project.favorites):
            return project
        project.favorites.append(FavoriteItem(
            product_id=req.product_id,
            product_name=req.product_name,
            price=req.price,
            image_url=req.image_url,
            reason=req.reason,
        ))
        project.updated_at = datetime.now()
        await self._save_project(project)
        return project

    async def remove_favorite(self, project_id: str, product_id: str) -> Optional[ProjectDesign]:
        project = await self.get_project(project_id)
        if not project:
            return None
        project.favorites = [f for f in project.favorites if f.product_id != product_id]
        project.updated_at = datetime.now()
        await self._save_project(project)
        return project

    # ── Link session to project ───────────────────────────────────────────

    async def link_session(self, project_id: str, session_id: str) -> None:
        project = await self.get_project(project_id)
        if project and session_id not in project.session_ids:
            project.session_ids.append(session_id)
            project.updated_at = datetime.now()
            await self._save_project(project)

    # ── Build RAG context from favorites ──────────────────────────────────

    async def build_favorites_rag_context(self, project_id: str) -> str:
        """
        将项目收藏列表格式化为可注入 prompt 的 RAG 上下文块。
        Agent 可以参考用户之前喜欢的商品风格/价位来改进推荐。
        """
        project = await self.get_project(project_id)
        if not project or not project.favorites:
            return ""

        lines = ["[FAVORITES_RAG_CONTEXT]",
                 "The user has previously favorited these products in this project. "
                 "Use them as style/price reference when generating new recommendations:"]
        for fav in project.favorites[:15]:  # cap at 15
            line = f"- {fav.product_name}"
            if fav.price:
                line += f" (${fav.price:.0f})"
            if fav.reason:
                line += f" — {fav.reason}"
            lines.append(line)
        return "\n".join(lines)

    # ── Build project context block for injection ─────────────────────────

    async def build_project_context_block(self, project_id: str) -> str:
        """
        将项目上下文格式化为可注入 prompt 的上下文块。
        """
        project = await self.get_project(project_id)
        if not project:
            return ""

        ctx = project.context
        lines = [f"[PROJECT_CONTEXT: {project.name}]"]
        if ctx.budget_total:
            remaining = ctx.budget_total - ctx.budget_spent
            lines.append(f"- Total budget: ${ctx.budget_total:.0f}, Spent: ${ctx.budget_spent:.0f}, Remaining: ${remaining:.0f}")
        if ctx.style:
            lines.append(f"- Target style: {ctx.style}")
        if ctx.room_type:
            lines.append(f"- Room type: {ctx.room_type}")
        if ctx.room_dimensions:
            dims = ctx.room_dimensions
            lines.append(f"- Room size: {dims.get('length', '?')}m × {dims.get('width', '?')}m × {dims.get('height', '?')}m")
        if ctx.constraints:
            lines.append(f"- Constraints: {', '.join(ctx.constraints)}")
        if ctx.notes:
            lines.append(f"- Notes: {ctx.notes}")

        if len(lines) <= 1:
            return ""
        return "\n".join(lines)

    # ── Private helpers ───────────────────────────────────────────────────

    async def _save_project(self, project: ProjectDesign) -> None:
        await cache.set_json(
            PROJECT_ITEM_KEY.format(project_id=project.project_id),
            project.model_dump(mode="json"),
            expire=PROJECT_TTL,
        )
        # Also update in user's list
        projects = await self.list_projects(project.user_id)
        projects = [p for p in projects if p.project_id != project.project_id]
        projects.append(project)
        await self._save_project_list(project.user_id, projects)

    async def _save_project_list(self, user_id: str, projects: List[ProjectDesign]) -> None:
        await cache.set_json(
            PROJECT_LIST_KEY.format(user_id=user_id),
            [p.model_dump(mode="json") for p in projects],
            expire=PROJECT_TTL,
        )
