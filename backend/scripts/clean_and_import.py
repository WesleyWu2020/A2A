#!/usr/bin/env python3
"""
Homary 商品数据清洗与导入脚本 (v2)

关键改进:
- 使用 sku_id_default 作为唯一键去重（而非 spu_id）
- 修复图片URL：剥离 Cloudflare CDN 转换前缀，保留真实图片地址
- Schema 与 product_service.py 保持一致 (category_l1/l2/l3)
- 每个 SKU 变体独立存储，充分利用全量数据
"""
import json
import re
import random
import asyncio
import asyncpg
from typing import List, Dict, Any, Optional
from datetime import datetime

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'user': 'nex',
    'password': 'nex_password',
    'database': 'nex_db'
}

# 风格关键词映射
STYLE_KEYWORDS = {
    'modern': ['modern', 'contemporary', 'minimalist', 'scandinavian', 'nordic'],
    'industrial': ['industrial', 'loft', 'vintage', 'rustic', 'metal'],
    'traditional': ['traditional', 'classic', 'victorian', 'elegant'],
    'mid_century': ['mid-century', 'mid century', 'retro'],
    'farmhouse': ['farmhouse', 'country', 'cottage'],
    'bohemian': ['bohemian', 'boho'],
    'coastal': ['coastal', 'nautical', 'beach'],
    'glam': ['glam', 'luxury', 'crystal', 'gold']
}

# 材质关键词
MATERIAL_KEYWORDS = [
    'wood', 'metal', 'glass', 'fabric', 'leather', 'marble', 'concrete',
    'brass', 'steel', 'chrome', 'nickel', 'bronze', 'copper',
    'cotton', 'linen', 'velvet', 'wool', 'silk',
    'oak', 'walnut', 'pine', 'birch', 'bamboo', 'rattan'
]

# 颜色关键词
COLOR_KEYWORDS = [
    'black', 'white', 'gray', 'grey', 'brown', 'beige', 'cream', 'ivory',
    'navy', 'blue', 'green', 'red', 'yellow', 'orange', 'purple', 'pink',
    'gold', 'silver', 'bronze', 'copper', 'natural', 'walnut', 'oak'
]

# 场景关键词
SCENE_KEYWORDS = {
    'living_room': ['living room', 'lounge', 'sofa', 'couch', 'sectional'],
    'bedroom': ['bedroom', 'bed', 'dresser', 'nightstand', 'wardrobe'],
    'dining': ['dining', 'kitchen', 'table', 'chair', 'bar stool'],
    'office': ['office', 'desk', 'workspace', 'study'],
    'bathroom': ['bathroom', 'vanity', 'bathtub', 'shower', 'faucet', 'sink'],
    'outdoor': ['outdoor', 'patio', 'garden', 'balcony'],
    'entryway': ['entryway', 'hallway', 'foyer', 'console']
}


def fix_image_url(url: str) -> str:
    """
    修复图片URL：剥离 Cloudflare CDN 转换前缀，返回真实图片地址。

    输入: https://img5.su-cdn.com/cdn-cgi/image/width=750,height=750,format=webp/mall/file/xxx.jpg
    输出: https://img5.su-cdn.com/mall/file/xxx.jpg
    """
    if not url:
        return url
    # 匹配 Cloudflare image resize 路径格式
    match = re.search(r'https?://[^/]+/cdn-cgi/image/[^/]+/(.*)', url)
    if match:
        # 提取域名
        domain_match = re.match(r'(https?://[^/]+)', url)
        if domain_match:
            domain = domain_match.group(1)
            path = match.group(1)
            return f"{domain}/{path}"
    return url


def extract_styles(text: str) -> List[str]:
    """从标题/描述提取风格标签"""
    if not text:
        return ['modern']
    text_lower = text.lower()
    styles = []
    for style, keywords in STYLE_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            styles.append(style)
    return styles if styles else ['modern']


def extract_materials(text: str) -> List[str]:
    """从标题/描述提取材质"""
    if not text:
        return []
    text_lower = text.lower()
    return [m for m in MATERIAL_KEYWORDS if m in text_lower]


def extract_colors(text: str) -> List[str]:
    """从标题/描述提取颜色"""
    if not text:
        return []
    text_lower = text.lower()
    return [c for c in COLOR_KEYWORDS if c in text_lower]


def extract_scenes(text: str) -> List[str]:
    """从标题/描述推断使用场景"""
    if not text:
        return []
    text_lower = text.lower()
    scenes = []
    for scene, keywords in SCENE_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            scenes.append(scene)
    return scenes


def parse_price(price_info: Dict) -> Dict[str, float]:
    """从价格信息解析当前价、原价、底价"""
    if not price_info:
        return {'current': 0.0, 'original': 0.0, 'floor': 0.0}
    try:
        current = float(price_info.get('p', 0) or price_info.get('fp', 0) or 0)
        original = float(price_info.get('np', 0) or price_info.get('cp', 0) or 0)

        if original == 0 or original < current:
            original = current

        floor = round(current * random.uniform(0.7, 0.9), 2) if current > 0 else 0.0

        return {'current': current, 'original': original, 'floor': floor}
    except (ValueError, TypeError):
        return {'current': 0.0, 'original': 0.0, 'floor': 0.0}


def clean_product(raw: Dict) -> Optional[Dict[str, Any]]:
    """
    清洗单条原始数据，以 sku_id_default 为唯一标识。
    返回 None 表示数据无效（无图片或无价格）。
    """
    sku_id = str(raw.get('sku_id_default', '')).strip()
    if not sku_id:
        return None

    title = (raw.get('title') or '').strip()
    categories = raw.get('categories', {}) or {}
    price_info = parse_price(raw.get('price_info_default', {}))

    # 必须有价格
    if price_info['current'] <= 0:
        return None

    # 处理主图：修复CDN转换URL
    raw_main_img = raw.get('product_main_img', '') or ''
    main_image = fix_image_url(raw_main_img)

    # 必须有主图
    if not main_image:
        return None

    # 处理图片列表：修复所有CDN转换URL
    product_imgs = raw.get('product_img') or []
    if not isinstance(product_imgs, list):
        product_imgs = []

    images = []
    for img in product_imgs[:8]:
        if img and isinstance(img, dict):
            url = fix_image_url(img.get('img_url', '') or '')
            if url:
                images.append(url)

    # 确保主图在列表中
    if main_image and main_image not in images:
        images.insert(0, main_image)

    # 去重
    seen = set()
    images = [u for u in images if u not in seen and not seen.add(u)]

    # 类目
    cat_l1 = categories.get('name1', '') or ''
    cat_l2 = categories.get('name2', '') or ''
    cat_l3 = categories.get('name3', '') or ''

    # 文本合并用于标签提取
    combined_text = f"{title} {raw.get('sub_title', '') or ''} {cat_l1} {cat_l2}"

    # URL
    source_url = raw.get('url') or raw.get('canonical') or ''

    return {
        'sku_id': sku_id,
        'spu_id': str(raw.get('spu_id', '') or ''),
        'spu_code': raw.get('spu_code', '') or '',
        'title': title,
        'description': raw.get('description', '') or '',
        'category_l1': cat_l1,
        'category_l2': cat_l2,
        'category_l3': cat_l3,
        'main_image': main_image,
        'images': images,
        'price_current': price_info['current'],
        'price_original': price_info['original'],
        'price_floor': price_info['floor'],
        'currency': 'USD',
        'rating': float(raw.get('ratingValue', 0) or 0),
        'review_count': int(raw.get('reviewCount', 0) or 0),
        'styles': extract_styles(combined_text),
        'materials': extract_materials(combined_text),
        'colors': extract_colors(combined_text),
        'scenes': extract_scenes(combined_text),
        'inventory': random.randint(5, 500),
        'source_url': source_url,
    }


def load_and_clean_data(input_file: str) -> List[Dict]:
    """加载并清洗数据，以 sku_id_default 去重"""
    print(f"Loading: {input_file}")

    products = []
    seen_skus = set()
    total = 0
    skipped_no_sku = 0
    skipped_no_price = 0
    skipped_no_img = 0
    skipped_dup = 0

    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                total += 1

                sku_id = str(raw.get('sku_id_default', '')).strip()
                if not sku_id:
                    skipped_no_sku += 1
                    continue

                if sku_id in seen_skus:
                    skipped_dup += 1
                    continue
                seen_skus.add(sku_id)

                cleaned = clean_product(raw)
                if cleaned is None:
                    # 判断是价格还是图片问题
                    price_info = parse_price(raw.get('price_info_default', {}))
                    if price_info['current'] <= 0:
                        skipped_no_price += 1
                    else:
                        skipped_no_img += 1
                    continue

                products.append(cleaned)

            except json.JSONDecodeError:
                continue

    print(f"\nCleaning stats:")
    print(f"  Total records: {total}")
    print(f"  No sku_id_default: {skipped_no_sku}")
    print(f"  Duplicate sku_id: {skipped_dup}")
    print(f"  No price: {skipped_no_price}")
    print(f"  No image: {skipped_no_img}")
    print(f"  Valid products: {len(products)}")
    return products


async def init_database(conn: asyncpg.Connection):
    """重建商品表（与 product_service.py 对齐的 schema）"""
    print("\nRebulding products table...")

    await conn.execute('DROP TABLE IF EXISTS products CASCADE;')

    await conn.execute('''
        CREATE TABLE products (
            id          SERIAL PRIMARY KEY,
            sku_id      VARCHAR(64) UNIQUE NOT NULL,
            spu_id      VARCHAR(64),
            spu_code    VARCHAR(100),
            title       TEXT NOT NULL,
            description TEXT,
            category_l1 VARCHAR(100),
            category_l2 VARCHAR(100),
            category_l3 VARCHAR(100),
            main_image  TEXT,
            images      TEXT[],
            price_current  DECIMAL(12, 2),
            price_original DECIMAL(12, 2),
            price_floor    DECIMAL(12, 2),
            currency    VARCHAR(10) DEFAULT 'USD',
            rating      DECIMAL(3, 2) DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            styles      TEXT[],
            materials   TEXT[],
            colors      TEXT[],
            scenes      TEXT[],
            inventory   INTEGER DEFAULT 0,
            source_url  VARCHAR(1000),
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    await conn.execute('''
        CREATE INDEX idx_products_sku_id    ON products(sku_id);
        CREATE INDEX idx_products_spu_id    ON products(spu_id);
        CREATE INDEX idx_products_category  ON products(category_l1, category_l2, category_l3);
        CREATE INDEX idx_products_price     ON products(price_current);
        CREATE INDEX idx_products_rating    ON products(rating);
        CREATE INDEX idx_products_styles    ON products USING GIN(styles);
        CREATE INDEX idx_products_materials ON products USING GIN(materials);
        CREATE INDEX idx_products_colors    ON products USING GIN(colors);
        CREATE INDEX idx_products_scenes    ON products USING GIN(scenes);
    ''')

    print("Table created.")


async def insert_products(conn: asyncpg.Connection, products: List[Dict]):
    """批量插入商品"""
    batch_size = 200
    total = len(products)

    for i in range(0, total, batch_size):
        batch = products[i:i + batch_size]
        values = [
            (
                p['sku_id'], p['spu_id'], p['spu_code'],
                p['title'], p['description'],
                p['category_l1'], p['category_l2'], p['category_l3'],
                p['main_image'], p['images'],
                p['price_current'], p['price_original'], p['price_floor'], p['currency'],
                p['rating'], p['review_count'],
                p['styles'], p['materials'], p['colors'], p['scenes'],
                p['inventory'], p['source_url']
            )
            for p in batch
        ]

        await conn.executemany('''
            INSERT INTO products (
                sku_id, spu_id, spu_code,
                title, description,
                category_l1, category_l2, category_l3,
                main_image, images,
                price_current, price_original, price_floor, currency,
                rating, review_count,
                styles, materials, colors, scenes,
                inventory, source_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22
            )
            ON CONFLICT (sku_id) DO UPDATE SET
                title          = EXCLUDED.title,
                main_image     = EXCLUDED.main_image,
                images         = EXCLUDED.images,
                price_current  = EXCLUDED.price_current,
                price_original = EXCLUDED.price_original,
                price_floor    = EXCLUDED.price_floor,
                styles         = EXCLUDED.styles,
                materials      = EXCLUDED.materials,
                colors         = EXCLUDED.colors,
                scenes         = EXCLUDED.scenes,
                inventory      = EXCLUDED.inventory,
                updated_at     = CURRENT_TIMESTAMP
        ''', values)

        done = min(i + batch_size, total)
        print(f"  Inserted {done}/{total}")

    print(f"Import complete: {total} products")


async def generate_statistics(conn: asyncpg.Connection):
    """生成数据统计报告"""
    print("\n========== Statistics ==========")

    total = await conn.fetchval('SELECT COUNT(*) FROM products')
    print(f"Total products (by sku_id): {total}")

    unique_spus = await conn.fetchval('SELECT COUNT(DISTINCT spu_id) FROM products')
    print(f"Unique SPUs: {unique_spus}")

    # 图片URL检查
    img_transform = await conn.fetchval(
        "SELECT COUNT(*) FROM products WHERE main_image LIKE '%cdn-cgi/image%'"
    )
    print(f"Images still with CDN transform: {img_transform} (should be 0)")

    real_imgs = await conn.fetchval(
        "SELECT COUNT(*) FROM products WHERE main_image NOT LIKE '%cdn-cgi/image%' AND main_image != ''"
    )
    print(f"Products with real image URLs: {real_imgs}")

    print("\nTop categories:")
    cats = await conn.fetch('''
        SELECT category_l1, COUNT(*) as cnt
        FROM products
        GROUP BY category_l1
        ORDER BY cnt DESC
        LIMIT 10
    ''')
    for c in cats:
        print(f"  {c['category_l1'] or 'Unknown':40s} {c['cnt']}")

    stats = await conn.fetchrow('''
        SELECT
            MIN(price_current) as min_p,
            MAX(price_current) as max_p,
            ROUND(AVG(price_current)::numeric, 2) as avg_p
        FROM products
    ''')
    print(f"\nPrice range: ${stats['min_p']:.2f} – ${stats['max_p']:.2f}  (avg ${stats['avg_p']:.2f})")


async def main():
    input_file = '/Users/dmiwu/work/PythonProject/a2a-main/homary.json'

    products = load_and_clean_data(input_file)

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await init_database(conn)
        await insert_products(conn, products)
        await generate_statistics(conn)
    finally:
        await conn.close()

    print("\n✅ Done!")


if __name__ == '__main__':
    asyncio.run(main())
