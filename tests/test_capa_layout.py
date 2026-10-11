"""Capas com dados sintéticos; persistência isolada sem importar db/credenciais."""
import ast
from pathlib import Path
from types import SimpleNamespace
import uuid
import subprocess

import fitz
import pytest

from engine import _desenhar_texto_capa


def test_editor_no_navegador_sem_rede():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', 'tests/capa_layout_browser_harness.js'], cwd=root,
                            capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize('titulo,detalhe', [
    ('Bloco 01', ' - de 0001 a 0050'),
    ('Camarote 01', ' - de 1 a 10'),
    ('Fila A', ' - Plateia - de 1 a 50 (50 lugares)'),
])
@pytest.mark.parametrize('modo', ['shrink', 'wrap', 'condense'])
@pytest.mark.parametrize('align', ['left', 'center', 'right'])
def test_pdf_respeita_largura_alinhamento_e_conteudo(titulo, detalhe, modo, align):
    cfg = SimpleNamespace(cover_font_x=10, cover_font_y=20, cover_font_size=12,
                          cover_font_color='#234567', cover_max_width_mm=40,
                          cover_overflow=modo, cover_text_align=align)
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        _desenhar_texto_capa(page, cfg, titulo, detalhe, 0, 0)
        spans = [s for b in page.get_text('dict')['blocks'] for line in b.get('lines', []) for s in line['spans']]
        assert spans
        assert ''.join(page.get_text().split()) == ''.join((titulo + detalhe).split())
        left, right = 10 * 2.83465, 50 * 2.83465
        assert min(s['bbox'][0] for s in spans) >= left - .1
        assert max(s['bbox'][2] for s in spans) <= right + .1
        if align == 'left':
            assert min(s['bbox'][0] for s in spans) == pytest.approx(left, abs=.1)
        if align == 'right':
            assert max(s['bbox'][2] for s in spans) == pytest.approx(right, abs=.1)
        if align == 'center':
            assert (min(s['bbox'][0] for s in spans) + max(s['bbox'][2] for s in spans)) / 2 == pytest.approx((left + right) / 2, abs=.1)


def test_capa_legada_preserva_fontes_posicoes_e_tamanho():
    cfg = SimpleNamespace(cover_font_x=0, cover_font_y=10, cover_font_size=12, cover_font_color='#000000')
    with fitz.open() as doc:
        page = doc.new_page()
        _desenhar_texto_capa(page, cfg, 'Bloco 01', ' - de 0001 a 0050', 0, 0)
        spans = [s for b in page.get_text('dict')['blocks'] for line in b['lines'] for s in line['spans']]
        assert [s['font'] for s in spans] == ['Helvetica-Bold', 'Helvetica']
        assert all(s['size'] == 12 for s in spans)
        assert spans[0]['origin'] == pytest.approx((0, 10 * 2.83465))


@pytest.mark.parametrize('operacao', ['add_formato', 'update_formato'])
def test_persistencia_envia_campos_sem_acesso_real(operacao):
    tree = ast.parse((Path(__file__).resolve().parents[1] / 'db.py').read_text(encoding='utf-8-sig'))
    func = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == operacao)
    calls = []
    namespace = {'uuid': uuid, 'IS_SUPABASE_ACTIVE': True,
                 '_supabase_request': lambda *args: calls.append(args) or [{'id': 'formato-teste'}]}
    exec(compile(ast.Module(body=[func], type_ignores=[]), 'db_isolado', 'exec'), namespace)
    payload = dict(name='Sintético', cover_max_width_mm=35.5, cover_overflow='wrap', cover_text_align='right', cover_font_x=0)
    args = (payload,) if operacao == 'add_formato' else ('formato-teste', payload)
    assert namespace[operacao](*args)
    saved = calls[0][2]
    for key in ['cover_max_width_mm', 'cover_overflow', 'cover_text_align', 'cover_font_x']:
        assert saved[key] == payload[key]
