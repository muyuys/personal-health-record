# -*- coding: utf-8 -*-
"""本机 HTTP 信任边界：仅同源页面与明确本机客户端，不开放跨源 API。"""

import re

_HOST = re.compile(r"^(127\.0\.0\.1|localhost)(?::(\d{1,5}))?$")


def allowed_origin(origin, port):
    if not origin:
        return False
    return origin in {
        f"http://127.0.0.1:{port}",
        f"http://localhost:{port}",
    }


def request_allowed(headers, port):
    """限制 Host 防 DNS rebinding；Origin:null（file://）不允许访问 API。"""
    host = (headers.get("Host") or "").lower()
    match = _HOST.fullmatch(host)
    if not match or (match.group(2) is not None and int(match.group(2)) != port):
        return False
    origin = headers.get("Origin")
    return origin is None or allowed_origin(origin, port)


def add_cors_headers(handler, methods):
    """同源请求通常不需要 CORS；仅对精确匹配的本服务源返回响应头。"""
    origin = handler.headers.get("Origin")
    handler.send_header("Vary", "Origin")
    if not allowed_origin(origin, handler.server.server_port):
        return
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Methods", methods)
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Max-Age", "86400")
