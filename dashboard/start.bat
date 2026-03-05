@echo off
echo ============================================================
echo   Cesar Bot Dashboard
echo ============================================================
echo.

:: Get the project root (parent of dashboard/)
set "PROJECT_ROOT=%~dp0.."

:: Start backend in a new window
echo   Iniciando Backend (FastAPI)...
start "Dashboard API" cmd /k "cd /d "%PROJECT_ROOT%" && python -m dashboard.api.main"

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend in a new window
echo   Iniciando Frontend (React)...
start "Dashboard UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo.
echo   Cierra esta ventana. Los servidores seguiran corriendo.
pause >nul
