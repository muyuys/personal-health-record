# -*- coding: utf-8 -*-
"""旧服务数据层桥接（迁移期复用，避免重写）。

复用 server/health_server.py 里已经过验证的纯数据函数（get_all / replace_* /
export / init_db 等），它们用同一个 data/health.db、同一套表结构与列映射。
这样 FastAPI 版可以立刻与旧 http.server 达到**数据层完全一致**，逐条 CRUD
（routers/visits.py）则作为「更优路径」并行存在，互不冲突。

不 import 整个模块的副作用：health_server 只在 __main__ 下才 main()，安全。
"""
from __future__ import annotations

import sys
from pathlib import Path

# 把仓库根的 server/ 目录加入 import 路径，再导入旧模块
_ROOT = Path(__file__).resolve().parents[2]      # F:/Health
_SERVER = _ROOT / "server"
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))

import health_server as legacy  # noqa: E402

# 常用函数直出，供 router 直接调用
get_all = legacy.get_all
init_db = legacy.init_db
export_status = legacy.export_status
replace_labs = legacy.replace_labs
replace_reports = legacy.replace_reports
replace_state = legacy.replace_state
replace_history = legacy.replace_history
replace_vitals = legacy.replace_vitals
replace_symptoms = legacy.replace_symptoms
replace_diet_days = legacy.replace_diet_days
replace_diet_weeks = legacy.replace_diet_weeks
replace_sleep_logs = legacy.replace_sleep_logs
replace_issue_status = legacy.replace_issue_status
replace_todo_items = legacy.replace_todo_items
replace_profile_overrides = legacy.replace_profile_overrides
list_originals = legacy.list_originals
image_dir = legacy.image_dir

__all__ = [
    "legacy", "get_all", "init_db", "export_status",
    "replace_labs", "replace_reports", "replace_state", "replace_history",
    "replace_vitals", "replace_symptoms", "replace_diet_days", "replace_diet_weeks",
    "replace_sleep_logs", "replace_issue_status", "replace_todo_items",
    "replace_profile_overrides", "list_originals", "image_dir",
]
