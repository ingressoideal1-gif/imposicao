"""Pedido 24008: fonte importada em uma pose nao substitui a fonte da folha."""
import base64
from pathlib import Path
import urllib.request

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT


@pytest.mark.parametrize('embutida', [False, True])
@pytest.mark.parametrize('giro_folha', [0, 90])
@pytest.mark.parametrize('modo', ['front', 'duplex'])
def test_todas_as_poses_conservam_numeros_e_tinta(tmp_path, monkeypatch,
                                                embutida, giro_folha, modo):
    def sem_rede(*args, **kwargs):
        raise AssertionError('Teste sintetico nao pode acessar a rede')

    monkeypatch.setattr(urllib.request, 'urlopen', sem_rede)
    el = dict(type='TEXT', x_mm=250, y_mm=9.24, rotation=90,
              font_name='helv', font_size=11, pad=5, face='both')
    if embutida:
        fonte = Path(__file__).resolve().parents[1] / 'frontend/fonts_local/arial.ttf'
        el.update(font_name='arial', _font_data=base64.b64encode(fonte.read_bytes()).decode())
    base = tmp_path / 'arte.pdf'
    with fitz.open() as doc:
        for _ in range(2):
            page = doc.new_page(width=276 * MM2PT, height=17.5 * MM2PT)
            page.draw_rect(fitz.Rect(100, 10, 200, 20), color=(0, 0, 0))
        doc.save(base)
    cfg = ImpositionConfig(
        base_file=str(base), out_pdf=str(tmp_path / 'saida.pdf'),
        formato=dict(width_mm=276, height_mm=17.5, cols=1, rows=6,
                     rotations={'0': 180, '2': 180, '4': 180}),
        numeracao=dict(elements=[el], print_mode=modo),
        saida=dict(width_mm=276, height_mm=105, file_format='pdf'),
        seq_start=1, seq_end=12, print_mode=modo, rotate_page=giro_folha,
    )
    motor = ImpositionEngine(cfg)
    motor.process()
    paginas = []
    for arquivo in motor.generated_files:
        if arquivo['path'].endswith('.pdf'):
            with fitz.open(arquivo['path']) as doc:
                for page in doc:
                    numeros = [w for w in page.get_text('words') if w[4].isdigit()]
                    assert len(numeros) == 6
                    paginas.append(sorted(int(w[4]) for w in numeros))
                    page.set_rotation(0)
                    for w in numeros:
                        pix = page.get_pixmap(clip=fitz.Rect(w[:4]), colorspace=fitz.csGRAY)
                        assert min(pix.samples) < 100, 'Numero extraivel, mas sem tinta'
    esperado = [list(range(1, 7)), list(range(7, 13))]
    assert sorted(paginas) == sorted(esperado * (2 if modo == 'duplex' else 1))
