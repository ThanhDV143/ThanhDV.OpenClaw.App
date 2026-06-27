@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%upload-openclaw-plugin.ps1"

if not exist "%PS_SCRIPT%" (
  echo Missing PowerShell script:
  echo %PS_SCRIPT%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Upload failed with exit code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo Upload finished successfully.
pause

