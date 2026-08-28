# -*- coding: utf-8 -*-
"""O código de barras sai do tamanho que foi pedido, e sai vetorial.

## O defeito, medido em 27/08/2026

A imagem que o `python-barcode` devolve traz uma faixa branca fixa em cima e
outra embaixo — 1 mm de cada lado, somados ao `module_height`. Ela era esticada
para preencher a caixa do elemento, e a folga entrava junto:

    elemento de 60 x 12 mm  ->  barras impressas com 60,03 x 10,67 mm

Ou seja, 89% da altura pedida. A altura da barra não é estética: é requisito de
leitura. Quem digita 12 mm recebia 10,67, e nenhuma janela mostrava isso — a
prévia desenha barras ocupando a caixa inteira.

## O conserto

As barras deixaram de ser uma imagem. O motor pede à biblioteca só o PADRÃO de
módulos (`build()`), e desenha as barras como retângulos vetoriais numa página do
tamanho exato do elemento. Três ganhos de uma vez:

  · a altura é a pedida, por construção — não há folga para esticar;
  · o traço sai na resolução do RIP da impressora, e não nos 300 dpi que o código
    escolhia — o mesmo princípio que vale para a arte do cliente;
  · fica mais rápido. Medido: gerar a imagem custava 4,58 ms por código, e
    recortar a folga dela custaria outros 2,01 ms. Numa tiragem de 100.000 peças
    o recorte sozinho somaria mais de três minutos, numa gráfica em que o tempo
    de imposição é o motivo de o agente existir.

O fundo branco continua: ele é o contraste que o leitor precisa quando o código
cai sobre arte colorida.

Conferido antes de trocar: em todas as simbologias que o motor aceita, a imagem
antiga desenhava TODAS as barras com a mesma altura (linhas 11 a 188 de 200), sem
barra de guarda mais comprida. O desenho vetorial reproduz isso exatamente.
"""
import fitz
import pytest

from engine import ImpositionEngine, MM2PT

CX_PT, CY_PT = 200.0, 150.0
LARG_MM, ALT_MM = 60.0, 12.0


def _el(**extra):
    el = {
        "type": "BARCODE", "fixed": True, "fixed_value": "12345678",
        "_x": CX_PT, "_y": CY_PT, "width_mm": LARG_MM, "height_mm": ALT_MM,
        "_w": LARG_MM * MM2PT, "_h": ALT_MM * MM2PT,
        "color": "#000000", "rotation": 0, "barcode_format": "code128",
    }
    el.update(extra)
    return el


def _desenhar(el):
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._render_element(page, el, 0, 0, 1, None)
    return doc, page


def _caixa_da_tinta(page, dpi=600):
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
    assert x1 >= 0, "nao ha tinta nenhuma na pagina"
    return ((x1 - x0 + 1) / esc / MM2PT, (y1 - y0 + 1) / esc / MM2PT,
            ((x0 + x1 + 1) / 2 / esc - CX_PT) / MM2PT,
            ((y0 + y1 + 1) / 2 / esc - CY_PT) / MM2PT)


def test_as_barras_ocupam_a_altura_pedida():
    doc, page = _desenhar(_el())
    larg, alt, _, _ = _caixa_da_tinta(page)
    doc.close()
    assert abs(alt - ALT_MM) < 0.15, f"a altura impressa foi {alt:.2f} mm, e nao {ALT_MM}"


def test_as_barras_ocupam_a_largura_pedida():
    doc, page = _desenhar(_el())
    larg, alt, _, _ = _caixa_da_tinta(page)
    doc.close()
    assert abs(larg - LARG_MM) < 0.15, f"a largura impressa foi {larg:.2f} mm"


def test_o_codigo_fica_centrado_na_ancora():
    doc, page = _desenhar(_el())
    _, _, dx, dy = _caixa_da_tinta(page)
    doc.close()
    assert abs(dx) < 0.1 and abs(dy) < 0.1, f"saiu deslocado: dx={dx:.2f} dy={dy:.2f}"


def test_o_codigo_sai_vetorial():
    """Vetor sai na resolucao do RIP; imagem sai na que o codigo escolheu."""
    doc, page = _desenhar(_el())
    imagens = page.get_images(full=True)
    doc.close()
    assert imagens == [], f"o codigo de barras ainda entra como imagem: {imagens}"


def test_o_fundo_branco_continua():
    """Sem ele, um codigo sobre arte colorida perde o contraste que o leitor pede.

    A conferencia e sobre ARTE ESCURA de proposito: numa pagina em branco o
    fundo transparente e o fundo branco sao indistinguiveis, e o teste passaria
    dos dois jeitos.
    """
    import barcode
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    page.draw_rect(page.rect, color=None, fill=(0, 0, 0))   # a arte por baixo
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._render_element(page, _el(), 0, 0, 1, None)

    padrao = barcode.get("code128", "12345678").build()[0]
    i_claro = padrao.index("0")
    largura_modulo = LARG_MM * MM2PT / len(padrao)
    x_pt = CX_PT - (LARG_MM / 2) * MM2PT + (i_claro + 0.5) * largura_modulo

    pix = page.get_pixmap(dpi=300, colorspace=fitz.csRGB)
    esc = 300 / 72.0
    i = (int(CY_PT * esc) * pix.width + int(x_pt * esc)) * pix.n
    cor = tuple(pix.samples[i:i + 3])
    doc.close()
    assert cor == (255, 255, 255), (
        f"o espaco entre barras deixou a arte escura aparecer: {cor}")


@pytest.mark.parametrize("fmt,dado", [
    ("code128", "12345678"), ("code39", "ABC123"), ("ean13", "123456789012"),
    ("ean8", "1234567"), ("upca", "12345678901"), ("itf", "123456"),
])
def test_cada_simbologia_desenha_o_padrao_da_biblioteca(fmt, dado):
    """O desenho tem de ser o codigo, nao um padrao qualquer que pareca um."""
    import barcode
    esperado = barcode.get(fmt, dado).build()[0]

    doc, page = _desenhar(_el(barcode_format=fmt, fixed_value=dado))
    pix = page.get_pixmap(dpi=1200, colorspace=fitz.csGRAY)
    esc = 1200 / 72.0
    x_ini = (CX_PT - (LARG_MM / 2) * MM2PT)
    largura_modulo = LARG_MM * MM2PT / len(esperado)
    y = int(CY_PT * esc)
    lido = ""
    for i in range(len(esperado)):
        px = int((x_ini + (i + 0.5) * largura_modulo) * esc)
        lido += "1" if pix.samples[y * pix.stride + px] < 128 else "0"
    doc.close()
    iguais = sum(1 for a, b in zip(lido, esperado) if a == b)
    assert iguais == len(esperado), (
        f"{fmt}: {len(esperado) - iguais} de {len(esperado)} modulos divergiram"
    )


def test_girado_90_a_CAIXA_gira_junto():
    """A tela gira a caixa; a imagem antiga girava so o conteudo dentro dela.

    Medido na versao anterior, com um codigo de 60 x 12 mm a 90 graus: o papel
    saia com 53,4 x 12,0 mm — deitado, dentro de um retangulo que nao girou —
    enquanto todas as janelas mostravam 12 x 60. Agora quem gira e a caixa, pelo
    `morph`, e os dois lados concordam.
    """
    doc, page = _desenhar(_el(rotation=90))
    larg, alt, dx, dy = _caixa_da_tinta(page, dpi=300)
    doc.close()
    assert abs(larg - ALT_MM) < 0.3, f"largura {larg:.2f} mm — a caixa nao girou"
    assert abs(alt - LARG_MM) < 0.3, f"altura {alt:.2f} mm — a caixa nao girou"
    assert abs(dx) < 0.2 and abs(dy) < 0.2, f"o giro saiu do centro: {dx:.2f}, {dy:.2f}"
