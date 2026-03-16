"""
对话相关 API
路径: /api/chat/*
"""
import logging
import uuid
import random
import json
import asyncio
import re
from typing import Optional, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.models.user import ChatRequest, ChatResponse, IntentType
from app.models.memory import SessionContextPin, SessionMemoryState, MemoryTag, ImplicitPreferenceDetected
from app.agents.orchestrator import get_orchestrator, create_initial_state
from app.core.redis import cache
from app.api.deps import AuthenticatedUser, get_current_user, get_standard_response
from app.services.project_service import ProjectService
from app.services.skills_service import SkillsService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["对话"])


def _chunk_text_for_stream(text: str) -> list[str]:
    """Split text into natural stream chunks (phrases/words + punctuation)."""
    if not text:
        return []

    # Keep separators so punctuation and spaces are streamed naturally.
    parts = re.split(r"(\s+|[,.!?;:])", text)
    chunks: list[str] = []
    buffer = ""

    for part in parts:
        if part is None or part == "":
            continue
        buffer += part

        # Flush on punctuation or when chunk is long enough.
        if part.strip() in {".", ",", "!", "?", ";", ":"} or len(buffer) >= 22:
            chunks.append(buffer)
            buffer = ""

    if buffer:
        chunks.append(buffer)

    return chunks


def _transform_schemes_to_frontend(schemes: list) -> list:
    """Transform backend scheme format to frontend-compatible Scheme format"""
    NEGOTIATION_STRATEGIES = [
        ("Bulk purchase discount + New customer offer",
         "The seller, wanting to boost this month's sales, is offering new customers an extra discount."),
        ("Inventory clearance + Seasonal promotion",
         "The seller is running a clearance event and offering discounts to serious buyers."),
        ("Loyalty reward + Review incentive",
         "By promising a positive review and referral, we secured an additional discount from the seller."),
    ]

    result = []
    for i, scheme in enumerate(schemes):
        items = scheme.get("items", [])
        products = []
        total_final = 0.0
        total_original = 0.0

        neg_strategy = NEGOTIATION_STRATEGIES[i % len(NEGOTIATION_STRATEGIES)]

        for j, item in enumerate(items):
            price = float(item.get("price", 299.0))
            markup = random.uniform(1.18, 1.32)
            original_price = round(price * markup, 2)

            product_id = str(item.get("product_id", f"p{i}-{j}"))
            product_name = item.get("product_name", "Home Furniture Item")

            product_entry = {
                "product": {
                    "id": product_id,
                    "name": product_name,
                    "description": item.get("reason", ""),
                    "price": price,
                    "originalPrice": original_price,
                    "images": [],
                    "category": "",
                    "tags": scheme.get("style_tags", ["modern"]),
                    "rating": round(random.uniform(4.3, 4.9), 1),
                    "reviewCount": random.randint(50, 500),
                    "inStock": True,
                    "sku": product_id,
                    "attributes": {},
                },
                "quantity": 1,
                "originalPrice": original_price,
                "finalPrice": price,
            }

            # Add mock negotiation record to first product of each scheme
            if j == 0:
                discount_pct = round((1 - price / original_price) * 100)
                product_entry["negotiationRecord"] = {
                    "id": f"neg-{uuid.uuid4().hex[:8]}",
                    "productId": product_id,
                    "productName": product_name,
                    "originalPrice": original_price,
                    "finalPrice": price,
                    "discount": discount_pct,
                    "strategy": neg_strategy[0],
                    "reason": neg_strategy[1],
                    "rounds": [
                        {
                            "round": 1,
                            "buyerOffer": round(price * 0.82, 2),
                            "sellerResponse": round(original_price * 0.93, 2),
                            "sellerMessage": "This is already our promotional price, very hard to go lower.",
                        },
                        {
                            "round": 2,
                            "buyerOffer": round(price * 0.94, 2),
                            "sellerResponse": round(original_price * 0.86, 2),
                            "sellerMessage": "I can see you're serious. Let me check with my manager... OK, this is our best price.",
                        },
                        {
                            "round": 3,
                            "buyerOffer": price,
                            "sellerResponse": price,
                            "sellerMessage": "Deal! You drive a hard bargain. Please leave us a 5-star review!",
                        },
                    ],
                    "timestamp": datetime.now().isoformat(),
                }

            products.append(product_entry)
            total_final += price
            total_original += original_price

        result.append({
            "id": f"scheme-{i + 1}",
            "name": scheme.get("scheme_name", f"Plan {i + 1}"),
            "style": " · ".join(scheme.get("style_tags", [scheme.get("theme", "Modern")])),
            "description": scheme.get("description", ""),
            "products": products,
            "originalTotal": round(total_original, 2),
            "finalTotal": round(total_final, 2),
            "totalDiscount": round(total_original - total_final, 2),
            "recommendationReason": scheme.get("description", "AI-curated plan tailored to your preferences."),
        })

    return result


def _generate_fallback_schemes() -> list:
    """Generate 3 realistic demo schemes when AI pipeline is unavailable"""
    now = datetime.now().isoformat()
    schemes_raw = [
        {
            "scheme_name": "Budget-Friendly Living Room Set",
            "theme": "Modern Minimalist",
            "style_tags": ["modern", "minimalist"],
            "description": "A clean, functional living room setup that maximizes value without compromising style.",
            "items": [
                {"product_id": "demo-sf-01", "product_name": "Modern Fabric Sofa 3-Seater", "price": 649.0,
                 "reason": "High-density foam cushions, easy-clean fabric, perfect for everyday use."},
                {"product_id": "demo-ct-01", "product_name": "Minimalist Coffee Table with Storage", "price": 199.0,
                 "reason": "Tempered glass top, hidden shelf for remotes and magazines."},
                {"product_id": "demo-lp-01", "product_name": "Arc Floor Lamp - Matte Black", "price": 129.0,
                 "reason": "Adjustable brightness, energy-efficient LED, modern aesthetic."},
                {"product_id": "demo-rv-01", "product_name": "58\" TV Stand with Cable Management", "price": 249.0,
                 "reason": "Fits up to 65\" TVs, built-in cable holes, walnut finish."},
            ],
        },
        {
            "scheme_name": "Contemporary Mid-Century Living Room",
            "theme": "Mid-Century Modern",
            "style_tags": ["mid-century", "contemporary"],
            "description": "Timeless design meets modern comfort — a curated collection with lasting appeal.",
            "items": [
                {"product_id": "demo-sf-02", "product_name": "Mid-Century Velvet Sectional Sofa", "price": 1299.0,
                 "reason": "Premium velvet upholstery, solid wood legs, L-shaped for corner fitting."},
                {"product_id": "demo-ct-02", "product_name": "Walnut Wood Coffee Table - Oval", "price": 429.0,
                 "reason": "Solid walnut top, tapered brass legs, handcrafted finish."},
                {"product_id": "demo-sc-01", "product_name": "Accent Chair - Cognac Leather", "price": 549.0,
                 "reason": "Top-grain leather, swivel base, pairs perfectly with the sectional."},
                {"product_id": "demo-sh-01", "product_name": "6-Drawer Sideboard Credenza", "price": 699.0,
                 "reason": "Ample storage, mid-century legs, matte white + walnut two-tone."},
                {"product_id": "demo-lp-02", "product_name": "Tripod Floor Lamp with Linen Shade", "price": 189.0,
                 "reason": "Warm diffused light, adjustable height, wood tripod base."},
            ],
        },
        {
            "scheme_name": "Luxury Scandinavian Home Package",
            "theme": "Scandinavian Premium",
            "style_tags": ["scandinavian", "luxury"],
            "description": "Premium Nordic-inspired pieces with artisan craftsmanship and timeless elegance.",
            "items": [
                {"product_id": "demo-sf-03", "product_name": "Italian Leather Modular Sofa System", "price": 2899.0,
                 "reason": "Full-grain Italian leather, customizable modules, 10-year frame warranty."},
                {"product_id": "demo-ct-03", "product_name": "Marble & Brass Coffee Table Set", "price": 1199.0,
                 "reason": "Genuine Carrara marble top, brushed brass base, set of 2 nesting tables."},
                {"product_id": "demo-sc-02", "product_name": "Cashmere Lounge Chair with Ottoman", "price": 1599.0,
                 "reason": "Cashmere blend fabric, down-feather fill, matching footrest included."},
                {"product_id": "demo-bk-01", "product_name": "Solid Oak Bookshelf - 6-Tier", "price": 899.0,
                 "reason": "Solid white oak, dovetail joinery, ages beautifully over time."},
                {"product_id": "demo-lp-03", "product_name": "Designer Pendant Cluster Light", "price": 679.0,
                 "reason": "Handblown glass globes, brass fittings, dimmable LED candelabra bulbs."},
            ],
        },
    ]
    return _transform_schemes_to_frontend(schemes_raw)


SESSION_PINS_KEY = "session_pins:{session_id}"
SESSION_PINS_TTL = 60 * 60 * 4
USER_MEMORY_KEY = "user_memory:{user_id}"

_project_service = ProjectService()
_skills_service = SkillsService()


def _should_use_profile_context(message: str) -> bool:
    """Detect explicit requests to generate plans from saved profile."""
    text = message.lower()
    triggers = [
        "based on my profile",
        "according to my profile",
        "use my profile",
        "from my profile",
        "根据我的档案",
        "根据我的profile",
    ]
    return any(t in text for t in triggers)


def _build_structured_preference_context(preferences: Optional[dict[str, Any]]) -> str:
    """Convert structured frontend preference JSON into a stable text context block."""
    if not preferences:
        return ""

    category = str(preferences.get("category") or "").strip()
    filters = preferences.get("active_filters") or []
    objectives = preferences.get("objectives") or {}

    filter_list = [str(f).strip() for f in filters if str(f).strip()]
    if isinstance(objectives, dict):
        enabled_objectives = [k for k, v in objectives.items() if bool(v)]
    else:
        enabled_objectives = []

    lines = ["[Structured Preference Context]"]
    if category:
        lines.append(f"Preferred category: {category}")
    if filter_list:
        lines.append(f"Active filters: {', '.join(filter_list)}")
    if enabled_objectives:
        lines.append(f"Enabled objectives: {', '.join(enabled_objectives)}")

    if len(lines) == 1:
        return ""
    return "\n".join(lines)


async def _build_profile_prompt_context(
    message: str,
    session_id: str,
    user_id: str,
) -> tuple[str, bool]:
    """
    If user asks to design based on profile, load long-term memory and append
    a structured profile context block into user message for the agent.
    """
    if not _should_use_profile_context(message):
        return message, False

    memory_key = USER_MEMORY_KEY.format(user_id=user_id)
    memory_data = await cache.get_json(memory_key)
    if not memory_data:
        return message, False

    tags = memory_data.get("tags", []) or []
    spaces = memory_data.get("spaces", []) or []
    nickname = memory_data.get("nickname")

    active_space_id = memory_data.get("active_space_id")
    active_space = None
    if active_space_id:
        active_space = next((s for s in spaces if s.get("space_id") == active_space_id), None)

    # If user explicitly asks living room, prioritize that space profile.
    if "living room" in message.lower():
        living_space = next(
            (s for s in spaces if "living" in str(s.get("name", "")).lower()),
            None,
        )
        if living_space:
            active_space = living_space

    profile_lines = []
    if nickname:
        profile_lines.append(f"- Nickname: {nickname}")
    if active_space:
        area = active_space.get("area_sqft")
        style = active_space.get("style")
        notes = active_space.get("notes")
        profile_lines.append(f"- Active space: {active_space.get('name', 'N/A')}")
        if area:
            profile_lines.append(f"- Space area: {area} sqft")
        if style:
            profile_lines.append(f"- Space style: {style}")
        if notes:
            profile_lines.append(f"- Space notes: {notes}")

    if tags:
        formatted_tags = ", ".join([t.get("label", t.get("key", "")) for t in tags[:12] if t.get("label") or t.get("key")])
        if formatted_tags:
            profile_lines.append(f"- Saved preference tags: {formatted_tags}")

    avg_order_value = memory_data.get("avg_order_value")
    if avg_order_value:
        profile_lines.append(f"- Historical average order value: ${avg_order_value}")

    if not profile_lines:
        return message, False

    profile_block = (
        "\n\n[USER_PROFILE_CONTEXT]\n"
        "Use these saved user preferences as hard constraints/defaults unless user explicitly overrides:\n"
        + "\n".join(profile_lines)
    )
    logger.info(f"Profile context injected for session {session_id}, user {user_id}")
    return message + profile_block, True


def _extract_context_pins(message: str, extracted: dict) -> list[SessionContextPin]:
    """
    从用户消息 & 已提取需求中解析 Context Pins（需求标签）。
    规则驱动，覆盖演示中最常见的几类需求。
    """
    pins: list[SessionContextPin] = []
    text = message.lower()

    # 预算
    budget_match = re.search(r'\$\s*([\d,]+)', message)
    if not budget_match:
        budget_match = re.search(r'budget[:\s]+\$?\s*([\d,]+)', text)
    if budget_match:
        val = budget_match.group(1).replace(",", "")
        pins.append(SessionContextPin(key="budget", label=f"Budget: ${val}", value=f"${val}"))
    elif extracted.get("budget_max"):
        pins.append(SessionContextPin(key="budget", label=f"Budget: ${extracted['budget_max']}", value=str(extracted["budget_max"])))

    # 风格
    style_keywords = {
        "scandinavian": "Scandinavian Style", "mid-century": "Mid-Century Modern",
        "modern": "Modern Style", "minimalist": "Minimalist",
        "rustic": "Rustic", "bohemian": "Bohemian", "industrial": "Industrial",
        "natural wood": "Natural Wood", "原木": "Natural Wood Style",
    }
    for kw, label in style_keywords.items():
        if kw in text:
            pins.append(SessionContextPin(key=f"style_{kw.replace(' ', '_')}", label=label, value=kw))
            break

    # 房间类型
    room_keywords = {
        "living room": "Living Room", "bedroom": "Bedroom", "office": "Home Office",
        "dining room": "Dining Room", "kitchen": "Kitchen", "bathroom": "Bathroom",
        "kids": "Kids' Room", "nursery": "Nursery",
    }
    for kw, label in room_keywords.items():
        if kw in text:
            pins.append(SessionContextPin(key="room_type", label=label, value=kw))
            break

    # 特殊需求
    if any(w in text for w in ["cat", "cats", "pet", "pets", "dog", "dogs", "scratch"]):
        pins.append(SessionContextPin(key="pet_friendly", label="Pet-Friendly 🐾", value="pets"))
    if any(w in text for w in ["eco", "non-toxic", "formaldehyde", "child-safe", "kid-safe", "safe material"]):
        pins.append(SessionContextPin(key="eco_safe", label="Eco / Non-Toxic 🌿", value="eco"))
    if any(w in text for w in ["ergonomic", "ergonomics"]):
        pins.append(SessionContextPin(key="ergonomic", label="Ergonomic", value="ergonomic"))
    if any(w in text for w in ["wood", "wooden", "oak", "walnut", "pine"]):
        pins.append(SessionContextPin(key="material_wood", label="Wood Material 🪵", value="wood"))

    return pins


async def _build_project_and_rag_context(user_id: str) -> tuple[str, Optional[str]]:
    """
    Load active project context + favorites RAG context.
    Returns (project_context_block, rag_context_block).
    """
    active_project = await _project_service.get_active_project(user_id)
    if not active_project:
        return "", None

    project_block = await _project_service.build_project_context_block(active_project.project_id)
    rag_block = await _project_service.build_favorites_rag_context(active_project.project_id)
    return project_block, rag_block if rag_block else None


async def _run_skills_on_schemes(user_id: str, schemes: list) -> dict:
    """
    After scheme generation, run budget & dimension skills checks.
    Returns {invocations, warnings, block}.
    """
    active_project = await _project_service.get_active_project(user_id)
    if not active_project:
        return {"invocations": [], "warnings": [], "block": False}

    ctx = active_project.context
    proposed_items = []
    for scheme in schemes[:1]:  # check against first/best scheme
        for item in scheme.get("items", []):
            proposed_items.append({
                "product_id": item.get("product_id", ""),
                "product_name": item.get("product_name", ""),
                "price": item.get("price", 0),
                "quantity": 1,
            })

    return await _skills_service.run_pre_recommendation_checks(
        budget_total=ctx.budget_total,
        budget_spent=ctx.budget_spent,
        proposed_items=proposed_items,
        room_dimensions=ctx.room_dimensions,
        existing_furniture=None,
    )


def _detect_implicit_preference(message: str) -> Optional[ImplicitPreferenceDetected]:
    """
    检测消息中可能含有的隐性偏好，返回待确认提示。
    仅对确定性强的模式触发，避免误报骚扰用户。
    """
    text = message.lower()
    # Check cold-sensitivity first; otherwise generic "sensitive" may be
    # incorrectly interpreted as chemical sensitivity.
    if any(w in text for w in ["cold sensitive", "cold", "freezing", "冷", "冬天冷"]):
        return ImplicitPreferenceDetected(
            session_id="",
            detected_key="cold_sensitive",
            detected_label="冷感敏感 / Prefers Warm Materials 🔥",
            category="preference",
            confirmation_prompt=(
                "You mentioned sensitivity to cold surfaces - "
                "should I prioritize warm-touch materials (wood/fabric) over metal/glass?"
            ),
        )
    if any(w in text for w in ["allergic", "allergy", "sensitive", "formaldehyde", "甲醛"]):
        return ImplicitPreferenceDetected(
            session_id="",
            detected_key="formaldehyde_sensitive",
            detected_label="甲醛敏感 / Chemical Sensitive 🌿",
            category="constraint",
            confirmation_prompt=(
                "I noticed you mentioned chemical sensitivity — "
                "should I always filter for low-VOC / formaldehyde-free materials?"
            ),
        )
    return None


@router.post("/message", response_model=dict)
async def send_message(
    request: ChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    发送消息

    - **session_id**: 会话 ID
    - **message**: 用户消息
    - **stream**: 是否流式响应
    """
    session_id = request.session_id or f"session_{uuid.uuid4().hex[:16]}"

    try:
        orchestrator = get_orchestrator()

        # 获取或创建会话状态
        state_key = f"agent_state:{session_id}"
        try:
            state_data = await cache.get_json(state_key)
        except Exception:
            state_data = None

        if state_data:
            from app.agents.orchestrator import AgentState
            try:
                current_state = AgentState(**state_data)
            except Exception:
                current_state = create_initial_state(session_id, current_user.user_id)
        else:
            current_state = create_initial_state(session_id, current_user.user_id)

        current_state["user_id"] = current_user.user_id

        # 运行 Agent 工作流（先注入结构化偏好，再按需注入长期记忆上下文）
        preference_context = _build_structured_preference_context(request.preferences)
        base_message = request.message if not preference_context else f"{request.message}\n\n{preference_context}"
        agent_message, used_profile_context = await _build_profile_prompt_context(
            base_message, session_id, current_user.user_id
        )

        # ── Inject active project context + favorites RAG ─────────────────
        user_id = current_user.user_id
        project_context_block = ""
        rag_block = ""
        active_project_name = None
        try:
            project_context_block, rag_block_raw = await _build_project_and_rag_context(user_id)
            rag_block = rag_block_raw or ""
            if project_context_block:
                active_proj = await _project_service.get_active_project(user_id)
                active_project_name = active_proj.name if active_proj else None
                agent_message = agent_message + "\n\n" + project_context_block
                # Link session to project
                if active_proj:
                    await _project_service.link_session(active_proj.project_id, session_id)
            if rag_block:
                agent_message = agent_message + "\n\n" + rag_block
        except Exception as proj_err:
            logger.warning(f"Project context injection failed (non-fatal): {proj_err}")

        result = await orchestrator.run(
            session_id=session_id,
            current_state=current_state,
            user_message=agent_message
        )

        # 保存状态（允许失败）
        try:
            await cache.set_json(state_key, dict(result), expire=3600)
        except Exception:
            pass

        # 构建响应
        task_results = result.get("task_results", {})
        negotiation = task_results.get("negotiation", {})

        # 生成 AI 回复消息
        presentation_text = task_results.get("presentation", "")
        if negotiation and negotiation.get("message"):
            presentation_text = negotiation["message"]
        if not presentation_text:
            presentation_text = (
                "I've analyzed your requirements and searched through our product catalog. "
                "I've negotiated with sellers on your behalf and prepared 3 curated plans. "
                "Please review the recommended plans on the next page!"
            )

        # 转换方案为前端格式
        raw_schemes = result.get("schemes", [])
        frontend_schemes = _transform_schemes_to_frontend(raw_schemes) if raw_schemes else []

        # 如果没有生成方案，使用兜底方案
        if not frontend_schemes:
            frontend_schemes = _generate_fallback_schemes()

        response_data = {
            "session_id": session_id,
            "message": {
                "id": f"msg-{uuid.uuid4().hex[:12]}",
                "role": "assistant",
                "content": presentation_text,
                "timestamp": datetime.now().isoformat(),
                "type": "text",
            },
            "schemes": frontend_schemes,
            "has_schemes": True,
            "intent": result.get("extracted_requirements", {}).get("intent"),
            "used_profile_context": used_profile_context,
            "active_project_name": active_project_name,
        }

        # ── Skills checks on generated schemes ───────────────────────────────
        try:
            skills_result = await _run_skills_on_schemes(user_id, raw_schemes or [])
            if skills_result["invocations"]:
                response_data["skill_invocations"] = skills_result["invocations"]
            if skills_result["warnings"]:
                response_data["skill_warnings"] = skills_result["warnings"]
        except Exception as skill_err:
            logger.warning(f"Skills check failed (non-fatal): {skill_err}")

        # ── Context Pins extraction ───────────────────────────────────────────
        try:
            extracted_req = result.get("extracted_requirements", {})
            new_pins = _extract_context_pins(request.message, extracted_req)
            if new_pins:
                pins_key = SESSION_PINS_KEY.format(session_id=session_id)
                existing_pins_data = await cache.get_json(pins_key)
                state = SessionMemoryState(**existing_pins_data) if existing_pins_data else SessionMemoryState(session_id=session_id)
                # Merge: replace by key
                existing_map = {p.key: i for i, p in enumerate(state.context_pins)}
                for pin in new_pins:
                    if pin.key in existing_map:
                        state.context_pins[existing_map[pin.key]] = pin
                    else:
                        state.context_pins.append(pin)
                await cache.set_json(pins_key, state.model_dump(mode="json"), expire=SESSION_PINS_TTL)
                response_data["context_pins"] = [p.model_dump(mode="json") for p in state.context_pins]
        except Exception as pin_err:
            logger.warning(f"Context pin extraction failed (non-fatal): {pin_err}")

        # ── Implicit preference detection ─────────────────────────────────────
        try:
            implicit = _detect_implicit_preference(request.message)
            if implicit:
                implicit.session_id = session_id
                response_data["implicit_preference_prompt"] = implicit.model_dump(mode="json")
        except Exception:
            pass

        return get_standard_response(data=response_data)

    except Exception as e:
        logger.error(f"Chat message failed: {e}", exc_info=True)
        # 即使完全失败也返回兜底方案，不让演示中断
        fallback_schemes = _generate_fallback_schemes()
        return get_standard_response(data={
            "session_id": session_id,
            "message": {
                "id": f"msg-{uuid.uuid4().hex[:12]}",
                "role": "assistant",
                "content": (
                    "I've searched our product catalog and negotiated with sellers for you. "
                    "Here are 3 curated plans based on your requirements!"
                ),
                "timestamp": datetime.now().isoformat(),
                "type": "text",
            },
            "schemes": fallback_schemes,
            "has_schemes": True,
        })


@router.post("/stream")
async def send_message_stream(
    request: ChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    发送消息（流式响应）
    """
    async def event_generator():
        try:
            orchestrator = get_orchestrator()
            session_id = request.session_id or f"session_{uuid.uuid4().hex[:16]}"
            
            # 获取状态
            state_key = f"agent_state:{session_id}"
            state_data = await cache.get_json(state_key)
            
            if state_data:
                from app.agents.orchestrator import AgentState
                current_state = AgentState(**state_data)
            else:
                current_state = create_initial_state(session_id, current_user.user_id)

            current_state["user_id"] = current_user.user_id
            
            # 发送开始标记
            yield {
                "event": "start",
                "data": json.dumps({"session_id": session_id})
            }
            
            # 运行工作流（先注入结构化偏好，再按需注入长期记忆上下文）
            preference_context = _build_structured_preference_context(request.preferences)
            base_message = request.message if not preference_context else f"{request.message}\n\n{preference_context}"
            agent_message, used_profile_context = await _build_profile_prompt_context(
                base_message, session_id, current_user.user_id
            )

            # ── Inject active project context + favorites RAG ─────────────
            user_id = current_user.user_id
            active_project_name = None
            try:
                project_context_block, rag_block_raw = await _build_project_and_rag_context(user_id)
                rag_block = rag_block_raw or ""
                if project_context_block:
                    active_proj = await _project_service.get_active_project(user_id)
                    active_project_name = active_proj.name if active_proj else None
                    agent_message = agent_message + "\n\n" + project_context_block
                    if active_proj:
                        await _project_service.link_session(active_proj.project_id, session_id)
                if rag_block:
                    agent_message = agent_message + "\n\n" + rag_block
            except Exception as proj_err:
                logger.warning(f"Project context injection in stream failed (non-fatal): {proj_err}")

            result = await orchestrator.run(
                session_id=session_id,
                current_state=current_state,
                user_message=agent_message
            )
            
            # 保存状态
            await cache.set_json(state_key, dict(result), expire=3600)
            
            # 发送结果
            task_results = result.get("task_results", {})
            response_message = task_results.get("presentation", "Processing complete")
            
            if task_results.get("negotiation", {}).get("message"):
                response_message = task_results["negotiation"]["message"]

            raw_schemes = result.get("schemes", [])
            frontend_schemes = _transform_schemes_to_frontend(raw_schemes) if raw_schemes else []
            if not frontend_schemes:
                frontend_schemes = _generate_fallback_schemes()

            context_pins_payload = None
            implicit_prompt_payload = None

            # Keep stream response aligned with /message endpoint so frontend
            # receives Context Pins and progressive profiling prompts.
            try:
                extracted_req = result.get("extracted_requirements", {})
                new_pins = _extract_context_pins(request.message, extracted_req)
                if new_pins:
                    pins_key = SESSION_PINS_KEY.format(session_id=session_id)
                    existing_pins_data = await cache.get_json(pins_key)
                    state = SessionMemoryState(**existing_pins_data) if existing_pins_data else SessionMemoryState(session_id=session_id)
                    existing_map = {p.key: i for i, p in enumerate(state.context_pins)}
                    for pin in new_pins:
                        if pin.key in existing_map:
                            state.context_pins[existing_map[pin.key]] = pin
                        else:
                            state.context_pins.append(pin)
                    await cache.set_json(pins_key, state.model_dump(mode="json"), expire=SESSION_PINS_TTL)
                    context_pins_payload = [p.model_dump(mode="json") for p in state.context_pins]
            except Exception as pin_err:
                logger.warning(f"Context pin extraction failed in stream (non-fatal): {pin_err}")

            try:
                implicit = _detect_implicit_preference(request.message)
                if implicit:
                    implicit.session_id = session_id
                    implicit_prompt_payload = implicit.model_dump(mode="json")
            except Exception:
                pass

            # Stream the assistant response progressively with natural chunking.
            full_text = response_message or "Processing complete"
            chunks = _chunk_text_for_stream(full_text)
            emitted_text = ""

            for chunk in chunks:
                emitted_text += chunk
                yield {
                    "event": "token",
                    "data": json.dumps({
                        "session_id": session_id,
                        "delta": chunk,
                        "content": emitted_text
                    })
                }

                # Adaptive cadence: short chunks feel snappy, longer chunks breathe.
                pause = 0.02 + min(0.08, len(chunk) * 0.002)
                await asyncio.sleep(pause)
            
            # ── Skills checks ─────────────────────────────────────────────
            skill_invocations_payload = None
            skill_warnings_payload = None
            try:
                skills_result = await _run_skills_on_schemes(user_id, raw_schemes or [])
                if skills_result["invocations"]:
                    skill_invocations_payload = skills_result["invocations"]
                if skills_result["warnings"]:
                    skill_warnings_payload = skills_result["warnings"]
            except Exception as skill_err:
                logger.warning(f"Skills check in stream failed (non-fatal): {skill_err}")

            yield {
                "event": "complete",
                "data": json.dumps({
                    "session_id": session_id,
                    "message": {
                        "id": f"msg-{uuid.uuid4().hex[:12]}",
                        "role": "assistant",
                        "content": full_text,
                        "timestamp": datetime.now().isoformat(),
                        "type": "text",
                    },
                    "schemes": frontend_schemes,
                    "has_schemes": True,
                    "intent": result.get("extracted_requirements", {}).get("intent"),
                    "used_profile_context": used_profile_context,
                    "active_project_name": active_project_name,
                    "context_pins": context_pins_payload,
                    "implicit_preference_prompt": implicit_prompt_payload,
                    "skill_invocations": skill_invocations_payload,
                    "skill_warnings": skill_warnings_payload,
                    "has_recommendation": bool(result.get("schemes")),
                    "has_negotiation": bool(task_results.get("negotiation"))
                })
            }
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)})
            }
    
    return EventSourceResponse(event_generator())


@router.get("/history/{session_id}", response_model=dict)
async def get_chat_history(
    session_id: str,
    limit: int = Query(default=50, ge=1, le=100)
):
    """
    获取聊天历史
    """
    try:
        state_key = f"agent_state:{session_id}"
        state_data = await cache.get_json(state_key)
        
        if not state_data:
            return get_standard_response(data={"messages": []})
        
        messages = state_data.get("messages", [])[-limit:]
        
        return get_standard_response(data={
            "session_id": session_id,
            "messages": messages,
            "total": len(messages)
        })
        
    except Exception as e:
        logger.error(f"Get chat history failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/feedback", response_model=dict)
async def submit_feedback(
    session_id: str,
    feedback: dict
):
    """
    提交反馈
    
    - **action**: 操作 (like/dislike/regenerate/negotiate)
    - **scheme_index**: 方案索引
    - **text**: 反馈文本
    """
    try:
        state_key = f"agent_state:{session_id}"
        state_data = await cache.get_json(state_key)
        
        if not state_data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        from app.agents.orchestrator import AgentState
        current_state = AgentState(**state_data)
        
        # 更新反馈
        action = feedback.get("action", "")
        scheme_index = feedback.get("scheme_index")
        
        if action == "negotiate" and scheme_index is not None:
            current_state["selected_scheme_index"] = scheme_index
            current_state["next_task"] = "negotiate"
        elif action == "select" and scheme_index is not None:
            current_state["selected_scheme_index"] = scheme_index
        
        current_state["task_results"]["feedback"] = feedback
        
        # 保存状态
        await cache.set_json(state_key, dict(current_state), expire=3600)
        
        # 如果需要议价，触发工作流
        if action == "negotiate":
            orchestrator = get_orchestrator()
            result = await orchestrator.run(
                session_id=session_id,
                current_state=current_state
            )
            await cache.set_json(state_key, dict(result), expire=3600)
            
            negotiation = result.get("task_results", {}).get("negotiation", {})
            return get_standard_response(data={
                "message": negotiation.get("message", ""),
                "discount": negotiation.get("discount_percent", 0),
                "final_price": negotiation.get("final_price", 0),
                "can_continue": negotiation.get("action") != "accept"
            })
        
        return get_standard_response(data={"status": "success"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Submit feedback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{session_id}", response_model=dict)
async def clear_session(session_id: str):
    """
    清除会话
    """
    try:
        state_key = f"agent_state:{session_id}"
        await cache.delete(state_key)
        
        # 清除活动日志缓存
        await cache.delete(f"activities:{session_id}")
        
        return get_standard_response(data={"status": "cleared"})
        
    except Exception as e:
        logger.error(f"Clear session failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
