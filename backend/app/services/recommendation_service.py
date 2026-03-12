"""
方案生成服务
"""
import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.core.database import execute_query, get_connection
from app.models.recommendation import (
    RecommendationStatus, DesignScheme, SchemeItem, BuyerFeedback
)

logger = logging.getLogger(__name__)


class RecommendationService:
    """推荐服务"""
    
    async def generate_recommendations(
        self,
        session_id: str,
        num_schemes: int = 3,
        preferences: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        生成推荐方案
        
        调用 Agent 编排生成设计方案
        """
        try:
            from app.agents.orchestrator import get_orchestrator, create_initial_state
            
            orchestrator = get_orchestrator()
            
            # 创建初始状态
            state = create_initial_state(session_id)
            state["user_preferences"] = preferences or {}
            
            # 运行工作流
            result = await orchestrator.run(
                session_id=session_id,
                current_state=state
            )
            
            # 保存推荐结果
            recommendation_id = f"rec_{uuid.uuid4().hex[:16]}"
            schemes = result.get("schemes", [])
            
            query = """
                INSERT INTO recommendations 
                (recommendation_id, session_id, schemes, total_schemes, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $6)
            """
            
            await execute_query(
                query,
                recommendation_id,
                session_id,
                schemes,
                len(schemes),
                RecommendationStatus.ACTIVE,
                datetime.now(),
                fetch=False
            )
            
            return {
                "recommendation_id": recommendation_id,
                "session_id": session_id,
                "schemes": schemes,
                "total_schemes": len(schemes),
                "generated_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Generate recommendations failed: {e}")
            raise
    
    async def get_recommendation(self, recommendation_id: str) -> Optional[Dict]:
        """
        获取推荐详情
        """
        query = """
            SELECT 
                recommendation_id, session_id, schemes, total_schemes,
                status, buyer_feedback, created_at, updated_at
            FROM recommendations
            WHERE recommendation_id = $1
        """
        
        row = await execute_query(query, recommendation_id, fetch_one=True)
        
        if not row:
            return None
        
        return {
            "recommendation_id": row["recommendation_id"],
            "session_id": row["session_id"],
            "schemes": row["schemes"] or [],
            "total_schemes": row["total_schemes"],
            "status": row["status"],
            "buyer_feedback": row["buyer_feedback"] or {},
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
        }
    
    async def submit_feedback(
        self,
        recommendation_id: str,
        scheme_index: int,
        is_liked: bool,
        feedback_text: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        提交方案反馈
        """
        try:
            # 获取当前反馈
            query = """
                SELECT buyer_feedback FROM recommendations
                WHERE recommendation_id = $1
            """
            row = await execute_query(query, recommendation_id, fetch_one=True)
            
            if not row:
                raise ValueError("Recommendation not found")
            
            feedback = row["buyer_feedback"] or {}
            
            # 更新反馈
            liked_schemes = feedback.get("liked_schemes", [])
            disliked_schemes = feedback.get("disliked_schemes", [])
            
            if is_liked:
                if scheme_index not in liked_schemes:
                    liked_schemes.append(scheme_index)
                if scheme_index in disliked_schemes:
                    disliked_schemes.remove(scheme_index)
            else:
                if scheme_index not in disliked_schemes:
                    disliked_schemes.append(scheme_index)
                if scheme_index in liked_schemes:
                    liked_schemes.remove(scheme_index)
            
            feedback.update({
                "liked_schemes": liked_schemes,
                "disliked_schemes": disliked_schemes,
                "feedback_text": feedback_text,
                "updated_at": datetime.now().isoformat()
            })
            
            # 保存反馈
            update_query = """
                UPDATE recommendations
                SET buyer_feedback = $1, updated_at = $2
                WHERE recommendation_id = $3
            """
            
            await execute_query(
                update_query,
                feedback,
                datetime.now(),
                recommendation_id,
                fetch=False
            )
            
            return {
                "recommendation_id": recommendation_id,
                "feedback": feedback,
                "message": "Feedback submitted successfully"
            }
            
        except Exception as e:
            logger.error(f"Submit feedback failed: {e}")
            raise
    
    async def select_scheme(
        self,
        recommendation_id: str,
        scheme_index: int
    ) -> Dict[str, Any]:
        """
        选择方案
        """
        try:
            # 获取推荐详情
            recommendation = await self.get_recommendation(recommendation_id)
            
            if not recommendation:
                raise ValueError("Recommendation not found")
            
            schemes = recommendation.get("schemes", [])
            
            if scheme_index < 0 or scheme_index >= len(schemes):
                raise ValueError("Invalid scheme index")
            
            selected_scheme = schemes[scheme_index]
            
            # 计算建议价格范围（用于议价）
            total_price = selected_scheme.get("total_price", 0)
            suggested_range = {
                "min": total_price * 0.85,  # 最大 15% 折扣
                "max": total_price,
                "suggested_discount": 0.10  # 建议 10% 折扣
            }
            
            return {
                "recommendation_id": recommendation_id,
                "scheme_index": scheme_index,
                "scheme": selected_scheme,
                "can_negotiate": True,
                "suggested_price_range": suggested_range
            }
            
        except Exception as e:
            logger.error(f"Select scheme failed: {e}")
            raise
    
    async def get_session_recommendations(
        self,
        session_id: str,
        status: Optional[str] = None
    ) -> List[Dict]:
        """
        获取会话的所有推荐
        """
        conditions = ["session_id = $1"]
        args = [session_id]
        
        if status:
            conditions.append(f"status = ${len(args) + 1}")
            args.append(status)
        
        query = f"""
            SELECT 
                recommendation_id, session_id, schemes, total_schemes,
                status, buyer_feedback, created_at
            FROM recommendations
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
        """
        
        rows = await execute_query(query, *args)
        
        return [
            {
                "recommendation_id": row["recommendation_id"],
                "session_id": row["session_id"],
                "schemes_count": row["total_schemes"],
                "status": row["status"],
                "has_feedback": bool(row["buyer_feedback"]),
                "created_at": row["created_at"].isoformat() if row["created_at"] else None
            }
            for row in rows
        ]
    
    async def regenerate_recommendations(
        self,
        recommendation_id: str,
        adjustments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        重新生成推荐
        
        基于偏好调整重新生成
        """
        try:
            # 获取原推荐
            original = await self.get_recommendation(recommendation_id)
            
            if not original:
                raise ValueError("Recommendation not found")
            
            session_id = original["session_id"]
            
            # 合并偏好调整
            preferences = adjustments.get("preferences", {})
            preferences["exclude_previous"] = True
            preferences["previous_schemes"] = [s.get("scheme_name") for s in original.get("schemes", [])]
            
            # 生成新推荐
            return await self.generate_recommendations(
                session_id=session_id,
                num_schemes=adjustments.get("num_schemes", 3),
                preferences=preferences
            )
            
        except Exception as e:
            logger.error(f"Regenerate recommendations failed: {e}")
            raise
    
    async def get_trending_styles(self, limit: int = 10) -> List[Dict]:
        """
        获取热门风格趋势
        
        基于推荐数据统计
        """
        query = """
            SELECT 
                style,
                COUNT(*) as usage_count
            FROM (
                SELECT UNNEST(style_tags) as style
                FROM recommendations,
                LATERAL jsonb_to_recordset(schemes) AS schemes(style_tags text[])
            ) as style_usage
            GROUP BY style
            ORDER BY usage_count DESC
            LIMIT $1
        """
        
        rows = await execute_query(query, limit)
        
        return [
            {
                "style": row["style"],
                "usage_count": row["usage_count"],
                "trend_score": row["usage_count"]  # 可扩展更复杂的趋势算法
            }
            for row in rows if row["style"]
        ]
    
    async def update_recommendation_status(
        self,
        recommendation_id: str,
        status: RecommendationStatus
    ) -> bool:
        """
        更新推荐状态
        """
        try:
            query = """
                UPDATE recommendations
                SET status = $1, updated_at = $2
                WHERE recommendation_id = $3
            """
            
            await execute_query(
                query,
                status,
                datetime.now(),
                recommendation_id,
                fetch=False
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Update recommendation status failed: {e}")
            return False
