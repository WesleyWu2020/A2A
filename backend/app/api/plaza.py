"""
购物广场 API
路径: /api/plaza/*
提供购物广场首页数据、商品分区、Agent战绩、智能唤醒等功能
"""
import asyncio
import logging
import random
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.services.product_service import ProductService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(tags=["购物广场"])


# ============== 数据模型 ==============

class PlazaProductCard(BaseModel):
    """广场商品卡片"""
    spu_id: str
    title: str
    category: str
    price_current: float
    price_original: Optional[float] = None
    currency: str = "USD"
    image: Optional[str] = None
    tags: List[str] = Field(default=[], description="标签: New, Hot, Deal, Agent推荐")
    rating: Optional[float] = None
    styles: List[str] = []
    scenes: List[str] = []


class PlazaSection(BaseModel):
    """广场分区"""
    id: str
    title: str
    subtitle: Optional[str] = None
    type: str = Field(..., description="类型: new_arrivals, promotions, personalized, category")
    products: List[PlazaProductCard]
    sort_order: int = 0


class AgentAchievement(BaseModel):
    """Agent战绩"""
    id: str
    user_name: str
    avatar: Optional[str] = None
    action_type: str = Field(..., description="动作类型: save_money, complete_match, find_deal")
    action_desc: str
    save_amount: Optional[float] = None
    product_title: Optional[str] = None
    product_image: Optional[str] = None
    style_tag: Optional[str] = None
    timestamp: str


class StructuredReview(BaseModel):
    """结构化评价"""
    id: str
    product_id: str
    product_title: str
    product_image: Optional[str] = None
    highlights: List[dict] = Field(default=[], description="亮点标签: 材质、风格、物流、适用空间等")
    agent_summary: Optional[str] = None
    rating: float


class WakeUpCard(BaseModel):
    """智能唤醒卡片"""
    id: str
    type: str = Field(..., description="类型: follow_up, reminder, recommendation")
    title: str
    description: str
    related_product_id: Optional[str] = None
    related_product_image: Optional[str] = None
    cta_text: str
    cta_link: str


class PlazaHomeResponse(BaseModel):
    """购物广场首页响应"""
    banner: dict
    sections: List[PlazaSection]
    achievements: List[AgentAchievement]
    reviews: List[StructuredReview]
    wakeups: List[WakeUpCard]


# ============== 模板数据 ==============

# Agent win templates
ACHIEVEMENT_TEMPLATES = [
    {
        "user_name": "Alice",
        "action_type": "save_money",
        "action_desc": "AI set up a perfect {style} home office",
        "save_amount": 250,
        "style_tag": "Modern Minimalist"
    },
    {
        "user_name": "Bob",
        "action_type": "complete_match",
        "action_desc": "Found the perfect {style} living room combo",
        "save_amount": 180,
        "style_tag": "Scandinavian"
    },
    {
        "user_name": "Carol",
        "action_type": "find_deal",
        "action_desc": "Scored a limited-time deal on a {style} bedroom set",
        "save_amount": 320,
        "style_tag": "Glam"
    },
    {
        "user_name": "David",
        "action_type": "save_money",
        "action_desc": "AI price comparison saved on a {style} dining room",
        "save_amount": 150,
        "style_tag": "Mid-Century"
    },
    {
        "user_name": "Emma",
        "action_type": "complete_match",
        "action_desc": "Completed a full-home {style} package",
        "save_amount": 500,
        "style_tag": "Modern"
    }
]

# Structured review highlight templates
REVIEW_HIGHLIGHTS_TEMPLATES = [
    {"icon": "material", "label": "Material", "value": "Solid wood + top-grain leather"},
    {"icon": "style", "label": "Style", "value": "Italian Minimalist"},
    {"icon": "delivery", "label": "Delivery", "value": "Ships in 7 days"},
    {"icon": "space", "label": "Best For", "value": "150–250 sq ft living room"},
    {"icon": "feature", "label": "Highlight", "value": "Scratch & pet resistant"},
    {"icon": "eco", "label": "Eco", "value": "CARB E0 certified board"},
]

# Smart wakeup templates
WAKEUP_TEMPLATES = [
    {
        "type": "follow_up",
        "title": "Continue Your Room Design",
        "description": "You browsed fabric sofas recently — want AI to find a matching coffee table?",
        "cta_text": "Continue Matching",
    },
    {
        "type": "reminder",
        "title": "Price Drop on Your Saved Item",
        "description": "The Scandinavian 3-seat sofa you viewed just dropped by $100 — limited time.",
        "cta_text": "View Deal",
    },
    {
        "type": "recommendation",
        "title": "New Arrivals for You",
        "description": "Based on your style, we found several new natural wood dining tables just listed.",
        "cta_text": "Explore New Arrivals",
    }
]


# ============== API 路由 ==============

@router.get("/home", response_model=dict)
async def get_plaza_home(
    request: Request,
    session_id: Optional[str] = Query(None, description="会话ID用于个性化"),
    preference_category: Optional[str] = Query(None, description="偏好类目"),
    preference_style: Optional[str] = Query(None, description="偏好风格")
):
    """
    获取购物广场首页数据
    
    包含:
    - Banner 数据
    - 各分区商品(今日上新、促销、个性化推荐)
    - Agent 战绩流
    - 结构化评价展示
    - 智能唤醒卡片
    """
    try:
        # 获取商品数据
        service = ProductService()
        
        # 构建首页数据
        banner = {
            "title": "AI Is Finding You Better Home Deals",
            "subtitle": "Today's Theme: Living Room Refresh Season",
            "theme": "Living Room Refresh",
            "background": "gradient",
            "cta": {
                "text": "Let AI Style My Home",
                "link": "/chat?intent=living_room_refresh"
            }
        }
        
        # 并发获取所有首页数据
        sections, reviews = await asyncio.gather(
            _build_sections(service, preference_category=preference_category, preference_style=preference_style),
            _generate_reviews(service),
        )
        achievements = _generate_achievements()
        wakeups = _generate_wakeups(session_id)
        
        return get_standard_response(data={
            "banner": banner,
            "sections": sections,
            "achievements": achievements,
            "reviews": reviews,
            "wakeups": wakeups
        })
        
    except Exception as e:
        logger.error(f"Get plaza home failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sections", response_model=dict)
async def get_plaza_sections(
    type: Optional[str] = Query(None, description="分区类型: new_arrivals, promotions, personalized"),
    category: Optional[str] = Query(None, description="类目筛选"),
    style: Optional[str] = Query(None, description="风格筛选"),
    limit: int = Query(default=10, ge=1, le=50),
    session_id: Optional[str] = Query(None, description="会话ID")
):
    """
    获取购物广场分区数据
    
    支持按类型、类目、风格筛选
    """
    try:
        service = ProductService()
        
        params = {
            "page_size": limit,
            "page": 1
        }
        
        if category:
            params["category_l1"] = category
        if style:
            params["styles"] = [style]
            
        # 根据类型调整参数
        if type == "new_arrivals":
            params["sort_by"] = "newest"
        elif type == "promotions":
            # 促销商品：有原价且当前价低于原价
            pass
        elif type == "personalized":
            # 个性化：基于session偏好
            pass
            
        result = await service.search_products(params)
        
        products = []
        for p in result.get("products", []):
            products.append({
                "spu_id": p.get("spu_id", ""),
                "title": p.get("title", ""),
                "category": p.get("category_l1", ""),
                "price_current": float(p.get("price_current", 0)) if p.get("price_current") else 0,
                "price_original": float(p.get("price_original", 0)) if p.get("price_original") else None,
                "currency": p.get("currency", "USD"),
                "image": p.get("images", [None])[0] if p.get("images") else None,
                "tags": _generate_product_tags(p),
                "rating": float(p.get("rating", 0)) if p.get("rating") else None,
                "styles": p.get("styles", []),
                "scenes": p.get("scenes", [])
            })
        
        return get_standard_response(data={
            "type": type or "all",
            "products": products,
            "total": result.get("total", 0)
        })
        
    except Exception as e:
        logger.error(f"Get plaza sections failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/achievements", response_model=dict)
async def get_achievements(
    limit: int = Query(default=5, ge=1, le=20)
):
    """
    获取 Agent 战绩流
    
    展示AI帮用户发现优惠、完成搭配的案例
    """
    try:
        achievements = _generate_achievements(limit)
        return get_standard_response(data={
            "achievements": achievements,
            "total": len(achievements)
        })
    except Exception as e:
        logger.error(f"Get achievements failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews", response_model=dict)
async def get_structured_reviews(
    category: Optional[str] = Query(None, description="类目筛选"),
    limit: int = Query(default=6, ge=1, le=20)
):
    """
    获取结构化评价
    
    展示商品的结构化亮点，而非长文本评论
    """
    try:
        service = ProductService()
        reviews = await _generate_reviews(service, category, limit)
        return get_standard_response(data={
            "reviews": reviews,
            "total": len(reviews)
        })
    except Exception as e:
        logger.error(f"Get reviews failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wakeups", response_model=dict)
async def get_wakeup_cards(
    session_id: Optional[str] = Query(None, description="会话ID")
):
    """
    获取智能唤醒卡片
    
    展示AI主动提醒的后续需求
    """
    try:
        wakeups = _generate_wakeups(session_id)
        return get_standard_response(data={
            "wakeups": wakeups,
            "total": len(wakeups)
        })
    except Exception as e:
        logger.error(f"Get wakeups failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{spu_id}/detail", response_model=dict)
async def get_product_for_plaza(
    spu_id: str,
    session_id: Optional[str] = Query(None)
):
    """
    获取广场商品详情
    
    用于点击商品卡片后展示详细信息，支持导流参数
    """
    try:
        service = ProductService()
        product = await service.get_product(spu_id)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # 构建导流链接
        chat_link = f"/chat?product_id={spu_id}&intent=discuss_product"
        
        return get_standard_response(data={
            "product": product,
            "chat_link": chat_link,
            "similar_link": f"/plaza/sections?category={product.get('category', {}).get('l1', '')}",
            "match_link": f"/chat?product_id={spu_id}&intent=find_matching"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get product detail failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== 辅助函数 ==============

async def _build_sections(
    service: ProductService,
    preference_category: Optional[str] = None,
    preference_style: Optional[str] = None
) -> List[dict]:
    """构建广场分区 — 所有 DB 查询并发执行"""

    categories = [
        ("Furniture", "Top-rated furniture for every room"),
        ("Home Decoration", "Decorative accents & statement pieces"),
        ("Lighting", "Lighting that sets the mood"),
    ]

    # 构建所有并发任务
    tasks = [
        service.search_products({"page_size": 4, "sort_by": "newest"}),           # new_arrivals
        service.search_products({"page_size": 20, "sort_by": "price_desc"}),      # deals pool
    ] + [
        service.search_products({"category_l1": cat, "page_size": 4, "sort_by": "rating"})
        for cat, _ in categories
    ]

    personalized_params = None
    if preference_category or preference_style:
        personalized_params = {"page_size": 8, "sort_by": "rating"}
        if preference_category:
            personalized_params["category_l1"] = preference_category
        if preference_style:
            personalized_params["styles"] = [preference_style]
        tasks.append(service.search_products(personalized_params))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    sections = []

    # New Arrivals
    r_new = results[0] if not isinstance(results[0], Exception) else {}
    if r_new.get("products"):
        sections.append({
            "id": "new_arrivals",
            "title": "New Arrivals",
            "subtitle": "Fresh picks added today",
            "type": "new_arrivals",
            "products": _format_products(r_new["products"][:4], ["New"]),
            "sort_order": 2
        })

    # Today's Deals
    r_deals = results[1] if not isinstance(results[1], Exception) else {}
    promo_products = []
    for p in r_deals.get("products", []):
        current = p.get("price_current", 0) or 0
        original = p.get("price_original", 0) or 0
        if original > current:
            promo_products.append(p)
        if len(promo_products) >= 4:
            break
    if promo_products:
        sections.append({
            "id": "promotions",
            "title": "Today's Deals",
            "subtitle": "Limited-time offers — don't miss out",
            "type": "promotions",
            "products": _format_products(promo_products, ["Hot", "Deal"]),
            "sort_order": 3
        })

    # Category sections
    for idx, (cat, subtitle) in enumerate(categories):
        r_cat = results[2 + idx] if not isinstance(results[2 + idx], Exception) else {}
        if r_cat.get("products"):
            sections.append({
                "id": f"category_{idx}",
                "title": cat,
                "subtitle": subtitle,
                "type": "category",
                "products": _format_products(r_cat["products"]),
                "sort_order": 10 + idx
            })

    # Personalized section (prepend if present)
    if personalized_params is not None:
        r_pers = results[-1] if not isinstance(results[-1], Exception) else {}
        if r_pers.get("products"):
            if preference_category and preference_style:
                personalized_title = f"Recommended {preference_style.title()} {preference_category}"
            elif preference_category:
                personalized_title = f"Recommended {preference_category}"
            else:
                personalized_title = f"Recommended {preference_style.title()} Style Picks"  # type: ignore[union-attr]
            sections.insert(0, {
                "id": "personalized",
                "title": personalized_title,
                "subtitle": "Curated based on your preferences",
                "type": "personalized",
                "products": _format_products(r_pers["products"], ["Agent Pick"]),
                "sort_order": 1
            })

    return sections


def _format_products(products: List[dict], default_tags: List[str] = None) -> List[dict]:
    """格式化商品数据"""
    formatted = []
    for idx, p in enumerate(products):
        tags = list(default_tags) if default_tags else []
        
        # High-rated products get an Agent Pick tag
        rating = p.get("rating")
        if rating and float(rating) >= 4.5:
            tags.append("Agent Pick")
        
        formatted.append({
            "spu_id": p.get("spu_id", ""),
            "title": p.get("title", ""),
            "category": p.get("category_l1", ""),
            "price_current": float(p.get("price_current", 0)) if p.get("price_current") else 0,
            "price_original": float(p.get("price_original", 0)) if p.get("price_original") else None,
            "currency": p.get("currency", "USD"),
            "image": p.get("images", [None])[0] if p.get("images") else None,
            "tags": tags,
            "rating": float(rating) if rating else None,
            "styles": p.get("styles", []),
            "scenes": p.get("scenes", [])
        })
    return formatted


def _generate_product_tags(product: dict) -> List[str]:
    """Generate product tags"""
    tags = []
    rating = product.get("rating")
    if rating and float(rating) >= 4.5:
        tags.append("Agent Pick")
    return tags


def _generate_achievements(limit: int = 5) -> List[dict]:
    """生成 Agent 战绩"""
    achievements = []
    templates = random.sample(ACHIEVEMENT_TEMPLATES, min(limit, len(ACHIEVEMENT_TEMPLATES)))
    
    for idx, template in enumerate(templates):
        # 格式化描述
        desc = template["action_desc"].format(style=template["style_tag"])
        
        achievements.append({
            "id": f"ach_{idx}",
            "user_name": template["user_name"],
            "avatar": None,
            "action_type": template["action_type"],
            "action_desc": desc,
            "save_amount": template["save_amount"],
            "product_title": f"{template['style_tag']} Collection",
            "product_image": None,
            "style_tag": template["style_tag"],
            "timestamp": (datetime.now() - timedelta(minutes=random.randint(5, 120))).isoformat()
        })
    
    return achievements


async def _generate_reviews(
    service: ProductService,
    category: Optional[str] = None,
    limit: int = 6
) -> List[dict]:
    """生成结构化评价"""
    # 获取一些商品作为评价基础
    params = {"page_size": limit, "sort_by": "rating"}
    if category:
        params["category_l1"] = category
    
    result = await service.search_products(params)
    products = result.get("products", [])
    
    reviews = []
    for idx, p in enumerate(products[:limit]):
        # 随机选择2-4个亮点
        highlights = random.sample(
            REVIEW_HIGHLIGHTS_TEMPLATES,
            k=random.randint(2, 4)
        )
        
        styles = p.get("styles", [])
        style_str = styles[0].replace("_", "-").title() if styles else "This"
        agent_summary = f"{style_str} style — excellent quality, great value, suitable for most homes."
        
        reviews.append({
            "id": f"rev_{idx}",
            "product_id": p.get("spu_id", ""),
            "product_title": p.get("title", ""),
            "product_image": p.get("images", [None])[0] if p.get("images") else None,
            "highlights": highlights,
            "agent_summary": agent_summary,
            "rating": float(p.get("rating", 4.5)) if p.get("rating") else 4.5
        })
    
    return reviews


def _generate_wakeups(session_id: Optional[str] = None) -> List[dict]:
    """生成智能唤醒卡片"""
    wakeups = []
    
    # 如果提供了session_id，可以根据会话历史生成更个性化的唤醒
    for idx, template in enumerate(WAKEUP_TEMPLATES[:2]):  # 最多2个
        wakeups.append({
            "id": f"wakeup_{idx}",
            "type": template["type"],
            "title": template["title"],
            "description": template["description"],
            "related_product_id": None,
            "related_product_image": None,
            "cta_text": template["cta_text"],
            "cta_link": "/chat"
        })
    
    return wakeups
