@echo off
REM Double-click to start the Income Growth Bucket Diagram server on Windows.
REM Press Ctrl+C in the terminal window to stop.

cd /d "%~dp0"

if "%PORT%"=="" set PORT=5173

REM Kill any process already on the port so we don't get EADDRINUSE.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo Port %PORT% in use; stopping PID %%P...
    taskkill /F /PID %%P >nul 2>&1
)

REM Open the browser after a short delay so the server has time to bind.
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:%PORT%"

echo Starting Income Growth Bucket Diagram on http://127.0.0.1:%PORT%
echo Press Ctrl+C to stop.
echo.
node server.mjs
