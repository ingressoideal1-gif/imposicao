@echo off
chcp 65001 > nul
REM Invocador fino do publicar.ps1. Existe so para quem prefere clicar duas
REM vezes num .bat em vez de abrir o PowerShell.
REM
REM A logica de publicacao mora TODA no publicar.ps1. Nao reimplemente nada
REM aqui: este arquivo ja reimplementou a leitura de versao, o bump e o
REM commit em batch, e por isso nao teria nenhum dos freios novos. Duas
REM versoes da mesma coisa divergem com o tempo.
cd /d "%~dp0"

set "MSG=%~1"
if "%MSG%"=="" set /p "MSG=Mensagem do commit: "
if "%MSG%"=="" (
    echo Mensagem vazia. Cancelado.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0publicar.ps1" -Mensagem "%MSG%"
pause
