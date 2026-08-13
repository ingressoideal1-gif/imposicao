<#
.SYNOPSIS
    Sobe o modelo de remocao de fundo (u2netp.onnx) ao bucket agent-releases.

.DESCRIPTION
    O editor de fotos separa a pessoa do fundo com um modelo de segmentacao
    leve que roda no navegador da estacao. O modelo precisa morar no NOSSO
    Storage porque:

      1. O asset de release do GitHub nao manda cabecalho CORS - o navegador
         recusa o download.
      2. A producao da grafica nao pode depender de GitHub nem de Hugging Face
         estarem no ar.

    O arquivo e estatico e versionado no NOME (u2netp.onnx). Se um dia trocar
    de modelo, suba com OUTRO nome e aponte o editor-foto.js para ele - o
    Storage fica atras do CDN da Cloudflare, e reusar nome faz a borda servir
    o arquivo antigo.

    Mesmo desenho do publicar_agente.ps1: chave de servico lida do .env.local,
    envio por Invoke-RestMethod, conferencia baixando de volta pelo endereco
    publico e comparando o sha256.

.EXAMPLE
    .\ferramentas\subir_modelo_fundo.ps1
    .\ferramentas\subir_modelo_fundo.ps1 -Origem C:\baixados\u2netp.onnx
#>
param(
    [string]$Origem = ""
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

function Abortar([string]$Motivo, [string]$OQueFazer = "") {
    Write-Host ""
    Write-Host "  ABORTADO: $Motivo" -ForegroundColor Red
    if ($OQueFazer) { Write-Host "  $OQueFazer" -ForegroundColor Yellow }
    exit 1
}

# --- Projeto e chave ---------------------------------------------------------
$secCfg = Get-Content (Join-Path $raiz "security_config.py") -Raw
if ($secCfg -notmatch 'SUPABASE_PROJETO = "([^"]+)"') {
    Abortar "Nao achei SUPABASE_PROJETO em security_config.py."
}
$projeto = $Matches[1]

$envLocal = Join-Path $raiz ".env.local"
if (-not (Test-Path $envLocal)) {
    Abortar ".env.local nao existe." "A chave de servico mora la; veja docs/PUBLICAR.md."
}
$chave = (Get-Content $envLocal | Where-Object { $_ -match '^SUPABASE_SERVICE_KEY=' }) -replace '^SUPABASE_SERVICE_KEY=', ''
if ([string]::IsNullOrWhiteSpace($chave)) {
    Abortar "SUPABASE_SERVICE_KEY nao esta no .env.local."
}

# --- O arquivo do modelo -----------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Origem)) {
    $Origem = Join-Path $env:TEMP "u2netp.onnx"
    if (-not (Test-Path $Origem)) {
        Write-Host "  Baixando o u2netp.onnx do release do rembg (Apache-2.0)..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx" `
            -OutFile $Origem -UseBasicParsing
    }
}
if (-not (Test-Path $Origem)) { Abortar "Arquivo do modelo nao encontrado: $Origem" }
$mb = [math]::Round((Get-Item $Origem).Length / 1MB, 2)
$shaLocal = (Get-FileHash $Origem -Algorithm SHA256).Hash.ToLower()
Write-Host "  Modelo: $Origem ($mb MB)" -ForegroundColor Gray
Write-Host "  sha256: $shaLocal" -ForegroundColor Gray

# --- Envio -------------------------------------------------------------------
$nomeObjeto = "modelos/u2netp.onnx"
$urlPublica = "$projeto/storage/v1/object/public/agent-releases/$nomeObjeto"
$urlUpload = "$projeto/storage/v1/object/agent-releases/$nomeObjeto"

Write-Host "  Enviando ao bucket agent-releases..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri $urlUpload `
        -Headers @{ Authorization = "Bearer $chave"; "Content-Type" = "application/octet-stream" } `
        -InFile $Origem | Out-Null
} catch {
    $msg = $_.Exception.Message
    if ($msg -match "Duplicate|already exists|409") {
        Write-Host "  O objeto ja existe no bucket - conferindo se e o mesmo..." -ForegroundColor Yellow
    } else {
        Abortar "O envio falhou: $msg"
    }
}

# --- Conferencia pelo endereco publico (o que o navegador vai usar) ----------
$baixado = Join-Path $env:TEMP "conferencia_u2netp.onnx"
Invoke-WebRequest -Uri $urlPublica -OutFile $baixado -UseBasicParsing
$shaRemoto = (Get-FileHash $baixado -Algorithm SHA256).Hash.ToLower()
Remove-Item $baixado -Force

if ($shaRemoto -ne $shaLocal) {
    Abortar "O sha256 do bucket ($shaRemoto) nao bate com o local." `
            "Nao aponte o editor para este objeto. Suba com outro nome."
}

Write-Host ""
Write-Host "  MODELO NO AR e conferido por sha256." -ForegroundColor Green
Write-Host "  $urlPublica" -ForegroundColor Green
Write-Host "  E este o endereco que o frontend/editor-foto.js usa em MODELO_URL." -ForegroundColor Gray
