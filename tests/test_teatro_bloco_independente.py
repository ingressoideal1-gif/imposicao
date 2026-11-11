"""Lugares editados: contrato JS/Python e PDF real, sem serviços externos."""
import json
from pathlib import Path
import subprocess

import fitz
import teatro_banco
import teatro_snapshot
from engine import ImpositionConfig, ImpositionEngine


def test_lugar_editado_preserva_bloco_snapshot_e_capa(tmp_path):
    fonte = subprocess.run(['node', 'tests/teatro_bloco_independente_harness.js', '--payload'],
                           cwd=Path(__file__).resolve().parents[1], capture_output=True,
                           text=True, encoding='utf-8', check=True)
    dados = json.loads(fonte.stdout)
    rows = dados['rows']
    assert teatro_snapshot.linhas(dados['modelo']) == rows
    assert [(b['fila'], b['quantidade']) for b in teatro_banco.grupos(rows)] == [('A', 4), ('K', 1)]
    cfg = ImpositionConfig(base_file='', out_pdf=str(tmp_path / 'editado.pdf'),
        formato={'width_mm': 100, 'height_mm': 50, 'cols': 2, 'rows': 1,
                 'has_cover': True, 'cover_font_y': 20},
        saida={'width_mm': 220, 'height_mm': 150},
        numeracao={'tipo': 'TEATRO', 'elements': [{'type': 'TEATRO_COMBO', 'x_mm': 12,
                    'y_mm': 20, 'font_size': 14, 'font_name': 'helv'}]}, csv_data=rows,
        layout_schema='cut_stack', cut_stack_mode='strict_assembly')
    ImpositionEngine(cfg).process()
    with fitz.open(next(tmp_path.glob('*_01_capa.pdf'))) as doc:
        texto = ''.join(p.get_text() for p in doc)
        assert 'Fila A - Plateia - de 009 a 010 (4 lugares)' in texto
        assert 'Fila K - Plateia - de 001 a 001 (1 lugares)' in texto
    with fitz.open(next(tmp_path.glob('*_02_miolo.pdf'))) as doc:
        texto = ''.join(p.get_text() for p in doc)
        assert 'K - 009' in texto and 'L - 010' in texto
