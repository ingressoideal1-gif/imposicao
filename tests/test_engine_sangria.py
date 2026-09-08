# -*- coding: utf-8 -*-
"""A sangria da origem e recortada igualmente nas poses retas e giradas.

Em 08/09/2026, na analise do pedido 21417, o usuario definiu o limite exato da
celula, igual a Visualizacao. Essa regra substitui a preservacao de sangria
externa de 27/08. Mantemos a medicao de tinta nas quatro bordas da grade e a
verificacao de centro, agora exigindo que nada seja pintado fora do corte.
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
def test_a_pose_sem_giro_recorta_a_sangria(tmp_path):
    """Elementos desenhados diretamente na folha respeitam a borda da celula."""
    pdf = _impor(tmp_path, {})
    for pose in (0, 1, 2, 3):
        sx, sy = _sangria_medida(pdf, pose)
        assert sx < 0.2, f"pose {pose}: tinta fora do corte horizontal ({sx:.2f} mm)"
        assert sy < 0.2, f"pose {pose}: tinta fora do corte vertical ({sy:.2f} mm)"


@pytest.mark.xdist_group("engine_sangria")
def test_a_pose_girada_tambem_recorta_a_sangria(tmp_path):
    """A folga da pagina temporaria nao permite invadir a celula vizinha."""
    pdf = _impor(tmp_path, {"2": 180, "3": 180})
    for pose in (2, 3):
        sx, sy = _sangria_medida(pdf, pose)
        assert sx < 0.2, f"pose {pose} girada: tinta fora do corte horizontal ({sx:.2f} mm)"
        assert sy < 0.2, f"pose {pose} girada: tinta fora do corte vertical ({sy:.2f} mm)"


@pytest.mark.xdist_group("engine_sangria")
def test_a_folga_nova_nao_desloca_o_que_ja_estava_certo(tmp_path):
    """A folga e simetrica de proposito: o centro do ingresso nao se move."""
    pdf = _impor(tmp_path, {"2": 180, "3": 180})
    doc = fitz.open(pdf)
    pix = doc[0].get_pixmap(dpi=200, colorspace=fitz.csGRAY)
    esc = 200 / 72.0
    start_x = (220 - 2 * PECA_W) / 2 * MM2PT
    start_y = (320 - 2 * PECA_H) / 2 * MM2PT
    # O centro permanece coberto de tinta depois de recortar a sobra.
    for pose in (0, 3):
        row, col = pose // 2, pose % 2
        cx = start_x + (col + 0.5) * PECA_W * MM2PT
        cy = start_y + (row + 0.5) * PECA_H * MM2PT
        x, y = int(cx * esc), int(cy * esc)
        assert pix.samples[y * pix.stride + x] < 128, (
            f"pose {pose}: o centro do ingresso ficou sem tinta")
    doc.close()
