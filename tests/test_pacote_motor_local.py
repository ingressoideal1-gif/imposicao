"""Paridade entre fonte original e recurso do pacote no motor real, sem impressão."""
import hashlib
from contextlib import nullcontext

import fitz

from engine import ImpositionConfig, ImpositionEngine
from pacotes_locais import ArmazemPacotes


def test_pacote_local_preserva_paginas_e_blocos_sem_rede(tmp_path, monkeypatch):
    import socket
    def sem_rede(*args, **kwargs):
        raise AssertionError('Motor local tentou acessar a rede')
    monkeypatch.setattr(socket, 'create_connection', sem_rede)
    original = tmp_path / 'original.pdf'
    with fitz.open() as doc:
        pagina = doc.new_page(width=283.46, height=141.73)
        pagina.insert_text((20, 30), 'PROVA LOCAL SINTETICA')
        doc.save(original)
    dados = original.read_bytes()
    digest = hashlib.sha256(dados).hexdigest()
    manifesto = {'schema': 1, 'empresa': 'sintetica', 'modelo': '1', 'revisao': 'r1',
                 'configuracao': {}, 'arquivos': {'frente': {'sha256': digest, 'bytes': len(dados)}, 'verso': None}}
    armazem = ArmazemPacotes(tmp_path / 'cache', habilitado=True, reserva_bytes=0)
    armazem.preparar(manifesto, {'frente': original})
    saidas = []
    for nome in ['original', 'local']:
        pasta = tmp_path / nome
        pasta.mkdir()
        contexto = nullcontext(original) if nome == 'original' else armazem.pdf_para_motor('sintetica', '1', 'r1')
        with contexto as fonte:
            cfg = ImpositionConfig(base_file=str(fonte), out_pdf=str(pasta / 'saida.pdf'),
                formato={'name': 'Teste', 'width_mm': 100, 'height_mm': 50, 'cols': 2, 'rows': 2,
                         'gap_h_mm': 0, 'gap_v_mm': 0, 'offset_h_mm': 0, 'offset_v_mm': 0, 'rotations': {}},
                numeracao={'tipo': 'SEQUENCIAL', 'elements': []},
                saida={'name': 'Teste', 'width_mm': 300, 'height_mm': 300},
                seq_start=1, seq_end=40, sheets_per_block=3, entregar_por_bloco=True)
            motor = ImpositionEngine(cfg)
            motor.process()
        blocos = []
        for gerado in motor.generated_files:
            with fitz.open(gerado['path']) as pdf:
                blocos.append([hashlib.sha256(p.get_pixmap(matrix=fitz.Matrix(.4, .4)).samples).hexdigest() for p in pdf])
        saidas.append(blocos)
    assert [len(b) for b in saidas[0]] == [3, 3, 3, 1]
    assert saidas[0] == saidas[1]
    assert not list(armazem.raiz.rglob('execucao-*.pdf'))
