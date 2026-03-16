"""
会话管理 API — 多对话持久化、历史列表、消息存储
路径: /api/conversations/*
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.database import execute_query
from app.api.deps import AuthenticatedUser, get_current_user, get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["对话管理"])

# ── Request / Response models ─────────────────────────────────────────────────

class CreateConversationRequest(BaseModel):
    user_id: Optional[str] = Field(default=None)
    title: Optional[str] = Field(default=None)


class RenameConversationRequest(BaseModel):
    title: str = Field(..., max_length=200)


class SaveMessageRequest(BaseModel):
    message_id: str
    role: str = Field(..., pattern=r"^(user|assistant|system)$")
    content: str
    message_type: str = Field(default="text")
    metadata: Optional[dict] = Field(default=None)


class GenerateTitleRequest(BaseModel):
    first_message: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/create")
async def create_conversation(
    req: CreateConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """创建新对话"""
    if req.user_id and req.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Cannot create conversation for another user")

    owner_user_id = req.user_id or current_user.user_id
    conversation_id = f"conv_{uuid.uuid4().hex[:16]}"
    session_id = f"session_{uuid.uuid4().hex[:16]}"
    title = req.title or "New Chat"

    await execute_query(
        """
        INSERT INTO conversations (conversation_id, user_id, title, session_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $5)
        """,
        conversation_id, owner_user_id, title, session_id,
        datetime.now(),
        fetch=False,
    )

    return get_standard_response(data={
        "conversation_id": conversation_id,
        "session_id": session_id,
        "title": title,
        "created_at": datetime.now().isoformat(),
    })


@router.get("/user/{user_id}")
async def list_conversations(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """获取用户的所有对话列表（按更新时间倒序）"""
    if user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Cannot list conversations for another user")

    rows = await execute_query(
        """
        SELECT conversation_id, user_id, title, session_id, created_at, updated_at
        FROM conversations
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT $2 OFFSET $3
        """,
        user_id, limit, offset,
    )

    conversations = [
        {
            "conversation_id": r["conversation_id"],
            "user_id": r["user_id"],
            "title": r["title"],
            "session_id": r["session_id"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in (rows or [])
    ]

    return get_standard_response(data={"conversations": conversations})


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    """获取单个对话及其消息"""
    row = await execute_query(
        "SELECT * FROM conversations WHERE conversation_id = $1",
        conversation_id,
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await execute_query(
        """
        SELECT message_id, role, content, message_type, metadata, created_at
        FROM conversation_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        """,
        conversation_id,
    )

    def _parse_metadata(raw):
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}

    return get_standard_response(data={
        "conversation_id": row["conversation_id"],
        "user_id": row["user_id"],
        "title": row["title"],
        "session_id": row["session_id"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        "messages": [
            {
                "id": m["message_id"],
                "role": m["role"],
                "content": m["content"],
                "type": m["message_type"],
                "timestamp": m["created_at"].isoformat() if m["created_at"] else None,
                "metadata": _parse_metadata(m["metadata"]),
            }
            for m in (messages or [])
        ],
    })


@router.post("/{conversation_id}/messages")
async def save_message(conversation_id: str, req: SaveMessageRequest):
    """保存一条消息到对话"""
    # 验证对话存在
    row = await execute_query(
        "SELECT conversation_id FROM conversations WHERE conversation_id = $1",
        conversation_id,
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await execute_query(
        """
        INSERT INTO conversation_messages (conversation_id, message_id, role, content, message_type, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        conversation_id,
        req.message_id,
        req.role,
        req.content,
        req.message_type,
        json.dumps(req.metadata) if req.metadata else '{}',
        fetch=False,
    )

    # 更新对话的 updated_at
    await execute_query(
        "UPDATE conversations SET updated_at = $1 WHERE conversation_id = $2",
        datetime.now(), conversation_id,
        fetch=False,
    )

    return get_standard_response(data={"status": "saved"})


@router.put("/{conversation_id}/title")
async def rename_conversation(conversation_id: str, req: RenameConversationRequest):
    """重命名对话"""
    row = await execute_query(
        "SELECT conversation_id FROM conversations WHERE conversation_id = $1",
        conversation_id,
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await execute_query(
        "UPDATE conversations SET title = $1, updated_at = $2 WHERE conversation_id = $3",
        req.title, datetime.now(), conversation_id,
        fetch=False,
    )

    return get_standard_response(data={"title": req.title})


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """删除对话及其所有消息"""
    await execute_query(
        "DELETE FROM conversations WHERE conversation_id = $1",
        conversation_id,
        fetch=False,
    )
    return get_standard_response(data={"deleted": True})


@router.post("/{conversation_id}/generate-title")
async def generate_title(conversation_id: str, req: GenerateTitleRequest):
    """根据首条消息自动生成对话标题（简单规则提取）"""
    text = req.first_message.strip()
    # 截取前 40 个字符作为标题
    if len(text) > 40:
        title = text[:37] + "..."
    else:
        title = text

    await execute_query(
        "UPDATE conversations SET title = $1, updated_at = $2 WHERE conversation_id = $3",
        title, datetime.now(), conversation_id,
        fetch=False,
    )

    return get_standard_response(data={"title": title})
