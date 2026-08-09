<#
.SYNOPSIS
    Publica uma versao nova do NewProd Agent, do numero ao manifesto.

.DESCRIPTION
    Executa a lista inteira do GUIA_AGENTE.md, na ORDEM OBRIGATORIA:
    sobe o MSI -> confere o sha256 baixando pela URL publica -> so entao
    publica o latest.json. Assim o manifesto nunca aponta para um arquivo
    ausente ou corrompido. Invertida, essa ordem faz todas as estacoes
    recusarem a instalacao.

    VOLTAR A VERSAO: republicar o MSI antigo com o numero antigo NAO FAZ
    NADA. O agente so instala versao MAIOR que a dele, entao todas as
    estacoes ignoram em silencio — sem erro, sem mudanca, e com a impressao
    de que o release funcionou. Voltar e compilar o codigo antigo com um
    numero NOVO:

        .\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22

.EXAMPLE
    .\publicar_agente.ps1 1.2.23 -Notas "corrige a fonte no verso"

.EXAMPLE
    .\publicar_agente.ps1 1.2.23 -Simular
    Faz tudo menos enviar: escreve a versao, compila, confere tamanho e
    hash, e para antes do upload.

.PARAMETER Codigo
    Tag de onde trazer o codigo do agente. Use para voltar a versao.

.PARAMETER Simular
    Nao envia nada ao bucket, nao commita e nao cria tag.
#>
param(
    [Parameter(Mandatory = $true, Position = 0,
               HelpMessage = "Versao nova, ex: 1.2.23")]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Versao,

    [string]$Notas = "",
    [string]$Codigo = "",
    [switch]$Simular
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1"   -Force
Import-Module "$raiz\ferramentas\VersaoAgente.psm1" -Force

$python = "$raiz\venv\Scripts\python.exe"

# BYTES originais dos tres arquivos de versao, guardados antes de escrever.
#
# Sem este backup, um build que falha deixa o repositorio meio atualizado: a
# versao nova ja gravada e o MSI inexistente — e a proxima tentativa com o
# MESMO numero e recusada por "nao e maior que a atual", que e uma mensagem
# desnorteante para quem so quer tentar de novo.
#
# BYTES e nao texto: os tres arquivos nao concordam sobre BOM. O
# compilar_msi.ps1 precisa dele (o PowerShell 5.1 le .ps1 sem BOM na
# codepage ANSI e os acentos quebram o parser); o agent_version.py e o
# agent_installer.wxs nao tem, e acrescentar um mudaria a primeira linha dos
# dois — num XML, um BOM antes da declaracao ainda confunde certos parsers.
$script:Backup = @{}

function Test-TemBom {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    return ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and
            $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF)
}

function Restore-Versao {
    foreach ($caminho in $script:Backup.Keys) {
        [System.IO.File]::WriteAllBytes($caminho, $script:Backup[$caminho])
    }
    if ($script:Backup.Count -gt 0) {
        Write-Host "  Os arquivos de versao foram devolvidos ao estado anterior." -ForegroundColor Gray
        Write-Host "  Pode rodar de novo com o mesmo numero." -ForegroundColor Gray
        $script:Backup = @{}
    }
}

function Abortar {
    param([string]$Motivo, [string]$OQueFazer = "")
    Write-Host ""
    Write-Host "  PAROU: $Motivo" -ForegroundColor Red
    if ($OQueFazer) { Write-Host "  O que fazer: $OQueFazer" -ForegroundColor Yellow }
    Restore-Versao
    exit 1
}

# Rede embaixo da rede: o Abortar cobre as falhas previstas, este trap cobre
# as imprevistas. Sem ele, um erro terminante inesperado (um arquivo em uso,
# uma redirecao de fluxo em algum invocador) mata o script com a versao nova
# ja gravada nos arquivos e nenhum MSI para mostrar.
trap {
    Write-Host ""
    Write-Host "  ERRO INESPERADO: $($_.Exception.Message)" -ForegroundColor Red
    Restore-Versao
    exit 1
}

if ($Simular) {
    Write-Host "  MODO SIMULACAO — nada sera enviado, commitado ou marcado." -ForegroundColor Yellow
}

# ─── 1. A versao precisa ser maior ───────────────────────────────────────────
$atualTxt = Get-Content -Raw -Encoding UTF8 "$raiz\agent_version.py"
$mAtual = [regex]::Match($atualTxt, 'AGENT_VERSION\s*=\s*"([\d.]+)"')
if (-not $mAtual.Success) { Abortar "Nao consegui ler a versao atual de agent_version.py." }
$atual = $mAtual.Groups[1].Value

# Mesma comparacao que o agente usa em agent_version.como_tupla(): numerica,
# nao textual. Sem isso, 1.2.9 passaria por maior que 1.2.22.
if (-not (Test-VersaoMaior $Versao $atual)) {
    Abortar "A versao $Versao nao e maior que a atual ($atual)." `
            "O agente so instala versao MAIOR — as estacoes ignorariam este release em silencio. Escolha um numero acima de $atual."
}
Write-Host "  Versao atual: $atual  ->  nova: $Versao" -ForegroundColor Cyan

# ─── 2. Voltar versao: trazer o codigo de uma tag antiga ─────────────────────
if ($Codigo -ne "") {
    $sujo = @(git status --porcelain)
    if ($sujo.Count -gt 0) {
        Abortar "Ha trabalho nao commitado na pasta." `
                "Commite ou descarte antes de compilar a partir de outra tag."
    }
    $arquivosAgente = @(
        'agent_tray.py', 'agent_worker.py', 'agent_tray.spec',
        'app.py', 'db.py', 'engine.py', 'font_cache.py',
        'print_service.py', 'security_config.py', 'ppd_parser.py',
        'utils_generator.py'
    )
    Write-Host "  Trazendo o codigo do agente da tag $Codigo..." -ForegroundColor Cyan
    git checkout $Codigo -- $arquivosAgente
    if ($LASTEXITCODE -ne 0) {
        Abortar "Nao consegui trazer o codigo de '$Codigo'." `
                "Confira o nome com 'git tag -l'. Se algum arquivo ainda nao existia naquela versao, traga a mao."
    }
    Write-Host "  Codigo de $Codigo no lugar. Sera publicado como $Versao." -ForegroundColor Green
}

# ─── 3. Escrever a versao nos tres arquivos ──────────────────────────────────
Write-Host "  Escrevendo a versao nos tres arquivos..." -ForegroundColor Cyan
$alvos = @(
    @{ Arquivo = "agent_version.py";    Funcao = { param($t) Update-VersaoAgentPy  $t $Versao } },
    @{ Arquivo = "agent_installer.wxs"; Funcao = { param($t) Update-VersaoWxs      $t $Versao } },
    @{ Arquivo = "compilar_msi.ps1";    Funcao = { param($t) Update-VersaoCompilar $t $Versao } }
)
foreach ($alvo in $alvos) {
    $caminho = Join-Path $raiz $alvo.Arquivo
    $bytes = [System.IO.File]::ReadAllBytes($caminho)
    $script:Backup[$caminho] = $bytes          # para o Restore-Versao desfazer
    $temBom = Test-TemBom $bytes

    $texto = [System.IO.File]::ReadAllText($caminho)
    $novo = & $alvo.Funcao $texto
    # Grava com a MESMA presenca de BOM que o arquivo ja tinha. Forcar BOM
    # mudaria a primeira linha do .py e do .wxs sem necessidade; tira-lo do
    # .ps1 quebraria o parser do PowerShell 5.1 nos acentos.
    [System.IO.File]::WriteAllText($caminho, $novo, [System.Text.UTF8Encoding]::new($temBom))
    Write-Host "    $($alvo.Arquivo)" -ForegroundColor Gray
}

# ─── 4. Compilar ─────────────────────────────────────────────────────────────
# Sem `2>&1`: o PyInstaller escreve em stderr mesmo com sucesso e, no PS 5.1,
# a redirecao transforma cada linha em erro terminante, abortando o build.
Write-Host "  Compilando o executavel (leva alguns minutos)..." -ForegroundColor Cyan
& $python -m PyInstaller --clean --noconfirm agent_tray.spec
if ($LASTEXITCODE -ne 0) { Abortar "O PyInstaller falhou." }

Write-Host "  Gerando o MSI..." -ForegroundColor Cyan
& "$raiz\compilar_msi.ps1"
if ($LASTEXITCODE -ne 0) { Abortar "A geracao do MSI falhou." }

$msi = "$raiz\dist\NewProd_Setup_v$Versao.msi"
if (-not (Test-Path $msi)) { Abortar "Nao achei $msi depois de compilar." }

# ─── 5. Conferir o pacote ────────────────────────────────────────────────────
$tamanho = (Get-Item $msi).Length
$mb = [math]::Round($tamanho / 1MB, 2)
if ($tamanho -ge 50MB) {
    Abortar "O MSI tem $mb MB e o teto de upload do projeto e 50 MB." `
            "Enxugue o pacote (ppds ~5 MB, cryptography ~10 MB), suba o teto do plano, ou baixe em partes."
}
Write-Host "  MSI: $mb MB (teto 50 MB)" -ForegroundColor Green

$sha = (Get-FileHash -Algorithm SHA256 $msi).Hash.ToLower()
Write-Host "  sha256 local: $sha" -ForegroundColor Gray

if ($Simular) {
    Write-Host ""
    Write-Host "  SIMULACAO CONCLUIDA." -ForegroundColor Green
    Write-Host "  Nada foi enviado, commitado ou marcado." -ForegroundColor Green
    # Devolve os arquivos ao estado anterior: uma simulacao que deixa a
    # versao gravada nao e simulacao. O unico vestigio fica em dist/, que
    # o git ignora.
    Restore-Versao
    Write-Host "  O MSI gerado ficou em dist\NewProd_Setup_v$Versao.msi para conferencia." -ForegroundColor Gray
    exit 0
}

# Passou do ponto de simulacao: daqui para frente o release e real, e os
# arquivos de versao devem permanecer como estao.
$script:Backup = @{}

# ─── 6. Subir o MSI ──────────────────────────────────────────────────────────
# A URL vem de security_config.py de proposito: um literal duplicado aqui
# divergiria da constante compilada no binario do agente, e o agente baixa
# do endereco DELE, nao do nosso.
$baseUrl = (& $python -c "import security_config; print(security_config.RELEASES_BASE_URL)" | Select-Object -Last 1).Trim()
if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    Abortar "Nao consegui ler RELEASES_BASE_URL de security_config.py."
}

$chave = $null
foreach ($linha in (Get-Content -Encoding UTF8 "$raiz\.env.local")) {
    if ($linha -match '^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+?)\s*$') {
        $chave = $Matches[1].Trim().Trim('"').Trim("'")
    }
}
if (-not $chave) {
    Abortar "SUPABASE_SERVICE_KEY nao esta no .env.local." `
            "Pegue em Project Settings -> API no painel do Supabase. O .env.local e ignorado pelo git."
}

$nomeObjeto = "NewProd_Setup_v$Versao.msi"
$urlPublica = "$baseUrl$nomeObjeto"
$urlUpload  = $urlPublica -replace '/object/public/', '/object/'

Write-Host "  Enviando o MSI ($mb MB)..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri $urlUpload `
        -Headers @{ Authorization = "Bearer $chave"; "Content-Type" = "application/octet-stream" } `
        -InFile $msi | Out-Null
} catch {
    Abortar "O envio do MSI falhou: $($_.Exception.Message)" `
            "Se disser que o objeto ja existe, NAO sobrescreva — suba a versao. O CDN continuaria servindo o binario antigo."
}

# ─── 7. Conferir baixando pela URL publica ───────────────────────────────────
# Pela URL SIMPLES, sem cache-buster: e a que o agente usa, e e ela que
# precisa bater. O nome nunca e reaproveitado justamente porque o Storage
# fica atras do CDN da Cloudflare — reusar o nome faria a borda servir o
# binario anterior, o sha256 nao bateria e TODAS as estacoes recusariam.
Write-Host "  Baixando de volta para conferir o sha256..." -ForegroundColor Cyan
$baixado = Join-Path $env:TEMP "conferencia_$nomeObjeto"
try {
    Invoke-WebRequest -Uri $urlPublica -OutFile $baixado -UseBasicParsing
} catch {
    Abortar "Nao consegui baixar o MSI recem-enviado: $($_.Exception.Message)" `
            "NAO publique o manifesto. Ele apontaria para um arquivo inacessivel."
}
$shaRemoto = (Get-FileHash -Algorithm SHA256 $baixado).Hash.ToLower()
Remove-Item $baixado -Force -ErrorAction SilentlyContinue

if ($shaRemoto -ne $sha) {
    Abortar "O sha256 do arquivo no servidor nao bate com o local." `
            "NAO publique o manifesto. Suba a versao e refaca — nunca reaproveite o nome do arquivo."
}
Write-Host "  sha256 confere." -ForegroundColor Green

# ─── 8. So agora o manifesto ─────────────────────────────────────────────────
$manifesto = [ordered]@{
    version = $Versao
    url     = $urlPublica
    sha256  = $sha
    size    = $tamanho
    notes   = $Notas
} | ConvertTo-Json

# Parenteses explicitos: sem eles a precedencia entre + e -replace fica
# ambigua para quem le, mesmo que o PowerShell resolva a favor do +.
$urlManifesto = ($baseUrl + "latest.json") -replace '/object/public/', '/object/'
Write-Host "  Publicando o manifesto..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Method Post -Uri $urlManifesto `
        -Headers @{ Authorization = "Bearer $chave"
                    "Content-Type" = "application/json"
                    "x-upsert" = "true" } `
        -Body $manifesto | Out-Null
} catch {
    Abortar "O envio do manifesto falhou: $($_.Exception.Message)" `
            "O MSI ja esta no bucket e confere. Reenvie so o manifesto, ou publique latest.json a mao pelo painel."
}

# ─── 9. Registrar ────────────────────────────────────────────────────────────
git add agent_version.py agent_installer.wxs compilar_msi.ps1
git commit -m "chore(agente): versao $Versao"
git tag -a "agente-v$Versao" -m "$Notas"
git push origin main
git push origin "agente-v$Versao"

Write-Host ""
Write-Host "  Agente $Versao publicado." -ForegroundColor Green
Write-Host "  As estacoes checam a cada 30 min. Para forcar numa delas:" -ForegroundColor Gray
Write-Host "    menu da bandeja -> Atualizar agora" -ForegroundColor Gray
