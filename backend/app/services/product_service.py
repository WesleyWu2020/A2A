"""
商品检索服务
"""
import logging
import re
from html import unescape
from typing import Optional, List, Dict, Any
from decimal import Decimal

from app.core.database import execute_query
from app.models.product import (
    ProductResponse, ProductSearchResult, ProductFilterOptions
)

logger = logging.getLogger(__name__)


def _to_concise_description(raw: Optional[str], max_len: int = 220) -> str:
    """Convert verbose/HTML product description into a concise user-friendly summary."""
    if not raw:
        return ""

    text = unescape(raw)
    text = re.sub(r"<\s*br\s*/?\s*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"【[^】]+】", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return ""

    # Prefer the first sentence for readability.
    first_sentence = re.split(r"(?<=[.!?])\s+", text)[0].strip()
    summary = first_sentence if len(first_sentence) >= 40 else text

    if len(summary) <= max_len:
        return summary
    return summary[:max_len].rstrip() + "..."


class ProductService:
    """商品服务"""
    
    async def search_products(
        self,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        搜索商品
        
        Args:
            params: 搜索参数
        
        Returns:
            搜索结果
        """
        try:
            # 构建查询条件
            conditions = ["1=1"]
            args = []
            arg_idx = 1
            
            # 关键词搜索
            keyword = params.get("keyword")
            if keyword:
                conditions.append(f"(title ILIKE ${arg_idx} OR description ILIKE ${arg_idx})")
                args.append(f"%{keyword}%")
                arg_idx += 1
            
            # 类目筛选
            if params.get("category_l1"):
                conditions.append(f"category_l1 = ${arg_idx}")
                args.append(params["category_l1"])
                arg_idx += 1
            
            if params.get("category_l2"):
                conditions.append(f"category_l2 = ${arg_idx}")
                args.append(params["category_l2"])
                arg_idx += 1
            
            if params.get("category_l3"):
                conditions.append(f"category_l3 = ${arg_idx}")
                args.append(params["category_l3"])
                arg_idx += 1
            
            # 风格筛选
            if params.get("styles"):
                styles = params["styles"]
                if isinstance(styles, str):
                    styles = [styles]
                conditions.append(f"styles && ${arg_idx}::text[]")
                args.append(styles)
                arg_idx += 1
            
            # 材质筛选
            if params.get("materials"):
                materials = params["materials"]
                if isinstance(materials, str):
                    materials = [materials]
                conditions.append(f"materials && ${arg_idx}::text[]")
                args.append(materials)
                arg_idx += 1
            
            # 颜色筛选
            if params.get("colors"):
                colors = params["colors"]
                if isinstance(colors, str):
                    colors = [colors]
                conditions.append(f"colors && ${arg_idx}::text[]")
                args.append(colors)
                arg_idx += 1

            # 场景筛选
            if params.get("scenes"):
                scenes = params["scenes"]
                if isinstance(scenes, str):
                    scenes = [scenes]
                conditions.append(f"scenes && ${arg_idx}::text[]")
                args.append(scenes)
                arg_idx += 1
            
            # 价格筛选
            if params.get("min_price"):
                conditions.append(f"price_current >= ${arg_idx}")
                args.append(Decimal(str(params["min_price"])))
                arg_idx += 1
            
            if params.get("max_price"):
                conditions.append(f"price_current <= ${arg_idx}")
                args.append(Decimal(str(params["max_price"])))
                arg_idx += 1
            
            # 计算总数
            count_query = f"""
                SELECT COUNT(*) as total
                FROM products
                WHERE {' AND '.join(conditions)}
            """
            count_result = await execute_query(count_query, *args, fetch_one=True)
            total = count_result["total"] if count_result else 0
            
            # 排序
            sort_by = params.get("sort_by", "relevance")
            order_clause = "ORDER BY "
            
            if sort_by == "price_asc":
                order_clause += "price_current ASC"
            elif sort_by == "price_desc":
                order_clause += "price_current DESC"
            elif sort_by == "rating":
                order_clause += "rating DESC"
            else:
                order_clause += "id DESC"  # 默认按 ID 倒序
            
            # 分页
            page = max(1, params.get("page", 1))
            page_size = min(max(1, params.get("page_size", 20)), 100)
            offset = (page - 1) * page_size
            
            # 主查询
            query = f"""
                SELECT
                    id, sku_id, spu_id, title, category_l1, category_l2, category_l3,
                    price_current, price_original, currency,
                    styles, materials, colors, scenes,
                    inventory, images, description, rating, review_count,
                    created_at, updated_at
                FROM products
                WHERE {' AND '.join(conditions)}
                {order_clause}
                LIMIT ${arg_idx} OFFSET ${arg_idx + 1}
            """
            args.extend([page_size, offset])
            
            rows = await execute_query(query, *args)
            
            # 转换为响应模型
            products = []
            for row in rows:
                product = ProductResponse(
                    id=row["id"],
                    spu_id=row["sku_id"],   # expose sku_id as the product identifier
                    title=row["title"],
                    category_l1=row["category_l1"],
                    category_l2=row["category_l2"],
                    category_l3=row["category_l3"],
                    price_current=row["price_current"],
                    price_original=row["price_original"],
                    currency=row["currency"],
                    styles=row["styles"] or [],
                    materials=row["materials"] or [],
                    colors=row["colors"] or [],
                    sizes=[],
                    scenes=row["scenes"] or [],
                    inventory=row["inventory"],
                    images=row["images"] or [],
                    description=_to_concise_description(row["description"]),
                    rating=row["rating"],
                    review_count=row["review_count"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"]
                )
                products.append(product)
            
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "products": [p.model_dump() for p in products]
            }
            
        except Exception as e:
            logger.error(f"Search products failed: {e}")
            raise
    
    async def get_product(self, spu_id: str) -> Optional[Dict]:
        """
        获取商品详情
        
        Args:
            spu_id: 商品 SPU ID
        
        Returns:
            商品详情
        """
        query = """
            SELECT
                id, sku_id, spu_id, title, category_l1, category_l2, category_l3,
                price_current, price_original, currency,
                styles, materials, colors, scenes,
                inventory, images, description, rating, review_count,
                source_url, created_at, updated_at
            FROM products
            WHERE sku_id = $1
        """
        row = await execute_query(query, spu_id, fetch_one=True)
        
        if not row:
            return None
        
        return {
            "id": row["id"],
            "spu_id": row["sku_id"],
            "title": row["title"],
            "category": {
                "l1": row["category_l1"],
                "l2": row["category_l2"],
                "l3": row["category_l3"]
            },
            "price": {
                "current": float(row["price_current"]) if row["price_current"] else None,
                "original": float(row["price_original"]) if row["price_original"] else None,
                "currency": row["currency"]
            },
            "attributes": {
                "styles": row["styles"] or [],
                "materials": row["materials"] or [],
                "colors": row["colors"] or [],
                "sizes": [],
                "scenes": row["scenes"] or []
            },
            "inventory": row["inventory"],
            "images": row["images"] or [],
            "description": _to_concise_description(row["description"]),
            "rating": float(row["rating"]) if row["rating"] else None,
            "review_count": row["review_count"],
            "source_url": row["source_url"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
        }
    
    async def get_similar_products(self, spu_id: str, limit: int = 10) -> List[Dict]:
        """
        获取相似商品
        
        基于类目和风格相似度
        """
        # 先获取目标商品信息
        product = await self.get_product(spu_id)
        if not product:
            return []
        
        # 查询相似商品
        query = """
            SELECT
                sku_id, title, price_current, images, styles, rating
            FROM products
            WHERE sku_id != $1
                AND category_l1 = $2
                AND (styles && $3::text[] OR materials && $4::text[])
            ORDER BY rating DESC, price_current ASC
            LIMIT $5
        """

        attrs = product.get("attributes", {})
        rows = await execute_query(
            query,
            spu_id,
            product.get("category", {}).get("l1"),
            attrs.get("styles", []),
            attrs.get("materials", []),
            limit
        )

        return [
            {
                "spu_id": row["sku_id"],
                "title": row["title"],
                "price": float(row["price_current"]) if row["price_current"] else 0,
                "image": row["images"][0] if row["images"] else None,
                "styles": row["styles"] or [],
                "rating": float(row["rating"]) if row["rating"] else 0
            }
            for row in rows
        ]
    
    async def get_complementary_products(self, spu_id: str, limit: int = 10) -> List[Dict]:
        """
        获取搭配商品
        
        基于场景和风格搭配
        """
        product = await self.get_product(spu_id)
        if not product:
            return []
        
        # 查询互补商品（不同类目但同场景）
        query = """
            SELECT
                sku_id, title, category_l1, price_current, images, styles
            FROM products
            WHERE sku_id != $1
                AND category_l1 != $2
                AND scenes && $3::text[]
            ORDER BY rating DESC
            LIMIT $4
        """

        attrs = product.get("attributes", {})
        rows = await execute_query(
            query,
            spu_id,
            product.get("category", {}).get("l1"),
            attrs.get("scenes", []),
            limit
        )

        return [
            {
                "spu_id": row["sku_id"],
                "title": row["title"],
                "category": row["category_l1"],
                "price": float(row["price_current"]) if row["price_current"] else 0,
                "image": row["images"][0] if row["images"] else None,
                "styles": row["styles"] or []
            }
            for row in rows
        ]
    
    async def get_filter_options(self, category_l1: Optional[str] = None) -> Dict:
        """
        获取筛选选项
        """
        conditions = []
        args = []
        
        if category_l1:
            conditions.append("category_l1 = $1")
            args.append(category_l1)
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        # 获取所有可用的筛选值
        queries = {
            "categories": f"""
                SELECT DISTINCT category_l1, category_l2, category_l3
                FROM products
                {where_clause}
                ORDER BY category_l1, category_l2, category_l3
            """,
            "styles": f"""
                SELECT DISTINCT UNNEST(styles) as style
                FROM products
                {where_clause}
                ORDER BY style
            """,
            "materials": f"""
                SELECT DISTINCT UNNEST(materials) as material
                FROM products
                {where_clause}
                ORDER BY material
            """,
            "colors": f"""
                SELECT DISTINCT UNNEST(colors) as color
                FROM products
                {where_clause}
                ORDER BY color
            """,
            "scenes": f"""
                SELECT DISTINCT UNNEST(scenes) as scene
                FROM products
                {where_clause}
                ORDER BY scene
            """,
            "price_range": f"""
                SELECT 
                    MIN(price_current) as min_price,
                    MAX(price_current) as max_price
                FROM products
                {where_clause}
            """
        }
        
        results = {}
        for key, query in queries.items():
            if key == "price_range":
                row = await execute_query(query, *args, fetch_one=True)
                results[key] = {
                    "min": float(row["min_price"]) if row and row["min_price"] else 0,
                    "max": float(row["max_price"]) if row and row["max_price"] else 0
                }
            elif key == "categories":
                rows = await execute_query(query, *args)
                results[key] = self._build_category_tree(rows)
            else:
                rows = await execute_query(query, *args)
                results[key] = [row[key.rstrip("s")] for row in rows if row[key.rstrip("s")]]
        
        return results
    
    def _build_category_tree(self, rows: list) -> List[Dict]:
        """构建类目树"""
        tree = {}
        
        for row in rows:
            l1 = row["category_l1"]
            l2 = row["category_l2"]
            l3 = row["category_l3"]
            
            if not l1:
                continue
            
            if l1 not in tree:
                tree[l1] = {"name": l1, "children": {}}
            
            if l2:
                if l2 not in tree[l1]["children"]:
                    tree[l1]["children"][l2] = {"name": l2, "children": []}
                
                if l3 and l3 not in tree[l1]["children"][l2]["children"]:
                    tree[l1]["children"][l2]["children"].append(l3)
        
        # 转换为列表格式
        result = []
        for l1_name, l1_data in tree.items():
            l1_node = {"name": l1_name, "children": []}
            for l2_name, l2_data in l1_data["children"].items():
                l2_node = {"name": l2_name, "children": l2_data["children"]}
                l1_node["children"].append(l2_node)
            result.append(l1_node)
        
        return result
    
    async def get_categories(self, parent: Optional[str] = None) -> List[Dict]:
        """
        获取类目列表
        """
        if parent:
            query = """
                SELECT DISTINCT category_l2 as name
                FROM products
                WHERE category_l1 = $1
                ORDER BY name
            """
            rows = await execute_query(query, parent)
        else:
            query = """
                SELECT DISTINCT category_l1 as name
                FROM products
                ORDER BY name
            """
            rows = await execute_query(query)
        
        return [{"name": row["name"], "value": row["name"]} for row in rows if row["name"]]
