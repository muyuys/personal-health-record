#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本机 OCR 服务 —— 把检验报告图片转成文字行，供 F:/Health 的「导入报告」使用。

设计约束（与项目原则一致）：
  * 只监听 127.0.0.1，浏览器之外的机器访问不到；
  * 图片只在内存里过一遍，不落盘、不上传、不写日志；
  * 只做「图片 → 文字」，不做字段判断；结构化交给页面里已有的解析器 + 人工勾选。

启动：双击「启动识别服务.bat」，或 .venv\\Scripts\\python.exe ocr_server.py
接口：GET  /ping  -> {ok, engine, version}
      POST /ocr   请求体 = 图片原始字节，返回 {ok, lines:[{text,score}], ms, low}
"""

import json
import logging
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8765
MAX_BYTES = 24 * 1024 * 1024

# ---------------------------------------------------------------- OCR 引擎

_engine = None
_engine_lock = threading.Lock()
_run_lock = threading.Lock()          # 引擎不是线程安全的，识别串行跑
_engine_error = ""
_api = 0                              # 2 = rapidocr(v2 起), 1 = rapidocr_onnxruntime 老包


def load_engine():
    """惰性加载；两种包名的 API 不同，这里统一一下。"""
    global _engine, _api, _engine_error
    with _engine_lock:
        if _engine is not None:
            return _engine
        try:
            from rapidocr import RapidOCR          # rapidocr >= 2.x
            _api = 2
        except ImportError:
            try:
                from rapidocr_onnxruntime import RapidOCR   # 老包名
                _api = 1
            except ImportError as e:
                _engine_error = f"没有安装识别库（{e}）。先运行「安装依赖.bat」。"
                raise RuntimeError(_engine_error)
        try:
            _engine = RapidOCR()
            _engine_error = ""
        except Exception as e:                      # 模型下载失败等
            _engine_error = f"识别引擎初始化失败：{e}"
            raise
        # 识别库默认每个模型都打一行 INFO，控制台会被刷满，只留警告以上
        logging.getLogger("RapidOCR").setLevel(logging.WARNING)
        return _engine


def _pts(box):
    """把检测框转成 [[x, y], ...]，兼容 ndarray / list。"""
    if hasattr(box, "tolist"):
        box = box.tolist()
    out = []
    for p in box:
        if hasattr(p, "tolist"):
            p = p.tolist()
        out.append((float(p[0]), float(p[1])))
    return out


def recognize(data):
    """返回 [(box, text, score), ...]"""
    eng = load_engine()
    with _run_lock:
        res = eng(data)

    # v1: (result, elapse)，result 形如 [[box, text, score], ...]
    if isinstance(res, tuple):
        res = res[0]
        items = []
        for it in (res or []):
            try:
                items.append((_pts(it[0]), str(it[1]), float(it[2])))
            except Exception:
                continue
        return items

    # v2: 对象，带 boxes / txts / scores
    boxes = getattr(res, "boxes", None)
    txts = getattr(res, "txts", None)
    scores = getattr(res, "scores", None)
    if boxes is None or txts is None:
        return []
    if scores is None:
        scores = [1.0] * len(txts)
    return [(_pts(b), str(t), float(s)) for b, t, s in zip(boxes, txts, scores)]


def group_lines(items):
    """
    把检测框按「同一行」聚起来，行内按 x 排序用制表符拼接。
    检验单是多列表格：一个格子一个框，直接平铺会让「尿酸 486 μmol/L 208-428」
    变成 5 行；拼回一行后正好是页面解析器能吃的 TSV。
    """
    if not items:
        return []

    rows = []
    for box, text, score in items:
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        text = (text or "").strip()
        if not text:
            continue
        rows.append({
            "cy": sum(ys) / len(ys),
            "h": max(ys) - min(ys),
            "x": min(xs),
            "t": text,
            "s": score,
        })
    rows.sort(key=lambda r: (r["cy"], r["x"]))

    lines = []
    for r in rows:
        if lines:
            last = lines[-1]
            tol = max(8.0, 0.5 * min(last["h"], r["h"])) if min(last["h"], r["h"]) > 0 else 8.0
            if abs(r["cy"] - last["cy"]) <= tol:
                last["cells"].append(r)
                last["cy"] = (last["cy"] * last["n"] + r["cy"]) / (last["n"] + 1)
                last["n"] += 1
                last["h"] = max(last["h"], r["h"])
                continue
        lines.append({"cy": r["cy"], "h": r["h"], "n": 1, "cells": [r]})

    out = []
    for ln in lines:
        cells = sorted(ln["cells"], key=lambda c: c["x"])
        out.append({
            "text": "\t".join(c["t"] for c in cells),
            "score": round(min(c["s"] for c in cells), 3),
        })
    return out


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "HealthOCR/1.0"

    def _cors(self):
        # 页面用 file:// 打开，origin 是 null，必须放行；同时声明私网访问。
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/ping"):
            eng = _engine
            ver = getattr(eng, "__version__", "") or ""
            self._send({
                "ok": True,
                "engine": "rapidocr" if _api == 2 else ("rapidocr_onnxruntime" if _api == 1 else ""),
                "api": _api,
                "version": ver,
                "ready": _engine is not None,
                "error": _engine_error,
            })
            return
        self._send({"ok": True, "hint": "POST /ocr，请求体放图片原始字节"}, 200)

    def do_POST(self):
        if not self.path.startswith("/ocr"):
            self._send({"ok": False, "error": "没有这个接口"}, 404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            self._send({"ok": False, "error": "请求里没有图片"}, 400)
            return
        if n > MAX_BYTES:
            self._send({"ok": False, "error": "图片超过 24MB，先压缩再传"}, 413)
            return
        data = self.rfile.read(n)
        t0 = time.time()
        try:
            items = recognize(data)
        except Exception as e:
            self._send({"ok": False, "error": f"识别失败：{e}"}, 500)
            return
        lines = group_lines(items)
        ms = int((time.time() - t0) * 1000)
        low = len([l for l in lines if l["score"] < 0.6])
        self._send({"ok": True, "lines": lines, "ms": ms, "low": low, "n": len(lines)})

    def log_message(self, fmt, *args):
        # 默认会把图片字节数、路径写进控制台；这里只保留一句极简进度
        if self.path.startswith("/ocr"):
            sys.stderr.write("  · 识别请求 %s\n" % (fmt % args))


def main(argv):
    global PORT
    port = PORT
    for i, a in enumerate(argv):
        if a in ("-p", "--port") and i + 1 < len(argv):
            port = int(argv[i + 1])
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    srv = ThreadingHTTPServer((HOST, port), Handler)
    print("")
    print("  健康档案 · 本机识别服务")
    print("  ------------------------------------")
    print(f"  地址   http://{HOST}:{port}")
    print("  范围   只监听本机，图片不落盘、不上传")
    print("  退出   关掉这个窗口，或在窗口里按 Ctrl+C")
    print("")

    def warm():
        try:
            t0 = time.time()
            load_engine()
            print("  引擎   就绪，首张约 %.1fs 的加载已完成\n" % (time.time() - t0))
        except Exception as e:
            print("  引擎   加载失败：%s\n" % e)

    threading.Thread(target=warm, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止。")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main(sys.argv[1:])
