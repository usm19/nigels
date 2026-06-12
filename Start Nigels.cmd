@echo off
rem Starts Nigel's on this computer and opens it in the browser.
set "PATH=C:\Users\shahi\.node\node-v22.22.3-win-x64;%PATH%"
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages - first run only, this can take a few minutes...
  call npm install --prefer-offline --no-audit --no-fund
)
start "" "http://localhost:3000"
call npm run dev
