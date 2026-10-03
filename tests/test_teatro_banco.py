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


def test_teatro_vertical_na_previa_e_na_validacao_de_pronto():
    resultado = subprocess.run(["node", "tests/teatro_vertical_modelo_harness.js"], cwd=ROOT,
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


def test_pdf_preenche_verticalmente_e_continua_ao_trocar_fila(tmp_path):
    arquivos = impor(tmp_path)
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == 5
        left = [("A", 1), ("A", 2), ("A", 3), ("B", 1), ("B", 2)]
        right = [("B", 3), ("B", 4), ("C", 1), ("C", 2), None]
        for i, p in enumerate(doc):
            tokens = p.get_text("words")
            esquerda = [w[4] for w in tokens if w[0] < 110 * 72 / 25.4]
            direita = [w[4] for w in tokens if w[0] >= 110 * 72 / 25.4]
            assert esquerda == [left[i][0], "-", str(left[i][1])]
            assert direita == ([right[i][0], "-", str(right[i][1])] if right[i] else [])


def test_refazer_ultima_folha_preserva_sua_posicao_vertical(tmp_path):
    assert conteudos(impor(tmp_path, refazer_set=1, refazer_de=5, refazer_ate=5)) == [[["B", "-", "2"]]]


def test_tipo_teatro_prevalece_sobre_modo_sequencial_salvo(tmp_path):
    assert conteudos(impor(tmp_path, layout_schema="sequential")) == conteudos(impor(tmp_path))


def test_bloco_do_erp_nao_divide_a_montagem_teatro(tmp_path):
    arquivos = impor(tmp_path, csv_data=linhas(tamanhos=(60, 2)))
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == 31
        assert doc[-1].get_text().strip().splitlines() == ["A - 31", "B - 2"]


def test_refazer_folha_31_de_62_lugares(tmp_path):
    arquivos = impor(tmp_path, csv_data=linhas(tamanhos=(60, 2)), refazer_set=1, refazer_de=31, refazer_ate=31)
    assert conteudos(arquivos) == [[["A", "-", "31", "B", "-", "2"]]]


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


def test_capa_identifica_os_limites_reais_de_cada_pilha(tmp_path):
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "capas.pdf"),
        formato={"width_mm":100,"height_mm":50,"cols":2,"rows":1,"has_cover":True,"cover_font_y":20},
        saida={"width_mm":220,"height_mm":150},
        numeracao={"tipo":"TEATRO","elements":[{"type":"TEATRO_COMBO","x_mm":12,"y_mm":20,"font_size":14}]}, csv_data=linhas(),
        layout_schema="cut_stack",cut_stack_mode="strict_assembly",sheets_per_block=50)
    ImpositionEngine(cfg).process()
    textos = []
    for path in sorted(tmp_path.glob("*_01_capa.pdf")):
        with fitz.open(path) as doc: textos.extend(p.get_text() for p in doc)
    assert len(textos) == 1
    assert "Fila A / 1 a Fila B / 2 (5 lugares)" in textos[0]
    assert "Fila B / 3 a Fila C / 2 (4 lugares)" in textos[0]


@pytest.mark.parametrize("qtd,folhas", [(82, 11), (515, 65), (12, 2), (1, 1)])
def test_quantidades_por_modelo_na_grade_de_oito(qtd, folhas):
    rows = linhas(tamanhos=(qtd // 2, qtd - qtd // 2))
    s = teatro_banco.montar_sets([{"rows": rows, "items": list(range(qtd))}], 8)[0]
    assert s["num_sheets"] == folhas
    for p, coluna in enumerate(s["cell_allocations"]):
        assert coluna == [i if i < qtd else None for i in range(p * folhas, (p + 1) * folhas)]


def test_teatro_legado_sem_marcadores_do_mapa_tambem_e_vertical(tmp_path):
    rows = [{"Fila": r["Fila"], "Numero": r["Numero"]} for r in linhas()]
    arquivos = impor(tmp_path, csv_data=rows, layout_schema="sequential")
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == 5
        assert doc[0].get_text().strip().splitlines() == ["A - 1", "B - 3"]


@pytest.mark.parametrize("qtd,folhas", [(82, 11), (515, 65)])
def test_pdf_real_em_oito_poses_tem_a_ordem_vertical_completa(tmp_path, qtd, folhas):
    rows = linhas(tamanhos=(qtd // 2, qtd - qtd // 2))
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "oito.pdf"),
        formato={"width_mm": 100, "height_mm": 25, "cols": 2, "rows": 4},
        saida={"width_mm": 220, "height_mm": 150}, csv_data=rows,
        numeracao={"tipo": "TEATRO", "elements": [{"type": "TEATRO_COMBO", "x_mm": 12,
            "y_mm": 20, "font_size": 10, "font_name": "helv", "color": "#000000"}]},
        layout_schema="sequential", cut_stack_mode="independent", sheets_per_block=50)
    engine = ImpositionEngine(cfg)
    engine.process()
    arquivos = sorted(tmp_path.glob("*_02_miolo.pdf"))
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == folhas
        for s, page in enumerate(doc):
            for p in range(8):
                x, y = 10 + (p % 2) * 100, 25 + (p // 2) * 25
                clip = fitz.Rect(x * 72 / 25.4, y * 72 / 25.4, (x + 100) * 72 / 25.4, (y + 25) * 72 / 25.4)
                indice = p * folhas + s
                esperado = f"{rows[indice]['Fila']} - {rows[indice]['Numero']}" if indice < qtd else ""
                assert page.get_text(clip=clip).strip() == esperado
