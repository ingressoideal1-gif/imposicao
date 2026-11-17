# -*- coding: utf-8 -*-
"""O motor preserva a condicao de saida comum e o fallback das artes sem perfil."""
import os
import sys

import fitz
import pytest

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

@pytest.mark.parametrize('multi', [False, True])
@pytest.mark.parametrize('perfil_verso', ['mesmo', 'divergente', 'ausente'])
def test_imposicao_duplex_preserva_perfil_comum_sem_escolher_entre_conflitos(
        tmp_path, multi, perfil_verso):
    import color_profiles as cp

    # Os bytes identificam os streams. O teste confere o transporte do ICC,
    # sem depender de um perfil licenciado ou de um driver instalado.
    icc = b'perfil CMYK sintetico'
    frente, verso = tmp_path / 'frente.pdf', tmp_path / 'verso.pdf'
    for path, perfil in ((frente, icc), (verso, {'mesmo': icc,
                          'divergente': b'outro ICC', 'ausente': None}[perfil_verso])):
        with fitz.open() as src:
            src.new_page().draw_rect((10, 10, 25, 25), fill=(0.1, 0.4, 0, 0))
            if perfil:
                cp.embutir_output_intent(src, perfil, 'Perfil de teste', 'CMYK')
                intent = int(src.xref_get_key(src.pdf_catalog(), 'OutputIntents')[1][1:].split()[0])
                src.xref_set_key(intent, 'S', '/GTS_PDFX')
                src.xref_set_key(intent, 'RegistryName', '(registro original)')
            src.save(path)

    modo = 'duplex_unico'
    numeracao = dict(elements=[], print_mode=modo)
    cfg = dict(base_file=str(frente), base_file_verso=str(verso),
               out_pdf=str(tmp_path / 'imposto.pdf'), numeracao=numeracao,
               formato=dict(width_mm=70, height_mm=40, cols=1, rows=1),
               saida=dict(width_mm=100, height_mm=80), print_mode=modo,
               seq_start=1, seq_end=3, folha_a_folha=True)
    if multi:
        cfg.update(base_file='', base_file_verso='', layout_schema='multi_artes',
                   multi_artes=[dict(qtd=3, numeracao=numeracao,
                                local_path=str(frente), local_verso_path=str(verso))])
    entregas = []
    engine.ImpositionEngine(engine.ImpositionConfig(**cfg),
                            on_file_generated=entregas.append).process()
    assert len(entregas) == 3
    for entrega in entregas:
        with fitz.open(entrega['path']) as doc:
            assert len(doc) == 2
            tipo, valor = doc.xref_get_key(doc.pdf_catalog(), 'OutputIntents')
            if perfil_verso != 'mesmo':
                assert tipo == 'null'
                continue
            intent = int(valor[1:].split()[0])
            assert doc.xref_get_key(intent, 'S') == ('name', '/GTS_PDFX')
            assert doc.xref_get_key(intent, 'RegistryName') == ('string', 'registro original')
            perfil = int(doc.xref_get_key(intent, 'DestOutputProfile')[1].split()[0])
            assert doc.xref_get_key(perfil, 'N') == ('int', '4')
            assert doc.xref_stream(perfil) == icc
