"""Seller workspace API."""

import logging

from fastapi import APIRouter, HTTPException

from app.api.deps import get_standard_response
from app.models.seller import (
    BulkProductParseRequest,
    SellerAgentStrategy,
    SellerProductCreate,
    SellerProductUpdate,
    SellerSandboxRequest,
)
from app.services.seller_service import SellerService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/seller", tags=["Seller Workspace"])


@router.get("/{seller_id}/workbench", response_model=dict)
async def get_workbench(seller_id: str):
    try:
        service = SellerService()
        products = await service.list_products(seller_id)
        strategy = await service.get_or_create_strategy(seller_id)
        insights = await service.get_insights(seller_id)
        return get_standard_response(
            data={
                "seller_id": seller_id,
                "products": products,
                "strategy": strategy,
                "insights": insights.model_dump(),
            }
        )
    except Exception as exc:
        logger.error(f"Get seller workbench failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{seller_id}/products", response_model=dict)
async def list_seller_products(seller_id: str):
    try:
        service = SellerService()
        products = await service.list_products(seller_id)
        return get_standard_response(data={"products": products})
    except Exception as exc:
        logger.error(f"List seller products failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{seller_id}/products", response_model=dict)
async def create_seller_product(seller_id: str, payload: SellerProductCreate):
    try:
        service = SellerService()
        product = await service.create_product(seller_id, payload)
        return get_standard_response(data=product)
    except Exception as exc:
        logger.error(f"Create seller product failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{seller_id}/products/{product_id}", response_model=dict)
async def update_seller_product(seller_id: str, product_id: str, payload: SellerProductUpdate):
    try:
        service = SellerService()
        product = await service.update_product(seller_id, product_id, payload)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return get_standard_response(data=product)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Update seller product failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{seller_id}/products/bulk-parse", response_model=dict)
async def parse_bulk_products(seller_id: str, payload: BulkProductParseRequest):
    del seller_id
    try:
        service = SellerService()
        parsed = service.parse_bulk_products(payload.raw_text)
        return get_standard_response(data=parsed)
    except Exception as exc:
        logger.error(f"Parse seller bulk products failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{seller_id}/strategy", response_model=dict)
async def get_strategy(seller_id: str):
    try:
        service = SellerService()
        strategy = await service.get_or_create_strategy(seller_id)
        return get_standard_response(data=strategy)
    except Exception as exc:
        logger.error(f"Get seller strategy failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{seller_id}/strategy", response_model=dict)
async def update_strategy(seller_id: str, payload: SellerAgentStrategy):
    try:
        service = SellerService()
        strategy = await service.upsert_strategy(seller_id, payload)
        return get_standard_response(data=strategy)
    except Exception as exc:
        logger.error(f"Update seller strategy failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{seller_id}/sandbox/simulate", response_model=dict)
async def simulate_seller_agent(seller_id: str, payload: SellerSandboxRequest):
    try:
        service = SellerService()
        if payload.seller_id != seller_id:
            raise HTTPException(status_code=400, detail="seller_id mismatch")
        result = await service.simulate(payload)
        return get_standard_response(data=result.model_dump())
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Seller sandbox simulation failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{seller_id}/insights", response_model=dict)
async def get_insights(seller_id: str):
    try:
        service = SellerService()
        insights = await service.get_insights(seller_id)
        return get_standard_response(data=insights.model_dump())
    except Exception as exc:
        logger.error(f"Get seller insights failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
