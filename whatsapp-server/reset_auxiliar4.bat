@echo off
title LIMPIEZA DE AUXILIAR 4
echo ===========================================
echo  ELIMINANDO SESION DE AUXILIAR 4
echo ===========================================
echo.
echo Esto borrara la vinculacion del cuarto celular para
echo permitir un inicio limpio.
echo.

if exist ".wwebjs_auth\session-auxiliar4" (
    rmdir /s /q ".wwebjs_auth\session-auxiliar4"
    echo [OK] Sesion eliminada correctamente.
) else (
    echo [INFO] No se encontro sesion previa o ya estaba limpia.
)

echo.
echo Ahora ejecuta "start_bots.bat" de nuevo y escanea el QR.
echo.
pause
