@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Building app...
call npm run build
if errorlevel 1 (
  echo Build failed. Fix the errors above.
  pause
  exit /b 1
)
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server/index.js
pause
