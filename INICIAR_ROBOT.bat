@echo off
title ROBOT DE ASISTENCIA (WhatsApp)
color 0A
echo.
echo ===================================================
echo      INICIANDO ROBOT DE ASISTENCIA (WhatsApp)
echo ===================================================
echo.
echo [1] Navegando a la carpeta del servidor...
cd /d "C:\Users\DERVIS ZEVALLOS\.gemini\antigravity\scratch\qr_attendance\whatsapp-server"

echo [2] Encendiendo motores...
echo.
echo ***************************************************
echo *  NO CIERRES ESTA VENTANA NEGRA                  *
echo *  MINIMIZALA SI QUIERES, PERO NO LA CIERRES      *
echo ***************************************************
echo.

node bot.js

echo.
echo ---------------------------------------------------
echo  El Robot se ha detenido.
echo ---------------------------------------------------
pause
