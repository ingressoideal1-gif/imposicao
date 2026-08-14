# -*- coding: utf-8 -*-
"""Todo PDF que o engine grava sai com OutputIntent sRGB.

O OutputIntent declara ao RIP o que o RGB do arquivo significa. Sem ele a
controladora chuta (em geral sRGB/SWOP de fabrica) — com ele, o chute vira
informacao. O teste cobre o wrapper _salvar_pdf, que e o funil unico de
gravacao de PDF do engine.
"""
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine


def test_salvar_pdf_embute_output_intent_srgb(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    page.draw_rect(fitz.Rect(20, 20, 120, 120), color=(0, 0, 1), fill=(0, 0, 1))
    out = str(tmp_path / "saida.pdf")

    engine._salvar_pdf(doc, out)
    doc.close()

    relido = fitz.open(out)
    cat = relido.xref_object(relido.pdf_catalog())
    assert "OutputIntents" in cat
    # O desenho continua la: o wrapper so acrescenta metadado
    assert relido[0].get_drawings()


def test_salvar_pdf_nao_quebra_se_o_intent_falhar(tmp_path, monkeypatch):
    """Producao nunca para por causa de metadado de cor."""
    import color_profiles as cp

    def explode(*a, **k):
        raise RuntimeError("falha simulada")

    monkeypatch.setattr(cp, "embutir_output_intent", explode)
    doc = fitz.open()
    doc.new_page()
    out = str(tmp_path / "saida.pdf")
    engine._salvar_pdf(doc, out)  # nao levanta
    doc.close()
    assert os.path.getsize(out) > 0


def test_todos_os_saves_de_pdf_do_engine_passam_pelo_wrapper():
    """Nenhum save de PDF de saida pode escapar do funil do OutputIntent.

    Se um save novo aparecer fora do wrapper, este teste acusa antes de o
    PDF sair sem intent para a grafica.
    """
    caminho = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "engine.py")
    with open(caminho, encoding="utf-8") as f:
        src = f.read()
    # O unico .save(..., garbage=4, ...) permitido e o de dentro do wrapper
    ocorrencias = [l.strip() for l in src.splitlines() if "garbage=4" in l]
    assert len(ocorrencias) == 1, (
        f"Save de PDF fora do _salvar_pdf: {ocorrencias}"
    )
