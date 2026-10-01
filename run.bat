@echo off
title AI Technical Error Explanation System (Django)
echo ===================================================
echo   AI Technical Error Explanation System (Django + Firebase)
echo ===================================================
echo.

cd /d "%~dp0AI_Error_Explanation"

echo [1/4] Installing dependencies...
python -m pip install -r requirements.txt --quiet

echo [2/4] Running Django database migrations...
python manage.py migrate --run-syncdb 2>nul
if %ERRORLEVEL% NEQ 0 (
    python manage.py migrate
)

echo [3/4] Checking Ollama status...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo       [OK] Ollama is active on http://localhost:11434
) else (
    echo       [NOTE] Ollama is not running. App will use built-in RAG Knowledge Base.
    echo              To enable full local LLM, run 'ollama serve' in another terminal.
)

echo [4/4] Starting Django server on http://localhost:8000...
echo.
echo  Open your browser at: http://localhost:8000
echo  Press Ctrl+C to stop the server.
echo.
python manage.py runserver 8000
pause
