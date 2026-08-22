# -*- coding: utf-8 -*-
"""Acoes em lote no pedido, pedidas pelo usuario em 22/08/2026.

Pedido: *"Cria um botao (acao) dentro do pedido para Marcar Pronto, Reprovar e
Aprovar simultaneamente todos os modelos do mesmo pedido, respeitando que
aprovacao e reprovacao somente usuario ADM e Atendimento"*.

No banner do pedido aberto (tela Amostras) nasce a linha "Todos os modelos:" com
ate tres botoes -- Marcar todos PRONTO, Todos em ALTERACAO, Aprovar todos. Cada
um faz, modelo a modelo, exatamente o que o botao do card faz: a MESMA
`decisionAmostraItem`, as mesmas travas (Qtd x linhas, banco incompleto, modelo
aprovado), as mesmas gravacoes. Nada novo e escrito no banco.

As regras que decidem ANTES de agir sao puras e moram no `script.js`:
`podeAgirEmLoteNoPedido` (quem pode), `planoDaAcaoEmLote` (quem entra e quem
fica de fora, com o motivo) e `textoDoPlanoEmLote` (a confirmacao). O harness
em Node as le do arquivo e as exercita com papeis e modelos de mentira.

O que fica aqui e a LIGACAO: o container existe no HTML, no lugar certo;
`decisionAmostraItem` ganhou o `opts` que o lote usa; a promocao do pedido para
"Enviar Arte" virou funcao propria e e chamada nos DOIS caminhos (por modelo e
em lote); a linha de botoes e desenhada por `renderAmostrasOSItens`; e os dois
botoes de decisao (Alteracao e Aprovar) so aparecem para quem
`podeAgirEmLoteNoPedido('APROVADA')` -- porque a regra do usuario e sobre quem
VE e quem PODE, e botao escondido sem funcao que recusa (ou funcao que recusa
sem botao escondido) e metade da regra.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "acao_em_lote_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_das_acoes_em_lote_passa():
    assert os.path.exists(HARNESS), "o harness das acoes em lote sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_container_dos_botoes_esta_no_banner_do_pedido():
    """O container mora DENTRO do banner do pedido (`#amostras-os-banner`), que
    so aparece com um pedido aberto -- e antes dos cards dos modelos. Fora do
    banner ele apareceria na tela de amostra avulsa, onde nao ha pedido nenhum."""
    html = _ler("frontend/index.html")

    i_banner = html.index('id="amostras-os-banner"')
    i_cards = html.index("<!-- Container dinâmico dos cards de itens do pedido -->")
    assert i_banner < i_cards, "o banner precisa vir antes dos cards"

    bloco = html[i_banner:i_cards]
    assert 'id="amostras-acoes-em-lote"' in bloco, (
        "o container amostras-acoes-em-lote nao esta dentro do banner do pedido"
    )


def test_decision_amostra_item_aceita_o_opts_do_lote():
    """A assinatura nova: `opts.obs` substitui o textarea e `opts.emLote` cala os
    avisos por modelo. Sem `opts`, o comportamento e o de sempre -- e e por isso
    que o parametro tem valor padrao."""
    js = _ler("frontend/script.js")
    assert "async function decisionAmostraItem(itemId, osId, status, opts = {})" in js, (
        "decisionAmostraItem nao tem a assinatura (itemId, osId, status, opts = {})"
    )


def test_a_promocao_para_enviar_arte_e_uma_funcao_chamada_nos_dois_caminhos():
    """O bloco "todos PRONTO -> Enviar Arte" saiu de dentro de
    `decisionAmostraItem` e virou `promoverPedidoSeTodosProntos(osId)`. O caminho
    por modelo chama depois de gravar; o lote chama UMA vez no fim. Faltando uma
    das chamadas, o pedido com todos os modelos prontos nao avanca por aquele
    caminho -- e ninguem ve, porque nada quebra na tela."""
    js = _ler("frontend/script.js")

    assert "async function promoverPedidoSeTodosProntos(osId)" in js, (
        "a promocao nao virou funcao propria"
    )
    chamadas = js.count("promoverPedidoSeTodosProntos(osId)")
    assert chamadas >= 3, (
        "esperava a definicao + pelo menos duas chamadas de promoverPedidoSeTodosProntos(osId); "
        "achei %d ocorrencias" % chamadas
    )


def test_a_linha_de_botoes_e_desenhada_por_render_amostras_os_itens():
    """`renderAcoesEmLoteDoPedido` e chamada de `renderAmostrasOSItens`, depois de
    preencher o banner e antes de desenhar os cards. E assim que a linha
    acompanha o pedido aberto -- e some com ele."""
    js = _ler("frontend/script.js")

    i = js.index("function renderAmostrasOSItens(osId) {")
    j = js.index("const itemsHtml = itens.map(", i)
    trecho = js[i:j]
    assert "renderAcoesEmLoteDoPedido(" in trecho, (
        "renderAmostrasOSItens nao chama renderAcoesEmLoteDoPedido antes dos cards"
    )


def test_o_executor_esta_exposto_para_o_onclick():
    js = _ler("frontend/script.js")
    assert "window.acaoEmLoteNoPedido" in js, "acaoEmLoteNoPedido nao esta em window"


def _corpo_da_funcao(js, nome):
    m = re.search(
        r"(?:function\s+" + nome + r"\s*\(|" + nome + r"\s*=\s*(?:async\s+)?function)", js)
    assert m, "nao achei a definicao de " + nome
    i = m.start()
    fim = js.index("\n}", i)
    return js[i:fim + 2]


def test_os_botoes_de_decisao_so_aparecem_para_quem_pode():
    """Os tres botoes existem; os de ALTERACAO e APROVAR ficam atras de
    `podeAgirEmLoteNoPedido('APROVADA')`. O PRONTO nao: e de todo mundo."""
    js = _ler("frontend/script.js")
    corpo = _corpo_da_funcao(js, "renderAcoesEmLoteDoPedido")

    assert "btn-lote-pronto" in corpo, "falta o botao btn-lote-pronto"
    assert "btn-lote-alteracao" in corpo, "falta o botao btn-lote-alteracao"
    assert "btn-lote-aprovar" in corpo, "falta o botao btn-lote-aprovar"

    gate = "podeAgirEmLoteNoPedido('APROVADA')"
    assert gate in corpo, "renderAcoesEmLoteDoPedido nao pergunta podeAgirEmLoteNoPedido('APROVADA')"
    i_gate = corpo.index(gate)
    assert i_gate < corpo.index("btn-lote-alteracao"), (
        "o botao de ALTERACAO precisa vir depois da pergunta podeAgirEmLoteNoPedido('APROVADA')"
    )
    assert i_gate < corpo.index("btn-lote-aprovar"), (
        "o botao de APROVAR precisa vir depois da pergunta podeAgirEmLoteNoPedido('APROVADA')"
    )


def test_os_rotulos_e_o_aviso_de_quem_pode_estao_escritos():
    """Controle novo precisa de rotulo em texto, e quem nao pode precisa ler na
    tela o porque -- em vez de um espaco vazio onde os outros veem botoes."""
    js = _ler("frontend/script.js")

    for rotulo in ("🎨 Marcar todos PRONTO", "❌ Todos em ALTERAÇÃO", "✅ Aprovar todos"):
        assert rotulo in js, "falta o rotulo " + rotulo
    assert "só ADM e Atendimento" in js, (
        "quem nao e ADM/Atendimento precisa ler na tela que so eles aprovam e colocam em alteracao em lote"
    )
