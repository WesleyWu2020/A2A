"""
订单 API
路径: /api/order/*
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.order import (
    OrderCreate, OrderUpdate, OrderStatus,
    NegotiationRequest, NegotiationResponse,
    PaymentRequest, PaymentResponse
)
from app.services.order_service import OrderService
from app.services.negotiation_service import NegotiationService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/order", tags=["订单"])


@router.post("/create", response_model=dict)
async def create_order(request: OrderCreate):
    """
    创建订单
    
    - **recommendation_id**: 推荐 ID
    - **scheme_index**: 方案索引
    - **shipping_address**: 收货地址（可选）
    - **contact_info**: 联系信息（可选）
    """
    try:
        service = OrderService()
        result = await service.create_order(
            recommendation_id=request.recommendation_id,
            scheme_index=request.scheme_index,
            shipping_address=request.shipping_address,
            contact_info=request.contact_info
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Create order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}", response_model=dict)
async def get_order(order_id: str):
    """
    获取订单详情
    """
    try:
        service = OrderService()
        result = await service.get_order(order_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Order not found")
        
        return get_standard_response(data=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}", response_model=dict)
async def get_session_orders(
    session_id: str,
    status: Optional[OrderStatus] = Query(None, description="状态筛选"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100)
):
    """
    获取会话的订单列表
    """
    try:
        service = OrderService()
        result = await service.get_session_orders(
            session_id=session_id,
            status=status,
            page=page,
            page_size=page_size
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get session orders failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{order_id}", response_model=dict)
async def update_order(order_id: str, request: OrderUpdate):
    """
    更新订单
    """
    try:
        service = OrderService()
        result = await service.update_order(
            order_id=order_id,
            status=request.status,
            shipping_address=request.shipping_address,
            contact_info=request.contact_info
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Update order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/cancel", response_model=dict)
async def cancel_order(order_id: str, reason: Optional[str] = None):
    """
    取消订单
    """
    try:
        service = OrderService()
        result = await service.cancel_order(order_id, reason)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Cancel order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 议价相关接口 ==========

@router.post("/negotiate", response_model=dict)
async def negotiate_price(request: NegotiationRequest):
    """
    议价
    
    - **order_id**: 订单 ID
    - **message**: 议价消息
    - **target_discount**: 期望折扣
    """
    try:
        service = NegotiationService()
        result = await service.negotiate(
            order_id=request.order_id,
            message=request.message,
            target_discount=request.target_discount
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Negotiate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}/negotiation/history", response_model=dict)
async def get_negotiation_history(order_id: str):
    """
    获取议价历史
    """
    try:
        service = NegotiationService()
        result = await service.get_negotiation_history(order_id)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get negotiation history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{order_id}/negotiation/accept", response_model=dict)
async def accept_negotiation(order_id: str):
    """
    接受议价结果
    """
    try:
        service = NegotiationService()
        result = await service.accept_negotiation(order_id)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Accept negotiation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 支付相关接口 ==========

@router.post("/{order_id}/pay", response_model=dict)
async def create_payment(order_id: str, request: PaymentRequest):
    """
    创建支付
    """
    try:
        service = OrderService()
        result = await service.create_payment(
            order_id=order_id,
            payment_method=request.payment_method
        )
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Create payment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}/pay/status", response_model=dict)
async def get_payment_status(order_id: str):
    """
    获取支付状态
    """
    try:
        service = OrderService()
        result = await service.get_payment_status(order_id)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get payment status failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook/payment", response_model=dict)
async def payment_webhook(payload: dict):
    """
    支付回调
    """
    try:
        service = OrderService()
        result = await service.handle_payment_webhook(payload)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Payment webhook failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
