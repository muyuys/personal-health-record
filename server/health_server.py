#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本机健康档案服务 —— 页面 + 数据库 + 图片识别，全在本机。

为什么需要它：浏览器 localStorage 只有 5 MB，报告照片一多就撑爆，而且
换个浏览器、清一次站点数据就全没了。数据改存 SQLite（data/health.db），
图片存成真实文件（data/报告原件/files/），备份导出仍是 JSON。

约束（与项目原则一致）：
  * 只监听 127.0.0.1，外部机器访问不到；
  * 不联网：没有对外请求，模型与数据都在本机；
  * OCR 只做「图片 → 文字」，结构化仍由页面里的解析器 + 人工勾选完成。

启动：双击「启动健康档案.bat」，或 .venv\\Scripts\\python.exe health_server.py
接口：
  GET  /                    页面
  GET  /api/all             {labs, reports, weights, done, savedAt, ... , vitals}
  GET  /api/originals       data/报告原件 下真实原件清单（图片 / PDF / DICOM）
  PUT  /api/labs            请求体 = 检验记录数组（整表替换，事务内）
  PUT  /api/reports         请求体 = 报告数组（file 可传 dataURL，服务端落盘）
  PUT  /api/state           请求体 = {weights, done}
  PUT  /api/vitals          请求体 = 生命体征记录数组（整表替换，事务内）
  PUT  /api/symptoms        请求体 = 症状日记记录数组（整表替换，事务内）
  PUT  /api/diet-days       请求体 = 减重每日记录数组（整表替换，事务内）
  PUT  /api/diet-weeks      请求体 = 减重每周复盘数组（整表替换，事务内）
  PUT  /api/issue-status    请求体 = {issueId:{status,note}} 问题状态覆盖（整表替换，事务内）
  PUT  /api/todos           请求体 = 用户新增的复诊待办数组（整表替换，事务内）
  GET  /api/export          带图片的 v2 备份（下载）
  POST /api/import          导入 v2 备份（请求体 = JSON）
  GET  /ping                服务与识别引擎状态
  POST /ocr                 请求体 = 图片字节，返回文字行
"""

import base64
import json
import mimetypes
import os
import re
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = "127.0.0.1"
PORT = 8765
MAX_JSON = 32 * 1024 * 1024          # 报告图片走 base64，留足余量
MAX_IMAGE = 24 * 1024 * 1024

ROOT = Path(__file__).resolve().parent.parent      # F:/Health
DB_PATH = ROOT / "data" / "health.db"
IMG_DIR = ROOT / "data" / "报告原件" / "files"
ORIG_DIR = ROOT / "data" / "报告原件"                # 报告原件根目录（含 files/ 下的图片）

BACKUP_KEEP_DAYS = 30        # 每日滚动备份保留天数（每天最多 1 份）
EXPORT_REMIND_DAYS = 7       # 超过多少天没导出 JSON 就提醒用户

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ocr_server                                  # 复用识别逻辑，别再写一遍

_db_lock = threading.Lock()

# 报告原件可查看的文件后缀（图片 / PDF / DICOM）。只做清单与打开，不改动文件。
ORIG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".pdf", ".dcm", ".dicom", ".tif", ".tiff"}


def list_originals():
    """列出 data/报告原件 下真实存在的原件文件（递归，含 files/ 子目录）。

    返回 ROOT 相对路径（正斜杠），浏览器可直接用它对到静态托管地址；
    不做任何医疗内容推断，只报文件名 / 大小 / 修改时间。目录不存在时返回空表。
    """
    if not ORIG_DIR.is_dir():
        return []
    root = ROOT.resolve()
    out = []
    for p in sorted(ORIG_DIR.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in ORIG_EXTS:
            continue
        try:
            st = p.stat()
            rel = p.resolve().relative_to(root).as_posix()
        except (OSError, ValueError):
            continue
        out.append({
            "path": rel,
            "name": p.name,
            "dir": p.parent.resolve().relative_to(root).as_posix(),
            "size": st.st_size,
            "mtime": int(st.st_mtime),
            "ext": p.suffix.lower().lstrip("."),
        })
    # 新文件在前，方便刚扫描入库的原件直接看到
    out.sort(key=lambda x: x["mtime"], reverse=True)
    return out


# ---------------------------------------------------------------- 数据库

def connect():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS labs (
          id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL,
          name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
          low REAL, high REAL, source TEXT DEFAULT '', note TEXT DEFAULT '',
          report_id TEXT DEFAULT '', qualitative TEXT DEFAULT '', flag TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_labs_date ON labs(date);
        CREATE INDEX IF NOT EXISTS idx_labs_name ON labs(name);
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL,
          panel TEXT DEFAULT '', specimen TEXT DEFAULT '', hospital TEXT DEFAULT '',
          note TEXT DEFAULT '', file TEXT DEFAULT '', created_at INTEGER
        );
        -- 体重 / 体脂：字段对齐小米体脂秤导出（bfp / smm / bmi / vfl / bmr / bmc）。
        -- 这些身体成分列均可空（普通体重秤只填 kg）；一条记录仍以 kg 为主键值。
        CREATE TABLE IF NOT EXISTS weights (
          id TEXT PRIMARY KEY, date TEXT, kg REAL, tag TEXT, waist REAL, note TEXT,
          body_fat REAL, muscle REAL, bmi REAL, visceral_fat REAL, bmr REAL, bone REAL
        );
        -- 身体围度：胸 / 腰 / 臀，单位 cm。三项都可空（只量其中一项也能记），
        -- 但一条记录至少要有一项，由前端保证。waist 以本表为准，weights.waist 仅为旧字段兼容。
        CREATE TABLE IF NOT EXISTS body (
          id TEXT PRIMARY KEY, date TEXT NOT NULL,
          chest REAL, waist REAL, hip REAL,
          note TEXT DEFAULT '', created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_body_date ON body(date);
        CREATE TABLE IF NOT EXISTS todo (k TEXT PRIMARY KEY, v INTEGER);
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
        -- 过敏史：severity = critical（危急，曾致严重/危及生命的反应）/ high / mild
        CREATE TABLE IF NOT EXISTS allergy (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '',
          severity TEXT DEFAULT '', reaction TEXT DEFAULT '', note TEXT DEFAULT '',
          created_at INTEGER
        );
        -- 家族史：亲属（relation）+ 疾病/状况（condition）
        CREATE TABLE IF NOT EXISTS family_history (
          id TEXT PRIMARY KEY, relation TEXT DEFAULT '', condition TEXT DEFAULT '',
          note TEXT DEFAULT '', created_at INTEGER
        );
        -- 手术 / 住院史
        CREATE TABLE IF NOT EXISTS surgery (
          id TEXT PRIMARY KEY, date TEXT DEFAULT '', name TEXT DEFAULT '',
          hospital TEXT DEFAULT '', note TEXT DEFAULT '', created_at INTEGER
        );
        -- 就诊实例：一次实际发生的就诊（门诊 / 急诊 / 住院 / 体检）。
        -- report_id 可关联一份报告；诊断/小结/主诉供「就诊摘要」与时间线引用。
        CREATE TABLE IF NOT EXISTS visit (
          id TEXT PRIMARY KEY, date TEXT NOT NULL, visit_type TEXT DEFAULT '',
          department TEXT DEFAULT '', hospital TEXT DEFAULT '', doctor TEXT DEFAULT '',
          chief TEXT DEFAULT '', diagnosis TEXT DEFAULT '', summary TEXT DEFAULT '',
          report_id TEXT DEFAULT '', note TEXT DEFAULT '', created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_visit_date ON visit(date);
        -- 用药：剂量 / 频次 / 途径 / 起止日期。status = active（在服）/ stopped（已停）/ unknown（待确认）。
        -- visit_id 可关联到某次就诊（哪次开/停的药）。
        CREATE TABLE IF NOT EXISTS medication (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, dose TEXT DEFAULT '',
          frequency TEXT DEFAULT '', route TEXT DEFAULT '',
          start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
          purpose TEXT DEFAULT '', status TEXT DEFAULT 'active', note TEXT DEFAULT '',
          visit_id TEXT DEFAULT '', created_at INTEGER,
          -- 信息日期：这条用药信息是何时确认/自述的（可能与开始日期不同）
          info_date TEXT DEFAULT '',
          -- 来源：该记录回溯到的原始档案（病例 md 相对路径 + 行号）
          source_ref TEXT DEFAULT '',
          -- 待核对：仍需向医生/本人确认的事项（浓度、开封日期、是否在用等）
          to_verify TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_medication_name ON medication(name);
        -- 生命体征：血压 / 心率 / 体温 / 血氧 / 血糖，按日记录。各列均可空，
        -- 一条记录至少填一项（由前端保证）。glucose_tag = 空腹 / 餐后2h / 随机，
        -- 仅用于血糖参考区间与异常判断；血压用 systolic/diastolic 成对记录。
        CREATE TABLE IF NOT EXISTS vitals (
          id TEXT PRIMARY KEY, date TEXT NOT NULL,
          systolic REAL, diastolic REAL, pulse REAL, temperature REAL,
          spo2 REAL, glucose REAL, glucose_tag TEXT DEFAULT '',
          note TEXT DEFAULT '', created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_vitals_date ON vitals(date);
        -- 症状日记：按日记录主观不适（干眼、鼻炎、踝痛等），不为每个病单独建页。
        -- part = 部位 / 主题（筛选维度）；severity = 主观程度 1–10（1 很轻、10 难以忍受）；
        -- trigger = 诱因；note = 备注。三者均可空，但 part 由前端保证必填。
        CREATE TABLE IF NOT EXISTS symptom (
          id TEXT PRIMARY KEY, date TEXT NOT NULL, part TEXT NOT NULL DEFAULT '',
          severity INTEGER, "trigger" TEXT DEFAULT '', note TEXT DEFAULT '',
          created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_symptom_date ON symptom(date);
        CREATE INDEX IF NOT EXISTS idx_symptom_part ON symptom(part);
        -- 减重每日记录：按日一条，记录晨重 / 腰围 / 睡眠 / 每餐 / 摄入中心与范围 / 完整度。
        -- 所有数值列可空；空白＝未记录，不代表 0（由前端提示，不补造数据）。
        CREATE TABLE IF NOT EXISTS diet_day (
          id TEXT PRIMARY KEY, date TEXT NOT NULL,
          morning_weight REAL, weight_note TEXT DEFAULT '', waist REAL, sleep REAL,
          hunger TEXT DEFAULT '', ankle TEXT DEFAULT '',
          breakfast TEXT DEFAULT '', lunch TEXT DEFAULT '', dinner TEXT DEFAULT '',
          snack TEXT DEFAULT '',
          kcal_center REAL, kcal_low REAL, kcal_high REAL, budget REAL,
          completeness TEXT DEFAULT '', summary TEXT DEFAULT '', note TEXT DEFAULT '',
          created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_diet_day_date ON diet_day(date);
        -- 减重每周复盘：按周一条（以周起始日 week_start 为准）。
        CREATE TABLE IF NOT EXISTS diet_week (
          id TEXT PRIMARY KEY, week_start TEXT NOT NULL, week_end TEXT DEFAULT '',
          review_date TEXT DEFAULT '', weight_days INTEGER, weight_avg REAL,
          weight_prev_avg REAL, waist REAL, complete_days INTEGER,
          kcal_center REAL, kcal_low REAL, kcal_high REAL,
          ankle TEXT DEFAULT '', energy TEXT DEFAULT '',
          observe_miss TEXT DEFAULT '', observe_habit TEXT DEFAULT '',
          observe_diff TEXT DEFAULT '', next_focus TEXT DEFAULT '', adjust TEXT DEFAULT '',
          note TEXT DEFAULT '', created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_diet_week_start ON diet_week(week_start);
        -- 睡眠记录：来自小米手环 / App 导出的每日睡眠汇总（一条一天）。
        -- hours = 总睡眠小时（= minutes/60），由导入时换算；score/bedtime/wake 可空。
        CREATE TABLE IF NOT EXISTS sleep_log (
          id TEXT PRIMARY KEY, date TEXT NOT NULL,
          hours REAL, minutes REAL, score INTEGER,
          bedtime TEXT DEFAULT '', wake TEXT DEFAULT '',
          note TEXT DEFAULT '', source TEXT DEFAULT '', created_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_sleep_log_date ON sleep_log(date);
        -- 健康问题状态覆盖：只存用户「页内手动修改」的问题状态 / 备注，key = data.js 里的问题 id。
        -- 不改静态档案；渲染时若存在覆盖则覆盖 status，并附「我的备注」。删除行即恢复默认。
        CREATE TABLE IF NOT EXISTS issue_status (
          id TEXT PRIMARY KEY, status TEXT DEFAULT '', note TEXT DEFAULT '',
          updated_at INTEGER
        );
        -- 复诊待办（用户页内新增）：done 勾选仍复用 todo 表（k = 本表 id，v = 0/1），
        -- 与旧的静态待办勾选一致，不改旧机制。text 必填。
        CREATE TABLE IF NOT EXISTS todo_item (
          id TEXT PRIMARY KEY, text TEXT NOT NULL, group_name TEXT DEFAULT '',
          meta TEXT DEFAULT '', flag INTEGER DEFAULT 0, created_at INTEGER,
          due_date TEXT DEFAULT '', follow_type TEXT DEFAULT ''
        );
        """)
        # 增量迁移（幂等）：老库补上定性结果与异常标志两列，绝不 DROP / 清空数据。
        cols = {row[1] for row in c.execute("PRAGMA table_info(labs)")}
        if "qualitative" not in cols:
            c.execute("ALTER TABLE labs ADD COLUMN qualitative TEXT DEFAULT ''")
        if "flag" not in cols:
            c.execute("ALTER TABLE labs ADD COLUMN flag TEXT DEFAULT ''")
        # 增量迁移（幂等）：老库的 weights 补上体脂/肌肉量/BMI/内脏脂肪/基础代谢/骨量。
        # 只 ADD COLUMN，绝不 DROP / 清空；新库已在 CREATE TABLE 里带上这些列。
        wcols = {row[1] for row in c.execute("PRAGMA table_info(weights)")}
        for _col in ("body_fat", "muscle", "bmi", "visceral_fat", "bmr", "bone"):
            if _col not in wcols:
                c.execute(f"ALTER TABLE weights ADD COLUMN {_col} REAL")
        # 增量迁移（幂等）：老库的 todo_item 补上到期日（任务 016，供首页到期提醒）。
        # 只 ADD COLUMN，绝不 DROP / 清空；新库已在 CREATE TABLE 里带上该列。
        tcols = {row[1] for row in c.execute("PRAGMA table_info(todo_item)")}
        if "due_date" not in tcols:
            c.execute("ALTER TABLE todo_item ADD COLUMN due_date TEXT DEFAULT ''")
        # 增量迁移（幂等）：老库 todo_item 补上随访类型（任务 025，区分复诊/定期检查/复查化验/其他）。
        # 只 ADD COLUMN，绝不 DROP / 清空；新库已在 CREATE TABLE 里带上该列。空值视为复诊(visit)。
        if "follow_type" not in tcols:
            c.execute("ALTER TABLE todo_item ADD COLUMN follow_type TEXT DEFAULT ''")
        # 增量迁移（幂等）：老库的 medication 补上 信息日期 / 来源 / 待核对 三列。
        # 只 ADD COLUMN，绝不 DROP / 清空；新库已在 CREATE TABLE 里带上这些列。
        mcols = {row[1] for row in c.execute("PRAGMA table_info(medication)")}
        for _col in ("info_date", "source_ref", "to_verify"):
            if _col not in mcols:
                c.execute(f"ALTER TABLE medication ADD COLUMN {_col} TEXT DEFAULT ''")


# ---------------------------------------------------------------- 自动备份

def _backup_dir() -> Path:
    """备份目录跟随数据库位置（-d 测试库时备份到它旁边，绝不碰正式数据）。"""
    return DB_PATH.parent / "backups"


_BACKUP_NAME = re.compile(r"^health-(\d{4}-\d{2}-\d{2})\.db$")


def backup_db(force=False):
    """把当前库快照到 data/backups/health-YYYY-MM-DD.db，返回路径或 None。

    * 用 SQLite 官方 backup API：WAL 模式下也能拿到一致快照，不是裸文件拷贝；
    * 每天只留 1 份：当天已有且非 force 时直接跳过（幂等，重复启动不重复生成）；
    * 没库（如全新环境）时什么也不做。
    """
    if not DB_PATH.exists():
        return None
    bdir = _backup_dir()
    bdir.mkdir(parents=True, exist_ok=True)
    dest = bdir / f"health-{time.strftime('%Y-%m-%d')}.db"
    if dest.exists() and not force:
        return None
    tmp = dest.with_name(dest.name + ".tmp")
    src = dst = None
    try:
        src = sqlite3.connect(DB_PATH, timeout=10)
        dst = sqlite3.connect(tmp)
        with dst:
            src.backup(dst)
    finally:
        # Windows 上必须先关掉连接再改名，否则文件被占用无法 os.replace
        for conn in (dst, src):
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass
    try:
        os.replace(tmp, dest)
        return dest
    except OSError:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        raise


def prune_backups(keep=BACKUP_KEEP_DAYS):
    """只保留最近 keep 份每日备份，更旧的删除；返回被删文件名列表。"""
    bdir = _backup_dir()
    if not bdir.is_dir():
        return []
    files = []
    for p in bdir.glob("health-*.db"):
        m = _BACKUP_NAME.match(p.name)
        if m:
            files.append((m.group(1), p))
    files.sort(key=lambda x: x[0], reverse=True)
    removed = []
    for _, p in files[keep:]:
        try:
            p.unlink()
            removed.append(p.name)
        except OSError:
            pass
    return removed


def set_meta(k, v):
    with connect() as c:
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)", (k, str(v)))


def get_meta(k, default=None):
    with connect() as c:
        row = c.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return row["v"] if row else default


def export_status():
    """上次导出时间与是否需要提醒。lastExportAt 存纪元秒。"""
    raw = get_meta("lastExportAt")
    try:
        last = int(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        last = None
    now = int(time.time())
    days = None if last is None else (now - last) / 86400.0
    due = last is None or days >= EXPORT_REMIND_DAYS
    return {
        "lastExportAt": last,
        "daysSince": None if days is None else round(days, 1),
        "due": due,
    }


def export_reminder_text(st):
    if st["lastExportAt"] is None:
        return "还没导出过 JSON 备份，建议在页面点「导出」另存一份到别处"
    return f"距上次导出已 {st['daysSince']} 天，建议重新导出 JSON 备份"


def run_housekeeping(verbose=True):
    """启动时跑一次：当日备份 + 清理过期 + 导出提醒。幂等，可重复调用。

    备份/清理出错只打印告警，不阻断服务启动（数据安全功能不能反过来让服务起不来）。
    """
    made = None
    removed = []
    error = None
    try:
        made = backup_db()
        removed = prune_backups()
    except Exception as e:
        error = str(e)
        if verbose:
            print(f"  备份   失败：{e}（不影响数据读写）")
    st = export_status()
    if verbose:
        if made:
            print(f"  备份   已生成 {made.name}")
        elif not error:
            print(f"  备份   今日已有备份，跳过（保留最近 {BACKUP_KEEP_DAYS} 天）")
        if removed:
            print(f"  清理   删除过期备份 {len(removed)} 份")
        if st["due"]:
            print("  提醒   " + export_reminder_text(st))
    return {"backup": str(made) if made else None, "pruned": removed,
            "export": st, "error": error}


def _num(v):
    return None if v is None or v == "" else float(v)


def get_all():
    with connect() as c:
        labs = [dict(r) for r in c.execute(
            "SELECT id,date,category,name,"
            "CASE WHEN COALESCE(qualitative,'')<>'' AND COALESCE(value,0)=0 THEN NULL ELSE value END AS value,"
            "unit,low,high,COALESCE(qualitative,'') AS qualitative,COALESCE(flag,'') AS flag,"
            "source,note,report_id AS reportId FROM labs ORDER BY date")]
        reports = [dict(r) for r in c.execute(
            "SELECT id,date,title,panel,specimen,hospital,note,file,"
            "created_at AS createdAt FROM reports ORDER BY date")]
        weights = [dict(r) for r in c.execute(
            "SELECT id,date,kg,tag,waist,note,"
            "body_fat AS bodyFat,muscle,bmi,visceral_fat AS visceralFat,bmr,bone "
            "FROM weights ORDER BY date")]
        body = [dict(r) for r in c.execute(
            "SELECT id,date,chest,waist,hip,note,created_at AS createdAt FROM body ORDER BY date")]
        done = {r["k"]: bool(r["v"]) for r in c.execute("SELECT k,v FROM todo")}
        allergies = [dict(r) for r in c.execute(
            "SELECT id,name,category,severity,reaction,note,created_at AS createdAt "
            "FROM allergy ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'mild' THEN 2 ELSE 3 END, name")]
        family_history = [dict(r) for r in c.execute(
            "SELECT id,relation,condition,note,created_at AS createdAt "
            "FROM family_history ORDER BY relation, condition")]
        surgeries = [dict(r) for r in c.execute(
            "SELECT id,date,name,hospital,note,created_at AS createdAt FROM surgery ORDER BY date DESC")]
        visits = [dict(r) for r in c.execute(
            "SELECT id,date,visit_type AS visitType,department,hospital,doctor,chief,"
            "diagnosis,summary,report_id AS reportId,note,created_at AS createdAt "
            "FROM visit ORDER BY date DESC, created_at DESC")]
        medications = [dict(r) for r in c.execute(
            "SELECT id,name,dose,frequency,route,start_date AS startDate,"
            "end_date AS endDate,purpose,status,note,visit_id AS visitId,created_at AS createdAt,"
            "COALESCE(info_date,'') AS infoDate,COALESCE(source_ref,'') AS sourceRef,"
            "COALESCE(to_verify,'') AS toVerify "
            "FROM medication ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, "
            "start_date DESC, name")]
        vitals = [dict(r) for r in c.execute(
            "SELECT id,date,systolic,diastolic,pulse,temperature,spo2,glucose,"
            "COALESCE(glucose_tag,'') AS glucoseTag,note,created_at AS createdAt "
            "FROM vitals ORDER BY date DESC, created_at DESC")]
        symptoms = [dict(r) for r in c.execute(
            "SELECT id,date,part,severity,\"trigger\",note,created_at AS createdAt "
            "FROM symptom ORDER BY date DESC, created_at DESC")]
        diet_days = [dict(r) for r in c.execute(
            "SELECT id,date,morning_weight AS morningWeight,weight_note AS weightNote,"
            "waist,sleep,hunger,ankle,breakfast,lunch,dinner,snack,"
            "kcal_center AS kcalCenter,kcal_low AS kcalLow,kcal_high AS kcalHigh,budget,"
            "completeness,summary,note,created_at AS createdAt "
            "FROM diet_day ORDER BY date DESC, created_at DESC")]
        diet_weeks = [dict(r) for r in c.execute(
            "SELECT id,week_start AS weekStart,week_end AS weekEnd,review_date AS reviewDate,"
            "weight_days AS weightDays,weight_avg AS weightAvg,weight_prev_avg AS weightPrevAvg,"
            "waist,complete_days AS completeDays,kcal_center AS kcalCenter,"
            "kcal_low AS kcalLow,kcal_high AS kcalHigh,ankle,energy,"
            "observe_miss AS observeMiss,observe_habit AS observeHabit,"
            "observe_diff AS observeDiff,next_focus AS nextFocus,adjust,note,"
            "created_at AS createdAt FROM diet_week ORDER BY week_start DESC")]
        sleep_logs = [dict(r) for r in c.execute(
            "SELECT id,date,hours,minutes,score,bedtime,wake,note,"
            "COALESCE(source,'') AS source,created_at AS createdAt "
            "FROM sleep_log ORDER BY date DESC, created_at DESC")]
        issue_status = {r["id"]: {"status": _s(r["status"]), "note": _s(r["note"]),
                                  "updatedAt": int(r["updated_at"] or 0)}
                        for r in c.execute("SELECT id,status,note,updated_at FROM issue_status")}
        todo_items = [dict(r) for r in c.execute(
            "SELECT id,text,group_name AS groupName,meta,flag,created_at AS createdAt,"
            "COALESCE(due_date,'') AS dueDate,COALESCE(follow_type,'') AS followType "
            "FROM todo_item ORDER BY created_at, id")]
        row = c.execute("SELECT v FROM meta WHERE k='savedAt'").fetchone()
        saved_at = int(row["v"]) if row else None
    return {"labs": labs, "reports": reports, "weights": weights,
            "body": body, "done": done, "savedAt": saved_at,
            "allergies": allergies, "familyHistory": family_history, "surgeries": surgeries,
            "visits": visits, "medications": medications, "vitals": vitals,
            "symptoms": symptoms, "dietDays": diet_days, "dietWeeks": diet_weeks,
            "sleepLogs": sleep_logs,
            "issueStatus": issue_status, "todoItems": todo_items,
            # 上次导出状态：前端据此在首页提示「未备份」，不额外发通知
            "export": export_status()}


def _s(v):
    return "" if v is None else str(v)


def replace_history(data):
    """按需替换结构化病史/就医表：只处理请求体里出现的键，避免旧客户端或
    局部更新误清空。调用方保证 data 是 dict。返回各表写入条数。

    涉及：allergy / family_history / surgery / visit / medication。
    """
    counts = {}
    with _db_lock, connect() as c:
        if "allergies" in data:
            rows = data.get("allergies") or []
            c.execute("DELETE FROM allergy")
            c.executemany(
                "INSERT OR REPLACE INTO allergy (id,name,category,severity,reaction,note,created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                [(_s(r.get("id")) or f"alg-{i}", _s(r.get("name")).strip(),
                  _s(r.get("category")), _s(r.get("severity")), _s(r.get("reaction")),
                  _s(r.get("note")), int(r.get("createdAt") or 0))
                 for i, r in enumerate(rows)])
            counts["allergies"] = len(rows)
        if "familyHistory" in data:
            rows = data.get("familyHistory") or []
            c.execute("DELETE FROM family_history")
            c.executemany(
                "INSERT OR REPLACE INTO family_history (id,relation,condition,note,created_at) "
                "VALUES (?,?,?,?,?)",
                [(_s(r.get("id")) or f"fam-{i}", _s(r.get("relation")), _s(r.get("condition")),
                  _s(r.get("note")), int(r.get("createdAt") or 0))
                 for i, r in enumerate(rows)])
            counts["familyHistory"] = len(rows)
        if "surgeries" in data:
            rows = data.get("surgeries") or []
            c.execute("DELETE FROM surgery")
            c.executemany(
                "INSERT OR REPLACE INTO surgery (id,date,name,hospital,note,created_at) "
                "VALUES (?,?,?,?,?,?)",
                [(_s(r.get("id")) or f"sur-{i}", _s(r.get("date")), _s(r.get("name")),
                  _s(r.get("hospital")), _s(r.get("note")), int(r.get("createdAt") or 0))
                 for i, r in enumerate(rows)])
            counts["surgeries"] = len(rows)
        if "visits" in data:
            rows = data.get("visits") or []
            c.execute("DELETE FROM visit")
            c.executemany(
                "INSERT OR REPLACE INTO visit (id,date,visit_type,department,hospital,doctor,"
                "chief,diagnosis,summary,report_id,note,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                [(_s(r.get("id")) or f"vis-{i}", _s(r.get("date")), _s(r.get("visitType")),
                  _s(r.get("department")), _s(r.get("hospital")), _s(r.get("doctor")),
                  _s(r.get("chief")), _s(r.get("diagnosis")), _s(r.get("summary")),
                  _s(r.get("reportId")), _s(r.get("note")), int(r.get("createdAt") or 0))
                 for i, r in enumerate(rows)])
            counts["visits"] = len(rows)
        if "medications" in data:
            rows = data.get("medications") or []
            c.execute("DELETE FROM medication")
            c.executemany(
                "INSERT OR REPLACE INTO medication (id,name,dose,frequency,route,start_date,"
                "end_date,purpose,status,note,visit_id,created_at,info_date,source_ref,to_verify) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [(_s(r.get("id")) or f"med-{i}", _s(r.get("name")).strip(), _s(r.get("dose")),
                  _s(r.get("frequency")), _s(r.get("route")), _s(r.get("startDate")),
                  _s(r.get("endDate")), _s(r.get("purpose")), _s(r.get("status")) or "active",
                  _s(r.get("note")), _s(r.get("visitId")), int(r.get("createdAt") or 0),
                  _s(r.get("infoDate")), _s(r.get("sourceRef")), _s(r.get("toVerify")))
                 for i, r in enumerate(rows)])
            counts["medications"] = len(rows)
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
    return counts


def replace_labs(rows):
    def _value(r):
        # 定性结果没有数值：用 0.0 作占位以满足 value REAL NOT NULL 的旧约束；
        # 读取时 get_all() 会按 qualitative 把占位还原成 NULL，不会污染趋势。
        v = r.get("value")
        if v is None or v == "":
            return 0.0
        return float(v)

    with _db_lock, connect() as c:
        c.execute("DELETE FROM labs")
        c.executemany(
            "INSERT INTO labs (id,date,category,name,value,unit,low,high,source,note,report_id,qualitative,flag) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(r["id"], r["date"], r["category"], r["name"], _value(r), r["unit"],
              _num(r.get("low")), _num(r.get("high")),
              r.get("source") or "", r.get("note") or "", r.get("reportId") or "",
              (r.get("qualitative") or ""), (r.get("flag") or ""))
             for r in rows])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


# ---------------------------------------------------------------- 报告图片

DATA_URL = re.compile(r"^data:image/(jpeg|jpg|png|webp);base64,(.+)$", re.S)
FILE_URL = re.compile(r"^/files/([A-Za-z0-9._-]+)$")


def _drop_file(name):
    if not name:
        return
    try:
        (IMG_DIR / name).unlink(missing_ok=True)
    except OSError:
        pass


def _store_file(report_id, data_url):
    """dataURL 落成文件，返回 /files/xxx.jpg。识别不了就原样返回空串。"""
    m = DATA_URL.match(data_url or "")
    if not m:
        return ""
    ext = "png" if m.group(1) == "png" else ("webp" if m.group(1) == "webp" else "jpg")
    raw = base64.b64decode(m.group(2))
    name = f"{report_id}.{ext}"
    (IMG_DIR / name).write_bytes(raw)
    return "/files/" + name


def replace_reports(rows):
    with _db_lock, connect() as c:
        old = {r["id"]: r["file"] for r in c.execute("SELECT id,file FROM reports")}
        c.execute("DELETE FROM reports")
        prepared = []
        for r in rows:
            f = r.get("file") or ""
            if DATA_URL.match(f):
                new = _store_file(r["id"], f)
            elif FILE_URL.match(f):
                new = f
            else:
                new = ""
            # 换了图或删了图，把旧文件清掉，别在磁盘上越积越多
            prev = old.get(r["id"], "")
            pm = FILE_URL.match(prev or "")
            if pm and ("/files/" + pm.group(1)) != new:
                _drop_file(pm.group(1))
            prepared.append((r["id"], r["date"], r["title"], r.get("panel") or "",
                             r.get("specimen") or "", r.get("hospital") or "",
                             r.get("note") or "", new, int(r.get("createdAt") or 0)))
        c.executemany(
            "INSERT INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)", prepared)
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
    return [p[7] for p in prepared]


def replace_state(weights, done, body=None):
    with _db_lock, connect() as c:
        c.execute("DELETE FROM weights")
        c.executemany(
            "INSERT INTO weights (id,date,kg,tag,waist,note,"
            "body_fat,muscle,bmi,visceral_fat,bmr,bone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [(w.get("id") or f"w-{i}", w.get("date") or "", float(w.get("kg") or 0),
              w.get("tag") or "", _num(w.get("waist")), w.get("note") or "",
              _num(w.get("bodyFat")), _num(w.get("muscle")), _num(w.get("bmi")),
              _num(w.get("visceralFat")), _num(w.get("bmr")), _num(w.get("bone")))
             for i, w in enumerate(weights or [])])
        if body is not None:
            c.execute("DELETE FROM body")
            c.executemany(
                "INSERT OR REPLACE INTO body (id,date,chest,waist,hip,note,created_at) VALUES (?,?,?,?,?,?,?)",
                [(b.get("id") or f"b-{i}", b.get("date") or "",
                  _num(b.get("chest")), _num(b.get("waist")), _num(b.get("hip")),
                  b.get("note") or "", int(b.get("createdAt") or 0) or int(time.time() * 1000))
                 for i, b in enumerate(body or [])])
        c.execute("DELETE FROM todo")
        c.executemany("INSERT INTO todo (k,v) VALUES (?,?)",
                      [(k, 1 if v else 0) for k, v in (done or {}).items()])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def replace_issue_status(data):
    """整表替换「健康问题状态覆盖」（事务内，绝不 DROP 用户其他数据）。

    接受两种形状：{issueId: {status, note, updatedAt}} 或 [{id,status,note,updatedAt}]。
    空 status 且空 note 视为「恢复默认」，不写入。返回写入条数。
    """
    if isinstance(data, dict) and "issueStatus" in data:
        data = data.get("issueStatus") or {}
    rows = []
    if isinstance(data, dict):
        for k, v in data.items():
            if not isinstance(v, dict):
                continue
            status = _s(v.get("status")).strip()
            note = _s(v.get("note")).strip()
            if not status and not note:
                continue
            rows.append((_s(k), status, note, int(v.get("updatedAt") or 0)))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            if not isinstance(v, dict):
                continue
            status = _s(v.get("status")).strip()
            note = _s(v.get("note")).strip()
            if not status and not note:
                continue
            rows.append((_s(v.get("id")) or f"iss-{i}", status, note,
                         int(v.get("updatedAt") or 0)))
    with _db_lock, connect() as c:
        c.execute("DELETE FROM issue_status")
        c.executemany(
            "INSERT OR REPLACE INTO issue_status (id,status,note,updated_at) VALUES (?,?,?,?)",
            rows)
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
    return len(rows)


def replace_todo_items(rows):
    """整表替换用户页内新增的复诊待办（事务内）。text 必填，空文本跳过。"""
    cleaned = []
    for i, r in enumerate(rows or []):
        text = _s(r.get("text")).strip()
        if not text:
            continue
        cleaned.append((_s(r.get("id")) or f"td-{i}", text,
                        _s(r.get("groupName") or r.get("group")), _s(r.get("meta")),
                        1 if r.get("flag") else 0,
                        int(r.get("createdAt") or 0) or int(time.time() * 1000),
                        _s(r.get("dueDate")), _s(r.get("followType"))))
    with _db_lock, connect() as c:
        c.execute("DELETE FROM todo_item")
        c.executemany(
            "INSERT OR REPLACE INTO todo_item (id,text,group_name,meta,flag,created_at,due_date,follow_type) "
            "VALUES (?,?,?,?,?,?,?,?)", cleaned)
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
    return len(cleaned)


def replace_vitals(rows):
    """整表替换生命体征记录（事务内）。各体征列可空，由前端保证至少一项。"""
    with _db_lock, connect() as c:
        c.execute("DELETE FROM vitals")
        c.executemany(
            "INSERT OR REPLACE INTO vitals (id,date,systolic,diastolic,pulse,temperature,"
            "spo2,glucose,glucose_tag,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [(_s(r.get("id")) or f"vit-{i}", _s(r.get("date")),
              _num(r.get("systolic")), _num(r.get("diastolic")), _num(r.get("pulse")),
              _num(r.get("temperature")), _num(r.get("spo2")), _num(r.get("glucose")),
              _s(r.get("glucoseTag")), _s(r.get("note")),
              int(r.get("createdAt") or 0) or int(time.time() * 1000))
             for i, r in enumerate(rows or [])])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def replace_symptoms(rows):
    """整表替换症状日记（事务内）。part 必填，severity 1–10 可空。"""
    with _db_lock, connect() as c:
        c.execute("DELETE FROM symptom")
        c.executemany(
            "INSERT OR REPLACE INTO symptom (id,date,part,severity,\"trigger\",note,created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            [(_s(r.get("id")) or f"sym-{i}", _s(r.get("date")), _s(r.get("part")).strip(),
              _num(r.get("severity")), _s(r.get("trigger")), _s(r.get("note")),
              int(r.get("createdAt") or 0) or int(time.time() * 1000))
             for i, r in enumerate(rows or [])])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def replace_diet_days(rows):
    """整表替换减重每日记录（事务内）。数值列可空，空白保持 NULL，不补造 0。"""
    with _db_lock, connect() as c:
        c.execute("DELETE FROM diet_day")
        c.executemany(
            "INSERT OR REPLACE INTO diet_day (id,date,morning_weight,weight_note,waist,sleep,"
            "hunger,ankle,breakfast,lunch,dinner,snack,kcal_center,kcal_low,kcal_high,budget,"
            "completeness,summary,note,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(_s(r.get("id")) or f"dd-{i}", _s(r.get("date")),
              _num(r.get("morningWeight")), _s(r.get("weightNote")), _num(r.get("waist")),
              _num(r.get("sleep")), _s(r.get("hunger")), _s(r.get("ankle")),
              _s(r.get("breakfast")), _s(r.get("lunch")), _s(r.get("dinner")), _s(r.get("snack")),
              _num(r.get("kcalCenter")), _num(r.get("kcalLow")), _num(r.get("kcalHigh")),
              _num(r.get("budget")), _s(r.get("completeness")), _s(r.get("summary")),
              _s(r.get("note")), int(r.get("createdAt") or 0) or int(time.time() * 1000))
             for i, r in enumerate(rows or [])])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def replace_diet_weeks(rows):
    """整表替换减重每周复盘（事务内）。周均值等由前端按模板口径填写，服务端只存。"""
    with _db_lock, connect() as c:
        c.execute("DELETE FROM diet_week")
        c.executemany(
            "INSERT OR REPLACE INTO diet_week (id,week_start,week_end,review_date,weight_days,"
            "weight_avg,weight_prev_avg,waist,complete_days,kcal_center,kcal_low,kcal_high,"
            "ankle,energy,observe_miss,observe_habit,observe_diff,next_focus,adjust,note,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(_s(r.get("id")) or f"dw-{i}", _s(r.get("weekStart")), _s(r.get("weekEnd")),
              _s(r.get("reviewDate")), _num(r.get("weightDays")), _num(r.get("weightAvg")),
              _num(r.get("weightPrevAvg")), _num(r.get("waist")), _num(r.get("completeDays")),
              _num(r.get("kcalCenter")), _num(r.get("kcalLow")), _num(r.get("kcalHigh")),
              _s(r.get("ankle")), _s(r.get("energy")), _s(r.get("observeMiss")),
              _s(r.get("observeHabit")), _s(r.get("observeDiff")), _s(r.get("nextFocus")),
              _s(r.get("adjust")), _s(r.get("note")),
              int(r.get("createdAt") or 0) or int(time.time() * 1000))
             for i, r in enumerate(rows or [])])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def replace_sleep_logs(rows):
    """整表替换睡眠记录（事务内）。hours 为主口径（小时），minutes/score 可空。
    一行一天：同一 date 的重复由前端导入时就已去重。"""
    with _db_lock, connect() as c:
        c.execute("DELETE FROM sleep_log")
        c.executemany(
            "INSERT OR REPLACE INTO sleep_log "
            "(id,date,hours,minutes,score,bedtime,wake,note,source,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(_s(r.get("id")) or f"sl-{i}", _s(r.get("date")),
              _num(r.get("hours")), _num(r.get("minutes")), _num(r.get("score")),
              _s(r.get("bedtime")), _s(r.get("wake")), _s(r.get("note")), _s(r.get("source")),
              int(r.get("createdAt") or 0) or int(time.time() * 1000))
             for i, r in enumerate(rows or [])])
        c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


def export_payload():
    d = get_all()
    for r in d["reports"]:
        m = FILE_URL.match(r.get("file") or "")
        p = IMG_DIR / m.group(1) if m else None
        if p and p.exists():
            ext = p.suffix.lstrip(".").lower()
            mime = "jpeg" if ext in ("jpg", "jpeg") else ext
            r["file"] = f"data:image/{mime};base64," + base64.b64encode(p.read_bytes()).decode()
        else:
            r["file"] = ""
    return {
        "format": "health-archive", "version": 2,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "labs": d["labs"], "weights": d["weights"], "body": d["body"],
        "done": d["done"], "reports": d["reports"],
        "allergies": d["allergies"], "familyHistory": d["familyHistory"],
        "surgeries": d["surgeries"], "visits": d["visits"], "medications": d["medications"],
        "vitals": d["vitals"], "symptoms": d["symptoms"],
        "dietDays": d["dietDays"], "dietWeeks": d["dietWeeks"],
        "sleepLogs": d["sleepLogs"],
        "issueStatus": d["issueStatus"], "todoItems": d["todoItems"],
    }


# ---------------------------------------------------------------- 静态托管白名单
# 目的：只暴露「页面渲染必需」的静态文件，绝不让 health.db / .venv / 源码 / 化验
# 原文(.md/.txt) / 私有配置(_meta) 被 HTTP 直接下载。这是防 PHI 泄露的关键收口。
#
# 允许的前缀（相对 ROOT，正斜杠）：
#   - 根级页面文件：index.html、旧版首页.html
#   - assets/、js/：前端代码
#   - docs/：技术文档（仅 .html 页面与 .css/.js）
#   - private_data/：健康档案渲染出的 .html 页面与配套 .css/.js（不含 .md/.txt/_meta）
#   - data/报告原件/ 与 data/照片/：报告原件与照片（供页面/接口查看）
_ALLOW_PREFIXES = ("assets/", "js/", "docs/", "private_data/", "data/报告原件/", "data/照片/")
_ALLOW_ROOT_FILES = {"index.html", "旧版首页.html"}
# 静态托管只放行这些后缀（页面/样式/脚本/图片/PDF/DICOM），其余一律不托管
_ALLOW_EXTS = {".html", ".htm", ".css", ".js", ".json", ".png", ".jpg", ".jpeg",
               ".webp", ".gif", ".bmp", ".svg", ".ico", ".pdf", ".dcm", ".dicom",
               ".tif", ".tiff", ".woff", ".woff2"}
# 无论落在哪个前缀下，这些子路径一律拒绝（隐私/机密）
_DENY_SUBPATHS = ("private_data/_meta", "/.venv/", "/__pycache__/", "/.git/",
                  "/server/", "/data/backups")


def _static_allowed(rel: str) -> bool:
    """判断一个 ROOT 相对路径（正斜杠）是否允许静态托管。"""
    rel = rel.replace("\\", "/").lstrip("/")
    if not rel:
        return False
    low = "/" + rel.lower()
    for bad in _DENY_SUBPATHS:
        if bad in low:
            return False
    ext = "." + rel.rsplit(".", 1)[-1].lower() if "." in rel.rsplit("/", 1)[-1] else ""
    if ext not in _ALLOW_EXTS:
        return False
    if rel in _ALLOW_ROOT_FILES:
        return True
    return any(rel.startswith(p) for p in _ALLOW_PREFIXES)


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "HealthServer/2.0"

    # ---- 工具
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _body(self, limit=MAX_JSON):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            return None
        if n > limit:
            return False
        return self.rfile.read(n)

    def _json_body(self):
        raw = self._body()
        if raw is None or raw is False:
            return raw
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def _file(self, path: Path, cache="no-cache"):
        if not path.is_file():
            self._json({"ok": False, "error": "文件不存在"}, 404)
            return
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix.lower() in (".js", ".css", ".html", ".json"):
            ctype += "; charset=utf-8"
        raw = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", cache)
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    # ---- 路由
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/ping":
            eng = ocr_server._engine
            bdir = _backup_dir()
            try:
                backups = sorted(x.name for x in bdir.glob("health-*.db"))
            except OSError:
                backups = []
            st = export_status()
            self._json({
                "ok": True, "db": str(DB_PATH), "root": str(ROOT),
                "engine": "rapidocr" if ocr_server._api == 2 else ("rapidocr_onnxruntime" if ocr_server._api == 1 else ""),
                "ready": eng is not None, "error": ocr_server._engine_error,
                "backupDir": str(bdir), "backups": backups,
                "lastExportAt": st["lastExportAt"], "exportDue": st["due"],
            })
            return
        if p == "/api/all":
            self._json(get_all())
            return
        if p == "/api/export":
            payload = export_payload()
            try:
                set_meta("lastExportAt", int(time.time()))
            except Exception:
                pass
            raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="health-archive.json"')
            self.send_header("Content-Length", str(len(raw)))
            self._cors()
            self.end_headers()
            self.wfile.write(raw)
            return
        if p == "/api/originals":
            self._json({"ok": True, "dir": "data/报告原件", "files": list_originals()})
            return
        if p.startswith("/files/"):
            name = os.path.basename(unquote(p[7:]))
            self._file(IMG_DIR / name, "no-cache")
            return
        # 静态托管：只放行白名单内的页面/样式/脚本/图片，其余一律 404
        rel = unquote(p).lstrip("/") or "index.html"
        if not _static_allowed(rel):
            self._json({"ok": False, "error": "路径无效"}, 404)
            return
        target = (ROOT / rel).resolve()
        # 归一化后必须在 ROOT 内，且仍是放行的相对路径（防 ../ 穿越）
        try:
            rel_check = target.relative_to(ROOT.resolve()).as_posix()
        except ValueError:
            self._json({"ok": False, "error": "路径无效"}, 404)
            return
        if target.is_dir() or not _static_allowed(rel_check):
            self._json({"ok": False, "error": "路径无效"}, 404)
            return
        self._file(target)

    def do_PUT(self):
        p = urlparse(self.path).path
        data = self._json_body()
        if data is None:
            self._json({"ok": False, "error": "请求体不是 JSON"}, 400)
            return
        if data is False:
            self._json({"ok": False, "error": "请求太大"}, 413)
            return
        try:
            if p == "/api/labs":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_labs(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/reports":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                files = replace_reports(data)
                self._json({"ok": True, "n": len(data), "files": files})
            elif p == "/api/state":
                replace_state(data.get("weights") or [], data.get("done") or {},
                              data.get("body"))
                self._json({"ok": True})
            elif p == "/api/history":
                if not isinstance(data, dict):
                    raise ValueError("需要对象")
                counts = replace_history(data)
                self._json({"ok": True, "n": counts})
            elif p == "/api/vitals":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_vitals(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/symptoms":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_symptoms(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/diet-days":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_diet_days(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/diet-weeks":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_diet_weeks(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/sleep-logs":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_sleep_logs(data)
                self._json({"ok": True, "n": len(data)})
            elif p == "/api/issue-status":
                n = replace_issue_status(data)
                self._json({"ok": True, "n": n})
            elif p == "/api/todos":
                if not isinstance(data, list):
                    raise ValueError("需要数组")
                replace_todo_items(data)
                self._json({"ok": True, "n": len(data)})
            else:
                self._json({"ok": False, "error": "没有这个接口"}, 404)
        except Exception as e:
            self._json({"ok": False, "error": f"写入失败：{e}"}, 500)

    def do_POST(self):
        p = urlparse(self.path).path
        if p == "/ocr":
            raw = self._body(MAX_IMAGE)
            if not raw:
                self._json({"ok": False, "error": "请求里没有图片"}, 400)
                return
            if raw is False:
                self._json({"ok": False, "error": "图片超过 24MB，先压缩再传"}, 413)
                return
            t0 = time.time()
            try:
                items = ocr_server.recognize(raw)
            except Exception as e:
                self._json({"ok": False, "error": f"识别失败：{e}"}, 500)
                return
            lines = ocr_server.group_lines(items)
            self._json({"ok": True, "lines": lines, "ms": int((time.time() - t0) * 1000),
                        "low": len([l for l in lines if l["score"] < 0.6]), "n": len(lines)})
            return
        if p == "/api/import":
            data = self._json_body()
            if not isinstance(data, dict):
                self._json({"ok": False, "error": "备份文件读不出来"}, 400)
                return
            try:
                labs = data.get("labs") or []
                reports = data.get("reports") or []
                replace_labs(labs)
                replace_reports(reports)
                replace_state(data.get("weights") or [], data.get("done") or {},
                              data.get("body"))
                if "vitals" in data:
                    replace_vitals(data.get("vitals") or [])
                if "symptoms" in data:
                    replace_symptoms(data.get("symptoms") or [])
                if "dietDays" in data:
                    replace_diet_days(data.get("dietDays") or [])
                if "dietWeeks" in data:
                    replace_diet_weeks(data.get("dietWeeks") or [])
                if "sleepLogs" in data:
                    replace_sleep_logs(data.get("sleepLogs") or [])
                if "issueStatus" in data:
                    replace_issue_status(data.get("issueStatus") or {})
                if "todoItems" in data:
                    replace_todo_items(data.get("todoItems") or [])
                hist = {k: data[k] for k in
                        ("allergies", "familyHistory", "surgeries", "visits", "medications")
                        if k in data}
                if hist:
                    replace_history(hist)
                self._json({"ok": True, "labs": len(labs), "reports": len(reports)})
            except Exception as e:
                self._json({"ok": False, "error": f"导入失败：{e}"}, 500)
            return
        self._json({"ok": False, "error": "没有这个接口"}, 404)

    def log_message(self, fmt, *args):
        # 不写访问日志：路径里可能有指标名 / 报告名
        pass


def main(argv):
    global PORT, DB_PATH, IMG_DIR
    port = PORT
    for i, a in enumerate(argv):
        if a in ("-p", "--port") and i + 1 < len(argv):
            port = int(argv[i + 1])
        elif a in ("-d", "--db") and i + 1 < len(argv):
            # 测试用：换一个库文件，图片跟着放在它旁边，绝不碰正式数据
            DB_PATH = Path(argv[i + 1]).resolve()
            IMG_DIR = DB_PATH.parent / (DB_PATH.stem + "_files")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    init_db()
    bk = run_housekeeping()
    srv = ThreadingHTTPServer((HOST, port), Handler)
    url = f"http://{HOST}:{port}/"
    print("")
    print("  健康档案 · 本机服务")
    print("  ------------------------------------")
    print(f"  打开   {url}")
    print(f"  数据   {DB_PATH}")
    print(f"  图片   {IMG_DIR}")
    print(f"  备份   {_backup_dir()}")
    print("  范围   只监听本机，不联网")
    print("  退出   关掉这个窗口，或按 Ctrl+C")
    print("")

    def warm():
        try:
            t0 = time.time()
            ocr_server.load_engine()
            print("  识别   引擎就绪（%.1fs）\n" % (time.time() - t0))
        except Exception as e:
            print("  识别   引擎加载失败：%s（不影响数据读写）\n" % e)

    threading.Thread(target=warm, daemon=True).start()

    def reminder_loop():
        # 常驻时定期复查：每 6 小时看一次是否该提醒导出（到期才打印，不刷屏）
        while True:
            time.sleep(6 * 3600)
            try:
                st = export_status()
                if st["due"]:
                    print("  提醒   " + export_reminder_text(st))
            except Exception:
                pass

    threading.Thread(target=reminder_loop, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止。")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main(sys.argv[1:])
