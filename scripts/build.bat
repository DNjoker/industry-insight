@echo off
setlocal enabledelayedexpansion

set "PROJECT_DIR=%~dp0.."
set "PYTHON=%PROJECT_DIR%\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo ERROR: Python venv not found at %PYTHON%
    pause
    exit /b 1
)

echo ========================================
echo   信息汇总桌面工具 - 打包构建
echo ========================================
echo.

echo [1/4] 下载嵌入模型...
"%PYTHON%" "%PROJECT_DIR%\scripts\download_model.py"
if %errorlevel% neq 0 (
    echo 模型下载失败!
    pause
    exit /b 1
)

echo.
echo [2/4] PyInstaller 打包后端...
"%PYTHON%" -m PyInstaller --clean --noconfirm "%PROJECT_DIR%\pyinstaller.spec"
if %errorlevel% neq 0 (
    echo PyInstaller 打包失败!
    pause
    exit /b 1
)

echo.
echo [3/4] Vite 构建前端...
cd /d "%PROJECT_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo 前端构建失败!
    pause
    exit /b 1
)

echo.
echo [4/4] electron-builder 打包安装程序...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo 安装程序打包失败!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   构建完成!
echo   安装程序: release\*.exe
echo ========================================
dir "%PROJECT_DIR%\release\*.exe" 2>nul
pause
