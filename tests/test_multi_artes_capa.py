# -*- coding: utf-8 -*-
"""Imposição multi-artes: várias artes com quantidades diferentes na mesma folha.

Três ingressos da arte 1 e dois da arte 2 dão cinco itens. Numa folha 2×2 isso
são duas folhas — a segunda com uma pose só ocupada. É o caso que mistura duas
coisas fáceis de errar ao mesmo tempo: contar o total a partir das quantidades
declaradas, e paginar quando o total não fecha a folha.

Este arquivo passou meses sem rodar. Ele estava gravado em cp1252 enquanto
declarava utf-8 no cabeçalho, e o Python recusava compilá-lo — o mesmo mojibake
que já tinha mordido o `pedido.js`. Como pytest só reporta isso como erro de
coleta no meio de um monte de saída, ninguém notou.
"""
import os

import fitz  # PyMuPDF

from engine import ImpositionConfig, ImpositionEngine

MM2PT = 2.8346


def _arte(caminho, rotulo, cor):
    """Um PDF de 100x50 mm com moldura colorida, para dar para conferir a olho."""
    doc = fitz.open()
    p = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
    p.draw_rect(
        fitz.Rect(5, 5, 100 * MM2PT - 5, 50 * MM2PT - 5), color=cor, width=2
    )
    p.insert_text((20, 30), rotulo, fontsize=12)
    doc.save(caminho)
    doc.close()


def test_multi_artes_conta_o_total_e_pagina_certo(tmp_path, monkeypatch):
    # Trabalhar dentro do tmp_path, e não na raiz do repositório. A versão
    # anterior gravava arte1.pdf e arte2.pdf ao lado do código e só os apagava
    # se chegasse ao fim: uma falha no meio deixava PDF solto na raiz, e o
    # `publicar.ps1` commita com `git add -A`.
    monkeypatch.chdir(tmp_path)

    _arte("arte1.pdf", "ARTE 1 - VERMELHA", (1, 0, 0))
    _arte("arte2.pdf", "ARTE 2 - AZUL", (0, 0, 1))

    formato = {
        "name": "Ingresso Teste 100x50",
        "width_mm": 100, "height_mm": 50,
        "cols": 2, "rows": 2,
        "gap_h_mm": 5, "gap_v_mm": 5,
        "offset_h_mm": 0, "offset_v_mm": 0,
        "rotations": {},
    }
    saida = {
        "name": "Folha Saida Teste",
        "width_mm": 220, "height_mm": 120,
        "file_format": "pdf",
    }
    multi_artes = [
        {"qtd": "3", "local_path": "arte1.pdf", "pdf_url": "local_file"},
        {"qtd": "2", "local_path": "arte2.pdf", "pdf_url": "local_file"},
    ]

    saida_pdf = "output_multi_artes_test.pdf"
    config = ImpositionConfig(
        base_file="",
        out_pdf=saida_pdf,
        formato=formato,
        numeracao=None,
        saida=saida,
        seq_start=1,
        seq_end=100,
        seq_increment=1,
        layout_schema="multi_artes",
        multi_artes=multi_artes,
    )

    # As quantidades vêm como TEXTO do frontend ('3', '2'). Somá-las como texto
    # daria '32' — e a folha sairia com 32 itens.
    assert config.total_items == 5, (
        f"total_items deveria ser 5 (3 + 2), veio {config.total_items}"
    )

    ImpositionEngine(config).process()

    assert os.path.exists(saida_pdf), "o PDF de saída não foi gerado"

    doc = fitz.open(saida_pdf)
    try:
        assert len(doc) == 2, (
            f"5 itens numa folha 2x2 são 2 folhas, vieram {len(doc)}"
        )
    finally:
        doc.close()
