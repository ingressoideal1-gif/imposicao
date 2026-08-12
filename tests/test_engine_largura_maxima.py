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


# Largura natural do dado a 14 pt, em mm — as larguras dos testes de "condense"
# saem daqui para nao virarem numero magico: dentro do piso de 75% o modo so
# espreme; abaixo dele a fonte tambem encolhe.
_NATURAL_MM = fitz.get_text_length(LINHA["Nome"], fontname="helv", fontsize=14) / MM2PT
DENTRO_DO_PISO_MM = round(_NATURAL_MM * 0.85, 2)
ALEM_DO_PISO_MM = round(_NATURAL_MM * 0.45, 2)


def _altura_do_texto(page):
    """Altura (pt) da caixa do texto desenhado — o que 'condense' preserva."""
    alturas = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            alturas.append(l["bbox"][3] - l["bbox"][1])
    return max(alturas) if alturas else 0


def test_condense_cabe_na_largura_sem_perder_altura():
    """
    O ponto do modo: a largura cede e a ALTURA fica igual a do texto livre —
    e ela que mantem as linhas alinhadas de um ingresso para o outro.
    """
    doc_livre, page_livre = _desenhar(_el_base(), LINHA)
    alt_livre = _altura_do_texto(page_livre)

    doc, page = _desenhar(
        _el_base(max_width_mm=DENTRO_DO_PISO_MM, overflow="condense"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert len(larguras) == 1
    assert larguras[0] <= DENTRO_DO_PISO_MM * MM2PT * 1.02
    assert abs(_altura_do_texto(page) - alt_livre) < 0.5   # mesma altura


def test_condense_alem_do_piso_reduz_a_altura_tambem():
    """
    Espremido demais o texto sairia ilegivel: passado o piso de 75% a fonte
    encolhe junto, e ai a altura cai mesmo — de proposito.
    """
    doc_livre, page_livre = _desenhar(_el_base(), LINHA)
    alt_livre = _altura_do_texto(page_livre)

    doc, page = _desenhar(
        _el_base(max_width_mm=ALEM_DO_PISO_MM, overflow="condense"), LINHA)
    larguras = _larguras_das_linhas(page)
    assert larguras[0] <= ALEM_DO_PISO_MM * MM2PT * 1.02
    assert _altura_do_texto(page) < alt_livre


def test_condense_respeita_o_alinhamento_a_esquerda():
    caixa = 40 * MM2PT
    doc, page = _desenhar(
        _el_base(max_width_mm=40, overflow="condense", text_align="left"), LINHA)
    x0 = min(
        min(s["bbox"][0] for s in l["spans"])
        for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
    )
    assert abs(x0 - (CX_PT - caixa / 2)) < 2.0


def test_condense_com_rotacao_continua_dentro_do_espaco():
    """
    Compressao e rotacao viajam no mesmo morph; se a ordem das matrizes
    estivesse trocada, o texto sairia do lugar ou com a altura espremida.
    """
    doc, page = _desenhar(
        _el_base(max_width_mm=DENTRO_DO_PISO_MM, overflow="condense", rotation=90), LINHA)
    alturas = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            alturas.append(l["bbox"][3] - l["bbox"][1])   # girado: a largura vira altura
    assert alturas, "nada foi desenhado com rotacao"
    assert max(alturas) <= DENTRO_DO_PISO_MM * MM2PT * 1.02


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
