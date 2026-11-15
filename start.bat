@echo off
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
if not exist dist\index.html (
  echo Building app...
  call npm run build
)
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server/index.js
pause
