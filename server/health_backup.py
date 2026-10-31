# -*- coding: utf-8 -*-
"""SQLite 一致快照与滚动备份；不依赖 HTTP。"""

import os
import re
import sqlite3
import time

_BACKUP_NAME = re.compile(r"^health-(\d{4}-\d{2}-\d{2})\.db$")


class BackupService:
    def __init__(self, repository, keep_days=30):
        self.repository = repository
        self.keep_days = keep_days

    @property
    def backup_dir(self):
        # 跟随注入的数据库位置，测试库绝不会写正式备份目录。
        return self.repository.db_path.parent / "backups"

    def backup_db(self, force=False):
        """用 SQLite backup API 生成当日一致快照；重复启动不重复生成。"""
        db_path = self.repository.db_path
        if not db_path.exists():
            return None
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        dest = self.backup_dir / f"health-{time.strftime('%Y-%m-%d')}.db"
        if dest.exists() and not force:
            return None
        tmp = dest.with_name(dest.name + ".tmp")
        src = dst = None
        try:
            src = sqlite3.connect(db_path, timeout=10)
            dst = sqlite3.connect(tmp)
            with dst:
                src.backup(dst)
        finally:
            # Windows 必须先关闭连接，再原子替换目标文件。
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

    def prune_backups(self, keep=None):
        """只删除符合严格备份命名的旧文件，并限制保留份数。"""
        if keep is None:
            keep = self.keep_days
        if not self.backup_dir.is_dir():
            return []
        files = []
        for p in self.backup_dir.glob("health-*.db"):
            match = _BACKUP_NAME.match(p.name)
            if match:
                files.append((match.group(1), p))
        files.sort(key=lambda item: item[0], reverse=True)
        removed = []
        for _, path in files[keep:]:
            try:
                path.unlink()
                removed.append(path.name)
            except OSError:
                pass
        return removed
