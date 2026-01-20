@echo off
title LAUNCHER DE FLOTA DE ROBOTS
echo ====================================================
echo    INICIANDO FLOTA DE ROBOTS DE ASISTENCIA (x3)
echo ====================================================
echo.
echo Iniciando Robot 1 (Auxiliar 1)...
start "BOT AUXILIAR 1" cmd /k "node bot.js auxiliar1"

echo Iniciando Robot 2 (Auxiliar 2)...
timeout /t 2 /nobreak >nul
start "BOT AUXILIAR 2" cmd /k "node bot.js auxiliar2"

echo Iniciando Robot 3 (Auxiliar 3)...
timeout /t 2 /nobreak >nul
start "BOT AUXILIAR 3" cmd /k "node bot.js auxiliar3"

echo.
echo ====================================================
echo  ¡FLOTA DESPLEGADA! 🚀
echo  Por favor, escanea los QRs en cada ventana que se abrio.
echo ====================================================
pause
