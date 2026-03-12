"""
用户长期记忆 & 会话 Context Pin API
路径: /api/memory/*
"""
import logging
import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.models.memory import (
    UserLongTermMemory,
    SessionMemoryState,
    SessionContextPin,
    MemoryUpsertRequest,
    TagAddRequest,
    TagRemoveRequest,
    SpaceUpsertRequest,
    SpaceProfile,
    MemoryTag,
)
from app.core.redis import cache
from app.api.deps import get_standard_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/memory", tags=["记忆系统"])

# Redis key helpers
USER_MEMORY_KEY = "user_memory:{user_id}"
SESSION_PINS_KEY = "session_pins:{session_id}"
# 长期记忆保留30天（用户再次访问会自动续期）
USER_MEMORY_TTL = 60 * 60 * 24 * 30
# 会话pins保留4小时
SESSION_PINS_TTL = 60 * 60 * 4


# ─── Long-term Memory ─────────────────────────────────────────────────────────

@router.get("/user/{user_id}", response_model=dict)
async def get_user_memory(user_id: str):
    """
    获取用户长期记忆档案。
    首次访问时自动创建空档案。
    """
    key = USER_MEMORY_KEY.format(user_id=user_id)
    data = await cache.get_json(key)

    if data:
        memory = UserLongTermMemory(**data)
        # 更新最后访问时间和访问次数
        memory.last_seen = datetime.now()
        memory.visit_count += 1
        await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)
    else:
        # 首次创建
        memory = UserLongTermMemory(user_id=user_id)
        await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)

    return get_standard_response(data=memory.model_dump(mode="json"))


@router.post("/user/upsert", response_model=dict)
async def upsert_user_memory(req: MemoryUpsertRequest):
    """
    创建或更新用户长期记忆档案
    """
    key = USER_MEMORY_KEY.format(user_id=req.user_id)
    data = await cache.get_json(key)

    if data:
        memory = UserLongTermMemory(**data)
    else:
        memory = UserLongTermMemory(user_id=req.user_id)

    if req.nickname is not None:
        memory.nickname = req.nickname
    if req.tags is not None:
        # Merge: replace existing tags by key, append new
        existing_keys = {t.key: i for i, t in enumerate(memory.tags)}
        for new_tag in req.tags:
            if new_tag.key in existing_keys:
                memory.tags[existing_keys[new_tag.key]] = new_tag
            else:
                memory.tags.append(new_tag)
    if req.spaces is not None:
        existing_space_ids = {s.space_id: i for i, s in enumerate(memory.spaces)}
        for new_space in req.spaces:
            if new_space.space_id in existing_space_ids:
                memory.spaces[existing_space_ids[new_space.space_id]] = new_space
            else:
                memory.spaces.append(new_space)
    if req.active_space_id is not None:
        memory.active_space_id = req.active_space_id

    memory.last_seen = datetime.now()
    await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)
    return get_standard_response(data=memory.model_dump(mode="json"))


@router.post("/user/tag/add", response_model=dict)
async def add_tag(req: TagAddRequest):
    """
    添加单个记忆标签（支持确认隐性偏好）
    """
    key = USER_MEMORY_KEY.format(user_id=req.user_id)
    data = await cache.get_json(key)
    memory = UserLongTermMemory(**data) if data else UserLongTermMemory(user_id=req.user_id)

    # 检查是否已存在该key，更新
    for i, t in enumerate(memory.tags):
        if t.key == req.tag.key:
            memory.tags[i] = req.tag
            break
    else:
        memory.tags.append(req.tag)

    memory.last_seen = datetime.now()
    await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)
    return get_standard_response(data={"tags": [t.model_dump(mode="json") for t in memory.tags]})


@router.post("/user/tag/remove", response_model=dict)
async def remove_tag(req: TagRemoveRequest):
    """
    删除指定记忆标签（用户撤销隐性偏好）
    """
    key = USER_MEMORY_KEY.format(user_id=req.user_id)
    data = await cache.get_json(key)
    if not data:
        raise HTTPException(status_code=404, detail="User memory not found")
    memory = UserLongTermMemory(**data)
    memory.tags = [t for t in memory.tags if t.key != req.tag_key]
    await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)
    return get_standard_response(data={"tags": [t.model_dump(mode="json") for t in memory.tags]})


@router.post("/user/space", response_model=dict)
async def upsert_space(req: SpaceUpsertRequest):
    """
    添加或更新空间档案
    """
    key = USER_MEMORY_KEY.format(user_id=req.user_id)
    data = await cache.get_json(key)
    memory = UserLongTermMemory(**data) if data else UserLongTermMemory(user_id=req.user_id)

    existing = {s.space_id: i for i, s in enumerate(memory.spaces)}
    if req.space.space_id in existing:
        memory.spaces[existing[req.space.space_id]] = req.space
    else:
        memory.spaces.append(req.space)

    await cache.set_json(key, memory.model_dump(mode="json"), expire=USER_MEMORY_TTL)
    return get_standard_response(data=memory.model_dump(mode="json"))


# ─── Session Context Pins ──────────────────────────────────────────────────────

@router.get("/session/{session_id}/pins", response_model=dict)
async def get_session_pins(session_id: str):
    """
    获取当前会话的 Context Pins（需求标签组）
    """
    key = SESSION_PINS_KEY.format(session_id=session_id)
    data = await cache.get_json(key)
    if not data:
        state = SessionMemoryState(session_id=session_id)
    else:
        state = SessionMemoryState(**data)
    return get_standard_response(data=state.model_dump(mode="json"))


@router.post("/session/{session_id}/pins", response_model=dict)
async def update_session_pins(session_id: str, pins: list[SessionContextPin]):
    """
    更新会话 Context Pins（前端可以替换全量）
    """
    key = SESSION_PINS_KEY.format(session_id=session_id)
    data = await cache.get_json(key)
    state = SessionMemoryState(**data) if data else SessionMemoryState(session_id=session_id)
    state.context_pins = pins
    await cache.set_json(key, state.model_dump(mode="json"), expire=SESSION_PINS_TTL)
    return get_standard_response(data=state.model_dump(mode="json"))


@router.delete("/session/{session_id}/pins/{pin_key}", response_model=dict)
async def remove_session_pin(session_id: str, pin_key: str):
    """
    删除单个 Context Pin
    """
    key = SESSION_PINS_KEY.format(session_id=session_id)
    data = await cache.get_json(key)
    if not data:
        return get_standard_response(data={"context_pins": []})
    state = SessionMemoryState(**data)
    state.context_pins = [p for p in state.context_pins if p.key != pin_key]
    await cache.set_json(key, state.model_dump(mode="json"), expire=SESSION_PINS_TTL)
    return get_standard_response(data=state.model_dump(mode="json"))
