# -*- coding: utf-8 -*-
"""O historico de artes deixa de ser recortado (01/09/2026).

Comecou com uma pergunta do usuario: "na lista de arte, no card Pedidos
Concluidos, por que nao aparece o pedido 21347?". Ele estava no banco, em
EXPEDICAO, com arte lancada -- e nao aparecia em painel nenhum. A montagem da
`state.ordens` percorria `produtos_proposta`, entao um pedido sem nenhuma linha
ali jamais era construido. A porta (`pedidoEntraNoPainel`) ja o aceitava desde
24/08/2026; o que faltava era alguem monta-lo.

A resposta do usuario abriu a mudanca inteira: todos os pedidos que ja tiveram
arte devem aparecer no card, o card deve ser paginado de 30 em 30, e toda arte
ja feita tem de estar disponivel na pesquisa. Na mesma leva, o box "Ultimos
Pedidos do Cliente" deixou de mostrar so os 6 ultimos.

O que estes testes protegem, alem do obvio:

* a pagina RECORTA o que ja foi filtrado, e nunca o contrario. Cortar antes de
  filtrar faria a pesquisa achar so o que esta na pagina aberta -- o mesmo
  defeito, de outro jeito.
* o pedido sem produto continua passando pela porta dos paineis. Sem isso a
  Lista de Arte viraria o catalogo dos 8.749 pedidos do banco.
* o rodape de paginas existe nas DUAS paginas que desenham a Lista de Arte
  (index.html e producao.html). Esquecer uma deixa metade das estacoes sem
  paginacao.

O harness recorta do script.js as proprias funcoes e as executa num DOM de
mentira; nao ha copia da regra aqui.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "historico_de_artes_harness.js")


def test_o_harness_do_historico_de_artes_passa():
    assert os.path.exists(HARNESS), "o harness do historico de artes sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_card_concluidos_e_o_unico_paginado():
    """As filas de trabalho continuam mostrando tudo de uma vez.

    O designer precisa ver de uma vez tudo o que tem pela frente, e sao poucas
    dezenas. Paginar "Em Arte" esconderia trabalho pendente atras de um botao --
    o contrario do que o card serve para fazer.
    """
    script = os.path.join(RAIZ, "frontend", "script.js")
    with open(script, encoding="utf-8") as f:
        fonte = f.read()

    i = fonte.find("const CONCLUIDOS_POR_PAGINA")
    assert i != -1, "o tamanho da pagina do card Concluidos sumiu do script.js"

    trecho = fonte[i:i + 1800]
    assert "if (listaEhDosConcluidos) {" in trecho, (
        "o recorte tem de estar preso ao card dos concluidos: fora desse `if` "
        "ele passaria a paginar tambem as filas de trabalho"
    )


def test_o_box_do_cliente_nao_volta_a_ter_teto_de_seis():
    """`limit(6)` era o teto antigo do box "Ultimos Pedidos do Cliente".

    O usuario pediu TODOS os pedidos do cliente disponiveis para consulta. O
    teto agora e de desenho (6 por pagina), nao de consulta.
    """
    script = os.path.join(RAIZ, "frontend", "script.js")
    with open(script, encoding="utf-8") as f:
        fonte = f.read()

    i = fonte.find("async function loadUltimosPedidos")
    assert i != -1, "a funcao `loadUltimosPedidos` sumiu do script.js"
    corpo = fonte[i:fonte.find("\n/**", i)]

    assert ".limit(6)" not in corpo, (
        "o box voltou a buscar so 6 pedidos no banco; o recorte de 6 e por "
        "pagina, e a lista inteira fica na memoria para a busca alcancar"
    )
    assert "ULTIMOS_PEDIDOS_POR_PAGINA" in fonte, (
        "o tamanho da pagina do box sumiu"
    )
