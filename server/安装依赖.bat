@echo off
cd /d "%~dp0"
title Health - install deps
echo.
echo   Creating virtual environment (.venv) ...
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 goto fail
)
echo   Installing rapidocr + onnxruntime ...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -i https://pypi.org/simple rapidocr onnxruntime
if errorlevel 1 goto fail
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
