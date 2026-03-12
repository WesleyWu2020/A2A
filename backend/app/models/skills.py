"""
Agent Skills — 预算计算 & 尺寸校验工具
Agent在推荐前自动调用这些技能检查约束合法性。
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class BudgetCheckRequest(BaseModel):
    """预算校验请求"""
    budget_total: float = Field(..., description="项目总预算 (USD)")
    budget_spent: float = Field(default=0.0, description="已花费金额")
    proposed_items: List[Dict[str, Any]] = Field(
        default=[],
        description="待添加商品 [{product_id, price, quantity}]"
    )


class BudgetCheckResult(BaseModel):
    """预算校验结果"""
    within_budget: bool
    budget_total: float
    budget_spent: float
    proposed_cost: float
    remaining_after: float
    over_budget_by: float = 0.0
    suggestion: Optional[str] = None


class DimensionCheckRequest(BaseModel):
    """尺寸校验请求"""
    room_dimensions: Dict[str, float] = Field(
        ..., description="房间尺寸 {length, width, height} 单位 m"
    )
    existing_furniture: List[Dict[str, Any]] = Field(
        default=[],
        description="已有家具 [{name, length, width}] 单位 m"
    )
    proposed_furniture: List[Dict[str, Any]] = Field(
        default=[],
        description="拟添加家具 [{name, length, width}] 单位 m"
    )


class DimensionCheckResult(BaseModel):
    """尺寸校验结果"""
    fits: bool
    room_area_sqm: float
    used_area_sqm: float
    proposed_area_sqm: float
    remaining_area_sqm: float
    utilization_percent: float
    suggestion: Optional[str] = None


class SkillInvocation(BaseModel):
    """技能调用记录（供 AgentTimeline 展示）"""
    skill_name: str = Field(..., description="budget_check / dimension_check / inventory_check")
    input_summary: str = Field(..., description="输入参数摘要")
    result_summary: str = Field(..., description="结果摘要")
    passed: bool = Field(..., description="是否通过校验")
    timestamp: str = Field(default="")
