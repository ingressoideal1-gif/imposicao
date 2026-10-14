"""Ordem fisica das capas no PDF final, incluindo rotacao e paginas extras."""
import math
import re

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine


def gerar(tmp_path, cols, rows, rotacao, tipo, conjunto, quantidade):
    cfg = ImpositionConfig(
        base_file='', out_pdf=str(tmp_path / 'capas.pdf'),
        formato={'width_mm': 60, 'height_mm': 40, 'cols': cols, 'rows': rows,
                 'gap_h_mm': 2, 'gap_v_mm': 2, 'has_cover': True,
                 'cover_font_size': 5, 'cover_font_x': 3, 'cover_font_y': 8},
        saida={'width_mm': cols * 62 + 8, 'height_mm': rows * 42 + 8,
               'file_format': 'pdf'},
        numeracao=None, seq_start=1, seq_end=quantidade,
        layout_schema='cut_stack', cut_stack_mode='strict_assembly',
        sheets_per_block=1,
    )
    items = []
    for i in range(quantidade):
        item = {'global_idx': i, 'local_idx': i, 'val1': i + 1,
                'doc_base': None, 'num_tipo': tipo}
        if tipo == 'CAMAROTE':
            item.update(l_cam=1, cover_c_ini=1)
        if tipo == 'TEATRO':
            item['csv_row'] = {'Origem': 'Mapa de Teatro', 'Fila': str(i + 1),
                               'Numero': '1', 'Setor': 'Setor A'}
        items.append(item)
    poses = cols * rows
    # Por celula no estrito; uma pilha pode conter varias capas no camarote.
    cells = [[it] for it in items[:poses]] + [[] for _ in range(max(0, poses-len(items)))]
    if quantidade > poses:
        cells[0].extend(items[poses:])
    plano = {'type': conjunto, 'num_sheets': quantidade,
             'cell_allocations': cells, 'depth': 1}
    if tipo == 'TEATRO':
        plano['cover_items'] = [(it, it) for it in items]
    if tipo == 'CAMAROTE':
        # Inclui todos os camarotes na camada sintetica sem mudar a unidade.
        cfg.sheets_per_block = quantidade
    engine = object.__new__(ImpositionEngine)
    engine.rotate_angle = rotacao
    engine.generated_files = []
    engine._generate_capa_for_chunk(0, 0, plano, cfg, items)
    return engine.generated_files[0]['path'], cfg


def rotulos(pagina):
    # O extrator pode agrupar capas vizinhas num unico bloco de texto.
    for bloco in pagina.get_text('dict')['blocks']:
        for linha in bloco.get('lines', []):
            texto = ''.join(span['text'] for span in linha['spans'])
            m = re.search(r'(?:Bloco|Camarote|Fila) (\d+)', texto)
            if m:
                yield int(m[1]), fitz.Rect(linha['bbox'])


@pytest.mark.parametrize('cols,rows', [(2, 4), (3, 2), (1, 4)])
@pytest.mark.parametrize('rotacao', [0, 90, 180, 270])
@pytest.mark.parametrize('tipo', ['SEQUENCIAL', 'CAMAROTE', 'TEATRO'])
@pytest.mark.parametrize('extra', [False, True])
def test_montagem_preenche_colunas_visuais(tmp_path, cols, rows, rotacao, tipo, extra):
    poses = cols * rows
    quantidade = poses + 2 if extra else poses - 1
    arquivo, cfg = gerar(tmp_path, cols, rows, rotacao, tipo, 'assembly', quantidade)
    linhas_visuais = cols if rotacao in (90, 270) else rows
    colunas_visuais = rows if rotacao in (90, 270) else cols
    vistos = []
    with fitz.open(arquivo) as doc:
        assert len(doc) == math.ceil(quantidade / poses)
        for numero_pagina, pagina in enumerate(doc):
            for numero, origem in rotulos(pagina):
                rect = origem * pagina.rotation_matrix
                # Localiza o texto nas celulas da folha vista pelo operador.
                coluna = int(((rect.x0 + rect.x1) / 2) / (pagina.rect.width / colunas_visuais))
                linha = int(((rect.y0 + rect.y1) / 2) / (pagina.rect.height / linhas_visuais))
                ordinal = (numero - 1) % poses
                assert (numero_pagina, coluna, linha) == (
                    (numero - 1) // poses, ordinal // linhas_visuais, ordinal % linhas_visuais)
                vistos.append(numero)
    assert sorted(vistos) == list(range(1, quantidade + 1))


@pytest.mark.parametrize('rotacao', [0, 90, 180, 270])
@pytest.mark.parametrize('tipo', ['SEQUENCIAL', 'CAMAROTE', 'TEATRO'])
def test_estrito_preserva_celulas_originais(tmp_path, rotacao, tipo):
    arquivo, cfg = gerar(tmp_path, 3, 2, rotacao, tipo, 'strict', 6)
    with fitz.open(arquivo) as doc:
        assert len(doc) == 1
        encontrados = list(rotulos(doc[0]))
        assert sorted(n for n, _ in encontrados) == list(range(1, 7))
        for numero, bloco in encontrados:
            ordinal = numero - 1
            # Coordenadas originais: o estrito mantem o vinculo com o miolo.
            col = int(((bloco[0] + bloco[2]) / 2) / (cfg.sheet_w / 3))
            row = int(((bloco[1] + bloco[3]) / 2) / (cfg.sheet_h / 2))
            assert (row, col) == divmod(ordinal, 3)
