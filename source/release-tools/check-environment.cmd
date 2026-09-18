@echo off
setlocal
chcp 65001 >nul
echo Xin Music - 环境检查
echo 将逐项检查运行环境与模型，不处理歌曲。每项最多等待两分钟。
echo 可按 Ctrl+C 停止。报告保存在本机 LocalAppData\XinMusicDiagnostics。
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0XLD.exe" "%~dp0resources\diagnostics\diagnose.cjs"
set "CHECK_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %CHECK_EXIT%
