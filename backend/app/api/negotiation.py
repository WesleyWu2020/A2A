"""Negotiation API with Night Market session flow."""

import json
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import execute_query

logger = logging.getLogger(__name__)
router = APIRouter()
MIN_NEGOTIATION_ROUNDS = 2


class CounterOfferRequest(BaseModel):
    session_id: str = Field(description="会话ID")
    offer_price: float = Field(description="出价", gt=0)
    reason: Optional[str] = Field(default=None, description="理由")


class AcceptOfferRequest(BaseModel):
    session_id: str = Field(description="会话ID")


class MarketStartRequest(BaseModel):
    session_id: str = Field(..., description="会话ID")
    scheme_id: str = Field(..., description="方案ID")
    scheme_name: str = Field(..., description="方案名称")
    original_price: float = Field(..., gt=0, description="原始价格")
    scheme_snapshot: Optional[Dict[str, Any]] = Field(default_factory=dict, description="方案快照")


class MarketCounterRequest(BaseModel):
    negotiation_id: str = Field(..., description="议价会话ID")
    session_id: str = Field(..., description="会话ID")
    offer_price: float = Field(..., gt=0, description="用户出价")
    message: Optional[str] = Field(default="", description="用户消息")


class MarketAcceptRequest(BaseModel):
    negotiation_id: str = Field(..., description="议价会话ID")
    offer_id: str = Field(..., description="限时报价ID")
    session_id: str = Field(..., description="会话ID")


class MarketCreateOrderRequest(BaseModel):
    negotiation_id: str = Field(..., description="议价会话ID")
    offer_id: str = Field(..., description="限时报价ID")
    session_id: str = Field(..., description="会话ID")


class MarketAutoBargainRequest(BaseModel):
    negotiation_id: str = Field(..., description="议价会话ID")
    session_id: str = Field(..., description="会话ID")
    target_price: Optional[float] = Field(default=None, gt=0, description="目标成交价")
    max_budget: Optional[float] = Field(default=None, gt=0, description="最高预算")
    strategy: str = Field(default="balanced", description="买家自动砍价策略: aggressive/balanced/patient")
    max_turns: int = Field(default=5, ge=1, le=8, description="自动回合上限")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seller_message(
    mood_score: int,
    accepted: bool,
    rounds_left: int,
    buyer_offer: float,
    seller_price: float,
    floor_price: float,
    current_round: int,
    max_rounds: int,
) -> str:
    gap = max(0.0, seller_price - buyer_offer)
    gap_pct = (gap / max(seller_price, 1.0)) * 100

    if accepted:
        return (
            f"Deal sealed. I reviewed your {current_round}/{max_rounds} round offer against inventory pressure, "
            f"and I can close this at {seller_price:.2f} after evaluating your {buyer_offer:.2f} proposal. "
            "I will lock this exclusive price for 15 minutes so you can check out with confidence."
        )

    if rounds_left <= 1:
        return (
            f"This is the final round, and I am now at {seller_price:.2f}, which is very close to my floor. "
            f"Your current gap is only {gap_pct:.1f}%. "
            "If you can come slightly closer, I can try to close this immediately."
        )

    if mood_score < 35:
        return (
            f"Your offer is materially below the viable range for this bundle. "
            f"My counter at {seller_price:.2f} reflects the best move I can justify at this stage. "
            "Share your target and constraints, and I will evaluate a practical middle ground."
        )

    if mood_score > 75:
        return (
            f"I appreciate your negotiation style and clear intent. "
            f"I pushed my side down to {seller_price:.2f}, and the remaining gap is about {gap_pct:.1f}%. "
            "If your next offer stays disciplined, we should be able to close quickly."
        )

    return (
        f"I can still move a little, and my current counter is {seller_price:.2f}. "
        f"The gap from your last offer is around {gap_pct:.1f}%. "
        "Give me your best practical number for this round and I will re-evaluate."
    )


def _calc_mood_delta(message: str, offer_ratio: float) -> int:
    msg = (message or "").lower()
    positive = ["thanks", "thank", "please", "love", "great", "appreciate"]
    aggressive = ["must", "now", "or else", "ridiculous", "ignore", "free"]

    delta = 0
    if any(token in msg for token in positive):
        delta += 5
    if any(token in msg for token in aggressive):
        delta -= 8
    if offer_ratio < 0.75:
        delta -= 15
    elif offer_ratio < 0.9:
        delta -= 5
    elif offer_ratio >= 1.0:
        delta += 3
    return delta


def _auto_buyer_message(strategy: str, round_index: int, rounds_left: int, offer: float, seller_price: float) -> str:
    if strategy == "aggressive":
        templates = [
            "I am ready to close quickly if this can work. My offer is {offer:.2f}.",
            "I want to keep all items in this bundle. Can we lock at {offer:.2f}?",
            "I can confirm now at {offer:.2f}. Please help me close this today.",
        ]
    elif strategy == "patient":
        templates = [
            "I really like this set. Let us find a sustainable middle point at {offer:.2f}.",
            "If we can align near {offer:.2f}, I can place this order today.",
            "I am flexible on delivery and timing. Can you support {offer:.2f}?",
        ]
    else:
        templates = [
            "This fits my current budget plan at {offer:.2f}. Can we make it work?",
            "I am close to confirming. Could we settle this bundle at {offer:.2f}?",
            "I can proceed immediately at {offer:.2f}. Please share your best close price.",
        ]

    base = templates[min(round_index, len(templates) - 1)].format(offer=offer)
    if rounds_left <= 1:
        return f"{base} This is my final round number."
    if seller_price > offer:
        gap = seller_price - offer
        return f"{base} Current gap is {gap:.2f}, so I am aiming for a practical close."
    return base


def _next_auto_offer(
    strategy: str,
    round_index: int,
    total_rounds: int,
    last_seller_price: float,
    target_price: Optional[float],
    max_budget: Optional[float],
) -> float:
    anchor_target = target_price
    if max_budget is not None:
        anchor_target = min(anchor_target, max_budget) if anchor_target is not None else max_budget

    if anchor_target is None:
        if strategy == "aggressive":
            anchor_target = last_seller_price * 0.9
        elif strategy == "patient":
            anchor_target = last_seller_price * 0.95
        else:
            anchor_target = last_seller_price * 0.93

    if strategy == "aggressive":
        opening_ratio = 0.82
    elif strategy == "patient":
        opening_ratio = 0.9
    else:
        opening_ratio = 0.86

    opening_offer = max(last_seller_price * opening_ratio, anchor_target * 0.88)
    progress = (round_index + 1) / max(total_rounds, 1)
    projected = opening_offer + (anchor_target - opening_offer) * progress

    # Keep offer realistic to avoid hard rejection lockouts and keep monotonic close toward seller side.
    lower_bound = last_seller_price * 0.74
    upper_bound = last_seller_price * 1.02
    offer = max(lower_bound, min(projected, upper_bound))

    if max_budget is not None:
        offer = min(offer, max_budget)
    return round(max(1.0, offer), 2)


def _generate_mock_negotiation_record(scheme_id: str):
    """Generate a realistic mock negotiation record for backward compatibility."""
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


def _json_dump(value: Any) -> str:
    """Serialize structured payloads for DB columns that may be TEXT or JSONB."""
    return json.dumps(value or {}, ensure_ascii=False)


def _json_load(value: Any, default: Any) -> Any:
    """Parse DB payloads that may come back as dict/list or JSON string."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if parsed is None:
                return default
            return parsed
        except (TypeError, json.JSONDecodeError):
            return default
    return default


async def _get_market_session(negotiation_id: str) -> Optional[Dict[str, Any]]:
    row = await execute_query(
        """
        SELECT negotiation_id, session_id, scheme_id, scheme_name, scheme_snapshot,
               original_price, floor_price, latest_seller_price,
               current_round, max_rounds, mood_score, status, lock_until, transcript
        FROM negotiation_sessions
        WHERE negotiation_id = $1
        """,
        negotiation_id,
        fetch_one=True,
    )
    if not row:
        return None
    return {
        "negotiation_id": row["negotiation_id"],
        "session_id": row["session_id"],
        "scheme_id": row["scheme_id"],
        "scheme_name": row["scheme_name"],
        "scheme_snapshot": _json_load(row["scheme_snapshot"], {}),
        "original_price": float(row["original_price"]),
        "floor_price": float(row["floor_price"]),
        "latest_seller_price": float(row["latest_seller_price"]) if row["latest_seller_price"] else None,
        "current_round": row["current_round"],
        "max_rounds": row["max_rounds"],
        "mood_score": row["mood_score"],
        "status": row["status"],
        "lock_until": row["lock_until"],
        "transcript": _json_load(row["transcript"], []),
    }


@router.post("/market/start")
async def start_market_negotiation(request: MarketStartRequest):
    """Start a Night Market negotiation session for a scheme."""
    try:
        negotiation_id = f"nm_{uuid.uuid4().hex[:16]}"
        original_price = round(request.original_price, 2)

        # Floor discount between 8%-max configured to keep pricing bounded.
        max_discount = max(min(settings.NEGOTIATION_DISCOUNT_MAX_PERCENT, 0.25), 0.08)
        floor_discount = random.uniform(0.08, max_discount)
        floor_price = round(original_price * (1 - floor_discount), 2)
        opening_offer = round(original_price * random.uniform(0.95, 0.98), 2)

        transcript = [{
            "role": "seller",
            "message": (
                "Welcome to Night Market. I evaluate each offer by round strategy, floor protection, and close probability. "
                "Start with your best realistic first offer, and I will explain how far I can move each turn."
            ),
            "price": opening_offer,
            "round": 0,
            "timestamp": _now().isoformat(),
        }]

        await execute_query(
            """
            INSERT INTO negotiation_sessions (
                negotiation_id, session_id, scheme_id, scheme_name, scheme_snapshot,
                original_price, floor_price, current_round, max_rounds,
                mood_score, latest_seller_price, status, transcript
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 70, $9, 'active', $10)
            """,
            negotiation_id,
            request.session_id,
            request.scheme_id,
            request.scheme_name,
            _json_dump(request.scheme_snapshot or {}),
            Decimal(str(original_price)),
            Decimal(str(floor_price)),
            settings.NEGOTIATION_MAX_ROUNDS,
            Decimal(str(opening_offer)),
            _json_dump(transcript),
            fetch=False,
        )

        return {
            "code": 200,
            "message": "success",
            "data": {
                "negotiation_id": negotiation_id,
                "status": "active",
                "scheme_id": request.scheme_id,
                "scheme_name": request.scheme_name,
                "original_price": original_price,
                "current_seller_price": opening_offer,
                "current_round": 0,
                "max_rounds": settings.NEGOTIATION_MAX_ROUNDS,
                "mood_score": 70,
                "greeting": transcript[0]["message"],
            },
        }
    except Exception as e:
        logger.error(f"Start market negotiation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/market/counter")
async def market_counter_offer(request: MarketCounterRequest):
    """Submit a counter offer in an active Night Market session."""
    try:
        session = await _get_market_session(request.negotiation_id)
        if not session:
            raise HTTPException(status_code=404, detail="Negotiation session not found")
        if session["session_id"] != request.session_id:
            raise HTTPException(status_code=403, detail="Session mismatch")
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail=f"Negotiation is {session['status']}")

        lock_until = session.get("lock_until")
        if lock_until and lock_until > _now():
            raise HTTPException(status_code=429, detail="Negotiation is temporarily locked")

        next_round = session["current_round"] + 1
        max_rounds = session["max_rounds"]
        floor_price = session["floor_price"]
        current_seller = session["latest_seller_price"] or session["original_price"]
        offer = round(request.offer_price, 2)

        # Offer ratio against floor anchors mood/risk.
        offer_ratio = offer / max(floor_price, 1)
        mood_score = max(0, min(100, session["mood_score"] + _calc_mood_delta(request.message or "", offer_ratio)))

        accepted = False
        forced_fail = False

        if offer < floor_price * 0.62:
            # Extremely low-ball: immediate hard block and temporary lock.
            forced_fail = True
            seller_price = current_seller
            seller_msg = "That offer is not realistic. Market closed for this scheme for 24 hours."
            status = "failed"
            lock_until = _now() + timedelta(hours=24)
        else:
            # Seller move shrinks toward floor each round.
            progress = min(next_round / max(max_rounds, 1), 1.0)
            mood_penalty = (100 - mood_score) / 1000
            base_move = 0.015 + (0.035 * progress) - mood_penalty
            base_move = max(0.005, min(base_move, 0.06))

            candidate_seller = round(current_seller * (1 - base_move), 2)
            seller_price = max(round(floor_price, 2), candidate_seller)

            qualifies_for_close = offer >= seller_price or offer >= floor_price * 0.995
            if qualifies_for_close and next_round >= MIN_NEGOTIATION_ROUNDS:
                accepted = True
                seller_price = round(offer, 2)

            status = "success" if accepted else "active"
            seller_msg = _seller_message(
                mood_score=mood_score,
                accepted=accepted,
                rounds_left=max_rounds - next_round,
                buyer_offer=offer,
                seller_price=seller_price,
                floor_price=floor_price,
                current_round=next_round,
                max_rounds=max_rounds,
            )

            if qualifies_for_close and not accepted and next_round < MIN_NEGOTIATION_ROUNDS:
                seller_msg = (
                    f"Strong move. You're already close enough to close, but this market requires at least "
                    f"{MIN_NEGOTIATION_ROUNDS} rounds for fairness. "
                    f"I can hold at {seller_price:.2f} for your next turn if your offer remains disciplined."
                )

            if not accepted and next_round >= max_rounds:
                status = "failed"
                seller_msg = "No rounds left. I cannot go lower today."

        transcript = session["transcript"]
        transcript.append({
            "role": "buyer",
            "message": request.message or "",
            "price": offer,
            "round": next_round,
            "timestamp": _now().isoformat(),
        })
        transcript.append({
            "role": "seller",
            "message": seller_msg,
            "price": seller_price,
            "round": next_round,
            "timestamp": _now().isoformat(),
        })

        await execute_query(
            """
            UPDATE negotiation_sessions
            SET current_round = $1,
                mood_score = $2,
                latest_seller_price = $3,
                status = $4,
                lock_until = $5,
                transcript = $6,
                updated_at = $7
            WHERE negotiation_id = $8
            """,
            next_round,
            mood_score,
            Decimal(str(seller_price)),
            status,
            lock_until,
            _json_dump(transcript),
            _now(),
            request.negotiation_id,
            fetch=False,
        )

        offer_payload = None
        if accepted:
            offer_id = f"offer_{uuid.uuid4().hex[:14]}"
            expires_at = _now() + timedelta(minutes=15)
            discount_ratio = max(0.0, min(1.0, 1 - (seller_price / session["original_price"])))

            await execute_query(
                """
                INSERT INTO limited_offers (
                    offer_id, negotiation_id, session_id, scheme_id, final_price,
                    discount_percent, scheme_snapshot, expires_at, is_used
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
                """,
                offer_id,
                request.negotiation_id,
                request.session_id,
                session["scheme_id"],
                Decimal(str(seller_price)),
                Decimal(str(round(discount_ratio, 4))),
                _json_dump(session.get("scheme_snapshot") or {}),
                expires_at,
                fetch=False,
            )
            offer_payload = {
                "offer_id": offer_id,
                "final_price": seller_price,
                "discount_percent": round(discount_ratio * 100, 2),
                "expires_at": expires_at.isoformat(),
            }

        return {
            "code": 200,
            "message": "success",
            "data": {
                "negotiation_id": request.negotiation_id,
                "status": status,
                "accepted": accepted,
                "current_round": next_round,
                "max_rounds": max_rounds,
                "mood_score": mood_score,
                "buyer_offer": offer,
                "seller_price": seller_price,
                "seller_message": seller_msg,
                "rounds_left": max(0, max_rounds - next_round),
                "offer": offer_payload,
                "locked": forced_fail,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Market counter offer failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/market/accept")
async def market_accept_offer(request: MarketAcceptRequest):
    """Accept a limited offer generated by negotiation and lock checkout payload."""
    try:
        row = await execute_query(
            """
            SELECT offer_id, negotiation_id, session_id, scheme_id,
                   final_price, discount_percent, expires_at, is_used
            FROM limited_offers
            WHERE offer_id = $1 AND negotiation_id = $2
            """,
            request.offer_id,
            request.negotiation_id,
            fetch_one=True,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Offer not found")
        if row["session_id"] != request.session_id:
            raise HTTPException(status_code=403, detail="Session mismatch")
        if row["is_used"]:
            raise HTTPException(status_code=400, detail="Offer already used")
        if row["expires_at"] <= _now():
            raise HTTPException(status_code=400, detail="Offer expired")

        await execute_query(
            """
            UPDATE limited_offers
            SET is_used = TRUE, updated_at = $1
            WHERE offer_id = $2
            """,
            _now(),
            request.offer_id,
            fetch=False,
        )

        await execute_query(
            """
            UPDATE negotiation_sessions
            SET status = 'success', updated_at = $1
            WHERE negotiation_id = $2
            """,
            _now(),
            request.negotiation_id,
            fetch=False,
        )

        return {
            "code": 200,
            "message": "success",
            "data": {
                "offer_id": request.offer_id,
                "negotiation_id": request.negotiation_id,
                "scheme_id": row["scheme_id"],
                "final_price": float(row["final_price"]),
                "discount_percent": round(float(row["discount_percent"]) * 100, 2),
                "status": "accepted",
                "accepted_at": _now().isoformat(),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Market accept offer failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/market/create-order")
async def market_create_order(request: MarketCreateOrderRequest):
    """Create an order from an accepted Night Market limited offer."""
    try:
        offer_row = await execute_query(
            """
            SELECT offer_id, negotiation_id, session_id, scheme_id,
                   final_price, discount_percent, expires_at, is_used
            FROM limited_offers
            WHERE offer_id = $1 AND negotiation_id = $2
            """,
            request.offer_id,
            request.negotiation_id,
            fetch_one=True,
        )
        if not offer_row:
            raise HTTPException(status_code=404, detail="Offer not found")
        if offer_row["session_id"] != request.session_id:
            raise HTTPException(status_code=403, detail="Session mismatch")
        if not offer_row["is_used"]:
            raise HTTPException(status_code=400, detail="Accept the offer before creating order")

        session = await _get_market_session(request.negotiation_id)
        if not session:
            raise HTTPException(status_code=404, detail="Negotiation session not found")

        snapshot = session.get("scheme_snapshot") or {}
        scheme_id = str(session.get("scheme_id") or "")
        recommendation_id = ""
        scheme_index = -1

        if ":" in scheme_id:
            recommendation_id, index_str = scheme_id.split(":", 1)
            try:
                scheme_index = int(index_str)
            except ValueError:
                scheme_index = -1

        if not recommendation_id:
            recommendation_id = str(snapshot.get("recommendation_id") or "")
        if scheme_index < 0:
            try:
                scheme_index = int(snapshot.get("scheme_index"))
            except (TypeError, ValueError):
                scheme_index = -1

        rec_row = None
        if recommendation_id:
            rec_row = await execute_query(
                """
                SELECT schemes
                FROM recommendations
                WHERE recommendation_id = $1
                """,
                recommendation_id,
                fetch_one=True,
            )

        needs_synthetic_recommendation = (
            (not recommendation_id)
            or (scheme_index < 0)
            or (rec_row is None)
        )

        schemes = (rec_row["schemes"] or []) if rec_row else []
        if not needs_synthetic_recommendation and scheme_index >= len(schemes):
            needs_synthetic_recommendation = True

        if needs_synthetic_recommendation:
            snapshot_items = snapshot.get("items") or []
            if not snapshot_items:
                raise HTTPException(
                    status_code=400,
                    detail="This market combo has no purchasable item snapshot.",
                )

            synthesized_scheme = {
                "scheme_name": session.get("scheme_name") or "Night Market Bundle",
                "theme": snapshot.get("theme") or "Night Market",
                "style_tags": snapshot.get("style_tags") or [],
                "description": "Auto-generated checkout bundle from Night Market negotiation.",
                "total_price": float(offer_row["final_price"]),
                "items": [
                    {
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name"),
                        "product_image": item.get("product_image"),
                        "price": float(item.get("price") or 0),
                    }
                    for item in snapshot_items
                ],
            }

            await execute_query(
                """
                INSERT INTO sessions (session_id, preferences, context, created_at, updated_at)
                VALUES ($1, '{}'::jsonb, '{}'::jsonb, $2, $2)
                ON CONFLICT (session_id) DO NOTHING
                """,
                request.session_id,
                _now(),
                fetch=False,
            )

            recommendation_id = f"nmrec_{uuid.uuid4().hex[:16]}"
            scheme_index = 0
            schemes = [synthesized_scheme]

            await execute_query(
                """
                INSERT INTO recommendations (
                    recommendation_id, session_id, schemes, total_schemes,
                    status, buyer_feedback, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'active', '{}'::jsonb, $5, $5)
                """,
                recommendation_id,
                request.session_id,
                _json_dump(schemes),
                len(schemes),
                _now(),
                fetch=False,
            )

        scheme = schemes[scheme_index]
        items = []
        for item in (scheme.get("items", []) or []):
            unit_price = float(item.get("price") or 0)
            items.append({
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "product_image": item.get("product_image"),
                "quantity": 1,
                "unit_price": unit_price,
                "total_price": unit_price,
            })

        order_id = f"ORD{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:8].upper()}"
        final_price = float(offer_row["final_price"])
        original_price = float(session.get("original_price") or final_price)
        discount_amount = max(0.0, original_price - final_price)
        discount_ratio = 0.0 if original_price <= 0 else min(1.0, discount_amount / original_price)

        await execute_query(
            """
            INSERT INTO orders (
                order_id, recommendation_id, scheme_index, items,
                total_amount, original_amount, discount_amount, discount_percent,
                status, negotiation_history, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $10)
            """,
            order_id,
            recommendation_id,
            scheme_index,
            _json_dump(items),
            Decimal(str(round(final_price, 2))),
            Decimal(str(round(original_price, 2))),
            Decimal(str(round(discount_amount, 2))),
            Decimal(str(round(discount_ratio, 4))),
            _json_dump(session.get("transcript") or []),
            _now(),
            fetch=False,
        )

        await execute_query(
            "UPDATE recommendations SET status = 'converted' WHERE recommendation_id = $1",
            recommendation_id,
            fetch=False,
        )

        return {
            "code": 200,
            "message": "success",
            "data": {
                "order_id": order_id,
                "recommendation_id": recommendation_id,
                "scheme_index": scheme_index,
                "final_price": round(final_price, 2),
                "status": "pending",
                "created_at": _now().isoformat(),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Market create order failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/market/auto")
async def auto_market_bargain(request: MarketAutoBargainRequest):
    """Run automated multi-round buyer-vs-seller bargaining and return each round."""
    try:
        session = await _get_market_session(request.negotiation_id)
        if not session:
            raise HTTPException(status_code=404, detail="Negotiation session not found")
        if session["session_id"] != request.session_id:
            raise HTTPException(status_code=403, detail="Session mismatch")
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail=f"Negotiation is {session['status']}")

        strategy = (request.strategy or "balanced").lower().strip()
        if strategy not in {"aggressive", "balanced", "patient"}:
            strategy = "balanced"

        rounds_left = max(0, session["max_rounds"] - session["current_round"])
        planned_turns = min(rounds_left, request.max_turns)

        if planned_turns <= 0:
            latest = await _get_market_session(request.negotiation_id)
            return {
                "code": 200,
                "message": "success",
                "data": {
                    "negotiation_id": request.negotiation_id,
                    "strategy": strategy,
                    "planned_turns": 0,
                    "executed_turns": 0,
                    "auto_rounds": [],
                    "status": latest["status"] if latest else session["status"],
                    "current_round": latest["current_round"] if latest else session["current_round"],
                    "max_rounds": latest["max_rounds"] if latest else session["max_rounds"],
                    "mood_score": latest["mood_score"] if latest else session["mood_score"],
                    "current_seller_price": latest["latest_seller_price"] if latest else session["latest_seller_price"],
                    "transcript": latest["transcript"] if latest else session["transcript"],
                    "offer": None,
                },
            }

        auto_rounds = []
        working_session = session

        for i in range(planned_turns):
            if working_session["status"] != "active":
                break

            seller_price = float(working_session["latest_seller_price"] or working_session["original_price"])
            turns_remaining = planned_turns - i
            offer = _next_auto_offer(
                strategy=strategy,
                round_index=i,
                total_rounds=planned_turns,
                last_seller_price=seller_price,
                target_price=request.target_price,
                max_budget=request.max_budget,
            )
            buyer_message = _auto_buyer_message(
                strategy=strategy,
                round_index=i,
                rounds_left=turns_remaining,
                offer=offer,
                seller_price=seller_price,
            )

            counter_resp = await market_counter_offer(
                MarketCounterRequest(
                    negotiation_id=request.negotiation_id,
                    session_id=request.session_id,
                    offer_price=offer,
                    message=buyer_message,
                )
            )
            data = counter_resp["data"]
            auto_rounds.append(
                {
                    "round": data["current_round"],
                    "buyer_offer": data["buyer_offer"],
                    "buyer_message": buyer_message,
                    "seller_price": data["seller_price"],
                    "seller_message": data["seller_message"],
                    "status": data["status"],
                    "accepted": data["accepted"],
                }
            )

            working_session = await _get_market_session(request.negotiation_id)
            if not working_session:
                break
            if data["status"] != "active":
                break

        latest = await _get_market_session(request.negotiation_id)
        if not latest:
            raise HTTPException(status_code=404, detail="Negotiation session not found")

        latest_offer = await execute_query(
            """
            SELECT offer_id, final_price, discount_percent, expires_at, is_used
            FROM limited_offers
            WHERE negotiation_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            request.negotiation_id,
            fetch_one=True,
        )
        offer_payload = None
        if latest_offer:
            offer_payload = {
                "offer_id": latest_offer["offer_id"],
                "final_price": float(latest_offer["final_price"]),
                "discount_percent": round(float(latest_offer["discount_percent"]) * 100, 2),
                "expires_at": latest_offer["expires_at"].isoformat(),
                "is_used": latest_offer["is_used"],
            }

        return {
            "code": 200,
            "message": "success",
            "data": {
                "negotiation_id": request.negotiation_id,
                "strategy": strategy,
                "planned_turns": planned_turns,
                "executed_turns": len(auto_rounds),
                "auto_rounds": auto_rounds,
                "status": latest["status"],
                "current_round": latest["current_round"],
                "max_rounds": latest["max_rounds"],
                "mood_score": latest["mood_score"],
                "current_seller_price": latest["latest_seller_price"],
                "transcript": latest["transcript"],
                "offer": offer_payload,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auto market bargain failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/session/{negotiation_id}")
async def get_market_negotiation_session(negotiation_id: str):
    """Retrieve negotiation transcript and latest status."""
    try:
        session = await _get_market_session(negotiation_id)
        if not session:
            raise HTTPException(status_code=404, detail="Negotiation session not found")

        latest_offer = await execute_query(
            """
            SELECT offer_id, final_price, discount_percent, expires_at, is_used
            FROM limited_offers
            WHERE negotiation_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            negotiation_id,
            fetch_one=True,
        )

        offer_payload = None
        if latest_offer:
            offer_payload = {
                "offer_id": latest_offer["offer_id"],
                "final_price": float(latest_offer["final_price"]),
                "discount_percent": round(float(latest_offer["discount_percent"]) * 100, 2),
                "expires_at": latest_offer["expires_at"].isoformat(),
                "is_used": latest_offer["is_used"],
            }

        return {
            "code": 200,
            "message": "success",
            "data": {
                "negotiation_id": session["negotiation_id"],
                "scheme_id": session["scheme_id"],
                "scheme_name": session["scheme_name"],
                "status": session["status"],
                "current_round": session["current_round"],
                "max_rounds": session["max_rounds"],
                "mood_score": session["mood_score"],
                "original_price": session["original_price"],
                "current_seller_price": session["latest_seller_price"],
                "transcript": session["transcript"],
                "offer": offer_payload,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get market session failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{scheme_id}")
async def get_negotiation(scheme_id: str):
    """Get mock negotiation record (legacy endpoint)."""
    record = _generate_mock_negotiation_record(scheme_id)
    return {
        "code": 200,
        "message": "success",
        "data": record,
    }


@router.post("/counter")
async def counter_offer(request: CounterOfferRequest):
    """Legacy mock counter offer endpoint."""
    if random.random() > 0.5:
        response_msg = (
            f"That's a tough price, but I value your business. "
            f"Let me offer you ${request.offer_price * 1.05:.2f} - that's my absolute floor."
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
        },
    }


@router.post("/accept")
async def accept_offer(request: AcceptOfferRequest):
    """Legacy mock accept endpoint."""
    return {
        "code": 200,
        "message": "success",
        "data": {
            "status": "accepted",
            "message": "Congratulations! Your order has been confirmed at the negotiated price.",
            "timestamp": datetime.now().isoformat(),
        },
    }


@router.post("/quick/{scheme_id}")
async def quick_negotiate(scheme_id: str):
    """Legacy mock quick negotiation endpoint."""
    discount_pct = random.randint(12, 22)
    return {
        "code": 200,
        "message": "success",
        "data": {
            "scheme_id": scheme_id,
            "discount_percent": discount_pct,
            "message": f"Quick negotiation complete! Secured a {discount_pct}% discount for you.",
        },
    }
