# -*- coding: utf-8 -*-
"""AI / OCR / MCP 特性适配层（迁移期复用 server/health_features.py）。

health_features.py 里的 ai_status / ai_models / ai_config / chat / history / refs /
reset_history / parse_image 都是纯函数，但依赖模块级全局 `h`（一个带 DB_PATH、ROOT、
connect()、init_db()、_db_lock、_profile_scope 的服务对象）。这里把 `h` 指向
`server/health_server.py` 模块本身（它恰好提供这些属性），即可直接调用，不必重写。

install() 的 monkey-patch（把路由塞进 http.server Handler）这里不需要——
FastAPI 用真实 router 挂同样的 /api/ai/*、/api/mcp/* 路径即可。
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Request

_ROUTER_ROOT = Path(__file__).resolve().parents[2]       # F:/Health
_SERVER = _ROUTER_ROOT / "server"
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))

import health_server as hs          # noqa: E402
import health_features as hf        # noqa: E402

# 把特性模块的全局 h 指向 legacy server 模块（提供 DB_PATH/ROOT/connect/init_db/_db_lock/_profile_scope）
hf.h = hs


def _ensure_init() -> None:
    """建 members 表 + ai_chat 表 + agent token（等价 install() 里除 monkey-patch 外的部分）。"""
    import sqlite3
    hs.init_db()
    with sqlite3.connect(hs.DB_PATH, timeout=10) as c:
        c.execute('CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY,name TEXT NOT NULL,relation TEXT,created_at INTEGER)')
        c.execute("INSERT OR IGNORE INTO members VALUES ('default','我的档案','本人',0)")
    hf.init_chat()
    for profile in _profiles():
        if profile['id'] != 'default':
            with hf.scope(profile['id']):
                hf.init_chat()
    token_path = hs.DB_PATH.parent / (hs.DB_PATH.stem + '.agent-token')
    if not token_path.exists():
        token_path.write_text(uuid.uuid4().hex + uuid.uuid4().hex, encoding='utf-8')


def _profiles():
    return hf.profiles()


def _scope_from(request: Request):
    """读取 X-Health-Profile 头或 ?profile= 查询参数，返回 (pid, scope_cm)。"""
    pid = request.headers.get('X-Health-Profile') or request.query_params.get('profile') or 'default'
    return pid


def _guard(pid: str):
    if not hf.member(pid):
        raise HTTPException(404, '成员不存在')


router = APIRouter(prefix="/api", tags=["features"])


@router.get("/profiles")
def profiles():
    return {"profiles": _profiles()}


@router.post("/profiles")
def save_profile(data: dict = Body(...)):
    """新增 / 编辑成员（与旧 featureAPI('/profiles', values) 对齐）。"""
    try:
        return hf.save_member(data)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/ai/status")
def ai_status(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    with hf.scope(pid):
        return hf.ai_status()


@router.get("/ai/config")
def get_ai_config():
    return hf.ai_config()


@router.post("/ai/config")
def post_ai_config(data: dict = Body(...)):
    try:
        return hf.save_ai_config(data)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/ai/models")
def ai_models(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    refresh = request.query_params.get('refresh') == '1'
    try:
        with hf.scope(pid):
            return hf.ai_models(refresh=refresh)
    except Exception:  # noqa: BLE001
        # 模型列表失败不致命：返回空目录 + error
        return {"models": [], "error": '无法获取模型列表，请检查连接设置'}


@router.get("/ai/history")
def ai_history(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    with hf.scope(pid):
        return {"messages": hf.history()}


@router.get("/ai/refs")
def ai_refs(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    with hf.scope(pid):
        return hf.refs()


@router.post("/ai/reset")
def ai_reset(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    with hf.scope(pid):
        return hf.reset_history()


@router.post("/ai/chat")
def ai_chat(request: Request, data: dict = Body(...)):
    pid = _scope_from(request)
    _guard(pid)
    try:
        with hf.scope(pid):
            return hf.chat(data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:  # noqa: BLE001
        raise HTTPException(502, '操作失败，请检查本机服务或模型配置后重试')


@router.post("/ai/parse")
async def ai_parse(request: Request):
    pid = _scope_from(request)
    _guard(pid)
    raw = await request.body()
    try:
        with hf.scope(pid):
            return hf.parse_image(raw)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:  # noqa: BLE001
        raise HTTPException(502, '模型未返回可解析的报告，请换用支持多模态与 JSON 输出的模型后重试')


@router.get("/mcp/config")
def mcp_config(request: Request):
    token_path = hs.DB_PATH.parent / (hs.DB_PATH.stem + '.agent-token')
    port = request.url.port or 8001
    return {"mcpServers": {"health": {"command": sys.executable,
                                      "args": [str(hs.ROOT / 'server' / 'health_mcp.py'),
                                               '--url', 'http://127.0.0.1:' + str(port),
                                               '--token-file', str(token_path)]}}}


def startup_init() -> None:
    """main.py startup 调用：确保特性所需表与 token 就绪。"""
    try:
        _ensure_init()
    except Exception:  # noqa: BLE001
        pass
