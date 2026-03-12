#!/usr/bin/env python3
"""
商品数据清洗处理脚本
处理 homary.json 文件，提取、清洗并标准化商品数据
"""

import json
import re
import random
from collections import defaultdict
from datetime import datetime

# 风格关键词映射
STYLE_KEYWORDS = {
    "Modern": ["modern", "contemporary", "sleek", "minimalist", "clean"],
    "Traditional": ["traditional", "classic", "vintage", "antique", "rustic"],
    "Industrial": ["industrial", "metal", "steel", "iron", "factory"],
    "Minimalist": ["minimalist", "simple", "clean", "basic", "scandinavian"],
    "Farmhouse": ["farmhouse", "country", "rural", "barn", "cottage"],
    "Mid-Century": ["mid-century", "midcentury", "retro", "50s", "60s"],
    "Bohemian": ["bohemian", "boho", "eclectic", "artistic", "ethnic"],
    "Coastal": ["coastal", "beach", "nautical", "seaside", "ocean"],
    "Transitional": ["transitional", "timeless", "versatile", "neutral"],
}

# 材质关键词
MATERIAL_KEYWORDS = {
    "Brass": ["brass", "solid brass"],
    "Stainless Steel": ["stainless steel", "sus304", "sus 304"],
    "Chrome": ["chrome", "chromed"],
    "Matte Black": ["matte black", "black finish"],
    "Brushed Nickel": ["brushed nickel", "nickel"],
    "Glass": ["glass", "tempered glass", "crystal"],
    "Ceramic": ["ceramic", "porcelain"],
    "Wood": ["wood", "wooden", "oak", "walnut", "pine"],
    "Marble": ["marble", "stone"],
    "Aluminum": ["aluminum", "aluminium"],
    "Copper": ["copper", "bronze"],
    "Zinc Alloy": ["zinc alloy", "zinc"],
    "Plastic": ["plastic", "pvc", "abs"],
}

# 尺寸提取模式
SIZE_PATTERNS = [
    r'(\d+(?:\.\d+)?)\s*["\']?\s*x\s*(\d+(?:\.\d+)?)\s*["\']?\s*x\s*(\d+(?:\.\d+)?)\s*["\']?',  # L x W x H
    r'(\d+(?:\.\d+)?)\s*["\']?\s*x\s*(\d+(?:\.\d+)?)\s*["\']?',  # L x W
    r'(\d+(?:\.\d+)?)\s*(?:inches?|in|"|cm|mm)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:inches?|in|"|cm|mm)',  # with units
]

def extract_style(title):
    """从标题中提取风格标签"""
    if not title:
        return ["Modern"]  # 默认风格
    
    title_lower = title.lower()
    styles = []
    
    for style, keywords in STYLE_KEYWORDS.items():
        if any(keyword in title_lower for keyword in keywords):
            styles.append(style)
    
    # 如果没有匹配到，默认为Modern
    if not styles:
        styles = ["Modern"]
    
    return styles

def extract_materials(title, details):
    """从标题和详情中提取材质信息"""
    materials = []
    text = (title or "").lower()
    
    # 从details中提取
    if details:
        for detail in details:
            key = (detail.get("key_en") or "").lower()
            if "material" in key:
                value = (detail.get("value") or "").lower()
                text += " " + value
    
    for material, keywords in MATERIAL_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            materials.append(material)
    
    return list(set(materials)) if materials else ["Brass"]

def extract_size(title):
    """从标题中提取尺寸信息"""
    if not title:
        return None
    
    for pattern in SIZE_PATTERNS:
        match = re.search(pattern, title, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                return {"length": float(groups[0]), "width": float(groups[1]), "height": float(groups[2])}
            elif len(groups) == 2:
                return {"length": float(groups[0]), "width": float(groups[1])}
    
    return None

def parse_price(price_info):
    """解析价格信息"""
    if not price_info:
        return None
    
    try:
        current_price = float(price_info.get("p", 0))
        original_price = float(price_info.get("np", 0)) if price_info.get("np") else current_price
        
        # 生成底价（标价的70%-90%）
        discount_factor = random.uniform(0.70, 0.90)
        floor_price = round(current_price * discount_factor, 2)
        
        return {
            "current": current_price,
            "original": original_price if original_price > current_price else current_price * 1.2,
            "floor": floor_price,
            "currency": "USD"
        }
    except (ValueError, TypeError):
        return None

def extract_details_map(details):
    """将details转换为键值对"""
    result = {}
    if not details:
        return result
    
    for detail in details:
        key = detail.get("key_en") or detail.get("key")
        value = detail.get("value")
        if key and value:
            result[key.lower().replace(" ", "_")] = value
    
    return result

def process_product(raw_product):
    """处理单个商品数据"""
    # 基础字段
    spu_id = raw_product.get("spu_id")
    spu_code = raw_product.get("spu_code")
    title = raw_product.get("title")
    
    # 过滤：没有图片的商品
    main_img = raw_product.get("product_main_img")
    if not main_img:
        return None
    
    # 类目信息
    categories = raw_product.get("categories", {})
    category = {
        "level1": categories.get("name1"),
        "level2": categories.get("name2"),
        "level3": categories.get("name3"),
        "level4": categories.get("name4"),
    }
    
    # 主类目（用于过滤）
    main_category = categories.get("name1")
    if not main_category:
        return None
    
    # 价格信息
    price_info = raw_product.get("price_info_default", {})
    price = parse_price(price_info)
    if not price or price["current"] <= 0:
        # 模拟价格数据
        base_price = random.uniform(50, 500)
        price = {
            "current": round(base_price, 2),
            "original": round(base_price * 1.3, 2),
            "floor": round(base_price * 0.8, 2),
            "currency": "USD"
        }
    
    # 评分和评价
    try:
        rating = float(raw_product.get("ratingValue", 0))
    except (ValueError, TypeError):
        rating = 0.0
    
    try:
        review_count = int(raw_product.get("reviewCount", 0))
    except (ValueError, TypeError):
        review_count = 0
    
    # 图片
    images = []
    if main_img:
        images.append(main_img)
    
    product_imgs = raw_product.get("product_img", [])
    for img in product_imgs[:5]:  # 最多取5张
        img_url = img.get("img_url")
        if img_url and img_url not in images:
            images.append(img_url)
    
    # 风格标签
    styles = extract_style(title)
    
    # 详情字段
    details = raw_product.get("details", [])
    details_map = extract_details_map(details)
    
    # 材质
    materials = extract_materials(title, details)
    
    # 尺寸
    size = extract_size(title)
    
    # 描述
    description = raw_product.get("description", "")
    
    # 构建清洗后的商品数据
    cleaned_product = {
        "id": spu_id,
        "code": spu_code,
        "title": title,
        "category": category,
        "main_category": main_category,
        "price": price,
        "rating": round(rating, 1) if rating > 0 else round(random.uniform(3.8, 4.9), 1),
        "review_count": review_count if review_count > 0 else random.randint(5, 200),
        "images": images,
        "main_image": main_img,
        "styles": styles,
        "materials": materials,
        "size": size,
        "description": description[:500] if description else "",  # 截断描述
        "details": details_map,
        "url": raw_product.get("url", ""),
        "created_at": datetime.now().isoformat()
    }
    
    return cleaned_product

def main():
    print("=" * 60)
    print("开始处理商品数据...")
    print("=" * 60)
    
    # 读取原始数据
    raw_products = []
    input_file = "/home/ubuntu/projects/e2/homary.json"
    
    print(f"读取数据文件: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    raw_products.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"解析错误: {e}")
    
    total_count = len(raw_products)
    print(f"总共读取 {total_count} 条商品数据")
    
    # 处理数据
    cleaned_products = []
    filtered_count = 0
    
    for raw in raw_products:
        processed = process_product(raw)
        if processed:
            cleaned_products.append(processed)
        else:
            filtered_count += 1
    
    # 数据统计
    print("\n" + "=" * 60)
    print("数据统计报告")
    print("=" * 60)
    
    print(f"\n【基础统计】")
    print(f"  - 原始数据量: {total_count}")
    print(f"  - 过滤数量: {filtered_count}")
    print(f"  - 有效商品: {len(cleaned_products)}")
    
    # 类目统计
    category_stats = defaultdict(int)
    for p in cleaned_products:
        cat = p["main_category"]
        if cat:
            category_stats[cat] += 1
    
    print(f"\n【类目分布】")
    for cat, count in sorted(category_stats.items(), key=lambda x: -x[1]):
        print(f"  - {cat}: {count} ({count/len(cleaned_products)*100:.1f}%)")
    
    # 风格统计
    style_stats = defaultdict(int)
    for p in cleaned_products:
        for style in p["styles"]:
            style_stats[style] += 1
    
    print(f"\n【风格分布】")
    for style, count in sorted(style_stats.items(), key=lambda x: -x[1])[:10]:
        print(f"  - {style}: {count}")
    
    # 价格分布
    prices = [p["price"]["current"] for p in cleaned_products if p["price"]]
    if prices:
        print(f"\n【价格分布】")
        print(f"  - 平均价格: ${sum(prices)/len(prices):.2f}")
        print(f"  - 最低价格: ${min(prices):.2f}")
        print(f"  - 最高价格: ${max(prices):.2f}")
        
        # 价格区间
        ranges = [(0, 50), (50, 100), (100, 200), (200, 500), (500, 1000), (1000, float('inf'))]
        for min_p, max_p in ranges:
            count = sum(1 for p in prices if min_p <= p < max_p)
            label = f"${min_p}-${max_p}" if max_p < float('inf') else f"${min_p}+"
            print(f"  - {label}: {count} ({count/len(prices)*100:.1f}%)")
    
    # 评分统计
    ratings = [p["rating"] for p in cleaned_products]
    if ratings:
        print(f"\n【评分统计】")
        print(f"  - 平均评分: {sum(ratings)/len(ratings):.2f}")
    
    # 保存清洗后的数据
    output_file = "/home/ubuntu/projects/e2/backend/data/products_cleaned.json"
    print(f"\n保存清洗数据到: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(cleaned_products, f, indent=2, ensure_ascii=False)
    
    # 生成schema文档
    schema_file = "/home/ubuntu/projects/e2/backend/data/products_schema.md"
    schema_content = """# 商品数据结构说明

## 概述

本文档描述了清洗后的商品数据结构，用于多Agent家居电商Demo系统。

## 数据文件

- **文件路径**: `backend/data/products_cleaned.json`
- **数据格式**: JSON Array
- **商品数量": """ + str(len(cleaned_products)) + """
- **生成时间": """ + datetime.now().isoformat() + """

## 字段定义

### 基础信息

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `id` | string | 商品SPU ID | "10005" |
| `code` | string | 商品编码 | "H669170270-149" |
| `title` | string | 商品标题 | "Mill Modern Waterfall Wall-Mount Tub Filler..." |
| `main_category` | string | 主类目 | "Bath" |
| `category` | object | 类目层级信息 | 见下文 |
| `url` | string | 商品链接 | "https://www.homary.com/..." |
| `created_at` | string | 数据创建时间 | "2026-03-09T10:00:00" |

### 类目信息 (category)

```json
{
  "level1": "Bath",           // 一级类目
  "level2": "Faucets",        // 二级类目
  "level3": "Bathtub Faucets", // 三级类目
  "level4": null              // 四级类目（可能为空）
}
```

### 价格信息 (price)

```json
{
  "current": 99.99,    // 当前售价
  "original": 199.99,  // 原价
  "floor": 79.99,      // 底价（谈判下限）
  "currency": "USD"    // 货币单位
}
```

### 评价信息

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `rating` | number | 评分（0-5） | 4.7 |
| `review_count` | number | 评价数量 | 13 |

### 媒体资源

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `main_image` | string | 主图URL |
| `images` | array | 图片URL列表（最多5张） |

### 商品属性

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `styles` | array | 风格标签 | ["Modern", "Minimalist"] |
| `materials` | array | 材质列表 | ["Brass", "Chrome"] |
| `size` | object | 尺寸信息 | `{"length": 12, "width": 8, "height": 6}` |
| `description` | string | 商品描述（HTML片段） | "<p>Designed for high quality...</p>" |
| `details` | object | 详细属性键值对 | `{ "installation_type": "Wall Mounted" }` |

## 风格标签

系统支持以下风格标签：

- **Modern** - 现代风格
- **Traditional** - 传统风格
- **Industrial** - 工业风格
- **Minimalist** - 极简风格
- **Farmhouse** - 农舍风格
- **Mid-Century** - 中世纪现代
- **Bohemian** - 波西米亚
- **Coastal** - 海滨风格
- **Transitional** - 过渡风格

## 材质类型

常见材质包括：

- Brass（黄铜）
- Stainless Steel（不锈钢）
- Chrome（镀铬）
- Matte Black（哑光黑）
- Brushed Nickel（拉丝镍）
- Glass（玻璃）
- Ceramic（陶瓷）
- Wood（木材）
- Marble（大理石）

## 类目分布

"""
    
    for cat, count in sorted(category_stats.items(), key=lambda x: -x[1]):
        schema_content += f"- {cat}: {count} 件商品\n"
    
    schema_content += """
## 使用示例

```python
import json

# 加载数据
with open('backend/data/products_cleaned.json', 'r') as f:
    products = json.load(f)

# 获取Bath类目商品
bath_products = [p for p in products if p['main_category'] == 'Bath']

# 获取Modern风格商品
modern_products = [p for p in products if 'Modern' in p['styles']]

# 价格筛选
affordable = [p for p in products if p['price']['current'] < 100]
```

## 数据清洗规则

1. **过滤规则**
   - 移除没有主图的商品
   - 移除没有类目信息的商品

2. **价格处理**
   - 底价 = 当前价 × (70%~90%随机因子)
   - 缺失价格的商品使用模拟数据（$50-$500随机）

3. **评分处理**
   - 缺失评分的商品使用随机评分（3.8-4.9）
   - 缺失评价数的商品使用随机数（5-200）

4. **标签生成**
   - 风格标签从标题关键词提取
   - 材质从标题和详情字段提取
"""
    
    print(f"保存Schema文档到: {schema_file}")
    with open(schema_file, 'w', encoding='utf-8') as f:
        f.write(schema_content)
    
    print("\n" + "=" * 60)
    print("数据处理完成！")
    print("=" * 60)
    
    # 返回示例数据
    print("\n【示例商品数据】")
    if cleaned_products:
        print(json.dumps(cleaned_products[0], indent=2, ensure_ascii=False))
    
    return cleaned_products

if __name__ == "__main__":
    main()
