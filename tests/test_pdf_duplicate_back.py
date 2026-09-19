"""Duplicar para Verso usa a mesma página original em ambas as faces."""

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT


def configuracao(tmp_path, paginas, esperadas, **mudancas):
    entrada = tmp_path / f"arte-{len(list(tmp_path.glob('arte-*.pdf')))}.pdf"
    with fitz.open() as doc:
        for indice in range(1, paginas + 1):
            page = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
            page.insert_text((20, 25), f"PECA {indice} ARTE {indice}", fontsize=12)
        doc.save(entrada)
    dados = dict(
        base_file=str(entrada),
        out_pdf=str(tmp_path / "saida.pdf"),
        formato={"name": "Teste", "width_mm": 100, "height_mm": 50,
                 "cols": 2, "rows": 1},
        numeracao={"tipo": "SEQUENCIAL", "print_mode": "pdf_duplicate_back",
                   "elements": []},
        saida={"name": "Saida", "width_mm": 220, "height_mm": 70,
               "file_format": "pdf"},
        layout_schema="pdf_multiple",
        print_mode="pdf_duplicate_back",
        pdf_expected_items=esperadas,
    )
    dados.update(mudancas)
    return ImpositionConfig(**dados)


def test_cada_peca_repete_sua_propria_pagina_no_verso(tmp_path):
    cfg = configuracao(tmp_path, 3, 3)
    assert cfg.total_items == 3
    ImpositionEngine(cfg).process()
    with fitz.open(cfg.out_pdf) as saida:
        assert len(saida) == 4
        textos = [pagina.get_text() for pagina in saida]
    for frente, verso in zip(textos[::2], textos[1::2]):
        for numero in (1, 2, 3):
            assert (f"PECA {numero} ARTE {numero}" in frente) == (f"PECA {numero} ARTE {numero}" in verso)
    assert "PECA 1 ARTE 1" in textos[0]
    assert "PECA 2 ARTE 2" in textos[0]
    assert "PECA 3 ARTE 3" in textos[2]


def test_pdf_de_uma_pagina_tambem_gera_duas_faces(tmp_path):
    cfg = configuracao(tmp_path, 1, 1)
    ImpositionEngine(cfg).process()
    with fitz.open(cfg.out_pdf) as saida:
        assert len(saida) == 2
        assert "PECA 1 ARTE 1" in saida[0].get_text()
        assert "PECA 1 ARTE 1" in saida[1].get_text()


@pytest.mark.parametrize("paginas", [2, 4])
def test_pdf_com_quantidade_errada_bloqueia_geracao(tmp_path, paginas):
    with pytest.raises(ValueError, match="exatamente 3 páginas"):
        configuracao(tmp_path, paginas, 3)
    assert not (tmp_path / "saida.pdf").exists()


def test_modo_nao_aceita_verso_separado_ou_numeracao_diferente(tmp_path):
    with pytest.raises(ValueError, match="sem arquivo de verso separado"):
        configuracao(tmp_path, 3, 3, base_file_verso="outro.pdf")
    with pytest.raises(ValueError, match="numeração correspondente"):
        configuracao(tmp_path, 3, 3,
                     numeracao={"tipo": "SEQUENCIAL", "print_mode": "duplex", "elements": []})


def test_duplex_unico_anterior_mantem_uma_pagina_por_peca(tmp_path):
    cfg = configuracao(tmp_path, 3, None, print_mode="duplex_unico",
                       numeracao={"tipo": "SEQUENCIAL", "print_mode": "duplex_unico"})
    assert cfg.total_items == 3
