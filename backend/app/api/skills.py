"""
Agent Skills API — 预算/尺寸校验
路径: /api/skills/*
"""
import logging
from fastapi import APIRouter

from app.models.skills import (
    BudgetCheckRequest, DimensionCheckRequest,
)
from app.services.skills_service import SkillsService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/skills", tags=["Agent Skills"])

_skills_service = SkillsService()


@router.post("/budget/check", response_model=dict)
async def check_budget(req: BudgetCheckRequest):
    """手动调用预算校验"""
    result = _skills_service.check_budget(req)
    return get_standard_response(data=result.model_dump(mode="json"))


@router.post("/dimension/check", response_model=dict)
async def check_dimensions(req: DimensionCheckRequest):
    """手动调用尺寸校验"""
    result = _skills_service.check_dimensions(req)
    return get_standard_response(data=result.model_dump(mode="json"))
