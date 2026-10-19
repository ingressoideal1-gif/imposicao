"""Camadas ocultas nao podem reaparecer na imposicao. Dados sinteticos."""
import base64
import socket

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine
from pdf_camadas import mostrar_pagina, inserir_paginas


@pytest.fixture(autouse=True)
def sem_rede(monkeypatch):
    def recusar(*args, **kwargs):
        raise AssertionError('Rede nao permitida')
    monkeypatch.setattr(socket.socket, 'connect', recusar)


def arte(paginas=1, sufixo='', inversa=False):
    doc = fitz.open()
    on = doc.add_ocg('Camada', on=not inversa)
    off = doc.add_ocg('Camada', on=inversa)
    for i in range(paginas):
        p = doc.new_page(width=100, height=140)
        p.draw_rect(p.rect, color=None, fill=(0, 1, 0, 0), oc=on)
        p.insert_text((8, 30), f'VISIVEL{i}{sufixo}', oc=on)
        p.draw_rect(p.rect, color=None, fill=(1, 0, 0), oc=off)
        p.insert_text((8, 60), f'OCULTO{i}{sufixo}', oc=off)
    dados = doc.tobytes()
    doc.close()
    return fitz.open(stream=dados, filetype='pdf')


@pytest.mark.parametrize('rotacao', [0, 90, 180, 270])
def test_importacao_preserva_pixels_textos_e_vetores(rotacao):
    with arte() as src, fitz.open() as dst:
        largura, altura = (140, 100) if rotacao in (90, 270) else (100, 140)
        p = dst.new_page(width=largura, height=altura)
        mostrar_pagina(p, p.rect, src, 0, rotate=rotacao)
        with fitz.open(stream=dst.tobytes(), filetype='pdf') as salvo:
            if rotacao == 0:
                assert salvo[0].get_pixmap().samples == src[0].get_pixmap().samples
            assert 'VISIVEL' in salvo[0].get_text()
            assert 'OCULTO' not in salvo[0].get_text()
            assert not salvo[0].get_images()
            assert any(b'0 1 0 0 k' in salvo.xref_stream(x)
                for x in range(1, salvo.xref_length()) if salvo.xref_is_stream(x))


def test_fontes_homonimas_com_visibilidades_opostas_e_copia_intermediaria():
    with arte(sufixo='A') as a, arte(sufixo='B', inversa=True) as b, fitz.open() as dst:
        for src in (a, b, a):
            inserir_paginas(dst, src)
        with fitz.open(stream=dst.tobytes(), filetype='pdf') as intermediario, fitz.open() as final:
            for i in range(3):
                p = final.new_page(width=100, height=140)
                mostrar_pagina(p, p.rect, intermediario, i)
            with fitz.open(stream=final.tobytes(garbage=4), filetype='pdf') as salvo:
                for i, src in enumerate((a, b, a)):
                    assert salvo[i].get_pixmap().samples == src[0].get_pixmap().samples


def test_ocmd_com_expressao_e_pdf_sem_camadas():
    with arte() as src, fitz.open() as dst:
        off = next(x for x, v in src.get_ocgs().items() if not v['on'])
        ocmd = src.set_ocmd(ve=['not', off])
        src[0].insert_text((8, 100), 'EXPRESSAO', oc=ocmd)
        p = dst.new_page(width=100, height=140)
        mostrar_pagina(p, p.rect, src)
        with fitz.open(stream=dst.tobytes(), filetype='pdf') as salvo:
            assert salvo[0].get_pixmap().samples == src[0].get_pixmap().samples
    with fitz.open() as src, fitz.open() as dst:
        src.new_page().insert_text((20, 20), 'SEM CAMADAS')
        p = dst.new_page()
        mostrar_pagina(p, p.rect, src)
        assert dst.xref_get_key(dst.pdf_catalog(), 'OCProperties')[0] == 'null'


@pytest.mark.parametrize('caminho', ['paginado', 'multi', 'verso', 'elemento'])
def test_motor_pdf_final_sem_camadas_reativadas(tmp_path, caminho):
    src = tmp_path / 'fonte.pdf'
    with arte(8) as doc:
        doc.save(src)
        encoded = base64.b64encode(doc.tobytes()).decode()
    out = tmp_path / 'saida.pdf'
    fmt = dict(width_mm=40, height_mm=50, cols=2, rows=2,
               rotations={'2': 180, '3': 180})
    args = dict(base_file=str(src), out_pdf=str(out), formato=fmt,
                saida=dict(width_mm=80, height_mm=100),
                numeracao={'elements': []}, seq_start=1, seq_end=8,
                seq_increment=1, print_mode='front', layout_schema='pdf_multiple')
    if caminho == 'multi':
        args.update(layout_schema='multi_artes', print_mode='duplex_unico', multi_artes=[dict(
            qtd=8, modo_pdf=True, local_path=str(src), local_verso_path=str(src),
            print_mode='duplex_unico', numeracao={'elements': [], 'print_mode':'duplex_unico'})])
    elif caminho == 'verso':
        args.update(print_mode='duplex_unico', base_file_verso=str(src))
    elif caminho == 'elemento':
        args['numeracao']['elements'] = [dict(type='PDF', face='front',
            pdf_content=encoded, x_mm=20, y_mm=25, width_mm=40, height_mm=50)]
    ImpositionEngine(ImpositionConfig(**args)).process()
    with fitz.open(out) as doc:
        texto = ''.join(p.get_text() for p in doc)
        assert 'OCULTO' not in texto
        for i in range(8):
            assert f'VISIVEL{i}' in texto
        assert all(not p.get_images() for p in doc)
