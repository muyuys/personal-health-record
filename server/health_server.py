#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本机健康档案组合根：同源 HTTP 路由 + SQLite 仓储 + 进程内 OCR。

正常使用请通过「启动健康档案.bat」访问 http://127.0.0.1:8765/。
file:// 仅作离线应急，不能跨源调用本机 API。数据库、备份和私有目录不参与静态托管。
"""

import argparse
import json
import mimetypes
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from health_backup import BackupService
from health_repository import HealthRepository
from local_http import add_cors_headers, request_allowed
import ocr_server

HOST = "127.0.0.1"
PORT = 8765
MAX_JSON = 32 * 1024 * 1024
MAX_IMAGE = 24 * 1024 * 1024
TOO_LARGE = object()
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT / "data" / "health.db"
DEFAULT_IMG_DIR = ROOT / "data" / "报告原件" / "files"
DEFAULT_ORIG_DIR = ROOT / "data" / "报告原件"
ORIG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".pdf", ".dcm", ".dicom", ".tif", ".tiff"}
PUBLIC_FILES = {"index.html", "README.md"}
PUBLIC_DIRS = {"assets", "js", "docs"}
SAFE_FILE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def list_originals(root, orig_dir):
    """只列原件元数据，不读取医疗内容，也不修改文件。"""
    if not orig_dir.is_dir():
        return []
    root = root.resolve()
    out = []
    for path in sorted(orig_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in ORIG_EXTS:
            continue
        try:
            stat = path.stat()
            rel = path.resolve().relative_to(root).as_posix()
            parent = path.parent.resolve().relative_to(root).as_posix()
        except (OSError, ValueError):
            continue
        out.append({
            "path": rel, "name": path.name, "dir": parent,
            "size": stat.st_size, "mtime": int(stat.st_mtime),
            "ext": path.suffix.lower().lstrip("."),
        })
    out.sort(key=lambda item: item["mtime"], reverse=True)
    return out


def export_reminder_text(status):
    if status["lastExportAt"] is None:
        return "还没导出过 JSON 备份，建议在页面点「导出」另存一份到别处"
    return f"距上次导出已 {status['daysSince']} 天，建议重新导出 JSON 备份"


def run_housekeeping(repository, backups, verbose=True):
    """启动后的当日快照与清理；备份失败不阻断正常读写。"""
    made = None
    removed = []
    error = None
    try:
        made = backups.backup_db()
        removed = backups.prune_backups()
    except Exception as exc:
        error = str(exc)
        if verbose:
            print(f"  备份   失败：{exc}（不影响数据读写）")
    status = repository.export_status()
    if verbose:
        if made:
            print(f"  备份   已生成 {made.name}")
        elif not error:
            print(f"  备份   今日已有备份，跳过（保留最近 {backups.keep_days} 天）")
        if removed:
            print(f"  清理   删除过期备份 {len(removed)} 份")
        if status["due"]:
            print("  提醒   " + export_reminder_text(status))
    return {"backup": str(made) if made else None, "pruned": removed,
            "export": status, "error": error}


class HealthHTTPServer(ThreadingHTTPServer):
    """通过 server 实例显式传递依赖，避免 Handler 读写全局路径。"""

    def __init__(self, host, port, root, repository, backups, orig_dir):
        self.root = Path(root).resolve()
        self.repository = repository
        self.backups = backups
        self.orig_dir = Path(orig_dir).resolve()
        super().__init__((host, port), Handler)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "HealthServer/3.0"

    @property
    def repo(self):
        return self.server.repository

    def _cors(self):
        add_cors_headers(self, "GET, PUT, POST, OPTIONS")

    def _trusted(self):
        if request_allowed(self.headers, self.server.server_port):
            return True
        self._json({"ok": False, "error": "仅允许本机同源页面访问"}, 403)
        return False

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
            size = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            size = 0
        if size <= 0:
            return None
        if size > limit:
            return TOO_LARGE
        return self.rfile.read(size)

    def _json_body(self):
        raw = self._body()
        if raw is None or raw is TOO_LARGE:
            return raw
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _file(self, path, cache="no-cache"):
        if not path.is_file():
            self._json({"ok": False, "error": "文件不存在"}, 404)
            return
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix.lower() in (".js", ".css", ".html", ".json", ".md"):
            content_type += "; charset=utf-8"
        raw = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _static(self, request_path):
        rel = unquote(request_path).lstrip("/") or "index.html"
        target = (self.server.root / rel).resolve()
        try:
            relative = target.relative_to(self.server.root)
        except ValueError:
            self._json({"ok": False, "error": "路径无效"}, 404)
            return
        parts = relative.parts
        public = relative.as_posix() in PUBLIC_FILES or (parts and parts[0] in PUBLIC_DIRS)
        try:
            target.relative_to(self.server.orig_dir)
            original = target.suffix.lower() in ORIG_EXTS
        except ValueError:
            original = False
        if target.is_dir() or not (public or original):
            self._json({"ok": False, "error": "资源不对外开放"}, 404)
            return
        self._file(target)

    def do_OPTIONS(self):
        if not self._trusted():
            return
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._trusted():
            return
        path = urlparse(self.path).path
        if path == "/ping":
            engine = ocr_server.status()
            backup_dir = self.server.backups.backup_dir
            try:
                backup_names = sorted(p.name for p in backup_dir.glob("health-*.db"))
            except OSError:
                backup_names = []
            status = self.repo.export_status()
            self._json({
                "ok": True, "db": str(self.repo.db_path), "root": str(self.server.root),
                **engine, "backupDir": str(backup_dir), "backups": backup_names,
                "lastExportAt": status["lastExportAt"], "exportDue": status["due"],
            })
            return
        if path == "/api/all":
            self._json(self.repo.get_all())
            return
        if path == "/api/export":
            payload = self.repo.export_payload()
            try:
                self.repo.set_meta("lastExportAt", int(time.time()))
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
        if path == "/api/originals":
            self._json({"ok": True, "dir": "data/报告原件",
                        "files": list_originals(self.server.root, self.server.orig_dir)})
            return
        if path.startswith("/files/"):
            name = unquote(path[len("/files/"):])
            if not SAFE_FILE_NAME.fullmatch(name):
                self._json({"ok": False, "error": "路径无效"}, 404)
                return
            self._file(self.repo.img_dir / name)
            return
        self._static(path)

    @staticmethod
    def _require_list(data):
        if not isinstance(data, list):
            raise ValueError("需要数组")

    def do_PUT(self):
        if not self._trusted():
            return
        path = urlparse(self.path).path
        data = self._json_body()
        if data is TOO_LARGE:
            self._json({"ok": False, "error": "请求太大"}, 413)
            return
        if data is None:
            self._json({"ok": False, "error": "请求体不是 JSON"}, 400)
            return
        try:
            if path == "/api/labs":
                self._require_list(data)
                self.repo.replace_labs(data)
                self._json({"ok": True, "n": len(data)})
            elif path == "/api/reports":
                self._require_list(data)
                files = self.repo.replace_reports(data)
                self._json({"ok": True, "n": len(data), "files": files})
            elif path == "/api/state":
                if not isinstance(data, dict):
                    raise ValueError("需要对象")
                self.repo.replace_state(data.get("weights"), data.get("done"), data.get("body"))
                self._json({"ok": True})
            elif path == "/api/history":
                if not isinstance(data, dict):
                    raise ValueError("需要对象")
                self._json({"ok": True, "n": self.repo.replace_history(data)})
            elif path in ("/api/vitals", "/api/symptoms", "/api/diet-days", "/api/diet-weeks",
                          "/api/sleep-logs", "/api/todos"):
                self._require_list(data)
                method = {
                    "/api/vitals": self.repo.replace_vitals,
                    "/api/symptoms": self.repo.replace_symptoms,
                    "/api/diet-days": self.repo.replace_diet_days,
                    "/api/diet-weeks": self.repo.replace_diet_weeks,
                    "/api/sleep-logs": self.repo.replace_sleep_logs,
                    "/api/todos": self.repo.replace_todo_items,
                }[path]
                method(data)
                self._json({"ok": True, "n": len(data)})
            elif path == "/api/issue-status":
                self._json({"ok": True, "n": self.repo.replace_issue_status(data)})
            else:
                self._json({"ok": False, "error": "没有这个接口"}, 404)
        except (ValueError, TypeError, KeyError) as exc:
            self._json({"ok": False, "error": f"请求数据无效：{exc}"}, 400)
        except Exception as exc:
            self._json({"ok": False, "error": f"写入失败：{exc}"}, 500)

    def do_POST(self):
        if not self._trusted():
            return
        path = urlparse(self.path).path
        if path == "/ocr":
            raw = self._body(MAX_IMAGE)
            if raw is TOO_LARGE:
                self._json({"ok": False, "error": "图片超过 24MB，先压缩再传"}, 413)
                return
            if not raw:
                self._json({"ok": False, "error": "请求里没有图片"}, 400)
                return
            started = time.time()
            try:
                lines = ocr_server.recognize_lines(raw)
            except Exception as exc:
                self._json({"ok": False, "error": f"识别失败：{exc}"}, 500)
                return
            self._json({"ok": True, "lines": lines, "ms": int((time.time() - started) * 1000),
                        "low": len([line for line in lines if line["score"] < 0.6]), "n": len(lines)})
            return
        if path == "/api/import":
            data = self._json_body()
            if data is TOO_LARGE:
                self._json({"ok": False, "error": "请求太大"}, 413)
                return
            if not isinstance(data, dict):
                self._json({"ok": False, "error": "备份文件读不出来"}, 400)
                return
            try:
                counts = self.repo.import_archive(data)
                self._json({"ok": True, "n": counts})
            except (ValueError, TypeError, KeyError) as exc:
                self._json({"ok": False, "error": f"备份内容无效：{exc}"}, 400)
            except Exception as exc:
                self._json({"ok": False, "error": f"导入失败：{exc}"}, 500)
            return
        self._json({"ok": False, "error": "没有这个接口"}, 404)

    def log_message(self, fmt, *args):
        # 不把可能包含健康信息的路径写进访问日志。
        pass


def main(argv=None):
    parser = argparse.ArgumentParser(description="个人健康档案本机服务")
    parser.add_argument("-p", "--port", type=int, default=PORT)
    parser.add_argument("-d", "--db", help="测试数据库路径；图片、原件和备份随之隔离")
    args = parser.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if args.db:
        db_path = Path(args.db).resolve()
        img_dir = db_path.parent / (db_path.stem + "_files")
        orig_dir = db_path.parent / "报告原件"
    else:
        db_path = DEFAULT_DB_PATH
        img_dir = DEFAULT_IMG_DIR
        orig_dir = DEFAULT_ORIG_DIR
    repository = HealthRepository(db_path, img_dir)
    backups = BackupService(repository)

    # 旧库先留迁移前快照，再执行幂等 schema 变更。
    if db_path.exists():
        backups.backup_db()
    repository.init_db()
    run_housekeeping(repository, backups)
    server = HealthHTTPServer(HOST, args.port, ROOT, repository, backups, orig_dir)
    url = f"http://{HOST}:{args.port}/"
    print("")
    print("  健康档案 · 本机服务")
    print("  ------------------------------------")
    print(f"  打开   {url}")
    print(f"  数据   {repository.db_path}")
    print(f"  图片   {repository.img_dir}")
    print(f"  备份   {backups.backup_dir}")
    print("  范围   只监听本机，同源访问，不联网")
    print("  退出   关掉这个窗口，或按 Ctrl+C")
    print("")

    def warm():
        try:
            started = time.time()
            ocr_server.load_engine()
            print("  识别   引擎就绪（%.1fs）\n" % (time.time() - started))
        except Exception as exc:
            print("  识别   引擎加载失败：%s（不影响数据读写）\n" % exc)

    threading.Thread(target=warm, daemon=True).start()

    def reminder_loop():
        while True:
            time.sleep(6 * 3600)
            try:
                status = repository.export_status()
                if status["due"]:
                    print("  提醒   " + export_reminder_text(status))
            except Exception:
                pass

    threading.Thread(target=reminder_loop, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
