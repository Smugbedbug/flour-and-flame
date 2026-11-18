@echo off
title Flour and Flame Bakery
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install the LTS version from https://nodejs.org , then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting Flour and Flame Bakery...
start "" http://localhost:4173
node serve-dist.mjs 4173
pause
