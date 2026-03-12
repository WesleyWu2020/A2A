# -*- coding: utf-8 -*-
"""
方案生成服务 - 根据用户画像生成3套差异化方案
"""

import logging
import random
from typing import List, Optional, Dict, Any
from datetime import datetime

from .product_service import ProductService
from ..core.data_loader import get_product_store
from ..models.product import Product
from ..models.user import UserPreference as UserProfile, UserPreference as UserRequirement, SessionContext as RoomType, UserPreference as StylePreference, UserPreference as BudgetRange
from ..models.scheme import (
    Scheme, SchemeItem, SchemeType, SchemeStyle, 
    SchemeSet, SchemeComparison
)

logger = logging.getLogger(__name__)


class SchemeService:
    """方案生成服务"""
    
    # 各方案类型的预算比例
    BUDGET_RATIOS = {
        SchemeType.ECONOMY: 0.85,      # 经济型: 预算的85%
        SchemeType.BALANCED: 1.0,      # 均衡型: 预算的100%
        SchemeType.PREMIUM: 1.2,       # 品质型: 预算的120%
    }
    
    # 各方案类型的策略权重
    STRATEGY_WEIGHTS = {
        SchemeType.ECONOMY: {
            'price_weight': 0.6,       # 价格权重高
            'quality_weight': 0.2,
            'style_weight': 0.2,
        },
        SchemeType.BALANCED: {
            'price_weight': 0.3,
            'quality_weight': 0.35,
            'style_weight': 0.35,      # 风格权重高
        },
        SchemeType.PREMIUM: {
            'price_weight': 0.1,
            'quality_weight': 0.5,     # 品质权重高
            'style_weight': 0.4,
        },
    }
    
    def __init__(self, product_service: Optional[ProductService] = None):
        """
        初始化方案服务
        
        Args:
            product_service: 商品服务实例
        """
        self.product_service = product_service or ProductService()
    
    def generate_schemes(self, user_profile: UserProfile) -> SchemeSet:
        """
        根据用户画像生成3套差异化方案
        
        Args:
            user_profile: 用户画像
            
        Returns:
            包含3套方案的方案集
        """
        logger.info(f"开始生成方案: session={user_profile.session_id}")
        start_time = datetime.now()
        
        set_id = f"set_{user_profile.session_id}_{int(start_time.timestamp())}"
        
        # 获取候选商品
        candidates = self._get_candidate_products(user_profile)
        logger.info(f"获取候选商品: {len(candidates)} 个")
        
        # 生成三种方案
        economy_scheme = self._generate_single_scheme(
            user_profile, candidates, SchemeType.ECONOMY
        )
        
        balanced_scheme = self._generate_single_scheme(
            user_profile, candidates, SchemeType.BALANCED
        )
        
        premium_scheme = self._generate_single_scheme(
            user_profile, candidates, SchemeType.PREMIUM
        )
        
        duration = (datetime.now() - start_time).total_seconds()
        
        scheme_set = SchemeSet(
            set_id=set_id,
            session_id=user_profile.session_id,
            user_id=user_profile.user_id,
            economy_scheme=economy_scheme,
            balanced_scheme=balanced_scheme,
            premium_scheme=premium_scheme,
            generated_at=datetime.now(),
            generation_duration=duration
        )
        
        logger.info(f"方案生成完成: {duration:.2f}秒")
        return scheme_set
    
    def _get_candidate_products(self, user_profile: UserProfile) -> List[Product]:
        """获取候选商品"""
        candidates = []
        req = user_profile.current_requirement
        
        # 1. 基于房间类型搜索
        candidates.extend(
            self.product_service.recommend_for_user(req, limit=30)
        )
        
        # 2. 基于风格搜索
        for style in req.style_preference[:2]:
            candidates.extend(
                self.product_service.get_by_style(style.value, limit=15)
            )
        
        # 3. 基于具体需求搜索
        for need in req.specific_needs[:3]:
            candidates.extend(
                self.product_service.search(need, limit=10)
            )
        
        # 去重
        seen = set()
        unique = []
        for p in candidates:
            if p.spu_id not in seen:
                seen.add(p.spu_id)
                unique.append(p)
        
        return unique
    
    def _generate_single_scheme(
        self, 
        user_profile: UserProfile, 
        candidates: List[Product],
        scheme_type: SchemeType
    ) -> Scheme:
        """生成单个方案"""
        req = user_profile.current_requirement
        budget = user_profile.budget
        weights = self.STRATEGY_WEIGHTS[scheme_type]
        
        # 计算目标预算
        target_budget = self._calculate_target_budget(budget, scheme_type)
        
        # 确定房间必需的商品类型
        required_types = self._get_required_product_types(req.room_type)
        
        # 为每种类型选择最佳商品
        selected_items = []
        used_ids = set()
        
        for ptype in required_types:
            # 筛选该类型的候选商品
            type_candidates = [
                p for p in candidates 
                if self._is_product_type_match(p, ptype) and p.spu_id not in used_ids
            ]
            
            if not type_candidates:
                continue
            
            # 根据方案策略排序
            scored = [
                (p, self._score_product(p, user_profile, weights))
                for p in type_candidates
            ]
            scored.sort(key=lambda x: x[1], reverse=True)
            
            # 选择得分最高的
            best_product = scored[0][0]
            used_ids.add(best_product.spu_id)
            
            price = best_product.price_info.sale_price or best_product.price_info.retail_price or 0
            
            item = SchemeItem(
                product_id=best_product.spu_id,
                product_name=best_product.title or "Unknown",
                product_image=best_product.product_main_img,
                category=best_product.categories.name2 or best_product.categories.name1 or "Other",
                quantity=1,
                unit_price=price,
                total_price=price,
                recommendation_reason=self._generate_reason(best_product, scheme_type)
            )
            selected_items.append(item)
        
        # 计算总价
        subtotal = sum(item.total_price for item in selected_items)
        
        # 确保在预算范围内（经济型）
        if scheme_type == SchemeType.ECONOMY and subtotal > target_budget:
            selected_items, subtotal = self._adjust_to_budget(
                selected_items, target_budget
            )
        
        # 生成方案信息
        scheme_id = f"scheme_{user_profile.session_id}_{scheme_type.value}"
        
        return Scheme(
            scheme_id=scheme_id,
            session_id=user_profile.session_id,
            scheme_type=scheme_type,
            name=self._get_scheme_name(scheme_type),
            description=self._get_scheme_description(scheme_type, user_profile),
            design_concept=self._get_design_concept(scheme_type),
            target_user=self._get_target_user(scheme_type),
            style=SchemeStyle(
                primary_style=req.style_preference[0].value if req.style_preference else 'modern',
                secondary_styles=[s.value for s in req.style_preference[1:]] if len(req.style_preference) > 1 else [],
                color_scheme=self._suggest_color_scheme(req.style_preference),
                mood_description=self._get_mood_description(scheme_type)
            ),
            items=selected_items,
            subtotal=subtotal,
            discount=0,
            delivery_fee=0,
            total_price=subtotal,
            original_total=subtotal
        )
    
    def _calculate_target_budget(self, budget: BudgetRange, scheme_type: SchemeType) -> float:
        """计算目标预算"""
        base = budget.max_amount or 5000
        ratio = self.BUDGET_RATIOS[scheme_type]
        return base * ratio
    
    def _get_required_product_types(self, room_type: RoomType) -> List[str]:
        """获取房间必需的商品类型"""
        templates = {
            RoomType.LIVING_ROOM: ['sofa', 'coffee table', 'TV stand', 'floor lamp', 'rug'],
            RoomType.BEDROOM: ['bed', 'nightstand', 'dresser', 'table lamp'],
            RoomType.KITCHEN: ['faucet', 'pendant light', 'bar stool'],
            RoomType.BATHROOM: ['faucet', 'vanity', 'shower', 'towel rack'],
            RoomType.DINING_ROOM: ['dining table', 'dining chair', 'chandelier'],
            RoomType.HOME_OFFICE: ['desk', 'office chair', 'bookshelf', 'desk lamp'],
        }
        return templates.get(room_type, ['furniture', 'lighting', 'decor'])
    
    def _is_product_type_match(self, product: Product, ptype: str) -> bool:
        """检查商品是否匹配类型"""
        text = ' '.join([
            product.title or '',
            product.categories.name1 or '',
            product.categories.name2 or '',
            product.categories.name3 or ''
        ]).lower()
        return ptype.lower() in text
    
    def _score_product(
        self, 
        product: Product, 
        user_profile: UserProfile,
        weights: Dict[str, float]
    ) -> float:
        """
        为商品打分
        
        评分维度：
        - 价格匹配度
        - 品质（评分）
        - 风格匹配度
        """
        score = 0.0
        req = user_profile.current_requirement
        
        # 价格评分（越低越好，经济型）
        price = product.price_info.sale_price or product.price_info.retail_price or 0
        if price > 0:
            # 归一化价格（假设价格范围 0-2000）
            price_score = max(0, 1 - price / 2000)
            score += price_score * weights['price_weight']
        
        # 品质评分
        rating = product.rating_value or 4.0
        quality_score = rating / 5.0
        score += quality_score * weights['quality_weight']
        
        # 风格匹配
        style_score = 0
        if req.style_preference:
            for style in req.style_preference:
                if style.value in product.style_tags:
                    style_score += 1
            style_score = min(1, style_score / max(1, len(req.style_preference)))
        else:
            style_score = 0.5
        score += style_score * weights['style_weight']
        
        # 评价数量加分（热门商品）
        if product.review_count and product.review_count > 10:
            score += 0.1
        
        return score
    
    def _adjust_to_budget(
        self, 
        items: List[SchemeItem], 
        target_budget: float
    ) -> tuple[List[SchemeItem], float]:
        """调整方案以符合预算"""
        # 按价格降序排序
        sorted_items = sorted(items, key=lambda x: x.unit_price, reverse=True)
        
        current_total = sum(item.total_price for item in items)
        
        # 移除最贵的直到符合预算
        adjusted = items.copy()
        for item in sorted_items:
            if current_total <= target_budget:
                break
            if item in adjusted and not item.is_alternative:
                adjusted.remove(item)
                current_total -= item.total_price
        
        return adjusted, current_total
    
    def _generate_reason(self, product: Product, scheme_type: SchemeType) -> str:
        """生成推荐理由"""
        reasons = {
            SchemeType.ECONOMY: [
                "高性价比之选",
                "经济实惠",
                "预算友好",
                "实用首选"
            ],
            SchemeType.BALANCED: [
                "风格与品质兼顾",
                "平衡之选",
                "整体搭配协调",
                "品质稳定"
            ],
            SchemeType.PREMIUM: [
                "品质卓越",
                "高端之选",
                "精工细作",
                "品质保证"
            ]
        }
        return random.choice(reasons[scheme_type])
    
    def _get_scheme_name(self, scheme_type: SchemeType) -> str:
        """获取方案名称"""
        names = {
            SchemeType.ECONOMY: "经济实用方案",
            SchemeType.BALANCED: "风格均衡方案", 
            SchemeType.PREMIUM: "品质优选方案"
        }
        return names[scheme_type]
    
    def _get_scheme_description(self, scheme_type: SchemeType, user_profile: UserProfile) -> str:
        """获取方案描述"""
        room = user_profile.current_requirement.room_type.value.replace('_', ' ')
        
        descriptions = {
            SchemeType.ECONOMY: f"针对{room}的高性价比配置方案，在有限预算内实现最佳功能与美观的平衡。",
            SchemeType.BALANCED: f"{room}的风格统一方案，注重整体搭配协调性，打造和谐统一的居家氛围。",
            SchemeType.PREMIUM: f"{room}的品质优先方案，精选优质产品，追求极致的使用体验与设计美感。"
        }
        return descriptions[scheme_type]
    
    def _get_design_concept(self, scheme_type: SchemeType) -> str:
        """获取设计理念"""
        concepts = {
            SchemeType.ECONOMY: "Less is more. 精选必要单品，避免过度装饰，以简洁实用的设计创造舒适空间。",
            SchemeType.BALANCED: "Harmony in design. 注重色彩、材质、风格的统一协调，打造和谐整体空间。",
            SchemeType.PREMIUM: "Excellence in every detail. 追求每个细节的极致品质，营造高端精致的生活体验。"
        }
        return concepts[scheme_type]
    
    def _get_target_user(self, scheme_type: SchemeType) -> str:
        """获取目标用户描述"""
        targets = {
            SchemeType.ECONOMY: "预算有限但追求实用的年轻人、租房一族、首次购房者",
            SchemeType.BALANCED: "注重生活品质与整体风格的家庭用户、改善型住房业主",
            SchemeType.PREMIUM: "追求高品质生活体验的用户、对设计有较高要求的专业人士"
        }
        return targets[scheme_type]
    
    def _suggest_color_scheme(self, styles: List[StylePreference]) -> List[str]:
        """推荐配色方案"""
        schemes = {
            StylePreference.MODERN: ["White", "Gray", "Black", "Metallic"],
            StylePreference.MINIMALIST: ["White", "Beige", "Light Gray", "Natural Wood"],
            StylePreference.SCANDINAVIAN: ["White", "Light Wood", "Pastel Blue", "Soft Gray"],
            StylePreference.INDUSTRIAL: ["Gray", "Black", "Brown Leather", "Copper"],
            StylePreference.LUXURY: ["Gold", "Black", "White", "Deep Blue"],
            StylePreference.TRADITIONAL: ["Warm Brown", "Cream", "Burgundy", "Gold"],
            StylePreference.FARMHOUSE: ["White", "Distressed Wood", "Sage Green", "Black"],
        }
        
        if styles:
            return schemes.get(styles[0], ["White", "Gray", "Natural"])
        return ["White", "Gray", "Natural"]
    
    def _get_mood_description(self, scheme_type: SchemeType) -> str:
        """获取氛围描述"""
        moods = {
            SchemeType.ECONOMY: "清新、简约、实用",
            SchemeType.BALANCED: "和谐、舒适、统一",
            SchemeType.PREMIUM: "精致、高端、品质"
        }
        return moods[scheme_type]
    
    def compare_schemes(self, scheme_set: SchemeSet) -> SchemeComparison:
        """对比三套方案"""
        schemes = scheme_set.all_schemes
        
        return SchemeComparison(
            schemes=schemes,
            price_comparison={
                'min': min(s.total_price for s in schemes),
                'max': max(s.total_price for s in schemes),
                'avg': sum(s.total_price for s in schemes) / len(schemes)
            },
            ai_recommendation=self._generate_comparison_advice(scheme_set)
        )
    
    def _generate_comparison_advice(self, scheme_set: SchemeSet) -> str:
        """生成对比建议"""
        economy = scheme_set.economy_scheme
        balanced = scheme_set.balanced_scheme
        premium = scheme_set.premium_scheme
        
        advice = "根据您的需求，我为您准备了三套不同定位的方案：\n\n"
        
        if economy:
            advice += f"💰 【经济实用方案】- ${economy.total_price:.2f}\n"
            advice += "   适合预算有限但追求实用的您，性价比高。\n\n"
        
        if balanced:
            advice += f"⚖️ 【风格均衡方案】- ${balanced.total_price:.2f}\n"
            advice += "   风格统一协调，整体搭配和谐，适合大多数家庭。\n\n"
        
        if premium:
            advice += f"✨ 【品质优选方案】- ${premium.total_price:.2f}\n"
            advice += "   精选优质产品，追求极致体验，适合对品质有高要求的您。\n\n"
        
        advice += "您可以根据自己的预算和偏好选择最适合的方案，我还可以帮您进一步议价。"
        
        return advice
