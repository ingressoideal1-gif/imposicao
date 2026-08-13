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

# 4. Executar o PyInstaller usando a especificação existente
Write-Host "Compilando executável com PyInstaller..." -ForegroundColor Green
.\venv\Scripts\python.exe -m PyInstaller --clean agent_tray.spec

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

# ── Segredo do agente para publicar a faixa de acesso ────────────────────────
#
# Diferente do pool, este vai DENTRO do executavel: e um segredo curto, e nao
# ha por que deixa-lo num arquivo solto ao lado, legivel por qualquer um que
# abra a pasta. O acesso_segredo.py e gerado aqui, empacotado pelo PyInstaller,
# e o git o ignora -- ele nunca existe no repositorio.
#
# O build PARA sem ele, pela mesma razao do pool: um agente publicado sem
# segredo imprime normalmente e nao publica faixa nenhuma. Ninguem percebe ate
# a portaria do evento, quando nao ha o que conferir.
#
# Ele NAO e a service_role: so autoriza publicar faixa de codigos, e nada mais.
$segredoAcesso = $env:ACESSO_AGENTE_SEGREDO
if (-not $segredoAcesso) {
    $envLocal = Join-Path $PSScriptRoot ".env.local"
    if (Test-Path $envLocal) {
        $linha = Get-Content $envLocal | Where-Object { $_ -match '^\s*ACESSO_AGENTE_SEGREDO\s*=' } | Select-Object -First 1
        if ($linha) { $segredoAcesso = ($linha -split '=', 2)[1].Trim().Trim('"').Trim("'") }
    }
}
if (-not $segredoAcesso) {
    Write-Host "`n[ERRO] ACESSO_AGENTE_SEGREDO nao encontrado." -ForegroundColor Red
    Write-Host "       Sem ele o agente imprime normalmente mas NAO publica a faixa de" -ForegroundColor Yellow
    Write-Host "       codigos, e a portaria do evento fica sem o que conferir." -ForegroundColor Yellow
    Write-Host "       Ponha a linha no .env.local (o mesmo valor configurado no Render):" -ForegroundColor Yellow
    Write-Host "         ACESSO_AGENTE_SEGREDO=<valor>" -ForegroundColor Yellow
    exit 1
}
$segredoEscapado = $segredoAcesso.Replace('\', '\\').Replace('"', '\"')
@"
# -*- coding: utf-8 -*-
# GERADO PELO build_agent.ps1. Nao edite, nao versione.
# O .gitignore cobre este arquivo: ele e o segredo que autoriza a estacao a
# publicar a faixa de codigos do QR Ideal no backend da nuvem.
SEGREDO = "$segredoEscapado"
"@ | Out-File -FilePath (Join-Path $PSScriptRoot "acesso_segredo.py") -Encoding utf8
Write-Host "Segredo do agente embutido (acesso_segredo.py gerado)." -ForegroundColor Green

Write-Host "`nSUCESSO! Binário compilado em dist/NewProd.exe" -ForegroundColor Green
