# -*- coding: utf-8 -*-
"""O texto cai na mesma altura na tela e no papel.

## O defeito, medido em 27/08/2026

Os dois lados centram o texto na vertical, mas por réguas diferentes.

O navegador, com `textBaseline='middle'`, usa as medidas de altura gravadas
DENTRO do arquivo da fonte — o `sTypoAscender` e o `sTypoDescender` da tabela
OS/2, normalizados para somar o corpo. Medido em nove fontes, a fração bate até a
quinta casa decimal:

    deslocamento = corpo × ( typoAsc / (typoAsc + |typoDesc|) − 0,5 )

O motor usava uma fração FIXA — 0,72 e 0,21 — para toda fonte que não fosse uma
das seis embutidas no PDF, e uma conta diferente, `(asc − desc) / 2`. Onde a fonte
real tem outras proporções, o papel depositava a linha mais alta do que a tela
mostrou:

    Impact, corpo 40 pt   tela: centro a +1,44 pt da âncora
                          papel: centro a −3,42 pt
                          -> 4,86 pt = 1,71 mm mais alto no papel

O erro é proporcional ao corpo, então o mesmo defeito custa o dobro num número
grande. No acervo, 350 dos 694 elementos são texto.

## O que estes testes prendem

A mancha de tinta do PDF gerado pelo motor, contra a mancha de tinta que o Chrome
desenha com o MESMO arquivo de fonte. Os valores de referência foram medidos no
navegador (canvas a 8 px por ponto, string `Hxg`, corpo 40 pt) e estão anotados
caso a caso — refazê-los é rodar o mesmo desenho e ler o pixel.
"""
import base64
import os

import fitz
import pytest

from engine import ImpositionEngine, MM2PT

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTES = os.path.join(RAIZ, "frontend", "fonts_local")

CX_PT, CY_PT = 200.0, 150.0
CORPO = 40.0
TEXTO = "Hxg"

# Centro vertical da mancha de tinta, em pontos, medido no Chrome com o mesmo
# arquivo, corpo 40 pt e `textBaseline='middle'` ancorado em (0, 0).
NA_TELA = {
    "verdana.ttf": 1.125,
    "comicbd.ttf": 0.125,
    "courbd.ttf": 2.4375,
    "seguisbi.ttf": 1.750,
    "impact.ttf": 1.4375,
}


def _tinta_dy(font_path):
    """Distância do centro da mancha até a âncora do elemento, em pontos."""
    el = {
        "type": "FIXED", "fixed": True, "fixed_value": TEXTO,
        "_x": CX_PT, "_y": CY_PT, "font_size": CORPO, "color": "#000000",
        "rotation": 0, "font_name": "system:Teste",
        "_font_data": base64.b64encode(open(font_path, "rb").read()).decode(),
    }
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._render_element(page, el, 0, 0, 1, None)
    dpi = 600
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    esc = dpi / 72.0
    y0, y1 = 10 ** 9, -1
    for y in range(pix.height):
        base = y * pix.stride
        linha = pix.samples[base:base + pix.width]
        if any(v < 128 for v in linha):
            y0 = min(y0, y)
            y1 = max(y1, y)
    doc.close()
    assert y1 >= 0, "nao ha tinta na pagina"
    return ((y0 + y1 + 1) / 2 / esc) - CY_PT


@pytest.mark.parametrize("fonte", sorted(NA_TELA))
def test_a_altura_do_texto_bate_com_a_tela(fonte):
    caminho = os.path.join(FONTES, fonte)
    if not os.path.exists(caminho):
        caminho = os.path.join(RAIZ, "fonts", fonte)
    assert os.path.exists(caminho), f"a fonte de teste sumiu: {fonte}"

    no_papel = _tinta_dy(caminho)
    na_tela = NA_TELA[fonte]
    erro_pt = no_papel - na_tela
    assert abs(erro_pt) < 0.25, (
        f"{fonte}: o papel deposita o texto {erro_pt:+.2f} pt "
        f"({erro_pt / MM2PT:+.2f} mm) fora do que a tela mostra"
    )


def test_a_fracao_vem_do_arquivo_da_fonte():
    """A regra é a do navegador, e ela é sobre o arquivo — não uma média."""
    from engine import _fracao_do_meio_da_fonte
    caminho = os.path.join(FONTES, "impact.ttf")
    if not os.path.exists(caminho):
        caminho = os.path.join(RAIZ, "fonts", "impact.ttf")
    # Medido no Chrome: 0,376078 do corpo.
    assert abs(_fracao_do_meio_da_fonte(caminho) - 0.376078) < 0.0005


def test_arquivo_ilegivel_nao_derruba_a_imposicao(tmp_path):
    """Fonte quebrada volta para a média de sempre, e o papel sai."""
    from engine import _fracao_do_meio_da_fonte
    ruim = tmp_path / "quebrada.ttf"
    ruim.write_bytes(b"nao sou uma fonte")
    assert _fracao_do_meio_da_fonte(str(ruim)) == pytest.approx((0.72 - 0.21) / 2)


def test_as_base14_usam_a_mesma_formula():
    """`helv` imprime Helvetica e a tela mostra Arial: as duas tem a mesma
    proporcao, entao a formula unica serve as duas pontas."""
    from engine import _fracao_das_base14
    # Helvetica: asc 0,718 desc 0,207 -> 0,718/0,925 - 0,5
    assert abs(_fracao_das_base14("helv") - 0.27622) < 0.0005
    # Chrome com Arial mediu 0,27575 — 0,0005 do corpo de diferenca, 0,002 mm a 12 pt.
