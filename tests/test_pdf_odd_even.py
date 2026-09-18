"""Um PDF alterna frente e verso; a nova numeração exige pares completos."""

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT


def arquivo(tmp_path, paginas):
    caminho = tmp_path / "arte.pdf"
    with fitz.open() as doc:
        for indice in range(1, paginas + 1):
            page = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
            face = "FRENTE" if indice % 2 else "VERSO"
            page.insert_text((20, 25), f"PECA {(indice + 1) // 2} {face}", fontsize=12)
        doc.save(caminho)
    return str(caminho)


def configuracao(tmp_path, paginas, esperadas, **mudancas):
    dados = dict(
        base_file=arquivo(tmp_path, paginas),
        out_pdf=str(tmp_path / "saida.pdf"),
        formato={"name": "Teste", "width_mm": 100, "height_mm": 50,
                 "cols": 2, "rows": 1},
        numeracao={"tipo": "SEQUENCIAL", "print_mode": "pdf_odd_even",
                   "elements": []},
        saida={"name": "Saida", "width_mm": 220, "height_mm": 70,
               "file_format": "pdf"},
        layout_schema="pdf_multiple",
        print_mode="duplex",
        pdf_expected_items=esperadas,
    )
    dados.update(mudancas)
    return ImpositionConfig(**dados)


def test_tres_pecas_usam_as_seis_paginas_em_pares(tmp_path):
    cfg = configuracao(tmp_path, 6, 3)
    assert cfg.total_items == 3
    ImpositionEngine(cfg).process()
    with fitz.open(cfg.out_pdf) as saida:
        frentes = " ".join(p.get_text() for p in saida if p.number % 2 == 0)
        versos = " ".join(p.get_text() for p in saida if p.number % 2 == 1)
    for numero in (1, 2, 3):
        assert f"PECA {numero} FRENTE" in frentes
        assert f"PECA {numero} VERSO" in versos
    assert "VERSO" not in frentes
    assert "FRENTE" not in versos


@pytest.mark.parametrize("paginas,esperadas", [(5, 3), (8, 3)])
def test_contagem_incorreta_bloqueia_antes_de_gerar(tmp_path, paginas, esperadas):
    saida = tmp_path / "saida.pdf"
    with pytest.raises(ValueError, match="exatamente 6"):
        configuracao(tmp_path, paginas, esperadas)
    assert not saida.exists()


def test_novo_modo_exige_paginacao_e_duplex_individual(tmp_path):
    with pytest.raises(ValueError, match="Pdf Paginado individual"):
        configuracao(tmp_path, 6, 3, print_mode="front")
    with pytest.raises(ValueError, match="sem arquivo de verso separado"):
        configuracao(tmp_path, 6, 3, base_file_verso="verso-separado.pdf")


def test_duplex_anterior_conserva_regra_de_quantidade(tmp_path):
    cfg = configuracao(tmp_path, 5, None,
                       numeracao={"tipo": "SEQUENCIAL", "print_mode": "duplex"})
    assert cfg.total_items == 3
