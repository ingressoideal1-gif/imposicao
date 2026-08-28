# -*- coding: utf-8 -*-
"""A sangria sobrevive na pose girada.

## O defeito, medido em 27/08/2026

O motor tem dois caminhos para montar um ingresso na folha:

  · pose SEM giro — arte e elementos vao direto na folha, em coordenadas
    absolutas. O que passa da borda do ingresso continua no papel: e a SANGRIA,
    a sobra que protege do desvio da guilhotina.
  · pose COM giro — o ingresso e montado numa pagina temporaria do tamanho dele
    e colada girada. A pagina temporaria era do tamanho EXATO do ingresso, entao
    tudo o que passava da borda simplesmente nao existia.

O formato `Credencial 90x140` gira as poses 2 e 3 em 180 graus. Medido numa
imposicao completa, com um elemento PDF de 110 x 154 mm num ingresso de
105 x 148 (2,5 mm de sangria em volta):

    pose 0 e 1 (sem giro)  -> 2,45 mm de tinta alem do corte
    pose 2 e 3 (180 graus) -> 0,00 mm

Metade das credenciais de cada folha saia sem a sobra. Levantamento do banco no
mesmo dia: 45 elementos PDF de 21 numeracoes passam da borda de proposito, e
todos usam esse formato.

## O conserto

A pagina temporaria passou a nascer com folga em volta — um ingresso inteiro
para cada lado — e a colagem na folha usa o retangulo da celula esticado na
mesma medida. Como a folga e simetrica, o centro nao se move: o giro continua
em torno do mesmo ponto, e a arte cai no mesmo lugar de sempre.
"""
import os
import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT

PECA_W, PECA_H = 105.0, 148.0
SANGRIA = 2.5


def _arte_com_sangria(tmp_path):
    """PDF preto do tamanho do ingresso MAIS a sangria, para virar elemento."""
    import base64
    d = fitz.open()
    p = d.new_page(width=(PECA_W + 2 * SANGRIA) * MM2PT, height=(PECA_H + 2 * SANGRIA) * MM2PT)
    p.draw_rect(p.rect, color=None, fill=(0, 0, 0))
    dados = base64.b64encode(d.tobytes()).decode()
    d.close()
    return dados


def _base_branca(tmp_path):
    caminho = str(tmp_path / "base.pdf")
    d = fitz.open()
    d.new_page(width=PECA_W * MM2PT, height=PECA_H * MM2PT)
    d.save(caminho)
    d.close()
    return caminho


def _impor(tmp_path, rotations):
    saida_pdf = str(tmp_path / "saida.pdf")
    formato = {
        "name": "Credencial 90x140", "width_mm": PECA_W, "height_mm": PECA_H,
        "cols": 2, "rows": 2, "gap_h_mm": 0, "gap_v_mm": 0,
        "offset_h_mm": 0, "offset_v_mm": 0, "rotations": rotations,
    }
    saida = {"name": "220x320", "width_mm": 220, "height_mm": 320, "file_format": "pdf"}
    num = {"elements": [{
        "type": "PDF", "x_mm": PECA_W / 2, "y_mm": PECA_H / 2,
        "width_mm": PECA_W + 2 * SANGRIA, "height_mm": PECA_H + 2 * SANGRIA,
        "rotation": 0, "pdf_content": _arte_com_sangria(tmp_path),
    }]}
    cfg = ImpositionConfig(
        base_file=_base_branca(tmp_path), out_pdf=saida_pdf, formato=formato,
        numeracao=num, saida=saida, seq_start=1, seq_end=4, seq_increment=1,
        layout_schema="sequential",
    )
    ImpositionEngine(cfg).process()
    return saida_pdf


def _sangria_medida(pdf, pose):
    """Ate onde a tinta da pose vai ALEM da borda externa da folha de corte.

    Mede so nas bordas EXTERNAS da grade — as internas encostam na celula
    vizinha, que tambem tem tinta, e ali nao da para separar uma da outra.
    """
    doc = fitz.open(pdf)
    pg = doc[0]
    DPI = 200
    pix = pg.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
    esc = DPI / 72.0
    start_x = (220 - 2 * PECA_W) / 2 * MM2PT
    start_y = (320 - 2 * PECA_H) / 2 * MM2PT
    row, col = pose // 2, pose % 2
    cx0 = start_x + col * PECA_W * MM2PT
    cy0 = start_y + row * PECA_H * MM2PT
    cx1, cy1 = cx0 + PECA_W * MM2PT, cy0 + PECA_H * MM2PT

    def tem_tinta(x_pt, y_pt):
        x, y = int(x_pt * esc), int(y_pt * esc)
        if x < 0 or y < 0 or x >= pix.width or y >= pix.height:
            return False
        return pix.samples[y * pix.stride + x] < 128

    # borda externa vertical: esquerda na coluna 0, direita na coluna 1
    x_ext = cx0 if col == 0 else cx1
    sentido_x = -1 if col == 0 else 1
    y_ext = cy0 if row == 0 else cy1
    sentido_y = -1 if row == 0 else 1

    def alcance(eixo):
        maior = 0.0
        passo = 0.05
        while maior < SANGRIA + 1.0:
            v = maior + passo
            if eixo == "x":
                pontos = [(x_ext + sentido_x * v * MM2PT, cy0 + (cy1 - cy0) * t)
                          for t in (0.25, 0.5, 0.75)]
            else:
                pontos = [(cx0 + (cx1 - cx0) * t, y_ext + sentido_y * v * MM2PT)
                          for t in (0.25, 0.5, 0.75)]
            if not any(tem_tinta(px, py) for px, py in pontos):
                break
            maior = v
        return maior

    r = (alcance("x"), alcance("y"))
    doc.close()
    return r


@pytest.mark.xdist_group("engine_sangria")
def test_a_pose_sem_giro_deixa_a_sangria_passar(tmp_path):
    """O caminho que sempre esteve certo — guarda contra consertar para o lado errado."""
    pdf = _impor(tmp_path, {})
    for pose in (0, 1, 2, 3):
        sx, sy = _sangria_medida(pdf, pose)
        assert sx > SANGRIA - 0.3, f"pose {pose}: sangria horizontal sumiu ({sx:.2f} mm)"
        assert sy > SANGRIA - 0.3, f"pose {pose}: sangria vertical sumiu ({sy:.2f} mm)"


@pytest.mark.xdist_group("engine_sangria")
def test_a_pose_girada_tambem_deixa_a_sangria_passar(tmp_path):
    """O defeito: as poses 2 e 3 do `Credencial 90x140` saiam aparadas no corte."""
    pdf = _impor(tmp_path, {"2": 180, "3": 180})
    for pose in (2, 3):
        sx, sy = _sangria_medida(pdf, pose)
        assert sx > SANGRIA - 0.3, (
            f"pose {pose} girada: a sangria horizontal foi aparada ({sx:.2f} mm)")
        assert sy > SANGRIA - 0.3, (
            f"pose {pose} girada: a sangria vertical foi aparada ({sy:.2f} mm)")


@pytest.mark.xdist_group("engine_sangria")
def test_a_folga_nova_nao_desloca_o_que_ja_estava_certo(tmp_path):
    """A folga e simetrica de proposito: o centro do ingresso nao se move."""
    pdf = _impor(tmp_path, {"2": 180, "3": 180})
    doc = fitz.open(pdf)
    pix = doc[0].get_pixmap(dpi=200, colorspace=fitz.csGRAY)
    esc = 200 / 72.0
    start_x = (220 - 2 * PECA_W) / 2 * MM2PT
    start_y = (320 - 2 * PECA_H) / 2 * MM2PT
    # o canto do desenho preto de cada pose fica a exatamente `SANGRIA` fora do corte
    for pose in (0, 3):
        row, col = pose // 2, pose % 2
        cx = start_x + (col + 0.5) * PECA_W * MM2PT
        cy = start_y + (row + 0.5) * PECA_H * MM2PT
        x, y = int(cx * esc), int(cy * esc)
        assert pix.samples[y * pix.stride + x] < 128, (
            f"pose {pose}: o centro do ingresso ficou sem tinta")
    doc.close()
