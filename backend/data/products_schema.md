# 商品数据结构说明

## 概述

本文档描述了清洗后的商品数据结构，用于多Agent家居电商Demo系统。

## 数据文件

- **文件路径**: `backend/data/products_cleaned.json`
- **数据格式**: JSON Array
- **商品数量": 4522
- **生成时间": 2026-03-09T10:18:21.704500

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

- Furniture: 2925 件商品
- Bath: 528 件商品
- Home Decoration: 338 件商品
- Outdoor & Garden: 309 件商品
- Lighting: 244 件商品
- Organization: 102 件商品
- Home Textile: 66 件商品
- Kitchen & Dining: 8 件商品
- Baby & Kids: 2 件商品

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
