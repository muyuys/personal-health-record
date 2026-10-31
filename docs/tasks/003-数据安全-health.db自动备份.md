# 003 数据安全：health.db 自动滚动备份

- 优先级：P0
- 问题：`data/health.db` 单副本、无自动备份、无导出提醒，误删即永久丢失。
- 目标：服务启动时自动滚动备份（每日 1 份，保留 N 天）+ 定期导出提醒。
- 范围：`server/health_server.py` 启动逻辑；备份目录（如 `data/backups/`）。
- 验收：启动后自动生成当日备份；超过保留期自动清理；文档说明恢复步骤。
- 关联：`server/health_server.py`、`data/health.db`
