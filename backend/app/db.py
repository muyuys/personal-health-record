# -*- coding: utf-8 -*-
"""SQLite 连接与迁移。

复用现有 server/health_server.py 的数据访问原则：
- 同一个 data/health.db（单机、WAL）
- 支持按成员切换（members 子库），与 health_server.db_path() 完全一致
本轮新增：schema_version 迁移表 + visit.revision 列。
"""
from __future__ import annotations

import sqlite3
import threading
import contextvars
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # F:/Health
DB_PATH = ROOT / "data" / "health.db"

# 测试/隔离用：HEALTH_DB_PATH 环境变量可覆盖数据库路径（默认仍为 data/health.db）
_env_db = __import__("os").environ.get("HEALTH_DB_PATH")
if _env_db:
    DB_PATH = Path(_env_db)

_db_lock = threading.RLock()
_profile_scope = contextvars.ContextVar("health_profile", default="default")


def db_path() -> Path:
    pid = _profile_scope.get()
    if pid == "default":
        return DB_PATH
    return DB_PATH.parent / (DB_PATH.stem + "_members") / pid / "health.db"


def connect() -> sqlite3.Connection:
    c = sqlite3.connect(db_path(), timeout=10)
    c.row_factory = sqlite3.Row
    return c


# 当前代码期望的 schema 版本；每加一个迁移 +1。
SCHEMA_VERSION = 1


def _current_version(c: sqlite3.Connection) -> int:
    c.execute("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)")
    row = c.execute("SELECT v FROM schema_version LIMIT 1").fetchone()
    return int(row["v"]) if row else 0


def _set_version(c: sqlite3.Connection, v: int) -> None:
    c.execute("DELETE FROM schema_version")
    c.execute("INSERT INTO schema_version (v) VALUES (?)", (v,))


def migrate() -> None:
    """版本化迁移。幂等：已是最新则不动作。

    迁移 0 -> 1：给 visit 表补 revision 列（乐观并发版本）。
    """
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with _db_lock, connect() as c:
        c.execute("PRAGMA journal_mode=WAL")
        cur = _current_version(c)

        if cur < 1:
            cols = {r["name"] for r in c.execute("PRAGMA table_info(visit)").fetchall()}
            # visit 表应已由旧 init_db 建好；若不存在则建最小结构
            if not cols:
                c.execute(
                    """CREATE TABLE IF NOT EXISTS visit (
                       id TEXT PRIMARY KEY, date TEXT NOT NULL, visit_type TEXT DEFAULT '',
                       department TEXT DEFAULT '', hospital TEXT DEFAULT '', doctor TEXT DEFAULT '',
                       chief TEXT DEFAULT '', diagnosis TEXT DEFAULT '', summary TEXT DEFAULT '',
                       report_id TEXT DEFAULT '', note TEXT DEFAULT '', created_at INTEGER)"""
                )
                cols = {"id", "date", "visit_type", "department", "hospital", "doctor",
                        "chief", "diagnosis", "summary", "report_id", "note", "created_at"}
            if "revision" not in cols:
                c.execute("ALTER TABLE visit ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
            _set_version(c, 1)
        c.commit()
