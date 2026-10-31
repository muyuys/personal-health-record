#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""后端无依赖回归：python Tools/test_server.py（只使用临时目录）"""

import base64
import http.client
import json
import sqlite3
import sys
import tempfile
from contextlib import closing
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

from health_backup import BackupService
from health_repository import HealthRepository
from health_server import HealthHTTPServer
from local_http import allowed_origin, request_allowed


def lab(record_id="lab-1", name="项目"):
    return {
        "id": record_id, "date": "2026-01-01", "category": "其他", "name": name,
        "value": 1.2, "unit": "U/L", "low": 0, "high": 2,
        "source": "测试", "note": "", "reportId": "", "qualitative": "", "flag": "N",
    }


def report(record_id="report-1", file=""):
    return {
        "id": record_id, "date": "2026-01-01", "title": "测试报告",
        "panel": "", "specimen": "", "hospital": "", "note": "", "file": file,
        "createdAt": 1,
    }


def image_data_url(payload=b"test-image"):
    return "data:image/png;base64," + base64.b64encode(payload).decode()


class RepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.repo = HealthRepository(self.root / "test.db", self.root / "files")
        self.repo.init_db()

    def tearDown(self):
        self.tmp.cleanup()

    def test_qualitative_round_trip_does_not_invent_number(self):
        row = lab()
        row.update(value=None, unit="", qualitative="阴性", flag="N")
        self.repo.replace_labs([row])
        actual = self.repo.get_all()["labs"][0]
        self.assertIsNone(actual["value"])
        self.assertEqual(actual["qualitative"], "阴性")
        self.assertEqual(actual["flag"], "N")

    def test_partial_state_preserves_missing_groups(self):
        self.repo.replace_state(
            weights=[{"id": "w1", "date": "2026-01-01", "kg": 60}],
            done={"t1": True},
            body=[{"id": "b1", "date": "2026-01-01", "waist": 70}],
        )
        self.repo.replace_state(done={"t2": True})
        state = self.repo.get_all()
        self.assertEqual(len(state["weights"]), 1)
        self.assertEqual(len(state["body"]), 1)
        self.assertEqual(state["done"], {"t2": True})
        self.repo.replace_state(weights=[])
        self.assertEqual(self.repo.get_all()["weights"], [])
        self.assertEqual(len(self.repo.get_all()["body"]), 1)

    def test_import_rejects_unknown_and_supports_v1(self):
        self.repo.replace_labs([lab("old")])
        for invalid in ({}, {"format": "unknown"}, {"format": "health-archive", "version": 99}):
            with self.assertRaises(ValueError):
                self.repo.import_archive(invalid)
            self.assertEqual(self.repo.get_all()["labs"][0]["id"], "old")
        counts = self.repo.import_archive({"format": "health-labs", "records": [lab("v1")]})
        self.assertEqual(counts, {"labs": 1})
        self.assertEqual(self.repo.get_all()["labs"][0]["id"], "v1")

    def test_cross_table_import_rolls_back_everything(self):
        self.repo.replace_labs([lab("old")])
        self.repo.replace_vitals([{"id": "v-old", "date": "2026-01-01", "pulse": 70}])
        before = self.repo.get_all()
        archive = {
            "format": "health-archive", "version": 2,
            "labs": [lab("new")], "vitals": [None],
        }
        with self.assertRaises(AttributeError):
            self.repo.import_archive(archive)
        after = self.repo.get_all()
        self.assertEqual(after["labs"], before["labs"])
        self.assertEqual(after["vitals"], before["vitals"])
        self.assertEqual(after["savedAt"], before["savedAt"])

    def test_report_id_cannot_choose_path_and_delete_cleans_file(self):
        malicious = "../outside"
        self.repo.replace_reports([report(malicious, image_data_url())])
        stored = self.repo.get_all()["reports"][0]["file"]
        self.assertRegex(stored, r"^/files/[0-9a-f]{32}\.png$")
        self.assertFalse((self.root / "outside.png").exists())
        path = self.root / "files" / stored.removeprefix("/files/")
        self.assertEqual(path.read_bytes(), b"test-image")
        self.repo.replace_reports([])
        self.assertFalse(path.exists(), "省略整份报告后，提交成功才清理无引用旧图")

    def test_failed_import_keeps_old_image_and_removes_new_image(self):
        self.repo.replace_reports([report("old", image_data_url(b"old"))])
        old_url = self.repo.get_all()["reports"][0]["file"]
        old_path = self.root / "files" / old_url.removeprefix("/files/")
        archive = {
            "format": "health-archive", "version": 2,
            "reports": [report("new", image_data_url(b"new"))],
            "vitals": [None],
        }
        with self.assertRaises(AttributeError):
            self.repo.import_archive(archive)
        self.assertEqual(self.repo.get_all()["reports"][0]["file"], old_url)
        self.assertEqual(old_path.read_bytes(), b"old")
        self.assertEqual(list((self.root / "files").glob("*.png")), [old_path])

    def test_export_restore_round_trip(self):
        qualitative = lab("q")
        qualitative.update(value=None, unit="", qualitative="阳性", flag="H")
        self.repo.replace_labs([qualitative])
        self.repo.replace_reports([report("r", image_data_url(b"round-trip"))])
        self.repo.replace_state(
            weights=[{"id": "w", "date": "2026-01-01", "kg": 60}],
            done={"t": True}, body=[{"id": "b", "date": "2026-01-01", "waist": 70}],
        )
        payload = self.repo.export_payload()
        restored = HealthRepository(self.root / "restored.db", self.root / "restored-files")
        restored.init_db()
        restored.import_archive(payload)
        actual = restored.get_all()
        self.assertEqual(actual["labs"][0]["qualitative"], "阳性")
        self.assertIsNone(actual["labs"][0]["value"])
        self.assertEqual(actual["body"][0]["waist"], 70)
        self.assertEqual(actual["done"], {"t": True})
        restored_file = restored.img_dir / actual["reports"][0]["file"].removeprefix("/files/")
        self.assertEqual(restored_file.read_bytes(), b"round-trip")

    def test_legacy_migration_is_idempotent_and_preserves_rows(self):
        legacy = HealthRepository(self.root / "legacy.db", self.root / "legacy-files")
        with closing(sqlite3.connect(legacy.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE labs (id TEXT PRIMARY KEY,date TEXT NOT NULL,category TEXT NOT NULL,
                  name TEXT NOT NULL,value REAL NOT NULL,unit TEXT NOT NULL,low REAL,high REAL,
                  source TEXT DEFAULT '',note TEXT DEFAULT '',report_id TEXT DEFAULT '');
                CREATE TABLE weights (id TEXT PRIMARY KEY,date TEXT,kg REAL,tag TEXT,waist REAL,note TEXT);
                CREATE TABLE todo_item (id TEXT PRIMARY KEY,text TEXT NOT NULL,group_name TEXT DEFAULT '',
                  meta TEXT DEFAULT '',flag INTEGER DEFAULT 0,created_at INTEGER);
                INSERT INTO labs (id,date,category,name,value,unit) VALUES ('old','2026-01-01','其他','项目',1,'U/L');
            """)
            conn.commit()
        legacy.init_db()
        legacy.init_db()
        with closing(legacy.connect()) as conn:
            lab_cols = {row[1] for row in conn.execute("PRAGMA table_info(labs)")}
            weight_cols = {row[1] for row in conn.execute("PRAGMA table_info(weights)")}
            todo_cols = {row[1] for row in conn.execute("PRAGMA table_info(todo_item)")}
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM labs").fetchone()[0], 1)
        self.assertTrue({"qualitative", "flag"} <= lab_cols)
        self.assertTrue({"body_fat", "muscle", "bmi", "visceral_fat", "bmr", "bone"} <= weight_cols)
        self.assertIn("due_date", todo_cols)

    def test_sqlite_backup_and_prune(self):
        self.repo.replace_labs([lab("backup")])
        backups = BackupService(self.repo, keep_days=1)
        first = backups.backup_db(force=True)
        self.assertIsNotNone(first)
        with closing(sqlite3.connect(first)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM labs").fetchone()[0], 1)
        self.assertEqual(backups.prune_backups(keep=0), [first.name])
        self.assertFalse(first.exists())


class HTTPBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "root"
        self.root.mkdir()
        (self.root / "index.html").write_text("ok", encoding="utf-8")
        (self.root / "assets").mkdir()
        (self.root / "assets" / "app.js").write_text("ok", encoding="utf-8")
        (self.root / "data").mkdir()
        (self.root / "data" / "health.db").write_bytes(b"private")
        (self.root / "private_data").mkdir()
        (self.root / "private_data" / "secret.txt").write_text("private", encoding="utf-8")
        (self.root / ".git").mkdir()
        (self.root / ".git" / "config").write_text("private", encoding="utf-8")
        sibling = base / "root-sibling"
        sibling.mkdir()
        (sibling / "secret.txt").write_text("private", encoding="utf-8")
        orig = self.root / "data" / "报告原件"
        orig.mkdir()
        (orig / "example.jpg").write_bytes(b"image")
        self.repo = HealthRepository(base / "isolated.db", base / "isolated-files")
        self.repo.init_db()
        self.server = HealthHTTPServer("127.0.0.1", 0, self.root, self.repo, BackupService(self.repo), orig)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.tmp.cleanup()

    def request(self, path, headers=None, method="GET", body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        raw = response.read()
        result = (response.status, dict(response.getheaders()), raw)
        conn.close()
        return result

    def test_public_whitelist_and_real_path_containment(self):
        self.assertEqual(self.request("/")[0], 200)
        self.assertEqual(self.request("/assets/app.js")[0], 200)
        self.assertEqual(self.request("/data/%E6%8A%A5%E5%91%8A%E5%8E%9F%E4%BB%B6/example.jpg")[0], 200)
        for path in ("/data/health.db", "/private_data/secret.txt", "/.git/config",
                     "/../root-sibling/secret.txt", "/%2e%2e/root-sibling/secret.txt"):
            self.assertEqual(self.request(path)[0], 404, path)

    def test_host_and_origin_are_strictly_checked(self):
        evil = self.request("/api/all", {"Origin": "https://evil.example"})
        self.assertEqual(evil[0], 403)
        self.assertNotIn("Access-Control-Allow-Origin", evil[1])
        self.assertEqual(self.request("/api/all", {"Origin": "null"})[0], 403)
        self.assertEqual(self.request("/api/all", {"Host": "evil.example"})[0], 403)
        origin = f"http://127.0.0.1:{self.port}"
        good = self.request("/api/all", {"Origin": origin})
        self.assertEqual(good[0], 200)
        self.assertEqual(good[1].get("Access-Control-Allow-Origin"), origin)
        self.assertNotEqual(good[1].get("Access-Control-Allow-Origin"), "*")

    def test_ping_proves_injected_database_and_oversized_ocr_is_413(self):
        status, _, raw = self.request("/ping")
        self.assertEqual(status, 200)
        self.assertEqual(Path(json.loads(raw)["db"]), self.repo.db_path)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("POST", "/ocr")
        conn.putheader("Content-Length", str(25 * 1024 * 1024))
        conn.endheaders()
        response = conn.getresponse()
        response.read()
        self.assertEqual(response.status, 413)
        conn.close()

    def test_local_http_helpers_reject_similar_hosts(self):
        self.assertTrue(allowed_origin(f"http://localhost:{self.port}", self.port))
        self.assertFalse(allowed_origin("null", self.port))
        self.assertFalse(request_allowed({"Host": f"127.0.0.1:{self.port}@evil"}, self.port))
        self.assertFalse(request_allowed({"Host": f"127.0.0.1:{self.port + 1}"}, self.port))
        self.assertTrue(request_allowed({"Host": f"localhost:{self.port}"}, self.port))


if __name__ == "__main__":
    unittest.main(verbosity=2)
