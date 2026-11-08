# -*- coding: utf-8 -*-
"""快照 / 整表替换接口 —— 与旧 health_server.py 数据层完全兼容。

迁移期策略：前端新版的「非就诊」模块先用这一组接口，快速达到功能对等；
就诊走 routers/visits.py 的逐条 CRUD（更优路径）。后续可逐表平滑迁移到
逐条 CRUD，前端只需换调用点，不影响其它模块。

接口（与原 server 对齐）：
  GET  /api/all            全量快照
  GET  /api/originals      报告原件清单
  GET  /api/export         带图片的 v2 备份（JSON）
  POST /api/import         导入 v2 备份
  PUT  /api/labs|reports|state|history|vitals|symptoms|diet-days|diet-weeks|
       sleep-logs|issue-status|todos   整表替换
"""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from .. import legacy

router = APIRouter(prefix="/api", tags=["snapshot"])


@router.get("/all")
def get_all():
    return legacy.get_all()


@router.get("/originals")
def get_originals():
    return legacy.list_originals()


@router.get("/export")
def export_backup():
    # export_payload() 会把报告图片内联成 dataURL，返回完整 v2 备份。
    return legacy.legacy.export_payload()


@router.post("/import")
def import_backup(data: dict = Body(...)):
    try:
        labs = data.get("labs") or []
        reports = data.get("reports") or []
        legacy.replace_labs(labs)
        legacy.replace_reports(reports)
        legacy.replace_state(data.get("weights") or [], data.get("done") or {}, data.get("body"))
        if "vitals" in data:
            legacy.replace_vitals(data.get("vitals") or [])
        if "symptoms" in data:
            legacy.replace_symptoms(data.get("symptoms") or [])
        if "dietDays" in data:
            legacy.replace_diet_days(data.get("dietDays") or [])
        if "dietWeeks" in data:
            legacy.replace_diet_weeks(data.get("dietWeeks") or [])
        if "sleepLogs" in data:
            legacy.replace_sleep_logs(data.get("sleepLogs") or [])
        if "issueStatus" in data:
            legacy.replace_issue_status(data.get("issueStatus") or {})
        if "todoItems" in data:
            legacy.replace_todo_items(data.get("todoItems") or [])
        if "profileOverrides" in data:
            legacy.replace_profile_overrides(data.get("profileOverrides") or {})
        hist = {k: data[k] for k in
                ("allergies", "familyHistory", "surgeries", "visits", "medications")
                if k in data}
        if hist:
            legacy.replace_history(hist)
        return {"ok": True, "labs": len(labs), "reports": len(reports)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"导入失败：{e}")


# ---------- 整表替换（与原 server 语义一致：只处理请求体里出现的键） ----------

@router.put("/labs")
def put_labs(rows: list = Body(...)):
    legacy.replace_labs(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/reports")
def put_reports(rows: list = Body(...)):
    files = legacy.replace_reports(rows)
    return {"ok": True, "n": len(rows), "files": files}


@router.put("/state")
def put_state(data: dict = Body(...)):
    legacy.replace_state(data.get("weights") or [], data.get("done") or {}, data.get("body"))
    if "profileOverrides" in data:
        legacy.replace_profile_overrides(data.get("profileOverrides") or {})
    return {"ok": True}


@router.put("/history")
def put_history(data: dict = Body(...)):
    counts = legacy.replace_history(data)
    return {"ok": True, "n": counts}


@router.put("/vitals")
def put_vitals(rows: list = Body(...)):
    legacy.replace_vitals(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/symptoms")
def put_symptoms(rows: list = Body(...)):
    legacy.replace_symptoms(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/diet-days")
def put_diet_days(rows: list = Body(...)):
    legacy.replace_diet_days(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/diet-weeks")
def put_diet_weeks(rows: list = Body(...)):
    legacy.replace_diet_weeks(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/sleep-logs")
def put_sleep_logs(rows: list = Body(...)):
    legacy.replace_sleep_logs(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/issue-status")
def put_issue_status(data: dict = Body(...)):
    n = legacy.replace_issue_status(data)
    return {"ok": True, "n": n}


@router.put("/todos")
def put_todos(rows: list = Body(...)):
    legacy.replace_todo_items(rows)
    return {"ok": True, "n": len(rows)}
