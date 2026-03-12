# -*- coding: utf-8 -*-
"""
数据加载模块 - 从 JSON 文件加载商品数据到内存
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
import re

from ..models.product import ProductBase as Product, ProductBase

# 类型别名
ProductCategory = ProductBase
ProductPrice = ProductBase
ProductImage = ProductBase
ProductSpecs = ProductBase

logger = logging.getLogger(__name__)


@dataclass
class ProductDataStore:
    """
    商品数据存储 - 内存中的商品数据管理
    单例模式，全局共享
    """
    products: Dict[str, Product] = field(default_factory=dict)
    products_by_category: Dict[str, List[str]] = field(default_factory=dict)
    products_by_style: Dict[str, List[str]] = field(default_factory=dict)
    categories: Dict[str, Dict] = field(default_factory=dict)
    styles: set = field(default_factory=set)
    materials: set = field(default_factory=set)
    _initialized: bool = field(default=False, repr=False)
    
    def load_from_jsonl(self, filepath: str) -> int:
        """
        从 JSON Lines 文件加载商品数据
        
        Args:
            filepath: JSONL 文件路径
            
        Returns:
            加载的商品数量
        """
        filepath = Path(filepath)
        if not filepath.exists():
            logger.error(f"数据文件不存在: {filepath}")
            return 0
        
        count = 0
        errors = 0
        
        logger.info(f"开始加载数据: {filepath}")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                
                try:
                    raw_data = json.loads(line)
                    product = self._parse_product(raw_data)
                    
                    if product and product.spu_id:
                        self.products[product.spu_id] = product
                        self._index_product(product)
                        count += 1
                        
                        if count % 1000 == 0:
                            logger.info(f"已加载 {count} 个商品...")
                            
                except json.JSONDecodeError as e:
                    logger.warning(f"第 {line_num} 行 JSON 解析错误: {e}")
                    errors += 1
                except Exception as e:
                    logger.warning(f"第 {line_num} 行数据处理错误: {e}")
                    errors += 1
        
        self._initialized = True
        logger.info(f"数据加载完成: 成功 {count} 个, 失败 {errors} 个")
        logger.info(f"类目数: {len(self.categories)}, 风格数: {len(self.styles)}, 材质数: {len(self.materials)}")
        
        return count
    
    def _parse_product(self, raw: Dict[str, Any]) -> Optional[Product]:
        """解析原始数据为 Product 对象"""
        # 跳过无效数据
        if not raw.get('spu_id') or not raw.get('title'):
            return None
        
        # 解析类目
        cat_data = raw.get('categories', {})
        category = ProductCategory(
            name1=cat_data.get('name1'),
            name2=cat_data.get('name2'),
            name3=cat_data.get('name3'),
            name4=cat_data.get('name4'),
            id1=cat_data.get('id1'),
            id2=cat_data.get('id2'),
            id3=cat_data.get('id3'),
            id4=cat_data.get('id4'),
        )
        
        # 解析图片
        images = []
        for img in raw.get('product_img', []) or []:
            if isinstance(img, dict) and img.get('img_url'):
                images.append(ProductImage(
                    img_url=img['img_url'],
                    img_desc=img.get('img_desc', ''),
                    img_alt=img.get('img_alt', ''),
                    type=img.get('type', 1)
                ))
        
        # 解析价格
        price_info = raw.get('price_info_default', {})
        if isinstance(price_info, dict):
            product_price = ProductPrice(
                retail_price=self._parse_price(price_info.get('retail_price')),
                sale_price=self._parse_price(price_info.get('sale_price')),
                currency=price_info.get('currency', 'USD'),
                discount=price_info.get('discount')
            )
        else:
            # 生成模拟价格
            product_price = self._generate_mock_price(raw.get('title', ''))
        
        # 解析评分
        rating = raw.get('ratingValue')
        review_count = raw.get('reviewCount')
        
        # 提取风格和材质标签
        style_tags = self._extract_style_tags(raw)
        material_tags = self._extract_material_tags(raw)
        
        return Product(
            spu_id=str(raw.get('spu_id')),
            spu_code=raw.get('spu_code'),
            sku_id_default=raw.get('sku_id_default'),
            sku_code_default=raw.get('sku_code_default'),
            title=raw.get('title'),
            sub_title=raw.get('sub_title'),
            description=raw.get('description'),
            details=raw.get('details'),
            product_overview=raw.get('product_overview'),
            categories=category,
            rating_value=float(rating) if rating and rating != '0.0' else None,
            review_count=int(review_count) if review_count and str(review_count).isdigit() else 0,
            product_main_img=raw.get('product_main_img'),
            product_images=images,
            price_info=product_price,
            style_tags=style_tags,
            material_tags=material_tags,
            url=raw.get('url'),
        )
    
    def _parse_price(self, value) -> Optional[float]:
        """解析价格值"""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _generate_mock_price(self, title: str) -> ProductPrice:
        """生成模拟价格（基于标题长度和单词数）"""
        import hashlib
        hash_val = int(hashlib.md5(title.encode()).hexdigest(), 16)
        base_price = 100 + (hash_val % 900)
        discount = [0, 0, 0, 10, 15, 20][hash_val % 6]
        sale_price = base_price * (100 - discount) / 100
        
        return ProductPrice(
            retail_price=round(base_price, 2),
            sale_price=round(sale_price, 2),
            currency="USD",
            discount=discount if discount > 0 else None
        )
    
    def _extract_style_tags(self, raw: Dict) -> List[str]:
        """从原始数据中提取风格标签"""
        tags = set()
        title = (raw.get('title') or '').lower()
        desc = (raw.get('description') or '').lower()
        text = title + ' ' + desc
        
        style_keywords = {
            'modern': ['modern', 'contemporary'],
            'minimalist': ['minimalist', 'minimal', 'simple', 'clean'],
            'industrial': ['industrial', 'loft', 'rustic metal'],
            'scandinavian': ['scandinavian', 'nordic', 'nordico'],
            'traditional': ['traditional', 'classic', 'vintage'],
            'luxury': ['luxury', 'luxurious', 'elegant', 'premium'],
            'farmhouse': ['farmhouse', 'country', 'rustic'],
            'bohemian': ['bohemian', 'boho'],
        }
        
        for style, keywords in style_keywords.items():
            if any(kw in text for kw in keywords):
                tags.add(style)
        
        return list(tags) if tags else ['modern']
    
    def _extract_material_tags(self, raw: Dict) -> List[str]:
        """从原始数据中提取材质标签"""
        tags = set()
        title = (raw.get('title') or '').lower()
        
        material_keywords = {
            'brass': ['brass', 'solid brass'],
            'chrome': ['chrome', 'chromed'],
            'stainless_steel': ['stainless steel', 'sus304', 'sus 304'],
            'matte_black': ['matte black', 'matt black'],
            'brushed_nickel': ['brushed nickel', 'satin nickel'],
            'gold': ['gold', 'brushed gold', 'matte gold'],
            'glass': ['glass', 'tempered glass'],
            'wood': ['wood', 'wooden', 'solid wood', 'walnut', 'oak'],
            'stone': ['stone', 'marble', 'granite', 'stone resin'],
            'ceramic': ['ceramic', 'porcelain'],
        }
        
        for material, keywords in material_keywords.items():
            if any(kw in title for kw in keywords):
                tags.add(material)
        
        return list(tags)
    
    def _index_product(self, product: Product) -> None:
        """为商品建立索引"""
        # 按类目索引
        cat_key = product.categories.name2 or product.categories.name1
        if cat_key:
            if cat_key not in self.products_by_category:
                self.products_by_category[cat_key] = []
            self.products_by_category[cat_key].append(product.spu_id)
        
        # 按风格索引
        for style in product.style_tags:
            if style not in self.products_by_style:
                self.products_by_style[style] = []
            self.products_by_style[style].append(product.spu_id)
            self.styles.add(style)
        
        # 收集材质
        for material in product.material_tags:
            self.materials.add(material)
        
        # 收集类目信息
        if product.categories.name1:
            if product.categories.name1 not in self.categories:
                self.categories[product.categories.name1] = {
                    'name': product.categories.name1,
                    'id': product.categories.id1,
                    'subcategories': {}
                }
            if product.categories.name2:
                self.categories[product.categories.name1]['subcategories'][product.categories.name2] = {
                    'name': product.categories.name2,
                    'id': product.categories.id2
                }
    
    # ============ 查询方法 ============
    
    def get_product(self, product_id: str) -> Optional[Product]:
        """获取单个商品"""
        return self.products.get(product_id)
    
    def get_products(self, product_ids: List[str]) -> List[Product]:
        """批量获取商品"""
        return [self.products.get(pid) for pid in product_ids if pid in self.products]
    
    def search_by_keyword(self, keyword: str, limit: int = 20) -> List[Product]:
        """关键词搜索"""
        keyword = keyword.lower()
        results = []
        
        for product in self.products.values():
            if (keyword in (product.title or '').lower() or
                keyword in (product.description or '').lower() or
                keyword in (product.sub_title or '').lower() or
                any(keyword in tag for tag in product.style_tags) or
                any(keyword in tag for tag in product.material_tags)):
                results.append(product)
                if len(results) >= limit:
                    break
        
        return results
    
    def filter_products(self, 
                       category: Optional[str] = None,
                       style: Optional[str] = None,
                       material: Optional[str] = None,
                       min_price: Optional[float] = None,
                       max_price: Optional[float] = None,
                       min_rating: Optional[float] = None,
                       limit: int = 20) -> List[Product]:
        """多条件筛选商品"""
        results = []
        
        for product in self.products.values():
            # 类目筛选
            if category:
                cats = [product.categories.name1, product.categories.name2, 
                       product.categories.name3]
                if category not in [c for c in cats if c]:
                    continue
            
            # 风格筛选
            if style and style not in product.style_tags:
                continue
            
            # 材质筛选
            if material and material not in product.material_tags:
                continue
            
            # 价格筛选
            price = product.price_info.sale_price or product.price_info.retail_price
            if price:
                if min_price and price < min_price:
                    continue
                if max_price and price > max_price:
                    continue
            
            # 评分筛选
            if min_rating and (product.rating_value or 0) < min_rating:
                continue
            
            results.append(product)
            if len(results) >= limit:
                break
        
        return results
    
    def get_by_category(self, category: str, limit: int = 20) -> List[Product]:
        """按类目获取商品"""
        product_ids = self.products_by_category.get(category, [])
        products = [self.products.get(pid) for pid in product_ids[:limit]]
        return [p for p in products if p]
    
    def get_by_style(self, style: str, limit: int = 20) -> List[Product]:
        """按风格获取商品"""
        product_ids = self.products_by_style.get(style, [])
        products = [self.products.get(pid) for pid in product_ids[:limit]]
        return [p for p in products if p]
    
    def get_all_categories(self) -> List[Dict]:
        """获取所有类目"""
        return list(self.categories.values())
    
    def get_all_styles(self) -> List[str]:
        """获取所有风格"""
        return sorted(list(self.styles))
    
    def get_stats(self) -> Dict[str, Any]:
        """获取数据统计"""
        return {
            'total_products': len(self.products),
            'total_categories': len(self.categories),
            'total_styles': len(self.styles),
            'total_materials': len(self.materials),
            'products_by_category': {k: len(v) for k, v in self.products_by_category.items()},
        }


# 全局单例实例
_product_store: Optional[ProductDataStore] = None


def get_product_store() -> ProductDataStore:
    """获取全局商品数据存储实例"""
    global _product_store
    if _product_store is None:
        _product_store = ProductDataStore()
    return _product_store


def init_data_store(jsonl_path: str) -> ProductDataStore:
    """初始化数据存储并加载数据"""
    store = get_product_store()
    if not store._initialized:
        store.load_from_jsonl(jsonl_path)
    return store
