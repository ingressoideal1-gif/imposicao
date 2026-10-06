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


@pytest.mark.parametrize("indice,quantidade,folhas", [(0, 82, 11), (1, 515, 65)])
def test_snapshot_erp_convertido_no_frontend_imprime_todos_os_lugares(tmp_path, indice, quantidade, folhas):
    js = """
const {fixture}=require('./tests/mapa_teatro_snapshot_harness.js');
const S=require('./frontend/teatro-snapshot.js');
fixture().then(async f=>{
    const numeracoes=f.modelos.map((m,i)=>S.resolver(f.nums[i],m));
    for(const num of numeracoes) await S.conferir(num,async()=>f.mapa);
    console.log(JSON.stringify({numeracoes,mapa:f.mapa}));
});
"""
    r = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    fonte = json.loads(r.stdout)
    numeracao = fonte['numeracoes'][indice]
    import teatro_snapshot
    payload = {'modelo': numeracao['teatro_modelo']['id'], 'qtd': quantidade, 'numeracao': numeracao}
    assert teatro_snapshot.aplicar(payload, lambda _: fonte['mapa']) == []
    rows = numeracao["csv_data"]
    assert len(rows) == quantidade
    conjunto = rows[0]["Conjunto"]
    numeracao["elements"] = [{"type": "TEATRO_COMBO", "x_mm": 50, "y_mm": 25, "font_size": 14,
        "font_name": "helv", "prefix_fila": conjunto + ": ", "prefix_lugar": "Lugar: ", "layout": "1line"}]
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "snapshot.pdf"),
        formato={"width_mm": 100, "height_mm": 50, "cols": 2, "rows": 4,
            "gap_h_mm": 0, "gap_v_mm": 0, "offset_h_mm": 0, "offset_v_mm": 0, "rotations": {}},
        saida={"width_mm": 220, "height_mm": 230}, numeracao=numeracao, csv_data=rows,
        seq_start=1, seq_end=quantidade, layout_schema="sequential", sheets_per_block=50)
    ImpositionEngine(cfg).process()
    arquivos = sorted(tmp_path.glob("*_02_miolo.pdf"))
    assert len(arquivos) == 1
    with fitz.open(arquivos[0]) as doc:
        assert len(doc) == folhas
        impressos = [linha.strip() for pagina in doc for linha in pagina.get_text().splitlines() if linha.strip()]
    esperados = [f"{conjunto}: {row['Fila']} - Lugar: {row['Numero']}" for row in rows]
    assert len(impressos) == quantidade
    assert sorted(impressos) == sorted(esperados)


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
                 "gap_h_mm": 0, "gap_v_mm": 0, "offset_h_mm": 0, "offset_v_mm": 0, "rotations": {},
                 "has_cover": extra.pop("com_capa", False), "cover_font_y": 25, "cover_font_size": 8},
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


@pytest.mark.parametrize("com_capa", [False, True])
def test_quatro_artes_leem_apenas_os_lugares_do_proprio_setor(tmp_path, com_capa):
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
    arquivos = impor(tmp_path, multi_artes=artes, com_capa=com_capa)
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
    if com_capa:
        capas = sorted(tmp_path.glob("*_01_capa.pdf"))
        assert len(capas) == 4
        vistos_capas = []
        for path in capas:
            with fitz.open(path) as doc:
                texto = doc[0].get_text()
                assert texto.count("ARTE") == 1
                i = int(texto.split("ARTE", 1)[1][0])
                vistos_capas.append(i)
                assert f"Fila {i} - Teatro - de 1 a {(3, 4, 2, 5)[i]}" in texto
        assert sorted(vistos_capas) == [0, 1, 2, 3]


def test_capa_por_fila_independente_dos_limites_da_pilha(tmp_path):
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
    assert "Fila A - Teatro - de 1 a 3 (3 lugares)" in textos[0]
    assert "Fila B - Teatro - de 1 a 4 (4 lugares)" in textos[0]
    assert "Fila C - Teatro - de 1 a 2 (2 lugares)" in textos[1]
    assert textos[1].count("Fila") == 1
    with fitz.open(next(tmp_path.glob("*_03_contracapa.pdf"))) as doc:
        assert len(doc) == 2


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


@pytest.mark.parametrize("conjunto", ["Mesa", "Fileira Especial", "Camarote"])
def test_capas_preservam_nome_editado_do_pdf_do_mapa_e_todas_as_filas(tmp_path, conjunto):
    # Os rótulos esperados vêm da preparação real do PDF do mapa.
    js = """
const fs=require('node:fs'),vm=require('node:vm');
const T=require('./frontend/teatro-banco.js');
const c={window:{}};vm.createContext(c);
vm.runInContext(fs.readFileSync('frontend/mapas-teatro-pdf.js','utf8'),c);
const cadeiras=Object.fromEntries(Array.from({length:17},(_,y)=>
    Array.from({length:1+y%3},(_,x)=>[x+','+y,{prefixo:'VIP '+String(y+1).padStart(2,'0'),num:String(x+1).padStart(2,'0'),tipo:'Normal'}])).flat());
const mapa={id:'mapa',name:'Mapa teste',config:{setores:[{id:'setor',nome:'Setor',nomeConjunto:process.argv[1],cadeiras}]}};
const pdf=c.window.MapasTeatroPdf.preparar(mapa).setores[0];
const banco=T.preparar(mapa,'a'.repeat(64)).setores[0];
console.log(JSON.stringify({rows:banco.rows,rotulos:pdf.filas.map(([fila])=>pdf.nomeConjunto+' '+fila)}));
"""
    r = subprocess.run(["node", "-e", js, conjunto], cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    fonte = json.loads(r.stdout)
    rows = fonte["rows"]
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "capas.pdf"),
        formato={"width_mm":120,"height_mm":25,"cols":2,"rows":4,
                 "has_cover":True,"cover_font_y":15,"cover_font_size":8},
        saida={"width_mm":260,"height_mm":130},
        numeracao={"tipo":"TEATRO","elements":[{"type":"TEATRO_COMBO","x_mm":10,"y_mm":15,"font_size":8}]},
        csv_data=rows, layout_schema="sequential", sheets_per_block=50)
    ImpositionEngine(cfg).process()
    with fitz.open(next(tmp_path.glob("*_01_capa.pdf"))) as doc:
        assert len(doc) == 3
        textos = [p.get_text() for p in doc]
        assert [texto.count("VIP") for texto in textos] == [8,8,1]
        for titulo in fonte["rotulos"]:
            assert sum(texto.count(titulo + " - Setor") for texto in textos) == 1
        for idx in range(17):
            qtd = 1 + idx % 3
            assert f"{fonte['rotulos'][idx]} - Setor - de 01 a {qtd:02} ({qtd} lugares)" in textos[idx // 8]
    with fitz.open(next(tmp_path.glob("*_02_miolo.pdf"))) as doc:
        assert len(doc) == (len(rows) + 7) // 8
        assert sum(p.get_text().count("VIP") for p in doc) == len(rows)
