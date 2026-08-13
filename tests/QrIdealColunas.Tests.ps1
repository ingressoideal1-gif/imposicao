#
# A coluna do pool do QR Ideal, calculada no navegador.
#
# A regra vive em dois lugares — `qr_ideal.py` e `frontend/qr-ideal-colunas.js` —
# porque nenhum dos dois enxerga o quadro inteiro: o motor so conhece os modelos
# de uma folha, e o painel do pedido e o unico que conhece o pedido todo.
#
# Estes testes prendem a copia do navegador na MESMA aritmetica da copia do
# Python, incluindo o caso que o JavaScript erraria sozinho: o resto negativo.
# Em JavaScript (-50 % 100) da -50, e sem o ajuste a coluna sairia fora da faixa.
#

$harness = Join-Path $PSScriptRoot "qr_ideal_colunas_harness.js"

Describe "Coluna do QR Ideal no navegador" {

    It "calcula a coluna do exemplo canonico (72 - 22 = 50)" {
        (node $harness "coluna" "20272" "1000022").Trim() | Should Be "50"
    }

    It "nao devolve coluna negativa quando o modelo termina maior que o pedido" {
        # 22 - 72 = -50. Sem o ajuste de sinal, o JavaScript devolveria -50.
        (node $harness "coluna" "20222" "1000072").Trim() | Should Be "50"
    }

    It "usa a coluna 100 quando a diferenca e zero" {
        # A subtracao crua nunca alcanca 100 (o maximo e 99); o zero ocupa o lugar.
        (node $harness "coluna" "20222" "1000022").Trim() | Should Be "100"
    }

    It "modelos consecutivos caem em colunas diferentes" {
        (node $harness "coluna" "20272" "1000023").Trim() | Should Be "49"
        (node $harness "coluna" "20272" "1000024").Trim() | Should Be "48"
    }

    It "nao acusa nada quando as colunas sao distintas" {
        (node $harness "conferir" "20272" "1000022,1000023,1000024").Trim() | Should Be "[]"
    }

    It "acusa dois modelos do mesmo pedido na mesma coluna" {
        # 1000022 e 1000122 diferem em exatamente 100: mesma coluna, e portanto
        # ingressos com o MESMO codigo no MESMO evento.
        $saida = (node $harness "conferir" "20272" "1000022,1000122,1000023").Trim()
        $saida | Should Match '"coluna":50'
        $saida | Should Match '1000022'
        $saida | Should Match '1000122'
        $saida | Should Not Match '1000023'
    }

    It "ignora modelo vazio em vez de inventar uma coluna" {
        (node $harness "conferir" "20272" "1000022,,1000023").Trim() | Should Be "[]"
    }
}
