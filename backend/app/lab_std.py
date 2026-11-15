# -*- coding: utf-8 -*-
"""检验指标标准化引擎：别名匹配 → 单位换算到基准单位 → 派生标准字段。

设计要点（见 docs/设计-检验指标标准化与单位换算.md）：
- 原始 value/unit/method 一律不动；本模块只在读取时派生标准字段。
- 派生结果随字典实时计算，字典一改即全量生效，无需迁移派生列。
- 字典数据在 app/data/lab_analytes.json；手工映射（未识别指标→标准指标）
  持久化在 data/lab_map_overrides.json（key=normalized name → analyte id）。
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

_DATA = Path(__file__).resolve().parent / "data" / "lab_analytes.json"
_ROOT = Path(__file__).resolve().parents[2]  # F:/Health
_OVERRIDES = _ROOT / "data" / "lab_map_overrides.json"

# 展示用分类（按「说明对象」归并）。字典里的原始 category → 面向用户的分类名。
_CATEGORY_LABEL: dict[str, str] = {
    "血常规": "血常规",
    "肝功能": "肝功能",
    "肾功能": "肾功能",
    "电解质": "电解质",
    "血脂": "血脂",
    "糖代谢": "糖代谢",
    "维生素": "维生素与微量元素",
    "心肌标志物": "心血管",
    "心肌/酶": "心血管",
}

# 分类的展示顺序（未列出的排在最后，按名称）
CATEGORY_ORDER: list[str] = [
    "血常规", "肝功能", "肾功能", "血脂", "糖代谢",
    "电解质", "心血管", "维生素与微量元素",
]

# 缓存
_ANALYTES: list[dict] | None = None
_ALIAS_INDEX: dict[str, str] | None = None  # normalized alias -> analyte_id
_CJK_INDEX: dict[str, str] | None = None     # normalized CJK-only alias -> analyte_id
_LATIN_INDEX: dict[str, str] | None = None   # normalized latin/digit-only alias -> analyte_id


def _norm(s: str) -> str:
    """归一化项目名：全角→半角、去空白/标点/*、去括号内容、小写。"""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = s.strip().lstrip("*＊★☆ ")
    # 去括号内容（中英文括号）
    s = re.sub(r"[（(][^）)]*[）)]", "", s)
    s = re.sub(r"[\s\-_·,，。:：;；]", "", s)
    # 去掉残留的 ★☆ 标记（报告单里常出现在项目名前）
    s = s.replace("★", "").replace("☆", "")
    return s.lower()


def _cjk_part(s: str) -> str:
    """只保留中日韩文字字符。"""
    return "".join(ch for ch in (s or "") if "\u4e00" <= ch <= "\u9fff")


def _latin_part(s: str) -> str:
    """只保留英文字母与数字（小写）。"""
    return "".join(ch for ch in (s or "").lower() if ch.isascii() and ch.isalnum())


def _norm_unit(u: str) -> str:
    """单位归一化：NFKC、去空格、小写；并容忍常见 OCR 误认（nq/mq→ng，μ→u 等）。"""
    if not u:
        return ""
    u = unicodedata.normalize("NFKC", u).strip()
    u = u.replace(" ", "")
    # 常见 OCR 把 g 认成 q：ng→nq、mg→mq、ug→uq、pg→pq
    u = re.sub(r"([nmu])([qg])/", lambda m: m.group(1) + "g/", u, flags=re.I)
    # 微符号统一：μ / µ / U 常见混用
    u = u.replace("μ", "u").replace("µ", "u")
    # 常见 "l" 大小写归一：ML→ml（小写后一致）
    return u.lower()


def _load() -> None:
    global _ANALYTES, _ALIAS_INDEX, _CJK_INDEX, _LATIN_INDEX
    if _ANALYTES is not None:
        return
    raw = json.loads(_DATA.read_text(encoding="utf-8"))
    _ANALYTES = raw.get("analytes", [])
    idx: dict[str, str] = {}
    cjk: dict[str, str] = {}
    latin: dict[str, str] = {}
    for a in _ANALYTES:
        aid = a["id"]
        # 标准名 + 全部别名都进索引
        for alias in [a["name"], *a.get("aliases", [])]:
            key = _norm(alias)
            if not key:
                continue
            if key not in idx:
                idx[key] = aid
            ck = _cjk_part(key)
            if len(ck) >= 2 and ck not in cjk:
                cjk[ck] = aid
            lk = _latin_part(key)
            # 拉丁缩写至少 2 位才建索引，避免 "K"/"P" 之类误配
            if len(lk) >= 2 and lk not in latin:
                latin[lk] = aid
    _ALIAS_INDEX = idx
    _CJK_INDEX = cjk
    _LATIN_INDEX = latin


def _load_overrides() -> dict[str, str]:
    if not _OVERRIDES.exists():
        return {}
    try:
        return json.loads(_OVERRIDES.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def _save_overrides(ov: dict[str, str]) -> None:
    _OVERRIDES.parent.mkdir(parents=True, exist_ok=True)
    _OVERRIDES.write_text(json.dumps(ov, ensure_ascii=False, indent=2), encoding="utf-8")


def analyte_by_id(aid: str) -> dict | None:
    _load()
    for a in _ANALYTES or []:
        if a["id"] == aid:
            return a
    return None


def list_analytes() -> list[dict]:
    """给前端：字典全量（精简字段）。"""
    _load()
    return [
        {"id": a["id"], "name": a["name"], "category": a.get("category", ""),
         "stdCategory": _CATEGORY_LABEL.get(a.get("category", ""), a.get("category", "") or ""),
         "baseUnit": a.get("baseUnit", ""), "aliases": a.get("aliases", []),
         "conversions": a.get("conversions", []), "note": a.get("note", ""),
         "refLow": a.get("refLow"), "refHigh": a.get("refHigh")}
        for a in (_ANALYTES or [])
    ]


def match_analyte(name: str) -> str | None:
    """原始项目名 → analyte_id。

    策略（从严到宽，避免同名误并）：
      1. 人工覆盖（data/lab_map_overrides.json）
      2. 整串归一化精确命中别名
      3. 拆出的中文部分精确命中（别名中文部分）
      4. 拆出的拉丁/数字部分精确命中（缩写）
    不再使用模糊子串匹配——历史经验：子串匹配把 MCH/白蛋白/P-LCR 等误并到
    血红蛋白/肌酐/总胆固醇，污染趋势图。
    """
    _load()
    key = _norm(name)
    if not key:
        return None
    ov = _load_overrides()
    if key in ov:
        return ov[key] or None
    if key in (_ALIAS_INDEX or {}):
        return _ALIAS_INDEX[key]
    ck = _cjk_part(key)
    if len(ck) >= 2 and ck in (_CJK_INDEX or {}):
        return _CJK_INDEX[ck]
    lk = _latin_part(key)
    if len(lk) >= 2 and lk in (_LATIN_INDEX or {}):
        return _LATIN_INDEX[lk]
    return None


def _find_conversion(analyte: dict, unit: str) -> dict | None:
    u = _norm_unit(unit)
    base = analyte.get("baseUnit", "")
    if u == _norm_unit(base):
        return {"factor": 1, "offset": 0}
    # 报告单未标单位时，按基准单位直通（避免 eGFR 等无单位指标被判不可换算）
    if u == "":
        return {"factor": 1, "offset": 0}
    for conv in analyte.get("conversions", []):
        if _norm_unit(conv.get("from", "")) == u:
            return {"factor": float(conv.get("factor", 1)), "offset": float(conv.get("offset", 0))}
    return None


def _scale(v, conv):
    if v is None:
        return None
    try:
        return round(float(v) * conv["factor"] + conv["offset"], 6)
    except (TypeError, ValueError):
        return None


def _is_microscopy_unit(unit: str) -> bool:
    """尿沉渣镜检类单位（/ul、/HP、/hpf、/LPF 等），与血液计数(10^9/L)不可比。"""
    u = _norm_unit(unit)
    if "10^" in u:
        return False
    return any(t in u for t in ("/ul", "/hp", "/lpf", "个/"))


def standardize_lab(lab: dict) -> dict:
    """给单条 lab 追加派生字段（不改原始键）。返回 {..std fields..}。

    派生字段：
      analyteId, stdName, category, baseUnit, valueStd, lowStd, highStd,
      unitRaw, valueRaw, method, stdStatus
    stdStatus ∈ ok / qualitative / unit_unconverted / unmapped
    """
    name = lab.get("name") or ""
    unit = lab.get("unit") or ""
    value = lab.get("value")
    qualitative = (lab.get("qualitative") or "").strip()
    aid = match_analyte(name)
    method = (lab.get("method") or "").strip()

    # 标本口径纠偏：血液计数类指标若记录的是尿沉渣镜检单位（/ul、/HP…），
    # 说明这是「尿白细胞/尿红细胞」而非血常规，不能并入血常规趋势 → 视为未映射。
    if aid:
        _a = analyte_by_id(aid)
        if _a and _a.get("category") == "血常规" and _is_microscopy_unit(unit):
            aid = None

    out: dict[str, Any] = {
        "analyteId": aid or "",
        "stdName": "",
        "stdCategory": "",
        "baseUnit": "",
        "valueStd": None,
        "lowStd": None,
        "highStd": None,
        "unitRaw": unit,
        "valueRaw": value,
        "method": method,
        "stdStatus": "unmapped",
        "refLowStd": None,
        "refHighStd": None,
        "refSource": "none",
        "effLowStd": None,
        "effHighStd": None,
    }
    if not aid:
        return out
    a = analyte_by_id(aid)
    if not a:
        return out
    out["stdName"] = a["name"]
    out["stdCategory"] = _CATEGORY_LABEL.get(a.get("category", ""), a.get("category", "") or "")
    out["baseUnit"] = a.get("baseUnit", "")

    if qualitative and (value is None or value == 0):
        out["stdStatus"] = "qualitative"
        return out

    conv = _find_conversion(a, unit)
    if conv is None:
        out["stdStatus"] = "unit_unconverted"
        return out

    # 参考区间：优先用自填(low/high)，缺则套用标准字典的成人参考值
    low_raw = lab.get("low")
    high_raw = lab.get("high")
    self_low = _scale(low_raw, conv)
    self_high = _scale(high_raw, conv)
    ref_low = a.get("refLow")
    ref_high = a.get("refHigh")
    if (low_raw is not None or high_raw is not None):
        out["refLowStd"] = self_low
        out["refHighStd"] = self_high
        out["refSource"] = "filled"
    else:
        out["refLowStd"] = ref_low
        out["refHighStd"] = ref_high
        out["refSource"] = "standard" if (ref_low is not None or ref_high is not None) else "none"
    # 自填优先，标准值作为回退填充
    out["effLowStd"] = self_low if self_low is not None else ref_low
    out["effHighStd"] = self_high if self_high is not None else ref_high

    out["valueStd"] = _scale(value, conv)
    out["lowStd"] = self_low
    out["highStd"] = self_high
    out["stdStatus"] = "ok"
    return out


def enrich_labs(labs: list[dict]) -> list[dict]:
    """批量给 /api/all 的 labs 追加派生字段。"""
    out = []
    for lab in labs:
        merged = dict(lab)
        merged.update(standardize_lab(lab))
        out.append(merged)
    return out


def map_override(name: str, analyte_id: str) -> None:
    """人工把某原始项目名映射到标准指标（空字符串表示清除）。"""
    ov = _load_overrides()
    key = _norm(name)
    if not key:
        raise ValueError("项目名为空")
    if analyte_id:
        if not analyte_by_id(analyte_id):
            raise ValueError("未知标准指标：" + analyte_id)
        ov[key] = analyte_id
    else:
        ov.pop(key, None)
    _save_overrides(ov)


def unmapped_summary(labs: list[dict]) -> list[dict]:
    """聚合未映射（stdStatus=unmapped）的项目名，给维护页。"""
    agg: dict[str, dict] = {}
    for lab in labs:
        st = standardize_lab(lab)
        if st["stdStatus"] != "unmapped":
            continue
        name = lab.get("name") or ""
        key = _norm(name)
        if not key:
            continue
        item = agg.setdefault(key, {"name": name, "count": 0, "units": set(), "category": lab.get("category", "")})
        item["count"] += 1
        if lab.get("unit"):
            item["units"].add(lab["unit"])
    return [
        {"name": v["name"], "count": v["count"], "units": sorted(v["units"]), "category": v["category"]}
        for v in agg.values()
    ]
