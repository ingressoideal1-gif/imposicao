"""A primeira folha conserva a montagem, os números, as faces e o ICC original."""
import subprocess
from pathlib import Path

import fitz
import pytest

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / 'tests/folha1_pedido_harness.js'


def node(*args):
    result = subprocess.run(['node', *map(str, args)], cwd=ROOT, capture_output=True,
                            text=True, encoding='utf-8', timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr


def test_dom_payload_e_destinos():
    node(HARNESS)
    node(ROOT / 'tests/pedido_faces_impressao_harness.js')


@pytest.mark.parametrize('schema,stack', [('sequential', 'independent'),
                                         ('cut_stack', 'independent'),
                                         ('cut_stack', 'strict_assembly')])
@pytest.mark.parametrize('mode', ['front', 'duplex', 'duplex_unico'])
def test_folha1_igual_a_original(tmp_path, monkeypatch, schema, stack, mode):
    monkeypatch.chdir(tmp_path)
    import socket
    def sem_rede(*args, **kwargs):
        raise AssertionError('Teste exclusivamente local com dados sintéticos')
    monkeypatch.setattr(socket.socket, 'connect', sem_rede)
    from engine import ImpositionConfig, ImpositionEngine

    def generate(name, **selection):
        output = tmp_path / name
        cfg = ImpositionConfig(
            base_file='', out_pdf=str(output),
            formato=dict(width_mm=70, height_mm=40, cols=2, rows=2, gap_h_mm=2,
                         gap_v_mm=2, offset_h_mm=0, offset_v_mm=0, rotations={}),
            saida=dict(width_mm=180, height_mm=120),
            numeracao=dict(tipo='SEQUENCIAL', print_mode=mode, elements=[
                dict(type='TEXT', face=face, x_mm=15, y_mm=15, font_size=12,
                     font_name='helv', color='#000000', prefix=prefix)
                for face, prefix in [('front', 'F-'), ('back', 'V-')]]),
            seq_start=101, seq_end=140, layout_schema=schema, print_mode=mode,
            cut_stack_mode=stack, sheets_per_block=5, block_depth=2,
            entregar_por_bloco=True, **selection)
        engine = ImpositionEngine(cfg)
        engine.process()
        return [Path(f['path']) for f in engine.generated_files
                if f['type'] not in ('capa', 'contracapa')] or [output]

    original = generate('completo.pdf')
    selected = generate('folha1.pdf', refazer_de=1, refazer_ate=1, refazer_set=1)
    assert len(selected) == 1
    with fitz.open(selected[0]) as first:
        assert len(first) == (1 if mode == 'front' else 2)
    for face in (['front'] if mode == 'front' else ['front', 'back', 'both']):
        output = tmp_path / f'{face}.pdf'
        node(HARNESS, '--filter', selected[0], output, face, mode)
        with fitz.open(original[0]) as source, fitz.open(output) as result:
            indices = [0, 1] if face == 'both' else [1 if face == 'back' else 0]
            assert len(result) == len(indices)
            assert result.xref_get_key(result.pdf_catalog(), 'OutputIntents')[0] != 'null'
            for page, index in zip(result, indices):
                assert ('V-' if index else 'F-') in page.get_text()
                assert page.get_text() == source[index].get_text()
                assert page.get_pixmap().samples == source[index].get_pixmap().samples
