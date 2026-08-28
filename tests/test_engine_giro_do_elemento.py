# -*- coding: utf-8 -*-
"""Girar um elemento gira a CAIXA dele, e não só o conteúdo dentro dela.

## O defeito, medido em 27/08/2026

O canvas de todas as janelas gira a caixa: um elemento de 40 × 20 mm a 90 graus
passa a ocupar 20 × 40 mm na peça. O motor mantinha a caixa em 40 × 20 e girava o
conteúdo DENTRO dela — e como PDF, SVG e foto entram com encaixe proporcional, a
arte encolhia para caber no que sobrava:

    SVG 40 × 20 mm a 90 graus   tela  20,00 × 40,00 mm
                                papel 10,08 × 19,98 mm   (um quarto da área)

    FOTO 25 × 32 mm a 90 graus  tela  32,00 × 25,00 mm
                                papel 25,06 × 19,64 mm

A rotação é um seletor de quatro opções no cartão de todo elemento, então o
defeito estava a um clique de distância. No acervo havia um único elemento nessa
situação, o que tornava o conserto barato — mas ele nunca foi barato de descobrir.

O código de barras entrou no mesmo conserto por outro caminho: desde que o
desenho dele virou vetorial, quem gira é o `morph`, que gira a caixa por
construção (`tests/test_engine_codigo_de_barras.py`).
"""
import base64

import fitz
import pytest

from engine import ImpositionEngine, MM2PT

CX_PT, CY_PT = 200.0, 150.0

SVG_CHEIO = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" '
    'viewBox="0 0 40 20"><rect width="40" height="20" fill="#000"/></svg>'
)


def _pdf_cheio(larg_mm, alt_mm):
    d = fitz.open()
    p = d.new_page(width=larg_mm * MM2PT, height=alt_mm * MM2PT)
    p.draw_rect(p.rect, color=None, fill=(0, 0, 0))
    dados = base64.b64encode(d.tobytes()).decode()
    d.close()
    return dados


def _desenhar(el, linha=None):
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._url_cache = {}
    eng._foto_cache = {}
    eng._render_element(page, el, 0, 0, 1, linha)
    return doc, page


def _tinta_mm(page, dpi=300):
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    esc = dpi / 72.0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for y in range(pix.height):
        base = y * pix.stride
        linha = pix.samples[base:base + pix.width]
        for x in range(pix.width):
            if linha[x] < 128:
                x0 = min(x0, x); x1 = max(x1, x)
                y0 = min(y0, y); y1 = max(y1, y)
    assert x1 >= 0, "nao ha tinta na pagina"
    return ((x1 - x0 + 1) / esc / MM2PT, (y1 - y0 + 1) / esc / MM2PT,
            ((x0 + x1 + 1) / 2 / esc - CX_PT) / MM2PT,
            ((y0 + y1 + 1) / 2 / esc - CY_PT) / MM2PT)


@pytest.mark.parametrize("giro,esperado", [
    (0, (40.0, 20.0)), (180, (40.0, 20.0)),
    (90, (20.0, 40.0)), (270, (20.0, 40.0)),
])
def test_o_SVG_girado_mantem_o_tamanho(giro, esperado):
    el = {"type": "SVG", "_x": CX_PT, "_y": CY_PT, "width_mm": 40, "height_mm": 20,
          "svg_content": SVG_CHEIO, "rotation": giro, "color": "#000000"}
    doc, page = _desenhar(el)
    larg, alt, dx, dy = _tinta_mm(page)
    doc.close()
    assert abs(larg - esperado[0]) < 0.3 and abs(alt - esperado[1]) < 0.3, (
        f"giro {giro}: papel {larg:.2f} x {alt:.2f} mm, esperado "
        f"{esperado[0]} x {esperado[1]} — a caixa nao girou junto")
    assert abs(dx) < 0.2 and abs(dy) < 0.2, f"giro {giro}: saiu do centro"


@pytest.mark.parametrize("giro,esperado", [
    (0, (40.0, 20.0)), (90, (20.0, 40.0)), (270, (20.0, 40.0)),
])
def test_o_PDF_girado_mantem_o_tamanho(giro, esperado):
    el = {"type": "PDF", "_x": CX_PT, "_y": CY_PT, "width_mm": 40, "height_mm": 20,
          "pdf_content": _pdf_cheio(40, 20), "rotation": giro, "color": "#000000"}
    doc, page = _desenhar(el)
    larg, alt, dx, dy = _tinta_mm(page)
    doc.close()
    assert abs(larg - esperado[0]) < 0.3 and abs(alt - esperado[1]) < 0.3, (
        f"giro {giro}: papel {larg:.2f} x {alt:.2f} mm, esperado "
        f"{esperado[0]} x {esperado[1]}")
    assert abs(dx) < 0.2 and abs(dy) < 0.2, f"giro {giro}: saiu do centro"


@pytest.mark.parametrize("giro,esperado", [
    (0, (25.0, 32.0)), (90, (32.0, 25.0)), (270, (32.0, 25.0)),
])
def test_a_FOTO_girada_mantem_a_janela(giro, esperado, tmp_path):
    from PIL import Image
    caminho = str(tmp_path / "foto.png")
    Image.new("RGB", (300, 400), (0, 0, 0)).save(caminho)

    el = {"type": "FOTO", "_x": CX_PT, "_y": CY_PT, "width_mm": 25, "height_mm": 32,
          "csv_column": "Foto", "fit": "cover", "corner": "square", "rotation": giro}
    linha = {"Foto": caminho,
             "__fotos": {"Foto": {"url": caminho, "cx": 0.5, "cy": 0.5,
                                  "zoom": 1.0, "rot": 0}}}
    doc, page = _desenhar(el, linha)
    larg, alt, dx, dy = _tinta_mm(page)
    doc.close()
    assert abs(larg - esperado[0]) < 0.3 and abs(alt - esperado[1]) < 0.3, (
        f"giro {giro}: papel {larg:.2f} x {alt:.2f} mm, esperado "
        f"{esperado[0]} x {esperado[1]}")
    assert abs(dx) < 0.2 and abs(dy) < 0.2, f"giro {giro}: saiu do centro"
