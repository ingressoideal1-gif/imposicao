# -*- coding: utf-8 -*-
"""A folha de capas do set de MONTAGEM traz a capa de TODOS os blocos da sobra.

## O caso que revelou o defeito (pedido 21524, 04/09/2026)

1.500 ingressos em blocos de 50 numa folha de 8 poses. São 30 blocos, e o
operador precisa de 30 capas — uma para cada bloco que ele entrega.

O motor reparte assim: 30 blocos ÷ 8 poses = 3 camadas estritas (24 blocos), e
os 6 blocos que sobram viram um set de MONTAGEM. Nesse set a sobra é compactada
para gastar menos papel — 300 itens em 38 folhas de 8 poses, em vez de 50 folhas
com duas poses vazias — e por isso as pilhas cortadas NÃO começam em fronteira
de bloco: a célula 0 traz os itens 1201 a 1238, a célula 1 começa no 1239. É de
propósito, e é por isso que o operador monta esses blocos contando à mão.

O que estava errado era só a capa. Ela era desenhada por CÉLULA: a célula cujo
primeiro item não caía em fronteira de bloco recebia o carimbo "MONTAGEM" e
nenhuma capa. Como só a célula 0 começava bloco, a folha de capas saía com uma
capa só (Bloco 25) e as capas dos blocos 26 a 30 não eram geradas em lugar
nenhum — o operador montava cinco blocos e não tinha capa para pôr neles.

A regra que estes testes travam: na folha de capas do set de montagem, as capas
saem uma por BLOCO, preenchendo as células em ordem. A folha tem tantas poses
quanto a do trabalho, e a sobra nunca tem mais blocos do que isso — então cabem
todas.
"""
import os
import re

import fitz  # PyMuPDF

from engine import ImpositionConfig, ImpositionEngine

MM2PT = 2.8346


def _arte(caminho):
    doc = fitz.open()
    p = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
    p.draw_rect(fitz.Rect(3, 3, 100 * MM2PT - 3, 50 * MM2PT - 3), color=(0, 0, 0), width=1)
    doc.save(caminho)
    doc.close()


def _impor(tmp_path, monkeypatch, qtd, cols=2, rows=4, bloco=50):
    """Roda o trabalho de corte estrito com montagem e devolve o motor."""
    monkeypatch.chdir(tmp_path)
    _arte("arte.pdf")

    formato = {
        "name": "Ingresso 100x50",
        "width_mm": 100, "height_mm": 50,
        "cols": cols, "rows": rows,
        "gap_h_mm": 2, "gap_v_mm": 2,
        "offset_h_mm": 0, "offset_v_mm": 0,
        "rotations": {},
        "has_cover": True,
        "cover_scale": 80.0,
        "cover_font_size": 10,
    }
    saida = {
        "name": "Folha",
        "width_mm": 100 * cols + 2 * (cols - 1) + 10,
        "height_mm": 50 * rows + 2 * (rows - 1) + 10,
        "file_format": "pdf",
    }
    cfg = ImpositionConfig(
        base_file="", out_pdf="saida.pdf", formato=formato, numeracao=None, saida=saida,
        seq_start=1, seq_end=qtd, seq_increment=1,
        layout_schema="cut_stack", cut_stack_mode="strict_assembly",
        sheets_per_block=bloco, block_depth=1,
        multi_artes=[{"qtd": str(qtd), "local_path": "arte.pdf", "pdf_url": "local_file"}],
    )
    eng = ImpositionEngine(cfg)
    eng.process()
    return eng


def _capas_geradas(eng):
    """Todos os rótulos de capa do trabalho, na ordem dos arquivos.

    Devolve uma lista de `(bloco, inicio, fim)` lida do texto do PDF — é o que o
    operador enxerga no papel, e não um número que o motor diz ter usado.
    """
    rotulos = []
    for arquivo in [f for f in eng.generated_files if f["type"] == "capa"]:
        doc = fitz.open(arquivo["path"])
        for pagina in doc:
            texto = pagina.get_text()
            for m in re.finditer(r"Bloco (\d+)\s*-?\s*de (\d+) a (\d+)", texto):
                rotulos.append((int(m.group(1)), int(m.group(2)), int(m.group(3))))
        doc.close()
    return rotulos


def test_todo_bloco_da_montagem_tem_capa(tmp_path, monkeypatch):
    """1500 em blocos de 50: 30 blocos, 30 capas. Nenhuma pode faltar."""
    eng = _impor(tmp_path, monkeypatch, qtd=1500)
    rotulos = _capas_geradas(eng)

    blocos = sorted(b for b, _, _ in rotulos)
    assert blocos == list(range(1, 31)), (
        "faltou capa de bloco. Esperados os blocos 1..30, vieram: "
        f"{blocos}"
    )

    # A faixa de cada capa é a do bloco: 50 em 50, sem buraco e sem sobreposição.
    faixas = {b: (i, f) for b, i, f in rotulos}
    for b in range(1, 31):
        assert faixas[b] == ((b - 1) * 50 + 1, b * 50), (
            f"o bloco {b} devia dizer 'de {(b-1)*50+1} a {b*50}', "
            f"e diz 'de {faixas[b][0]} a {faixas[b][1]}'"
        )


def test_bloco_incompleto_da_sobra_tambem_ganha_capa(tmp_path, monkeypatch):
    """1520 em blocos de 50: 30 blocos cheios e um de 20 — 31 capas.

    O bloco final menor existe no papel como qualquer outro: ele é entregue ao
    cliente e precisa da capa que diz onde começa e onde termina.
    """
    eng = _impor(tmp_path, monkeypatch, qtd=1520)
    rotulos = _capas_geradas(eng)

    blocos = sorted(b for b, _, _ in rotulos)
    assert blocos == list(range(1, 32)), f"esperados os blocos 1..31, vieram: {blocos}"

    faixas = {b: (i, f) for b, i, f in rotulos}
    assert faixas[31] == (1501, 1520), (
        f"o bloco final devia dizer 'de 1501 a 1520', e diz {faixas[31]}"
    )


def test_o_corte_estrito_nao_mudou(tmp_path, monkeypatch):
    """A repartição em camadas continua a mesma: 3 camadas estritas e 1 montagem.

    A correção é só do desenho da capa. Se um dia alguém mexer na repartição
    para "arrumar" as capas, o papel muda — a montagem gasta 38 folhas onde uma
    camada estrita gastaria 50 — e este teste avisa.
    """
    eng = _impor(tmp_path, monkeypatch, qtd=1500)
    nomes = sorted(os.path.basename(f["path"]) for f in eng.generated_files if f["type"] == "miolo")
    assert nomes == [
        "saida_set1_01_02_miolo.pdf",
        "saida_set1_02_02_miolo.pdf",
        "saida_set1_03_02_miolo.pdf",
        "saida_set2_01_02_miolo.pdf",
    ], f"a repartição dos sets mudou: {nomes}"

    folhas = {}
    for f in eng.generated_files:
        if f["type"] == "miolo":
            doc = fitz.open(f["path"])
            folhas[os.path.basename(f["path"])] = len(doc)
            doc.close()
    assert folhas["saida_set2_01_02_miolo.pdf"] == 38, (
        "a montagem deixou de ser compactada — eram 38 folhas para 300 itens em "
        f"8 poses, agora são {folhas['saida_set2_01_02_miolo.pdf']}"
    )
