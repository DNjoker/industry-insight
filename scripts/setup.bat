@echo off
echo === 信息汇总桌面工具 - 环境安装 ===

echo.
echo [1/3] 创建 Python 虚拟环境...
python -m venv venv
call venv\Scripts\activate.bat

echo [2/3] 安装 Python 依赖...
pip install -r backend\requirements.txt

echo [3/3] 安装 Node.js 依赖...
call npm install

echo.
echo === 安装完成 ===
echo 运行 dev.bat 启动开发环境
pause
