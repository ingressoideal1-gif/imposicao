# -*- coding: utf-8 -*-
"""Imposicao FxVersoUnico (`print_mode="duplex_unico"`).

O FxVerso classico consome as paginas do arquivo AOS PARES: a frente da peca i e
a pagina i*2 e o verso e a i*2+1. Um trabalho de 9 ingressos exige, ali, um PDF
de 18 paginas intercaladas.

No FxVersoUnico a frente e um PDF paginado -- cada pagina e UMA peca -- e o verso
e um arquivo separado, de uma pagina so, que se repete em todas as pecas. E o
caso do usuario: 9 paginas de frente + 1 de verso = 9 ingressos.

O que este teste trava:

 1. `total_items` e 9, e nao 5 (`ceil(9/2)`) -- o arquivo nao e paginado aos
    pares, entao nao ha o que dividir;
 2. as celulas de verso das folhas usam TODAS a mesma pagina de origem -- a arte
    do verso e uma so;
 3. as celulas de frente usam paginas DISTINTAS, na ordem;
 4. a numeracao de face `back` continua variando de celula para celula: o que se
    repete e a arte do verso, nao o VDP desenhado por cima dela.

O irmao deste arquivo, `test_pdf_duplex.py`, trava o FxVerso de hoje -- os dois
tem de passar juntos.
"""
import os
import re

import fitz  # PyMuPDF

from engine import ImpositionConfig, ImpositionEngine

MM2PT = 2.8346

# 2 x 2 = 4 poses por folha. Com 9 pecas sao 3 folhas (4 + 4 + 1) e, como o
# trabalho tem verso, 6 paginas fisicas na saida.
FORMATO = {
    "name": "Ingresso Teste 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 5,
    "gap_v_mm": 5,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}

SAIDA = {
    "name": "Folha Saida Teste",
    "width_mm": 220,
    "height_mm": 120,
    "file_format": "pdf",
}

# Prefixos "NF"/"NV" para o numero sair identificavel na extracao de texto.
# O `print_mode` da numeracao acompanha o do trabalho: e ele que faz o
# `ImpositionConfig` respeitar a face declarada em cada elemento, em vez de
# empurrar tudo para a frente.
NUMERACAO = {
    "tipo": "SEQUENCIAL",
    "print_mode": "duplex_unico",
    "elements": [
        {
            "type": "TEXT",
            "x_mm": 30,
            "y_mm": 40,
            "font_size": 12,
            "color": "#000000",
            "prefix": "NF",
            "face": "front",
        },
        {
            "type": "TEXT",
            "x_mm": 30,
            "y_mm": 40,
            "font_size": 12,
            "color": "#000000",
            "prefix": "NV",
            "face": "back",
        },
    ],
}


def _gerar_frente(caminho, paginas=9):
    """PDF da frente: uma pagina por peca, cada uma visualmente distinta."""
    doc = fitz.open()
    w = 100 * MM2PT
    h = 50 * MM2PT
    for i in range(1, paginas + 1):
        page = doc.new_page(width=w, height=h)
        page.draw_rect(fitz.Rect(5, 5, w - 5, h - 5), color=(0.5, 0.5, 0.5), width=1)
        page.insert_text((15, 25), f"FRENTE-{i:02d}", fontsize=14, color=(0, 0, 0))
    doc.save(caminho)
    doc.close()


def _gerar_verso(caminho):
    """PDF do verso: UMA pagina, a mesma para todas as pecas."""
    doc = fitz.open()
    page = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
    page.insert_text((15, 25), "ARTE-VERSO", fontsize=14, color=(0, 0, 0))
    doc.save(caminho)
    doc.close()


def test_pdf_duplex_unico(tmp_path):
    frente = str(tmp_path / "fxversounico_frente.pdf")
    verso = str(tmp_path / "fxversounico_verso.pdf")
    saida = str(tmp_path / "output_fxversounico.pdf")

    _gerar_frente(frente, 9)
    _gerar_verso(verso)

    cfg = ImpositionConfig(
        base_file=frente,
        base_file_verso=verso,
        out_pdf=saida,
        formato=FORMATO,
        numeracao=NUMERACAO,
        saida=SAIDA,
        seq_start=1,
        seq_end=9,
        seq_increment=1,
        layout_schema="pdf_multiple",
        print_mode="duplex_unico",
    )

    # 1. NOVE pecas, nao cinco. O `ceil(9/2)` do FxVerso classico nao vale aqui:
    #    o verso nao ocupa pagina do arquivo da frente.
    assert cfg.total_items == 9, f"total_items deveria ser 9, veio {cfg.total_items}"

    ImpositionEngine(cfg).process()
    assert os.path.exists(saida), "o PDF de saida nao foi gerado"

    # A pagina do verso e a que veio depois das 9 da frente -- a mesma para
    # todas as pecas, e e isso que o resto do teste confere no papel.
    assert cfg.verso_page_idx == 9, (
        f"o verso deveria ter sido anexado na pagina 9, veio {cfg.verso_page_idx}")

    doc = fitz.open(saida)
    try:
        # 3 folhas x 2 faces
        assert len(doc) == 6, f"deveriam sair 6 paginas fisicas, sairam {len(doc)}"

        frentes = [doc[0].get_text(), doc[2].get_text(), doc[4].get_text()]
        versos = [doc[1].get_text(), doc[3].get_text(), doc[5].get_text()]

        # 2. VERSO: a MESMA pagina de origem em todas as celulas. Se alguma
        #    celula tivesse ido buscar outra pagina, sairia dali um "FRENTE-nn";
        #    e o numero de "ARTE-VERSO" por folha e o numero de pecas dela.
        por_folha = [4, 4, 1]
        for i, (texto, esperadas) in enumerate(zip(versos, por_folha)):
            assert texto.count("ARTE-VERSO") == esperadas, (
                f"folha {i + 1}, verso: esperava {esperadas} celula(s) com a arte "
                f"de verso, achei {texto.count('ARTE-VERSO')}")
            assert "FRENTE-" not in texto, (
                f"folha {i + 1}, verso: uma celula pegou pagina da frente -- {texto!r}")

        # 3. FRENTE: paginas DISTINTAS, na ordem do arquivo.
        esperado_por_folha = [
            ["FRENTE-01", "FRENTE-02", "FRENTE-03", "FRENTE-04"],
            ["FRENTE-05", "FRENTE-06", "FRENTE-07", "FRENTE-08"],
            ["FRENTE-09"],
        ]
        vistas = []
        for i, (texto, esperadas) in enumerate(zip(frentes, esperado_por_folha)):
            achadas = re.findall(r"FRENTE-\d\d", texto)
            assert sorted(achadas) == sorted(esperadas), (
                f"folha {i + 1}, frente: esperava {esperadas}, achei {achadas}")
            assert "ARTE-VERSO" not in texto, (
                f"folha {i + 1}, frente: a arte do verso vazou para a frente")
            vistas.extend(achadas)

        assert len(set(vistas)) == 9, (
            f"as 9 celulas de frente deveriam usar 9 paginas distintas, "
            f"vieram {sorted(set(vistas))}")

        # 4. A NUMERACAO DE FACE `back` MUDA DE CELULA PARA CELULA. E o ponto do
        #    modo: a arte do verso e uma so, o VDP por cima dela nao.
        numeros_verso = []
        for texto in versos:
            numeros_verso.extend(re.findall(r"NV(\d+)", texto))
        assert sorted(int(n) for n in numeros_verso) == list(range(1, 10)), (
            f"o verso deveria numerar de 1 a 9, veio {sorted(numeros_verso)}")

        # E a face `front` nao invade o verso, nem o contrario.
        for texto in versos:
            assert "NF" not in texto, "elemento de face front apareceu no verso"
        for texto in frentes:
            assert "NV" not in texto, "elemento de face back apareceu na frente"

        numeros_frente = []
        for texto in frentes:
            numeros_frente.extend(re.findall(r"NF(\d+)", texto))
        assert sorted(int(n) for n in numeros_frente) == list(range(1, 10)), (
            f"a frente deveria numerar de 1 a 9, veio {sorted(numeros_frente)}")
    finally:
        doc.close()


if __name__ == "__main__":
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as d:
        test_pdf_duplex_unico(Path(d))
    print("--- TESTE FxVersoUnico CONCLUIDO COM SUCESSO ---")
