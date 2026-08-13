<#
.SYNOPSIS
    Sobe o modelo de completar fundo (LaMa) ao bucket agent-releases.

.DESCRIPTION
    O botao "Ampliar a tela" do editor de fotos pode completar a moldura nova
    com IA. O modelo e o LaMa (advimman/lama, Apache-2.0), na conversao ONNX
    publicada pelo model zoo do OpenCV: 92 MB, entrada fixa 512x512.

    Ele precisa morar no NOSSO Storage pelas mesmas duas razoes do u2netp:

      1. O Hugging Face nao garante CORS nem disponibilidade para producao.
      2. A grafica nao pode depender de site de terceiro estar no ar para
         terminar um trabalho.

    O arquivo e versionado no NOME. Se um dia trocar de modelo, suba com OUTRO
    nome e aponte o editor-foto.js para ele - o Storage fica atras do CDN da
    Cloudflare, e reusar nome faz a borda servir o arquivo antigo.

    Mesmo desenho do subir_modelo_fundo.ps1: chave de servico lida do
    .env.local, envio por Invoke-RestMethod, conferencia baixando de volta pelo
    endereco publico e comparando o sha256.

.EXAMPLE
    .\ferramentas\subir_modelo_completar.ps1
    .\ferramentas\subir_modelo_completar.ps1 -Origem C:\baixados\lama.onnx
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
$fonte = "https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx"
if ([string]::IsNullOrWhiteSpace($Origem)) {
    $Origem = Join-Path $env:TEMP "lama-inpaint-512.onnx"
    if (-not (Test-Path $Origem)) {
        Write-Host "  Baixando o LaMa ONNX (Apache-2.0, 92 MB)..." -ForegroundColor Cyan
        $antes = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"   # a barra do IWR custa mais que o download
        Invoke-WebRequest -Uri $fonte -OutFile $Origem -UseBasicParsing
        $ProgressPreference = $antes
    }
}
if (-not (Test-Path $Origem)) { Abortar "Arquivo do modelo nao encontrado: $Origem" }

$bytes = (Get-Item $Origem).Length
$mb = [math]::Round($bytes / 1MB, 2)
if ($bytes -lt 50MB) {
    Abortar "O arquivo tem so $mb MB - o LaMa tem ~92 MB." `
            "Provavelmente o download trouxe uma pagina de erro. Apague $Origem e rode de novo."
}
$shaLocal = (Get-FileHash $Origem -Algorithm SHA256).Hash.ToLower()
Write-Host "  Modelo: $Origem ($mb MB)" -ForegroundColor Gray
Write-Host "  sha256: $shaLocal" -ForegroundColor Gray

# --- Envio -------------------------------------------------------------------
$nomeObjeto = "modelos/lama-inpaint-512.onnx"
$urlPublica = "$projeto/storage/v1/object/public/agent-releases/$nomeObjeto"
$urlUpload = "$projeto/storage/v1/object/agent-releases/$nomeObjeto"

Write-Host "  Enviando ao bucket agent-releases (pode demorar)..." -ForegroundColor Cyan
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
$baixado = Join-Path $env:TEMP "conferencia_lama.onnx"
$antes = $ProgressPreference
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri $urlPublica -OutFile $baixado -UseBasicParsing
$ProgressPreference = $antes
$shaRemoto = (Get-FileHash $baixado -Algorithm SHA256).Hash.ToLower()
Remove-Item $baixado -Force

if ($shaRemoto -ne $shaLocal) {
    Abortar "O sha256 do bucket ($shaRemoto) nao bate com o local." `
            "Nao aponte o editor para este objeto. Suba com outro nome."
}

Write-Host ""
Write-Host "  MODELO NO AR e conferido por sha256." -ForegroundColor Green
Write-Host "  $urlPublica" -ForegroundColor Green
Write-Host "  E este o endereco que o frontend/editor-foto.js usa em MODELO_COMPLETAR." -ForegroundColor Gray
