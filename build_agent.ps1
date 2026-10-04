$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "--- INICIANDO BUILD DO AGENTE LOCAL WINDOWS ---" -ForegroundColor Cyan

# Usar somente o ambiente conhecido do projeto.
$pythonBuild = if (Test-Path '.venv\Scripts\python.exe') { '.\.venv\Scripts\python.exe' }
               elseif (Test-Path 'venv\Scripts\python.exe') { '.\venv\Scripts\python.exe' }
               else { throw 'Python do projeto ausente.' }

# 2. Instalar dependências necessárias do PyInstaller se ausente
Write-Host "Verificando dependências de empacotamento..." -ForegroundColor Green
# python -m pip install --upgrade pip
# python -m pip install pyinstaller pystray pillow fastapi uvicorn PyMuPDF qrcode python-barcode pywin32 anyio

# 3. Limpar pastas de build anteriores
Write-Host "Limpando diretórios de compilação antigos..." -ForegroundColor Green
# O PyInstaller gerencia suas saidas; nao apagar diretorios por caminhos relativos.

# Segredos sao provisionados com DPAPI na estacao; nao sao gerados no build.

# 4. Executar o PyInstaller usando a especificação existente
Write-Host "Compilando executável com PyInstaller..." -ForegroundColor Green
& $pythonBuild -m PyInstaller --clean --noconfirm agent_tray.spec
if ($LASTEXITCODE -ne 0) { throw 'Build do agente falhou.' }

& $pythonBuild ferramentas/conferir_pacote_agente.py --exe dist/NewProd.exe
if ($LASTEXITCODE -ne 0) { throw "Executavel publico recusado." }

Write-Host "`nSUCESSO! Binário compilado em dist/NewProd.exe" -ForegroundColor Green
