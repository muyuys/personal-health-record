# -*- coding: utf-8 -*-
"""SQLite 与报告文件持久层。

只关心数据 schema、查询、事务与备份内容的组装，不依赖 HTTP 或 OCR。
所有路径由组合根显式注入，测试可以使用完全隔离的临时目录。
"""

import base64
import re
import sqlite3
import threading
import time
import uuid
from contextlib import closing, contextmanager
from pathlib import Path

EXPORT_REMIND_DAYS = 7

def _num(v):
    return None if v is None or v == "" else float(v)


def _s(v):
    return "" if v is None else str(v)


DATA_URL = re.compile(r"^data:image/(jpeg|jpg|png|webp);base64,(.+)$", re.S)
FILE_URL = re.compile(r"^/files/([A-Za-z0-9._-]+)$")


class HealthRepository:
    def __init__(self, db_path, img_dir):
        self.db_path = Path(db_path).resolve()
        self.img_dir = Path(img_dir).resolve()
        self._lock = threading.Lock()
        self._file_hooks = {}

    @contextmanager
    def _transaction(self, connection=None):
        """同一连接组合跨表写入，并在提交/回滚后处理图片。"""
        if connection is not None:
            yield connection
            return
        with self._lock:
            c = self.connect()
            hooks = {"commit": [], "rollback": []}
            self._file_hooks[id(c)] = hooks
            try:
                with c:
                    yield c
            except Exception:
                for path in reversed(hooks["rollback"]):
                    self._drop_file(path)
                raise
            else:
                # 只有 SQLite 提交成功后，才允许删除不再引用的旧图。
                for path in hooks["commit"]:
                    self._drop_file(path)
            finally:
                self._file_hooks.pop(id(c), None)
                c.close()

    def connect(self):
        c = sqlite3.connect(self.db_path, timeout=10)
        c.row_factory = sqlite3.Row
        return c


    def init_db(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.img_dir.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as c, c:
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
              visit_id TEXT DEFAULT '', created_at INTEGER
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
            -- 症状日记：按日记录主观不适，不为每个病单独建页。
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
              due_date TEXT DEFAULT ''
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


    def set_meta(self, k, v):
        # sqlite3 的 with 只提交事务，不关闭连接；必须显式 close 才能释放 Windows 文件锁。
        with closing(self.connect()) as c, c:
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)", (k, str(v)))


    def get_meta(self, k, default=None):
        with closing(self.connect()) as c:
            row = c.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
        return row["v"] if row else default


    def export_status(self):
        """上次导出时间与是否需要提醒。lastExportAt 存纪元秒。"""
        raw = self.get_meta("lastExportAt")
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


    def get_all(self):
        with closing(self.connect()) as c:
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
                "end_date AS endDate,purpose,status,note,visit_id AS visitId,created_at AS createdAt "
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
                "COALESCE(due_date,'') AS dueDate "
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
                "export": self.export_status()}


    def replace_history(self, data, _c=None):
        """按需替换结构化病史/就医表：只处理请求体里出现的键，避免旧客户端或
        局部更新误清空。调用方保证 data 是 dict。返回各表写入条数。

        涉及：allergy / family_history / surgery / visit / medication。
        """
        counts = {}
        with self._transaction(_c) as c:
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
                    "end_date,purpose,status,note,visit_id,created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(_s(r.get("id")) or f"med-{i}", _s(r.get("name")).strip(), _s(r.get("dose")),
                      _s(r.get("frequency")), _s(r.get("route")), _s(r.get("startDate")),
                      _s(r.get("endDate")), _s(r.get("purpose")), _s(r.get("status")) or "active",
                      _s(r.get("note")), _s(r.get("visitId")), int(r.get("createdAt") or 0))
                     for i, r in enumerate(rows)])
                counts["medications"] = len(rows)
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
        return counts


    def replace_labs(self, rows, _c=None):
        def _value(r):
            # 定性结果没有数值：用 0.0 作占位以满足 value REAL NOT NULL 的旧约束；
            # 读取时 get_all() 会按 qualitative 把占位还原成 NULL，不会污染趋势。
            v = r.get("value")
            if v is None or v == "":
                return 0.0
            return float(v)

        with self._transaction(_c) as c:
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


    def _drop_file(self, name):
        if not name or not re.fullmatch(r"[A-Za-z0-9._-]+", name):
            return
        target = (self.img_dir / name).resolve()
        try:
            target.relative_to(self.img_dir)
            target.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass


    def _store_file(self, data_url):
        """dataURL 落成文件，返回 /files/xxx.jpg。识别不了就原样返回空串。"""
        m = DATA_URL.match(data_url or "")
        if not m:
            return ""
        ext = "png" if m.group(1) == "png" else ("webp" if m.group(1) == "webp" else "jpg")
        raw = base64.b64decode(m.group(2), validate=True)
        name = f"{uuid.uuid4().hex}.{ext}"
        self.img_dir.mkdir(parents=True, exist_ok=True)
        (self.img_dir / name).write_bytes(raw)
        return "/files/" + name


    def replace_reports(self, rows, _c=None):
        with self._transaction(_c) as c:
            old_files = {r["file"] for r in c.execute("SELECT file FROM reports")}
            c.execute("DELETE FROM reports")
            prepared = []
            new_uploads = []
            for r in rows:
                f = r.get("file") or ""
                if DATA_URL.match(f):
                    new = self._store_file(f)
                    new_uploads.append(new.removeprefix("/files/"))
                elif FILE_URL.match(f):
                    new = f
                else:
                    new = ""
                prepared.append((r["id"], r["date"], r["title"], r.get("panel") or "",
                                 r.get("specimen") or "", r.get("hospital") or "",
                                 r.get("note") or "", new, int(r.get("createdAt") or 0)))
            c.executemany(
                "INSERT INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)", prepared)
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))

            kept = {p[7] for p in prepared}
            old_names = {m.group(1) for f in old_files if (m := FILE_URL.match(f or ""))}
            kept_names = {m.group(1) for f in kept if (m := FILE_URL.match(f or ""))}
            hooks = self._file_hooks[id(c)]
            hooks["rollback"].extend(new_uploads)
            # 包括被整份省略的报告；仍被其他报告引用的文件不会删除。
            hooks["commit"].extend(sorted(old_names - kept_names))
        return [p[7] for p in prepared]


    def replace_state(self, weights=None, done=None, body=None, _c=None):
        """仅替换请求中显式出现的组；缺失字段保持原值，显式空数组才清空。"""
        with self._transaction(_c) as c:
            if weights is not None:
                c.execute("DELETE FROM weights")
                c.executemany(
                    "INSERT INTO weights (id,date,kg,tag,waist,note,"
                    "body_fat,muscle,bmi,visceral_fat,bmr,bone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(w.get("id") or f"w-{i}", w.get("date") or "", float(w.get("kg") or 0),
                      w.get("tag") or "", _num(w.get("waist")), w.get("note") or "",
                      _num(w.get("bodyFat")), _num(w.get("muscle")), _num(w.get("bmi")),
                      _num(w.get("visceralFat")), _num(w.get("bmr")), _num(w.get("bone")))
                     for i, w in enumerate(weights)])
            if body is not None:
                c.execute("DELETE FROM body")
                c.executemany(
                    "INSERT OR REPLACE INTO body (id,date,chest,waist,hip,note,created_at) VALUES (?,?,?,?,?,?,?)",
                    [(b.get("id") or f"b-{i}", b.get("date") or "",
                      _num(b.get("chest")), _num(b.get("waist")), _num(b.get("hip")),
                      b.get("note") or "", int(b.get("createdAt") or 0) or int(time.time() * 1000))
                     for i, b in enumerate(body)])
            if done is not None:
                c.execute("DELETE FROM todo")
                c.executemany("INSERT INTO todo (k,v) VALUES (?,?)",
                              [(k, 1 if v else 0) for k, v in done.items()])
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


    def replace_issue_status(self, data, _c=None):
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
        with self._transaction(_c) as c:
            c.execute("DELETE FROM issue_status")
            c.executemany(
                "INSERT OR REPLACE INTO issue_status (id,status,note,updated_at) VALUES (?,?,?,?)",
                rows)
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
        return len(rows)


    def replace_todo_items(self, rows, _c=None):
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
                            _s(r.get("dueDate"))))
        with self._transaction(_c) as c:
            c.execute("DELETE FROM todo_item")
            c.executemany(
                "INSERT OR REPLACE INTO todo_item (id,text,group_name,meta,flag,created_at,due_date) "
                "VALUES (?,?,?,?,?,?,?)", cleaned)
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))
        return len(cleaned)


    def replace_vitals(self, rows, _c=None):
        """整表替换生命体征记录（事务内）。各体征列可空，由前端保证至少一项。"""
        with self._transaction(_c) as c:
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


    def replace_symptoms(self, rows, _c=None):
        """整表替换症状日记（事务内）。part 必填，severity 1–10 可空。"""
        with self._transaction(_c) as c:
            c.execute("DELETE FROM symptom")
            c.executemany(
                "INSERT OR REPLACE INTO symptom (id,date,part,severity,\"trigger\",note,created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                [(_s(r.get("id")) or f"sym-{i}", _s(r.get("date")), _s(r.get("part")).strip(),
                  _num(r.get("severity")), _s(r.get("trigger")), _s(r.get("note")),
                  int(r.get("createdAt") or 0) or int(time.time() * 1000))
                 for i, r in enumerate(rows or [])])
            c.execute("INSERT OR REPLACE INTO meta (k,v) VALUES ('savedAt',?)", (str(int(time.time() * 1000)),))


    def replace_diet_days(self, rows, _c=None):
        """整表替换减重每日记录（事务内）。数值列可空，空白保持 NULL，不补造 0。"""
        with self._transaction(_c) as c:
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


    def replace_diet_weeks(self, rows, _c=None):
        """整表替换减重每周复盘（事务内）。周均值等由前端按模板口径填写，服务端只存。"""
        with self._transaction(_c) as c:
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


    def replace_sleep_logs(self, rows, _c=None):
        """整表替换睡眠记录（事务内）。hours 为主口径（小时），minutes/score 可空。
        一行一天：同一 date 的重复由前端导入时就已去重。"""
        with self._transaction(_c) as c:
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


    def import_archive(self, data):
        """在一个 SQLite 事务中恢复备份；缺省字段保持不变。

        v1(health-labs.records) 只恢复检验；v2(health-archive) 恢复显式出现的
        字段。格式或版本未知时拒绝，绝不允许空对象触发的整库清空。
        """
        if not isinstance(data, dict):
            raise ValueError("备份必须是 JSON 对象")
        archive_format = data.get("format")
        if archive_format == "health-labs":
            rows = data.get("records")
            if not isinstance(rows, list):
                raise ValueError("v1 备份缺少 records 数组")
            with self._transaction() as c:
                self.replace_labs(rows, _c=c)
            return {"labs": len(rows)}
        if archive_format != "health-archive" or data.get("version") != 2:
            raise ValueError("不支持的备份格式或版本")

        array_fields = (
            "labs", "reports", "weights", "body", "allergies", "familyHistory",
            "surgeries", "visits", "medications", "vitals", "symptoms",
            "dietDays", "dietWeeks", "sleepLogs", "todoItems",
        )
        for key in array_fields:
            if key in data and not isinstance(data[key], list):
                raise ValueError(f"{key} 必须是数组")
        if "done" in data and not isinstance(data["done"], dict):
            raise ValueError("done 必须是对象")

        counts = {}
        with self._transaction() as c:
            if "labs" in data:
                self.replace_labs(data["labs"], _c=c)
                counts["labs"] = len(data["labs"])
            if "reports" in data:
                self.replace_reports(data["reports"], _c=c)
                counts["reports"] = len(data["reports"])
            if any(k in data for k in ("weights", "done", "body")):
                self.replace_state(data.get("weights"), data.get("done"), data.get("body"), _c=c)
                for key in ("weights", "body"):
                    if key in data:
                        counts[key] = len(data[key])
            direct = (
                ("vitals", self.replace_vitals), ("symptoms", self.replace_symptoms),
                ("dietDays", self.replace_diet_days), ("dietWeeks", self.replace_diet_weeks),
                ("sleepLogs", self.replace_sleep_logs), ("todoItems", self.replace_todo_items),
            )
            for key, replace in direct:
                if key in data:
                    replace(data[key], _c=c)
                    counts[key] = len(data[key])
            if "issueStatus" in data:
                counts["issueStatus"] = self.replace_issue_status(data["issueStatus"], _c=c)
            history = {k: data[k] for k in
                       ("allergies", "familyHistory", "surgeries", "visits", "medications")
                       if k in data}
            if history:
                counts.update(self.replace_history(history, _c=c))
        return counts

    def export_payload(self):
        d = self.get_all()
        for r in d["reports"]:
            m = FILE_URL.match(r.get("file") or "")
            p = self.img_dir / m.group(1) if m else None
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
