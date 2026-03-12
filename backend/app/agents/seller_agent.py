"""
卖家 Agent
负责定价、议价、订单确认
"""
import json
import logging
import random
from typing import Dict, Any
from datetime import datetime
from decimal import Decimal

from app.core.config import settings
from app.core.llm_client import get_llm_client, LLMClient
from app.agents.orchestrator import AgentState, AgentRole
from app.agents.timeline import log_agent_activity

logger = logging.getLogger(__name__)


class SellerAgent:
    """卖家 Agent - 负责定价和议价"""
    
    def __init__(self):
        self.llm: LLMClient = get_llm_client()
        self.max_rounds = settings.NEGOTIATION_MAX_ROUNDS
        self.max_discount = settings.NEGOTIATION_DISCOUNT_MAX_PERCENT
    
    async def negotiate_price(self, state: AgentState) -> AgentState:
        """议价逻辑"""
        session_id = state["session_id"]
        negotiation_round = state.get("negotiation_round", 0)
        schemes = state.get("schemes", [])
        selected_index = state.get("selected_scheme_index", 0)
        
        if negotiation_round >= self.max_rounds:
            logger.info(f"Negotiation reached max rounds for session {session_id}")
            state["task_results"]["negotiation"] = {
                "action": "accept",
                "final_discount": state.get("current_discount", 0),
                "message": "Maximum negotiation rounds reached. Accepting current discount."
            }
            return state
        
        try:
            # 获取选中的方案
            if not schemes or selected_index >= len(schemes):
                state["errors"].append("no_scheme_selected")
                return state
            
            scheme = schemes[selected_index]
            original_price = Decimal(str(scheme.get("total_price", 0)))
            
            # 获取最近的用户消息
            messages = state.get("messages", [])
            user_message = ""
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                    break
            
            # 判断议价意图
            discount_request = self._extract_discount_request(user_message)
            
            # 计算折扣
            current_discount = state.get("current_discount", 0)
            
            if discount_request > 0:
                # 用户使用 LLM 进行智能议价
                offered_discount = await self._llm_negotiate(
                    state, user_message, current_discount, discount_request
                )
            else:
                # 默认逐步让价
                offered_discount = self._calculate_discount(
                    negotiation_round, current_discount
                )
            
            # 更新状态
            state["negotiation_round"] = negotiation_round + 1
            state["current_discount"] = offered_discount
            
            discounted_price = original_price * (1 - Decimal(str(offered_discount)))
            
            # 确定下一步动作
            if offered_discount >= self.max_discount:
                action = "accept"  # 已达最大折扣，建议接受
            elif negotiation_round >= self.max_rounds - 1:
                action = "accept"  # 最后一轮，建议接受
            else:
                action = "continue"
            
            state["task_results"]["negotiation"] = {
                "action": action,
                "round": state["negotiation_round"],
                "max_rounds": self.max_rounds,
                "original_price": float(original_price),
                "discount_percent": offered_discount,
                "final_price": float(discounted_price),
                "message": self._generate_negotiation_message(
                    offered_discount, original_price, discounted_price, action
                )
            }
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.SELLER,
                activity_type="negotiate_price",
                content={
                    "round": state["negotiation_round"],
                    "original_price": float(original_price),
                    "discount": offered_discount,
                    "final_price": float(discounted_price)
                }
            )
            
            logger.info(
                f"Seller agent negotiated for session {session_id}: "
                f"round={state['negotiation_round']}, discount={offered_discount:.2%}"
            )
            
        except Exception as e:
            logger.error(f"Seller agent failed to negotiate: {e}")
            state["errors"].append(f"negotiate_price: {str(e)}")
        
        state["updated_at"] = datetime.now()
        return state
    
    def _extract_discount_request(self, message: str) -> float:
        """从用户消息中提取折扣请求"""
        # 简单规则提取
        message = message.lower()
        
        # 检查是否包含折扣相关词汇
        if any(word in message for word in ["打折", "优惠", "discount", "便宜", "便宜点", "便宜些"]):
            # 尝试提取百分比
            import re
            # 匹配 XX% 或 XX折
            percent_match = re.search(r'(\d+)%?\s*(?:discount|off|优惠)', message)
            if percent_match:
                return float(percent_match.group(1)) / 100
            
            # 默认返回一个中等期望折扣
            return 0.10  # 10%
        
        # 检查价格相关
        if any(word in message for word in ["太贵", "贵", "expensive", "降价", "reduce"]):
            return 0.08  # 8%
        
        return 0
    
    async def _llm_negotiate(
        self,
        state: AgentState,
        user_message: str,
        current_discount: float,
        request_discount: float
    ) -> float:
        """使用 LLM 进行智能议价"""
        
        system_prompt = f"""You are an experienced sales manager. A customer is negotiating prices with you.

Current situation:
- Rounds completed: {state.get('negotiation_round', 0)}
- Current discount: {current_discount:.1%}
- Customer's requested discount: {request_discount:.1%}
- Maximum allowed discount: {self.max_discount:.1%}

Negotiation strategy:
1. Round 1: Offer a small discount (2-3%)
2. Round 2: Increase to moderate discount (5-7%)
3. Round 3+: Approach maximum discount, but don't give it away easily
4. If the customer requests more than the maximum, politely decline and offer the maximum

Return only a single number representing the discount percentage you are willing to offer (0.0 to {self.max_discount})."""

        try:
            content = await self.llm.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Customer says: {user_message}"}
                ],
                temperature=0.5,
                max_tokens=100
            )
            
            content = content.strip()
            
            # 提取数字
            import re
            match = re.search(r'(\d+\.?\d*)', content)
            if match:
                discount = float(match.group(1))
                # 如果大于1，认为是百分比
                if discount > 1:
                    discount = discount / 100
                return min(discount, self.max_discount)
            
        except Exception as e:
            logger.warning(f"LLM negotiation failed, using rule-based: {e}")
        
        # 回退到规则计算
        return self._calculate_discount(state.get("negotiation_round", 0), current_discount)
    
    def _calculate_discount(self, round_num: int, current_discount: float) -> float:
        """基于规则计算折扣"""
        # 阶梯让价策略
        discounts = [0.03, 0.05, 0.08, 0.10, 0.12]  # 3%, 5%, 8%, 10%, 12%
        
        if round_num < len(discounts):
            return min(discounts[round_num], self.max_discount)
        else:
            return min(discounts[-1], self.max_discount)
    
    def _generate_negotiation_message(
        self,
        discount: float,
        original_price: Decimal,
        final_price: Decimal,
        action: str
    ) -> str:
        """生成议价回复消息"""
        messages = {
            "continue": [
                f"Thanks for your interest! I appreciate your enthusiasm — I can offer you a {discount:.0%} discount, bringing the final price to ${final_price:.2f}.",
                f"This is already a very competitive price. To show our sincerity, I can go a bit lower: {discount:.0%} off, so ${final_price:.2f}. How does that sound?",
                f"I understand where you're coming from. This is the best we can do right now — {discount:.0%} off, final price ${final_price:.2f}. Does that work for you?"
            ],
            "accept": [
                f"Alright, this is the best we can offer! {discount:.0%} off — final price ${final_price:.2f}. That's an excellent deal!",
                f"Thank you for your patience! Here's your final discounted price: ${final_price:.2f} ({discount:.0%} off). We hope you love it!"
            ]
        }
        
        import random
        return random.choice(messages.get(action, messages["continue"]))
    
    async def confirm_order(self, state: AgentState) -> AgentState:
        """确认订单"""
        session_id = state["session_id"]
        schemes = state.get("schemes", [])
        selected_index = state.get("selected_scheme_index", 0)
        discount = state.get("current_discount", 0)
        
        try:
            if not schemes or selected_index >= len(schemes):
                state["errors"].append("no_scheme_selected")
                return state
            
            scheme = schemes[selected_index]
            original_price = Decimal(str(scheme.get("total_price", 0)))
            final_price = original_price * (1 - Decimal(str(discount)))
            
            # 生成订单详情
            order_details = {
                "items": scheme.get("items", []),
                "original_amount": float(original_price),
                "discount_amount": float(original_price - final_price),
                "discount_percent": discount,
                "final_amount": float(final_price),
                "scheme_name": scheme.get("scheme_name", ""),
                "theme": scheme.get("theme", "")
            }
            
            state["order_details"] = order_details
            state["task_results"]["order_confirmed"] = True
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.SELLER,
                activity_type="confirm_order",
                content={
                    "scheme_index": selected_index,
                    "original_amount": float(original_price),
                    "discount": discount,
                    "final_amount": float(final_price)
                }
            )
            
            logger.info(f"Seller agent confirmed order for session {session_id}")
            
        except Exception as e:
            logger.error(f"Seller agent failed to confirm order: {e}")
            state["errors"].append(f"confirm_order: {str(e)}")
        
        state["updated_at"] = datetime.now()
        return state
    
    async def calculate_final_price(
        self,
        original_price: Decimal,
        discount: float
    ) -> Decimal:
        """计算最终价格"""
        return original_price * (1 - Decimal(str(discount)))
