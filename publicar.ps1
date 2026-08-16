<#
.SYNOPSIS
    Publica o site e o motor: confere, sobe a versao dos assets, commita,
    empurra, faz o deploy na Vercel e marca a versao com uma tag.

.DESCRIPTION
    IMPORTANTE: um `git push origin main` publica DUAS coisas — o site na
    Vercel e o motor no Render, que escuta o mesmo repositorio. Nao existe
    publicar so o site por aqui.

    Antes de escrever qualquer coisa, roda quatro conferencias. Se alguma
    falhar, o script para ANTES do commit: nada foi ao ar e nada precisa
    ser desfeito.

    Ao terminar, grava a tag vNNN — o ponto de restauracao que o voltar.ps1
    usa como alvo.

.EXAMPLE
    .\publicar.ps1 "fix(painel): corrigir ordenacao da fila"

.PARAMETER SemFreio
    Pula as conferencias. So para emergencia — imprime aviso.

.PARAMETER Sim
    Responde "s" a pergunta final, sem pular conferencia nenhuma. Existe para
    quem roda o script de um terminal sem teclado — um agente, uma automacao —
    onde o Read-Host falha com "modo NonInteractive" DEPOIS de as conferencias
    ja terem passado. Sem este parametro, a unica saida seria o -SemFreio, que
    e justamente o que nao se deve usar: ele pularia os freios para resolver um
    problema que nao tem nada a ver com eles.
#>
param(
    [Parameter(Mandatory = $true, Position = 0,
               HelpMessage = "Mensagem do commit, ex: 'fix(painel): corrigir ordenacao da fila'")]
    [ValidateNotNullOrEmpty()]
    [string]$Mensagem,

    [switch]$SemFreio,

    [switch]$Sim
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1" -Force

function Abortar {
    param([string]$Motivo, [string]$OQueFazer)
    Write-Host ""
    Write-Host "  PAROU ANTES DE PUBLICAR" -ForegroundColor Red
    Write-Host "  $Motivo" -ForegroundColor Red
    Write-Host ""
    Write-Host "  O que fazer: $OQueFazer" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Nada foi ao ar. Nada precisa ser desfeito." -ForegroundColor Gray
    exit 1
}

# ─── Freios ──────────────────────────────────────────────────────────────────
if ($SemFreio) {
    Write-Host "  AVISO: publicando SEM as conferencias (-SemFreio)." -ForegroundColor Yellow
} else {
    Write-Host "Conferindo antes de publicar..." -ForegroundColor Cyan

    # 1. O que vai junto.
    #
    # Duas fontes, e as duas contam: arquivos ainda nao commitados, E commits
    # que ainda nao foram enviados ao GitHub. Olhar so a primeira faria o
    # script dizer "nada para publicar" no caso mais comum de todos —
    # commitei ontem, publico hoje.
    $mudados = @(git status --porcelain | ForEach-Object { $_.Substring(3).Trim('"') })

    $pendentes = @()
    git rev-parse --verify --quiet refs/remotes/origin/main | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $pendentes = @(git log --oneline 'origin/main..HEAD')
    }

    if ($mudados.Count -eq 0 -and $pendentes.Count -eq 0) {
        Abortar "Nao ha nada para publicar — nenhum arquivo mudou e nao ha commit pendente." `
                "Edite alguma coisa antes de rodar o publicar."
    }

    if ($pendentes.Count -gt 0) {
        Write-Host "  $($pendentes.Count) commit(s) ja feitos que ainda nao foram publicados:" -ForegroundColor Gray
        foreach ($c in $pendentes) { Write-Host "    $c" -ForegroundColor Gray }
    }

    if ($mudados.Count -gt 0) {
        Write-Host "  $($mudados.Count) arquivo(s) modificados vao junto:" -ForegroundColor Gray
        foreach ($f in $mudados) {
            $aviso = ''
            if (Test-Path -PathType Leaf $f) {
                $mb = (Get-Item $f).Length / 1MB
                if ($mb -gt 1) { $aviso = (" [{0:N1} MB — confira se e proposital]" -f $mb) }
            }
            Write-Host "    $f$aviso" -ForegroundColor Gray
        }
    }

    # 2. Rascunho.
    $rascunhos = @($mudados | Where-Object { Test-ArquivoDeRascunho $_ })
    if ($rascunhos.Count -gt 0) {
        Abortar "Arquivo de rascunho no commit: $($rascunhos -join ', ')" `
                "Mova para rascunhos/ ou, se for codigo de verdade, renomeie."
    }

    # 3. Segredo. So o conteudo que vai ao ar — arquivo apagado nao tem o
    #    que ler, e caminho de rename ('old -> new') nao existe no disco.
    foreach ($f in $mudados) {
        if (-not (Test-Path -PathType Leaf $f)) { continue }
        $conteudo = Get-Content -Raw -Encoding UTF8 -ErrorAction SilentlyContinue $f
        if ($null -eq $conteudo) { continue }
        $achado = Find-SegredoNoTexto $conteudo
        if ($achado -ne '') {
            Abortar "Segredo em '$f': $achado" `
                    "Tire a chave do arquivo e ponha no .env.local, que o git ignora."
        }
    }

    # 4. O motor sobe? Pega erro de sintaxe antes de o Render falhar a build
    #    — hoje isso passa direto e o motor fica para tras em silencio.
    Write-Host "  Conferindo se o motor sobe..." -ForegroundColor Gray
    & "$raiz\venv\Scripts\python.exe" -c "import app, engine, db" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Abortar "O motor nao sobe — ha erro em app.py, engine.py ou db.py." `
                "Rode: .\venv\Scripts\python.exe -c ""import app, engine, db"" para ver o erro."
    }
    Write-Host "  Motor OK." -ForegroundColor Green
}

# ─── Versao ──────────────────────────────────────────────────────────────────
$indexFile = "frontend\index.html"
$proxima = Get-ProximaVersao (Get-Content -Raw -Encoding UTF8 $indexFile)
if ($proxima -eq 0) {
    Abortar "Nao achei 'script.js?v=NNN' em $indexFile." "Confira se o index.html esta intacto."
}

# ─── Confirmacao ─────────────────────────────────────────────────────────────
if (-not $SemFreio) {
    Write-Host ""
    Write-Host "  Mensagem : $Mensagem" -ForegroundColor White
    Write-Host "  Versao   : v$proxima" -ForegroundColor White
    Write-Host "  Publica  : o SITE (Vercel) e o MOTOR (Render) — os dois, juntos." -ForegroundColor Yellow
    Write-Host ""
    if ($Sim) {
        # As conferencias acima JA rodaram e passaram: o -Sim responde a
        # pergunta, nao dispensa nenhum freio.
        Write-Host "  Publicar? (s/n) s   [confirmado por -Sim]" -ForegroundColor Gray
    }
    else {
        $resp = Read-Host "  Publicar? (s/n)"
        if ($resp -notmatch '^[sS]') {
            Write-Host "  Cancelado. Nada foi ao ar." -ForegroundColor Gray
            exit 0
        }
    }
}

# ─── Edge Functions ──────────────────────────────────────────────────────────
# Um `git push` publica o site E o motor, porque o Render escuta o mesmo
# repositorio. As Edge Functions NAO vao junto: elas saem por comando proprio.
#
# Sem este passo, publicar daria a impressao de ter publicado tudo -- a mesma
# armadilha que ja existe com o agente, onde a tela nova chegava a estacao sem o
# executavel que a faz funcionar.
#
# POR QUE ANTES DO PUSH, e nao depois do deploy da Vercel:
#
# 1. se falhar aqui, NADA foi ao ar, e o `Abortar` continua dizendo a verdade;
# 2. a ordem segura e a funcao chegar ANTES da tela que aponta para ela. O
#    contrario -- painel novo apontando para funcao que nao subiu -- deixa a
#    portaria sem servidor.
$funcoesEdge = Get-FuncoesEdgeDoRepo -Raiz $raiz
if ($funcoesEdge.Count -gt 0) {
    # O projeto e conferido contra o `security_config.py`, que e versionado, e
    # nao contra o nome no painel: a conta tem projetos vazios chamados "Ideal
    # Imposicao" e "Ideal Control", e uma funcao de controle de acesso publicada
    # no projeto errado sobe sem erro, responde bonito e nao enxerga credencial
    # nenhuma.
    $refEsperado = ''
    $sc = Get-Content -Raw -Encoding UTF8 "$raiz\security_config.py"
    if ($sc -match 'https://([a-z0-9]+)\.supabase\.co') { $refEsperado = $Matches[1] }

    $refLigado = ''
    $arquivoRef = "$raiz\supabase\.temp\project-ref"
    if (Test-Path -PathType Leaf $arquivoRef) {
        $refLigado = Get-Content -Raw -Encoding UTF8 $arquivoRef
    }

    $problemaProjeto = Find-ProjetoSupabaseErrado -RefEsperado $refEsperado -RefLigado $refLigado
    if ($problemaProjeto -ne '') {
        Abortar "Edge Function no projeto errado: $problemaProjeto" `
                "Rode: npx supabase link --project-ref $refEsperado"
    }

    Write-Host "Publicando as Edge Functions ($($funcoesEdge.Count))..." -ForegroundColor Cyan
    foreach ($f in $funcoesEdge) {
        Write-Host "  $f" -ForegroundColor White
        npx supabase functions deploy $f --project-ref $refEsperado
        if ($LASTEXITCODE -ne 0) {
            Abortar "A Edge Function '$f' NAO subiu." `
                    "Confira a mensagem acima. Nada foi publicado ainda."
        }
    }
    Write-Host "  Edge Functions no ar." -ForegroundColor Green
}

# ─── Bump dos assets ─────────────────────────────────────────────────────────
# Bumpa TODO asset local versionado (.js?v= e .css?v=) em todas as paginas,
# por padrao e nao por nome: uma lista fixa deixava style.css, mapas.js e
# criador-arte.js congelados, e suas alteracoes nao chegavam ao navegador de
# quem ja tinha o arquivo em cache.
#
# Os CDNs nao sao afetados: eles fixam versao no caminho
# (/3.11.174/pdf.min.js), nunca em querystring.
Write-Host "Atualizando a versao dos assets para v$proxima..." -ForegroundColor Cyan
$substituicao = '.$1?v=' + $proxima
Get-ChildItem "frontend\*.html" | ForEach-Object {
    $html = Get-Content -Encoding UTF8 -Raw $_.FullName
    $novo = $html -replace '\.(js|css)\?v=\d+', $substituicao
    if ($novo -ne $html) {
        # -Raw + -NoNewline preserva o arquivo byte a byte fora as
        # substituicoes (o Get-Content/Set-Content por linha normalizava as
        # quebras de linha).
        #
        # -Path e -Value NOMEADOS de proposito: -Path aceita string[], entao
        # na forma posicional o PowerShell engole caminho E conteudo no mesmo
        # array de -Path, deixa -Value sem ligar e falha com um erro enganoso
        # sobre 'Encoding'. Nao passe esses dois por posicao.
        Set-Content -Encoding UTF8 -NoNewline -Path $_.FullName -Value $novo
        Write-Host "  $($_.Name)" -ForegroundColor Gray
    }
}

# ─── Git ─────────────────────────────────────────────────────────────────────
Write-Host "Commitando..." -ForegroundColor Cyan
git add -A
git commit -m "$Mensagem (v$proxima)"
if ($LASTEXITCODE -ne 0) {
    Abortar "O commit falhou." "Rode 'git status' para ver o estado."
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    Abortar "O push falhou — o commit ficou so na sua maquina." `
            "Confira a conexao e rode 'git push origin main' de novo."
}

# ─── Ponto de restauracao ────────────────────────────────────────────────────
# Depois do push de proposito: a tag so marca o que ja esta no servidor.
git tag -a "v$proxima" -m "$Mensagem"
git push origin "v$proxima"
Write-Host "  Ponto de restauracao gravado: v$proxima" -ForegroundColor Green

# ─── Vercel ──────────────────────────────────────────────────────────────────
Write-Host "Publicando o site na Vercel..." -ForegroundColor Cyan
Push-Location "$raiz\frontend"
try {
    vercel --prod --yes
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  O deploy da Vercel falhou, mas o codigo JA foi empurrado." -ForegroundColor Red
        Write-Host "  O motor (Render) vai atualizar mesmo assim." -ForegroundColor Red
        Write-Host "  Rode de novo so o deploy: cd frontend; vercel --prod --yes" -ForegroundColor Yellow
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "  SUCESSO — v$proxima no ar." -ForegroundColor Green
Write-Host "  https://ideal-imposition.vercel.app" -ForegroundColor Cyan
Write-Host "  Deu errado? '.\voltar.ps1 -Agora' devolve o site em segundos." -ForegroundColor Gray
