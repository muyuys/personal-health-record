@echo off
chcp 65001 >nul
title 健康档案 · 本机服务
cd /d "%~dp0server"
rem 默认通过本机 Magpie 转发；已设置的环境变量优先。
if not defined HEALTH_AI_URL set "HEALTH_AI_URL=http://127.0.0.1:3425/v1/chat/completions"
if not defined HEALTH_AI_MODEL set "HEALTH_AI_MODEL=workbuddy/glm-5.3-flash"
rem 服务就绪后再开浏览器，避免打开一个「无法访问」的白页
start /b "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:8765/"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" health_server.py %*
) else (
  python health_server.py %*
)
echo.
echo   服务已停止。关掉这个窗口即可。
pause
