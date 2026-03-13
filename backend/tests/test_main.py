"""基础 FastAPI 路由测试。"""

from fastapi.testclient import TestClient

from app.api import plaza as plaza_api
from app.services.seller_service import SellerService
from main import app


client = TestClient(app)


def test_root():
    """测试根路径"""
    response = client.get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 200
    assert payload["data"]["docs"] == "/docs"


def test_health_check():
    """测试健康检查接口"""
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 200
    assert payload["message"] == "healthy"
    assert payload["data"]["status"] == "up"


class DummyProductService:
    async def search_products(self, params):
        category = params.get("category_l1") or "Living Room"
        styles = params.get("styles") or []
        style = styles[0] if styles else "Modern"
        title = f"{style} {category} Sofa"
        return {
            "products": [
                {
                    "spu_id": "test-spu-1",
                    "title": title,
                    "category_l1": category,
                    "price_current": 499.0,
                    "price_original": 699.0,
                    "currency": "USD",
                    "images": ["https://example.com/product.jpg"],
                    "rating": 4.8,
                    "styles": [style],
                    "scenes": [category],
                }
            ],
            "total": 1,
        }


def test_plaza_home_route_supports_style_preference(monkeypatch):
    """购物广场首页应注册在 /api/plaza/home，并支持轻量个性化参数。"""
    monkeypatch.setattr(plaza_api, "ProductService", DummyProductService)

    response = client.get(
        "/api/plaza/home",
        params={"preference_style": "Modern", "session_id": "session-test"},
    )

    assert response.status_code == 200

    payload = response.json()
    assert payload["code"] == 200

    personalized_section = next(
        section for section in payload["data"]["sections"] if section["id"] == "personalized"
    )
    assert "Modern" in personalized_section["title"]


def test_seller_bulk_parse_route_returns_parsed_products(monkeypatch):
    def fake_parse(self, raw_text):
        assert "Sofa" in raw_text
        return {
            "parsed_products": [
                {
                    "title": "Test Sofa",
                    "category": "Living Room",
                    "list_price": 1000,
                    "floor_price": 800,
                    "currency": "USD",
                    "inventory": 9,
                    "highlights": ["washable"],
                    "description": None,
                    "image_urls": [],
                }
            ],
            "warnings": [],
        }

    monkeypatch.setattr(SellerService, "parse_bulk_products", fake_parse)

    response = client.post(
        "/api/seller/demo_seller_001/products/bulk-parse",
        json={"raw_text": "Test Sofa | Living Room | 1000 | 800 | 9 | washable"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 200
    assert payload["data"]["parsed_products"][0]["title"] == "Test Sofa"
