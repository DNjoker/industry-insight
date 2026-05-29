@echo off
echo === 信息汇总桌面工具 - 开发模式 ===

start "Python Backend" cmd /c "call venv\Scripts\activate.bat && python -m uvicorn backend.main:app --host 127.0.0.1 --port 19877"

timeout /t 3 /nobreak >nul

echo 启动 Electron 前端...
call npm run dev
