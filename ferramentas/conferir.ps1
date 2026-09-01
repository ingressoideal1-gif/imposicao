<#
.SYNOPSIS
    Conferencia de saude do projeto: o que esta fora do lugar agora.

.DESCRIPTION
    So consulta — nao altera nada, nao publica nada, nao commita nada. Pode
    rodar a qualquer momento, quantas vezes quiser.

    Existe para que a vigilancia nao dependa de alguem lembrar os comandos
    certos. Oito perguntas, sempre as mesmas:

      1. Ha commits feitos que ainda nao foram publicados?
      2. Ha trabalho pendente na pasta?
      3. O agente esta em sincronia (repositorio, manifesto, esta maquina)?
      4. Ha branch ou rascunho acumulando?
      5. Ha algum segredo em arquivo versionado?
      6. Os testes passam?
      7. A CLI do Supabase esta ligada ao projeto certo?
      8. O link do cliente abre para quem nao tem sessao?

.EXAMPLE
    .\ferramentas\conferir.ps1
#>
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1" -Force

$alertas = @()
function Alerta { param([string]$Texto) $script:alertas += $Texto }

function Titulo {
    param([string]$Texto)
    Write-Host ""
    Write-Host "  $Texto" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  CONFERENCIA DO IDEAL IMPOSITION" -ForegroundColor White
Write-Host "  (so consulta — nada e alterado)" -ForegroundColor DarkGray

# ─── 1. Commits nao publicados ───────────────────────────────────────────────
Titulo "1. Commits feitos que ainda nao foram publicados"
$pendentes = @()
git rev-parse --verify --quiet refs/remotes/origin/main | Out-Null
if ($LASTEXITCODE -eq 0) { $pendentes = @(git log --oneline 'origin/main..HEAD') }
if ($pendentes.Count -eq 0) {
    Write-Host "     nenhum — o que esta commitado esta no ar" -ForegroundColor Green
} else {
    $pendentes | ForEach-Object { Write-Host "     $_" -ForegroundColor Yellow }
    Alerta "$($pendentes.Count) commit(s) esperando publicacao. Rode: .\publicar.ps1 ""mensagem"""
}

# ─── 2. Trabalho pendente ────────────────────────────────────────────────────
Titulo "2. Trabalho pendente na pasta"
$sujo = @(git status --porcelain)
if ($sujo.Count -eq 0) {
    Write-Host "     arvore limpa" -ForegroundColor Green
} else {
    $sujo | Select-Object -First 12 | ForEach-Object { Write-Host "     $_" -ForegroundColor Yellow }
    if ($sujo.Count -gt 12) { Write-Host "     ... e mais $($sujo.Count - 12)" -ForegroundColor Yellow }
    Alerta "$($sujo.Count) arquivo(s) modificados e ainda nao commitados."
}

# ─── 3. Agente ───────────────────────────────────────────────────────────────
Titulo "3. Agente NewProd"
$repo = ''
$m = [regex]::Match((Get-Content -Raw -Encoding UTF8 "$raiz\agent_version.py"), 'AGENT_VERSION\s*=\s*"([\d.]+)"')
if ($m.Success) { $repo = $m.Groups[1].Value }

$manifesto = ''
try {
    $url = (& "$raiz\venv\Scripts\python.exe" -c "import security_config; print(security_config.MANIFEST_URL)" |
            Select-Object -Last 1).Trim()
    # Cache-buster: o Storage fica atras do CDN e serviria o manifesto antigo.
    $carimbo = [int][double]::Parse((Get-Date -UFormat %s))
    $manifesto = (Invoke-RestMethod -Uri "$url`?t=$carimbo" -TimeoutSec 30).version
} catch { $manifesto = '(nao consegui consultar)' }

$maquina = ''
try { $maquina = (Invoke-RestMethod -Uri "http://127.0.0.1:9000/api/status" -TimeoutSec 5).version }
catch { $maquina = '(nao esta rodando aqui)' }

Write-Host "     repositorio  : $repo"
Write-Host "     publicado    : $manifesto"
Write-Host "     esta maquina : $maquina"
if ($repo -and $manifesto -eq $repo) {
    Write-Host "     em sincronia" -ForegroundColor Green
} elseif ($manifesto -notlike '(*') {
    Write-Host "     DIVERGEM" -ForegroundColor Yellow
    Alerta "Agente: repositorio esta em $repo e o publicado em $manifesto. Ver GUIA_AGENTE.md."
}

# As TRES linhas acima respondem "esta maquina esta em dia?". A pergunta que
# importa e outra: as ONZE estacoes da grafica estao? Elas se atualizam cada uma
# no seu ritmo, e ate 16/08/2026 nada aqui as enxergava — descobrir que duas
# rodavam agente de agosto exigia consultar o banco a mao.
#
# O `estacoes.py` so consulta, e imprime as linhas ja formatadas. As que
# comecam com ALERTA: viram ponto de atencao aqui.
Write-Host ""
Write-Host "     Estacoes da grafica (versao / painel / ultimo sinal)" -ForegroundColor DarkGray
$linhas = @()
try {
    $linhas = @(& "$raiz\venv\Scripts\python.exe" "$raiz\ferramentas\estacoes.py" 2>&1)
} catch {
    $linhas = @("     (nao consegui consultar as estacoes)")
}
foreach ($linha in $linhas) {
    $texto = [string]$linha
    if ($texto -like 'ALERTA:*') {
        Alerta ($texto -replace '^ALERTA:\s*', '')
    } elseif ($texto -like '`[db.py`]*') {
        # O db.py anuncia a conexao ao ser importado; nao e resultado.
    } elseif ($texto -match 'sem sinal') {
        Write-Host $texto -ForegroundColor DarkGray
    } else {
        Write-Host $texto
    }
}

# ─── 4. Branches e rascunhos ─────────────────────────────────────────────────
Titulo "4. Branches e arquivos na raiz"
$branches = @(git branch -a --format='%(refname:short)' | Where-Object { $_ -notmatch 'HEAD' })
$naRaiz = @(git ls-files | Where-Object { $_ -notmatch '/' })
$rascunhos = @($naRaiz | Where-Object { Test-ArquivoDeRascunho $_ })
Write-Host "     branches                    : $($branches.Count)"
Write-Host "     arquivos versionados na raiz: $($naRaiz.Count)"
if ($rascunhos.Count -eq 0) {
    Write-Host "     nenhum rascunho versionado" -ForegroundColor Green
} else {
    $rascunhos | ForEach-Object { Write-Host "     rascunho: $_" -ForegroundColor Yellow }
    Alerta "$($rascunhos.Count) rascunho(s) versionados na raiz. Mova para rascunhos/."
}

# ─── 5. Segredos ─────────────────────────────────────────────────────────────
Titulo "5. Segredo em arquivo versionado"
$achados = @()
foreach ($arquivo in (git ls-files)) {
    if (-not (Test-Path -PathType Leaf $arquivo)) { continue }
    if ((Get-Item $arquivo).Length -gt 3MB) { continue }
    $conteudo = Get-Content -Raw -Encoding UTF8 -ErrorAction SilentlyContinue $arquivo
    if (-not $conteudo) { continue }
    $r = Find-SegredoNoTexto $conteudo
    if ($r -ne '') { $achados += "$arquivo -> $r" }
}
if ($achados.Count -eq 0) {
    Write-Host "     nenhum" -ForegroundColor Green
} else {
    $achados | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
    Alerta "SEGREDO EM ARQUIVO VERSIONADO. Tire a chave e ponha no .env.local."
}

# ─── 6. Testes ───────────────────────────────────────────────────────────────
Titulo "6. Testes dos scripts de publicacao"
$t = Invoke-Pester -Path "$raiz\tests" -Quiet -PassThru
if ($t.FailedCount -eq 0) {
    Write-Host "     $($t.PassedCount) passando" -ForegroundColor Green
} else {
    Write-Host "     $($t.FailedCount) falhando de $($t.TotalCount)" -ForegroundColor Red
    $t.TestResult | Where-Object { -not $_.Passed } | ForEach-Object {
        Write-Host "     $($_.Name)" -ForegroundColor Red
    }
    Alerta "$($t.FailedCount) teste(s) falhando. Rode: Invoke-Pester -Path tests"
}

# ─── 7. Projeto Supabase ─────────────────────────────────────────────────────
# A conta tem projetos chamados "Ideal Imposicao" e "Ideal Control" que NAO sao
# os desta aplicacao — sao restos de tentativas antigas. O que roda a grafica se
# chama "e-deal". Escolher pelo nome no painel erra o projeto, e uma Edge
# Function publicada no lugar errado falha calada.
Titulo "7. Projeto Supabase ligado"
$refEsperado = ''
$sc = Get-Content -Raw -Encoding UTF8 -ErrorAction SilentlyContinue "$raiz\security_config.py"
if ($sc -and $sc -match 'https://([a-z0-9]+)\.supabase\.co') { $refEsperado = $Matches[1] }

$arquivoRef = "$raiz\supabase\.temp\project-ref"
$refLigado = ''
if (Test-Path -PathType Leaf $arquivoRef) {
    $refLigado = (Get-Content -Raw -Encoding UTF8 $arquivoRef)
}

if (-not (Test-Path "$raiz\supabase")) {
    Write-Host "     sem pasta supabase/ — a migracao ainda nao comecou aqui" -ForegroundColor Gray
} else {
    $problema = Find-ProjetoSupabaseErrado -RefEsperado $refEsperado -RefLigado $refLigado
    if ($problema -eq '') {
        Write-Host "     ligado a $refEsperado (o mesmo do security_config.py)" -ForegroundColor Green
    } else {
        Write-Host "     $problema" -ForegroundColor Red
        Alerta "Projeto Supabase: $problema"
    }
}

# ─── 8. O link do cliente abre para quem nao tem sessao? ─────────────────
#
# POR QUE ESTA PERGUNTA EXISTE
#
# Em 01/09/2026 o Portal do Pedido parou de abrir no celular dos clientes, e
# continuou abrindo no computador da grafica. A diferenca nao era o aparelho: no
# computador o navegador ja tem sessao do painel, entao a chamada sai como
# `authenticated`; no celular do cliente nao ha sessao nenhuma, e ela sai como
# `anon`. As quatro funcoes do link tinham perdido o EXECUTE para `anon` --
# levadas junto por uma faxina de privilegios do lado do ERP parceiro, que fechou
# um lote de funcoes internas dele.
#
# Nada aqui teria pego isso: o site estava no ar, o agente em dia, os testes
# passando, e a tela do cliente dizia "link invalido ou expirado" -- que e como o
# `cliente.js` traduz a recusa do banco. Fica esta pergunta para que a proxima vez
# apareca aqui, e nao pela reclamacao de um cliente.
#
# A conferencia usa um numero de pedido que nao existe, de proposito: com token
# invalido as funcoes nao leem, nao escrevem e nao contam acesso nenhum. O que se
# mede e so o direito de chamar -- HTTP 200 (chamou e nao achou) contra HTTP 401
# (nem pode chamar).
Titulo "8. Link do cliente (sem sessao, como o celular do cliente)"

$anonUrl = ''
$anonKey = ''
$cfg = Get-Content -Raw -Encoding UTF8 -ErrorAction SilentlyContinue "$raiz\frontend\supabase-config.js"
if ($cfg -match 'VIBECODE_SUPABASE_URL\s*=\s*"([^"]+)"') { $anonUrl = $Matches[1] }
if ($cfg -match 'VIBECODE_ANON_KEY\s*=\s*"([^"]+)"')     { $anonKey = $Matches[1] }

if (-not $anonUrl -or -not $anonKey) {
    Write-Host "     nao achei a chave publica em frontend/supabase-config.js" -ForegroundColor Gray
} else {
    $funcoesDoLink = [ordered]@{
        'link_cliente_abrir'  = @{ p_numero = '0'; p_token = 'conferencia' }
        'link_cliente_pedido' = @{ p_numero = '0'; p_token = 'conferencia' }
        'link_cliente_visto'  = @{ p_numero = '0'; p_token = 'conferencia' }
        'link_cliente_status' = @{ p_numero = '0'; p_token = 'conferencia'; p_status = 'APROVADO' }
    }
    # SEM RESPOSTA NAO E "FECHADA".
    #
    # A distincao e o que faz esta pergunta valer alguma coisa: um alarme que
    # dispara quando a internet oscila ensina o usuario a ignorar o alarme. Por
    # isso HTTP 401/403 (o banco respondeu "voce nao pode") vira alerta, e a
    # falta de resposta vira so um aviso cinza -- ninguem foi acusado de nada.
    $fechadas = @()
    $semResposta = @()
    foreach ($nomeDaFuncao in @($funcoesDoLink.Keys)) {
        $corpo = $funcoesDoLink[$nomeDaFuncao] | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($corpo)
        $codigo = 0
        # Duas tentativas: rede oscila mais vezes do que privilegio some, e
        # privilegio nao volta sozinho entre uma tentativa e a outra.
        foreach ($tentativa in 1..2) {
            try {
                $resp = Invoke-WebRequest -Method Post -Uri "$anonUrl/rest/v1/rpc/$nomeDaFuncao" `
                    -Body $bytes -ContentType 'application/json; charset=utf-8' `
                    -Headers @{ apikey = $anonKey; Authorization = "Bearer $anonKey" } `
                    -UseBasicParsing -TimeoutSec 20
                $codigo = [int]$resp.StatusCode
            } catch {
                $codigo = 0
                if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
            }
            if ($codigo -ne 0) { break }
        }

        if ($codigo -eq 200) { continue }
        if ($codigo -eq 0)   { $semResposta += $nomeDaFuncao; continue }
        $fechadas += "$nomeDaFuncao (HTTP $codigo)"
    }

    if ($fechadas.Count -gt 0) {
        foreach ($f in $fechadas) { Write-Host "     FECHADA: $f" -ForegroundColor Red }
        Write-Host "     o cliente ve 'link invalido ou expirado' no celular" -ForegroundColor Red
        Alerta "Link do cliente fechado a chave publica. Rode: .\ferramentas\rodar_sql.ps1 sql\link_cliente_devolver_o_anon.sql"
    } elseif ($semResposta.Count -gt 0) {
        Write-Host "     sem resposta do banco agora — nao deu para conferir" -ForegroundColor Gray
        Write-Host "     ($($semResposta -join ', '))" -ForegroundColor DarkGray
    } else {
        Write-Host "     as 4 funcoes do link abrem para a chave publica" -ForegroundColor Green
    }
}

# ─── Resumo ──────────────────────────────────────────────────────────────────
Write-Host ""
if ($alertas.Count -eq 0) {
    Write-Host "  TUDO EM ORDEM." -ForegroundColor Green
} else {
    Write-Host "  $($alertas.Count) PONTO(S) DE ATENCAO:" -ForegroundColor Yellow
    foreach ($a in $alertas) { Write-Host "   - $a" -ForegroundColor Yellow }
}
Write-Host ""
