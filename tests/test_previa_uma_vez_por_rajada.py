# -*- coding: utf-8 -*-
"""A janela de visualizacao se redesenha uma vez por rajada (27/08/2026).

Medido na tela, no pedido 21202, um clique num modelo chamava o `drawPedPreview`
8 a 9 vezes -- sete delas saindo do `updatePedSummary`, que por sua vez e
disparado por cada `change` dos selects que a abertura do modelo preenche. Cada
desenho custa ~33 ms (a janela mostra UMA folha, a atual, e nao as N do modelo),
entao a economia e modesta: ~56 ms. O que ela evita, alem disso, e a folha
piscando sete vezes ate a configuracao final.

Mesmo desenho de duas pontas do `agendarRedesenhoDasFilas` (v741). O
comportamento do agendador e medido pelo harness em Node; o que este arquivo
cobre e a ligacao, e a ponta que nao pode ser perdida.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "previa_uma_vez_por_rajada_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_previa_passa():
    assert os.path.exists(HARNESS), "o harness da previa sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_updatePedSummary_agenda_em_vez_de_desenhar():
    """As duas saidas da funcao passam pelo agendador."""
    fonte = _ler("frontend/pedido.js")
    i = fonte.index("function updatePedSummary() {")
    corpo = fonte[i:fonte.index("function drawPedPreviewLegenda", i)] \
        if "function drawPedPreviewLegenda" in fonte[i:] else fonte[i:i + 12000]
    assert "agendarRedesenhoDaPrevia();" in corpo, (
        "updatePedSummary nao usa mais o agendador da previa"
    )


def test_a_previa_desenha_no_COMECO_da_rajada():
    """A folha anterior nao pode ficar na tela.

    O proprio `drawPedPreview` traz a nota: a previa e um canvas que so muda
    quando alguem desenha nele, entao sair sem desenhar deixa a folha do desenho
    ANTERIOR -- e o operador conferiria uma folha que nao corresponde mais ao
    que esta configurado. Um agendador que so desenhasse no FIM da rajada
    reintroduziria exatamente isso.
    """
    fonte = _ler("frontend/pedido.js")
    i = fonte.index("function agendarRedesenhoDaPrevia()")
    corpo = fonte[i:fonte.index("\n}", i)]
    assert "_previaDesenhaAgora" in corpo and "drawPedPreview();" in corpo, (
        "o agendador da previa perdeu o desenho do comeco da rajada"
    )
