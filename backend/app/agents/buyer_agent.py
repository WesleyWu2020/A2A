"""
买家 Agent
负责需求理解、商品搜索、方案推荐
"""
import json
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.core.config import settings
from app.core.redis import cache
from app.core.llm_client import get_llm_client, LLMClient
from app.agents.orchestrator import AgentState, TaskType, AgentRole
from app.agents.timeline import log_agent_activity

logger = logging.getLogger(__name__)


class BuyerAgent:
    """买家 Agent - 负责理解用户需求并推荐方案"""
    
    def __init__(self):
        self.llm: LLMClient = get_llm_client()

    # Keywords used to detect bundle/set-like products in either Chinese or English titles.
    BUNDLE_KEYWORDS = (
        "set", "bundle", "combo", "package", "kit",
        "套装", "组合", "套餐", "全套"
    )
    TITLE_STOPWORDS = {
        "the", "and", "with", "for", "from", "room", "home",
        "modern", "style", "living", "piece", "pieces"
    }
    
    async def understand_needs(self, state: AgentState) -> AgentState:
        """理解用户需求"""
        session_id = state["session_id"]
        messages = state["messages"]
        
        try:
            # Emit a start event immediately so the frontend can advance from initial 10%.
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.BUYER,
                activity_type="understand_needs",
                content={
                    "phase": "start",
                    "message": "Parsing your requirements and constraints..."
                }
            )

            # 构建提示
            system_prompt = """You are a professional home furnishing consultant. Your task is to understand the user's needs and extract key information.

Analyze the user's input and extract the following information (return as JSON):
{
    "intent": "user intent (greeting/query_product/need_recommendation/provide_preference/negotiate_price/confirm_order/reject/clarify/other)",
    "room_type": "room type",
    "style_preference": ["list of style preferences"],
    "color_preference": ["list of color preferences"],
    "material_preference": ["list of material preferences"],
    "budget_range": {"min": budget_min, "max": budget_max},
    "room_size": "room size description",
    "key_requirements": ["list of key requirements"],
    "questions_to_ask": ["questions to clarify with the user"],
    "confidence": "information completeness (high/medium/low)"
}

If information is incomplete, list clarifying questions in questions_to_ask. Always respond in English."""

            # 获取最近的消息 (支持 dict 或 LangChain Message 对象)
            recent_messages = messages[-5:] if len(messages) > 5 else messages
            def _msg_role(m):
                if isinstance(m, dict): return m.get('role', 'user')
                return 'user' if getattr(m, 'type', '') == 'human' else 'assistant'
            def _msg_content(m):
                if isinstance(m, dict): return m.get('content', '')
                return getattr(m, 'content', '')
            user_input = "\n".join([
                f"{'User' if _msg_role(m) == 'user' else 'Assistant'}: {_msg_content(m)}"
                for m in recent_messages
            ])

            content = await self.llm.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Conversation history:\n{user_input}\n\nPlease analyze the user's needs."}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            # 解析 JSON 响应
            try:
                # 尝试提取 JSON 部分
                if "```json" in content:
                    json_str = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    json_str = content.split("```")[1].split("```")[0].strip()
                else:
                    json_str = content
                
                extracted = json.loads(json_str)
            except json.JSONDecodeError:
                extracted = {
                    "intent": "clarify",
                    "key_requirements": [],
                    "questions_to_ask": ["Could you describe your needs in more detail?"],
                    "confidence": "low"
                }
            
            # 更新状态
            state["extracted_requirements"] = extracted
            state["user_preferences"].update({
                k: v for k, v in extracted.items()
                if k not in ["intent", "confidence", "questions_to_ask"] and v
            })
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.BUYER,
                activity_type="understand_needs",
                content={
                    "phase": "completed",
                    "intent": extracted.get("intent"),
                    "confidence": extracted.get("confidence"),
                    "requirements": extracted
                }
            )
            
            logger.info(f"Buyer agent understood needs for session {session_id}: {extracted.get('intent')}")
            
        except Exception as e:
            logger.error(f"Buyer agent failed to understand needs: {e}")
            state["errors"].append(f"understand_needs: {str(e)}")
        
        state["updated_at"] = datetime.now()
        return state
    
    # DB vocabulary — map free-text terms from LLM to actual DB values
    STYLE_MAP = {
        'modern': 'modern', 'contemporary': 'modern', 'minimalist': 'modern',
        'scandinavian': 'modern', 'nordic': 'modern',
        'industrial': 'industrial', 'loft': 'industrial', 'vintage': 'industrial',
        'rustic': 'industrial',
        'traditional': 'traditional', 'classic': 'traditional', 'elegant': 'traditional',
        'mid-century': 'mid_century', 'mid century': 'mid_century', 'retro': 'mid_century',
        'farmhouse': 'farmhouse', 'country': 'farmhouse', 'cottage': 'farmhouse',
        'bohemian': 'bohemian', 'boho': 'bohemian',
        'coastal': 'coastal', 'nautical': 'coastal', 'beach': 'coastal',
        'glam': 'glam', 'luxury': 'glam', 'luxurious': 'glam',
        'cozy': 'modern', 'warm': 'modern', 'simple': 'modern',
    }
    SCENE_MAP = {
        'living room': 'living_room', 'living_room': 'living_room',
        'lounge': 'living_room', 'family room': 'living_room',
        'bedroom': 'bedroom', 'master bedroom': 'bedroom',
        'dining': 'dining', 'dining room': 'dining', 'kitchen': 'dining',
        'office': 'office', 'home office': 'office', 'study': 'office',
        'workspace': 'office',
        'bathroom': 'bathroom', 'bath': 'bathroom',
        'outdoor': 'outdoor', 'patio': 'outdoor', 'garden': 'outdoor',
        'balcony': 'outdoor',
        'entryway': 'entryway', 'hallway': 'entryway', 'foyer': 'entryway',
    }

    def _normalize_to_db(self, values: list, mapping: dict) -> list:
        """Map LLM-extracted free text to DB enum values"""
        result = set()
        for v in values:
            v_lower = v.lower().strip()
            if v_lower in mapping:
                result.add(mapping[v_lower])
            # Also try partial match
            for key, db_val in mapping.items():
                if key in v_lower or v_lower in key:
                    result.add(db_val)
        return list(result)

    async def search_products(self, state: AgentState) -> AgentState:
        """搜索商品"""
        session_id = state["session_id"]
        requirements = state.get("extracted_requirements", {})
        preferences = state.get("user_preferences", {})

        try:
            from app.services.product_service import ProductService
            product_service = ProductService()

            # Normalize LLM-extracted terms to DB vocabulary
            raw_styles = preferences.get("style_preference", [])
            raw_scenes = [preferences.get("room_type", "")] if preferences.get("room_type") else []
            db_styles = self._normalize_to_db(raw_styles, self.STYLE_MAP)
            db_scenes = self._normalize_to_db(raw_scenes, self.SCENE_MAP)

            budget = preferences.get("budget_range", {})
            # budget max is for the whole package (multiple items), so per-item max ~= total / 3
            raw_max = budget.get("max")
            per_item_max = round(raw_max / 3, 2) if raw_max and raw_max > 0 else None

            search_params = {
                "styles": db_styles,
                "scenes": db_scenes,
                "max_price": per_item_max,
                "page_size": 50,
            }

            logger.info(f"Search params (normalized): {search_params}")
            result = await product_service.search_products(search_params)
            products = result.get("products", [])

            # Fallback: if too few results, broaden search (drop style/scene filters)
            if len(products) < 10:
                logger.info(f"Only {len(products)} results, broadening search...")
                fallback_params = {"max_price": per_item_max, "page_size": 50}
                if db_scenes:
                    fallback_params["scenes"] = db_scenes  # keep scene, drop style
                result = await product_service.search_products(fallback_params)
                products = result.get("products", [])

            # Last resort: no filters at all
            if len(products) < 10:
                logger.info(f"Still only {len(products)} results, searching without filters...")
                result = await product_service.search_products({"page_size": 50})
                products = result.get("products", [])
            
            state["candidate_products"] = [
                {
                    "id": p.get("spu_id") or p.get("sku_id"),
                    "title": p.get("title", ""),
                    "price": float(p["price_current"]) if p.get("price_current") else 0,
                    "styles": p.get("styles", []),
                    "materials": p.get("materials", []),
                    "category_l1": p.get("category_l1"),
                    "category_l2": p.get("category_l2"),
                    "category_l3": p.get("category_l3"),
                    "images": (p.get("images") or [])[:1]
                }
                for p in products[:30]  # 取前30个
            ]
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.BUYER,
                activity_type="search_products",
                content={
                    "search_params": search_params,
                    "results_count": len(products)
                }
            )
            
            logger.info(f"Buyer agent found {len(products)} products for session {session_id}")
            
        except Exception as e:
            logger.error(f"Buyer agent failed to search products: {e}")
            state["errors"].append(f"search_products: {str(e)}")
        
        state["updated_at"] = datetime.now()
        return state
    
    async def generate_schemes(self, state: AgentState) -> AgentState:
        """生成设计方案"""
        session_id = state["session_id"]
        products = state.get("candidate_products", [])
        preferences = state.get("user_preferences", {})
        
        if len(products) < 3:
            state["errors"].append("not_enough_products")
            return state
        
        try:
            # 构建生成提示
            system_prompt = """You are a professional interior designer. Based on the user's needs and candidate products, generate 3 different design packages.

Each package should include:
1. Package name and theme
2. 5-8 matching products (selected from candidate products)
3. Recommendation reason for each product
4. Overall style description
5. Total price

Critical anti-duplication rule:
- If you choose a bundle/set/package product in one package, do not add separate single items that are likely already included in that bundle.
- Keep each package non-redundant and avoid overlap caused by bundle contents.

Return as JSON:
{
    "schemes": [
        {
            "scheme_index": 0,
            "scheme_name": "Package name",
            "theme": "Theme description",
            "items": [
                {
                    "product_id": "product ID",
                    "product_name": "product name",
                    "price": price,
                    "reason": "recommendation reason"
                }
            ],
            "total_price": total_price,
            "style_tags": ["style tags"],
            "description": "overall package description"
        }
    ]
}

Always write all names, descriptions, and reasons in English."""

            # 准备商品信息
            products_info = json.dumps(products[:20], ensure_ascii=False, indent=2)
            preferences_info = json.dumps(preferences, ensure_ascii=False, indent=2)

            content = await self.llm.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"User requirements:\n{preferences_info}\n\nCandidate products:\n{products_info}\n\nPlease generate design packages."}
                ],
                temperature=0.7,
                max_tokens=3000
            )
            
            # 解析 JSON
            try:
                if "```json" in content:
                    json_str = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    json_str = content.split("```")[1].split("```")[0].strip()
                else:
                    json_str = content
                
                result = json.loads(json_str)
                schemes = result.get("schemes", [])
            except (json.JSONDecodeError, IndexError):
                # 生成默认方案
                schemes = self._generate_default_schemes(products, preferences)

            schemes = self._deduplicate_scheme_items_for_bundles(schemes, products)
            
            state["schemes"] = schemes
            state["total_schemes"] = len(schemes)
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.BUYER,
                activity_type="generate_schemes",
                content={
                    "schemes_count": len(schemes),
                    "themes": [s.get("theme") for s in schemes]
                }
            )
            
            logger.info(f"Buyer agent generated {len(schemes)} schemes for session {session_id}")
            
        except Exception as e:
            logger.error(f"Buyer agent failed to generate schemes: {e}")
            state["errors"].append(f"generate_schemes: {str(e)}")
            # 生成默认方案作为回退
            state["schemes"] = self._deduplicate_scheme_items_for_bundles(
                self._generate_default_schemes(products, preferences),
                products
            )
        
        state["updated_at"] = datetime.now()
        return state
    
    def _generate_default_schemes(
        self,
        products: List[Dict],
        preferences: Dict[str, Any]
    ) -> List[Dict]:
        """生成默认方案（回退策略）"""
        schemes = []
        themes = [
            {"name": "Modern Minimalist", "tag": "modern"},
            {"name": "Scandinavian Style", "tag": "nordic"},
            {"name": "Contemporary Luxury", "tag": "luxury"}
        ]

        for i, theme in enumerate(themes):
            # 随机选择 5-6 个商品
            import random
            selected = random.sample(products, min(6, len(products)))

            total_price = sum(p.get("price", 0) for p in selected)

            scheme = {
                "scheme_index": i,
                "scheme_name": f"{theme['name']} Package",
                "theme": theme['name'],
                "items": [
                    {
                        "product_id": p.get("id"),
                        "product_name": p.get("title"),
                        "price": p.get("price", 0),
                        "reason": f"Matches the {theme['name']} aesthetic"
                    }
                    for p in selected
                ],
                "total_price": round(total_price, 2),
                "style_tags": [theme['tag']],
                "description": f"A curated {theme['name']} design package"
            }
            schemes.append(scheme)
        
        return schemes

    def _is_bundle_product(self, title: str) -> bool:
        title_lower = (title or "").lower()
        return any(keyword in title_lower for keyword in self.BUNDLE_KEYWORDS)

    def _extract_title_keywords(self, title: str) -> set[str]:
        words = re.findall(r"[a-zA-Z]{3,}", (title or "").lower())
        return {
            w for w in words
            if w not in self.TITLE_STOPWORDS and not w.isdigit()
        }

    def _deduplicate_scheme_items_for_bundles(
        self,
        schemes: List[Dict[str, Any]],
        products: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """If a bundle/set is selected, remove likely-overlapping single items from the same scheme."""
        product_map = {
            str(p.get("id")): p
            for p in products
            if p.get("id") is not None
        }

        for scheme in schemes:
            items = scheme.get("items") or []
            if not items:
                continue

            bundle_contexts = []
            for item in items:
                item_title = item.get("product_name") or ""
                item_product = product_map.get(str(item.get("product_id")), {})
                if not self._is_bundle_product(item_title):
                    continue
                bundle_contexts.append(
                    {
                        "title_keywords": self._extract_title_keywords(item_title),
                        "category_l2": (item_product.get("category_l2") or "").lower(),
                        "category_l3": (item_product.get("category_l3") or "").lower(),
                    }
                )

            if not bundle_contexts:
                continue

            filtered_items = []
            for item in items:
                item_title = item.get("product_name") or ""
                if self._is_bundle_product(item_title):
                    filtered_items.append(item)
                    continue

                item_product = product_map.get(str(item.get("product_id")), {})
                item_l2 = (item_product.get("category_l2") or "").lower()
                item_l3 = (item_product.get("category_l3") or "").lower()
                item_keywords = self._extract_title_keywords(item_title)

                should_drop = False
                for bundle in bundle_contexts:
                    # Prefer category-level overlap if categories are available.
                    if bundle["category_l3"] and item_l3 and bundle["category_l3"] == item_l3:
                        should_drop = True
                        break
                    if bundle["category_l2"] and item_l2 and bundle["category_l2"] == item_l2:
                        should_drop = True
                        break

                    # Fallback: if titles overlap heavily, treat as likely duplicated coverage.
                    overlap_count = len(bundle["title_keywords"] & item_keywords)
                    if overlap_count >= 2:
                        should_drop = True
                        break

                if not should_drop:
                    filtered_items.append(item)

            scheme["items"] = filtered_items
            scheme["total_price"] = round(
                sum(float(i.get("price", 0) or 0) for i in filtered_items),
                2
            )

        return schemes
    
    async def present_schemes(self, state: AgentState) -> AgentState:
        """展示方案"""
        session_id = state["session_id"]
        schemes = state.get("schemes", [])
        
        try:
            # 生成展示文案
            system_prompt = """You are a friendly home furnishing assistant. Write a short, enthusiastic English summary (2-3 sentences) introducing the generated design packages to the user."""

            schemes_info = json.dumps(schemes, ensure_ascii=False, indent=2)

            presentation = await self.llm.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Design packages:\n{schemes_info}\n\nPlease write a brief English introduction for the user."}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            state["task_results"]["presentation"] = presentation
            
            # 记录活动
            await log_agent_activity(
                session_id=session_id,
                agent_type=AgentRole.BUYER,
                activity_type="present_schemes",
                content={
                    "schemes_count": len(schemes),
                    "has_presentation": bool(presentation)
                }
            )
            
            logger.info(f"Buyer agent presented schemes for session {session_id}")
            
        except Exception as e:
            logger.error(f"Buyer agent failed to present schemes: {e}")
            state["errors"].append(f"present_schemes: {str(e)}")
        
        state["updated_at"] = datetime.now()
        return state
    
    async def collect_feedback(self, state: AgentState) -> AgentState:
        """收集用户反馈"""
        session_id = state["session_id"]
        
        # 这里主要是等待用户输入
        # 实际反馈处理在路由决策中完成
        
        await log_agent_activity(
            session_id=session_id,
            agent_type=AgentRole.BUYER,
            activity_type="collect_feedback",
            content={"status": "waiting_for_feedback"}
        )
        
        state["updated_at"] = datetime.now()
        return state
