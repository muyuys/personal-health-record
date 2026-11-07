# -*- coding: utf-8 -*-
"""Pydantic 模型（对齐前端 src/api/types.ts 与 docs §4 记录模型）。"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class VisitBase(BaseModel):
    date: str
    visitType: str = ""
    department: str = ""
    hospital: str = ""
    doctor: str = ""
    chief: str = ""
    diagnosis: str = ""
    summary: str = ""
    note: str = ""
    reportId: str = ""


class VisitCreate(VisitBase):
    pass


class VisitUpdate(VisitBase):
    id: str
    createdAt: int = 0
    # 乐观并发：客户端拿到的版本号，必须与库里一致才写入
    expected_revision: int = 0


class Visit(VisitBase):
    id: str
    createdAt: int = 0
    revision: int = 0


class WriteResult(BaseModel):
    item: Visit
    revision: int
