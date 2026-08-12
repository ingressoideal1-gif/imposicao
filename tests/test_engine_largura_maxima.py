# -*- coding: utf-8 -*-
"""
max_width_mm no elemento TEXT limita o texto DESENHADO no PDF.

Renderiza um elemento direto numa pagina fitz via _render_element e mede as
palavras desenhadas (page.get_text). E o mesmo caminho da impressao real: o
que passar aqui e o que sai no papel.

Nota de geometria: _render_element recebe o centro do elemento ja em pontos,
nas chaves _x/_y (quem converte de x_mm e o chamador). Os testes passam _x/_y
direto.
"""
import fitz
import pytest

from engine import ImpositionEngine, MM2PT

CX_PT = 200.0  # centro X do elemento na pagina de teste, em pontos
CY_PT = 150.0


def _desenhar(el, csv_row=None, val=1):
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    # _render_element nao toca estado do self no caminho Base-14 (sem fontfile)
    eng = object.__new__(ImpositionEngine)
    eng._render_element(page, el, 0, 0, val, csv_row)
    return doc, page


def _larguras_das_linhas(page):
    """Largura (pt) de cada linha de texto desenhada na pagina."""
    linhas = {}
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            y = round(l["bbox"][1], 1)
            x0 = min(s["bbox"][0] for s in l["spans"])
            x1 = max(s["bbox"][2] for s in l["spans"])
            linhas[y] = max(linhas.get(y, 0), x1 - x0)
    return list(linhas.values())


def _el_base(**extra):
    el = {
        "type": "TEXT", "source": "database", "csv_column": "Nome",
        "_x": CX_PT, "_y": CY_PT, "font_size": 14, "color": "#000000",
        "rotation": 0,
    }
    el.update(extra)
    return el


LINHA = {"Nome": "NOME MUITO COMPRIDO PARA O ESPACO"}


def test_sem_largura_nao_muda_nada():
    doc, page = _desenhar(_el_base(), LINHA)
    livre = _larguras_das_linhas(page)
    assert len(livre) == 1
    assert livre[0] > 20 * MM2PT  # sem limite, estoura os 20 mm de proposito


def test_shrink_o_texto_cabe_na_largura():
    doc, page = _desenhar(_el_base(max_width_mm=20, overflow="shrink"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert len(larguras) == 1
    assert larguras[0] <= 20 * MM2PT * 1.02  # 2% de tolerancia de medicao


def test_wrap_quebra_e_cada_linha_cabe():
    doc, page = _desenhar(_el_base(max_width_mm=25, overflow="wrap"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert len(larguras) > 1
    for w in larguras:
        assert w <= 25 * MM2PT * 1.02


def test_alinhamento_esquerda_encosta_na_borda_da_caixa():
    caixa = 40 * MM2PT
    doc, page = _desenhar(
        _el_base(max_width_mm=40, overflow="wrap", text_align="left"),
        {"Nome": "Ana Bia Carlos Daniela Eduardo Fernanda"})
    xs = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            xs.append(min(s["bbox"][0] for s in l["spans"]))
    assert len(xs) > 1
    for x0 in xs:
        assert abs(x0 - (CX_PT - caixa / 2)) < 2.0  # toda linha nasce na borda esquerda


def test_alinhamento_direita_encosta_na_outra_borda():
    caixa = 40 * MM2PT
    doc, page = _desenhar(
        _el_base(max_width_mm=40, overflow="wrap", text_align="right"),
        {"Nome": "Ana Bia Carlos Daniela Eduardo Fernanda"})
    xs = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            xs.append(max(s["bbox"][2] for s in l["spans"]))
    assert len(xs) > 1
    for x1 in xs:
        assert abs(x1 - (CX_PT + caixa / 2)) < 2.5  # toda linha termina na borda direita
