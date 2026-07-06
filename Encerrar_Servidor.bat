@echo off
echo ==========================================
echo Encerrando servidor local na porta 9000...
echo ==========================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9000') do (
    taskkill /f /pid %%a
)
echo Servidor encerrado com sucesso!
pause
