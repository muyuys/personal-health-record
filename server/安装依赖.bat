@echo off
cd /d "%~dp0"
title Health - install deps
echo.
echo   Creating virtual environment (.venv) ...
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 goto fail
)
echo   Ready. The health server uses Python standard library only.
echo.
echo   Done. Double-click "启动健康档案.bat" in the parent folder.
echo.
pause
exit /b 0

:fail
echo.
echo   Install failed. Check your network or Python installation.
echo.
pause
exit /b 1
