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
# python -m pip install --upgrade pip
# python -m pip install pyinstaller pystray pillow fastapi uvicorn PyMuPDF qrcode python-barcode pywin32 anyio

# 3. Limpar pastas de build anteriores
Write-Host "Limpando diretórios de compilação antigos..." -ForegroundColor Green
if (Test-Path "build") { Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist\NewProd.exe", "dist\NewProd" -ErrorAction SilentlyContinue }

# 3b. Segredo do agente — ANTES de compilar
#
# Estava no fim deste arquivo, DEPOIS da compilação: o acesso_segredo.py só
# entrava no build SEGUINTE. A rotina agora vive no Publicacao.psm1, junto com a
# do publicar_agente.ps1, porque foi a divergência entre as duas cópias que
# deixou todo agente sair sem segredo até 15/08/2026 — imprimindo perfeitamente
# e não publicando credencial nenhuma.
Import-Module (Join-Path $PSScriptRoot "ferramentas\Publicacao.psm1") -Force
Write-Host "Embutindo o segredo do agente..." -ForegroundColor Green
New-SegredoDoAgente -Raiz $PSScriptRoot | Out-Null
Write-Host "Segredo do agente embutido (acesso_segredo.py gerado)." -ForegroundColor Green

# 4. Executar o PyInstaller usando a especificação existente
Write-Host "Compilando executável com PyInstaller..." -ForegroundColor Green
.\venv\Scripts\python.exe -m PyInstaller --clean agent_tray.spec

# 4b. O módulo do segredo entrou mesmo no executável?
Test-SegredoNoBuild -Aviso (Join-Path $PSScriptRoot "build\agent_tray\warn-agent_tray.txt")
Write-Host "Segredo conferido dentro do executável." -ForegroundColor Green

# 5. Pool do QR Ideal
#
# Os 24 MB de códigos NÃO estão no git — são o segredo mestre do controle de
# acesso, e quem tem o arquivo emite ingresso válido para qualquer evento. Ele
# vem de um caminho combinado fora do repositório (POOL_QR_IDEAL) ou da própria
# raiz do projeto, e vai ao lado do executável, não dentro dele: o agente é
# `onefile`, e dado embutido é extraído para pasta temporária a cada abertura.
#
# O build PARA se o arquivo não estiver lá. Um agente publicado sem pool instala
# normal, abre normal, e só quebra na hora de imprimir — provavelmente com a
# máquina já parada esperando o papel.
$poolTamanhoEsperado = 24000000
$poolOrigem = if ($env:POOL_QR_IDEAL) { $env:POOL_QR_IDEAL } else { Join-Path $PSScriptRoot "qr_ideal_pool.bin" }

if (-not (Test-Path $poolOrigem)) {
    Write-Host "`n[ERRO] Pool do QR Ideal nao encontrado em: $poolOrigem" -ForegroundColor Red
    Write-Host "       Gere com:" -ForegroundColor Yellow
    Write-Host "         python -m ferramentas.converter_pool `"Ideal Control/Ideal Control.xlsx`" qr_ideal_pool.bin" -ForegroundColor Yellow
    Write-Host "       Ou aponte a variavel POOL_QR_IDEAL para o arquivo." -ForegroundColor Yellow
    exit 1
}

$poolTamanho = (Get-Item $poolOrigem).Length
if ($poolTamanho -ne $poolTamanhoEsperado) {
    Write-Host "`n[ERRO] Pool do QR Ideal com $poolTamanho bytes; esperado $poolTamanhoEsperado." -ForegroundColor Red
    Write-Host "       Sao 3.000.000 de codigos de 8 bytes. Arquivo truncado ou de outra versao." -ForegroundColor Yellow
    exit 1
}

Copy-Item $poolOrigem (Join-Path $PSScriptRoot "dist\qr_ideal_pool.bin") -Force
Write-Host "Pool do QR Ideal copiado para dist/ ($poolTamanho bytes)." -ForegroundColor Green

# O segredo do agente NÃO é gerado aqui. Ele subiu para a seção 3b, ANTES da
# compilação: gerado neste ponto, o `acesso_segredo.py` só entrava no build
# SEGUINTE, e foi assim que todo agente saiu sem segredo até 15/08/2026.

Write-Host "`nSUCESSO! Binário compilado em dist/NewProd.exe" -ForegroundColor Green
