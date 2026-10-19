@echo off
title Cai Dat Zagi MCP Cho Hermes ^& AI
cd /d "%~dp0"

echo ==================================================
echo   KHOI TAO ^& DONG BO ZAGI MCP CHO HERMES ^& AI     
echo ==================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Loi: Khong tim thay Node.js tren may tinh.
    echo     Vui long cai dat Node.js tai https://nodejs.org/
    pause
    exit /b 1
)

node .\zagi-mcp\scripts\setup-agent.js "Hermes Master Agent (%USERNAME%)"

echo.
echo Da hoan tat cai dat! Ban co the dong cua so nay.
pause
