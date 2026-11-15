# -*- coding: utf-8 -*-
"""快照 / 整表替换接口 —— 与旧 health_server.py 数据层完全兼容。

按成员隔离：所有路由依赖 resolve_profile，最后在 profile_context(pid) 内调用 legacy。

接口（与原 server 对齐）：
  GET  /api/all            全量快照
  GET  /api/originals      报告原件清单
  GET  /api/export         带图片的 v2 备份（JSON）
  POST /api/import         导入 v2 备份
  PUT  /api/labs|reports|state|history|vitals|symptoms|diet-days|diet-weeks|
       sleep-logs|issue-status|todos   整表替换
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from .. import legacy
from .. import lab_std
from ..deps import profile_context, resolve_profile

router = APIRouter(prefix="/api", tags=["snapshot"])


@router.get("/all")
def get_all(pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        snap = legacy.get_all()
    # 检验指标标准化：为每条 lab 派生 analyteId/valueStd/lowStd/highStd/method/stdStatus
    snap["labs"] = lab_std.enrich_labs(snap.get("labs") or [])
    return snap


@router.get("/labs/analytes")
def labs_analytes():
    """标准指标字典全量（给前端筛选/维护页用）。"""
    return {"analytes": lab_std.list_analytes()}


@router.get("/labs/unmapped")
def labs_unmapped(pid: str = Depends(resolve_profile)):
    """未识别指标清单（stdStatus=unmapped 的项目名聚合）。"""
    with profile_context(pid):
        snap = legacy.get_all()
    return {"items": lab_std.unmapped_summary(snap.get("labs") or [])}


@router.post("/labs/map")
def labs_map(payload: dict = Body(...), pid: str = Depends(resolve_profile)):
    """人工把原始项目名映射到标准指标。payload={name, analyteId}。"""
    name = (payload or {}).get("name", "")
    aid = (payload or {}).get("analyteId", "")
    try:
        lab_std.map_override(name, aid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.get("/originals")
def get_originals(pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        return legacy.list_originals()


@router.get("/export")
def export_backup(pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        return legacy.legacy.export_payload()


@router.post("/import")
def import_backup(data: dict = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
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


@router.put("/labs")
def put_labs(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_labs(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/reports")
def put_reports(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        files = legacy.replace_reports(rows)
    return {"ok": True, "n": len(rows), "files": files}


@router.put("/state")
def put_state(data: dict = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_state(data.get("weights") or [], data.get("done") or {}, data.get("body"))
        if "profileOverrides" in data:
            legacy.replace_profile_overrides(data.get("profileOverrides") or {})
    return {"ok": True}


@router.put("/history")
def put_history(data: dict = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        counts = legacy.replace_history(data)
    return {"ok": True, "n": counts}


@router.put("/vitals")
def put_vitals(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_vitals(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/symptoms")
def put_symptoms(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_symptoms(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/diet-days")
def put_diet_days(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_diet_days(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/diet-weeks")
def put_diet_weeks(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_diet_weeks(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/sleep-logs")
def put_sleep_logs(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_sleep_logs(rows)
    return {"ok": True, "n": len(rows)}


@router.put("/issue-status")
def put_issue_status(data: dict = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        n = legacy.replace_issue_status(data)
    return {"ok": True, "n": n}


@router.put("/todos")
def put_todos(rows: list = Body(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid):
        legacy.replace_todo_items(rows)
    return {"ok": True, "n": len(rows)}
