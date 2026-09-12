"""PDF do motor -> filtro real do navegador -> mesmas páginas, códigos e cores."""
import subprocess
from pathlib import Path

import fitz
import pytest

RAIZ = Path(__file__).resolve().parents[1]


def test_regras_e_filtro_de_faces():
    r = subprocess.run(["node", str(RAIZ / "tests/montagem_faces_pdf_harness.js")],
                       cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "OK:" in r.stdout


@pytest.mark.parametrize("modo", ["duplex", "duplex_unico"])
@pytest.mark.parametrize("posicoes", [[2], [3, 1, 3, 5, 2]])
def test_separar_faces_preserva_paginas_do_motor(tmp_path, monkeypatch, modo, posicoes):
    # Importar o motor não deve consultar credenciais, banco ou serviços.
    # A pasta de perfis criada pelo módulo também fica no diretório do teste.
    monkeypatch.chdir(tmp_path)
    import socket
    def sem_rede(*args, **kwargs):
        raise AssertionError("Este teste usa somente dados sintéticos locais")
    monkeypatch.setattr(socket.socket, "connect", sem_rede)
    from engine import ImpositionConfig, ImpositionEngine

    base = tmp_path / "arte.pdf"
    with fitz.open() as arte:
        arte.new_page(width=70 * 72 / 25.4, height=40 * 72 / 25.4)
        arte.save(base)
    elementos = [dict(type="TEXT", face=face, x_mm=35, y_mm=15, font_size=12,
                      font_name="helv", color="#000000", prefix=prefixo)
                 for face, prefixo in [("front", "FRENTE-"), ("back", "VERSO-")]]
    formato = dict(width_mm=70, height_mm=40, cols=2, rows=2, gap_h_mm=2,
                   gap_v_mm=2, offset_h_mm=0, offset_v_mm=0, rotations={})
    numeracao = dict(tipo="SEQUENCIAL", print_mode=modo, elements=elementos, start=101)
    entrada, frente, verso = [tmp_path / nome for nome in ["completo.pdf", "frente.pdf", "verso.pdf"]]
    cfg = ImpositionConfig(
        base_file="", out_pdf=str(entrada), formato=formato,
        saida=dict(width_mm=180, height_mm=120), numeracao=None,
        layout_schema="multi_artes", print_mode=modo, rotate_page=90,
        multi_artes=[dict(qtd=10, modelo="M1", pedido="A", start=101,
                          numeracao=numeracao, pdf_url=None, local_path=str(base), nome="")],
        refazer_celulas=posicoes, refazer_repetir=True,
    )
    ImpositionEngine(cfg).process()
    folhas = (len(posicoes) + 3) // 4
    r = subprocess.run(["node", str(RAIZ / "tests/montagem_faces_pdf_harness.js"),
                        str(entrada), str(frente), str(verso), modo, str(folhas)],
                       cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stdout + r.stderr
    with fitz.open(entrada) as original:
        assert len(original) == folhas * 2
        assert "FRENTE-" in original[0].get_text()
        assert "VERSO-" in original[1].get_text()
        for paridade, arquivo in enumerate([frente, verso]):
            with fitz.open(arquivo) as filtrado:
                assert len(filtrado) == folhas
                assert filtrado.xref_get_key(filtrado.pdf_catalog(), "OutputIntents")[0] != "null"
                for i, pagina in enumerate(filtrado):
                    origem = original[i * 2 + paridade]
                    assert pagina.get_text() == origem.get_text()
                    assert pagina.rect == origem.rect
                    assert pagina.rotation == origem.rotation
                    assert pagina.get_pixmap().samples == origem.get_pixmap().samples
