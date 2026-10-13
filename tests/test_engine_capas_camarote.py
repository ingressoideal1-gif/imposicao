"""Capas por camarote, independentemente dos blocos fisicos de 50."""
import re

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine


@pytest.mark.parametrize('combinado', [False, True])
@pytest.mark.parametrize('camarotes,lugares,inicio', [(10, 10, 1), (12, 10, 1), (15, 4, 1), (60, 4, 7), (3, 120, 5)])
def test_uma_capa_por_camarote(tmp_path, monkeypatch, camarotes, lugares, inicio, combinado):
    monkeypatch.chdir(tmp_path)
    with fitz.open() as doc:
        page = doc.new_page(width=200, height=100)
        page.draw_rect(fitz.Rect(10, 10, 20, 20), fill=(0, 0, 0))
        doc.save('arte.pdf')
    artes = []
    if combinado:
        artes = [
            {'qtd': camarotes * lugares, 'local_path': 'arte.pdf', 'pdf_url': 'local_file',
             'numeracao': {'tipo': 'CAMAROTE', 'elements': []}, 'c_ini': inicio, 'l_cam': lugares, 'q_cam': camarotes},
            {'qtd': 6, 'local_path': 'arte.pdf', 'pdf_url': 'local_file',
             'numeracao': {'tipo': 'CAMAROTE', 'elements': []}, 'c_ini': 91, 'l_cam': 2, 'q_cam': 3},
            {'qtd': 50, 'local_path': 'arte.pdf', 'pdf_url': 'local_file',
             'numeracao': {'tipo': 'SEQUENCIAL', 'elements': [], 'start': 1}},
        ]
    cfg = ImpositionConfig(
        base_file='arte.pdf', out_pdf='saida.pdf',
        formato={'width_mm': 210, 'height_mm': 74, 'cols': 1, 'rows': 4, 'has_cover': True},
        saida={'width_mm': 220, 'height_mm': 320, 'file_format': 'pdf'},
        numeracao={'tipo': 'CAMAROTE', 'elements': []},
        seq_start=1, seq_end=camarotes * lugares,
        c_ini=inicio, q_cam=camarotes, l_cam=lugares,
        layout_schema='cut_stack', cut_stack_mode='strict_assembly', sheets_per_block=50,
        multi_artes=artes,
    )
    engine = ImpositionEngine(cfg)
    engine.process()
    rotulos = []
    blocos = []
    paginas = {'capa': 0, 'contracapa': 0}
    for arquivo in engine.generated_files:
        if arquivo['type'] not in paginas:
            continue
        with fitz.open(arquivo['path']) as doc:
            paginas[arquivo['type']] += len(doc)
            if arquivo['type'] == 'capa':
                for page in doc:
                    rotulos.extend((int(a), int(b)) for a, b in re.findall(r'Camarote (\d+)\s*-?\s*de 1 a (\d+)', page.get_text()))
                    blocos.extend(re.findall(r'Bloco (\d+)', page.get_text()))
    esperados = [(n, lugares) for n in range(inicio, inicio + camarotes)]
    if combinado:
        esperados += [(n, 2) for n in range(91, 94)]
    assert sorted(rotulos) == sorted(esperados)
    assert paginas['capa'] == paginas['contracapa']
    assert len(blocos) == (1 if combinado else 0)
