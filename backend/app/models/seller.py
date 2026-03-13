"""Seller workspace data models."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


NegotiationStyle = Literal["quick_close", "balanced", "hard_bargain", "value_bundle"]
BuyerPersona = Literal["bargain_hunter", "premium_decider", "hesitant_planner", "auto"]


class SellerProductCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    category: str = Field(..., min_length=2, max_length=80)
    list_price: float = Field(..., gt=0)
    floor_price: float = Field(..., gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=8)
    inventory: int = Field(default=0, ge=0)
    highlights: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)


class SellerProductUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    category: Optional[str] = Field(default=None, min_length=2, max_length=80)
    list_price: Optional[float] = Field(default=None, gt=0)
    floor_price: Optional[float] = Field(default=None, gt=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=8)
    inventory: Optional[int] = Field(default=None, ge=0)
    highlights: Optional[List[str]] = None
    description: Optional[str] = None
    image_urls: Optional[List[str]] = None


class SellerProductResponse(BaseModel):
    product_id: str
    seller_id: str
    title: str
    category: str
    list_price: float
    floor_price: float
    currency: str
    inventory: int
    highlights: List[str]
    description: Optional[str] = None
    image_urls: List[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BulkProductParseRequest(BaseModel):
    raw_text: str = Field(..., min_length=10)


class BulkProductParseResponse(BaseModel):
    parsed_products: List[SellerProductCreate]
    warnings: List[str] = Field(default_factory=list)


class SellerAgentStrategy(BaseModel):
    seller_id: str
    persona_name: str = Field(default="Trusted Home Advisor")
    tone: str = Field(default="Friendly, professional, and concise")
    opening_style: str = Field(default="Ask one discovery question before pitching")
    negotiation_style: NegotiationStyle = Field(default="balanced")
    anchor_ratio: float = Field(default=0.96, gt=0.5, le=1.2)
    max_auto_discount_ratio: float = Field(default=0.12, ge=0, le=0.5)
    upsell_rule: str = Field(default="When customer asks for sofa, recommend coffee table set")
    forbidden_promises: List[str] = Field(default_factory=lambda: ["Do not promise free cross-country shipping"])
    custom_prompt: str = Field(default="Focus on value proof, then close with urgency.")
    updated_at: Optional[datetime] = None


class SellerSandboxRequest(BaseModel):
    seller_id: str
    product_id: str
    buyer_message: str = Field(..., min_length=2)
    buyer_offer_price: Optional[float] = Field(default=None, gt=0)
    round_index: int = Field(default=1, ge=1, le=6)
    buyer_persona: BuyerPersona = Field(default="auto")


class SellerSandboxResponse(BaseModel):
    accepted: bool
    seller_reply: str
    counter_price: Optional[float] = None
    discount_ratio: float
    coaching_tip: str
    buyer_persona: str
    strategy_used: str
    win_probability: float
    predicted_cart_value: float
    guardrail_buffer: float
    alternative_strategy: str
    alternative_reply: str
    alternative_win_probability: float
    alternative_risk_note: str
    optimization_tip: str
    quick_action_label: str
    quick_action_code: str
    quick_action_patch: Dict[str, Any] = Field(default_factory=dict)


class SellerInsightSummary(BaseModel):
    seller_id: str
    total_products: int
    active_products: int
    avg_margin_ratio: float
    strategy_health: str
    sandbox_runs: int
    acceptance_rate: float
    top_rejection_reason: str
