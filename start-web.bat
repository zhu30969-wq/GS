@echo off
setlocal

REM Keep every path relative to this script so it works after double-clicking.
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%/"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found. Install Node.js or run this project inside Codex again.
  pause
  exit /b 1
)

REM If the local server is already alive, just open the browser.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if errorlevel 1 (
  echo Starting local server: %URL%
  start "Diffraction Grating Server" /min "%NODE_EXE%" "%CD%\server.js" %PORT%

  REM Wait until the server can actually serve index.html before opening the browser.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok = $false; for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Milliseconds 300 }; if ($ok) { exit 0 } else { exit 1 }"

  if errorlevel 1 (
    echo [ERROR] The local server did not start. Check whether port %PORT% is occupied.
    pause
    exit /b 1
  )
)

start "" "%URL%"
echo Opened %URL%
