<#
.SYNOPSIS
    Volta a aplicacao para uma versao anterior. Dois niveis.

.DESCRIPTION
    FREIO DE MAO (-Agora): devolve SO O SITE ao deploy anterior, em segundos.
    O motor nao volta e o codigo do git segue adiantado. E curativo para o
    cliente parar de ver erro agora, nao a correcao.

    VOLTA DE VERDADE (sem parametro): desfaz as mudancas no codigo com
    `git revert` e republica site e motor juntos, consistentes.

    Nunca usa `reset --hard`: nada e apagado, a volta vira um commit novo e
    da para voltar da volta.

.EXAMPLE
    .\voltar.ps1 -Agora
    Emergencia: devolve so o site, em cerca de 30 segundos.

.EXAMPLE
    .\voltar.ps1
    Volta de verdade, para a versao publicada anterior.

.EXAMPLE
    .\voltar.ps1 v487
    Volta de verdade, para uma versao especifica.
#>
param(
    [Parameter(Position = 0)]
    [string]$Tag,

    [switch]$Agora
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1" -Force

# ─── Freio de mao ────────────────────────────────────────────────────────────
if ($Agora) {
    Write-Host ""
    Write-Host "  FREIO DE MAO — devolve so o SITE a um deploy anterior." -ForegroundColor Yellow
    Write-Host "  O MOTOR (Render) nao volta. O codigo do git segue adiantado." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Buscando os deploys recentes..." -ForegroundColor Cyan

    # Duas armadilhas nesta unica linha:
    #
    # 1. Sem `2>&1`: no PS 5.1 a redirecao transforma cada linha de stderr de
    #    um executavel nativo em erro terminante, e a CLI da Vercel escreve em
    #    stderr mesmo quando da tudo certo. A tabela vem por stdout.
    #
    # 2. `-Width 500`: o Out-String quebra as linhas na largura do console, e
    #    numa janela estreita a URL e o status caem em linhas diferentes — o
    #    parser deixa de encontrar as duas coisas juntas e a lista sai vazia
    #    justamente na hora da emergencia.
    Push-Location "$raiz\frontend"
    try {
        $saida = (vercel ls --prod | Out-String -Width 500)
    } finally { Pop-Location }

    # Status vazio e o normal na saida canalizada, que nao traz essa coluna —
    # descartar por status vazio esvaziaria a lista sempre.
    $deploys = @(ConvertFrom-VercelLs $saida |
                 Where-Object { $_.Status -eq '' -or $_.Status -eq 'Ready' })
    if ($deploys.Count -lt 2) {
        Write-Host ""
        if ($saida -match 'vercel\.app') {
            Write-Host "  A Vercel respondeu, mas nao consegui ler a lista de deploys." -ForegroundColor Red
            Write-Host "  (O formato da saida da CLI pode ter mudado.)" -ForegroundColor Gray
        } else {
            Write-Host "  Nao achei deploys anteriores para promover." -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "  Caminho garantido, pelo painel:" -ForegroundColor Yellow
        Write-Host "    vercel.com -> projeto ideal-imposition -> aba Deployments" -ForegroundColor Yellow
        Write-Host "    -> escolha um deploy anterior -> menu (...) -> Promote to Production" -ForegroundColor Yellow
        exit 1
    }

    # Cada publicacao cria DOIS deploys de producao: um pela integracao Git
    # da Vercel (disparada pelo push) e outro pelo `vercel --prod`. Entao o
    # item logo abaixo do topo costuma ser o gemeo da MESMA versao, e nao a
    # versao anterior. Por isso a escolha e mostrada, nao adivinhada.
    Write-Host ""
    Write-Host "  O que esta no ar agora e o item 1." -ForegroundColor Gray
    Write-Host "  Atencao: cada publicacao cria DOIS deploys (um do push, outro" -ForegroundColor Gray
    Write-Host "  do comando). Entao o item 2 costuma ser a MESMA versao do 1 —" -ForegroundColor Gray
    Write-Host "  para voltar de verdade uma versao, escolha o item 3." -ForegroundColor Gray
    Write-Host ""
    $limite = [Math]::Min(6, $deploys.Count)
    for ($i = 0; $i -lt $limite; $i++) {
        $marca = ''; if ($i -eq 0) { $marca = '   <- no ar agora' }
        $idade = $deploys[$i].Idade
        if ($idade -eq '') { $idade = '-' }
        Write-Host ("   {0}) {1,-5} {2}{3}" -f ($i + 1), $idade, $deploys[$i].Url, $marca) -ForegroundColor Gray
    }
    Write-Host ""
    $escolha = Read-Host "  Promover qual item? (numero, ou Enter para cancelar)"
    if ($escolha -notmatch '^\d+$') { Write-Host "  Cancelado. Nada mudou." -ForegroundColor Gray; exit 0 }
    $idx = [int]$escolha - 1
    if ($idx -lt 1 -or $idx -ge $deploys.Count) {
        Write-Host "  Item invalido (o 1 ja esta no ar). Cancelado." -ForegroundColor Red
        exit 1
    }

    $alvo = $deploys[$idx].Url
    Write-Host "  Promovendo $alvo ..." -ForegroundColor Cyan
    Push-Location "$raiz\frontend"
    try {
        vercel rollback $alvo --yes
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "  O rollback falhou." -ForegroundColor Red
            Write-Host "  Use o painel: vercel.com -> o projeto -> Deployments ->" -ForegroundColor Yellow
            Write-Host "  escolha o deploy -> menu (...) -> Promote to Production." -ForegroundColor Yellow
            exit 1
        }
    } finally { Pop-Location }

    Write-Host ""
    Write-Host "  Site devolvido." -ForegroundColor Green
    Write-Host "  ISTO E UM CURATIVO. Rode '.\voltar.ps1' (sem -Agora) para" -ForegroundColor Yellow
    Write-Host "  voltar o motor tambem e deixar tudo consistente." -ForegroundColor Yellow
    exit 0
}

# ─── Volta de verdade ────────────────────────────────────────────────────────
$sujo = @(git status --porcelain)
if ($sujo.Count -gt 0) {
    Write-Host "  Ha trabalho nao commitado na pasta:" -ForegroundColor Red
    $sujo | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "  Commite ou descarte antes de voltar — senao o revert se" -ForegroundColor Yellow
    Write-Host "  mistura com o que voce estava fazendo." -ForegroundColor Yellow
    exit 1
}

$todas = @(git tag -l 'v*')
$ordenadas = @($todas | Where-Object { $_ -match '^v\d+$' } |
                Sort-Object { [int]($_.Substring(1)) })
if ($ordenadas.Count -eq 0) {
    Write-Host "  Nao ha nenhuma versao marcada — nao existe para onde voltar." -ForegroundColor Red
    exit 1
}
$atual = $ordenadas[-1]

if ([string]::IsNullOrWhiteSpace($Tag)) {
    $Tag = Get-TagAnterior $ordenadas $atual
    if ($Tag -eq '') {
        Write-Host "  So existe uma versao marcada ($atual). Nao ha para onde voltar." -ForegroundColor Red
        exit 1
    }
}
if ($ordenadas -notcontains $Tag) {
    Write-Host "  A versao '$Tag' nao existe. Versoes marcadas:" -ForegroundColor Red
    Write-Host "  $(($ordenadas | Select-Object -Last 10) -join '  ')" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "  Versao no ar : $atual" -ForegroundColor White
Write-Host "  Voltar para  : $Tag" -ForegroundColor White
Write-Host ""
Write-Host "  O que vai ser desfeito:" -ForegroundColor Cyan
git log --oneline "$Tag..HEAD"
Write-Host ""
Write-Host "  Nada e apagado: a volta vira um commit novo e da para voltar dela." -ForegroundColor Gray
$resp = Read-Host "  Confirma? (s/n)"
if ($resp -notmatch '^[sS]') { Write-Host "  Cancelado. Nada mudou." -ForegroundColor Gray; exit 0 }

git revert --no-commit "$Tag..HEAD"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  O revert deu conflito — os mesmos trechos foram mudados nos dois lados." -ForegroundColor Red
    Write-Host "  Para desistir e nao mudar nada: git revert --abort" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Republicando site e motor na versao de $Tag..." -ForegroundColor Cyan
& "$raiz\publicar.ps1" -Mensagem "revert: volta para $Tag"
