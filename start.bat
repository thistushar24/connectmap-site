@echo off
title ConnectMap P2P - All Services
color 0A

echo.
echo =====================================================
echo   CONNECTMAP P2P - STARTING ALL SERVICES
echo =====================================================
echo.
echo   [P2P Workspace]  http://localhost:3001
echo   [Backend API]    http://localhost:4000
echo   [Frontend]       http://localhost:3000
echo   [Tracker]        http://localhost:6969
echo.
echo =====================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Kill anything on our ports first
for %%p in (3000 3001 4000 6969) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%p "') do (
        taskkill /F /PID %%a >nul 2>nul
    )
)

timeout /t 1 /nobreak >nul

:: Start all services via concurrently
npm run dev
