from types import SimpleNamespace

import pytest

import impressao_destinos as destinos


@pytest.fixture
def driver():
    valores = {'DC_BINS': [2, 4], 'DC_BINNAMES': ['Capa', 'Miolo'],
               'DC_PAPERS': [9], 'DC_PAPERNAMES': ['A4'], 'DC_DUPLEX': 1, 'DC_COPIES': 99}
    calls = []
    identidade = {'pDriverName': 'Driver sintetico', 'pPortName': 'PORT-A'}
    api = SimpleNamespace(
        OpenPrinter=lambda nome: calls.append(('abrir', nome)) or 17,
        GetPrinter=lambda *args: identidade,
        ClosePrinter=lambda *args: calls.append('fechar'),
        DeviceCapabilities=lambda nome, porta, cap: 3 if cap == destinos.DC_DRIVER else valores[cap])
    return api, SimpleNamespace(**{k: k for k in valores}), valores, calls, identidade


def consultar(driver, nome='Fila A', pc='PC-A'):
    return destinos.consultar(nome, api=driver[0], constantes=driver[1], estacao=pc)


def opcoes():
    return dict(modo='experimental_gdi', tray=2, tray_capa=2, tray_miolo=4,
                paper_size=9, duplex=2, copies=2)


def test_perfil_da_fila_sem_inferir_recursos_raw(driver):
    perfil = consultar(driver)
    destinos.validar_opcoes(perfil, opcoes())
    assert perfil['duplex'] == [1, 2, 3]
    assert perfil['opcoes_pdf_raw'] is False
    assert perfil['trabalho_unico_misto'] is False
    assert driver[3] == [('abrir', 'Fila A'), 'fechar']
    destinos.conferir_identidade('Fila A', perfil['assinatura'], api=driver[0], estacao='pc-a')


def test_estacoes_e_filas_nao_compartilham_identidade(driver):
    a = consultar(driver)['assinatura']
    assert a != consultar(driver, pc='PC-B')['assinatura']
    assert a != consultar(driver, nome='Fila B')['assinatura']


def test_mudanca_de_porta_bloqueia_antes_do_spool(driver):
    perfil = consultar(driver)
    driver[4]['pPortName'] = 'PORT-B'
    with pytest.raises(ValueError, match='mudou'):
        destinos.conferir_identidade('Fila A', perfil['assinatura'], api=driver[0], estacao='PC-A')


def test_nao_presume_duplex(driver):
    driver[2]['DC_DUPLEX'] = 0
    p = consultar(driver)
    with pytest.raises(ValueError, match='Duplex'):
        destinos.validar_opcoes(p, opcoes())
    destinos.validar_opcoes(p, dict(opcoes(), duplex=1))


@pytest.mark.parametrize('campo,valor', [('tray_capa', 77), ('tray_miolo', 77),
    ('paper_size', 88), ('copies', 100), ('copies', True), ('duplex', 0)])
def test_opcoes_indisponiveis(driver, campo, valor):
    with pytest.raises(ValueError):
        destinos.validar_opcoes(consultar(driver), dict(opcoes(), **{campo: valor}))


@pytest.mark.parametrize('campo,valor', [('DC_DUPLEX', -1), ('DC_COPIES', 0),
    ('DC_BINS', -1), ('DC_BINNAMES', ['Somente uma'])])
def test_consulta_incompleta_nao_inventa_opcoes(driver, campo, valor):
    driver[2][campo] = valor
    with pytest.raises(ValueError):
        consultar(driver)
    assert driver[3][-1] == 'fechar'


def test_raw_nao_valida_preset_pelo_driver(driver):
    destinos.validar_opcoes(consultar(driver), {'modo': 'pdf_raw'})


def test_bandeja_oculta_nao_bloqueia_duas_bandejas_validas(driver):
    destinos.validar_opcoes(consultar(driver), dict(opcoes(), tray=77))
    with pytest.raises(ValueError, match='tray'):
        destinos.validar_opcoes(consultar(driver), dict(opcoes(), tray=77, tray_capa=None, tray_miolo=None))


def test_rota_preflight_sem_impressao(driver, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import print_experimental_api as api
    perfil = consultar(driver)
    monkeypatch.setattr(api.impressao_destinos, 'consultar', lambda nome: perfil)
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        response = client.post('/api/print/experimental/destino', json={'printer_name': 'Fila A', 'options': opcoes()})
        assert response.status_code == 200
        assert response.json()['assinatura'] == perfil['assinatura']
        response = client.post('/api/print/experimental/destino', json={'printer_name': 'Fila A', 'options': dict(opcoes(), tray_capa=99)})
        assert response.status_code == 400


@pytest.mark.parametrize('final', ['destino', 'submit-lote'])
def test_rota_exige_identidade_e_permissao_de_impressao(final):
    from fastapi import HTTPException
    import autorizacao_local as auth
    caminho = '/api/print/experimental/' + final
    assert auth.exige_identidade('POST', caminho)
    with pytest.raises(HTTPException) as erro:
        auth.autorizar({'permissoes': {'perm_imprimir': False}}, 'POST', caminho)
    assert erro.value.status_code == 403
    auth.autorizar({'permissoes': {'perm_imprimir': True}}, 'POST', caminho)
