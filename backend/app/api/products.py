"""
商品查询 API
路径: /api/products/*
"""
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query

from app.models.product import (
    ProductSearchParams, ProductSearchResult,
    ProductFilterOptions, ProductResponse
)
from app.services.product_service import ProductService
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["商品"])


def _normalize_images(value) -> List[str]:
    """Normalize DB image column (TEXT[]/JSONB/list) to string list."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    return [str(value)]


@router.get("/featured", response_model=dict)
async def get_featured_products(
    limit: int = Query(default=8, ge=1, le=50, description="返回数量"),
    category: Optional[str] = Query(None, description="类目过滤"),
):
    """
    获取首页/展示用精选商品

    从 PostgreSQL 随机返回高质量、有图片的真实商品，
    用于首页 Mosaic、Schemes 演示模式等场景。
    """
    try:
        from app.core.database import execute_query

        cat_clause = "AND category_l1 = $2" if category else ""
        args: list = [limit]
        if category:
            args.append(category)

        rows = await execute_query(
            f"""
            SELECT
                sku_id, spu_id, title, category_l1,
                COALESCE(
                    NULLIF(main_image, ''),
                    (to_jsonb(images) ->> 0)
                ) AS primary_image,
                images,
                price_current, price_original, currency,
                rating, review_count,
                styles, materials, colors, scenes,
                inventory
            FROM products
            WHERE COALESCE(NULLIF(main_image, ''), (to_jsonb(images) ->> 0)) IS NOT NULL
              AND price_current > 0
              {cat_clause}
            ORDER BY RANDOM()
            LIMIT $1
            """,
            *args,
        )

        products = []
        for r in rows:
            image_list = _normalize_images(r["images"])
            primary_image = r["primary_image"] or (image_list[0] if image_list else None)
            if not image_list and primary_image:
                image_list = [primary_image]

            products.append(
                {
                    "id": r["sku_id"],
                    "sku_id": r["sku_id"],
                    "spu_id": r["spu_id"],
                    "name": r["title"],
                    "title": r["title"],
                    "category": r["category_l1"] or "",
                    "category_l1": r["category_l1"] or "",
                    "price": float(r["price_current"]) if r["price_current"] else 0,
                    "price_current": float(r["price_current"]) if r["price_current"] else 0,
                    "originalPrice": float(r["price_original"]) if r["price_original"] else None,
                    "price_original": float(r["price_original"]) if r["price_original"] else None,
                    "currency": r["currency"] or "USD",
                    "image": primary_image,
                    "images": image_list,
                    "rating": float(r["rating"]) if r["rating"] else 0,
                    "review_count": r["review_count"] or 0,
                    "reviewCount": r["review_count"] or 0,
                    "styles": list(r["styles"]) if r["styles"] else [],
                    "materials": list(r["materials"]) if r["materials"] else [],
                    "colors": list(r["colors"]) if r["colors"] else [],
                    "scenes": list(r["scenes"]) if r["scenes"] else [],
                    "inventory": r["inventory"] or 0,
                    "inStock": (r["inventory"] or 0) > 0,
                    "tags": list(r["styles"])[:2] if r["styles"] else [],
                    "description": "",
                }
            )

        return get_standard_response(data={"products": products, "total": len(products)})

    except Exception as e:
        logger.error(f"Get featured products failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search", response_model=dict)
async def search_products(
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    category_l1: Optional[str] = Query(None, description="一级类目"),
    category_l2: Optional[str] = Query(None, description="二级类目"),
    category_l3: Optional[str] = Query(None, description="三级类目"),
    styles: Optional[str] = Query(None, description="风格筛选(逗号分隔)"),
    materials: Optional[str] = Query(None, description="材质筛选(逗号分隔)"),
    colors: Optional[str] = Query(None, description="颜色筛选(逗号分隔)"),
    scenes: Optional[str] = Query(None, description="场景筛选(逗号分隔)"),
    min_price: Optional[float] = Query(None, description="最低价格"),
    max_price: Optional[float] = Query(None, description="最高价格"),
    sort_by: str = Query(default="relevance", description="排序方式"),
    page: int = Query(default=1, ge=1, description="页码"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量")
):
    """
    搜索商品
    
    支持多维度筛选和排序
    """
    try:
        # 解析数组参数
        styles_list = styles.split(",") if styles else None
        materials_list = materials.split(",") if materials else None
        colors_list = colors.split(",") if colors else None
        scenes_list = scenes.split(",") if scenes else None
        
        params = ProductSearchParams(
            keyword=keyword,
            category_l1=category_l1,
            category_l2=category_l2,
            category_l3=category_l3,
            styles=styles_list,
            materials=materials_list,
            colors=colors_list,
            scenes=scenes_list,
            min_price=min_price,
            max_price=max_price,
            sort_by=sort_by,
            page=page,
            page_size=page_size
        )
        
        service = ProductService()
        result = await service.search_products(params.dict(exclude_none=True))
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Search products failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{spu_id}", response_model=dict)
async def get_product(spu_id: str):
    """
    获取商品详情
    """
    try:
        service = ProductService()
        result = await service.get_product(spu_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return get_standard_response(data=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get product failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{spu_id}/similar", response_model=dict)
async def get_similar_products(
    spu_id: str,
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    获取相似商品
    """
    try:
        service = ProductService()
        result = await service.get_similar_products(spu_id, limit)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get similar products failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{spu_id}/recommendations", response_model=dict)
async def get_product_recommendations(
    spu_id: str,
    limit: int = Query(default=10, ge=1, le=50)
):
    """
    获取商品搭配推荐
    """
    try:
        service = ProductService()
        result = await service.get_complementary_products(spu_id, limit)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get product recommendations failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filters/options", response_model=dict)
async def get_filter_options(
    category_l1: Optional[str] = Query(None, description="一级类目")
):
    """
    获取筛选选项
    
    返回可用的类目、风格、材质、颜色等筛选选项
    """
    try:
        service = ProductService()
        result = await service.get_filter_options(category_l1)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get filter options failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories/list", response_model=dict)
async def get_categories(
    parent: Optional[str] = Query(None, description="父类目")
):
    """
    获取类目列表
    """
    try:
        service = ProductService()
        result = await service.get_categories(parent)
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get categories failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-style/{style}", response_model=dict)
async def get_products_by_style(
    style: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100)
):
    """
    按风格获取商品
    """
    try:
        service = ProductService()
        result = await service.search_products({
            "styles": [style],
            "page": page,
            "page_size": page_size
        })
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get products by style failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-scene/{scene}", response_model=dict)
async def get_products_by_scene(
    scene: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100)
):
    """
    按场景获取商品
    """
    try:
        service = ProductService()
        result = await service.search_products({
            "scenes": [scene],
            "page": page,
            "page_size": page_size
        })
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get products by scene failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-material/{material}", response_model=dict)
async def get_products_by_material(
    material: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100)
):
    """
    按材质获取商品
    """
    try:
        service = ProductService()
        result = await service.search_products({
            "materials": [material],
            "page": page,
            "page_size": page_size
        })
        
        return get_standard_response(data=result)
        
    except Exception as e:
        logger.error(f"Get products by material failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
