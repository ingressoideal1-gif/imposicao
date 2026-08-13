#
# O pool do QR Ideal tem que chegar as estacoes — e nao pode chegar pelo git.
#
# Sao 24 MB e e o segredo mestre do controle de acesso: quem tem o arquivo emite
# ingresso valido para qualquer evento. Ele viaja pelo instalador do agente, e o
# build para se nao o encontrar.
#
# O modo de falhar que estes testes previnem e silencioso e caro: um agente
# publicado sem o pool instala normalmente, abre normalmente, e so quebra quando
# alguem manda imprimir um trabalho com QR Ideal — provavelmente com a maquina
# ja parada esperando o papel.
#

$raiz = Split-Path -Parent $PSScriptRoot

Describe "Pool do QR Ideal na publicacao" {

    It "o build exige o pool antes de compilar" {
        $conteudo = Get-Content (Join-Path $raiz "build_agent.ps1") -Raw
        $conteudo | Should Match "qr_ideal_pool\.bin"
        $conteudo | Should Match "POOL_QR_IDEAL"
    }

    It "o build confere o tamanho exato do pool" {
        # 3.000.000 codigos x 8 bytes. Um arquivo truncado passaria despercebido
        # ate a portaria; o tamanho e a conferencia mais barata que existe.
        $conteudo = Get-Content (Join-Path $raiz "build_agent.ps1") -Raw
        $conteudo | Should Match "24000000"
    }

    It "o instalador leva o pool para junto do executavel" {
        $conteudo = Get-Content (Join-Path $raiz "installer.iss") -Raw
        $conteudo | Should Match "qr_ideal_pool\.bin"
    }

    It "nenhum .bin esta versionado" {
        $rastreados = & git -C $raiz ls-files "*.bin"
        $rastreados | Should BeNullOrEmpty
    }

    It "nenhuma planilha esta versionada" {
        $rastreados = & git -C $raiz ls-files "*.xlsx"
        $rastreados | Should BeNullOrEmpty
    }

    It "o .gitignore protege o pool nos dois formatos" {
        $conteudo = Get-Content (Join-Path $raiz ".gitignore") -Raw
        $conteudo | Should Match "\*\.xlsx"
        $conteudo | Should Match "\*\.bin"
        $conteudo | Should Match "Ideal Control/"
    }
}
