#
# A fonte que a tela desenha.
#
# Estes testes existem por causa de um defeito que so aparecia no LINK DO
# CLIENTE: a arte, a imposicao e o PDF saiam com a fonte certa, e a mesma
# numeracao aberta pelo cliente saia com outra.
#
# A causa: `cliente.html` nunca carregou o `script.js`, entao `buildCanvasFont`
# nao existia naquela pagina. Todas as chamadas de desenho estavam escritas com
# um ramo de emergencia — `typeof buildCanvasFont === 'function' ? ... : fs + 'px ' + font_name`
# — e no link do cliente valia SEMPRE o ramo de emergencia, que monta strings
# como "12px system:Arial|bold". Isso nao e shorthand CSS valido: o navegador
# ignora a atribuicao de `ctx.font` em silencio e segue desenhando com a fonte
# anterior. Nada aparece no console; so o cliente ve.
#
# Por isso os testes cobrem duas coisas diferentes:
#   • a traducao em si (nome do catalogo -> shorthand valido)
#   • e a AMARRACAO das paginas, que e o que de fato quebrou. Enquanto o
#     `fonte-canvas.js` estiver carregado nas tres paginas e ninguem tiver uma
#     copia local das funcoes, o defeito nao volta.
#

$raizProjeto = Split-Path -Parent $PSScriptRoot
$frontend    = Join-Path $raizProjeto 'frontend'

function Invoke-Fonte {
    param($Caso)

    $arquivo = [System.IO.Path]::GetTempFileName()
    try {
        $Caso | ConvertTo-Json -Depth 8 | Set-Content -Path $arquivo -Encoding utf8
        $saida = & node "$PSScriptRoot\fonte_canvas_harness.js" $arquivo
        if ($LASTEXITCODE -ne 0) { throw "harness node falhou: $saida" }
        return ($saida | ConvertFrom-Json).valor
    } finally {
        Remove-Item $arquivo -ErrorAction SilentlyContinue
    }
}

function Get-Shorthand {
    param($Fonte, $Corpo = 12)
    Invoke-Fonte @{ acao = 'buildCanvasFont'; corpo = $Corpo; fonte = $Fonte }
}

Describe "buildCanvasFont - as fontes que existem no banco de producao" {

    # Os nomes abaixo sao os reais das 59 numeracoes salvas, medidos em
    # 13/08/2026. Nenhum deles funciona por concatenacao direta.

    It "system:Arial vira uma familia entre aspas, e nao um nome com dois-pontos" {
        Get-Shorthand 'system:Arial' | Should Be '12px "Arial", sans-serif'
    }

    It "system:Arial|bold poe o peso ANTES do corpo, como o canvas exige" {
        # Concatenado dava "12px system:Arial|bold": shorthand invalido, o
        # ctx.font e ignorado e o texto sai com a fonte que estava antes.
        Get-Shorthand 'system:Arial|bold' | Should Be 'bold 12px "Arial", sans-serif'
    }

    It "system:Comic Sans MS|bold sobrevive ao espaco no nome da familia" {
        Get-Shorthand 'system:Comic Sans MS|bold' | Should Be 'bold 12px "Comic Sans MS", sans-serif'
    }

    It "helv e o apelido do PDF para Arial, nao uma familia chamada helv" {
        Get-Shorthand 'helv' | Should Be '12px Arial, Helvetica, sans-serif'
    }

    It "times vira Times New Roman" {
        Get-Shorthand 'times' | Should Be '12px "Times New Roman", Times, serif'
    }

    It "fonte do catalogo web vira familia entre aspas" {
        Get-Shorthand 'gotham book' | Should Be '12px "gotham book", sans-serif'
    }

    It "corpo fracionario e preservado" {
        # O corpo vem de pt convertido para px, quase nunca inteiro.
        Get-Shorthand 'helv' 8.47 | Should Be '8.47px Arial, Helvetica, sans-serif'
    }

    It "nenhum nome do banco produz shorthand invalido" {
        $nomesReais = @(
            'system:Arial', 'system:Impact', 'system:Arial|bold',
            'system:Comic Sans MS', 'system:Comic Sans MS|bold',
            'helv', 'times', 'comic', 'gotham book', 'Lobster', 'Cabin',
            'impact', 'trebucbd', 'arialbd'
        )
        foreach ($nome in $nomesReais) {
            $s = Get-Shorthand $nome
            # A forma valida e: [italic ][bold ]<corpo>px <familia>
            $s | Should Match '^(italic )?(bold )?[\d.]+px \S'
            # `system:` e `|` sao marcas do nome interno vazando para o CSS.
            $s.Contains('system:') | Should Be $false
            $s.Contains('|')       | Should Be $false
        }
    }

    It "fonte vazia cai em Arial, e nao em string quebrada" {
        Get-Shorthand $null | Should Be '12px Arial, Helvetica, sans-serif'
    }
}

Describe "cssDoCatalogo - as fontes da grafica no navegador do cliente" {

    $catalogo = @(
        @{ nome = 'Gotham Book'; font_family = 'gotham book'
           arquivo_url = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/x.ttf' }
    )

    It "gera a regra @font-face apontando para o arquivo no Supabase" {
        # E a UNICA origem que existe no navegador do cliente: ele nao tem as
        # fontes da grafica instaladas nem fala com o agente da estacao.
        $css = Invoke-Fonte @{ acao = 'cssDoCatalogo'; catalogo = $catalogo; servidoPeloAgente = $false }
        $css | Should Match '@font-face'
        $css | Should Match "font-family: 'gotham book'"
        $css | Should Match 'storage/v1/object/public/fontes/x.ttf'
    }

    It "fora do agente NAO oferece o proxy local, que seria mixed content" {
        $css = Invoke-Fonte @{ acao = 'cssDoCatalogo'; catalogo = $catalogo; servidoPeloAgente = $false }
        $css.Contains('/api/fonte?url=') | Should Be $false
    }

    It "servido pelo agente oferece o cache em disco antes do Supabase" {
        $css = Invoke-Fonte @{ acao = 'cssDoCatalogo'; catalogo = $catalogo; servidoPeloAgente = $true }
        $css | Should Match '/api/fonte\?url='
    }

    It "fonte sem arquivo_url e ignorada em vez de gerar regra quebrada" {
        $css = Invoke-Fonte @{ acao = 'cssDoCatalogo'
                               catalogo = @(@{ nome = 'X'; font_family = 'X' })
                               servidoPeloAgente = $false }
        $css.Trim() | Should Be ''
    }
}

Describe "fontesDosElementos" {

    It "junta os nomes sem repetir" {
        $r = Invoke-Fonte @{ acao = 'fontesDosElementos'; elementos = @(
            @{ font_name = 'helv' }, @{ font_name = 'helv' }, @{ font_name = 'Lobster' }
        ) }
        @($r).Count | Should Be 2
    }

    It "elemento sem fonte nao entra na lista" {
        $r = Invoke-Fonte @{ acao = 'fontesDosElementos'; elementos = @(
            @{ type = 'QR' }, @{ font_name = 'helv' }
        ) }
        @($r).Count | Should Be 1
    }
}

Describe "Amarracao das paginas - o que de fato quebrou" {

    $paginas = @{
        'index.html'    = 'script.js'
        'producao.html' = 'script.js'
        'cliente.html'  = 'cliente.js'
    }

    foreach ($par in $paginas.GetEnumerator()) {
        $pagina  = $par.Key
        $consome = $par.Value

        It "$pagina carrega o fonte-canvas.js ANTES do $consome" {
            $html = Get-Content (Join-Path $frontend $pagina) -Raw
            $iFonte   = $html.IndexOf('fonte-canvas.js')
            $iConsome = $html.IndexOf($consome + '?v=')
            $iFonte   | Should Not Be -1
            $iConsome | Should Not Be -1
            ($iFonte -lt $iConsome) | Should Be $true
        }
    }

    It "ninguem mais tem copia propria de getFontCSS" {
        # Era a copia do cliente.js que escondia a falta do buildCanvasFont:
        # a pagina parecia ter o assunto resolvido.
        $copias = @(Get-ChildItem $frontend -Filter *.js |
            Where-Object { $_.Name -ne 'fonte-canvas.js' } |
            Where-Object { (Get-Content $_.FullName -Raw) -match 'function\s+getFontCSS\s*\(' })
        $copias.Count | Should Be 0
    }

    It "ninguem mais tem copia propria de buildCanvasFont" {
        $copias = @(Get-ChildItem $frontend -Filter *.js |
            Where-Object { $_.Name -ne 'fonte-canvas.js' } |
            Where-Object { (Get-Content $_.FullName -Raw) -match 'function\s+buildCanvasFont\s*\(' })
        $copias.Count | Should Be 0
    }

    It "nao sobrou ramo de emergencia escondendo a ausencia do modulo" {
        # `typeof buildCanvasFont === 'function' ? ... : ...` era o disfarce: em
        # vez de quebrar de forma visivel no link do cliente, desenhava errado.
        $comRamo = @(Get-ChildItem $frontend -Filter *.js |
            Where-Object { $_.Name -ne 'fonte-canvas.js' } |   # la o trecho aparece so no comentario que conta a historia
            Where-Object { (Get-Content $_.FullName -Raw) -match "typeof\s+buildCanvasFont\s*===" })
        $comRamo.Count | Should Be 0
    }
}

Describe "garantirFontesCarregadas - dois modelos pedindo a mesma fonte" {

    # O defeito do pedido 21118 (24/08/2026): os tres modelos usavam
    # 'Bebas Neue', e o link do cliente monta os cards num `forEach` que NAO
    # espera um card terminar para comecar o proximo. O primeiro desenho ia
    # buscar a fonte; os outros dois viam o nome ja marcado como "carregada" e
    # voltavam na hora, pintando com uma generica. Canvas nao reflui: ficava
    # errado ate o cliente folhear as paginas, que redesenha -- e ai saia certo,
    # inclusive voltando para a pagina 1.

    It "o segundo desenho espera a fonte que o primeiro foi buscar" {
        $r = Invoke-Fonte @{ acao = 'corridaDeDoisDesenhos'; fonte = 'Bebas Neue' }
        $r.primeiroEsperou | Should Be $true
        $r.segundoEsperou  | Should Be $true
    }

    It "com a fonte ja carregada, ninguem espera de novo" {
        # A memoria continua valendo: repetir a busca a cada redesenho seria
        # travar a tela por nada.
        $r = Invoke-Fonte @{ acao = 'corridaDeDoisDesenhos'; fonte = 'Bebas Neue' }
        $r.terceiroEsperou | Should Be $true
    }
}
