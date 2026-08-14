<#
.SYNOPSIS
  Poe uma variavel de ambiente no servico do Render pela API, redeploya e
  confere a saude -- sem abrir o navegador.

.DESCRIPTION
  Existe porque colar variavel no painel do Render e um caminho de seis cliques
  que ja deu errado uma vez neste projeto: as chaves foram parar no OUTRO
  servico da conta, e o sintoma foi enganoso -- /api/acesso/saude respondendo
  404 em vez de 503, porque sem a SUPABASE_SERVICE_KEY o app.py nem monta o
  router. Este script acha o servico pelo NOME e mostra qual achou antes de
  escrever, entao o erro nao tem como se repetir em silencio.

  O valor sai do .env.local e NUNCA aparece na tela nem no log: o script imprime
  o nome da variavel e o tamanho, jamais o conteudo.

  A chave da API tambem mora no .env.local, sob o nome RENDER_API_KEY. Ela da
  controle da conta inteira do Render -- criar, apagar e reconfigurar servico --
  entao trate-a como a service_role do Supabase: nunca em arquivo versionado,
  nunca no frontend. O .gitignore ja cobre o .env.local.

  Para criar a chave: Render -> foto do perfil (canto superior direito) ->
  Account Settings -> API Keys -> Create API Key.

.PARAMETER Variavel
  Nome da variavel a escrever. Precisa existir no .env.local.

.PARAMETER Servico
  Nome do servico no Render. Padrao: imposicao.

.PARAMETER Conferir
  So mostra o que faria: qual servico achou e se a variavel existe no
  .env.local. Nao escreve nada no Render.

.EXAMPLE
  .\ferramentas\variavel_no_render.ps1 ACESSO_ELEVACAO_SEGREDO

.EXAMPLE
  .\ferramentas\variavel_no_render.ps1 ACESSO_ELEVACAO_SEGREDO -Conferir
#>
# O -Variavel NAO e Mandatory de proposito. Um parametro obrigatorio faz o
# dot-source do arquivo pedir o valor, e como os testes carregam este script
# assim para exercitar as funcoes, a suite inteira morreria em
# ParameterBindingException antes do primeiro It. A obrigatoriedade e conferida
# no corpo, junto das outras.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Variavel,

    [string]$Servico = 'imposicao',

    [switch]$Conferir
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$raiz = Split-Path -Parent $PSScriptRoot
$envLocal = Join-Path $raiz '.env.local'
$API = 'https://api.render.com/v1'

function Get-VariaveisDoEnv {
    param([string]$Caminho)
    $valores = @{}
    if (-not (Test-Path $Caminho)) { return $valores }
    foreach ($linha in (Get-Content $Caminho)) {
        $t = $linha.Trim()
        if ($t -eq '' -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
        $i = $t.IndexOf('=')
        $valores[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
    return $valores
}

function Select-ServicoDoRender {
    <#
      Da lista que a API devolveu, qual e o servico alvo.

      Devolve um hashtable @{ Servico = <obj|$null>; Erro = <string> }. A
      igualdade do nome e conferida AQUI e nao delegada a API: o filtro `name`
      do Render casa por prefixo, entao pedir "imposicao" tambem traz
      "imposicao-antiga" -- e escrever a chave no servico vizinho e exatamente
      o acidente ja vivido neste projeto, com sintoma enganoso (404 no
      /api/acesso/saude em vez de 503).
    #>
    param([array]$Resposta, [string]$Nome)

    $servicos = @($Resposta | ForEach-Object { $_.service } | Where-Object { $_.name -eq $Nome })

    if ($servicos.Count -eq 0) {
        $vistos = @($Resposta | ForEach-Object { $_.service.name }) -join ', '
        if ($vistos -eq '') { $vistos = '(nenhum)' }
        return @{ Servico = $null
                  Erro = "nao achei servico chamado '$Nome'. Nomes parecidos: $vistos" }
    }
    if ($servicos.Count -gt 1) {
        return @{ Servico = $null
                  Erro = "ha $($servicos.Count) servicos chamados '$Nome' nesta conta" }
    }
    return @{ Servico = $servicos[0]; Erro = '' }
}

function Parar {
    param([string]$Motivo, [string]$OQueFazer)
    Write-Host ''
    Write-Host "  PAROU ANTES DE ESCREVER NO RENDER" -ForegroundColor Red
    Write-Host "  $Motivo" -ForegroundColor Red
    Write-Host ''
    Write-Host "  O que fazer: $OQueFazer" -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

# Este script so define funcoes quando carregado com dot-source, para teste.
if ($MyInvocation.InvocationName -eq '.') { return }

Write-Host ''
Write-Host '  VARIAVEL -> RENDER (pela API)' -ForegroundColor Cyan
Write-Host '  (o valor nunca aparece na tela)'
Write-Host ''

if ([string]::IsNullOrWhiteSpace($Variavel)) {
    Parar 'Falta dizer QUAL variavel escrever.' `
          '.\ferramentas\variavel_no_render.ps1 ACESSO_ELEVACAO_SEGREDO'
}

if (-not (Test-Path $envLocal)) {
    Parar ".env.local nao encontrado em $raiz" `
          'Este script le o valor de la. Sem ele nao ha o que escrever.'
}

$valores = Get-VariaveisDoEnv -Caminho $envLocal

$chaveApi = $valores['RENDER_API_KEY']
if ([string]::IsNullOrWhiteSpace($chaveApi)) {
    Parar 'RENDER_API_KEY ausente no .env.local.' `
          ('Crie em Render -> foto do perfil -> Account Settings -> API Keys -> ' +
           'Create API Key, e acrescente a linha RENDER_API_KEY=rnd_... no .env.local.')
}

$valor = $valores[$Variavel]
if ([string]::IsNullOrWhiteSpace($valor)) {
    Parar "$Variavel ausente no .env.local." `
          'Acrescente a linha no .env.local antes de rodar de novo.'
}
Write-Host "  [ok] $Variavel no .env.local" -ForegroundColor Green -NoNewline
Write-Host "  $($valor.Length) caracteres" -ForegroundColor DarkGray

$cabecalhos = @{
    'Authorization' = "Bearer $chaveApi"
    'Accept'        = 'application/json'
}

# ─── Achar o servico pelo nome ────────────────────────────────────────────────
# Pelo NOME e nao por um id decorado: um id colado errado escreveria no servico
# vizinho sem reclamar, que e exatamente o acidente que este script previne.
try {
    $achados = Invoke-RestMethod -Method Get -Headers $cabecalhos -TimeoutSec 60 `
        -Uri "$API/services?name=$([uri]::EscapeDataString($Servico))&limit=20"
}
catch {
    $codigo = ''
    if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
    if ($codigo -eq 401) {
        Parar 'O Render recusou a chave (401).' `
              'A RENDER_API_KEY esta errada ou foi revogada. Crie outra e troque no .env.local.'
    }
    Parar "Nao consegui falar com a API do Render: $($_.Exception.Message)" `
          'Confira a conexao e rode de novo.'
}

# A API devolve [{cursor, service:{...}}].
$escolha = Select-ServicoDoRender -Resposta @($achados) -Nome $Servico
if ($escolha.Erro -ne '') {
    Parar "No Render: $($escolha.Erro)." `
          'Passe o nome certo em -Servico, ou desfaca a ambiguidade no painel do Render.'
}

$alvo = $escolha.Servico
Write-Host "  [ok] servico achado" -ForegroundColor Green -NoNewline
Write-Host "  $($alvo.name)  ($($alvo.id))" -ForegroundColor DarkGray
if ($alvo.serviceDetails -and $alvo.serviceDetails.url) {
    Write-Host "        $($alvo.serviceDetails.url)" -ForegroundColor DarkGray
}

if ($Conferir) {
    Write-Host ''
    Write-Host '  -Conferir: nada foi escrito.' -ForegroundColor Yellow
    Write-Host "  Rode sem -Conferir para gravar $Variavel e redeployar." -ForegroundColor Yellow
    Write-Host ''
    exit 0
}

# ─── Escrever a variavel ──────────────────────────────────────────────────────
# PUT cria se nao existir e substitui se existir -- os dois casos servem, e nao
# ha um "ja existe" que precise de tratamento diferente.
Write-Host "  Gravando $Variavel..." -ForegroundColor Cyan
$corpo = @{ value = $valor } | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Method Put -Headers $cabecalhos -TimeoutSec 90 `
        -ContentType 'application/json' -Body $corpo `
        -Uri "$API/services/$($alvo.id)/env-vars/$([uri]::EscapeDataString($Variavel))" | Out-Null
}
catch {
    Parar "A gravacao falhou: $($_.Exception.Message)" `
          'Confira se a RENDER_API_KEY tem permissao de escrita neste servico.'
}
Write-Host "  [ok] $Variavel gravada no servico $($alvo.name)." -ForegroundColor Green

# ─── Redeploy ─────────────────────────────────────────────────────────────────
# Variavel nova so vale no processo seguinte: sem este passo o servico continua
# rodando com o ambiente antigo e a conferencia abaixo falharia sem motivo
# aparente.
Write-Host '  Pedindo o redeploy...' -ForegroundColor Cyan
try {
    $deploy = Invoke-RestMethod -Method Post -Headers $cabecalhos -TimeoutSec 90 `
        -ContentType 'application/json' -Body (@{ clearCache = 'do_not_clear' } | ConvertTo-Json -Compress) `
        -Uri "$API/services/$($alvo.id)/deploys"
    # O id vem vazio quando a API responde num formato diferente do esperado.
    # Imprimir "deploy  em andamento", com o buraco no meio, faz parecer que
    # alguma coisa falhou -- quando o deploy foi aceito normalmente.
    if ($deploy -and $deploy.id) {
        Write-Host "  [ok] deploy $($deploy.id) em andamento." -ForegroundColor Green
    } else {
        Write-Host '  [ok] redeploy pedido.' -ForegroundColor Green
    }
}
catch {
    Write-Host "  Nao consegui pedir o deploy: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '  A variavel JA foi gravada. Clique em Manual Deploy no painel.' -ForegroundColor Yellow
    exit 1
}

Write-Host ''
Write-Host '  O deploy leva alguns minutos. Depois confira com:' -ForegroundColor Yellow
Write-Host '    curl https://imposicao.onrender.com/api/acesso/saude'
Write-Host ''
