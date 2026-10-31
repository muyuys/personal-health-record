# -*- coding: utf-8 -*-
"""
小米健康数据 → SQLite 导入器
数据源: F:\\Health\\data\\小米健康数据\\  (两个导出包)
目标库: F:\\Health\\data\\health.db
设计：
  - 新增 mi_ 前缀表存放小米结构化数据（体成分/每日活动/睡眠/心率/资料）
  - 原始 JSON 全量保全到 mi_raw_metric（Key/Time/Value 原样）
  - 体成分同步写入应用 weights 表、睡眠同步写入 sleep_log 表（供前端直接展示）
  - 幂等：按 import_batch 删除后重灌；不 DROP 任何表
用法: python Tools/import_xiaomi.py [--db path] [--src dir] [--dry-run]
"""
import sys, os, csv, json, sqlite3, datetime, argparse, uuid

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(ROOT, "data", "health.db")
DEFAULT_SRC = os.path.join(ROOT, "data", "小米健康数据")
BATCH = "xiaomi-20261029"

# ---------- 工具 ----------
def ts2dt(sec):
    try:
        sec = int(float(sec))
        if sec > 10_000_000_000:  # 毫秒
            sec //= 1000
        return datetime.datetime.fromtimestamp(sec)
    except Exception:
        return None

def ts2date(sec):
    d = ts2dt(sec)
    return d.strftime("%Y-%m-%d") if d else None

def ts2hm(sec):
    d = ts2dt(sec)
    return d.strftime("%H:%M") if d else None

def f(x):
    try:
        if x is None or x == "":
            return None
        return float(x)
    except Exception:
        return None

def i(x):
    try:
        if x is None or x == "":
            return None
        return int(float(x))
    except Exception:
        return None

def load_json(s):
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {}

# ---------- 建表 ----------
DDL = """
-- 小米原始指标（全量保全，按 Key 分类，Value 为原始 JSON）
CREATE TABLE IF NOT EXISTS mi_raw_metric (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch       TEXT NOT NULL,
  key         TEXT NOT NULL,
  tag         TEXT,
  sid         TEXT,
  ts          INTEGER NOT NULL,
  date        TEXT,
  value_json  TEXT,
  update_time INTEGER
);
CREATE INDEX IF NOT EXISTS ix_mi_raw_key_ts ON mi_raw_metric(key, ts);

-- 体成分 / 体重秤记录（yumai scale, 41 列）
CREATE TABLE IF NOT EXISTS mi_body_composition (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch         TEXT NOT NULL,
  record_key    TEXT,               -- device_id|time 去重键
  device_id     TEXT,
  device_model  TEXT,
  user_id       TEXT,
  ts            INTEGER NOT NULL,
  date          TEXT,
  time_str      TEXT,
  weight_kg     REAL,
  bmi           REAL,
  body_fat_pct  REAL,               -- bfp
  muscle_pct    REAL,               -- slm(骨骼肌率)  视设备口径
  muscle_kg     REAL,               -- smm 骨骼肌量
  water_pct     REAL,               -- bwp 体水分率
  bone_kg       REAL,               -- bmc 骨量
  protein_pct   REAL,               -- pp 蛋白质率
  visceral_fat  REAL,               -- vfl 内脏脂肪
  bmr           REAL,               -- 基础代谢 kcal
  body_age      REAL,               -- ma 身体年龄
  body_score    REAL,               -- 身体得分 0-100
  fat_mass_kg   REAL,               -- bfm 脂肪量
  fat_free_kg   REAL,               -- ffm 去脂体重
  muscle_mass_kg REAL,              -- bwm? / pm 蛋白质量
  water_kg      REAL,               -- swt
  heart_rate    REAL,
  raw_json      TEXT                -- 原始整行
);
CREATE INDEX IF NOT EXISTS ix_mi_body_ts ON mi_body_composition(ts);

-- 每日活动汇总（steps / calories / distance / stand / intensity）
CREATE TABLE IF NOT EXISTS mi_daily_activity (
  batch         TEXT NOT NULL,
  date          TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  steps         INTEGER,
  distance_m    REAL,
  calories      REAL,
  active_cal    REAL,               -- 活动热量
  stand_count   INTEGER,            -- valid_stand count
  intensity_min INTEGER,            -- 中高强度分钟
  goal_cal      REAL,
  goal_steps    INTEGER,
  goal_stand    INTEGER,
  payload_json  TEXT,
  PRIMARY KEY (batch, date)
);

-- 睡眠记录（夜间主睡眠）
CREATE TABLE IF NOT EXISTS mi_sleep (
  batch         TEXT NOT NULL,
  date          TEXT NOT NULL,      -- 归属日(起床日)
  bedtime_ts    INTEGER,
  wake_ts       INTEGER,
  bedtime       TEXT,               -- HH:MM
  wake          TEXT,
  total_min     REAL,
  deep_min      REAL,
  light_min     REAL,
  rem_min       REAL,
  awake_min     REAL,
  score         INTEGER,
  avg_hr        REAL,
  snore_min     REAL,
  segments_json TEXT,
  PRIMARY KEY (batch, date)
);

-- 心率散点（single_heart_rate / dynamic）
CREATE TABLE IF NOT EXISTS mi_heart_rate (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch         TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  date          TEXT,
  time_str      TEXT,
  bpm           REAL,
  kind          TEXT
);
CREATE INDEX IF NOT EXISTS ix_mi_hr_ts ON mi_heart_rate(ts);

-- 个人资料快照
CREATE TABLE IF NOT EXISTS mi_profile (
  batch         TEXT PRIMARY KEY,
  uid           TEXT,
  name          TEXT,
  sex           TEXT,
  birth         TEXT,
  height_cm     REAL,
  weight_kg     REAL,
  region        TEXT,
  max_hr        INTEGER,
  daily_cal_goal INTEGER,
  daily_step_goal INTEGER,
  daily_sleep_goal_min INTEGER,
  raw_json      TEXT
);
"""

def ensure_schema(c):
    c.executescript(DDL)

def clear_batch(c):
    for t in ["mi_raw_metric", "mi_body_composition", "mi_daily_activity",
              "mi_sleep", "mi_heart_rate", "mi_profile"]:
        c.execute(f"DELETE FROM [{t}] WHERE batch=?", (BATCH,))
    # 同步清理应用表里本批次灌入的记录（用 source/note 标记，避免误删手工数据）
    c.execute("DELETE FROM weights WHERE id LIKE ?", (BATCH + "-%",))
    c.execute("DELETE FROM sleep_log WHERE id LIKE ?", (BATCH + "-%",))

# ---------- 导入：体成分 ----------
def import_body(c, path, stats):
    n = 0
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            ts = i(row.get("time"))
            if ts is None:
                continue
            dt = ts2dt(ts)
            date = dt.strftime("%Y-%m-%d") if dt else None
            rk = (row.get("device_id") or "") + "|" + str(ts)
            raw = json.dumps(row, ensure_ascii=False)
            c.execute("""INSERT INTO mi_body_composition
              (batch,record_key,device_id,device_model,user_id,ts,date,time_str,
               weight_kg,bmi,body_fat_pct,muscle_pct,muscle_kg,water_pct,bone_kg,
               protein_pct,visceral_fat,bmr,body_age,body_score,fat_mass_kg,
               fat_free_kg,muscle_mass_kg,water_kg,heart_rate,raw_json)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (BATCH, rk, row.get("device_id"), row.get("model"), row.get("user_id"),
               ts, date, ts2hm(ts),
               f(row.get("weight")), f(row.get("bmi")), f(row.get("bfp")),
               f(row.get("slm")), f(row.get("smm")), f(row.get("bwp")),
               f(row.get("bmc")), f(row.get("pp")), f(row.get("vfl")),
               f(row.get("bmr")), f(row.get("ma")), f(row.get("bodyRes")),
               f(row.get("bfm")), f(row.get("ffm")), f(row.get("pm")) or f(row.get("bwm")),
               f(row.get("swt")), f(row.get("heartRate")), raw))
            n += 1
            # 同步应用 weights 表（仅有效体重）
            w = f(row.get("weight"))
            if w and w > 20 and date:
                wid = f"{BATCH}-bc-{ts}"
                c.execute("""INSERT OR REPLACE INTO weights
                  (id,date,kg,tag,waist,note,body_fat,muscle,bmi,visceral_fat,bmr,bone)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (wid, date, w, "device",
                   None, "小米体脂秤",
                   f(row.get("bfp")), f(row.get("smm")), f(row.get("bmi")),
                   f(row.get("vfl")), f(row.get("bmr")), f(row.get("bmc"))))
    stats["body"] = n

# ---------- 导入：聚合健身数据 ----------
def import_aggregated(c, path, stats):
    daily = {}   # date -> dict
    nraw = 0
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            key = row.get("Key"); ts = i(row.get("Time"))
            if ts is None:
                continue
            date = ts2date(ts)
            val = load_json(row.get("Value"))
            # raw 保全
            c.execute("""INSERT INTO mi_raw_metric(batch,key,tag,sid,ts,date,value_json,update_time)
                         VALUES (?,?,?,?,?,?,?,?)""",
                      (BATCH, key, row.get("Tag"), row.get("Sid"), ts, date,
                       row.get("Value"), i(row.get("UpdateTime"))))
            nraw += 1
            d = daily.setdefault(date, {"ts": ts, "payload": {}})
            d["payload"][key] = val
            if key == "steps":
                sv = i(val.get("steps"))
                if sv is not None:          # 仅在有真实步数时赋值（daily_mark 的 {"has_data":true} 不覆盖）
                    d["steps"] = sv
                    d["distance_m"] = f(val.get("distance"))
                    d["calories"] = f(val.get("calories"))
            elif key == "calories":
                cv = f(val.get("calories"))
                if cv is not None:
                    d["active_cal"] = cv
            elif key == "valid_stand":
                sc = i(val.get("count"))
                if sc is not None:
                    d["stand_count"] = sc
            elif key == "intensity":
                im = i(val.get("duration"))
                if im is not None:
                    d["intensity_min"] = im
    # 写每日活动
    for date, d in daily.items():
        if not any(k in d for k in ("steps", "active_cal", "stand_count", "intensity_min")):
            continue
        c.execute("""INSERT OR REPLACE INTO mi_daily_activity
          (batch,date,ts,steps,distance_m,calories,active_cal,stand_count,intensity_min,
           goal_cal,goal_steps,goal_stand,payload_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (BATCH, date, d["ts"], d.get("steps"), d.get("distance_m"), d.get("calories"),
           d.get("active_cal"), d.get("stand_count"), d.get("intensity_min"),
           None, None, None, json.dumps(d["payload"], ensure_ascii=False)[:200000]))
    stats["raw"] += nraw
    stats["activity"] = sum(1 for d in daily.values()
                            if any(k in d for k in ("steps","active_cal","stand_count","intensity_min")))

# ---------- 导入：睡眠(从聚合 daily_report 与 raw fitness_data) ----------
def import_sleep(c, agg_path, raw_path, stats):
    nights = {}   # date -> best (取 total_duration 最大)
    def take(val, date, ts):
        tot = f(val.get("total_duration"))
        if tot is None:
            return
        # bedtime/wake_up_time: 顶层缺失时从 segment_details 提取
        bt = i(val.get("bedtime")); wk = i(val.get("wake_up_time"))
        segs = val.get("segment_details") or val.get("items")
        if (bt is None or wk is None) and segs:
            try:
                s0 = segs[0]
                bt = bt or i(s0.get("bedtime")) or i(s0.get("start_time"))
                wk = wk or i(s0.get("wake_up_time")) or i(s0.get("end_time"))
            except Exception:
                pass
        cur = nights.get(date)
        if cur is None or tot > cur["total_min"]:
            nights[date] = {
                "bedtime_ts": bt, "wake_ts": wk,
                "total_min": tot, "deep_min": f(val.get("sleep_deep_duration")),
                "light_min": f(val.get("sleep_light_duration")),
                "rem_min": f(val.get("sleep_rem_duration")),
                "awake_min": f(val.get("sleep_awake_duration")),
                "score": i(val.get("sleep_score")), "avg_hr": f(val.get("avg_hr")),
                "snore": f(val.get("total_snore_time")),
                "segments": segs,
            }
    for path in [agg_path, raw_path]:
        if not path or not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                if row.get("Key") != "sleep":
                    continue
                ts = i(row.get("Time")); val = load_json(row.get("Value"))
                take(val, ts2date(ts), ts)
    for date, d in nights.items():
        bt = d["bedtime_ts"]; wk = d["wake_ts"]
        c.execute("""INSERT OR REPLACE INTO mi_sleep
          (batch,date,bedtime_ts,wake_ts,bedtime,wake,total_min,deep_min,light_min,rem_min,
           awake_min,score,avg_hr,snore_min,segments_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (BATCH, date, bt, wk, ts2hm(bt), ts2hm(wk), d["total_min"], d["deep_min"],
           d["light_min"], d["rem_min"], d["awake_min"], d["score"], d["avg_hr"],
           d["snore"], json.dumps(d["segments"], ensure_ascii=False) if d["segments"] else None))
        # 同步 sleep_log（应用表）
        if d["total_min"] and d["total_min"] > 30:
            sid = f"{BATCH}-sl-{date}"
            c.execute("""INSERT OR REPLACE INTO sleep_log
              (id,date,hours,minutes,score,bedtime,wake,note,source,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)""",
              (sid, date, d["total_min"] / 60.0, d["total_min"], d["score"],
               ts2hm(bt), ts2hm(wk), "小米手环", "xiaomi", bt or 0))
    stats["sleep"] = len(nights)

# ---------- 导入：心率散点 + 原始 ----------
def import_raw_fitness(c, path, stats):
    nraw = 0; nhr = 0
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            key = row.get("Key"); ts = i(row.get("Time"))
            if ts is None:
                continue
            val = load_json(row.get("Value"))
            # 只把心率类与其余非重复 key 存 raw（避免与聚合重复巨量写两遍）
            if key in ("single_heart_rate", "dynamic", "single_spo2"):
                c.execute("""INSERT INTO mi_raw_metric(batch,key,tag,sid,ts,date,value_json,update_time)
                             VALUES (?,?,?,?,?,?,?,?)""",
                          (BATCH, key, None, row.get("Sid"), ts, ts2date(ts),
                           row.get("Value"), i(row.get("UpdateTime"))))
                nraw += 1
            if key in ("single_heart_rate", "dynamic") and val.get("bpm") is not None:
                c.execute("""INSERT INTO mi_heart_rate(batch,ts,date,time_str,bpm,kind)
                             VALUES (?,?,?,?,?,?)""",
                          (BATCH, ts, ts2date(ts), ts2hm(ts), f(val.get("bpm")), key))
                nhr += 1
    stats["raw"] += nraw
    stats["heart_rate"] = nhr

# ---------- 导入：资料 ----------
def import_profile(c, member_path, fit_path, stats):
    prof = {}
    if os.path.exists(member_path):
        with open(member_path, encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))
            if rows:
                r = rows[0]
                prof.update(uid=r.get("Uid"), name=r.get("Name"), sex=r.get("Sex"),
                            birth=r.get("Birth"), height_cm=f(r.get("Height")),
                            weight_kg=f(r.get("Weight")), region=r.get("Region"))
    if os.path.exists(fit_path):
        with open(fit_path, encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))
            if rows:
                r = rows[0]
                hrm = load_json(r.get("RecordMaxHrm"))
                prof.update(max_hr=i(hrm.get("hrm")),
                            daily_cal_goal=i(r.get("DailyCalGoal")),
                            daily_step_goal=i(r.get("DailyStepGoal")),
                            daily_sleep_goal_min=i(r.get("DailySleepGoal")),
                            raw_json=json.dumps(r, ensure_ascii=False))
    if prof:
        c.execute("""INSERT OR REPLACE INTO mi_profile
          (batch,uid,name,sex,birth,height_cm,weight_kg,region,max_hr,
           daily_cal_goal,daily_step_goal,daily_sleep_goal_min,raw_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (BATCH, prof.get("uid"), prof.get("name"), prof.get("sex"), prof.get("birth"),
           prof.get("height_cm"), prof.get("weight_kg"), prof.get("region"),
           prof.get("max_hr"), prof.get("daily_cal_goal"), prof.get("daily_step_goal"),
           prof.get("daily_sleep_goal_min"), prof.get("raw_json")))
    stats["profile"] = 1 if prof else 0

# ---------- 主流程 ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    eco = os.path.join(args.src, "2026-10-29_u2656904908_mi_finess_eco_data_copy")
    c3 = os.path.join(args.src, "20261029_2656904908_MiFitness_c3_data_copy")
    scale = os.path.join(eco, "2026-10-29_u2656904908_mi_finess_eco_scale_record.csv")
    agg = os.path.join(c3, "20261029_2656904908_MiFitness_hlth_center_aggregated_fitness_data.csv")
    fitd = os.path.join(c3, "20261029_2656904908_MiFitness_hlth_center_fitness_data.csv")
    member = os.path.join(c3, "20261029_2656904908_MiFitness_user_member_profile.csv")
    fitprof = os.path.join(c3, "20261029_2656904908_MiFitness_user_fitness_profile.csv")

    for p in [scale, agg, fitd, member]:
        if not os.path.exists(p):
            print("缺少文件:", p); sys.exit(1)

    c = sqlite3.connect(args.db)
    c.execute("PRAGMA journal_mode=WAL")
    stats = {"body": 0, "raw": 0, "activity": 0, "sleep": 0, "heart_rate": 0, "profile": 0}
    try:
        ensure_schema(c)
        if not args.dry_run:
            clear_batch(c)
            import_body(c, scale, stats)
            import_aggregated(c, agg, stats)
            import_raw_fitness(c, fitd, stats)
            import_sleep(c, agg, fitd, stats)
            import_profile(c, member, fitprof, stats)
            c.execute("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)",
                      ("xiaomi_last_import", datetime.datetime.now().isoformat(timespec="seconds")))
            c.commit()
        print("=== 导入统计 ===")
        for k, v in stats.items():
            print(f"  {k:12s} {v}")
        if args.dry_run:
            print("(dry-run: 未写入)")
        else:
            for t in ["mi_body_composition","mi_daily_activity","mi_sleep",
                      "mi_heart_rate","mi_raw_metric","mi_profile"]:
                n = c.execute(f"select count(*) from [{t}]").fetchone()[0]
                print(f"  表 {t:22s} 共 {n} 行")
            print("  weights 表:", c.execute("select count(*) from weights").fetchone()[0], "行")
            print("  sleep_log 表:", c.execute("select count(*) from sleep_log").fetchone()[0], "行")
    finally:
        c.close()

if __name__ == "__main__":
    main()
