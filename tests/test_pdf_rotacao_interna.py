"""Pedido 25345: /Rotate da arte deve acompanhar a imposicao, em cada pagina."""
import hashlib
import socket

import fitz
import pytest
from PIL import Image, ImageChops, ImageStat

from engine import ImpositionConfig, ImpositionEngine
from pdf_camadas import mostrar_pagina


@pytest.fixture(autouse=True)
def sem_rede(monkeypatch):
    def recusar(*args, **kwargs):
        raise AssertionError('Teste sintetico nao pode acessar a rede')
    monkeypatch.setattr(socket.socket, 'connect', recusar)


def conferir_pixels(a, b):
    pa, pb = a.get_pixmap(alpha=False), b.get_pixmap(alpha=False)
    assert (pa.width, pa.height) == (pb.width, pb.height)
    ia = Image.frombytes('RGB', (pa.width, pa.height), pa.samples)
    ib = Image.frombytes('RGB', (pb.width, pb.height), pb.samples)
    # Matrizes PDF equivalentes podem arredondar a borda de um glifo.
    erro = sum(ImageStat.Stat(ImageChops.difference(ia, ib)).mean) / 3
    assert erro < 0.05, f'Diferenca visual media: {erro}'


def desenhar(pagina, indice=0):
    pagina.draw_rect((40, 45, 80, 85), color=None, fill=(1, 0, 0))
    pagina.draw_rect((100, 170, 140, 210), color=None, fill=(0, 0, 1))
    pagina.insert_text((40, 110), f'PAGINA-{indice}', fontsize=14)


@pytest.mark.parametrize('rotacao', [0, 90, 180, 270])
@pytest.mark.parametrize('recorte', [False, True])
@pytest.mark.parametrize('giro_celula', [0, 90, 180, 270])
def test_importar_orientacao_visivel_recorte_e_rotacao_da_celula(
        rotacao, recorte, giro_celula):
    with fitz.open() as src, fitz.open() as esperado, fitz.open() as dst:
        p = src.new_page(width=180, height=260)
        desenhar(p)
        if recorte:
            p.set_cropbox(fitz.Rect(20, 30, 160, 230))
        p.set_rotation(rotacao)
        clip = p.rect + (10, 10, -10, -10) if recorte else p.rect
        # Referencia independente: renderizar a orientacao visivel da origem.
        pix = p.get_pixmap(clip=clip, alpha=False)
        w, h = pix.width, pix.height
        if giro_celula in (90, 270):
            w, h = h, w
        ep = esperado.new_page(width=w, height=h)
        ep.insert_image(ep.rect, pixmap=pix, rotate=giro_celula)
        dp = dst.new_page(width=w, height=h)
        mostrar_pagina(dp, dp.rect, src, pno=0, clip=clip,
                       keep_proportion=False, rotate=giro_celula)
        conferir_pixels(dp, ep)
        assert p.rotation == rotacao
        assert not dp.get_images(), 'A arte deve continuar vetorial'


def test_origem_preservada_quando_importacao_falha():
    with fitz.open() as src, fitz.open() as dst:
        p = src.new_page(width=180, height=260)
        desenhar(p)
        p.set_rotation(270)
        antes = p.get_pixmap().samples
        dp = dst.new_page()
        with pytest.raises(ValueError):
            mostrar_pagina(dp, fitz.Rect(), src)
        assert p.rotation == 270
        assert p.get_pixmap().samples == antes


@pytest.mark.parametrize('giro', [90, 180, 270])
def test_camadas_e_reuso_da_pagina_rotacionada(giro):
    with fitz.open() as src, fitz.open() as dst:
        off = src.add_ocg('Oculta', on=False)
        p = src.new_page(width=180, height=260)
        desenhar(p)
        p.draw_rect(p.rect, color=None, fill=(1, 0, 1), oc=off)
        p.insert_text((30, 130), 'OCULTO', oc=off)
        p.set_rotation(giro)
        for _ in range(3):
            dp = dst.new_page(width=p.rect.width, height=p.rect.height)
            mostrar_pagina(dp, dp.rect, src, -1)
            assert p.rotation == giro
        with fitz.open(stream=dst.tobytes(garbage=4), filetype='pdf') as salvo:
            for dp in salvo:
                conferir_pixels(p, dp)
                assert 'OCULTO' not in dp.get_text()
                assert not dp.get_images()


def criar_arte(caminho, rotacoes):
    with fitz.open() as src, fitz.open() as dst:
        for i in range(len(rotacoes)):
            p = src.new_page(width=180, height=260)
            desenhar(p, i)
        for i, giro in enumerate(rotacoes):
            w, h = (260, 180) if giro in (90, 270) else (180, 260)
            dp = dst.new_page(width=w, height=h)
            dp.show_pdf_page(dp.rect, src, i, rotate=giro)
            dp.set_rotation(giro)
        dst.save(caminho)


@pytest.mark.parametrize('giro_folha', [0, 90, 180, 270])
@pytest.mark.parametrize('caminho', ['paginado', 'multi', 'refazer', 'duplex', 'verso_unico'])
def test_motor_multipaginas_equivale_a_arte_sem_rotacao_interna(
        tmp_path, caminho, giro_folha):
    referencia = tmp_path / 'referencia.pdf'
    misto = tmp_path / 'misto.pdf'
    criar_arte(referencia, [0, 0, 0, 0])
    criar_arte(misto, [0, 90, 180, 270])
    arquivos = []
    for entrada in (referencia, misto):
        digest = hashlib.sha256(entrada.read_bytes()).hexdigest()
        saida = tmp_path / ('saida-' + entrada.name)
        modo = {'duplex': 'duplex', 'verso_unico': 'duplex_unico',
                'multi': 'duplex_unico'}.get(caminho, 'front')
        verso = tmp_path / ('verso-' + entrada.name)
        criar_arte(verso, [270 if entrada == misto else 0])
        cfg = dict(base_file=str(entrada), out_pdf=str(saida),
                   formato=dict(width_mm=80, height_mm=110, cols=2, rows=1,
                                rotations={'1': 180}),
                   saida=dict(width_mm=160, height_mm=110),
                   numeracao=dict(elements=[dict(type='TEXT', x_mm=10, y_mm=100,
                                  font_name='helv', font_size=10, face='both')],
                                  print_mode=modo),
                   seq_start=1, seq_end=4, print_mode=modo,
                   layout_schema='pdf_multiple', rotate_page=giro_folha)
        if caminho == 'multi':
            cfg.update(layout_schema='multi_artes', multi_artes=[dict(
                qtd=4, modo_pdf=True, local_path=str(entrada),
                local_verso_path=str(verso), print_mode=modo,
                numeracao=cfg['numeracao'])])
        elif caminho == 'refazer':
            cfg['refazer_celulas'] = [2, 4]
        elif caminho == 'verso_unico':
            cfg['base_file_verso'] = str(verso)
        entregues = []
        ImpositionEngine(ImpositionConfig(**cfg), on_file_generated=entregues.append).process()
        assert entregues
        arquivos.append([item['path'] for item in entregues])
        assert hashlib.sha256(entrada.read_bytes()).hexdigest() == digest
    assert len(arquivos[0]) == len(arquivos[1])
    for ref, resultado in zip(*arquivos):
        with fitz.open(ref) as a, fitz.open(resultado) as b:
            assert len(a) == len(b)
            for pa, pb in zip(a, b):
                assert pa.rotation == pb.rotation == giro_folha
                assert sorted(pa.get_text().split()) == sorted(pb.get_text().split())
                assert not pb.get_images()
                conferir_pixels(pa, pb)
