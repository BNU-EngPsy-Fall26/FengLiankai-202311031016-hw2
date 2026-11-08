@echo off
chcp 65001 >nul
title Attention Lab - HTTPS Server
cd /d "%~dp0"

echo.
echo  ============================================
echo    Attention Lab - Local HTTPS Server
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js not found. Install from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo  [OK] Node.js ready
echo  [..] Starting HTTPS server on port 8443...
echo.
echo  First visit: click "Advanced" then "Proceed to localhost".
echo  URL: https://localhost:8443
echo  Keep this window open. Press Ctrl+C to stop.
echo.

node server-https.js

echo.
echo  --------------------------------
echo  Server stopped.
echo  --------------------------------
echo.
pause
