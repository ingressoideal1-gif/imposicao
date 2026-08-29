# -*- coding: utf-8 -*-
"""A fila de modelos do Pedido volta a 100%, com cabecalho de coluna (28/08/2026).

Cada linha carregava os proprios rotulos -- QTD, NI, NF, Bloco, COR, Num.,
Verso e Status escritos DENTRO de cada celula, em cada linha. Oito rotulos
vezes N linhas empurravam a largura para ~2.130 px, e era isso que obrigava a
tela a abrir com `zoom: 0.8`. O curativo custava caro: encolhia 20% TUDO,
inclusive a fonte que foi feita grande de proposito para leitura em pe, na
frente da impressora.

Os rotulos viraram cabecalho de coluna e o zoom saiu. Se alguem devolver os
rotulos para dentro das linhas sem devolver o zoom, a fila deixa de caber na
tela -- e e o harness em Chrome que mede isso, apertando a caixa ate a largura
util de uma tela comum e perguntando se sobrou rolagem horizontal.

Junto vieram duas coisas que o usuario pediu e uma que ele ja tinha corrigido:
o resumo do produto passou a dizer tres numeros (Total, Impressas, Faltam) no
centro da linha, e o nome da tinta no seletor de Cor passou a calcular texto
claro ou escuro em vez de preto fixo.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "fila_do_pedido_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_fila_passa():
    assert os.path.exists(HARNESS), "o harness da fila sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_tela_do_pedido_nao_voltou_ao_zoom():
    """O zoom era o curativo; a causa foi tratada.

    Se ele voltar, e' sinal de que a largura da linha cresceu de novo -- e a
    resposta certa e' encolher a linha, nao a tela inteira.
    """
    css = _ler("frontend/style.css")
    i = css.index("#view-pedido")
    trecho = css[i:i + 120]
    assert "zoom: 1" in trecho, (
        "a tela do Pedido voltou a abrir encolhida: " + trecho.splitlines()[0]
    )


def test_o_cabecalho_de_coluna_nao_mente_na_caixa_misturada():
    """As quatro colunas do meio mudam de significado no CAMAROTE.

    Q_CAM, L_CAM e C_INI ocupam o lugar de QTD, N. inicial e N. final. Numa
    caixa que mistura os dois tipos, um cabecalho unico mentiria para metade das
    linhas -- entao ali os rotulos voltam para dentro da linha.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("function renderPedOSQueue()"):]
    corpo = corpo[:corpo.index("\nfunction updatePedImprimirButtonsVisibility")]

    assert "const comRotulosNaLinha = temCamarote && temComum" in corpo, (
        "a caixa misturada perdeu a excecao: o cabecalho passaria a mentir para "
        "as linhas de Camarote"
    )
    assert "const cabecalhoDaTabela = comRotulosNaLinha ? ''" in corpo, (
        "o cabecalho deixou de sumir na caixa misturada"
    )


def test_o_resumo_do_produto_diz_tres_numeros():
    """Total, Impressas e Faltam.

    A conta de impressas ja existia no `contaDoProduto` e nao chegava a tela: o
    selo dizia so Total e Restante, e faltava justamente o do meio -- quanto ja
    saiu.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("const resumoDoProduto ="):]
    corpo = corpo[:corpo.index("</span>` : '';") + 14]

    for rotulo in ("Total:", "Impressas:", "Faltam:"):
        assert rotulo in corpo, "o resumo do produto perdeu o " + rotulo
    assert "conta.impressa" in pedido[pedido.index("const qtdImpressaProduto"):][:120], (
        "o numero de impressas nao vem mais da conta do produto"
    )


def test_o_nome_da_tinta_e_legivel_sobre_a_propria_tinta():
    """Era preto fixo sobre a cor do modelo.

    Em tinta clara funcionava; em tinta escura -- preto, azul-marinho, comuns
    em grafica -- o nome da cor desaparecia dentro da propria caixa.
    """
    pedido = _ler("frontend/pedido.js")
    assert "function textoLegivelSobre(" in pedido
    corpo = pedido[pedido.index("const corSelectStyle ="):][:400]
    assert "corSelectTexto" in corpo, "o seletor de Cor voltou a forcar uma cor de texto fixa"
    assert "color: #000000 !important" not in corpo, "o preto fixo voltou"
