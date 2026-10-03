"""Regressões com bancos sintéticos e o PDF produzido pelo motor real."""
import copy
import json
import subprocess
from pathlib import Path

import fitz
import pytest

import teatro_banco
from engine import ImpositionConfig, ImpositionEngine

ROOT = Path(__file__).resolve().parents[1]


def linhas(setor="plateia", tamanhos=(3, 4, 2)):
    return [{"Mapa_ID": "ideal", "Setor_ID": setor, "Revisao_Mapa": "a" * 64,
             "Origem": "Mapa de Teatro", "Fila": chr(65 + f), "Bloco": chr(65 + f),
             "Numero": str(n + 1)} for f, q in enumerate(tamanhos) for n in range(q)]


def test_importacao_e_previa_js():
    resultado = subprocess.run(["node", "tests/teatro_banco_harness.js"], cwd=ROOT,
                              capture_output=True, text=True, timeout=60)
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr


def test_montagem_js_python_identica():
    modelos = [{"rows": linhas(str(s)), "items": list(range(9 * s, 9 * (s + 1)))} for s in range(4)]
    original = copy.deepcopy(modelos)
    js = "const T=require('./frontend/teatro-banco.js');let b='';process.stdin.on('data',d=>b+=d);process.stdin.on('end',()=>console.log(JSON.stringify(T.montarSets(JSON.parse(b),2))));"
    r = subprocess.run(["node", "-e", js], input=json.dumps(modelos), cwd=ROOT,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    sets = teatro_banco.montar_sets(modelos, 2)
    assert json.loads(r.stdout) == sets
    assert modelos == original
    assert sorted(i for s in sets for p in s["cell_allocations"] for i in p if i is not None) == list(range(36))


@pytest.mark.parametrize("mutacao", ["setor", "intercalado", "numero", "quantidade", "misturado"])
def test_banco_inconsistente_recusado(mutacao):
    rows = linhas()
    items = list(range(9))
    if mutacao == "setor": rows[3]["Setor_ID"] = "outro"
    if mutacao == "intercalado": rows[1], rows[3] = rows[3], rows[1]
    if mutacao == "numero": rows[2]["Numero"] = ""
    if mutacao == "quantidade": items.pop()
    modelos = [{"rows": rows, "items": items}]
    if mutacao == "misturado": modelos.append({"rows": [], "items": [1]})
    with pytest.raises(ValueError): teatro_banco.montar_sets(modelos, 2)


def impor(tmp_path, **extra):
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "teatro.pdf"),
        formato={"name": "Ingresso", "width_mm": 100, "height_mm": 50, "cols": 2, "rows": 1,
                 "gap_h_mm": 0, "gap_v_mm": 0, "offset_h_mm": 0, "offset_v_mm": 0, "rotations": {}},
        saida={"name": "Folha", "width_mm": 220, "height_mm": 150},
        numeracao={"tipo": "TEATRO", "elements": [{"type": "TEATRO_COMBO", "x_mm": 12,
                   "y_mm": 20, "font_size": 14, "font_name": "helv", "color": "#000000"}]},
        csv_data=extra.pop("csv_data", linhas()), seq_start=1, seq_end=9, layout_schema=extra.pop("layout_schema", "cut_stack"),
        cut_stack_mode="strict_assembly", sheets_per_block=50, **extra)
    ImpositionEngine(cfg).process()
    return sorted(tmp_path.glob("*_02_miolo.pdf"))


def conteudos(paths):
    saida = []
    for path in paths:
        with fitz.open(path) as doc:
            saida.append([[w[4] for w in p.get_text("words")] for p in doc])
    return saida


def test_pdf_mantem_fila_em_uma_pose_e_nao_inventa_lugares(tmp_path):
    arquivos = impor(tmp_path)
    assert len(arquivos) == 2
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == 4
        for i, p in enumerate(doc):
            tokens = p.get_text("words")
            esquerda = [w[4] for w in tokens if w[0] < 110 * 72 / 25.4]
            direita = [w[4] for w in tokens if w[0] >= 110 * 72 / 25.4]
            assert esquerda == (["A", "-", str(i + 1)] if i < 3 else [])
            assert direita == ["B", "-", str(i + 1)]
    with fitz.open(arquivos[1]) as doc:
        assert len(doc) == 2
        assert [p.get_text().strip() for p in doc] == ["C - 1", "C - 2"]


def test_refazer_set_2_preserva_os_lugares_da_fila_c(tmp_path):
    assert conteudos(impor(tmp_path, refazer_set=2, refazer_de=1, refazer_ate=1)) == [[["C", "-", "1"]]]


def test_sequencial_recusa_banco_com_blocos(tmp_path):
    with pytest.raises(ValueError, match="Montagem estrita"):
        impor(tmp_path, layout_schema="sequential")


def test_fila_maior_que_bloco_do_erp_nao_e_truncada(tmp_path):
    arquivos = impor(tmp_path, csv_data=linhas(tamanhos=(60, 2)))
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == 60
        assert doc[-1].get_text().strip() == "A - 60"


def test_refazer_folha_60_do_conjunto_maior(tmp_path):
    arquivos = impor(tmp_path, csv_data=linhas(tamanhos=(60, 2)), refazer_set=1, refazer_de=60, refazer_ate=60)
    assert conteudos(arquivos) == [[["A", "-", "60"]]]


def test_quatro_artes_leem_apenas_os_lugares_do_proprio_setor(tmp_path):
    artes = []
    for i, qtd in enumerate((3, 4, 2, 5)):
        path = tmp_path / f"arte{i}.pdf"
        with fitz.open() as doc:
            p = doc.new_page(width=100 * 72 / 25.4, height=50 * 72 / 25.4)
            p.insert_text((20, 20), f"ARTE{i}")
            doc.save(path)
        rows = linhas(str(i), (qtd,))
        for row in rows: row["Fila"] = row["Bloco"] = str(i)
        artes.append({"qtd": qtd, "modelo": str(i), "local_path": str(path),
            "numeracao": {"tipo": "TEATRO", "start": 1, "csv_data": rows,
            "elements": [{"type": "TEATRO_COMBO", "x_mm": 12, "y_mm": 20,
                          "font_size": 14, "font_name": "helv", "color": "#000000"}]}})
    original = copy.deepcopy(artes)
    arquivos = impor(tmp_path, multi_artes=artes)
    assert artes == original
    vistos = []
    for path in arquivos:
        with fitz.open(path) as doc:
            for p in doc:
                for inicio, fim in ((0, 110), (110, 220)):
                    clip = fitz.Rect(inicio * 72 / 25.4, 0, fim * 72 / 25.4, p.rect.height)
                    texto = p.get_text(clip=clip).strip().splitlines()
                    if not texto: continue
                    arte, lugar = texto
                    setor, numero = lugar.split(" - ")
                    assert arte == "ARTE" + setor
                    vistos.append((int(setor), int(numero)))
    assert sorted(vistos) == [(i, n) for i, q in enumerate((3, 4, 2, 5)) for n in range(1, q + 1)]


def test_capa_identifica_conjunto_e_quantidade_exata(tmp_path):
    # A capa identifica o conjunto real, mesmo com BLOCO comercial de 50.
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "capas.pdf"),
        formato={"width_mm":100,"height_mm":50,"cols":2,"rows":1,"has_cover":True,"cover_font_y":20},
        saida={"width_mm":220,"height_mm":150},
        numeracao={"tipo":"TEATRO","elements":[{"type":"TEATRO_COMBO","x_mm":12,"y_mm":20,"font_size":14}]}, csv_data=linhas(),
        layout_schema="cut_stack",cut_stack_mode="strict_assembly",sheets_per_block=50)
    ImpositionEngine(cfg).process()
    textos = []
    for path in sorted(tmp_path.glob("*_01_capa.pdf")):
        with fitz.open(path) as doc: textos.extend(p.get_text() for p in doc)
    assert len(textos) == 2
    assert "Fila A" in textos[0] and "(3 lugares)" in textos[0]
    assert "Fila B" in textos[0] and "(4 lugares)" in textos[0]
    assert "Fila C" in textos[1] and "(2 lugares)" in textos[1]
