@echo off
title LIMPIEZA DE AUXILIAR 5
echo ===========================================
echo  ELIMINANDO SESION DE AUXILIAR 5
echo ===========================================
echo.
echo Esto borrara la vinculacion del quinto celular para
echo permitir un inicio limpio.
echo.

if exist ".wwebjs_auth\session-auxiliar5" (
    rmdir /s /q ".wwebjs_auth\session-auxiliar5"
    echo [OK] Sesion eliminada correctamente.
) else (
    echo [INFO] No se encontro sesion previa o ya estaba limpia.
)

echo.
echo Ahora ejecuta "start_bots.bat" de nuevo y escanea el QR.
echo.
pause
