"""
议价服务
"""
import logging
import uuid
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, List, Optional

from app.core.database import execute_query
from app.core.config import settings

logger = logging.getLogger(__name__)


class NegotiationService:
    """议价服务"""
    
    def __init__(self):
        self.max_rounds = settings.NEGOTIATION_MAX_ROUNDS
        self.max_discount = settings.NEGOTIATION_DISCOUNT_MAX_PERCENT
    
    async def negotiate(
        self,
        order_id: str,
        message: str,
        target_discount: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        执行议价
        
        与卖家 Agent 交互进行价格谈判
        """
        try:
            # 获取订单信息
            order = await self._get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            if order["status"] != "pending":
                raise ValueError("Order cannot be negotiated")
            
            # 获取议价历史
            negotiation_history = order.get("negotiation_history", [])
            current_round = len(negotiation_history)
            
            if current_round >= self.max_rounds:
                return {
                    "order_id": order_id,
                    "message": "已达到最大议价轮次",
                    "can_continue": False,
                    "current_discount": order.get("discount_percent", 0)
                }
            
            # 调用卖家 Agent 进行议价
            from app.agents.orchestrator import get_orchestrator, create_initial_state
            
            orchestrator = get_orchestrator()
            state = create_initial_state(order.get("session_id", ""))
            
            # 设置议价状态
            state["negotiation_round"] = current_round
            state["current_discount"] = order.get("discount_percent", 0)
            state["max_discount"] = self.max_discount
            
            # 添加用户消息
            state["messages"].append({
                "role": "user",
                "content": message,
                "timestamp": datetime.now().isoformat()
            })
            
            # 运行议价流程
            result = await orchestrator.run(
                session_id=state["session_id"],
                current_state=state
            )
            
            # 获取议价结果
            negotiation_result = result.get("task_results", {}).get("negotiation", {})
            
            # 记录议价历史
            new_record = {
                "round": current_round + 1,
                "agent_role": "seller",
                "message": negotiation_result.get("message", ""),
                "proposed_discount": negotiation_result.get("discount_percent", 0),
                "is_final": negotiation_result.get("action") == "accept",
                "timestamp": datetime.now().isoformat()
            }
            
            negotiation_history.append(new_record)
            
            # 更新订单
            await self._update_order_negotiation(
                order_id=order_id,
                negotiation_history=negotiation_history,
                discount_percent=negotiation_result.get("discount_percent", 0)
            )
            
            # 计算最终价格
            original_amount = Decimal(str(order["original_amount"]))
            discount = negotiation_result.get("discount_percent", 0)
            final_price = original_amount * (1 - Decimal(str(discount)))
            
            return {
                "order_id": order_id,
                "current_round": current_round + 1,
                "max_rounds": self.max_rounds,
                "seller_response": negotiation_result.get("message", ""),
                "offered_discount": discount,
                "final_price": float(final_price),
                "is_acceptable": negotiation_result.get("action") == "accept",
                "can_continue": current_round + 1 < self.max_rounds and negotiation_result.get("action") != "accept",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Negotiation failed: {e}")
            raise
    
    async def get_negotiation_history(self, order_id: str) -> Dict[str, Any]:
        """
        获取议价历史
        """
        try:
            order = await self._get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            negotiation_history = order.get("negotiation_history", [])
            
            return {
                "order_id": order_id,
                "total_rounds": len(negotiation_history),
                "max_rounds": self.max_rounds,
                "current_discount": order.get("discount_percent", 0),
                "history": negotiation_history
            }
            
        except Exception as e:
            logger.error(f"Get negotiation history failed: {e}")
            raise
    
    async def accept_negotiation(self, order_id: str) -> Dict[str, Any]:
        """
        接受议价结果
        
        应用折扣到订单
        """
        try:
            order = await self._get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            discount = order.get("discount_percent", 0)
            original_amount = Decimal(str(order["original_amount"]))
            discount_amount = original_amount * Decimal(str(discount))
            final_amount = original_amount - discount_amount
            
            # 更新订单
            query = """
                UPDATE orders
                SET 
                    total_amount = $1,
                    discount_amount = $2,
                    updated_at = $3
                WHERE order_id = $4
            """
            
            await execute_query(
                query,
                float(final_amount),
                float(discount_amount),
                datetime.now(),
                order_id,
                fetch=False
            )
            
            return {
                "order_id": order_id,
                "original_amount": float(original_amount),
                "discount_percent": discount,
                "discount_amount": float(discount_amount),
                "final_amount": float(final_amount),
                "status": "accepted",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Accept negotiation failed: {e}")
            raise
    
    async def _get_order(self, order_id: str) -> Optional[Dict]:
        """获取订单信息"""
        query = """
            SELECT 
                order_id, session_id, original_amount, total_amount,
                discount_percent, discount_amount, negotiation_history, status
            FROM orders
            WHERE order_id = $1
        """
        
        row = await execute_query(query, order_id, fetch_one=True)
        
        if not row:
            return None
        
        return {
            "order_id": row["order_id"],
            "session_id": row["session_id"],
            "original_amount": float(row["original_amount"]) if row["original_amount"] else float(row["total_amount"]),
            "total_amount": float(row["total_amount"]),
            "discount_percent": row["discount_percent"] or 0,
            "discount_amount": float(row["discount_amount"]) if row["discount_amount"] else 0,
            "negotiation_history": row["negotiation_history"] or [],
            "status": row["status"]
        }
    
    async def _update_order_negotiation(
        self,
        order_id: str,
        negotiation_history: List[Dict],
        discount_percent: float
    ):
        """更新订单议价信息"""
        query = """
            UPDATE orders
            SET 
                negotiation_history = $1,
                discount_percent = $2,
                updated_at = $3
            WHERE order_id = $4
        """
        
        await execute_query(
            query,
            negotiation_history,
            discount_percent,
            datetime.now(),
            order_id,
            fetch=False
        )
    
    def calculate_suggested_discount(self, round_num: int) -> float:
        """
        计算建议折扣
        
        基于议价轮次的阶梯折扣策略
        """
        # 阶梯折扣：3%, 5%, 8%, 10%, 12%
        suggested_discounts = [0.03, 0.05, 0.08, 0.10, 0.12]
        
        if round_num < len(suggested_discounts):
            return min(suggested_discounts[round_num], self.max_discount)
        
        return self.max_discount
    
    def evaluate_negotiation_strategy(
        self,
        user_message: str,
        current_round: int,
        current_discount: float
    ) -> Dict[str, Any]:
        """
        评估议价策略
        
        分析用户消息，给出议价建议
        """
        message = user_message.lower()
        
        # 简单规则判断
        strategies = {
            "urgent": any(word in message for word in ["马上", "立即", " urgent", "asap"]),
            "price_sensitive": any(word in message for word in ["太贵", "贵", "expensive", "降价"]),
            "comparing": any(word in message for word in ["别家", "其他", "other", "compare"]),
            "bulk": any(word in message for word in ["多买", "批量", "bulk", "more"]),
            "loyal": any(word in message for word in ["老客户", "回头客", "loyal", "always"])
        }
        
        # 根据策略调整建议
        suggested_discount = self.calculate_suggested_discount(current_round)
        
        if strategies["loyal"]:
            suggested_discount = min(suggested_discount + 0.02, self.max_discount)
        elif strategies["bulk"]:
            suggested_discount = min(suggested_discount + 0.03, self.max_discount)
        
        return {
            "strategies": strategies,
            "suggested_discount": suggested_discount,
            "max_discount": self.max_discount,
            "remaining_rounds": self.max_rounds - current_round
        }
