# -*- coding: utf-8 -*-
"""O historico deixa de ser recortado, nas tres telas (01/09/2026).

Comecou com uma pergunta do usuario: "na lista de arte, no card Pedidos
Concluidos, por que nao aparece o pedido 21347?". Ele estava no banco, em
EXPEDICAO, com arte lancada -- e nao aparecia em painel nenhum. A montagem da
`state.ordens` percorria `produtos_proposta`, entao um pedido sem nenhuma linha
ali jamais era construido.

A resposta dele abriu a mudanca inteira, e no mesmo dia ela se estendeu as tres
listas de ARQUIVO do sistema:

* Lista de Arte, card "Pedidos Concluidos";
* Painel de Producao, botao "Impresso" -- *"tambem devem aparecer todos os
  pedidos ja impressos, mostrar os ultimos 30 mas deixar todos disponiveis para
  pesquisa"*;
* Painel do Acabamento, botao "Expedicao" -- *"deve mostrar os 30 ultimos mas
  deve disponibilizar todos os pedidos quando pesquisado"*.

O que estes testes protegem, alem do obvio:

* a pagina RECORTA o que ja foi filtrado, e nunca o contrario. Cortar antes de
  filtrar faria a pesquisa achar so o que esta na pagina aberta -- o mesmo
  defeito, de outro jeito.
* as filas de TRABALHO continuam inteiras. Paginar "Em Arte" ou "Para Hoje"
  esconderia trabalho pendente atras de um botao.
* o pedido sem produto continua passando pela porta dos paineis. Sem isso a
  Lista de Arte viraria o catalogo dos 8.749 pedidos do banco.
* os rodapes existem em TODAS as paginas que desenham cada lista (index.html e
  producao.html). Esquecer uma deixa metade das estacoes sem paginacao.

O harness recorta do script.js as proprias funcoes e as executa num DOM de
mentira; nao ha copia da regra aqui.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "historico_de_artes_harness.js")


def _fonte(arquivo):
    with open(os.path.join(RAIZ, "frontend", arquivo), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_historico_passa():
    assert os.path.exists(HARNESS), "o harness do historico sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_as_tres_listas_paginam_com_o_mesmo_numero():
    """Um numero so, num lugar so.

    Tres telas do mesmo sistema com tres tamanhos de pagina diferentes seria
    pior do que nao paginar: o operador aprende um comportamento numa tela e
    ele nao vale na seguinte.
    """
    script = _fonte("script.js")
    acabamento = _fonte("acabamento.js")

    assert "const HISTORICO_POR_PAGINA = 30;" in script, (
        "o tamanho da pagina das listas de historico sumiu do script.js"
    )
    assert "window.HISTORICO_POR_PAGINA = HISTORICO_POR_PAGINA;" in script, (
        "o tamanho da pagina precisa ser exportado: o acabamento.js le dali"
    )
    assert "parseInt(window.HISTORICO_POR_PAGINA)" in acabamento, (
        "o acabamento voltou a ter um tamanho de pagina proprio"
    )


def test_so_o_arquivo_e_paginado_nunca_a_fila_de_trabalho():
    """As filas de trabalho mostram tudo de uma vez, e isso e de proposito.

    O designer e o impressor precisam ver de uma vez tudo o que tem pela frente.
    Cada recorte tem de estar preso ao `if` da sua lista de arquivo.
    """
    script = _fonte("script.js")
    acabamento = _fonte("acabamento.js")

    for marca, dono in (
        ("recortarPaginaDoHistorico(filteredArte, 'paginaConcluidos')", "if (listaEhDosConcluidos) {"),
        ("recortarPaginaDoHistorico(filteredImpressao, 'paginaImpressos')", "if (listaEhDosImpressos) {"),
    ):
        i = script.find(marca)
        assert i != -1, "sumiu o recorte: " + marca
        # O `if` que manda tem de estar logo acima do recorte.
        assert dono in script[max(0, i - 900):i], (
            "o recorte de " + marca + " saiu de dentro do `" + dono + "`; "
            "fora dele a fila de trabalho passaria a ser paginada tambem"
        )

    i = acabamento.find("const naTela = naExpedicao ? recortarPagina(lista) : lista;")
    assert i != -1, "sumiu o recorte do acabamento"
    assert "const naExpedicao = tela.prazo === 'expedicao';" in acabamento[max(0, i - 900):i], (
        "o recorte do acabamento tem de valer so no botao Expedicao"
    )


def test_o_botao_impresso_ve_o_pedido_que_ja_saiu_da_producao():
    """O historico de impressao nao pode se apagar quando o trabalho termina.

    `ordensImpressao` e a FILA: exige `status_interno` em producao e tira quem ja
    passou da grafica. Enquanto ela era a base do botao "Impresso", o pedido
    sumia da lista assim que o ERP o mandava para o acabamento ou a expedicao.
    """
    script = _fonte("script.js")

    assert "? state.ordens.filter(os => pedidoTotalmenteImpresso(os))" in script, (
        "o botao Impresso voltou a sair da fila; ele tem de varrer `state.ordens`"
    )
    assert "const filteredImpressaoSemPrazo = baseImpressao.filter(" in script, (
        "os filtros de busca e setor precisam rodar sobre a base do botao"
    )
    assert "state.temPedidosAtrasados = ordensImpressao.some(" in script, (
        "o alerta de atraso tem de continuar olhando a FILA: pedido ja impresso "
        "e entregue nao pode acender o alarme de atrasado"
    )


def test_o_botao_expedicao_ve_tambem_o_que_ja_embarcou():
    """EXPEDICAO, EM TRANSITO e ENTREGUE — tudo o que a bancada ja entregou.

    Antes a regua era `ehExpedido`, ou seja `status_interno` igual a EXPEDICAO.
    Bastava a expedicao embarcar o material para o ERP trocar por EM TRANSITO e
    o comprovante do trabalho da bancada sumir da tela.
    """
    acabamento = _fonte("acabamento.js")

    assert "if (tela.prazo === 'expedicao') return todos.filter(jaPassouDaGrafica);" in acabamento, (
        "a base do botao Expedicao voltou a ser so o `ehExpedido`"
    )
    assert "if (tela.prazo === 'expedicao') return jaPassouDaGrafica(os);" in acabamento, (
        "o recorte de prazo do botao Expedicao tem de usar a mesma regua da base"
    )


def test_o_box_do_cliente_nao_volta_a_ter_teto_de_seis():
    """`limit(6)` era o teto antigo do box "Ultimos Pedidos do Cliente".

    O usuario pediu TODOS os pedidos do cliente disponiveis para consulta. O
    teto agora e de desenho (6 por pagina), nao de consulta.
    """
    script = _fonte("script.js")

    i = script.find("async function loadUltimosPedidos")
    assert i != -1, "a funcao `loadUltimosPedidos` sumiu do script.js"
    corpo = script[i:script.find("\n/**", i)]

    assert ".limit(6)" not in corpo, (
        "o box voltou a buscar so 6 pedidos no banco; o recorte de 6 e por "
        "pagina, e a lista inteira fica na memoria para a busca alcancar"
    )
    assert "ULTIMOS_PEDIDOS_POR_PAGINA" in script, "o tamanho da pagina do box sumiu"
