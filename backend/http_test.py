# -*- coding: utf-8 -*-
"""HTTP 集成测试：真启 FastAPI（TestClient），用临时库跑通就诊闭环 + 409 冲突。

不接触真实 data/health.db。
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# 先把 DB 指到临时库，再导入 app
import app.db as db  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="fastapi_it_")) / "health.db"
db.DB_PATH = tmp
db._profile_scope.set("default")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def main():
    # startup 迁移手动触发
    with TestClient(app) as c:
        # 1) 建
        r = c.post("/api/visits", json={
            "date": "2026-11-09", "visitType": "门诊", "department": "心内科",
            "hospital": "新医院", "doctor": "张医生", "chief": "胸闷",
            "diagnosis": "心律不齐", "summary": "建议观察", "note": "", "reportId": "",
        })
        assert r.status_code == 201, r.text
        v = r.json()
        vid = v["item"]["id"]
        assert v["revision"] == 0
        print("[1] POST create OK, id=", vid, "revision=0")

        # 2) 列表
        r = c.get("/api/visits")
        assert r.status_code == 200 and any(x["id"] == vid for x in r.json())
        print("[2] GET list OK, count=", len(r.json()))

        # 3) 详情
        r = c.get(f"/api/visits/{vid}")
        assert r.status_code == 200 and r.json()["department"] == "心内科"
        print("[3] GET detail OK")

        # 4) 正常更新 expected_revision=0 -> revision=1
        payload = dict(r.json())
        payload["chief"] = "胸闷加重"
        payload["expected_revision"] = 0
        r = c.put(f"/api/visits/{vid}", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["revision"] == 1 and r.json()["item"]["chief"] == "胸闷加重"
        print("[4] PUT update OK, revision=1")

        # 5) 冲突：再用过期 expected_revision=0 -> 409
        payload["expected_revision"] = 0
        r = c.put(f"/api/visits/{vid}", json=payload)
        assert r.status_code == 409, f"应 409，实际 {r.status_code} {r.text}"
        print("[5] PUT stale revision -> 409 OK")

        # 6) 删除（错误 revision -> 409）
        r = c.delete(f"/api/visits/{vid}?expected_revision=0")
        assert r.status_code == 409, f"删除应 409，实际 {r.status_code}"
        print("[6] DELETE stale revision -> 409 OK")

        # 7) 删除（正确 revision -> 204）
        r = c.delete(f"/api/visits/{vid}?expected_revision=1")
        assert r.status_code == 204, f"删除应 204，实际 {r.status_code} {r.text}"
        r = c.get(f"/api/visits/{vid}")
        assert r.status_code == 404
        print("[7] DELETE correct revision -> 204 OK, 记录已删")

    print("\nALL HTTP INTEGRATION TESTS PASSED (临时库:", tmp, ")")


if __name__ == "__main__":
    main()
