@echo off
setlocal
cd /d "%~dp0"
title Glitch Mapping Generator

set "APP_URL=http://127.0.0.1:4173/demo/"
set "NODE_EXE="
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

where node >nul 2>&1
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%CODEX_NODE%" set "NODE_EXE=%CODEX_NODE%"

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js was not found.
  echo Install Node.js or launch this project from Codex.
  echo.
  pause
  exit /b 1
)

if /i "%~1"=="--check" (
  if not exist "scripts\serve-demo.mjs" exit /b 2
  if not exist "demo\index.html" exit /b 3
  "%NODE_EXE%" --version
  echo Launcher check: OK
  exit /b 0
)

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%APP_URL%'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo Glitch Generator is already running. Opening browser...
  start "" "%APP_URL%"
  exit /b 0
)

echo.
echo ================================================
echo   Glitch Mapping Generator
echo   Starting http://127.0.0.1:4173/demo/
echo ================================================
echo.
echo Keep this window open while using the demo.
echo Closing this window stops the local server.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process '%APP_URL%'"
"%NODE_EXE%" "scripts\serve-demo.mjs"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Server failed with exit code %EXIT_CODE%.
  echo Port 4173 may already be occupied by another application.
  echo.
  pause
)

exit /b %EXIT_CODE%
