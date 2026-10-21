"""Faixas impressas nas capas respeitam o inicio real de cada modelo."""
import re

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine


@pytest.mark.parametrize("inicio,tickets,qtd", [(1, 2, 120), (1001, 2, 120), (501, 3, 120), (0, 2, 120), (1001, 1, 120), (2, 5, 200), (1, 5, 40)])
@pytest.mark.parametrize("caminho", ["simples", "modelo", "segundo_modelo"])
def test_faixa_da_capa(tmp_path, inicio, tickets, qtd, caminho):
    cfg = ImpositionConfig(
        base_file="", out_pdf=str(tmp_path / "saida.pdf"),
        formato={"width_mm": 150, "height_mm": 50, "cols": 1, "rows": 1,
                 "has_cover": True, "cover_font_size": 10},
        saida={"width_mm": 160, "height_mm": 60, "file_format": "pdf"},
        numeracao={"tipo": "TICKET", "ticket_qtd": tickets},
        seq_start=inicio, seq_end=inicio + qtd - 1, seq_increment=1,
        layout_schema="cut_stack", cut_stack_mode="strict", sheets_per_block=50,
    )
    cfg.total_items = qtd  # celulas fisicas; teste isolado do desenho das capas
    eng = ImpositionEngine(cfg)
    eng.rotate_angle = 0
    itens = [dict(doc_base=None, val1=inicio + i, local_idx=i, global_idx=i,
                  model_idx=0, start_base=inicio, num_tipo="TICKET", ticket_qtd=tickets)
             for i in range(qtd)]
    mapa = itens
    if caminho == "segundo_modelo":
        anteriores = [dict(item, model_idx=0, start_base=1, val1=i + 1)
                      for i, item in enumerate(itens[:50])]
        itens = [dict(item, model_idx=1, global_idx=i + len(anteriores))
                 for i, item in enumerate(itens)]
        mapa = anteriores + itens
    if caminho != "simples":
        # O modelo deve prevalecer sobre a configuracao geral da combinacao.
        cfg.num_tipo = "SEQUENCIAL"
        cfg.ticket_qtd = 1
    for primeiro in range(0, qtd, 50):
        bloco = primeiro // 50 + 1
        ultimo = min(primeiro + 49, qtd - 1)
        if caminho == "simples":
            eng._generate_capa(bloco - 1, 50, 1, cfg, None, ((qtd + 49) // 50) * 50)
            doc = fitz.open(eng.generated_files[-1]["path"])
        else:
            doc = fitz.open()
            page = doc.new_page(width=cfg.sheet_w, height=cfg.sheet_h)
            eng._desenhar_capa_de_bloco(page, 0, 0, itens[primeiro], itens[ultimo], cfg, mapa, 50)
        with doc:
            texto = doc[0].get_text()
        match = re.search(r"Bloco (\d+)\s*-?\s*de (\d+) a (\d+)", texto)
        assert match, texto
        assert tuple(map(int, match.groups())) == (
            bloco, inicio + primeiro * tickets, inicio + (ultimo + 1) * tickets - 1)
