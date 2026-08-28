# -*- coding: utf-8 -*-
"""A janela de visualizacao abre abaixo do modelo escolhido (28/08/2026).

Ate esta data a tela do Pedido punha a janela num card no FIM da pagina: o
operador escolhia o modelo no topo da fila e ia procurar a previa depois de
todas as caixas de produto. Num pedido com varios produtos, o olho perdia o
vinculo entre a linha escolhida e o que a previa mostrava.

O comportamento na tela e medido pelo harness em Chrome
(`janela_do_modelo_harness.js`), que prova o que nao aparece no HTML: que a
janela e MOVIDA, e nunca recriada. O que este arquivo cobre sao as ligacoes no
codigo — as tres que, se alguem desfizer sem querer, levam tudo de volta ao
lugar antigo em silencio.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "janela_do_modelo_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_janela_passa():
    assert os.path.exists(HARNESS), "o harness da janela sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_clique_na_linha_e_um_interruptor():
    """Clicar num modelo abre; clicar de novo NO MESMO fecha.

    O `alternarModeloAberto` existe separado do `enviarParaPedido` de proposito:
    aquele significa "abra este modelo" e e chamado tambem por quem edita um
    campo da linha (pedQueueUpdateField e companhia). Se o interruptor morasse
    la, mexer na quantidade do modelo aberto o fecharia.
    """
    pedido = _ler("frontend/pedido.js")
    assert "onclick=\"alternarModeloAberto(" in pedido, \
        "a linha da fila voltou a chamar enviarParaPedido direto — o clique deixou de ser interruptor"
    assert "async function alternarModeloAberto(" in pedido


def test_a_fila_recolhe_a_janela_antes_de_se_reescrever():
    """O `innerHTML` da fila destroi tudo o que estiver dentro dela.

    Com a janela dentro e sem este recolhimento, todo redesenho apagaria o
    canvas ja pintado, remontaria o painel de impressao (nova ida ao agente
    para ler as capacidades da impressora) e devolveria bandeja e papel ao
    padrao. A ordem importa: recolher ANTES, devolver DEPOIS.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("function renderPedOSQueue()"):]
    corpo = corpo[:corpo.index("\nfunction updatePedImprimirButtonsVisibility")]

    assert "recolherJanelaParaCasa()" in corpo, \
        "renderPedOSQueue parou de recolher a janela — o innerHTML vai destrui-la"
    assert corpo.index("recolherJanelaParaCasa()") < corpo.index("wrapper.innerHTML = html"), \
        "a janela precisa sair da fila ANTES de a fila ser reescrita"
    assert corpo.index("wrapper.innerHTML = html") < corpo.index("moverJanelaParaModelo("), \
        "e voltar para baixo do modelo DEPOIS"


def test_o_pedido_abre_sem_modelo_selecionado():
    """A tela do Pedido passou a abrir num estado neutro.

    Antes ela sempre abria com o primeiro modelo carregado, e nao havia como
    chegar a "nenhum selecionado". Quem manda na fila virou `state.pedidoAberto`
    -- sem ele, fechar a janela (que zera o `activeOSItem`) faria a fila inteira
    sumir da tela.
    """
    script = _ler("frontend/script.js")
    corpo = script[script.index("async function abrirImposicaoDoPedido("):]
    corpo = corpo[:corpo.index("\n/**")]

    assert "state.activeOSItem = null" in corpo, \
        "abrir um pedido voltou a deixar um modelo pre-selecionado"
    assert "state.pedidoAberto = { osId: realOsId }" in corpo, \
        "sem o pedido aberto guardado a parte, a fila some ao fechar a janela"
    assert "renderPedOSQueue" in corpo, \
        "a fila precisa ser desenhada ao abrir: e ela que aplica o formato padrao do produto"


def test_modelo_escondido_pelo_filtro_fecha_a_janela():
    """Mesma regra que ja vale para a marcacao, pelo mesmo motivo.

    A janela agora mora dentro da fila. Escondido o modelo, ela ficaria
    pendurada embaixo de nada e continuaria mandando na impressao de um modelo
    que o operador nao ve mais.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("function aplicarFiltrosDaFila()"):]
    corpo = corpo[:corpo.index("window.aplicarFiltrosDaFila")]
    assert "fecharJanelaDoModelo()" in corpo, \
        "o filtro parou de fechar a janela do modelo que ele escondeu"


def test_o_menu_traz_a_pagina_inicial_do_pedido():
    """Clicar no menu tem de trazer a tela inicial, nunca o detalhe da visita anterior.

    A pagina inicial do Pedido passou a ser a fila com NENHUM modelo aberto. Por
    isso `enviarParaPedido` navega por `showView` direto, e nao clicando no
    botao do menu: o clique no menu fecha a janela, e desfaria o que ele acabou
    de fazer.
    """
    script = _ler("frontend/script.js")
    assert "viewId === 'view-pedido' && typeof window.fecharJanelaDoModelo === 'function'" in script, \
        "vir pelo menu parou de devolver a tela do Pedido ao estado inicial"

    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("async function enviarParaPedido("):]
    corpo = corpo[:corpo.index("setTimeout(")]
    assert "window.showView('view-pedido')" in corpo, \
        "enviarParaPedido voltou a navegar clicando no menu — e o menu fecha a janela"
