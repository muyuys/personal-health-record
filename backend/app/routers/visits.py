# -*- coding: utf-8 -*-
"""就诊逐条 CRUD —— 替代旧「PUT /api/history 整表替换」。

关键点（对应 docs §3.2 / §4.3）：
- 逐条写，不再 DELETE FROM visit 后整批覆盖；
- 写请求带 expected_revision，版本不一致返回 409（不静默覆盖）；
- 每次成功写 revision += 1；
- 所有列映射与 health_server.replace_history 的 visit 写入保持一致。
- 按成员隔离：profile_scope 依赖切换 db 的 _profile_scope 后 connect() 指向成员库。
"""
from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from ..db import connect, _db_lock
from ..models import Visit, VisitCreate, VisitUpdate, WriteResult
from ..deps import profile_context, resolve_profile

router = APIRouter(prefix="/api/visits", tags=["visits"])


def _row_to_visit(r) -> Visit:
    return Visit(
        id=r["id"],
        date=r["date"] or "",
        visitType=r["visit_type"] or "",
        department=r["department"] or "",
        hospital=r["hospital"] or "",
        doctor=r["doctor"] or "",
        chief=r["chief"] or "",
        diagnosis=r["diagnosis"] or "",
        summary=r["summary"] or "",
        note=r["note"] or "",
        reportId=r["report_id"] or "",
        createdAt=int(r["created_at"] or 0),
        revision=int(r["revision"] or 0),
    )


@router.get("", response_model=list[Visit])
def list_visits(pid: str = Depends(resolve_profile)):
    with profile_context(pid), _db_lock, connect() as c:
        rows = c.execute("SELECT * FROM visit ORDER BY date DESC, created_at DESC").fetchall()
        return [_row_to_visit(r) for r in rows]


@router.get("/{vid}", response_model=Visit)
def get_visit(vid: str, pid: str = Depends(resolve_profile)):
    with profile_context(pid), _db_lock, connect() as c:
        r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
        if not r:
            raise HTTPException(404, "就诊记录不存在")
        return _row_to_visit(r)


@router.post("", response_model=WriteResult, status_code=201)
def create_visit(body: VisitCreate, pid: str = Depends(resolve_profile)):
    vid = "vis-" + uuid.uuid4().hex[:12]
    created = int(time.time() * 1000)
    with profile_context(pid), _db_lock, connect() as c:
        c.execute(
            """INSERT INTO visit (id,date,visit_type,department,hospital,doctor,
               chief,diagnosis,summary,report_id,note,created_at,revision)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)""",
            (vid, body.date, body.visitType, body.department, body.hospital, body.doctor,
             body.chief, body.diagnosis, body.summary, body.reportId, body.note, created),
        )
        r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
        return WriteResult(item=_row_to_visit(r), revision=0)


@router.put("/{vid}", response_model=WriteResult)
def update_visit(vid: str, body: VisitUpdate, pid: str = Depends(resolve_profile)):
    with profile_context(pid), _db_lock, connect() as c:
        r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
        if not r:
            raise HTTPException(404, "就诊记录不存在")
        cur_rev = int(r["revision"] or 0)
        if body.expected_revision != cur_rev:
            _conflict(cur_rev, _row_to_visit(r).model_dump())

        new_rev = cur_rev + 1
        c.execute(
            """UPDATE visit SET date=?,visit_type=?,department=?,hospital=?,doctor=?,
               chief=?,diagnosis=?,summary=?,report_id=?,note=?,revision=?
               WHERE id=? AND revision=?""",
            (body.date, body.visitType, body.department, body.hospital, body.doctor,
             body.chief, body.diagnosis, body.summary, body.reportId, body.note,
             new_rev, vid, cur_rev),
        )
        r2 = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
        return WriteResult(item=_row_to_visit(r2), revision=new_rev)


def _conflict(cur_rev: int, current: dict):
    from fastapi import HTTPException as _H
    raise _H(status_code=409, detail={"message": f"版本冲突：实际 revision={cur_rev}", "current": current})


@router.delete("/{vid}", status_code=204)
def delete_visit(vid: str, expected_revision: int = Query(...), pid: str = Depends(resolve_profile)):
    with profile_context(pid), _db_lock, connect() as c:
        r = c.execute("SELECT revision FROM visit WHERE id=?", (vid,)).fetchone()
        if not r:
            raise HTTPException(404, "就诊记录不存在")
        cur_rev = int(r["revision"] or 0)
        if expected_revision != cur_rev:
            current = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
            _conflict(cur_rev, _row_to_visit(current).model_dump())
        c.execute("DELETE FROM visit WHERE id=? AND revision=?", (vid, cur_rev))
        return None
