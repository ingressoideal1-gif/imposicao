# -*- coding: utf-8 -*-
"""
Opacidade dos elementos PDF e SVG da numeracao.

A transparencia usa o mecanismo do proprio formato PDF (ExtGState /ca e /CA,
mais um grupo de transparencia). NADA E RASTERIZADO — e essa e a exigencia que
este arquivo existe para guardar. Rasterizar a arte do cliente esta fora de
cogitacao: o PDF que ele manda e arte de producao, e virar imagem trocaria a
resolucao do RIP da impressora por uma resolucao fixa escolhida no codigo.

Por isso os testes se dividem em dois grupos, e o primeiro e o que importa:

  1. O QUE NAO PODE SE PERDER — vetor continua vetor, texto continua texto,
     fonte continua embutida, cor CMYK nao vira RGB, e o caminho de 100% e o
     mesmo de sempre, sem ganhar nem um objeto novo.

  2. A transparencia em si — a cor mistura na proporcao pedida, a arte nao se
     enxerga por dentro, e o alfa nao vaza para o resto da folha.

A medicao e do PAPEL, nao da estrutura: os testes de cor rasterizam a pagina e
leem o pixel. A arvore de objetos pode estar certa e a tinta sair errada.
"""
import base64
import os

import fitz
import pytest

from engine import ImpositionEngine, MM2PT, _opacidade_arte

PAG_W, PAG_H = 400.0, 200.0
CX_PT, CY_PT = PAG_W / 2, PAG_H / 2

EL_W_MM, EL_H_MM = 50.0, 25.0
EL_W, EL_H = EL_W_MM * MM2PT, EL_H_MM * MM2PT

AZUL = (0, 0, 255)


# ─── artes de origem ──────────────────────────────────────────────────────────

def _pdf_b64(construir, w=100, h=50):
    doc = fitz.open()
    construir(doc.new_page(width=w, height=h))
    dados = doc.tobytes()
    doc.close()
    return base64.b64encode(dados).decode("ascii")


@pytest.fixture(scope="module")
def arte_meia():
    """Quadrado vermelho na metade esquerda; metade direita vazia."""
    return _pdf_b64(lambda p: p.draw_rect(fitz.Rect(0, 0, 50, 50), color=None, fill=(1, 0, 0)))


@pytest.fixture(scope="module")
def arte_com_texto():
    """Arte com texto de verdade — o que nao pode virar imagem."""
    def montar(p):
        p.draw_rect(fitz.Rect(0, 0, 100, 25), color=None, fill=(1, 0, 0))
        p.insert_text((6, 42), "INGRESSO IDEAL", fontsize=11, color=(0, 0, 0))
    return _pdf_b64(montar)


@pytest.fixture(scope="module")
def arte_sobreposta():
    """Duas formas opacas da MESMA arte que se sobrepoem entre 40 e 60."""
    def montar(p):
        p.draw_rect(fitz.Rect(0, 0, 60, 50), color=None, fill=(1, 0, 0))
        p.draw_rect(fitz.Rect(40, 0, 100, 50), color=None, fill=(1, 0, 0))
    return _pdf_b64(montar)


@pytest.fixture(scope="module")
def arte_cmyk():
    """Preenchimento declarado em CMYK — cor de producao de grafica."""
    doc = fitz.open()
    pg = doc.new_page(width=100, height=50)
    # A API de cor do PyMuPDF muda de versao; o que o teste precisa e do operador
    # CMYK no fluxo, entao ele e escrito na mao.
    pg.draw_rect(fitz.Rect(0, 0, 100, 50), color=None, fill=(1, 0, 0))
    xref = pg.get_contents()[0]
    doc.update_stream(xref, b"0 1 1 0 k\n0 0 100 50 re f\n")
    dados = doc.tobytes()
    doc.close()
    return base64.b64encode(dados).decode("ascii")


ARTE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" '
    'viewBox="0 0 100 50"><rect x="0" y="0" width="50" height="50" fill="#ff0000"/></svg>'
)


# ─── montagem ─────────────────────────────────────────────────────────────────

def _el(b64, **extra):
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


def _montar(*elementos, fundo=(0, 0, 1)):
    """Pagina azul + os elementos por cima. Devolve o documento e a pagina."""
    doc = fitz.open()
    page = doc.new_page(width=PAG_W, height=PAG_H)
    if fundo:
        page.draw_rect(page.rect, color=None, fill=fundo)
    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    for el in elementos:
        eng._render_element(page, el, 0, 0, 1, {})
    return doc, page


def _reaberto(doc):
    """Salva e reabre — e o que o agente faz antes de mandar a impressora."""
    return fitz.open(stream=doc.tobytes(), filetype="pdf")


def _todos_os_fluxos(doc, page):
    """Todo o conteudo desenhavel da pagina, descendo pelos XObjects aninhados.

    O `show_pdf_page` envolve a arte num XObject que so contem `/fullpage Do`, e
    o desenho de verdade fica um nivel abaixo. Olhar so o de fora e olhar o
    involucro.
    """
    partes = [page.read_contents()]
    vistos = set()
    fila = [x[0] for x in page.get_xobjects()]
    while fila:
        xref = fila.pop()
        if xref in vistos:
            continue
        vistos.add(xref)
        try:
            partes.append(doc.xref_stream(xref))
        except Exception:
            continue
        tipo, val = doc.xref_get_key(xref, "Resources/XObject")
        if tipo == "xref":
            filho = int(val.split()[0])
            for chave in doc.xref_get_keys(filho):
                t2, v2 = doc.xref_get_key(filho, chave)
                if t2 == "xref":
                    fila.append(int(v2.split()[0]))
        elif tipo == "dict":
            import re as _re
            fila += [int(m) for m in _re.findall(r"(\d+) 0 R", val)]
    return b"\n".join(partes)


def _cor(page, x_pt, y_pt):
    pix = page.get_pixmap(dpi=150)
    f = pix.width / PAG_W
    return tuple(pix.pixel(int(x_pt * f), int(y_pt * f))[:3])


def _no_desenho(page, cx=CX_PT):
    return _cor(page, cx - EL_W / 4, CY_PT)


def _no_vazio(page, cx=CX_PT):
    return _cor(page, cx + EL_W / 4, CY_PT)


# ══════════════════════════════════════════════════════════════════════════════
# 1. O QUE NAO PODE SE PERDER
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("op", [1, 0.75, 0.5, 0.25])
def test_a_arte_nunca_vira_imagem(arte_com_texto, op):
    """A exigencia central: rasterizar a arte do cliente esta fora de cogitacao.

    Vale em QUALQUER opacidade, nao so a 100% — foi por isto que a primeira
    tentativa deste recurso foi revertida.
    """
    doc, page = _montar(_el(arte_com_texto, opacity=op))
    assert page.get_images() == [], f"a arte foi rasterizada a {op}"
    assert _reaberto(doc)[0].get_images() == [], "rasterizou ao salvar"


@pytest.mark.parametrize("op", [1, 0.5])
def test_o_texto_da_arte_continua_sendo_texto(arte_com_texto, op):
    """Texto virado imagem perde nitidez no papel e some da busca do PDF."""
    doc, page = _montar(_el(arte_com_texto, opacity=op))
    assert "INGRESSO IDEAL" in _reaberto(doc)[0].get_text()


@pytest.mark.parametrize("op", [1, 0.5])
def test_a_fonte_continua_embutida(arte_com_texto, op):
    doc, page = _montar(_el(arte_com_texto, opacity=op))
    assert _reaberto(doc)[0].get_fonts(), f"a fonte sumiu a {op}"


@pytest.mark.parametrize("op", [1, 0.5])
def test_a_cor_cmyk_nao_e_convertida(arte_cmyk, op):
    """Numa grafica, CMYK virado RGB e cor errada na chapa."""
    doc, page = _montar(_el(arte_cmyk, opacity=op))
    d2 = _reaberto(doc)
    assert b" k" in _todos_os_fluxos(d2, d2[0]), "o operador CMYK sumiu do fluxo"


def test_sem_o_campo_sai_exatamente_como_sempre_saiu(arte_meia):
    """Todo o acervo anterior foi gravado sem `opacity`."""
    doc, page = _montar(_el(arte_meia))
    r, g, b = _no_desenho(page)
    assert r > 240 and g < 20 and b < 20
    assert _no_vazio(page) == AZUL


def test_a_100_por_cento_a_pagina_nao_ganha_nada(arte_meia):
    """O caminho opaco e o `show_pdf_page` de sempre: sem ExtGState, sem grupo.

    Este e o teste que protege o que ja esta aprovado e rodando na grafica. Se
    um dia alguem mandar os dois casos pelo mesmo caminho, ele acusa.
    """
    doc, page = _montar(_el(arte_meia, opacity=1))
    tipo, _ = doc.xref_get_key(page.xref, "Resources")
    res = int(_.split()[0]) if tipo == "xref" else page.xref
    chave = "ExtGState" if res != page.xref else "Resources/ExtGState"
    assert doc.xref_get_key(res, chave)[0] == "null", "entrou ExtGState a 100%"

    xref_form = _reaberto(doc)[0].get_xobjects()[0][0]
    assert _reaberto(doc).xref_get_key(xref_form, "Group")[0] == "null", "entrou grupo a 100%"


def test_o_campo_ausente_e_o_campo_em_1_produzem_o_mesmo_pdf(arte_com_texto):
    """Nao basta parecer igual: o fluxo de conteudo tem de ser o mesmo."""
    d1, p1 = _montar(_el(arte_com_texto))
    d2, p2 = _montar(_el(arte_com_texto, opacity=1))
    assert p1.read_contents() == p2.read_contents()


# ══════════════════════════════════════════════════════════════════════════════
# 2. A TRANSPARENCIA
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("op", [0.25, 0.5, 0.75])
def test_a_cor_mistura_na_proporcao_pedida(arte_meia, op):
    doc, page = _montar(_el(arte_meia, opacity=op))
    r, g, b = _no_desenho(_reaberto(doc)[0])
    assert abs(r - round(255 * op)) <= 6, f"vermelho {r}"
    assert abs(b - round(255 * (1 - op))) <= 6, f"azul restante {b}"
    assert g < 20


def test_a_area_vazia_do_arquivo_nao_vela_o_fundo(arte_meia):
    """O erro que arruinaria a tiragem: um veu por cima da arte de baixo."""
    doc, page = _montar(_el(arte_meia, opacity=0.5))
    assert _no_vazio(_reaberto(doc)[0]) == AZUL


def test_a_arte_nao_se_enxerga_por_dentro(arte_sobreposta):
    """Sem grupo de transparencia, duas formas da mesma arte que se sobrepoem
    escurecem uma pela outra — medido, (189,0,64) contra (126,0,128). O
    elemento tem de ser composto como uma peca so."""
    doc, page = _montar(_el(arte_sobreposta, opacity=0.5))
    p = _reaberto(doc)[0]
    camada_unica = _cor(p, CX_PT - EL_W * 0.4, CY_PT)
    sobreposicao = _cor(p, CX_PT, CY_PT)
    assert max(abs(a - b) for a, b in zip(camada_unica, sobreposicao)) <= 4, (
        f"camada unica {camada_unica} != sobreposicao {sobreposicao}"
    )


def test_a_opacidade_nao_vaza_para_o_elemento_seguinte(arte_meia):
    """O alfa e cercado em q/Q. Sem isso, tudo o que fosse desenhado depois na
    folha — a numeracao, o picote, o proximo modelo — sairia desbotado."""
    esquerda = _el(arte_meia, opacity=0.25, _x=CX_PT - 110)
    direita = _el(arte_meia, _x=CX_PT + 110)          # sem campo: opaco
    doc, page = _montar(esquerda, direita)
    p = _reaberto(doc)[0]
    r, g, b = _no_desenho(p, cx=CX_PT + 110)
    assert r > 240 and b < 20, f"o elemento opaco saiu desbotado: {(r, g, b)}"


def test_dois_valores_diferentes_na_mesma_folha(arte_meia):
    a = _el(arte_meia, opacity=0.25, _x=CX_PT - 110)
    b = _el(arte_meia, opacity=0.75, _x=CX_PT + 110)
    doc, page = _montar(a, b)
    p = _reaberto(doc)[0]
    assert abs(_no_desenho(p, cx=CX_PT - 110)[0] - 64) <= 8
    assert abs(_no_desenho(p, cx=CX_PT + 110)[0] - 191) <= 8


def test_zero_nao_pinta_nada(arte_meia):
    doc, page = _montar(_el(arte_meia, opacity=0))
    assert _no_desenho(page) == AZUL
    assert _no_vazio(page) == AZUL


def test_svg_obedece_a_mesma_opacidade():
    """O controle e um so no painel; os dois tipos tem de responder igual."""
    doc, page = _montar(_el_svg(opacity=0.5))
    r, g, b = _no_desenho(_reaberto(doc)[0])
    assert abs(r - 128) <= 8 and abs(b - 128) <= 8
    assert _reaberto(doc)[0].get_images() == [], "o SVG foi rasterizado"


def test_a_rotacao_continua_valendo_com_opacidade(arte_meia):
    """Opacidade e giro sao independentes; um nao pode desligar o outro."""
    doc, page = _montar(_el(arte_meia, opacity=0.5, rotation=90))
    assert _reaberto(doc)[0].get_images() == []
    # Girado 90 graus, o vermelho deixa de estar onde estava sem giro.
    assert _no_desenho(_reaberto(doc)[0]) != _no_desenho(_montar(_el(arte_meia, opacity=0.5))[1])


# ══════════════════════════════════════════════════════════════════════════════
# 3. VALOR INVALIDO NAO PODE SUMIR COM A ARTE
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("valor", [None, "", "abc", float("nan"), [], {}])
def test_valor_invalido_cai_para_opaco(valor):
    assert _opacidade_arte({"opacity": valor}) == 1.0


def test_campo_ausente_e_opaco():
    assert _opacidade_arte({}) == 1.0


@pytest.mark.parametrize("valor,esperado", [(2, 1.0), (-1, 0.0), ("0.5", 0.5), (0.5, 0.5)])
def test_faixa_e_texto_numerico(valor, esperado):
    assert _opacidade_arte({"opacity": valor}) == esperado


# ══════════════════════════════════════════════════════════════════════════════
# 4. IMPOSICAO DE VERDADE, COM VARIAS CELULAS NA MESMA FOLHA
# ══════════════════════════════════════════════════════════════════════════════
#
# Os testes acima chamam `_render_element` direto. Este passa pelo `process()`
# inteiro, que e o caminho da grafica: uma folha, varias celulas, o mesmo
# elemento colado uma vez por celula. E onde o cerco q/Q seria posto a prova —
# se o alfa de uma celula vazasse, ele contaminaria as celulas seguintes.

def _impor(tmp_path, opacidade, arte_b64):
    from engine import ImpositionConfig, ImpositionEngine

    # Caminho ABSOLUTO para a arte base, e a saida sempre em tmp_path: este teste
    # nao escreve nada na pasta do repositorio, e por isso nao precisa entrar em
    # GRAVAM_NA_PASTA_DO_REPO nem correr serializado (ver test_paralelismo.py).
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "base_ticket.pdf")
    saida_pdf = str(tmp_path / "imposto.pdf")
    el = {
        "type": "PDF", "pdf_content": arte_b64,
        "x_mm": 25, "y_mm": 25, "width_mm": 40, "height_mm": 20, "rotation": 0,
    }
    if opacidade is not None:
        el["opacity"] = opacidade

    cfg = ImpositionConfig(
        base_file=base,
        out_pdf=saida_pdf,
        formato={"name": "T", "width_mm": 100, "height_mm": 50,
                 "cols": 2, "rows": 4, "gap_h_mm": 3, "gap_v_mm": 3,
                 "offset_h_mm": 0, "offset_v_mm": 0},
        numeracao={"elements": [el]},
        saida={"name": "A3", "width_mm": 297, "height_mm": 420},
        seq_start=1, seq_end=8, seq_increment=1,
        layout_schema="sequential",
    )
    ImpositionEngine(cfg).process()
    return fitz.open(saida_pdf)


def test_uma_folha_inteira_a_meia_opacidade_nao_rasteriza(tmp_path, arte_com_texto):
    """Oito celulas, cada uma colando a arte a 50%: nenhuma vira imagem."""
    doc = _impor(tmp_path, 0.5, arte_com_texto)
    try:
        for pagina in doc:
            assert pagina.get_images() == [], "a imposicao rasterizou a arte"
        assert "INGRESSO IDEAL" in doc[0].get_text()
    finally:
        doc.close()


def test_a_folha_opaca_continua_saindo_como_sempre(tmp_path, arte_com_texto):
    """Sem o campo, a imposicao inteira e a de sempre — nem ExtGState aparece."""
    doc = _impor(tmp_path, None, arte_com_texto)
    try:
        pagina = doc[0]
        tipo, val = doc.xref_get_key(pagina.xref, "Resources")
        res = int(val.split()[0]) if tipo == "xref" else pagina.xref
        chave = "ExtGState" if res != pagina.xref else "Resources/ExtGState"
        t, v = doc.xref_get_key(res, chave)
        assert t == "null" or "IdealAlfa" not in str(v), "entrou opacidade sem ninguem pedir"
        assert pagina.get_images() == []
    finally:
        doc.close()


def test_todas_as_celulas_saem_com_a_mesma_transparencia(tmp_path, arte_meia):
    """Se o alfa vazasse de uma celula para a outra, as celulas seguintes sairiam
    cada vez mais claras. Todas tem de dar a mesma cor."""
    doc = _impor(tmp_path, 0.5, arte_meia)
    try:
        pagina = doc[0]
        pix = pagina.get_pixmap(dpi=100)
        # Amostra o centro da metade esquerda (onde ha vermelho) de cada celula.
        vistos = []
        larg_mm, alt_mm = 100, 50
        f = pix.width / (297 * MM2PT)
        for col in range(2):
            for lin in range(4):
                cx_mm = col * (larg_mm + 3) + 25 + 40 * 0.25
                cy_mm = lin * (alt_mm + 3) + 25
                x = int(cx_mm * MM2PT * f)
                y = int(cy_mm * MM2PT * f)
                if 0 <= x < pix.width and 0 <= y < pix.height:
                    vistos.append(pix.pixel(x, y)[:3])
        assert len(vistos) >= 6, "amostragem nao encontrou as celulas"
        primeiro = vistos[0]
        for c in vistos[1:]:
            assert max(abs(a - b) for a, b in zip(c, primeiro)) <= 6, (
                f"celulas com transparencias diferentes: {primeiro} vs {c}"
            )
    finally:
        doc.close()
