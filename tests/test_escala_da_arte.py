# -*- coding: utf-8 -*-
"""A escala da camada de arte, medida na tinta do papel.

Pedido do usuario em 31/08/2026: no modo PDF Multi-Pagina, dois campos de escala
— % horizontal e % vertical — que esticam SO a camada de arte, mantendo-a
centralizada na celula, e que valem igual na tela, na imposicao, na impressao e
no PDF gerado.

Estes testes nao olham o codigo: eles impoem de verdade e medem onde a tinta
comeca e onde acaba na folha de saida. E a unica forma honesta de conferir
geometria — um retangulo certo na variavel e errado no papel ja aconteceu neste
motor (ver `test_engine_sangria.py`).

O que cada um trava:

  · 100/100 nao mexe em nada. E o teste mais importante do arquivo: milhares de
    trabalhos ja impressos dependem de a arte continuar entrando no tamanho
    natural do arquivo, centralizada.
  · Os dois eixos sao independentes: 50% na horizontal nao encolhe a altura.
  · O centro nao se move — foi o pedido explicito ("mantem centralizado a
    celula").
  · Passar de 100% nao invade a celula vizinha: a arte e aparada na celula mais
    metade do vao ate ela.
  · A pose GIRADA mede igual a pose reta. Sao dois caminhos diferentes dentro do
    motor, e ja divergiram antes.
"""
import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT

PECA_W, PECA_H = 100.0, 50.0
FOLHA_W, FOLHA_H = 200.0, 150.0
TOLERANCIA_MM = 0.6   # ~5 pixels a 200 dpi


def _arte_preta(tmp_path, w_mm=PECA_W, h_mm=PECA_H, nome="arte.pdf"):
    """A arte do cliente: uma pagina preta, para a tinta ser mensuravel."""
    caminho = str(tmp_path / nome)
    d = fitz.open()
    p = d.new_page(width=w_mm * MM2PT, height=h_mm * MM2PT)
    p.draw_rect(p.rect, color=None, fill=(0, 0, 0))
    d.save(caminho)
    d.close()
    return caminho


def _impor(tmp_path, escala_h=100, escala_v=100, cols=1, gap_h=0.0,
           rotations=None, arte=None, folha_w=FOLHA_W):
    saida_pdf = str(tmp_path / f"saida_{escala_h}_{escala_v}_{cols}.pdf")
    formato = {
        "name": "Teste 100x50", "width_mm": PECA_W, "height_mm": PECA_H,
        "cols": cols, "rows": 1, "gap_h_mm": gap_h, "gap_v_mm": 0,
        "offset_h_mm": 0, "offset_v_mm": 0, "rotations": rotations or {},
    }
    saida = {"name": "Folha", "width_mm": folha_w, "height_mm": FOLHA_H,
             "file_format": "pdf"}
    cfg = ImpositionConfig(
        base_file=arte or _arte_preta(tmp_path),
        out_pdf=saida_pdf, formato=formato,
        numeracao={"elements": []}, saida=saida,
        seq_start=1, seq_end=cols, seq_increment=1,
        layout_schema="sequential",
        arte_escala_h=escala_h, arte_escala_v=escala_v,
    )
    ImpositionEngine(cfg).process()
    return saida_pdf


# Binariza a linha de pixels de uma vez: tudo o que for escuro vira 0x00, o
# resto 0xFF. Com isso o `find`/`rfind` do proprio `bytes` acha a primeira e a
# ultima tinta em C — varrer pixel a pixel em Python levava minutos por teste.
_LIMIAR = bytes(0 if v < 128 else 255 for v in range(256))


def _caixa_da_tinta(pdf, dpi=150, faixa_x_mm=None):
    """Onde a tinta preta comeca e acaba na folha, em mm.

    `faixa_x_mm` limita a leitura a uma fatia vertical da folha — e como se
    olha uma celula so, o que separa a arte de um modelo da do vizinho.
    """
    doc = fitz.open(pdf)
    pix = doc[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    esc = dpi / 72.0
    dados, stride = pix.samples, pix.stride
    corte0, corte1 = 0, pix.width
    if faixa_x_mm:
        corte0 = max(0, int(faixa_x_mm[0] * MM2PT * esc))
        corte1 = min(pix.width, int(faixa_x_mm[1] * MM2PT * esc))
    larg = corte1 - corte0
    x0 = larg
    x1 = y0 = y1 = -1
    for y in range(pix.height):
        linha = dados[y * stride + corte0: y * stride + corte1].translate(_LIMIAR)
        primeiro = linha.find(b"\x00")
        if primeiro < 0:
            continue
        ultimo = linha.rfind(b"\x00")
        if primeiro < x0: x0 = primeiro
        if ultimo > x1: x1 = ultimo
        if y0 < 0: y0 = y
        y1 = y
    doc.close()
    if x1 < 0:
        return None
    # `corte0` de volta: as colunas foram contadas a partir da fatia, e quem le
    # espera a medida na folha inteira.
    return ((x0 + corte0) / esc / MM2PT, y0 / esc / MM2PT,
            (x1 + 1 + corte0) / esc / MM2PT, (y1 + 1) / esc / MM2PT)


def _celula_unica():
    """Onde a celula cai na folha quando ha uma so, centralizada."""
    x0 = (FOLHA_W - PECA_W) / 2
    y0 = (FOLHA_H - PECA_H) / 2
    return x0, y0, x0 + PECA_W, y0 + PECA_H


@pytest.mark.xdist_group("engine_escala")
def test_cem_por_cento_nao_muda_nada(tmp_path):
    """O padrao continua sendo o tamanho natural do arquivo, centralizado."""
    caixa = _caixa_da_tinta(_impor(tmp_path))
    assert caixa is not None, "a arte nao foi impressa"
    cx0, cy0, cx1, cy1 = _celula_unica()
    assert caixa[0] == pytest.approx(cx0, abs=TOLERANCIA_MM)
    assert caixa[1] == pytest.approx(cy0, abs=TOLERANCIA_MM)
    assert caixa[2] == pytest.approx(cx1, abs=TOLERANCIA_MM)
    assert caixa[3] == pytest.approx(cy1, abs=TOLERANCIA_MM)


@pytest.mark.xdist_group("engine_escala")
def test_horizontal_encolhe_sozinha_e_fica_centralizada(tmp_path):
    """50% na horizontal: metade da largura, altura inteira, mesmo centro."""
    caixa = _caixa_da_tinta(_impor(tmp_path, escala_h=50))
    cx0, cy0, cx1, cy1 = _celula_unica()
    centro_x = (cx0 + cx1) / 2

    assert (caixa[2] - caixa[0]) == pytest.approx(PECA_W / 2, abs=TOLERANCIA_MM)
    assert (caixa[3] - caixa[1]) == pytest.approx(PECA_H, abs=TOLERANCIA_MM), \
        "a escala horizontal mexeu na altura"
    assert (caixa[0] + caixa[2]) / 2 == pytest.approx(centro_x, abs=TOLERANCIA_MM), \
        "a arte saiu do centro da celula"


@pytest.mark.xdist_group("engine_escala")
def test_vertical_encolhe_sozinha_e_fica_centralizada(tmp_path):
    """50% na vertical: metade da altura, largura inteira, mesmo centro."""
    caixa = _caixa_da_tinta(_impor(tmp_path, escala_v=50))
    cx0, cy0, cx1, cy1 = _celula_unica()
    centro_y = (cy0 + cy1) / 2

    assert (caixa[3] - caixa[1]) == pytest.approx(PECA_H / 2, abs=TOLERANCIA_MM)
    assert (caixa[2] - caixa[0]) == pytest.approx(PECA_W, abs=TOLERANCIA_MM), \
        "a escala vertical mexeu na largura"
    assert (caixa[1] + caixa[3]) / 2 == pytest.approx(centro_y, abs=TOLERANCIA_MM), \
        "a arte saiu do centro da celula"


@pytest.mark.xdist_group("engine_escala")
def test_os_dois_eixos_ao_mesmo_tempo(tmp_path):
    """80% x 60%: cada eixo faz o que foi pedido, sem proporcao forcada.

    Este e o teste que pega o `keep_proportion=True` esquecido: com ele o
    PyMuPDF encaixaria a arte proporcionalmente, e os dois eixos sairiam a 60%.
    """
    caixa = _caixa_da_tinta(_impor(tmp_path, escala_h=80, escala_v=60))
    assert (caixa[2] - caixa[0]) == pytest.approx(PECA_W * 0.8, abs=TOLERANCIA_MM)
    assert (caixa[3] - caixa[1]) == pytest.approx(PECA_H * 0.6, abs=TOLERANCIA_MM)


@pytest.mark.xdist_group("engine_escala")
def test_aumentar_nao_passa_da_celula_quando_nao_ha_vao(tmp_path):
    """Sem vao entre celulas, o limite e o corte: a arte e aparada ali."""
    caixa = _caixa_da_tinta(_impor(tmp_path, escala_h=200, escala_v=200))
    cx0, cy0, cx1, cy1 = _celula_unica()
    assert caixa[0] >= cx0 - TOLERANCIA_MM, "a arte passou do corte pela esquerda"
    assert caixa[2] <= cx1 + TOLERANCIA_MM, "a arte passou do corte pela direita"
    assert caixa[1] >= cy0 - TOLERANCIA_MM, "a arte passou do corte por cima"
    assert caixa[3] <= cy1 + TOLERANCIA_MM, "a arte passou do corte por baixo"
    # e preencheu a celula inteira, senao o recorte teria comido demais
    assert (caixa[2] - caixa[0]) == pytest.approx(PECA_W, abs=TOLERANCIA_MM)


@pytest.mark.xdist_group("engine_escala")
def test_aumentar_usa_metade_do_vao_como_sangria(tmp_path):
    """Com 10 mm de vao, a arte pode crescer 5 mm para cada lado — e para ai.

    E a regra do usuario: recorta na celula mais a sangria, sem invadir a
    vizinha. Metade do vao e exatamente o espaco que existe antes de encostar na
    arte do ingresso ao lado.
    """
    FOLHA_LARGA = 260.0
    pdf = _impor(tmp_path, escala_h=200, cols=2, gap_h=10.0, folha_w=FOLHA_LARGA)
    caixa = _caixa_da_tinta(pdf)
    largura_usada = 2 * PECA_W + 10.0
    x0_grade = (FOLHA_LARGA - largura_usada) / 2
    # A tinta das duas celulas se junta no meio, entao mede-se so a borda de fora
    assert caixa[0] == pytest.approx(x0_grade - 5.0, abs=TOLERANCIA_MM), \
        "a arte da primeira celula nao usou os 5 mm de sangria, ou passou deles"
    assert caixa[2] == pytest.approx(x0_grade + largura_usada + 5.0, abs=TOLERANCIA_MM), \
        "a arte da ultima celula nao usou os 5 mm de sangria, ou passou deles"


@pytest.mark.xdist_group("engine_escala")
def test_a_pose_girada_mede_igual_a_pose_reta(tmp_path):
    """Os dois caminhos do motor tem de dar o mesmo tamanho.

    A pose reta cola a arte direto na folha; a girada monta o ingresso numa
    pagina temporaria. Ja divergiram antes, na sangria (27/08/2026).
    """
    reta = _caixa_da_tinta(_impor(tmp_path, escala_h=60, escala_v=60))
    # 180 graus mantem a celula em pe, entao a medida e comparavel direto
    girada = _caixa_da_tinta(_impor(tmp_path, escala_h=60, escala_v=60,
                                    rotations={"0": 180}))
    assert girada is not None, "a pose girada nao imprimiu a arte"
    assert (girada[2] - girada[0]) == pytest.approx(reta[2] - reta[0], abs=TOLERANCIA_MM)
    assert (girada[3] - girada[1]) == pytest.approx(reta[3] - reta[1], abs=TOLERANCIA_MM)
    assert (girada[0] + girada[2]) / 2 == pytest.approx((reta[0] + reta[2]) / 2, abs=TOLERANCIA_MM)


@pytest.mark.xdist_group("engine_escala")
def test_numa_folha_combinada_cada_modelo_leva_a_propria_escala(tmp_path):
    """Modelo A a 50% ao lado do B a 100%, na mesma folha.

    A escala e do MODELO, e nao do trabalho. Enquanto ela nao entrou no mapa das
    artes, os dois modelos da folha caiam na escala do trabalho — e o B sairia
    encolhido junto com o A, sem ninguem ter pedido.
    """
    from engine import ImpositionConfig, ImpositionEngine

    arte_a = _arte_preta(tmp_path, nome="arte_a.pdf")
    arte_b = _arte_preta(tmp_path, nome="arte_b.pdf")
    saida_pdf = str(tmp_path / "saida_combinada.pdf")
    FOLHA_LARGA = 240.0

    formato = {
        "name": "Teste 100x50", "width_mm": PECA_W, "height_mm": PECA_H,
        "cols": 2, "rows": 1, "gap_h_mm": 0, "gap_v_mm": 0,
        "offset_h_mm": 0, "offset_v_mm": 0, "rotations": {},
    }
    saida = {"name": "Folha", "width_mm": FOLHA_LARGA, "height_mm": FOLHA_H,
             "file_format": "pdf"}
    cfg = ImpositionConfig(
        base_file="", out_pdf=saida_pdf, formato=formato, numeracao=None,
        saida=saida, seq_start=1, seq_end=2, seq_increment=1,
        layout_schema="multi_artes",
        multi_artes=[
            {"qtd": "1", "local_path": arte_a, "pdf_url": "local_file",
             "escala_h": 50, "escala_v": 100},
            {"qtd": "1", "local_path": arte_b, "pdf_url": "local_file"},
        ],
    )
    ImpositionEngine(cfg).process()

    x0_grade = (FOLHA_LARGA - 2 * PECA_W) / 2
    esquerda = _caixa_da_tinta(saida_pdf, faixa_x_mm=(x0_grade, x0_grade + PECA_W))
    direita = _caixa_da_tinta(saida_pdf, faixa_x_mm=(x0_grade + PECA_W, x0_grade + 2 * PECA_W))

    assert esquerda is not None and direita is not None, "uma das artes nao foi impressa"
    assert (esquerda[2] - esquerda[0]) == pytest.approx(PECA_W / 2, abs=TOLERANCIA_MM), \
        "o modelo com escala nao saiu a 50%"
    assert (direita[2] - direita[0]) == pytest.approx(PECA_W, abs=TOLERANCIA_MM), \
        "o modelo SEM escala encolheu junto com o vizinho"


@pytest.mark.xdist_group("engine_escala")
def test_arte_maior_que_a_celula_nao_encolhe_ao_ganhar_escala(tmp_path):
    """Uma arte que ja nascia com sangria continua com ela a 101%.

    Sem a regra do "o que ela ja ocupava a 100%", mandar aumentar faria a arte
    ENCOLHER — o recorte comeria a sangria que o arquivo trazia de fabrica.
    """
    arte = _arte_preta(tmp_path, PECA_W + 6, PECA_H + 6, "arte_sangrada.pdf")
    cem = _caixa_da_tinta(_impor(tmp_path, arte=arte))
    mais = _caixa_da_tinta(_impor(tmp_path, escala_h=101, escala_v=101, arte=arte))
    assert (mais[2] - mais[0]) >= (cem[2] - cem[0]) - TOLERANCIA_MM, \
        "aumentar a escala encolheu a arte"
    assert (mais[3] - mais[1]) >= (cem[3] - cem[1]) - TOLERANCIA_MM, \
        "aumentar a escala encolheu a arte"
