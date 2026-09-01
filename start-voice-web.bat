@echo off
setlocal

REM Dedicated launcher for the voice-controlled desktop experiment.
cd /d "%~dp0"

set "PORT=5173"
set "HEALTH_URL=http://127.0.0.1:%PORT%/"
set "APP_URL=http://127.0.0.1:%PORT%/index.html?module=operation&v=voice-permission-v2"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "VOICE_PROFILE=%LOCALAPPDATA%\DiffractionVoiceChrome"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

if not exist "%CHROME%" (
  echo [ERROR] Google Chrome was not found.
  pause
  exit /b 1
)

REM Reuse a running local server; otherwise start one in a minimized window.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%HEALTH_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  start "Diffraction Grating Server" /min "%NODE_EXE%" "%CD%\server.js" %PORT%
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok = $false; for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri '%HEALTH_URL%' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Milliseconds 300 }; if ($ok) { exit 0 } else { exit 1 }"
  if errorlevel 1 (
    echo [ERROR] The local server did not start.
    pause
    exit /b 1
  )
)

REM This isolated Chrome profile automatically accepts the microphone prompt only
REM for this dedicated experiment window; the recognition language is set in JS.
start "" "%CHROME%" --user-data-dir="%VOICE_PROFILE%" --app="%APP_URL%" --lang=zh-CN --use-fake-ui-for-media-stream
