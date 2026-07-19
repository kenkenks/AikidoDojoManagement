@echo off
setlocal
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0dojo.py" %*
) else (
  python "%~dp0dojo.py" %*
)
exit /b %errorlevel%
