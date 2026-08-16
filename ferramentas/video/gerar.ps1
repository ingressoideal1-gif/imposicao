<#
.SINOPSE
    Gera o vídeo "Ideal Control — como instalar e usar", do começo ao fim.

.DESCRICAO
    Um comando só:

        .\ferramentas\video\gerar.ps1

    Ele tira um instantâneo do frontend, grava as telas num Chrome, narra com a
    voz do Windows e monta o MP4 em `midia\`.

    ## Por que um instantâneo, e não a pasta `frontend\` viva

    Porque este repositório costuma ter mais de uma sessão de trabalho aberta ao
    mesmo tempo. Um arquivo salvo no meio da gravação produziria um vídeo em que
    a tela troca de versão entre uma cena e a seguinte — sem erro nenhum, e
    impossível de perceber a não ser assistindo até o fim.

    O instantâneo sai do ÚLTIMO COMMIT (`git archive HEAD`), que é um estado
    coerente por definição. Para gravar o que está na pasta agora — inclusive
    alteração ainda não commitada —, use `-DaPastaViva`.

.PARAMETRO DaPastaViva
    Grava direto de `frontend\`, sem instantâneo. Serve para conferir uma
    alteração antes de commitá-la.

.PARAMETRO SoMontar
    Pula a gravação e só remonta o MP4 a partir dos quadros que já existem.
    É o caminho rápido quando só o TEXTO do roteiro mudou.
#>
[CmdletBinding()]
param(
    [switch]$DaPastaViva,
    [switch]$SoMontar
)

$ErrorActionPreference = 'Stop'
$RAIZ = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$TRABALHO = Join-Path $RAIZ 'midia\_trabalho'

if (-not $SoMontar) {
    if ($DaPastaViva) {
        $fonte = Join-Path $RAIZ 'frontend'
        Write-Host "Gravando da pasta viva: $fonte" -ForegroundColor Yellow
    } else {
        $instantaneo = Join-Path $TRABALHO 'frontend-do-commit'
        if (Test-Path $instantaneo) { Remove-Item $instantaneo -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $instantaneo | Out-Null

        $zip = Join-Path $TRABALHO 'frontend.zip'
        Push-Location $RAIZ
        try {
            & git archive --format=zip -o $zip HEAD frontend
            if ($LASTEXITCODE -ne 0) { throw 'git archive falhou' }
        } finally { Pop-Location }

        Expand-Archive -Path $zip -DestinationPath $instantaneo -Force
        Remove-Item $zip -Force
        $fonte = Join-Path $instantaneo 'frontend'

        $commit = (& git -C $RAIZ log -1 --format='%h %s')
        Write-Host "Gravando do commit: $commit" -ForegroundColor Cyan
    }

    & node (Join-Path $PSScriptRoot 'gravar.js') --fonte $fonte --saida $TRABALHO
    if ($LASTEXITCODE -ne 0) { throw 'a gravacao falhou' }
    Write-Host ''
}

& (Join-Path $PSScriptRoot 'montar.ps1') -Trabalho $TRABALHO
