#
# A escolha do servico do Render pelo NOME, antes de escrever uma variavel de
# ambiente nele.
#
# O modo de falhar que estes testes previnem ja aconteceu de verdade, em
# 14/08/2026: ha dois servicos nesta conta do Render e as tres variaveis do
# controle de acesso foram parar no errado. O sintoma nao ajudou -- o
# /api/acesso/saude respondeu 404, nao 503, porque sem a SUPABASE_SERVICE_KEY o
# app.py nem monta o router, e a rota simplesmente nao existe. Quem diagnostica
# procura configuracao errada, nao servico errado.
#
# O detalhe que torna isso possivel: o filtro `name` da API do Render casa por
# PREFIXO. Pedir "imposicao" tambem traz "imposicao-antiga", e pegar o primeiro
# da lista escreveria a chave no vizinho sem reclamar.
#
# ATENCAO: este arquivo e ASCII puro de proposito. Aspa tipografica vinda de
# mojibake ja quebrou a compilacao de um arquivo inteiro deste projeto, com o
# erro apontando trinta linhas abaixo da causa.
#

$raiz = Split-Path -Parent $PSScriptRoot
$script = Join-Path $raiz "ferramentas\variavel_no_render.ps1"
. $script

function Servico {
    param([string]$Nome, [string]$Id = 'srv-000')
    return @{ cursor = 'c'; service = [pscustomobject]@{ id = $Id; name = $Nome } }
}

Describe "Escolha do servico no Render" {

    Context "o acidente de 14/08: escrever no servico vizinho" {

        It "recusa o prefixo e nao pega o primeiro da lista" {
            # A API devolveu os dois porque o filtro dela e por prefixo. So um
            # se chama exatamente 'imposicao'.
            $resposta = @((Servico 'imposicao-antiga' 'srv-velho'), (Servico 'imposicao' 'srv-certo'))
            $escolha = Select-ServicoDoRender -Resposta $resposta -Nome 'imposicao'
            $escolha.Erro | Should Be ''
            $escolha.Servico.id | Should Be 'srv-certo'
        }

        It "para quando so existe o de nome parecido, em vez de escrever nele" {
            $resposta = @((Servico 'imposicao-antiga' 'srv-velho'))
            $escolha = Select-ServicoDoRender -Resposta $resposta -Nome 'imposicao'
            $escolha.Servico | Should Be $null
            $escolha.Erro | Should Match 'nao achei'
        }

        It "diz quais nomes viu, para quem estiver diagnosticando" {
            $resposta = @((Servico 'imposicao-antiga'), (Servico 'ideal-imposition-api'))
            $escolha = Select-ServicoDoRender -Resposta $resposta -Nome 'imposicao'
            $escolha.Erro | Should Match 'imposicao-antiga'
            $escolha.Erro | Should Match 'ideal-imposition-api'
        }
    }

    Context "os casos de borda da resposta" {

        It "acha o servico quando ele e o unico" {
            $escolha = Select-ServicoDoRender -Resposta @((Servico 'imposicao' 'srv-abc')) -Nome 'imposicao'
            $escolha.Erro | Should Be ''
            $escolha.Servico.id | Should Be 'srv-abc'
        }

        It "para com lista vazia em vez de estourar" {
            $escolha = Select-ServicoDoRender -Resposta @() -Nome 'imposicao'
            $escolha.Servico | Should Be $null
            $escolha.Erro | Should Match 'nenhum'
        }

        It "para quando ha dois com o nome IGUAL, em vez de escolher um" {
            $resposta = @((Servico 'imposicao' 'srv-1'), (Servico 'imposicao' 'srv-2'))
            $escolha = Select-ServicoDoRender -Resposta $resposta -Nome 'imposicao'
            $escolha.Servico | Should Be $null
            $escolha.Erro | Should Match '2 servicos'
        }
    }
}

Describe "Leitura do .env.local" {

    It "le a chave e o valor de uma linha simples" {
        $tmp = Join-Path $env:TEMP "envlocal-$([guid]::NewGuid()).txt"
        Set-Content -Path $tmp -Value @('RENDER_API_KEY=rnd_abc123') -Encoding ASCII
        try {
            (Get-VariaveisDoEnv -Caminho $tmp)['RENDER_API_KEY'] | Should Be 'rnd_abc123'
        } finally { Remove-Item $tmp -Force }
    }

    It "ignora comentario e linha vazia" {
        $tmp = Join-Path $env:TEMP "envlocal-$([guid]::NewGuid()).txt"
        Set-Content -Path $tmp -Value @('# comentario', '', 'A=1') -Encoding ASCII
        try {
            $v = Get-VariaveisDoEnv -Caminho $tmp
            $v.Count | Should Be 1
            $v['A'] | Should Be '1'
        } finally { Remove-Item $tmp -Force }
    }

    It "preserva o = de dentro do valor - JWT e segredo base64 tem" {
        $tmp = Join-Path $env:TEMP "envlocal-$([guid]::NewGuid()).txt"
        Set-Content -Path $tmp -Value @('X=aaa=bbb==') -Encoding ASCII
        try {
            (Get-VariaveisDoEnv -Caminho $tmp)['X'] | Should Be 'aaa=bbb=='
        } finally { Remove-Item $tmp -Force }
    }

    It "devolve vazio quando o arquivo nao existe, sem estourar" {
        (Get-VariaveisDoEnv -Caminho 'C:\nao\existe\.env.local').Count | Should Be 0
    }
}

Describe "A chave da API nao pode vazar" {

    It "o .gitignore cobre o .env.local, que e onde a RENDER_API_KEY mora" {
        $gitignore = Get-Content -Raw (Join-Path $raiz '.gitignore')
        $gitignore | Should Match '\.env\.local'
    }

    It "o script nunca imprime o valor de uma variavel" {
        # A regra e imprimir NOME e TAMANHO, jamais conteudo. Um Write-Host com
        # $valor ou $chaveApi dentro poria o segredo no terminal e no log.
        #
        # O `(?!\.Length)` e o ponto todo do teste: `$valor.Length` PODE ser
        # impresso -- e o "64 caracteres" que confirma que o segredo esta la
        # sem revelar qual e. Sem essa excecao o teste reprovaria justamente a
        # linha que faz a coisa certa.
        $texto = Get-Content -Raw (Join-Path $raiz 'ferramentas\variavel_no_render.ps1')
        $culpadas = @($texto -split "`n" | Where-Object {
            $_ -match 'Write-Host' -and $_ -match '\$(valor|chaveApi)\b(?!\.Length)'
        })
        $culpadas.Count | Should Be 0
    }
}
