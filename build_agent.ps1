$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

Write-Host "--- INICIANDO BUILD DO AGENTE LOCAL WINDOWS ---" -ForegroundColor Cyan

# 1. Ativar ambiente virtual se existir
if (Test-Path "venv\Scripts\Activate.ps1") {
    Write-Host "Ativando ambiente virtual venv..." -ForegroundColor Green
    . venv\Scripts\Activate.ps1
} else {
    Write-Host "Ambiente virtual venv não detectado. Usando Python global..." -ForegroundColor Yellow
}

# 2. Instalar dependências necessárias do PyInstaller se ausente
Write-Host "Verificando dependências de empacotamento..." -ForegroundColor Green
python -m pip install --upgrade pip
python -m pip install pyinstaller pystray pillow fastapi uvicorn PyMuPDF qrcode python-barcode pywin32 anyio

# 3. Limpar pastas de build anteriores
Write-Host "Limpando diretórios de compilação antigos..." -ForegroundColor Green
if (Test-Path "build") { Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist\IdealImpositionAgent.exe", "dist\IdealImpositionAgent" -ErrorAction SilentlyContinue }

# 4. Executar o PyInstaller usando a especificação existente
Write-Host "Compilando executável com PyInstaller..." -ForegroundColor Green
.\venv\Scripts\python.exe -m PyInstaller --clean agent_tray.spec

Write-Host "`nSUCESSO! Binário compilado em dist/IdealImpositionAgent.exe" -ForegroundColor Green
