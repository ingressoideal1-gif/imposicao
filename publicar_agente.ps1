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

function Get-ChaveServico {
    <#
    .SYNOPSIS
        Le a SUPABASE_SERVICE_KEY do .env.local. Devolve $null se nao achar.
    #>
    param([Parameter(Mandatory)][string]$Raiz)
    $arquivo = Join-Path $Raiz ".env.local"
    if (-not (Test-Path $arquivo)) { return $null }
    foreach ($linha in (Get-Content -Encoding UTF8 $arquivo)) {
        if ($linha -match '^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+?)\s*$') {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Get-LimiteDoBucket {
    <#
    .SYNOPSIS
        Pergunta ao Supabase qual o limite de upload do agent-releases.
    .DESCRIPTION
        Perguntar em vez de fixar no codigo: este numero ja mudou uma vez
        (50 MB -> 200 MB em 2026-08-09) e um valor gravado a mao vira uma
        recusa falsa, ou pior, uma passagem indevida.

        Devolve 0 quando nao consegue consultar — o chamador entao usa um
        piso conservador em vez de deixar passar qualquer coisa.
    #>
    param(
        [Parameter(Mandatory)][string]$Projeto,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Chave
    )
    if ([string]::IsNullOrWhiteSpace($Chave)) { return 0 }

    # TRES TENTATIVAS, e nao uma.
    #
    # Esta consulta e barata (350 ms num dia normal) e roda DEPOIS de compilar o
    # executavel e gerar o MSI -- uns dois minutos de trabalho. Com uma tentativa
    # so, um piscar de rede fazia a funcao devolver 0, o chamador caia no piso
    # conservador de 50 MB e o release inteiro abortava com "o MSI tem 68 MB e o
    # teto do bucket e 50 MB" -- uma mensagem que manda mexer no painel do
    # Supabase quando o teto de la esta em 200 MB e nunca esteve errado.
    #
    # Aconteceu em 03/09/2026, num dia de conexao ruim, e o custo foi refazer o
    # build. O piso continua existindo para o caso de a consulta REALMENTE nao
    # responder: e melhor recusar do que subir algo que o bucket rejeitaria.
    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
        try {
            $b = Invoke-RestMethod -Uri "$Projeto/storage/v1/bucket/agent-releases" `
                                   -Headers @{ Authorization = "Bearer $Chave"; apikey = $Chave } `
                                   -TimeoutSec 30
            if ($b.file_size_limit) { return [int64]$b.file_size_limit }
            return 0
        } catch {
            if ($tentativa -lt 3) { Start-Sleep -Seconds 3 }
        }
    }
    return 0
}

function Test-ObjetoNoBucket {
    <#
    .SYNOPSIS
        O objeto ja esta no bucket? Pergunta pela URL PUBLICA, que e a que o
        agente usa. Serve para nunca reenviar por cima de um envio que chegou.
    #>
    param([Parameter(Mandatory)][string]$Url)
    try {
        $r = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 60
        return ([int]$r.StatusCode -eq 200)
    } catch {
        return $false
    }
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
# ANTES do PyInstaller, e nao depois: gerado depois, o arquivo so entraria no
# build SEGUINTE. Ate 15/08/2026 este script nem gerava -- ia direto para a
# compilacao --, e todo agente publicado saiu sem o segredo, imprimindo
# normalmente e nao publicando credencial nenhuma. O pedido 20508 saiu com 143
# ingressos que a portaria recusaria.
Write-Host "  Embutindo o segredo do agente..." -ForegroundColor Cyan
try {
    New-SegredoDoAgente -Raiz $raiz | Out-Null
    Write-Host "  Segredo embutido (acesso_segredo.py gerado)." -ForegroundColor Green
}
catch {
    Abortar "$($_.Exception.Message)"
}

Write-Host "  Compilando o executavel (leva alguns minutos)..." -ForegroundColor Cyan
& $python -m PyInstaller --clean --noconfirm agent_tray.spec
if ($LASTEXITCODE -ne 0) { Abortar "O PyInstaller falhou." }

# A trava que nao depende de ninguem lembrar: o PyInstaller registra os modulos
# que nao achou, e a linha "missing module named acesso_segredo" esteve la em
# TODOS os builds ate 15/08 sem que ninguem lesse o arquivo.
try {
    Test-SegredoNoBuild -Aviso "$raiz\build\agent_tray\warn-agent_tray.txt"
    Write-Host "  Segredo conferido dentro do executavel." -ForegroundColor Green
}
catch {
    Abortar "$($_.Exception.Message)"
}

Write-Host "  Gerando o MSI..." -ForegroundColor Cyan
& "$raiz\compilar_msi.ps1"
if ($LASTEXITCODE -ne 0) { Abortar "A geracao do MSI falhou." }

$msi = "$raiz\dist\NewProd_Setup_v$Versao.msi"
if (-not (Test-Path $msi)) { Abortar "Nao achei $msi depois de compilar." }

# ─── 5. Conferir o pacote ────────────────────────────────────────────────────
$tamanho = (Get-Item $msi).Length
$mb = [math]::Round($tamanho / 1MB, 2)
$projeto = (& $python -c "import security_config; print(security_config.SUPABASE_PROJETO)" | Select-Object -Last 1).Trim()
$limite = Get-LimiteDoBucket -Projeto $projeto -Chave (Get-ChaveServico -Raiz $raiz)
if ($limite -gt 0) {
    $limiteMb = [math]::Round($limite / 1MB, 0)
    $origem = "consultado no bucket"
} else {
    # Piso conservador: sem conseguir consultar, e melhor recusar cedo do que
    # descobrir o estouro depois do upload comecar.
    $limite = 50MB
    $limiteMb = 50
    $origem = "nao consegui consultar o bucket; usando o piso de 50 MB"
}

if ($tamanho -ge $limite) {
    Abortar "O MSI tem $mb MB e o teto do bucket agent-releases e $limiteMb MB." `
            "Suba o limite do bucket no painel do Supabase, ou enxugue o pacote. A analise de o que da para cortar (e o que NAO da) esta no GUIA_AGENTE.md."
}
Write-Host "  MSI: $mb MB (teto $limiteMb MB — $origem)" -ForegroundColor Green

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

$chave = Get-ChaveServico -Raiz $raiz
if (-not $chave) {
    Abortar "SUPABASE_SERVICE_KEY nao esta no .env.local." `
            "Pegue em Project Settings -> API no painel do Supabase. O .env.local e ignorado pelo git."
}

$nomeObjeto = "NewProd_Setup_v$Versao.msi"
$urlPublica = "$baseUrl$nomeObjeto"
$urlUpload  = $urlPublica -replace '/object/public/', '/object/'

# O ENVIO NAO PODE MORRER NO RELOGIO.
#
# Ate 03/09/2026 esta linha era um `Invoke-RestMethod -InFile`. Ele funciona
# enquanto a subida esta rapida, e para de funcionar exatamente quando ela nao
# esta: por baixo ele usa o `HttpWebRequest`, cujo `ReadWriteTimeout` e de 300
# segundos e NAO e exposto por parametro nenhum do cmdlet -- `-TimeoutSec` mexe
# em outro relogio. Num dia de subida a 0,1 MB/s, os 68 MB deste pacote levam
# uns onze minutos, e a conexao era cortada no meio com "A conexao subjacente
# estava fechada: Erro inesperado em um envio". Aconteceu duas vezes seguidas
# em 03/09/2026, e a mensagem nao diz que o problema e tempo -- parece rede
# caindo, e a tentacao e culpar o Supabase.
#
# O `HttpClient` resolve porque tem UM relogio, ajustavel, para a requisicao
# inteira. Uma hora e folga de sobra para 68 MB ate na pior subida ja vista
# aqui, e continua sendo um teto: envio travado nao fica pendurado para sempre.
#
# O arquivo vai como STREAM, e nao lido para a memoria: `[IO.File]::OpenRead`
# mais `StreamContent`. Ler 68 MB para um array de bytes funcionaria, mas e
# desperdicio numa maquina que esta compilando MSI ao mesmo tempo.
#
# E O ENVIO NAO PODE MORRER NA PRIMEIRA QUEDA DA REDE.
#
# Em 04/09/2026 a publicacao do 1.2.301 caiu TRES vezes seguidas, sempre com
# "Ocorreu um erro ao copiar o conteudo para um fluxo" -- que por dentro e
# "A conexao foi encerrada". Medido com o curl, o que acontece e a internet da
# grafica oscilando: a subida vai de 730 kB/s a 97 kB/s e a conexao e resetada
# no meio (uma vez aos 21 MB de 68). Nao e o Supabase, nao e cota e nao e o
# nome do objeto ja existir -- o MESMO arquivo subiu em 10 s numa janela boa,
# minutos antes.
#
# Contra uma rede que oscila, tentar de novo resolve: basta uma das tentativas
# pegar uma janela boa. Cada queda custava um build inteiro, porque o script
# abortava e a versao voltava atras.
#
# A retentativa e SEGURA porque, antes de cada nova tentativa, o script
# pergunta ao bucket se o objeto ficou la. Se ficou, ele PARA em vez de mandar
# de novo: reenviar por cima seria o unico jeito de o CDN passar a servir um
# binario que nao corresponde ao sha do manifesto.
Write-Host "  Enviando o MSI ($mb MB)..." -ForegroundColor Cyan
Add-Type -AssemblyName System.Net.Http

$TENTATIVAS = 5
$enviado = $false
$ultimoErro = ""

for ($tentativa = 1; $tentativa -le $TENTATIVAS -and -not $enviado; $tentativa++) {
    if ($tentativa -gt 1) {
        # O objeto ficou no bucket apesar do erro? Entao a tentativa anterior
        # chegou ao fim e o que se perdeu foi so' a resposta. Reenviar seria
        # sobrescrever.
        if (Test-ObjetoNoBucket -Url $urlPublica) {
            Write-Host "  O objeto ja esta no bucket: a tentativa anterior chegou ao fim." -ForegroundColor Green
            $enviado = $true
            break
        }
        $espera = 10 * ($tentativa - 1)
        Write-Host "  Tentativa $tentativa de $TENTATIVAS em $espera s (a anterior caiu: $ultimoErro)" -ForegroundColor Yellow
        Start-Sleep -Seconds $espera
    }

    $http = $null
    $conteudo = $null
    $fluxo = $null
    try {
        $http = [System.Net.Http.HttpClient]::new()
        $http.Timeout = [TimeSpan]::FromHours(1)
        $http.DefaultRequestHeaders.Authorization =
            [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $chave)

        $fluxo = [System.IO.File]::OpenRead($msi)
        $conteudo = [System.Net.Http.StreamContent]::new($fluxo)
        $conteudo.Headers.ContentType =
            [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')

        $resposta = $http.PostAsync($urlUpload, $conteudo).GetAwaiter().GetResult()
        if (-not $resposta.IsSuccessStatusCode) {
            $corpo = $resposta.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            # Resposta do servidor NAO se retenta: 401, 413 e "ja existe" nao
            # melhoram esperando, e insistir so' esconde o motivo real.
            Abortar "O envio do MSI falhou: $([int]$resposta.StatusCode) $($resposta.ReasonPhrase) - $corpo" `
                    "Se disser que o objeto ja existe, NAO sobrescreva — suba a versao. O CDN continuaria servindo o binario antigo."
        }
        $enviado = $true
    } catch {
        $ultimoErro = $_.Exception.Message
    } finally {
        if ($conteudo) { $conteudo.Dispose() }
        if ($fluxo)    { $fluxo.Dispose() }
        if ($http)     { $http.Dispose() }
    }
}

if (-not $enviado) {
    Abortar "O envio do MSI falhou nas $TENTATIVAS tentativas. Ultimo erro: $ultimoErro" `
            "A subida da internet caiu no meio das $mb MB todas as vezes. Espere a rede firmar e rode de novo com o MESMO numero — o objeto nao chegou ao bucket."
}

# ─── 7. Conferir baixando pela URL publica ───────────────────────────────────
# Pela URL SIMPLES, sem cache-buster: e a que o agente usa, e e ela que
# precisa bater. O nome nunca e reaproveitado justamente porque o Storage
# fica atras do CDN da Cloudflare — reusar o nome faria a borda servir o
# binario anterior, o sha256 nao bateria e TODAS as estacoes recusariam.
Write-Host "  Baixando de volta para conferir o sha256..." -ForegroundColor Cyan
$baixado = Join-Path $env:TEMP "conferencia_$nomeObjeto"
try {
    # `-TimeoutSec` alto pelo mesmo motivo do envio acima, com a diferenca de
    # que aqui uma falha custa o numero da versao: o MSI ja esta no bucket, e o
    # nome nunca se reaproveita.
    Invoke-WebRequest -Uri $urlPublica -OutFile $baixado -UseBasicParsing -TimeoutSec 3600
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

# A mensagem passa por Get-MensagemTag porque -Notas vazio fazia o git recusar a
# tag inteira. Ver a explicacao la, no VersaoAgente.psm1.
git tag -a "agente-v$Versao" -m (Get-MensagemTag -Versao $Versao -Notas $Notas)
$tagCriada = ($LASTEXITCODE -eq 0)

git push origin main
if ($tagCriada) {
    git push origin "agente-v$Versao"
    $tagCriada = ($LASTEXITCODE -eq 0)
}

# Aviso alto e no fim: o MSI ja esta no ar a esta altura, entao abortar nao
# desfaria nada — mas ficar sem o ponto de restauracao nao pode passar
# despercebido no meio do log do PyInstaller.
if (-not $tagCriada) {
    Write-Host ""
    Write-Host "  ATENCAO: a tag agente-v$Versao NAO foi criada ou nao subiu." -ForegroundColor Red
    Write-Host "  O agente $Versao esta publicado, mas sem ponto de restauracao." -ForegroundColor Red
    Write-Host "  Crie a mao:" -ForegroundColor Yellow
    Write-Host "    git tag -a agente-v$Versao -m ""Agente $Versao""" -ForegroundColor Yellow
    Write-Host "    git push origin agente-v$Versao" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Agente $Versao publicado." -ForegroundColor Green
Write-Host "  As estacoes checam a cada 30 min. Para forcar numa delas:" -ForegroundColor Gray
Write-Host "    menu da bandeja -> Atualizar agora" -ForegroundColor Gray
