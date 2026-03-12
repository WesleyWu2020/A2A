"""
项目管理 & 收藏 API
路径: /api/projects/*
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from app.models.project import (
    ProjectCreateRequest, ProjectUpdateRequest,
    FavoriteAddRequest, FavoriteRemoveRequest,
)
from app.services.project_service import ProjectService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["项目管理"])

_project_service = ProjectService()


# ─── Project CRUD ─────────────────────────────────────────────────────────────

@router.get("/user/{user_id}", response_model=dict)
async def list_user_projects(user_id: str):
    """获取用户所有项目"""
    projects = await _project_service.list_projects(user_id)
    active_id = await _project_service.get_active_project_id(user_id)
    return get_standard_response(data={
        "projects": [p.model_dump(mode="json") for p in projects],
        "active_project_id": active_id,
    })


@router.get("/{project_id}", response_model=dict)
async def get_project(project_id: str):
    """获取单个项目详情"""
    project = await _project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_standard_response(data=project.model_dump(mode="json"))


@router.post("/create", response_model=dict)
async def create_project(req: ProjectCreateRequest):
    """创建新项目"""
    project = await _project_service.create_project(req)
    return get_standard_response(data=project.model_dump(mode="json"))


@router.put("/{project_id}", response_model=dict)
async def update_project(project_id: str, req: ProjectUpdateRequest):
    """更新项目信息"""
    project = await _project_service.update_project(project_id, req)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_standard_response(data=project.model_dump(mode="json"))


@router.delete("/{project_id}", response_model=dict)
async def delete_project(project_id: str, user_id: str):
    """删除项目"""
    await _project_service.delete_project(user_id, project_id)
    return get_standard_response(data={"deleted": True})


# ─── Active Project Switch ────────────────────────────────────────────────────

@router.post("/user/{user_id}/active/{project_id}", response_model=dict)
async def set_active_project(user_id: str, project_id: str):
    """切换当前活跃项目"""
    project = await _project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await _project_service.set_active_project(user_id, project_id)
    return get_standard_response(data={
        "active_project_id": project_id,
        "project_name": project.name,
    })


@router.get("/user/{user_id}/active", response_model=dict)
async def get_active_project(user_id: str):
    """获取当前活跃项目"""
    project = await _project_service.get_active_project(user_id)
    if not project:
        return get_standard_response(data=None)
    return get_standard_response(data=project.model_dump(mode="json"))


# ─── Favorites ────────────────────────────────────────────────────────────────

@router.post("/favorites/add", response_model=dict)
async def add_favorite(req: FavoriteAddRequest):
    """收藏商品到项目"""
    try:
        project = await _project_service.add_favorite(req)
        return get_standard_response(data={
            "project_id": project.project_id,
            "favorites": [f.model_dump(mode="json") for f in project.favorites],
        })
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/favorites/remove", response_model=dict)
async def remove_favorite(req: FavoriteRemoveRequest):
    """取消收藏"""
    project = await _project_service.remove_favorite(req.project_id, req.product_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_standard_response(data={
        "project_id": project.project_id,
        "favorites": [f.model_dump(mode="json") for f in project.favorites],
    })


@router.get("/{project_id}/favorites", response_model=dict)
async def list_favorites(project_id: str):
    """获取项目收藏列表"""
    project = await _project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_standard_response(data={
        "project_id": project.project_id,
        "favorites": [f.model_dump(mode="json") for f in project.favorites],
    })
