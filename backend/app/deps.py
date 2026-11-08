# -*- coding: utf-8 -*-
"""成员（家庭档案）隔离的依赖。

一个请求属于哪个档案，由 `X-Health-Profile` 头或 `?profile=` 查询参数决定；
缺省为 default。

注意 ContextVar 的 set/reset 必须在**同一个执行上下文**里成对完成。FastAPI 的
`yield` 依赖在 threadpool 里执行，yield 之后与之前可能落在不同上下文，导致
`reset(token)` 抛 "was created in a different Context"。因此这里不在依赖里
set/reset，而是只**解析并校验** pid，由各路由在自己的函数体内用
`profile_context(pid)` 上下文管理器包裹——set 与 reset 就都在路由线程同一上下文里。
"""
from __future__ import annotations

import contextlib
import sys
from pathlib import Path
from typing import Iterator

from fastapi import HTTPException, Request

from . import db

_ROOT = Path(__file__).resolve().parents[2]   # F:/Health
_SERVER = _ROOT / "server"
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))

import health_server as hs   # noqa: E402
import health_features as hf  # noqa: E402

hf.h = hs


def _ensure_member_db(pid: str) -> None:
    """确保成员库存在且已建全量表 + 版本化迁移（须已在 hs 作用域内）。"""
    hs.init_db()
    db.migrate()


@contextlib.contextmanager
def profile_context(pid: str) -> Iterator[str]:
    """在路由函数体内切换两个模块的 profile ContextVar（同上下文 set/reset）。"""
    hs_token = hs._profile_scope.set(pid)
    db_token = db._profile_scope.set(pid)
    try:
        if pid != "default":
            _ensure_member_db(pid)
        yield pid
    finally:
        db._profile_scope.reset(db_token)
        hs._profile_scope.reset(hs_token)


def resolve_profile(request: Request) -> str:
    """解析并校验成员，返回 pid（不改变任何全局状态）。"""
    pid = request.headers.get("X-Health-Profile") or request.query_params.get("profile") or "default"
    if not hf.member(pid):
        raise HTTPException(404, "成员不存在")
    return pid
