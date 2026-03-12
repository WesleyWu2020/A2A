# -*- coding: utf-8 -*-
"""
议价 API - Demo 模拟实现
PRD: 第一个月 Demo，议价交互为 Mock
"""

import uuid
import logging
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()


# ============ 请求模型 ============

class CounterOfferRequest(BaseModel):
    session_id: str = Field(description="会话ID")
    offer_price: float = Field(description="出价", gt=0)
    reason: Optional[str] = Field(default=None, description="理由")


class AcceptOfferRequest(BaseModel):
    session_id: str = Field(description="会话ID")


# ============ Mock 议价数据生成 ============

def _generate_mock_negotiation_record(scheme_id: str):
    """Generate a realistic mock negotiation record for the demo"""
    import random

    original = round(random.uniform(800, 3000), 2)
    discount_pct = random.randint(15, 28)
    final = round(original * (1 - discount_pct / 100), 2)

    return {
        "id": f"neg-{uuid.uuid4().hex[:8]}",
        "schemeId": scheme_id,
        "originalPrice": original,
        "finalPrice": final,
        "discount": discount_pct,
        "strategy": "Multi-round negotiation + New customer discount",
        "reason": (
            "The seller, aiming to hit monthly sales targets, agreed to provide a "
            "special discount for new buyers. AI Buyer Agent leveraged bulk intent "
            "and positive review commitment to secure the best price."
        ),
        "rounds": [
            {
                "round": 1,
                "buyerOffer": round(original * 0.72, 2),
                "sellerResponse": round(original * 0.93, 2),
                "sellerMessage": "This is already our promotional price. Hard to go lower.",
            },
            {
                "round": 2,
                "buyerOffer": round(original * 0.82, 2),
                "sellerResponse": round(original * 0.87, 2),
                "sellerMessage": "I appreciate your interest. Let me check with management... We can do $%.2f." % round(original * 0.87, 2),
            },
            {
                "round": 3,
                "buyerOffer": final,
                "sellerResponse": final,
                "sellerMessage": "Deal! You drive a hard bargain. Please leave us a 5-star review!",
            },
        ],
        "timestamp": datetime.now().isoformat(),
    }


# ============ API 端点 ============

@router.get("/{scheme_id}")
async def get_negotiation(scheme_id: str):
    """
    获取议价记录 (Demo Mock)

    根据方案ID返回模拟议价记录。
    """
    record = _generate_mock_negotiation_record(scheme_id)
    return {
        "code": 200,
        "message": "success",
        "data": record
    }


@router.post("/counter")
async def counter_offer(request: CounterOfferRequest):
    """
    用户还价 (Demo Mock)

    向卖家 Agent 发送还价请求，返回模拟卖家回应。
    """
    import random

    # Mock seller response: accept if offer is within 20% of market, else counter
    if random.random() > 0.5:
        response_msg = (
            f"That's a tough price, but I value your business. "
            f"Let me offer you ${request.offer_price * 1.05:.2f} — that's my absolute floor."
        )
        counter_price = round(request.offer_price * 1.05, 2)
        accepted = False
    else:
        response_msg = "OK, you've got yourself a deal! Looking forward to your 5-star review."
        counter_price = request.offer_price
        accepted = True

    return {
        "code": 200,
        "message": "success",
        "data": {
            "accepted": accepted,
            "counter_price": counter_price,
            "seller_message": response_msg,
        }
    }


@router.post("/accept")
async def accept_offer(request: AcceptOfferRequest):
    """
    接受报价 (Demo Mock)

    接受当前议价结果。
    """
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "accepted",
            "message": "Congratulations! Your order has been confirmed at the negotiated price.",
            "timestamp": datetime.now().isoformat(),
        }
    }


@router.post("/quick/{scheme_id}")
async def quick_negotiate(scheme_id: str):
    """
    快速议价 (Demo Mock)

    无需完整议价流程，直接获取折扣价格。
    """
    import random
    discount_pct = random.randint(12, 22)
    return {
        "code": 200,
        "message": "success",
        "data": {
            "scheme_id": scheme_id,
            "discount_percent": discount_pct,
            "message": f"Quick negotiation complete! Secured a {discount_pct}% discount for you.",
        }
    }
