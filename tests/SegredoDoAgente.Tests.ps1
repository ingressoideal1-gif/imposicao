#
# O segredo que autoriza a estacao a publicar a faixa de codigos.
#
# O QUE ESTES TESTES PREVINEM, E QUE JA ACONTECEU DE VERDADE
#
# Em 15/08/2026, o pedido 20508 saiu impresso com sete modelos e a nuvem nao
# recebeu credencial nenhuma. Sao 143 ingressos que a portaria recusaria. O log
# do agente dizia, uma vez por trabalho:
#
#   [acesso] Faixa do pedido 20508 NAO publicada: ACESSO_AGENTE_SEGREDO
#   ausente nesta estacao.
#
# A causa eram DOIS defeitos independentes, nos dois caminhos de compilacao:
#
#   - publicar_agente.ps1 -- o que compila TODO release -- nunca gerava o
#     acesso_segredo.py. Ia direto ao PyInstaller.
#   - build_agent.ps1 gerava, mas DEPOIS de ja ter chamado o PyInstaller. O
#     arquivo so entraria no build seguinte.
#
# O PyInstaller avisou em todos os builds, num arquivo que ninguem le:
#   "missing module named acesso_segredo"
#
# E o agent_tray.spec ja trazia o comentario que previu o dia: "sem esta linha o
# agente sai sem o segredo e nao publica faixa nenhuma -- sem erro, sem aviso,
# ate a portaria do evento".
#
# Por isso os testes abaixo cobram TRES coisas, e nao so a primeira: que a
# geracao exista, que ela venha ANTES da compilacao, e que o build PARE se o
# modulo nao entrar. A ultima e a unica que nao depende de alguem lembrar.
#
# ATENCAO: este arquivo e ASCII puro de proposito. Aspa tipografica vinda de
# mojibake ja quebrou a compilacao de um arquivo inteiro deste projeto.
#

$raiz = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $raiz "ferramentas\Publicacao.psm1") -Force

function Nova-PastaTemp {
    $p = Join-Path $env:TEMP "segredo-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Path $p | Out-Null
    return $p
}

Describe "Gerar o acesso_segredo.py" {

    It "escreve o SEGREDO lido do .env.local" {
        $pasta = Nova-PastaTemp
        try {
            Set-Content -Path (Join-Path $pasta ".env.local") -Encoding ASCII `
                -Value @('OUTRA=x', 'ACESSO_AGENTE_SEGREDO=abc123def456')
            New-SegredoDoAgente -Raiz $pasta | Out-Null
            $texto = Get-Content -Raw (Join-Path $pasta "acesso_segredo.py")
            $texto | Should Match 'SEGREDO = "abc123def456"'
        } finally { Remove-Item $pasta -Recurse -Force }
    }

    It "prefere a variavel de ambiente ao arquivo" {
        $pasta = Nova-PastaTemp
        $env:ACESSO_AGENTE_SEGREDO = 'do-ambiente'
        try {
            Set-Content -Path (Join-Path $pasta ".env.local") -Encoding ASCII `
                -Value @('ACESSO_AGENTE_SEGREDO=do-arquivo')
            New-SegredoDoAgente -Raiz $pasta | Out-Null
            (Get-Content -Raw (Join-Path $pasta "acesso_segredo.py")) | Should Match 'do-ambiente'
        } finally {
            Remove-Item Env:\ACESSO_AGENTE_SEGREDO -ErrorAction SilentlyContinue
            Remove-Item $pasta -Recurse -Force
        }
    }

    It "escapa barra invertida e aspa, senao o .py sai com erro de sintaxe" {
        # Um segredo com aspa quebraria o modulo, e o agente sairia sem ele --
        # de novo em silencio, que e o modo de falhar que este arquivo combate.
        $pasta = Nova-PastaTemp
        try {
            Set-Content -Path (Join-Path $pasta ".env.local") -Encoding ASCII `
                -Value @('ACESSO_AGENTE_SEGREDO=a\b"c')
            New-SegredoDoAgente -Raiz $pasta | Out-Null
            $texto = Get-Content -Raw (Join-Path $pasta "acesso_segredo.py")
            $texto | Should Match 'SEGREDO = "a\\\\b\\"c"'
        } finally { Remove-Item $pasta -Recurse -Force }
    }

    It "FALHA quando nao acha o segredo em lugar nenhum" {
        # Falhar alto e a regra: um agente publicado sem segredo imprime
        # normalmente e nao publica nada, e ninguem percebe ate a portaria.
        $pasta = Nova-PastaTemp
        try {
            { New-SegredoDoAgente -Raiz $pasta } | Should Throw
            (Test-Path (Join-Path $pasta "acesso_segredo.py")) | Should Be $false
        } finally { Remove-Item $pasta -Recurse -Force }
    }
}

Describe "O modulo entrou mesmo no executavel" {

    It "Test-SegredoNoBuild aprova quando o aviso do PyInstaller nao cita o modulo" {
        $pasta = Nova-PastaTemp
        try {
            $warn = Join-Path $pasta "warn-agent_tray.txt"
            Set-Content -Path $warn -Encoding ASCII -Value @(
                'missing module named tzdata - imported by zoneinfo')
            { Test-SegredoNoBuild -Aviso $warn } | Should Not Throw
        } finally { Remove-Item $pasta -Recurse -Force }
    }

    It "Test-SegredoNoBuild FALHA quando o PyInstaller diz que faltou o modulo" {
        # Esta e a linha que existia em TODOS os builds ate 15/08/2026 e que
        # ninguem leu. Agora ela para o release.
        $pasta = Nova-PastaTemp
        try {
            $warn = Join-Path $pasta "warn-agent_tray.txt"
            Set-Content -Path $warn -Encoding ASCII -Value @(
                'missing module named acesso_segredo - imported by acesso_publicacao')
            { Test-SegredoNoBuild -Aviso $warn } | Should Throw
        } finally { Remove-Item $pasta -Recurse -Force }
    }

    It "Test-SegredoNoBuild FALHA quando o arquivo de aviso nem existe" {
        # Sem o arquivo nao da para afirmar nada, e afirmar "esta ok" seria a
        # mesma omissao de antes, com outra roupa.
        { Test-SegredoNoBuild -Aviso "C:\nao\existe\warn.txt" } | Should Throw
    }
}

Describe "Os dois caminhos de compilacao usam a MESMA rotina" {

    # A raiz do defeito nao foi nenhum dos dois scripts isoladamente: foi
    # existirem dois, com copias proprias, que divergiram sem ninguem notar.

    $scripts = @{
        'publicar_agente.ps1' = Get-Content -Raw (Join-Path $raiz "publicar_agente.ps1")
        'build_agent.ps1'     = Get-Content -Raw (Join-Path $raiz "build_agent.ps1")
    }

    foreach ($par in $scripts.GetEnumerator()) {
        $nome = $par.Key
        $texto = $par.Value

        It "$nome gera o segredo pela rotina compartilhada" {
            $texto | Should Match 'New-SegredoDoAgente'
        }

        It "$nome gera o segredo ANTES de chamar o PyInstaller" {
            # O defeito exato do build_agent.ps1: ele gerava perto do fim do
            # arquivo e compilava no comeco, entao o segredo so entraria no
            # build seguinte.
            #
            # Compara com a CHAMADA (`-m PyInstaller`), e nao com a palavra: os
            # dois scripts citam o PyInstaller em comentario antes de chamar, e
            # a primeira ocorrencia do nome nao e a compilacao.
            $geracao = $texto.IndexOf('New-SegredoDoAgente')
            $compilacao = $texto.IndexOf('-m PyInstaller')
            $geracao | Should BeGreaterThan -1
            $compilacao | Should BeGreaterThan -1
            $geracao | Should BeLessThan $compilacao
        }

        It "$nome confere, depois de compilar, que o modulo entrou" {
            $texto | Should Match 'Test-SegredoNoBuild'
        }

        It "$nome nao tem copia propria da geracao do segredo" {
            # Uma segunda copia e como as duas divergiram da primeira vez.
            $texto | Should Not Match 'SEGREDO = "\$'
        }
    }
}
