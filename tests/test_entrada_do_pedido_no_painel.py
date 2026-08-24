# -*- coding: utf-8 -*-
"""A porta de entrada dos paineis: quem vira pedido em `state.ordens`.

Pergunta do usuario em 24/08/2026, com o pedido 20943 na mao: "por que nao
aparece em nenhum painel?". Ele estava no banco -- cliente LISITON, um modelo
criado, e o ERP ja o tinha mandado para a EXPEDICAO --, mas nao aparecia nem na
Fila de Arte, nem na de Producao, nem no Acabamento. Os tres desenham a mesma
`state.ordens`, entao um filtro so os apaga de uma vez.

A regra nasceu como "entra quem esta no comercial OU quem tem arte lancada". A
metade comercial morreu: a tabela `pedidos` nao existe neste banco, e
`pedidosComerciais` virou uma lista fixa vazia para nao gastar uma consulta que
sempre falharia. Sobrou a metade da arte, sozinha, como porta unica -- e quem
nunca teve arte lancada ficava invisivel para sempre, mesmo ja fabricado. No dia
em que isto foi escrito eram 8 dos 12 pedidos em expedicao, e 849 dos 896
pedidos com produto.

A terceira condicao devolve a metade que faltava, pelo campo certo: o
`status_interno` que o proprio ERP escreve. Se o pedido ja saiu da arte, o
material e da grafica, e a grafica precisa ve-lo.

O que protege a lista e a outra metade do teste: NOVO, APROVADO, LIBERADO,
AGUARDANDO e CANCELADO continuam de fora. Sao a esmagadora maioria dos 8 mil
pedidos do banco -- LIBERADO sozinho eram 78 --, e deixar qualquer um deles
passar transformaria a Fila de Arte num catalogo.

O harness recorta do script.js as proprias funcoes e as executa; nao ha copia da
regra aqui.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "entrada_do_pedido_no_painel_harness.js")


def test_o_harness_da_entrada_do_pedido_no_painel_passa():
    assert os.path.exists(HARNESS), "o harness da entrada do pedido no painel sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_porta_dos_paineis_usa_a_regua_do_saiu_da_arte():
    """A lista de status e UMA so, e mora no `SINAIS_SAIU_DA_ARTE`.

    Se um dia alguem der ao `pedidosJaNaGrafica` uma lista propria, os dois
    lugares que respondem "este pedido ainda e da arte?" passam a divergir no
    primeiro status novo que o parceiro inventar.
    """
    script = os.path.join(RAIZ, "frontend", "script.js")
    with open(script, encoding="utf-8") as f:
        fonte = f.read()

    i = fonte.find("function pedidosJaNaGrafica(")
    assert i != -1, "a funcao `pedidosJaNaGrafica` sumiu do script.js"
    corpo = fonte[i:fonte.find("\n}", i)]

    assert "pedidoSaiuDaArte" in corpo, (
        "o `pedidosJaNaGrafica` tem de perguntar ao `pedidoSaiuDaArte`, "
        "em vez de carregar uma lista de status propria"
    )
    assert "SINAIS_SAIU_DA_ARTE" not in corpo, (
        "a lista de status nao pode ser lida direto aqui: quem a le e o "
        "`pedidoSaiuDaArte`, e e ele que normaliza caixa e espaco"
    )
