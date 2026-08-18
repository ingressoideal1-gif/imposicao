# -*- coding: utf-8 -*-
"""
Opacidade dos elementos PDF e SVG da numeracao.

A medicao aqui e do PAPEL, nao da estrutura do PDF: cada teste rasteriza a
pagina e le a cor do pixel. E o unico jeito honesto de afirmar "saiu a 50%" —
a arvore de objetos pode estar certa e a tinta sair errada.

O cenario e sempre o mesmo: uma pagina AZUL, e por cima dela um elemento cuja
arte e um quadrado VERMELHO na metade esquerda e vazio (transparente) na
direita. Com isso, um unico raster responde as duas perguntas que importam:

  · onde ha desenho, a cor mistura na proporcao pedida?
  · onde o arquivo e vazio, o fundo continua intacto — sem veu branco?

O segundo caso e o que quebra na implementacao ingenua (rasterizar sobre
branco), e e justamente o que arruinaria uma tiragem: a arte por baixo sairia
lavada.
"""
import io

import fitz
import pytest

from engine import ImpositionEngine, MM2PT

PAG_W, PAG_H = 300.0, 200.0
CX_PT, CY_PT = PAG_W / 2, PAG_H / 2

EL_W_MM, EL_H_MM = 50.0, 25.0
EL_W, EL_H = EL_W_MM * MM2PT, EL_H_MM * MM2PT

AZUL = (0, 0, 255)


@pytest.fixture(scope="module")
def arte_pdf_b64():
    """PDF 100x50 pt: quadrado vermelho a esquerda, metade direita vazia."""
    import base64

    doc = fitz.open()
    p = doc.new_page(width=100, height=50)
    p.draw_rect(fitz.Rect(0, 0, 50, 50), color=None, fill=(1, 0, 0))
    dados = doc.tobytes()
    doc.close()
    return base64.b64encode(dados).decode("ascii")


ARTE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" '
    'viewBox="0 0 100 50"><rect x="0" y="0" width="50" height="50" fill="#ff0000"/></svg>'
)


def _pintar(el):
    """Pagina azul + o elemento por cima. Devolve o raster."""
    doc = fitz.open()
    page = doc.new_page(width=PAG_W, height=PAG_H)
    page.draw_rect(page.rect, color=None, fill=(0, 0, 1))

    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    eng._render_element(page, el, 0, 0, 1, {})

    pix = page.get_pixmap(dpi=150)
    return pix


def _el_pdf(b64, **extra):
    el = {
        "type": "PDF", "pdf_content": b64,
        "_x": CX_PT, "_y": CY_PT,
        "width_mm": EL_W_MM, "height_mm": EL_H_MM, "rotation": 0,
    }
    el.update(extra)
    return el


def _el_svg(**extra):
    el = {
        "type": "SVG", "svg_content": ARTE_SVG,
        "_x": CX_PT, "_y": CY_PT,
        "width_mm": EL_W_MM, "height_mm": EL_H_MM, "rotation": 0,
    }
    el.update(extra)
    return el


def _cor(pix, x_pt, y_pt):
    f = pix.width / PAG_W
    return tuple(pix.pixel(int(x_pt * f), int(y_pt * f))[:3])


def _sobre_o_desenho(pix):
    """Pixel bem dentro da metade esquerda do elemento, onde ha vermelho."""
    return _cor(pix, CX_PT - EL_W / 4, CY_PT)


def _sobre_o_vazio(pix):
    """Pixel na metade direita do elemento, onde o arquivo nao tem nada."""
    return _cor(pix, CX_PT + EL_W / 4, CY_PT)


# ─── o padrao nao muda nada ───────────────────────────────────────────────────

def test_sem_o_campo_sai_opaco_como_sempre_saiu(arte_pdf_b64):
    """Todo o acervo anterior foi gravado sem `opacity`. Nao pode mudar."""
    pix = _pintar(_el_pdf(arte_pdf_b64))
    r, g, b = _sobre_o_desenho(pix)
    assert r > 240 and g < 20 and b < 20, "vermelho puro esperado"
    assert _sobre_o_vazio(pix) == AZUL


def test_opacidade_100_e_identica_a_ausencia_do_campo(arte_pdf_b64):
    sem = _pintar(_el_pdf(arte_pdf_b64))
    com = _pintar(_el_pdf(arte_pdf_b64, opacity=1))
    assert _sobre_o_desenho(sem) == _sobre_o_desenho(com)
    assert _sobre_o_vazio(sem) == _sobre_o_vazio(com)


def test_a_100_por_cento_o_pdf_continua_vetorial(arte_pdf_b64):
    """Opaco segue pelo show_pdf_page: nenhuma imagem entra na pagina.

    Este e o teste que protege o que ja esta aprovado. Se um dia alguem
    simplificar mandando tudo pelo caminho do raster, ele acusa.
    """
    doc = fitz.open()
    page = doc.new_page(width=PAG_W, height=PAG_H)
    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    eng._render_element(page, _el_pdf(arte_pdf_b64), 0, 0, 1, {})
    assert page.get_images() == [], "a 100% nao pode haver rasterizacao"


# ─── a transparencia de fato ──────────────────────────────────────────────────

@pytest.mark.parametrize("op,alvo", [(0.5, 128), (0.25, 191), (0.75, 64)])
def test_a_cor_mistura_na_proporcao_pedida(arte_pdf_b64, op, alvo):
    """Vermelho a `op` sobre azul: o azul restante tem de ser (1-op)*255."""
    pix = _pintar(_el_pdf(arte_pdf_b64, opacity=op))
    r, g, b = _sobre_o_desenho(pix)
    assert abs(b - alvo) <= 6, f"azul restante {b}, esperado ~{alvo}"
    assert abs(r - round(255 * op)) <= 6, f"vermelho {r}, esperado ~{round(255 * op)}"
    assert g < 20


def test_a_area_vazia_do_arquivo_nao_vela_o_fundo(arte_pdf_b64):
    """O erro que arruinaria a tiragem: rasterizar sobre branco lavaria a arte."""
    pix = _pintar(_el_pdf(arte_pdf_b64, opacity=0.5))
    assert _sobre_o_vazio(pix) == AZUL


def test_zero_nao_pinta_nada(arte_pdf_b64):
    pix = _pintar(_el_pdf(arte_pdf_b64, opacity=0))
    assert _sobre_o_desenho(pix) == AZUL
    assert _sobre_o_vazio(pix) == AZUL


def test_svg_obedece_a_mesma_opacidade():
    """O seletor e um so no painel; os dois tipos tem de responder igual."""
    pix = _pintar(_el_svg(opacity=0.5))
    r, g, b = _sobre_o_desenho(pix)
    assert abs(b - 128) <= 8, f"azul restante {b}"
    assert abs(r - 128) <= 8, f"vermelho {r}"
    assert _sobre_o_vazio(pix) == AZUL


# ─── valor invalido nao pode sumir com a arte ─────────────────────────────────

@pytest.mark.parametrize("valor", [None, "", "abc", float("nan")])
def test_valor_invalido_cai_para_opaco(arte_pdf_b64, valor):
    """Diante de lixo, imprimir opaco e o unico erro seguro: some arte nenhuma."""
    pix = _pintar(_el_pdf(arte_pdf_b64, opacity=valor))
    r, g, b = _sobre_o_desenho(pix)
    assert r > 240 and b < 20


@pytest.mark.parametrize("valor,esperado_b", [(2, 0), (-1, 255)])
def test_fora_da_faixa_e_grampeado(arte_pdf_b64, valor, esperado_b):
    """Acima de 1 vira opaco; abaixo de 0 vira invisivel."""
    pix = _pintar(_el_pdf(arte_pdf_b64, opacity=valor))
    b = _sobre_o_desenho(pix)[2]
    assert abs(b - esperado_b) <= 6
