"""Despacho de drivers isolado: nenhum PDF, spool ou impressora real."""
import pytest

import gestao_estacoes
import print_service


@pytest.fixture
def motores(monkeypatch):
    chamadas = []
    resultado = {'pdf_raw': True, 'ghostscript': True, 'gdi': True}
    monkeypatch.setattr(print_service, 'HAS_WIN32', True)
    monkeypatch.setattr(print_service.color_profiles, 'resolver_config', lambda _: (None, ''))
    monkeypatch.setattr(print_service, '_apply_devmode_options', lambda *_: object())
    monkeypatch.setattr(gestao_estacoes, '_thread', None)
    monkeypatch.setattr(gestao_estacoes, 'envio_pode_repetir', lambda: True)
    for modo, nome in [('pdf_raw', '_send_pdf_raw'), ('ghostscript', '_send_ps_ghostscript'), ('gdi', '_send_gdi_raster')]:
        def enviar(*args, modo=modo):
            chamadas.append(modo)
            return resultado[modo], modo
        monkeypatch.setattr(print_service, nome, enviar)
    return chamadas, resultado


@pytest.mark.parametrize('modo', ['gdi', 'pdf_raw', 'ghostscript'])
@pytest.mark.parametrize('sucesso', [True, False])
def test_modo_explicito_nao_troca_driver_nem_repete(motores, modo, sucesso):
    chamadas, resultado = motores
    resultado[modo] = sucesso
    ok, _ = print_service.send_print_job_windows('SINTETICA', 'nao-existe.pdf', {'print_mode': modo})
    assert ok is sucesso
    assert chamadas == [modo]


def test_padrao_continua_gdi(motores):
    assert print_service.send_print_job_windows('SINTETICA', 'nao-existe.pdf', {})[0]
    assert motores[0] == ['gdi']


def test_auto_so_avanca_sem_envio_iniciado(motores, monkeypatch):
    chamadas, resultado = motores
    resultado['pdf_raw'] = False
    resultado['ghostscript'] = False
    assert print_service.send_print_job_windows('SINTETICA', 'nao-existe.pdf', {'print_mode': 'auto'})[0]
    assert chamadas == ['pdf_raw', 'ghostscript', 'gdi']
    chamadas.clear()
    monkeypatch.setattr(gestao_estacoes, 'envio_pode_repetir', lambda: False)
    ok, mensagem = print_service.send_print_job_windows('SINTETICA', 'nao-existe.pdf', {'print_mode': 'auto'})
    assert not ok and 'confira a fila' in mensagem
    assert chamadas == ['pdf_raw']


@pytest.mark.parametrize('modo', ['front', 'duplex', 'duplex_unico', 'pdf_odd_even', 'desconhecido', '', None, 1])
def test_face_ou_modo_invalido_nunca_vira_auto(motores, modo):
    ok, mensagem = print_service.send_print_job_windows('SINTETICA', 'nao-existe.pdf', {'print_mode': modo})
    assert not ok and 'Modo de impressão' in mensagem
    assert motores[0] == []
