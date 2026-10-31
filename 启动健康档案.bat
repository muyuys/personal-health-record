@echo off
chcp 65001 >nul
title 健康档案 · 本机服务
cd /d "%~dp0server"
if not exist ".venv\Scripts\python.exe" (
  echo.
  echo   还没装依赖。先双击 server\安装依赖.bat，装完再回来。
  echo.
  pause
  exit /b 1
)
rem 服务就绪后再开浏览器，避免打开一个「无法访问」的白页
start /b "" cmd /c "timeout /t 3 >nul && start http://127.0.0.1:8765/"
".venv\Scripts\python.exe" health_server.py %*
echo.
echo   服务已停止。关掉这个窗口即可。
pause
