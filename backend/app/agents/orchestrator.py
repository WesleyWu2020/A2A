"""
LangGraph Agent 编排模块
定义多 Agent 协作的状态机
"""
import logging
from enum import Enum
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from datetime import datetime

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    """Agent 角色"""
    BUYER = "buyer"
    SELLER = "seller"


class TaskType(str, Enum):
    """任务类型"""
    UNDERSTAND_NEEDS = "understand_needs"
    SEARCH_PRODUCTS = "search_products"
    GENERATE_SCHEMES = "generate_schemes"
    PRESENT_SCHEMES = "present_schemes"
    COLLECT_FEEDBACK = "collect_feedback"
    NEGOTIATE_PRICE = "negotiate_price"
    CONFIRM_ORDER = "confirm_order"
    HANDOFF = "handoff"


class AgentState(TypedDict):
    """Agent 状态定义"""
    # 会话信息
    session_id: str
    user_id: Optional[str]
    
    # 消息历史
    messages: Annotated[list, add_messages]
    
    # 当前任务
    current_task: str
    next_task: Optional[str]
    
    # 当前活跃 Agent
    current_agent: str
    
    # 用户需求
    user_preferences: Dict[str, Any]
    extracted_requirements: Dict[str, Any]
    
    # 商品数据
    candidate_products: List[Dict[str, Any]]
    selected_products: List[str]
    
    # 推荐方案
    recommendation_id: Optional[str]
    schemes: List[Dict[str, Any]]
    selected_scheme_index: Optional[int]
    
    # 订单
    order_id: Optional[str]
    order_details: Optional[Dict[str, Any]]
    
    # 议价
    negotiation_round: int
    current_discount: float
    max_discount: float
    
    # 执行结果
    task_results: Dict[str, Any]
    errors: List[str]
    
    # 元数据
    created_at: datetime
    updated_at: datetime


def create_initial_state(
    session_id: str,
    user_id: Optional[str] = None
) -> AgentState:
    """创建初始状态"""
    now = datetime.now()
    return {
        "session_id": session_id,
        "user_id": user_id,
        "messages": [],
        "current_task": TaskType.UNDERSTAND_NEEDS,
        "next_task": None,
        "current_agent": AgentRole.BUYER,
        "user_preferences": {},
        "extracted_requirements": {},
        "candidate_products": [],
        "selected_products": [],
        "recommendation_id": None,
        "schemes": [],
        "selected_scheme_index": None,
        "order_id": None,
        "order_details": None,
        "negotiation_round": 0,
        "current_discount": 0.0,
        "max_discount": 0.15,
        "task_results": {},
        "errors": [],
        "created_at": now,
        "updated_at": now
    }


class AgentOrchestrator:
    """Agent 编排器"""
    
    def __init__(self):
        # Local imports to avoid circular dependency
        # (buyer_agent and seller_agent both import from orchestrator)
        from app.agents.buyer_agent import BuyerAgent
        from app.agents.seller_agent import SellerAgent
        self.buyer_agent = BuyerAgent()
        self.seller_agent = SellerAgent()
        self.workflow = self._build_workflow()
    
    def _build_workflow(self) -> StateGraph:
        """构建工作流图"""
        
        # 创建工作流
        workflow = StateGraph(AgentState)
        
        # 添加节点
        workflow.add_node("understand_needs", self.buyer_agent.understand_needs)
        workflow.add_node("search_products", self.buyer_agent.search_products)
        workflow.add_node("generate_schemes", self.buyer_agent.generate_schemes)
        workflow.add_node("present_schemes", self.buyer_agent.present_schemes)
        workflow.add_node("collect_feedback", self.buyer_agent.collect_feedback)
        workflow.add_node("negotiate_price", self.seller_agent.negotiate_price)
        workflow.add_node("confirm_order", self.seller_agent.confirm_order)
        workflow.add_node("handoff_to_seller", self._handoff_to_seller)
        workflow.add_node("handoff_to_buyer", self._handoff_to_buyer)
        
        # 添加条件边
        workflow.set_entry_point("understand_needs")
        
        # 需求理解 -> 商品搜索 / 结束
        workflow.add_conditional_edges(
            "understand_needs",
            self._route_after_understand_needs,
            {
                "search_products": "search_products",
                "end": END
            }
        )
        
        # 商品搜索 -> 生成方案
        workflow.add_edge("search_products", "generate_schemes")
        
        # 生成方案 -> 展示方案
        workflow.add_edge("generate_schemes", "present_schemes")
        
        # 展示方案 -> 收集反馈
        workflow.add_edge("present_schemes", "collect_feedback")
        
        # 收集反馈 -> 重新搜索 / 转交卖家 / 结束
        workflow.add_conditional_edges(
            "collect_feedback",
            self._route_after_feedback,
            {
                "regenerate": "search_products",
                "negotiate": "handoff_to_seller",
                "end": END
            }
        )
        
        # 转交卖家 -> 议价
        workflow.add_edge("handoff_to_seller", "negotiate_price")
        
        # 议价 -> 继续议价 / 确认订单 / 转交买家
        workflow.add_conditional_edges(
            "negotiate_price",
            self._route_after_negotiation,
            {
                "continue_negotiate": "negotiate_price",
                "confirm_order": "confirm_order",
                "back_to_buyer": "handoff_to_buyer"
            }
        )
        
        # 确认订单 -> 结束
        workflow.add_edge("confirm_order", END)
        
        # 转交买家 -> 收集反馈
        workflow.add_edge("handoff_to_buyer", "collect_feedback")
        
        return workflow.compile()
    
    def _handoff_to_seller(self, state: AgentState) -> AgentState:
        """转交卖家 Agent"""
        state["current_agent"] = AgentRole.SELLER
        state["current_task"] = TaskType.NEGOTIATE_PRICE
        state["updated_at"] = datetime.now()
        logger.info(f"Handoff to seller agent for session {state['session_id']}")
        return state
    
    def _handoff_to_buyer(self, state: AgentState) -> AgentState:
        """转交买家 Agent"""
        state["current_agent"] = AgentRole.BUYER
        state["current_task"] = TaskType.COLLECT_FEEDBACK
        state["updated_at"] = datetime.now()
        logger.info(f"Handoff to buyer agent for session {state['session_id']}")
        return state
    
    def _route_after_understand_needs(self, state: AgentState) -> str:
        """需求理解后的路由决策"""
        if state.get("errors"):
            return "end"
        
        requirements = state.get("extracted_requirements", {})
        if requirements.get("intent") == "reject":
            return "end"
        
        return "search_products"
    
    def _route_after_feedback(self, state: AgentState) -> str:
        """收集反馈后的路由决策"""
        feedback = state.get("task_results", {}).get("feedback", {})
        action = feedback.get("action", "end")
        
        if action == "negotiate":
            return "negotiate"
        elif action == "regenerate":
            # 更新用户偏好
            if "preference_adjustments" in feedback:
                state["user_preferences"].update(feedback["preference_adjustments"])
            return "regenerate"
        else:
            return "end"
    
    def _route_after_negotiation(self, state: AgentState) -> str:
        """议价后的路由决策"""
        negotiation = state.get("task_results", {}).get("negotiation", {})
        action = negotiation.get("action", "continue")
        
        if action == "accept":
            return "confirm_order"
        elif action == "reject":
            return "back_to_buyer"
        else:
            return "continue_negotiate"
    
    async def run(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        user_message: Optional[str] = None,
        current_state: Optional[AgentState] = None
    ) -> AgentState:
        """运行工作流"""
        
        if current_state:
            state = current_state
        else:
            state = create_initial_state(session_id, user_id)
        
        if user_message:
            state["messages"].append({
                "role": "user",
                "content": user_message,
                "timestamp": datetime.now().isoformat()
            })
        
        # 执行工作流
        result = await self.workflow.ainvoke(state)
        
        return result


# 全局编排器实例
_orchestrator: Optional[AgentOrchestrator] = None


def get_orchestrator() -> AgentOrchestrator:
    """获取编排器实例（单例）"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AgentOrchestrator()
    return _orchestrator
