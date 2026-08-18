# -*- coding: utf-8 -*-
"""A arte em PDF entra na amostra no tamanho real, como a impressora faz.

Havia duas regras diferentes para a mesma coisa, e ninguém percebia enquanto a
arte tinha exatamente o tamanho da peça:

- **O motor** (`engine.py`) abre a arte em PDF e a coloca na célula com o rect
  do tamanho da *própria página* (`base_w`/`base_h`), centrada. A arte nunca é
  reduzida; o que passa da peça fica de fora, que é o que a faca corta.
- **A amostra na tela** encolhia a arte até o arquivo inteiro caber dentro da
  peça.

Onde a arte não batia com a peça, o operador via na tela uma arte menor do que
a que ia sair no papel, com faixa branca em volta que o papel não tem. Medido em
18/08/2026 nos 25 modelos mais recentes: as credenciais têm arte de 98 x 148 mm
numa peça de 105 x 148 mm, e dois modelos do pedido 20508 têm arte de 245 x 20 mm
numa peça Mobi de 148,5 x 52,25 mm — nesse a arte aparecia a 60% do tamanho.

A conversão: a página do PDF vem em pontos (2,8346 pt = 1 mm) e o canvas tem S
pixels por milímetro, então a escala do tamanho real é `S / 2.8346`.

Arte em **imagem** é outro caso e continua encaixando proporcionalmente: o motor
faz o mesmo com ela em `_load_base_as_pdf()`, que converte a imagem para uma
página do tamanho do item e encaixa dentro. O comentário lá diz, com todas as
letras, "equivalente ao frontend".
"""

import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _corpo_da_funcao(fonte, assinatura):
    inicio = fonte.index(assinatura)
    return fonte[inicio:fonte.index("\n}", inicio)]


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/cliente.js"])
def test_a_arte_em_pdf_usa_a_escala_do_tamanho_real(arquivo):
    corpo = _corpo_da_funcao(_ler(arquivo), "async function drawAmostraFace(")
    # `S / 2.8346` sozinho nao serve de prova: a camada da COR ja usava essa
    # conversao antes do conserto. O que distingue e a escala da ARTE.
    assert "const escalaTamanhoReal = S / 2.8346;" in corpo, (
        f"{arquivo}: drawAmostraFace nao calcula mais a escala do tamanho real da "
        f"arte. Sem isso a arte em PDF deixa de sair do tamanho que vai imprimir."
    )
    assert "page.getViewport({ scale: escalaTamanhoReal })" in corpo, (
        f"{arquivo}: a escala do tamanho real foi calculada e nao foi usada no "
        f"viewport da arte."
    )


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/cliente.js"])
def test_a_arte_em_pdf_nao_volta_a_encolher_ate_caber(arquivo):
    corpo = _corpo_da_funcao(_ler(arquivo), "async function drawAmostraFace(")
    for proibido in ("pdfScale = finalWidth / vp.width", "pdfScale = finalHeight / vp.height"):
        assert proibido not in corpo, (
            f"{arquivo}: a arte em PDF voltou a ser reduzida para caber na peca "
            f"({proibido}). A impressora nao reduz, entao a tela passa a mostrar "
            f"a arte menor do que ela sai no papel."
        )


def test_o_criador_de_arte_usa_a_mesma_regra_do_card():
    """O editor reproduz o card. Divergir poe a arte num lugar no editor e noutro no pedido."""
    corpo = _corpo_da_funcao(_ler("frontend/criador-arte.js"), "async function carregarArteBaseNoCanvas(")
    assert "escalaPranchaPxPorMm / (2.0 * 2.8346)" in corpo, (
        "criador-arte.js nao poe mais a arte em PDF no tamanho real. O editor volta a "
        "mostrar a arte num tamanho e o card do pedido noutro."
    )
    assert "if (ehPdf)" in corpo, (
        "criador-arte.js perdeu a separacao entre arte em PDF (tamanho real) e arte em "
        "imagem (contain)."
    )


def test_o_motor_continua_pondo_a_arte_no_tamanho_da_propria_pagina():
    """Se o motor mudar de regra, a tela tem de mudar junto — e este teste avisa."""
    fonte = _ler("engine.py")
    assert "base_w = page_base.rect.width" in fonte
    assert "base_h = page_base.rect.height" in fonte
    assert "art_out_x0 + base_w, art_out_y0 + base_h" in fonte, (
        "engine.py nao poe mais a arte com o rect do tamanho da propria pagina. "
        "A amostra na tela copia essa regra e precisa ser revista junto."
    )
