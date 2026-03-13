"""Seller workspace service."""

import re
import uuid
from collections import Counter
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from app.core.database import execute_query
from app.models.seller import (
    SellerAgentStrategy,
    SellerInsightSummary,
    SellerProductCreate,
    SellerProductUpdate,
    SellerSandboxRequest,
    SellerSandboxResponse,
)


def _json_safe(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=True)


def _parse_json(value: Any, default: Any) -> Any:
    import json

    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return default if parsed is None else parsed
        except json.JSONDecodeError:
            return default
    return default


class SellerService:
    @staticmethod
    def _resolve_persona(buyer_persona: str, buyer_message: str, offer_ratio: float) -> str:
        if buyer_persona != "auto":
            return buyer_persona
        message = buyer_message.lower()
        if any(token in message for token in ["best price", "discount", "cheap", "deal"]) or offer_ratio <= 0.84:
            return "bargain_hunter"
        if any(token in message for token in ["premium", "quality", "fast", "today", "now"]):
            return "premium_decider"
        return "hesitant_planner"

    @staticmethod
    def _build_counter_price(style: str, min_allowed: float, list_price: float, offer_price: float) -> float:
        if style == "quick_close":
            return round(max(min_allowed, min(list_price, offer_price + list_price * 0.01)), 2)
        if style == "hard_bargain":
            return round(max(min_allowed, list_price * 0.95), 2)
        if style == "value_bundle":
            return round(max(min_allowed, list_price * 0.93), 2)
        return round(max(min_allowed, list_price * 0.91), 2)

    @staticmethod
    def _predict_win_probability(
        accepted: bool,
        offer_ratio: float,
        counter_ratio: float,
        round_index: int,
        persona: str,
        style: str,
    ) -> float:
        score = 0.45
        if accepted:
            score += 0.32
        score += max(-0.12, min(0.18, (offer_ratio - 0.85) * 0.8))
        score += max(-0.08, min(0.1, (0.95 - counter_ratio) * 0.7))
        score -= max(0, round_index - 2) * 0.04

        persona_bias = {
            "bargain_hunter": -0.04,
            "premium_decider": 0.05,
            "hesitant_planner": -0.01,
        }
        style_bias = {
            "quick_close": 0.05,
            "balanced": 0.03,
            "hard_bargain": -0.04,
            "value_bundle": 0.02,
        }
        score += persona_bias.get(persona, 0.0)
        score += style_bias.get(style, 0.0)
        return max(0.05, min(0.98, round(score, 4)))

    @staticmethod
    def _predict_bundle_probability(persona: str, accepted: bool, style: str) -> float:
        base = 0.28 if accepted else 0.16
        persona_bonus = {
            "bargain_hunter": -0.07,
            "premium_decider": 0.14,
            "hesitant_planner": 0.03,
        }
        style_bonus = {
            "quick_close": 0.02,
            "balanced": 0.03,
            "hard_bargain": -0.02,
            "value_bundle": 0.08,
        }
        return max(0.05, min(0.85, base + persona_bonus.get(persona, 0.0) + style_bonus.get(style, 0.0)))

    @staticmethod
    def _alternative_style(primary_style: str) -> Tuple[str, str]:
        if primary_style == "hard_bargain":
            return "balanced", "Softer acceptance path with lower churn risk"
        if primary_style == "value_bundle":
            return "quick_close", "Fast close path with less negotiation drag"
        return "hard_bargain", "Tighter margin defense with higher drop-off risk"

    async def list_products(self, seller_id: str) -> List[Dict[str, Any]]:
        rows = await execute_query(
            """
            SELECT product_id, seller_id, title, category, list_price, floor_price,
                   currency, inventory, highlights, description, image_urls,
                   is_active, created_at, updated_at
            FROM seller_workspace_products
            WHERE seller_id = $1
            ORDER BY updated_at DESC
            """,
            seller_id,
        )
        return [self._row_to_product(row) for row in rows]

    async def create_product(self, seller_id: str, payload: SellerProductCreate) -> Dict[str, Any]:
        product_id = f"sp_{uuid.uuid4().hex[:12]}"
        now = datetime.utcnow()
        await execute_query(
            """
            INSERT INTO seller_workspace_products (
                product_id, seller_id, title, category, list_price, floor_price,
                currency, inventory, highlights, description, image_urls,
                is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, TRUE, $12, $12)
            """,
            product_id,
            seller_id,
            payload.title,
            payload.category,
            Decimal(str(payload.list_price)),
            Decimal(str(payload.floor_price)),
            payload.currency.upper(),
            payload.inventory,
            _json_safe(payload.highlights),
            payload.description,
            _json_safe(payload.image_urls),
            now,
            fetch=False,
        )

        row = await execute_query(
            "SELECT * FROM seller_workspace_products WHERE product_id = $1",
            product_id,
            fetch_one=True,
        )
        return self._row_to_product(row)

    async def update_product(self, seller_id: str, product_id: str, payload: SellerProductUpdate) -> Optional[Dict[str, Any]]:
        existing = await execute_query(
            "SELECT * FROM seller_workspace_products WHERE seller_id = $1 AND product_id = $2",
            seller_id,
            product_id,
            fetch_one=True,
        )
        if not existing:
            return None

        updates = payload.model_dump(exclude_none=True)
        merged = {
            "title": updates.get("title", existing["title"]),
            "category": updates.get("category", existing["category"]),
            "list_price": updates.get("list_price", float(existing["list_price"])),
            "floor_price": updates.get("floor_price", float(existing["floor_price"])),
            "currency": updates.get("currency", existing["currency"]),
            "inventory": updates.get("inventory", existing["inventory"]),
            "highlights": updates.get("highlights", _parse_json(existing["highlights"], [])),
            "description": updates.get("description", existing["description"]),
            "image_urls": updates.get("image_urls", _parse_json(existing["image_urls"], [])),
        }

        await execute_query(
            """
            UPDATE seller_workspace_products
            SET title = $3,
                category = $4,
                list_price = $5,
                floor_price = $6,
                currency = $7,
                inventory = $8,
                highlights = $9::jsonb,
                description = $10,
                image_urls = $11::jsonb,
                updated_at = $12
            WHERE seller_id = $1 AND product_id = $2
            """,
            seller_id,
            product_id,
            merged["title"],
            merged["category"],
            Decimal(str(merged["list_price"])),
            Decimal(str(merged["floor_price"])),
            str(merged["currency"]).upper(),
            merged["inventory"],
            _json_safe(merged["highlights"]),
            merged["description"],
            _json_safe(merged["image_urls"]),
            datetime.utcnow(),
            fetch=False,
        )

        row = await execute_query(
            "SELECT * FROM seller_workspace_products WHERE product_id = $1",
            product_id,
            fetch_one=True,
        )
        return self._row_to_product(row)

    async def get_or_create_strategy(self, seller_id: str) -> Dict[str, Any]:
        row = await execute_query(
            "SELECT * FROM seller_agent_strategies WHERE seller_id = $1",
            seller_id,
            fetch_one=True,
        )
        if row:
            return self._row_to_strategy(row)

        default = SellerAgentStrategy(seller_id=seller_id)
        await self.upsert_strategy(seller_id, default)
        return default.model_dump()

    async def upsert_strategy(self, seller_id: str, strategy: SellerAgentStrategy) -> Dict[str, Any]:
        now = datetime.utcnow()
        await execute_query(
            """
            INSERT INTO seller_agent_strategies (
                seller_id, persona_name, tone, opening_style, negotiation_style,
                anchor_ratio, max_auto_discount_ratio, upsell_rule,
                forbidden_promises, custom_prompt, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
            ON CONFLICT (seller_id)
            DO UPDATE SET
                persona_name = EXCLUDED.persona_name,
                tone = EXCLUDED.tone,
                opening_style = EXCLUDED.opening_style,
                negotiation_style = EXCLUDED.negotiation_style,
                anchor_ratio = EXCLUDED.anchor_ratio,
                max_auto_discount_ratio = EXCLUDED.max_auto_discount_ratio,
                upsell_rule = EXCLUDED.upsell_rule,
                forbidden_promises = EXCLUDED.forbidden_promises,
                custom_prompt = EXCLUDED.custom_prompt,
                updated_at = EXCLUDED.updated_at
            """,
            seller_id,
            strategy.persona_name,
            strategy.tone,
            strategy.opening_style,
            strategy.negotiation_style,
            Decimal(str(strategy.anchor_ratio)),
            Decimal(str(strategy.max_auto_discount_ratio)),
            strategy.upsell_rule,
            _json_safe(strategy.forbidden_promises),
            strategy.custom_prompt,
            now,
            fetch=False,
        )

        row = await execute_query(
            "SELECT * FROM seller_agent_strategies WHERE seller_id = $1",
            seller_id,
            fetch_one=True,
        )
        return self._row_to_strategy(row)

    async def simulate(self, payload: SellerSandboxRequest) -> SellerSandboxResponse:
        product = await execute_query(
            "SELECT * FROM seller_workspace_products WHERE seller_id = $1 AND product_id = $2",
            payload.seller_id,
            payload.product_id,
            fetch_one=True,
        )
        if not product:
            raise ValueError("Product not found for this seller")

        strategy = await self.get_or_create_strategy(payload.seller_id)
        style = strategy["negotiation_style"]
        list_price = float(product["list_price"])
        floor_price = float(product["floor_price"])
        offer_price = payload.buyer_offer_price or list_price * 0.9
        offer_ratio = offer_price / max(list_price, 1e-6)
        persona = self._resolve_persona(payload.buyer_persona, payload.buyer_message, offer_ratio)

        min_allowed = max(floor_price, list_price * (1 - float(strategy["max_auto_discount_ratio"])))
        accepted = offer_price >= min_allowed

        if accepted:
            counter_price = round(max(offer_price, min_allowed), 2)
            reply = (
                f"Great offer. I can close this at {counter_price:.2f} {product['currency']} and lock it for today. "
                "Would you like me to add the matching accessory bundle as well?"
            )
            tip = "Strong close: accepted within your guardrails and used a soft upsell."
            optimization_tip = "Add a tiny hesitation phrase (e.g. manager check) to make the buyer feel they won the deal."
            quick_action_label = "Save soft upsell as default rule"
            quick_action_code = "append_upsell_rule"
            quick_action_patch = {
                "upsell_rule_append": "Always add a matching accessory bundle when the buyer offer is accepted.",
            }
        else:
            counter_price = self._build_counter_price(style, min_allowed, list_price, offer_price)

            reply = (
                f"I cannot go as low as {offer_price:.2f}, but I can do {counter_price:.2f} {product['currency']} "
                "with quality assurance and priority handling."
            )
            tip = "Countered above floor price; consider adding reason-based concessions in round 2."
            optimization_tip = "If buyer intent weakens, offer a time-boxed bundle perk instead of extra direct discount."
            quick_action_label = "Enable time-boxed urgency line"
            quick_action_code = "add_urgency_prompt"
            quick_action_patch = {
                "custom_prompt_append": "When conceding price, use a short time-boxed urgency line (e.g. valid today).",
            }

        discount_ratio = max(0.0, min(1.0, 1 - (counter_price / max(list_price, 1e-6))))
        counter_ratio = counter_price / max(list_price, 1e-6)
        win_probability = self._predict_win_probability(
            accepted=accepted,
            offer_ratio=offer_ratio,
            counter_ratio=counter_ratio,
            round_index=payload.round_index,
            persona=persona,
            style=style,
        )
        bundle_probability = self._predict_bundle_probability(persona, accepted, style)
        predicted_cart_value = round(counter_price + (list_price * 0.15 * bundle_probability), 2)
        guardrail_buffer = round(max(0.0, counter_price - min_allowed), 2)

        alt_style, alt_risk_note = self._alternative_style(style)
        alt_counter = self._build_counter_price(alt_style, min_allowed, list_price, offer_price)
        alt_accepted = offer_price >= alt_counter
        alternative_reply = (
            f"Alternative path ({alt_style}): I can do {alt_counter:.2f} {product['currency']} "
            "if we confirm checkout today."
        )
        alternative_win_probability = self._predict_win_probability(
            accepted=alt_accepted,
            offer_ratio=offer_ratio,
            counter_ratio=alt_counter / max(list_price, 1e-6),
            round_index=payload.round_index,
            persona=persona,
            style=alt_style,
        )

        rejection_reason = "price_too_low" if not accepted else "accepted"
        await execute_query(
            """
            INSERT INTO seller_sandbox_runs (
                run_id, seller_id, product_id, buyer_message, buyer_offer_price,
                counter_price, accepted, discount_ratio, rejection_reason,
                coaching_tip, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            f"sim_{uuid.uuid4().hex[:12]}",
            payload.seller_id,
            payload.product_id,
            payload.buyer_message,
            Decimal(str(offer_price)),
            Decimal(str(counter_price)),
            accepted,
            Decimal(str(discount_ratio)),
            rejection_reason,
            tip,
            datetime.utcnow(),
            fetch=False,
        )

        return SellerSandboxResponse(
            accepted=accepted,
            seller_reply=reply,
            counter_price=counter_price,
            discount_ratio=discount_ratio,
            coaching_tip=tip,
            buyer_persona=persona,
            strategy_used=style,
            win_probability=win_probability,
            predicted_cart_value=predicted_cart_value,
            guardrail_buffer=guardrail_buffer,
            alternative_strategy=alt_style,
            alternative_reply=alternative_reply,
            alternative_win_probability=alternative_win_probability,
            alternative_risk_note=alt_risk_note,
            optimization_tip=optimization_tip,
            quick_action_label=quick_action_label,
            quick_action_code=quick_action_code,
            quick_action_patch=quick_action_patch,
        )

    async def get_insights(self, seller_id: str) -> SellerInsightSummary:
        product_stats = await execute_query(
            """
            SELECT
                COUNT(*) AS total_products,
                COUNT(*) FILTER (WHERE is_active = TRUE) AS active_products,
                AVG(CASE WHEN list_price > 0 THEN (list_price - floor_price) / list_price ELSE 0 END) AS avg_margin_ratio
            FROM seller_workspace_products
            WHERE seller_id = $1
            """,
            seller_id,
            fetch_one=True,
        )

        run_rows = await execute_query(
            """
            SELECT accepted, rejection_reason
            FROM seller_sandbox_runs
            WHERE seller_id = $1
            ORDER BY created_at DESC
            LIMIT 200
            """,
            seller_id,
        )

        runs = len(run_rows)
        accepted_runs = sum(1 for row in run_rows if row["accepted"])
        acceptance_rate = (accepted_runs / runs) if runs else 0.0
        reasons = Counter([str(row["rejection_reason"] or "n/a") for row in run_rows if not row["accepted"]])
        top_reason = reasons.most_common(1)[0][0] if reasons else "n/a"

        strategy = await self.get_or_create_strategy(seller_id)
        has_guardrails = len(strategy.get("forbidden_promises", [])) > 0
        strategy_health = "Good" if has_guardrails and strategy.get("max_auto_discount_ratio", 0) <= 0.2 else "Needs tuning"

        return SellerInsightSummary(
            seller_id=seller_id,
            total_products=int(product_stats["total_products"] or 0),
            active_products=int(product_stats["active_products"] or 0),
            avg_margin_ratio=float(product_stats["avg_margin_ratio"] or 0.0),
            strategy_health=strategy_health,
            sandbox_runs=runs,
            acceptance_rate=acceptance_rate,
            top_rejection_reason=top_reason,
        )

    def parse_bulk_products(self, raw_text: str) -> Dict[str, Any]:
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        products: List[SellerProductCreate] = []
        warnings: List[str] = []

        for idx, line in enumerate(lines, start=1):
            # Format: title | category | list_price | floor_price | inventory | highlights(optional comma-separated)
            parts = [chunk.strip() for chunk in line.split("|")]
            if len(parts) < 5:
                warnings.append(f"Line {idx}: expected at least 5 fields separated by '|'.")
                continue

            try:
                highlights = []
                if len(parts) >= 6 and parts[5]:
                    highlights = [h.strip() for h in re.split(r",|;", parts[5]) if h.strip()]

                parsed = SellerProductCreate(
                    title=parts[0],
                    category=parts[1],
                    list_price=float(parts[2]),
                    floor_price=float(parts[3]),
                    inventory=int(parts[4]),
                    highlights=highlights,
                )
                products.append(parsed)
            except Exception as exc:
                warnings.append(f"Line {idx}: parse failed ({exc}).")

        return {
            "parsed_products": [item.model_dump() for item in products],
            "warnings": warnings,
        }

    @staticmethod
    def _row_to_product(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "product_id": row["product_id"],
            "seller_id": row["seller_id"],
            "title": row["title"],
            "category": row["category"],
            "list_price": float(row["list_price"]),
            "floor_price": float(row["floor_price"]),
            "currency": row["currency"],
            "inventory": row["inventory"],
            "highlights": _parse_json(row["highlights"], []),
            "description": row["description"],
            "image_urls": _parse_json(row["image_urls"], []),
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _row_to_strategy(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "seller_id": row["seller_id"],
            "persona_name": row["persona_name"],
            "tone": row["tone"],
            "opening_style": row["opening_style"],
            "negotiation_style": row["negotiation_style"],
            "anchor_ratio": float(row["anchor_ratio"]),
            "max_auto_discount_ratio": float(row["max_auto_discount_ratio"]),
            "upsell_rule": row["upsell_rule"],
            "forbidden_promises": _parse_json(row["forbidden_promises"], []),
            "custom_prompt": row["custom_prompt"],
            "updated_at": row["updated_at"],
        }
