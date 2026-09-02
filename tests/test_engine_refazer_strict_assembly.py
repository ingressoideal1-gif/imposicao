# -*- coding: utf-8 -*-
"""Refazer Folhas no Cut & Stack de montagem estrita: o "set" e o da TELA.

## O defeito (pedido 21460, 02/09/2026)

Relato do usuario, ao tentar o Refazer Folhas num modelo de 3.000 pecas com
bloco de 200: *"Erro: Refazer: nada corresponde a folhas 10-10 do set 3."*

A tela e o motor contavam os sets de jeitos diferentes:

    3.000 pecas, 4 poses, bloco de 200 (15 blocos)
      tela  (buildStrictAssemblySets)  4 sets: 200, 200, 200, 150 folhas
      motor (set_definitions)          2 sets: 600 (3 camadas) e 150 folhas

A tela mostra cada CAMADA de um set estrito como um set — e o nome do arquivo
diz o mesmo: `_set1_01`, `_set1_02`, `_set1_03`, `_set2`. Quem segura a pilha
"set1_03" na mao e quer refazer a folha 10 dela escolhe "Set 3, folha 10", como
a tela oferece. O motor procurava o set 3 entre os seus dois, nao achava, e
recusava. Pior: "Set 2, folha 10" reimprimia em silencio a folha 10 da SOBRA
(o set 2 do motor), que e outra pilha.

Desde esta data o motor conta como a tela: cada camada e um set, e a folha
conta dentro da camada. A recusa passou a dizer quais sets existem.

## O cenario destes testes

40 itens, 2 x 2 poses, bloco de 5 folhas: 8 blocos completos, profundidade 2,
um set estrito de 10 folhas em 2 camadas. Para a tela e para o nome do arquivo,
sao 2 sets de 5 folhas: `_set1_01_02_miolo.pdf` e `_set1_02_02_miolo.pdf`.
"""
import glob
import json
import os
import re
import shutil
import subprocess

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}
SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}
NUMERACAO = {
    "tipo": "SEQUENCIAL",
    "elements": [
        {"type": "TEXT", "x_mm": 10, "y_mm": 20, "font_size": 14, "color": "#000000", "prefix": "N"}
    ],
}
ITENS = 40
BLOCO = 5           # folhas por bloco
POSES = 4           # 2 x 2


def impor(tmp_path, **refazer):
    """Roda o motor e devolve {nome do arquivo de miolo: [numeros por pagina]}."""
    os.makedirs(str(tmp_path), exist_ok=True)   # o motor nao cria a pasta de saida
    out = tmp_path / "trabalho.pdf"
    cfg = ImpositionConfig(
        base_file="",                        # sem arte: o motor impoe so a numeracao
        out_pdf=str(out),
        formato=FORMATO,
        numeracao=NUMERACAO,
        saida=SAIDA,
        seq_start=1,
        seq_end=ITENS,
        seq_increment=1,
        layout_schema="cut_stack",
        cut_stack_mode="strict_assembly",
        sheets_per_block=BLOCO,
        block_depth=1,
        **refazer,
    )
    ImpositionEngine(cfg).process()
    saida = {}
    for caminho in sorted(glob.glob(str(tmp_path / "*_02_miolo.pdf"))):
        doc = fitz.open(caminho)
        try:
            saida[os.path.basename(caminho)] = [
                sorted(int(n) for n in re.findall(r"N(\d+)", pagina.get_text())) for pagina in doc
            ]
        finally:
            doc.close()
    return saida


def sets_da_tela(itens, bloco, poses):
    """O que `buildStrictAssemblySets` (frontend/pedido.js) conta para o mesmo trabalho."""
    node = shutil.which("node")
    if not node:
        pytest.skip("node nao encontrado")
    js = (
        "const fs=require('fs');const src=fs.readFileSync('frontend/pedido.js','utf8');"
        "const i=src.indexOf('\\nfunction buildStrictAssemblySets(');const j=src.indexOf('\\n}',i);"
        "const fn=new Function('state',src.slice(i,j+2)+'\\nreturn buildStrictAssemblySets;')({numeracoes:[]});"
        f"console.log(JSON.stringify(fn([],false,{itens},{bloco},{poses}).map(s=>s.num_sheets)));"
    )
    r = subprocess.run([node, "-e", js], cwd=RAIZ, capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip())


def test_a_tiragem_inteira_sai_num_arquivo_por_set_da_tela(tmp_path):
    """2 camadas = 2 arquivos = os 2 sets que a tela oferece, com 5 folhas cada."""
    inteira = impor(tmp_path)
    assert sorted(inteira) == ["trabalho_set1_01_02_miolo.pdf", "trabalho_set1_02_02_miolo.pdf"]
    assert [len(p) for p in inteira.values()] == [BLOCO, BLOCO]
    assert sets_da_tela(ITENS, BLOCO, POSES) == [BLOCO, BLOCO], (
        "a tela deixou de contar uma camada por set: o Refazer voltaria a divergir do motor"
    )


def test_refazer_o_set_2_da_tela_reimprime_a_camada_2(tmp_path):
    """"Set 2, folha 3" e a folha 3 do arquivo `_set1_02` — a pilha que o operador segura.

    Antes, o motor procurava um set 2 proprio (que nao existe: ele tinha um set
    de 10 folhas) e recusava com "nada corresponde".
    """
    inteira = impor(tmp_path / "inteira")
    refeita = impor(tmp_path / "refeita", refazer_set=2, refazer_de=3, refazer_ate=3)
    assert list(refeita) == ["trabalho_set1_02_02_miolo.pdf"], (
        "a folha refeita tem de sair com o nome da pilha original"
    )
    assert refeita["trabalho_set1_02_02_miolo.pdf"] == [inteira["trabalho_set1_02_02_miolo.pdf"][2]]


def test_refazer_o_set_1_continua_igual(tmp_path):
    """Na primeira camada as duas contagens sempre coincidiram: nada muda ali."""
    inteira = impor(tmp_path / "inteira")
    refeita = impor(tmp_path / "refeita", refazer_set=1, refazer_de=2, refazer_ate=4)
    assert list(refeita) == ["trabalho_set1_01_02_miolo.pdf"]
    assert refeita["trabalho_set1_01_02_miolo.pdf"] == inteira["trabalho_set1_01_02_miolo.pdf"][1:4]


def test_set_que_nao_existe_diz_quais_existem(tmp_path):
    """A recusa tem de oferecer a saida: quantos sets ha e quantas folhas cada um tem."""
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_set=3, refazer_de=1, refazer_ate=1)
    frase = str(erro.value)
    assert "nada corresponde" in frase
    assert "2 set" in frase and "5 folha" in frase, frase


def test_folha_alem_da_camada_diz_quais_existem(tmp_path):
    """Folha 6 numa camada de 5: mesma recusa, mesma saida na frase."""
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_set=2, refazer_de=6, refazer_ate=6)
    assert "2 set" in str(erro.value) and "5 folha" in str(erro.value)
