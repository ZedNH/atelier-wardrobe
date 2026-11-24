@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it free from https://www.python.org/downloads/ ^(tick "Add to PATH"^), then run this again.
  pause
  exit /b 1
)
echo.
echo  Smart Wardrobe is running at  http://localhost:8765
echo  Keep this window open while you use the app. Close it to stop.
echo.
start "" http://localhost:8765
python -m http.server 8765 --bind 127.0.0.1
