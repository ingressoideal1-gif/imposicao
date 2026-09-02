# -*- coding: utf-8 -*-
"""A fila de trabalho dos dois paineis sai em ordem de PRAZO DE ENTREGA.

Pedido do usuario em 02/09/2026: *"no painel de producao, a lista dos pedidos
deve estar em ordem de prazo de entrega, do menor para o maior"*, e na mensagem
seguinte *"assim como no painel de acabamento"*.

Ate aqui as duas listas saiam na ordem em que `state.ordens` nasce -- numero do
pedido, do maior para o menor. Isso poe o pedido mais NOVO na frente, que e o
contrario do que a grafica precisa: quem vence antes tem de sair antes.

A funcao pura (`ordenarPorPrazoDeEntrega`) e exercitada pelo harness em Node,
que a LE do `script.js`. O que fica aqui e a LIGACAO: que ela e mesmo aplicada
nas duas telas, no lugar certo da sequencia (filtrar -> ordenar -> recortar), e
que os historicos continuam com a ordem deles.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "ordem_por_prazo_de_entrega_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_ordem_por_prazo_passa():
    assert os.path.exists(HARNESS), "o harness da ordem por prazo sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "todas passaram" in (r.stdout or ""), (
        "o harness nao relatou sucesso:" + (r.stdout or "")
    )


def test_a_producao_ordena_a_fila_pelo_prazo():
    """Sem esta ligacao a funcao existiria sem ninguem chamar, e a tela ficaria igual."""
    js = _ler("frontend/script.js")

    assert "filteredImpressao = ordenarPorPrazoDeEntrega(filteredImpressao)" in js, (
        "a fila de impressao deixou de ser ordenada pelo prazo de entrega"
    )


def test_na_producao_o_botao_impresso_mantem_a_ordem_dele():
    """O historico dos impressos tem ordem propria desde 22/08/2026: do mais
    recente ao mais antigo. A ordem por prazo e da FILA DE TRABALHO, e os dois
    nao podem se atropelar -- por isso e um `else`, e nao duas linhas seguidas."""
    js = _ler("frontend/script.js")

    i_imp = js.index("filteredImpressao = ordenarImpressosPorData(filteredImpressao)")
    i_prazo = js.index("filteredImpressao = ordenarPorPrazoDeEntrega(filteredImpressao)")

    assert i_prazo > i_imp, "a ordem por prazo tem de ser a alternativa do IMPRESSO"
    assert "} else {" in js[i_imp:i_prazo], (
        "as duas ordens precisam ser exclusivas: com o IMPRESSO aceso vale a data "
        "do carimbo, e nas telas de trabalho vale o prazo"
    )


def test_na_producao_o_cabecalho_continua_vencendo():
    """Clicar numa coluna e escolha explicita do operador, e vence a ordem que a
    tela traz sozinha -- entao `aplicarProdSort` vem depois das duas."""
    js = _ler("frontend/script.js")

    i_prazo = js.index("filteredImpressao = ordenarPorPrazoDeEntrega(filteredImpressao)")
    i_sort = js.index("filteredImpressao = aplicarProdSort(filteredImpressao)")

    assert i_sort > i_prazo


def test_o_acabamento_ordena_a_mesma_fila_pelo_prazo():
    js = _ler("frontend/acabamento.js")

    assert "lista = ordenarPorPrazo(lista)" in js, (
        "a fila do acabamento deixou de ser ordenada pelo prazo de entrega"
    )
    i_prazo = js.index("lista = ordenarPorPrazo(lista)")
    i_sort = js.index("lista = aplicarSort(lista)")
    assert i_sort > i_prazo, (
        "no acabamento o clique no cabecalho tambem vence a ordem padrao"
    )


def test_o_acabamento_nao_faz_uma_segunda_conta_de_data():
    """A regra de prazo mora no Painel de Producao e e chamada de la -- como o
    atraso e o para-hoje ja fazem. Uma copia aqui divergiria da de la no primeiro
    ajuste, e as duas telas passariam a mostrar filas diferentes."""
    js = _ler("frontend/acabamento.js")

    i = js.index("function ordenarPorPrazo(")
    corpo = js[i:i + 400]
    assert "fn('ordenarPorPrazoDeEntrega')" in corpo, (
        "o acabamento tem de emprestar a funcao do script.js"
    )
    assert "data_termino" not in corpo and "new Date(" not in corpo, (
        "o acabamento nao pode reimplementar a leitura da data do prazo"
    )


def test_o_botao_expedicao_fica_de_fora():
    """A Expedicao e o comprovante do que esta bancada ja entregou: nao ha
    trabalho a fazer ali, e nela o pedido mais novo continua no topo -- como o
    botao IMPRESSO da Producao."""
    js = _ler("frontend/acabamento.js")

    i = js.index("lista = ordenarPorPrazo(lista)")
    assert "tela.prazo !== 'expedicao'" in js[i - 400:i + 60], (
        "a ordem por prazo escapou para a lista da expedicao"
    )


def test_a_ordem_vem_antes_do_recorte_de_paginas():
    """A regra que nao pode ser quebrada nas listas paginadas: filtrar, ordenar,
    so entao cortar. Cortar antes de ordenar mostraria a primeira pagina de uma
    lista que ainda estava na ordem errada."""
    prod = _ler("frontend/script.js")
    i_prazo = prod.index("filteredImpressao = ordenarPorPrazoDeEntrega(filteredImpressao)")
    i_corte = prod.index("recortarPaginaDoHistorico(filteredImpressao, 'paginaImpressos')")
    assert i_corte > i_prazo

    acab = _ler("frontend/acabamento.js")
    j_prazo = acab.index("lista = ordenarPorPrazo(lista)")
    # a CHAMADA, nao a definicao da funcao (que mora bem antes no arquivo)
    j_corte = acab.index("naExpedicao ? recortarPagina(lista)")
    assert j_corte > j_prazo
