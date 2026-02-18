@echo off
echo ==============================================
echo    DESPLIEGUE MANUAL - ASISTENCIA QR
echo ==============================================
echo.
echo Navegando a la carpeta del proyecto...
cd /d "%~dp0"
echo.
echo Ejecutando despliegue a Firebase...
call firebase deploy --only hosting
echo.
echo ==============================================
echo    SI VE "Deploy complete!", TODO ESTA BIEN.
echo    SI VE ERROR, POR FAVOR REVISE SU INTERNET.
echo ==============================================
pause
