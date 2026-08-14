# Guardas da tela Configuracoes > Fontes.
#
# O bug que originou este arquivo: o frontend chamava DELETE /api/fontes?id=X,
# mas a rota do FastAPI e DELETE /api/fontes/{fonte_id}. O FastAPI responde 405
# e o botao Excluir falhava SEMPRE, desde que existiu. Estas guardas leem o
# fonte (source) para o desvio nao voltar.

$repo = Split-Path $PSScriptRoot -Parent
$js   = Get-Content "$repo\frontend\script.js" -Raw

Describe 'catalogo de fontes -- o Excluir fala com a rota que existe' {
    It 'DELETE leva o id no caminho, como a rota do app.py' {
        ($js -match 'api/fontes/\$\{encodeURIComponent\(id\)\}') | Should Be $true
    }
    It 'DELETE nao usa mais ?id= (que dava 405)' {
        ($js -match 'api/fontes\?id=') | Should Be $false
    }
}
