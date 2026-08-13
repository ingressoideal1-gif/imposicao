#
# O pool do QR Ideal tem que chegar as estacoes - e nao pode chegar pelo git.
#
# Sao 24 MB e e o segredo mestre do controle de acesso: quem tem o arquivo emite
# ingresso valido para qualquer evento. Ele viaja pelo instalador do agente, e o
# build para se nao o encontrar.
#
# O modo de falhar que estes testes previnem e silencioso e caro: um agente
# publicado sem o pool instala normalmente, abre normalmente, e so quebra quando
# alguem manda imprimir um trabalho com QR Ideal - provavelmente com a maquina
# ja parada esperando o papel.
#
# ATENCAO: este arquivo e ASCII puro de proposito. Um travessao escrito aqui ja
# virou a sequencia mojibake que contem o caractere de aspa tipografica, e o
# PowerShell 5.1 aceita aspa tipografica como delimitador de string - o arquivo
# inteiro parou de compilar, com o erro apontando uma linha trinta linhas abaixo
# da causa.
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

    It "o instalador Inno Setup leva o pool para junto do executavel" {
        $conteudo = Get-Content (Join-Path $raiz "installer.iss") -Raw
        $conteudo | Should Match "qr_ideal_pool\.bin"
    }

    It "o instalador MSI leva o pool - e e ELE que o publicar_agente.ps1 usa" {
        # O installer.iss sozinho nao basta: quem sai para as estacoes pelo
        # publicar_agente.ps1 e o MSI, montado pelo compilar_msi.ps1 a partir do
        # agent_installer.wxs. Publicar o agente com o pool so no Inno Setup
        # entregaria o motor novo SEM os codigos.
        $wxs = Get-Content (Join-Path $raiz "agent_installer.wxs") -Raw
        $wxs | Should Match "qr_ideal_pool\.bin"
        $wxs | Should Match 'ComponentRef Id=.PoolQrIdeal.'
    }

    It "o compilador do MSI garante o pool em dist antes de empacotar" {
        $conteudo = Get-Content (Join-Path $raiz "compilar_msi.ps1") -Raw
        $conteudo | Should Match "qr_ideal_pool\.bin"
        $conteudo | Should Match "24000000"
    }

    It "nenhum .bin esta versionado" {
        $rastreados = & git -C $raiz ls-files "*.bin"
        $rastreados | Should BeNullOrEmpty
    }

    It "nenhuma planilha esta versionada" {
        $rastreados = & git -C $raiz ls-files "*.xlsx"
        $rastreados | Should BeNullOrEmpty
    }

    It "o build exige o segredo do agente antes de compilar" {
        # Sem ele o agente imprime normalmente e nao publica faixa nenhuma. E o
        # mesmo modo de falhar do pool: silencioso ate a portaria do evento.
        $conteudo = Get-Content (Join-Path $raiz "build_agent.ps1") -Raw
        $conteudo | Should Match "ACESSO_AGENTE_SEGREDO"
        $conteudo | Should Match "acesso_segredo\.py"
    }

    It "o segredo do agente nunca fica versionado" {
        $conteudo = Get-Content (Join-Path $raiz ".gitignore") -Raw
        $conteudo | Should Match "acesso_segredo\.py"
        $rastreados = & git -C $raiz ls-files "acesso_segredo.py"
        $rastreados | Should BeNullOrEmpty
    }

    It "o PyInstaller e avisado do modulo gerado" {
        # acesso_publicacao.py importa acesso_segredo DENTRO de uma funcao, entao
        # o PyInstaller nao o encontra varrendo o codigo. Sem o hiddenimports o
        # agente sai sem o segredo, e sem erro nenhum.
        $spec = Get-Content (Join-Path $raiz "agent_tray.spec") -Raw
        $spec | Should Match "'acesso_segredo'"
    }

    It "o .gitignore protege o pool nos dois formatos" {
        $conteudo = Get-Content (Join-Path $raiz ".gitignore") -Raw
        $conteudo | Should Match "\*\.xlsx"
        $conteudo | Should Match "\*\.bin"
        $conteudo | Should Match "Ideal Control/"
    }
}
