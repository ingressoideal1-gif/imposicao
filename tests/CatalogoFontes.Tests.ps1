# Guardas da tela Configuracoes > Fontes.
#
# O bug que originou este arquivo: o frontend chamava DELETE /api/fontes?id=X,
# mas a rota e DELETE /api/fontes/{fonte_id}. O servidor responde 405 e o botao
# Excluir falhava SEMPRE, desde que existiu. Estas guardas leem o fonte (source)
# para o desvio nao voltar.
#
# Em 16/08/2026 o endereco deixou de ser montado aqui: quem decide entre o
# agente da estacao e a Edge Function `painel` e o `urlDeEscritaDeFontes`, em
# `supabase-config.js`. O que se guarda continua sendo o mesmo -- o id vai no
# CAMINHO, e nao em `?id=`.

$repo = Split-Path $PSScriptRoot -Parent
$js   = Get-Content "$repo\frontend\script.js" -Raw
$cfg  = Get-Content "$repo\frontend\supabase-config.js" -Raw

Describe 'catalogo de fontes -- o Excluir fala com a rota que existe' {
    It 'DELETE leva o id no caminho, como a rota do app.py' {
        ($js -match 'urlDeEscritaDeFontes\(`/\$\{encodeURIComponent\(id\)\}`\)') | Should Be $true
    }
    It 'o montador de endereco poe o sufixo depois de /api/fontes' {
        ($cfg -match '/api/fontes\$\{sufixo') | Should Be $true
    }
    It 'DELETE nao usa mais ?id= (que dava 405)' {
        ($js -match 'api/fontes\?id=') | Should Be $false
    }
}

$html = Get-Content "$repo\frontend\index.html" -Raw

Describe 'catalogo de fontes -- upload em lote, sem digitacao' {
    It 'nao existe mais campo para digitar o nome' {
        ($html -match 'id="fonte-name"') | Should Be $false
    }
    It 'nao existe mais campo para digitar a familia CSS' {
        ($html -match 'id="fonte-family"') | Should Be $false
    }
    It 'o input de arquivo aceita varios de uma vez' {
        ($html -match 'id="fonte-file"[^>]*multiple') | Should Be $true
    }
    It 'a pagina carrega o fonte-nome.js antes do script.js' {
        $iNome   = $html.IndexOf('fonte-nome.js')
        $iScript = $html.IndexOf('script.js')
        ($iNome -ge 0 -and $iNome -lt $iScript) | Should Be $true
    }
    It 'ha lugar para o resultado do lote aparecer na tela' {
        ($html -match 'id="fonte-upload-resultado"') | Should Be $true
    }
    It 'o cadastro usa o nome extraido como nome E familia' {
        ($js -match 'font_family:\s*nome') | Should Be $true
    }
}

Describe 'catalogo de fontes -- ordem, busca e amostra' {
    It 'o catalogo e ordenado por nome ao carregar' {
        # a ordenacao tem de ser a do catalogo (state_fonts.catalogo), nao um
        # localeCompare qualquer de outra tela
        ($js -match "(?s)state_fonts\.catalogo\s*=\s*\(list \|\| \[\]\)\.slice\(\)\.sort") | Should Be $true
    }
    It 'existe o campo de busca da tabela' {
        ($html -match 'id="busca-fontes"') | Should Be $true
    }
    It 'a tabela tem coluna de amostra' {
        ($html -match '<th>AMOSTRA</th>') | Should Be $true
    }
}
