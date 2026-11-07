# -*- coding: utf-8 -*-
"""独立冒烟测试：不依赖 FastAPI，只验证 db.migrate + visit CRUD 的 SQL 逻辑。

用临时数据库副本，绝不触碰真实 data/health.db。
"""
import os
import sqlite3
import sys
import tempfile
import time
import uuid
from pathlib import Path

# 把 backend 加入 path，直接 import db（db 只用 stdlib）
sys.path.insert(0, str(Path(__file__).resolve().parent))
import app.db as db  # noqa: E402


def main():
    tmpdir = Path(tempfile.mkdtemp(prefix="visit_smoke_"))
    test_db = tmpdir / "health.db"

    # 覆盖 db 路径到临时库
    db.DB_PATH = test_db
    db._profile_scope.set("default")

    # 预建一个「旧版」visit 表（无 revision 列），模拟真实旧库
    c = sqlite3.connect(test_db)
    c.execute(
        """CREATE TABLE visit (id TEXT PRIMARY KEY, date TEXT NOT NULL,
           visit_type TEXT DEFAULT '', department TEXT DEFAULT '', hospital TEXT DEFAULT '',
           doctor TEXT DEFAULT '', chief TEXT DEFAULT '', diagnosis TEXT DEFAULT '',
           summary TEXT DEFAULT '', report_id TEXT DEFAULT '', note TEXT DEFAULT '',
           created_at INTEGER)"""
    )
    c.execute("INSERT INTO visit (id,date,department,hospital,summary,created_at) "
              "VALUES ('vis-old','2025-01-01','内科','旧医院','旧记录',100)")
    c.commit()
    c.close()

    # 1) 迁移：应加 revision 列，旧记录 revision=0
    db.migrate()
    c = db.connect()
    cols = {r["name"] for r in c.execute("PRAGMA table_info(visit)")}
    assert "revision" in cols, "migrate 未添加 revision 列"
    row = c.execute("SELECT revision FROM visit WHERE id='vis-old'").fetchone()
    assert int(row["revision"]) == 0, "旧记录 revision 应为 0"
    ver = c.execute("SELECT v FROM schema_version").fetchone()["v"]
    assert ver == 1, f"schema_version 应为 1，实际 {ver}"
    print("[1] migrate OK: revision 列已加, 旧记录 revision=0, schema_version=1")
    c.close()

    # 幂等：再跑一次不应报错
    db.migrate()
    print("[2] migrate 幂等 OK")

    # 2) 模拟 CRUD（复刻 visits.py 的 SQL）
    def now_ms():
        return int(time.time() * 1000)

    c = db.connect()
    vid = "vis-" + uuid.uuid4().hex[:12]
    c.execute(
        """INSERT INTO visit (id,date,visit_type,department,hospital,doctor,
           chief,diagnosis,summary,report_id,note,created_at,revision)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)""",
        (vid, "2026-11-09", "门诊", "心内科", "新医院", "张医生", "胸闷", "心律不齐", "建议观察", "", "", now_ms()),
    )
    c.commit()
    r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
    assert r["revision"] == 0 and r["department"] == "心内科"
    print("[3] create OK:", vid, "revision=0")

    # 3) 更新：expected_revision=0 匹配 -> revision=1
    cur_rev = int(r["revision"])
    new_rev = cur_rev + 1
    c.execute(
        """UPDATE visit SET date=?,visit_type=?,department=?,hospital=?,doctor=?,
           chief=?,diagnosis=?,summary=?,report_id=?,note=?,revision=?
           WHERE id=? AND revision=?""",
        ("2026-11-09", "门诊", "心内科", "新医院", "张医生", "胸闷加重", "心律不齐", "复查", "", "", new_rev, vid, cur_rev),
    )
    c.commit()
    r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
    assert r["revision"] == 1 and r["chief"] == "胸闷加重"
    print("[4] update OK: revision=1, chief 已改")

    # 4) 冲突：用过期 revision=0 再更新，应影响 0 行
    stale = 0
    c.execute(
        """UPDATE visit SET summary=?, revision=? WHERE id=? AND revision=?""",
        ("不该写入", 99, vid, stale),
    )
    c.commit()
    changed = c.total_changes
    r = c.execute("SELECT * FROM visit WHERE id=?", (vid,)).fetchone()
    assert r["revision"] == 1 and r["summary"] == "复查", "陈旧 revision 不应覆盖"
    print("[5] 冲突保护 OK: 陈旧 revision 写入被拒, revision 仍为1, summary 未变")
    c.close()

    # 5) 真实库未受影响
    real = Path(__file__).resolve().parent.parent / "data" / "health.db"
    print("[6] 真实库存在:", real.exists(), "-> 未触碰 (测试用临时库", test_db, ")")
    print("\nALL SMOKE TESTS PASSED")


if __name__ == "__main__":
    main()
