@echo off
echo ==========================================
echo    GENARO HERRERA (QR) - DEPLOY & PUSH
echo ==========================================

echo [1/4] Agregando archivos a Git...
git add .

echo [2/4] Creando commit...
if "%~1"=="" (
    set commit_msg="Actualizacion automatica por Antigravity"
) else (
    set commit_msg="%~1"
)
git commit -m %commit_msg%

echo [3/4] Subiendo a GitHub...
git push origin main

echo [4/4] Desplegando en Firebase...
call firebase deploy

echo ==========================================
echo    PROCESO COMPLETADO EXITOSAMENTE
echo ==========================================
