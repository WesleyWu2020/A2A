"""
推荐 API
路径: /api/recommend/*
"""
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query

from app.models.recommendation import (
    RecommendRequest, RecommendResponse,
    SchemeFeedbackRequest, SchemeSelectRequest, SchemeSelectResponse,
    RecommendationStatus
)
from app.services.recommendation_service import RecommendationService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recommend", tags=["推荐"])


@router.post("/generate", response_model=dict)
async def generate_recommendations(request: RecommendRequest):
    """
    生成推荐方案
    
    - **session_id**: 会话 ID
    - **num_schemes**: 方案数量 (1-5)
    - **budget_min/max**: 预算范围
    - **style_preference**: 风格偏好
    - **room_type**: 房间类型
    """
    try:
        service = RecommendationService()
        result = await service.generate_recommendations(
            session_id=request.session_id,
            num_schemes=request.num_schemes,
            preferences={
                "budget_min": request.budget_min,
                "budget_max": request.budget_max,
                "style_preference": request.style_preference,
                "room_type": request.room_type,
                "additional_requirements": request.additional_requirements
            }
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Generate recommendations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schemes/{recommendation_id}", response_model=dict)
async def get_recommendation_schemes(recommendation_id: str):
    """
    获取推荐方案详情
    """
    try:
        service = RecommendationService()
        result = await service.get_recommendation(recommendation_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Recommendation not found")
        
        return get_standard_response(data=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get recommendation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback", response_model=dict)
async def submit_scheme_feedback(request: SchemeFeedbackRequest):
    """
    提交方案反馈
    
    - **recommendation_id**: 推荐 ID
    - **scheme_index**: 方案索引
    - **is_liked**: 是否喜欢
    - **feedback_text**: 反馈文本
    """
    try:
        service = RecommendationService()
        result = await service.submit_feedback(
            recommendation_id=request.recommendation_id,
            scheme_index=request.scheme_index,
            is_liked=request.is_liked,
            feedback_text=request.feedback_text
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Submit feedback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/select", response_model=dict)
async def select_scheme(request: SchemeSelectRequest):
    """
    选择方案
    
    - **recommendation_id**: 推荐 ID
    - **scheme_index**: 方案索引
    """
    try:
        service = RecommendationService()
        result = await service.select_scheme(
            recommendation_id=request.recommendation_id,
            scheme_index=request.scheme_index
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Select scheme failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}", response_model=dict)
async def get_session_recommendations(
    session_id: str,
    status: Optional[str] = Query(None, description="状态筛选")
):
    """
    获取会话的所有推荐
    """
    try:
        service = RecommendationService()
        result = await service.get_session_recommendations(
            session_id=session_id,
            status=status
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get session recommendations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trends", response_model=dict)
async def get_trending_styles(
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    获取热门风格趋势
    """
    try:
        service = RecommendationService()
        result = await service.get_trending_styles(limit=limit)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get trending styles failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regenerate/{recommendation_id}", response_model=dict)
async def regenerate_recommendations(
    recommendation_id: str,
    adjustments: Optional[dict] = None
):
    """
    重新生成推荐
    
    - **adjustments**: 偏好调整
    """
    try:
        service = RecommendationService()
        result = await service.regenerate_recommendations(
            recommendation_id=recommendation_id,
            adjustments=adjustments or {}
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Regenerate recommendations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
