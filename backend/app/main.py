# -*- coding: utf-8 -*-
"""FastAPI 入口。

设计（见 docs §4）：
- 迁移期：只挂「就诊」逐条 CRUD，验证一条完整闭环跑通。
- OCR / AI / 文件等能力由一个 service 适配层调用 server/health_features.py，
  后续按需增量迁移，不重写。
- 复用同一个 data/health.db（单机 SQLite），启动时跑一次版本化迁移。
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from .db import migrate
from .deps import profile_context, resolve_profile
from .routers import visits, snapshot, features

app = FastAPI(title="个人健康档案 · API（升级版）", version="0.1.0")

# 允许 Vite dev server（5173）跨域调试；生产同源可关。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    # 旧服务的 init_db 建全量表 + 幂等 ALTER；先跑它保证库完整，再跑版本化迁移。
    try:
        from . import legacy
        legacy.init_db()
    except Exception:  # noqa: BLE001
        pass
    migrate()
    # AI / OCR / MCP 特性：建 members / ai_chat 表与 agent token
    features.startup_init()


app.include_router(visits.router)
app.include_router(snapshot.router)
app.include_router(features.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "fastapi-upgrade"}


@app.get("/files/{name}")
def serve_file(name: str, pid: str = Depends(resolve_profile)):
    """报告原件图片：对齐旧 health_server 的 /files/<name>（从当前成员 image_dir 读取）。"""
    from . import legacy
    safe = Path(name).name  # 防路径穿越
    with profile_context(pid):
        target = Path(legacy.image_dir()) / safe
    if not target.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(str(target))
