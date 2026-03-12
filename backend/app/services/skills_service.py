"""
Agent Skills 服务 — 预算计算 & 尺寸校验
Agent 在推荐流程中自动调用。
"""
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from app.models.skills import (
    BudgetCheckRequest, BudgetCheckResult,
    DimensionCheckRequest, DimensionCheckResult,
    SkillInvocation,
)

logger = logging.getLogger(__name__)


class SkillsService:
    """Agent 技能服务"""

    def check_budget(self, req: BudgetCheckRequest) -> BudgetCheckResult:
        """
        校验拟添加商品是否在项目预算范围内。
        返回可读结论和建议。
        """
        proposed_cost = sum(
            item.get("price", 0) * item.get("quantity", 1)
            for item in req.proposed_items
        )
        remaining_after = req.budget_total - req.budget_spent - proposed_cost
        within = remaining_after >= 0
        over_by = max(0, -remaining_after)

        suggestion = None
        if not within:
            suggestion = (
                f"Over budget by ${over_by:.0f}. "
                f"Consider removing the most expensive item or choosing a lower-priced alternative."
            )
        elif remaining_after < req.budget_total * 0.1:
            suggestion = (
                f"Only ${remaining_after:.0f} remaining after this purchase — "
                f"almost at your budget limit."
            )

        return BudgetCheckResult(
            within_budget=within,
            budget_total=req.budget_total,
            budget_spent=req.budget_spent,
            proposed_cost=proposed_cost,
            remaining_after=max(0, remaining_after),
            over_budget_by=over_by,
            suggestion=suggestion,
        )

    def check_dimensions(self, req: DimensionCheckRequest) -> DimensionCheckResult:
        """
        校验拟添加家具是否在房间面积范围内（简化模型：2D 面积利用率）。
        """
        dims = req.room_dimensions
        room_area = dims.get("length", 0) * dims.get("width", 0)

        used_area = sum(
            f.get("length", 0) * f.get("width", 0)
            for f in req.existing_furniture
        )
        proposed_area = sum(
            f.get("length", 0) * f.get("width", 0)
            for f in req.proposed_furniture
        )

        total_after = used_area + proposed_area
        remaining = room_area - total_after
        utilization = (total_after / room_area * 100) if room_area > 0 else 0
        fits = remaining >= 0

        suggestion = None
        if not fits:
            suggestion = (
                f"Not enough floor space: {abs(remaining):.1f} sqm over capacity. "
                f"Consider smaller furniture or removing an existing piece."
            )
        elif utilization > 70:
            suggestion = (
                f"Room utilization is {utilization:.0f}% — space will feel cramped. "
                f"Interior design best practice is below 60%."
            )

        return DimensionCheckResult(
            fits=fits,
            room_area_sqm=room_area,
            used_area_sqm=used_area,
            proposed_area_sqm=proposed_area,
            remaining_area_sqm=max(0, remaining),
            utilization_percent=round(utilization, 1),
            suggestion=suggestion,
        )

    def create_invocation_record(
        self,
        skill_name: str,
        input_summary: str,
        result_summary: str,
        passed: bool,
    ) -> SkillInvocation:
        return SkillInvocation(
            skill_name=skill_name,
            input_summary=input_summary,
            result_summary=result_summary,
            passed=passed,
            timestamp=datetime.now().isoformat(),
        )

    # ── Convenience: run all applicable skills for a recommendation ───────

    async def run_pre_recommendation_checks(
        self,
        budget_total: Optional[float],
        budget_spent: float,
        proposed_items: List[Dict[str, Any]],
        room_dimensions: Optional[Dict[str, float]],
        existing_furniture: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        在推荐方案生成前跑所有适用的 skill。
        返回 {invocations: [...], warnings: [...], block: bool}
        """
        invocations: List[SkillInvocation] = []
        warnings: List[str] = []
        block = False

        # Budget check
        if budget_total is not None and budget_total > 0 and proposed_items:
            budget_req = BudgetCheckRequest(
                budget_total=budget_total,
                budget_spent=budget_spent,
                proposed_items=proposed_items,
            )
            budget_result = self.check_budget(budget_req)
            invocations.append(self.create_invocation_record(
                skill_name="budget_check",
                input_summary=f"Budget ${budget_total:.0f}, Spent ${budget_spent:.0f}, Adding {len(proposed_items)} items",
                result_summary=budget_result.suggestion or "Within budget",
                passed=budget_result.within_budget,
            ))
            if not budget_result.within_budget:
                warnings.append(budget_result.suggestion or "Over budget")
                block = True
            elif budget_result.suggestion:
                warnings.append(budget_result.suggestion)

        # Dimension check
        if room_dimensions and (existing_furniture or proposed_items):
            proposed_furniture = [
                {"name": it.get("product_name", "item"), "length": 1.2, "width": 0.6}
                for it in proposed_items
            ]  # simplified: estimate 1.2m×0.6m per item
            dim_req = DimensionCheckRequest(
                room_dimensions=room_dimensions,
                existing_furniture=existing_furniture or [],
                proposed_furniture=proposed_furniture,
            )
            dim_result = self.check_dimensions(dim_req)
            invocations.append(self.create_invocation_record(
                skill_name="dimension_check",
                input_summary=f"Room {room_dimensions.get('length', 0)}m × {room_dimensions.get('width', 0)}m, {len(proposed_furniture)} items",
                result_summary=dim_result.suggestion or f"Utilization: {dim_result.utilization_percent}%",
                passed=dim_result.fits,
            ))
            if not dim_result.fits:
                warnings.append(dim_result.suggestion or "Not enough space")
            elif dim_result.suggestion:
                warnings.append(dim_result.suggestion)

        return {
            "invocations": [inv.model_dump(mode="json") for inv in invocations],
            "warnings": warnings,
            "block": block,
        }
