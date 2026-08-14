<#
.SYNOPSIS
  Confere as tres variaveis do controle de acesso e copia uma de cada vez para
  a area de transferencia, para colar no painel do Render.

.DESCRIPTION
  Existe por causa de uma armadilha ja vivida: ao copiar a SUPABASE_SERVICE_KEY
  do painel do Supabase com o mouse, um caractere sobrando no comeco ou um "="
  no fim fazem o Supabase responder "401 Invalid API key" -- e a chave PARECE
  perfeitamente certa, com role: service_role e validade em 2035. Aquilo custou
  meia hora de investigacao.

  Este script tira o mouse do caminho. Ele le o valor exato do .env.local,
  confere o formato, e poe na area de transferencia. O valor NUNCA aparece na
  tela: quem estiver olhando por cima do ombro (ou uma gravacao de tela) nao
  ve segredo nenhum.

.PARAMETER Conferir
  So confere e relata. Nao mexe na area de transferencia.

.EXAMPLE
  .\ferramentas\copiar_para_render.ps1
  .\ferramentas\copiar_para_render.ps1 -Conferir
#>
[CmdletBinding()]
param(
    [switch]$Conferir
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$envLocal = Join-Path $raiz '.env.local'

# As tres, na ordem em que o servidor precisa delas.
$VARIAVEIS = @(
    @{ Nome = 'SUPABASE_SERVICE_KEY'
       Sem  = 'o router /api/acesso/* nem e montado'
       Tipo = 'jwt' }
    @{ Nome = 'ACESSO_AGENTE_SEGREDO'
       Sem  = 'a faixa de codigos nunca chega a nuvem'
       Tipo = 'segredo' }
    @{ Nome = 'QR_PEDIDO_SEGREDO'
       Sem  = 'nao da para gerar o QR do evento'
       Tipo = 'segredo' }
)

function Read-EnvLocal {
    param([string]$Caminho)

    $valores = @{}
    if (-not (Test-Path $Caminho)) { return $valores }

    foreach ($linha in (Get-Content $Caminho)) {
        $t = $linha.Trim()
        if ($t -eq '' -or $t.StartsWith('#') -or -not $t.Contains('=')) { continue }
        $i = $t.IndexOf('=')
        $chave = $t.Substring(0, $i).Trim()
        $valor = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
        $valores[$chave] = $valor
    }
    return $valores
}

function Test-Segredo {
    <#
      Devolve a lista de problemas do valor. Lista vazia = passou.
      Recebe o valor e nunca o devolve -- so o diagnostico.
    #>
    param([string]$Valor, [string]$Tipo)

    $problemas = @()
    if ([string]::IsNullOrWhiteSpace($Valor)) {
        return @('ausente no .env.local')
    }
    if ($Valor -ne $Valor.Trim()) {
        $problemas += 'tem espaco no comeco ou no fim'
    }

    if ($Tipo -eq 'jwt') {
        $partes = $Valor.Split('.')
        if ($partes.Count -ne 3) {
            $problemas += "nao tem as 3 partes de um JWT (tem $($partes.Count))"
        }
        else {
            if (-not $partes[0].StartsWith('eyJ')) {
                # O cabecalho de todo JWT comeca por {" em base64, que da "eyJ".
                # Comecar diferente e o sintoma exato do caractere a mais colado
                # no inicio durante a copia.
                $problemas += 'nao comeca por "eyJ" -- provavel caractere sobrando no inicio'
            }
            $assinatura = $partes[2]
            if ($assinatura.EndsWith('=')) {
                $problemas += 'a assinatura termina em "=" -- sobrou enchimento na copia'
            }
            if ($assinatura.Length -ne 43) {
                # HMAC-SHA256 da 32 bytes, que em base64url sem enchimento sao
                # exatamente 43 caracteres. Qualquer outro numero e copia torta.
                $problemas += "a assinatura tem $($assinatura.Length) caracteres, deveria ter 43"
            }
        }
    }
    else {
        if ($Valor.Length -lt 24) {
            $problemas += "so $($Valor.Length) caracteres -- curto demais para um segredo"
        }
    }

    return $problemas
}

# Este script so define funcoes quando alguem o carrega com dot-source para
# testar. Rodado direto, segue para o corpo abaixo.
if ($MyInvocation.InvocationName -eq '.') { return }

Write-Host ''
Write-Host '  VARIAVEIS DO CONTROLE DE ACESSO -> RENDER' -ForegroundColor Cyan
Write-Host '  (o valor nunca aparece na tela)'
Write-Host ''

if (-not (Test-Path $envLocal)) {
    Write-Host "  .env.local nao encontrado em $raiz" -ForegroundColor Red
    exit 1
}

$valores = Read-EnvLocal -Caminho $envLocal
$reprovadas = 0

foreach ($v in $VARIAVEIS) {
    $valor = $valores[$v.Nome]
    $problemas = Test-Segredo -Valor $valor -Tipo $v.Tipo

    if ($problemas.Count -gt 0) {
        $reprovadas++
        Write-Host "  [X] $($v.Nome)" -ForegroundColor Red
        foreach ($p in $problemas) { Write-Host "      $p" -ForegroundColor Red }
        Write-Host "      sem ela: $($v.Sem)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  [ok] $($v.Nome)" -ForegroundColor Green -NoNewline
        Write-Host "  $($valor.Length) caracteres" -ForegroundColor DarkGray
    }
}

Write-Host ''

if ($reprovadas -gt 0) {
    Write-Host "  $reprovadas variavel(is) com problema. Conserte o .env.local antes de subir." -ForegroundColor Red
    exit 1
}

if ($Conferir) {
    Write-Host '  As tres passaram. Rode sem -Conferir para copiar uma a uma.' -ForegroundColor Green
    exit 0
}

Write-Host '  No Render: Dashboard -> ideal-imposition-api -> Environment.' -ForegroundColor Yellow
Write-Host '  Para cada uma: Add Environment Variable, cole o nome e o valor.'
Write-Host ''

foreach ($v in $VARIAVEIS) {
    Set-Clipboard -Value $valores[$v.Nome]
    Write-Host "  Na area de transferencia: " -NoNewline
    Write-Host $v.Nome -ForegroundColor Cyan
    Write-Host '  Cole no Render e tecle Enter aqui para a proxima...' -ForegroundColor DarkGray
    [void](Read-Host)
}

Set-Clipboard -Value ''
Write-Host ''
Write-Host '  Area de transferencia limpa.' -ForegroundColor DarkGray
Write-Host '  Agora clique em "Save, rebuild, and deploy" no Render.' -ForegroundColor Yellow
Write-Host '  Quando terminar, confira com:' -ForegroundColor Yellow
Write-Host '    curl https://imposicao.onrender.com/api/acesso/saude'
Write-Host ''
