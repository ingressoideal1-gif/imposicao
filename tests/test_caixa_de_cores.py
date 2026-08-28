# -*- coding: utf-8 -*-
"""A caixa de Gerenciamento de Cores abre fechada, e um botao a mostra.

Pedido do usuario em 28/08/2026: "adicionar botao para esconder o gerenciamento
de cores, so mostrar quando solicitado".

O perfil ICC e do EQUIPAMENTO -- escolhido uma vez, vale para todo pedido que va
para aquela impressora. O operador que imprime dezenas de trabalhos por dia nao
mexe nele nenhuma vez, e a caixa ocupava metade do painel do driver: seletor de
perfil, intento de renderizacao, tres deslizadores, editor de curvas e duas
previas. Fechada, ela cai de 686 px para 52 px de altura na tela.

O comportamento do botao e medido rodando a funcao de verdade no harness em
Node. O que este arquivo cobre e a ligacao com a tela -- e, principalmente, o
que NAO pode ser escondido junto.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "caixa_de_cores_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _caixa_de_cores():
    """O bloco #ped-print-cor-box inteiro, do index.html."""
    fonte = _ler("frontend/index.html")
    i = fonte.index('<div id="ped-print-cor-box"')
    profundidade, j = 0, i
    while True:
        abre = fonte.find("<div", j)
        fecha = fonte.find("</div>", j)
        assert fecha >= 0, "a caixa de cores nao fecha"
        if 0 <= abre < fecha:
            profundidade += 1
            j = abre + 4
        else:
            profundidade -= 1
            j = fecha + 6
            if profundidade == 0:
                return fonte[i:j]


def test_o_harness_da_caixa_de_cores_passa():
    assert os.path.exists(HARNESS), "o harness da caixa de cores sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_caixa_nasce_fechada_e_tem_botao():
    caixa = _caixa_de_cores()

    assert 'id="ped-print-cor-corpo"' in caixa, (
        "o corpo colapsavel sumiu: sem ele nao ha o que o botao esconda"
    )
    corpo = caixa[caixa.index('id="ped-print-cor-corpo"'):]
    assert "display:none" in corpo[:200], (
        "o corpo nao nasce mais escondido -- o usuario pediu que a caixa so "
        "aparecesse quando solicitada"
    )
    assert "alternarGerenciamentoDeCores()" in caixa, (
        "o botao nao chama mais o alternador"
    )
    assert 'id="ped-print-cor-btn"' in caixa, "o botao de mostrar/ocultar sumiu"


def test_o_que_diz_o_que_sai_no_papel_nao_se_esconde():
    """A trave desta mudanca.

    Esconder os CONTROLES e economia de tela. Esconder o ESTADO seria outra
    coisa: o operador imprimiria com um perfil ICC ligado sem nada na tela
    dizendo que ha um perfil ligado, e so descobriria olhando o papel.

    Por isso a caixa "Ativo" e a linha de status ficam FORA do corpo que colapsa.
    """
    caixa = _caixa_de_cores()

    i_corpo = caixa.index('id="ped-print-cor-corpo"')
    i_fecha = caixa.index("/ped-print-cor-corpo")

    i_ativo = caixa.index('id="ped-print-cor-ativo"')
    assert i_ativo < i_corpo, (
        'a caixa "Ativo" entrou no bloco que colapsa: com a caixa fechada o '
        "operador nao veria que o gerenciamento de cores esta ligado"
    )

    i_status = caixa.index('id="ped-print-cor-status"')
    assert i_status > i_fecha, (
        "a linha de status entrou no bloco que colapsa: e ela que diz, em uma "
        "frase, o que vai sair no papel"
    )
