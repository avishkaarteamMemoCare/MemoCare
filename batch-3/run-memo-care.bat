@echo off
title MemoCare Fullstack Launcher
echo ===================================================
echo Starting MemoCare Server and Online Tunnel...
echo ===================================================

cd /d "%~dp0"

echo Starting Backend Server on Port 4000...
start "MemoCare Server (Do Not Close)" cmd /k "title MemoCare Server && node memocare-backend/dist/src/server.js"

echo Waiting 3 seconds for server to start...
timeout /t 3 /nobreak >nul

echo Starting Online Tunnel...
start "MemoCare Online Link (Do Not Close)" cmd /k "title MemoCare Tunnel && npx localtunnel --port 4000"

echo.
echo ===================================================
echo Done! Both windows are now running.
echo Look at the "MemoCare Tunnel" window for your URL!
echo ===================================================
