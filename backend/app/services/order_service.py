"""
订单服务
"""
import logging
import uuid
from decimal import Decimal
from datetime import datetime
from typing import Dict, Any, Optional, List

from app.core.database import execute_query, get_transaction
from app.models.order import OrderStatus, OrderItem, ShippingAddress, ContactInfo

logger = logging.getLogger(__name__)


class OrderService:
    """订单服务"""
    
    async def create_order(
        self,
        recommendation_id: str,
        scheme_index: int,
        shipping_address: Optional[ShippingAddress] = None,
        contact_info: Optional[ContactInfo] = None
    ) -> Dict[str, Any]:
        """
        创建订单
        """
        try:
            # 获取推荐信息
            rec_query = """
                SELECT session_id, schemes FROM recommendations
                WHERE recommendation_id = $1
            """
            rec_row = await execute_query(recommendation_id, rec_query, fetch_one=True)
            
            if not rec_row:
                raise ValueError("Recommendation not found")
            
            schemes = rec_row["schemes"] or []
            
            if scheme_index < 0 or scheme_index >= len(schemes):
                raise ValueError("Invalid scheme index")
            
            scheme = schemes[scheme_index]
            
            # 生成订单号
            order_id = f"ORD{datetime.now().strftime('%Y%m%d')}{uuid.uuid4().hex[:8].upper()}"
            
            # 构建订单项
            items = []
            for item in scheme.get("items", []):
                items.append({
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "quantity": 1,
                    "unit_price": item.get("price", 0),
                    "total_price": item.get("price", 0)
                })
            
            total_amount = scheme.get("total_price", 0)
            
            # 插入订单
            query = """
                INSERT INTO orders (
                    order_id, recommendation_id, scheme_index, items,
                    total_amount, original_amount, status,
                    shipping_address, contact_info, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
                RETURNING order_id
            """
            
            await execute_query(
                query,
                order_id,
                recommendation_id,
                scheme_index,
                items,
                total_amount,
                total_amount,  # 原始金额
                OrderStatus.PENDING,
                shipping_address.dict() if shipping_address else None,
                contact_info.dict() if contact_info else None,
                datetime.now(),
                fetch=False
            )
            
            # 更新推荐状态
            await execute_query(
                "UPDATE recommendations SET status = 'converted' WHERE recommendation_id = $1",
                recommendation_id,
                fetch=False
            )
            
            return {
                "order_id": order_id,
                "status": OrderStatus.PENDING,
                "total_amount": total_amount,
                "items": items,
                "created_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Create order failed: {e}")
            raise
    
    async def get_order(self, order_id: str) -> Optional[Dict]:
        """
        获取订单详情
        """
        query = """
            SELECT 
                o.*,
                r.session_id
            FROM orders o
            LEFT JOIN recommendations r ON o.recommendation_id = r.recommendation_id
            WHERE o.order_id = $1
        """
        
        row = await execute_query(query, order_id, fetch_one=True)
        
        if not row:
            return None
        
        return {
            "order_id": row["order_id"],
            "recommendation_id": row["recommendation_id"],
            "scheme_index": row["scheme_index"],
            "items": row["items"] or [],
            "total_amount": float(row["total_amount"]),
            "original_amount": float(row["original_amount"]) if row["original_amount"] else float(row["total_amount"]),
            "discount_amount": float(row["discount_amount"]) if row["discount_amount"] else 0,
            "discount_percent": row["discount_percent"] or 0,
            "status": row["status"],
            "shipping_address": row["shipping_address"],
            "contact_info": row["contact_info"],
            "negotiation_history": row["negotiation_history"] or [],
            "session_id": row["session_id"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None
        }
    
    async def get_session_orders(
        self,
        session_id: str,
        status: Optional[OrderStatus] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        获取会话的订单列表
        """
        try:
            # 首先获取推荐 IDs
            rec_query = """
                SELECT recommendation_id FROM recommendations
                WHERE session_id = $1
            """
            rec_rows = await execute_query(rec_query, session_id)
            rec_ids = [r["recommendation_id"] for r in rec_rows]
            
            if not rec_ids:
                return {
                    "total": 0,
                    "page": page,
                    "page_size": page_size,
                    "orders": []
                }
            
            # 构建查询
            conditions = [f"recommendation_id = ANY($1)"]
            args = [rec_ids]
            
            if status:
                conditions.append(f"status = ${2}")
                args.append(status)
            
            # 统计总数
            count_query = f"""
                SELECT COUNT(*) as total FROM orders
                WHERE {' AND '.join(conditions)}
            """
            count_row = await execute_query(count_query, *args, fetch_one=True)
            total = count_row["total"] if count_row else 0
            
            # 查询订单
            offset = (page - 1) * page_size
            query = f"""
                SELECT 
                    order_id, recommendation_id, scheme_index,
                    total_amount, status, created_at
                FROM orders
                WHERE {' AND '.join(conditions)}
                ORDER BY created_at DESC
                LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}
            """
            args.extend([page_size, offset])
            
            rows = await execute_query(query, *args)
            
            orders = [
                {
                    "order_id": row["order_id"],
                    "recommendation_id": row["recommendation_id"],
                    "scheme_index": row["scheme_index"],
                    "total_amount": float(row["total_amount"]),
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None
                }
                for row in rows
            ]
            
            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "orders": orders
            }
            
        except Exception as e:
            logger.error(f"Get session orders failed: {e}")
            raise
    
    async def update_order(
        self,
        order_id: str,
        status: Optional[OrderStatus] = None,
        shipping_address: Optional[ShippingAddress] = None,
        contact_info: Optional[ContactInfo] = None
    ) -> Dict[str, Any]:
        """
        更新订单
        """
        try:
            updates = []
            args = []
            arg_idx = 1
            
            if status:
                updates.append(f"status = ${arg_idx}")
                args.append(status)
                arg_idx += 1
            
            if shipping_address:
                updates.append(f"shipping_address = ${arg_idx}")
                args.append(shipping_address.dict())
                arg_idx += 1
            
            if contact_info:
                updates.append(f"contact_info = ${arg_idx}")
                args.append(contact_info.dict())
                arg_idx += 1
            
            if not updates:
                return await self.get_order(order_id)
            
            updates.append(f"updated_at = ${arg_idx}")
            args.append(datetime.now())
            arg_idx += 1
            
            args.append(order_id)
            
            query = f"""
                UPDATE orders
                SET {', '.join(updates)}
                WHERE order_id = ${arg_idx}
            """
            
            await execute_query(query, *args, fetch=False)
            
            return await self.get_order(order_id)
            
        except Exception as e:
            logger.error(f"Update order failed: {e}")
            raise
    
    async def cancel_order(
        self,
        order_id: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        取消订单
        """
        try:
            order = await self.get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            if order["status"] not in [OrderStatus.PENDING, OrderStatus.PAID]:
                raise ValueError("Order cannot be cancelled")
            
            query = """
                UPDATE orders
                SET status = $1, updated_at = $2
                WHERE order_id = $3
            """
            
            await execute_query(
                query,
                OrderStatus.CANCELLED,
                datetime.now(),
                order_id,
                fetch=False
            )
            
            return {
                "order_id": order_id,
                "status": OrderStatus.CANCELLED,
                "reason": reason,
                "cancelled_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Cancel order failed: {e}")
            raise
    
    async def create_payment(
        self,
        order_id: str,
        payment_method: str
    ) -> Dict[str, Any]:
        """
        创建支付
        
        生成支付链接
        """
        try:
            order = await self.get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            if order["status"] != OrderStatus.PENDING:
                raise ValueError("Order is not pending payment")
            
            # 这里集成实际的支付网关
            # 示例：生成模拟支付链接
            payment_id = f"PAY{uuid.uuid4().hex[:12].upper()}"
            
            # 更新订单状态为处理中
            await self.update_order(order_id, status=OrderStatus.PROCESSING)
            
            return {
                "order_id": order_id,
                "payment_id": payment_id,
                "payment_method": payment_method,
                "amount": order["total_amount"],
                "currency": "USD",
                "payment_url": f"/api/payment/{payment_id}/process",
                "status": "pending",
                "expires_at": datetime.now().isoformat()  # 添加过期时间
            }
            
        except Exception as e:
            logger.error(f"Create payment failed: {e}")
            raise
    
    async def get_payment_status(self, order_id: str) -> Dict[str, Any]:
        """
        获取支付状态
        """
        try:
            order = await self.get_order(order_id)
            
            if not order:
                raise ValueError("Order not found")
            
            status_map = {
                OrderStatus.PENDING: "unpaid",
                OrderStatus.PROCESSING: "processing",
                OrderStatus.PAID: "paid",
                OrderStatus.COMPLETED: "completed",
                OrderStatus.CANCELLED: "cancelled",
                OrderStatus.REFUNDED: "refunded"
            }
            
            return {
                "order_id": order_id,
                "payment_status": status_map.get(order["status"], "unknown"),
                "amount": order["total_amount"],
                "paid_at": order.get("paid_at")
            }
            
        except Exception as e:
            logger.error(f"Get payment status failed: {e}")
            raise
    
    async def handle_payment_webhook(self, payload: Dict) -> Dict[str, Any]:
        """
        处理支付回调
        """
        try:
            # 解析回调数据
            order_id = payload.get("order_id")
            payment_status = payload.get("status")
            
            if not order_id or not payment_status:
                raise ValueError("Invalid webhook payload")
            
            if payment_status == "success":
                # 更新订单为已支付
                query = """
                    UPDATE orders
                    SET status = $1, paid_at = $2, updated_at = $2
                    WHERE order_id = $3
                """
                await execute_query(
                    query,
                    OrderStatus.PAID,
                    datetime.now(),
                    order_id,
                    fetch=False
                )
                
                return {"status": "success", "order_id": order_id}
            
            elif payment_status == "failed":
                # 支付失败，恢复订单状态
                await self.update_order(order_id, status=OrderStatus.PENDING)
                return {"status": "failed", "order_id": order_id}
            
            return {"status": "ignored", "order_id": order_id}
            
        except Exception as e:
            logger.error(f"Handle payment webhook failed: {e}")
            raise
    
    async def get_order_statistics(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        获取订单统计
        """
        try:
            if session_id:
                # 获取会话订单统计
                query = """
                    SELECT 
                        COUNT(*) as total_orders,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                        SUM(total_amount) as total_amount
                    FROM orders o
                    JOIN recommendations r ON o.recommendation_id = r.recommendation_id
                    WHERE r.session_id = $1
                """
                row = await execute_query(query, session_id, fetch_one=True)
            else:
                # 获取全局统计
                query = """
                    SELECT 
                        COUNT(*) as total_orders,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                        SUM(total_amount) as total_amount
                    FROM orders
                """
                row = await execute_query(query, fetch_one=True)
            
            return {
                "total_orders": row["total_orders"] or 0,
                "completed_orders": row["completed_orders"] or 0,
                "pending_orders": row["pending_orders"] or 0,
                "total_amount": float(row["total_amount"]) if row["total_amount"] else 0
            }
            
        except Exception as e:
            logger.error(f"Get order statistics failed: {e}")
            raise
