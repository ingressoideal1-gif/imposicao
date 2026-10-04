"""Combinações permitidas no PDF real, sem rede, pool ou dados de produção."""
import base64
import copy
import io
import socket
import subprocess
from pathlib import Path

import fitz
from PIL import Image
import pytest

import newprod_temp
from engine import ImpositionConfig, ImpositionEngine, MM2PT


@pytest.mark.parametrize('harness', ['ticket_condicoes_harness.js', 'ticket_previas_harness.js'])
def test_condicoes_ticket_no_frontend(harness):
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', str(root / 'tests' / harness)], cwd=root,
        capture_output=True, text=True, encoding='utf-8', timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture(autouse=True)
def isolado(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(newprod_temp, 'pasta_raiz', lambda: tmp_path / 'resources')
    def sem_rede(*args, **kwargs):
        raise AssertionError('Rede proibida neste teste sintético')
    monkeypatch.setattr(socket, 'create_connection', sem_rede)
    monkeypatch.setattr(socket.socket, 'connect', sem_rede)


class PoolSintetico:
    def conteudo(self, pedido, modelo, valor):
        return f'SYNTHETIC-{pedido}-{modelo}-{valor}'


def elementos(familia):
    tipos = ['TEXT', 'FIXED', 'QR', 'QR_IDEAL', 'BARCODE', 'SVG', 'PDF', 'FOTO', 'PICOTE', 'TEXT']
    tipos += ['CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL'] if familia == 'CAMAROTE' else ['TEATRO_FILA', 'TEATRO_LUGAR', 'TEATRO_COMBO'] if familia == 'TEATRO' else []
    with fitz.open() as doc:
        p = doc.new_page(width=40, height=30)
        p.insert_text((2, 10), 'GRAPHIC', fontsize=5)
        pdf = base64.b64encode(doc.tobytes()).decode('ascii')
    result = []
    for i, tipo in enumerate(tipos):
        el = dict(id=f'el_{i}', type=tipo, face='both', x_mm=20 + i % 4 * 40,
                  y_mm=15 + i // 4 * 22, font_size=7, font_name='helv', color='#000000',
                  size_mm=9, width_mm=18, height_mm=10, pad=0, prefix='', suffix='')
        if i == 0: el['prefix'] = 'N:'
        if i == 9: el.update(source='database', database_text=True, csv_column='Nome')
        if tipo == 'FIXED': el.update(fixed=True, fixed_value='FIXO')
        if tipo == 'BARCODE': el.update(source='database', csv_column='Codigo', barcode_format='code128')
        if tipo == 'SVG': el['svg_content'] = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>'
        if tipo == 'PDF': el['pdf_content'] = pdf
        if tipo == 'FOTO': el.update(source='database', csv_column='Foto', fit='cover')
        if tipo == 'TEATRO_FILA': el['prefix'] = 'F:'
        if tipo == 'TEATRO_LUGAR': el['prefix'] = 'T:'
        if tipo == 'TEATRO_COMBO': el.update(prefix_fila='FC:', prefix_lugar='TC:', layout='1line')
        if tipo == 'CAMAROTE_LOCAL': el['prefix'] = 'L:'
        if tipo == 'CAMAROTE_PESSOA': el['prefix'] = 'P:'
        if tipo == 'CAMAROTE_PESSOA_TOTAL': el['prefix'] = 'PT:'
        result.append(el)
    return result


def config(tmp_path, tipo, modo, els, rows=None, ticket_qtd=3):
    base = tmp_path / 'base.pdf'
    with fitz.open() as doc:
        for label in ['BASE FRONT', 'BASE BACK']:
            p = doc.new_page(width=180 * MM2PT, height=100 * MM2PT)
            p.insert_text((5, 10), label, fontsize=6)
        doc.save(base)
    return ImpositionConfig(str(base), str(tmp_path / 'out.pdf'),
        dict(width_mm=180, height_mm=100, cols=1, rows=1, rotations={}),
        dict(tipo=tipo, print_mode=modo, ticket_qtd=ticket_qtd, elements=copy.deepcopy(els)),
        dict(width_mm=180, height_mm=100, file_format='pdf'),
        seq_start=10, seq_end=13, csv_data=rows, print_mode=modo,
        c_ini=7, q_cam=2, l_cam=2, pedido='99999', modelo='9999999', pool_qr=PoolSintetico())


@pytest.mark.parametrize('tipo', ['SEQUENCIAL', 'CAMAROTE', 'TEATRO'])
@pytest.mark.parametrize('modo', ['front', 'duplex', 'duplex_unico'])
def test_elementos_comuns_e_especializados_em_todas_as_faces(tmp_path, tipo, modo):
    foto = io.BytesIO()
    Image.new('RGB', (40, 50), 'green').save(foto, format='PNG')
    photo = 'data:image/png;base64,' + base64.b64encode(foto.getvalue()).decode('ascii')
    rows = [dict(Fila='B', Numero=str(21+i), Nome=f'PESSOA{i+1}', Codigo=f'1234567890{i:02}', Foto=photo) for i in range(4)]
    cfg = config(tmp_path, tipo, modo, elementos(tipo), rows)
    engine = ImpositionEngine(cfg)
    engine.process()
    texts = []
    for output in engine.generated_files:
        with fitz.open(output['path']) as doc:
            texts.extend(page.get_text().splitlines() for page in doc)
    faces = 1 if modo == 'front' else 2
    assert cfg.total_items == 4
    assert len(texts) == 4 * faces
    for page_index, lines in enumerate(texts):
        i = page_index // faces
        assert f'N:{10+i}' in lines and f'PESSOA{i+1}' in lines
        assert 'FIXO' in lines and 'GRAPHIC' in lines
        if tipo == 'CAMAROTE':
            assert f'L:{7+i//2}' in lines
            assert f'P:{i%2+1}' in lines
            assert f'PT:{i%2+1}/2' in lines
        if tipo == 'TEATRO':
            assert 'F:B' in lines and f'T:{21+i}' in lines


@pytest.mark.parametrize('tipo', ['SEQUENCIAL', 'TEATRO'])
@pytest.mark.parametrize('elemento', ['TEATRO_FILA', 'TEATRO_LUGAR', 'TEATRO_COMBO'])
def test_teatro_sem_banco_nao_imprime_exemplos(tmp_path, tipo, elemento):
    cfg = config(tmp_path, tipo, 'front', [dict(type=elemento, x_mm=20, y_mm=20)])
    with pytest.raises(ValueError, match='Teatro.*banco'):
        ImpositionEngine(cfg).process()
    assert not (tmp_path / 'out.pdf').exists()


@pytest.mark.parametrize('valor', [None, '', '  '])
@pytest.mark.parametrize('coluna', ['Fila', 'Numero'])
def test_teatro_recusa_celula_vazia_em_linha_tardia(tmp_path, valor, coluna):
    rows = [dict(Fila='B', Numero=str(21+i)) for i in range(4)]
    rows[-1][coluna] = valor
    cfg = config(tmp_path, 'TEATRO', 'duplex', [dict(type='TEATRO_COMBO', x_mm=20, y_mm=20)], rows)
    with pytest.raises(ValueError, match='Teatro.*banco'):
        ImpositionEngine(cfg).process()
    assert not list(tmp_path.glob('*miolo.pdf'))


@pytest.mark.parametrize('modo', ['front', 'duplex', 'duplex_unico'])
def test_ticket_comuns_graficos_e_banco_compartilhado(tmp_path, modo):
    foto = io.BytesIO()
    Image.new('RGB', (40, 50), 'green').save(foto, format='PNG')
    photo = 'data:image/png;base64,' + base64.b64encode(foto.getvalue()).decode('ascii')
    rows = [dict(Nome=f'PESSOA{i}', Outro=f'OUTRO{i}', Codigo=f'1234567890{i:02}', Foto=photo) for i in range(2)]
    els = elementos('SEQUENCIAL')
    # Posições históricas de Banco/fixos/gráficos não participam da sequência.
    for el in els:
        if el.get('source') == 'database' or el['type'] in ['FIXED', 'SVG', 'PDF', 'PICOTE']:
            el['ticket_pos'] = 'ignorado'
    for pos in range(1, 4):
        for type_index, tipo in enumerate(['TEXT', 'QR', 'BARCODE', 'QR_IDEAL']):
            els.append(dict(id=f'{tipo}{pos}', type=tipo, ticket_pos=pos, face='both',
                x_mm=30+pos*35, y_mm=25+type_index*17, font_size=6, font_name='helv',
                pad=0, prefix=f'T{pos}:' if tipo == 'TEXT' else '', size_mm=8,
                width_mm=20, height_mm=8, barcode_format='code128'))
    els.append(dict(id='outro', type='TEXT', source='database', database_text=True,
        csv_column='Outro', ticket_pos=3, face='both', x_mm=25, y_mm=85, font_size=6))
    cfg = config(tmp_path, 'TICKET', modo, els, rows)
    engine = ImpositionEngine(cfg)
    captured = []
    original = engine._render_element
    def capture(page, el, x, y, val, row=None):
        captured.append((el.get('id'), val, el.get('_qr_ideal_conteudo')))
        return original(page, el, x, y, val, row)
    engine._render_element = capture
    engine.process()
    texts = []
    for output in engine.generated_files:
        with fitz.open(output['path']) as doc:
            texts.extend(page.get_text().splitlines() for page in doc)
    faces = 1 if modo == 'front' else 2
    assert cfg.total_items == 2 and len(texts) == 2 * faces
    for page_index, lines in enumerate(texts):
        cell = page_index // faces
        for pos in range(1, 4):
            assert f'T{pos}:{10+cell*3+pos-1}' in lines
        assert f'PESSOA{cell}' in lines and f'OUTRO{cell}' in lines
        assert 'FIXO' in lines and 'GRAPHIC' in lines
    for tipo in ['TEXT', 'QR', 'BARCODE', 'QR_IDEAL']:
        for pos in range(1, 4):
            entries = [entry for entry in captured if entry[0] == f'{tipo}{pos}']
            expected = [10+cell*3+pos-1 for cell in range(2) for _ in range(faces)]
            assert [entry[1] for entry in entries] == expected
            if tipo == 'QR_IDEAL':
                assert [entry[2] for entry in entries] == [f'SYNTHETIC-99999-9999999-{v}' for v in expected]


@pytest.mark.parametrize('tipo', ['TEXT', 'QR', 'BARCODE', 'QR_IDEAL'])
@pytest.mark.parametrize('posicao', [0, -1, 3, 1.5, 'abc', None, True])
def test_ticket_recusa_posicao_invalida_antes_do_pdf(tmp_path, tipo, posicao):
    with pytest.raises(ValueError, match='TICKET.*posição inválida'):
        config(tmp_path, 'TICKET', 'duplex', [dict(type=tipo, ticket_pos=posicao)], ticket_qtd=2)
    assert not (tmp_path / 'out.pdf').exists()


@pytest.mark.parametrize('quantidade', [0, -1, 1.5, 'abc', None, True])
def test_ticket_recusa_quantidade_invalida(tmp_path, quantidade):
    with pytest.raises(ValueError, match='TICKET.*quantidade inteira'):
        config(tmp_path, 'TICKET', 'front', [], ticket_qtd=quantidade)


@pytest.mark.parametrize('tipo', ['TEATRO_FILA', 'TEATRO_LUGAR', 'TEATRO_COMBO', 'CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL'])
def test_ticket_recusa_elementos_especializados(tmp_path, tipo):
    with pytest.raises(ValueError, match='TICKET.*Teatro ou Camarote'):
        config(tmp_path, 'TICKET', 'front', [dict(type=tipo)])


@pytest.mark.parametrize('destino', ['numeracao', 'numeracao_2'])
def test_ticket_valida_modelo_tardio_de_multi_artes_antes_de_abrir_recursos(tmp_path, destino):
    num = dict(tipo='TICKET', ticket_qtd=2, elements=[dict(type='TEXT', ticket_pos=3)])
    with pytest.raises(ValueError, match='TICKET.*posição inválida'):
        ImpositionConfig('', str(tmp_path / 'out.pdf'), {}, None, {}, multi_artes=[
            dict(qtd=1), dict(qtd=1, **{destino:num})])
    assert not (tmp_path / 'out.pdf').exists()
