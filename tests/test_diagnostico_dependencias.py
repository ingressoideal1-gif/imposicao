"""Preparação real com recursos sintéticos; sem rede ou bases privadas."""
import json
import socket
import sys
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest

import diagnostico_estacao as dg
from offline_estacao import OfflineEstacao
from estatisticas_piloto import _erro_diagnosticado


@pytest.fixture
def local(monkeypatch, tmp_path):
    import qr_contratos
    import qr_ideal
    import qr_base_v2
    import migracao_estacao

    def proibido(*args, **kwargs):
        pytest.fail('Rede real proibida')

    monkeypatch.setattr(socket.socket, 'connect', proibido)
    monkeypatch.setattr(qr_contratos, '_caminho', lambda _: tmp_path / 'contrato.json')
    monkeypatch.setattr(qr_contratos.acesso_publicacao, '_post', lambda _: [])
    monkeypatch.setattr(qr_contratos, '_cache', {})
    monkeypatch.setattr(qr_base_v2, '_pool', None)
    monkeypatch.setattr(migracao_estacao, 'pasta_dados', lambda: tmp_path)
    monkeypatch.setattr(migracao_estacao, 'proteger_pasta', lambda _: None)
    monkeypatch.setattr(qr_ideal, 'TOTAL', 1)
    monkeypatch.setattr(qr_ideal, 'caminho_padrao', lambda: str(tmp_path / 'base-sintetica.bin'))
    offline = OfflineEstacao.__new__(OfflineEstacao)
    offline.servico = SimpleNamespace(host='example.invalid')
    return offline, tmp_path


def conferir_falha(offline, elementos, recurso, motivo, diagnosticos_isolados):
    with pytest.raises((ValueError, OSError)) as exc:
        offline.preparar_dependencias('99', {'numeracoes': [{'elements': elementos}]})
    # Mesmo caminho usado pela API que produz o código D- da tela.
    resposta = _erro_diagnosticado(422, 'Pedido ou pacote local incompatível.',
                                  exc.value, 'abrir-pedido', b'{"pedido":"99"}')
    registro = dg.resumo()['recentes'][0]
    assert resposta.headers['X-NewProd-Diagnostico'] == registro['id']
    assert registro['pedido'] == '99'
    assert (registro['recurso_local'], registro['motivo_local']) == (recurso, motivo)
    assert not any(s in json.dumps(registro) for s in ['privado', 'segredo', 'base-sintetica', 'https://'])
    diagnosticos_isolados.fila.join()
    con = diagnosticos_isolados._banco()
    try:
        salvo = json.loads(con.execute('SELECT dados FROM diagnosticos ORDER BY seq DESC LIMIT 1').fetchone()[0])
    finally:
        con.close()
    assert dg._limpar(salvo)['motivo_local'] == motivo


@pytest.mark.parametrize('caso,motivo', [
    ('recusado', 'contrato_recusado'), ('invalido', 'contrato_invalido'),
    ('sem_cache', 'contrato_sem_cache')])
def test_contratos(local, monkeypatch, diagnosticos_isolados, caso, motivo):
    import qr_contratos
    def post(_):
        if caso == 'recusado':
            raise HTTPError('https://privado.invalid?segredo', 403, 'segredo', {}, None)
        if caso == 'sem_cache':
            raise TimeoutError('segredo')
        return {'segredo': 'privado'}
    monkeypatch.setattr(qr_contratos.acesso_publicacao, '_post', post)
    conferir_falha(local[0], [{'type': 'QR_IDEAL'}], 'qr_contratos', motivo, diagnosticos_isolados)


@pytest.mark.parametrize('conteudo,motivo', [
    (None, 'base_ausente'), (b'x', 'base_tamanho_invalido'),
    (b'12345678', 'base_integridade_invalida')])
def test_base_legada(local, diagnosticos_isolados, conteudo, motivo):
    offline, pasta = local
    if conteudo is not None:
        (pasta / 'base-sintetica.bin').write_bytes(conteudo)
    conferir_falha(offline, [{'type': 'QR_IDEAL'}], 'qr_base_legada', motivo, diagnosticos_isolados)


def test_base_v2_ausente_distinta_da_legada(local, monkeypatch, diagnosticos_isolados):
    import qr_contratos
    import qr_ideal
    offline, pasta = local
    (pasta / 'base-sintetica.bin').write_bytes(b'12345678')
    monkeypatch.setattr(qr_contratos, 'obter', lambda _: [{'versao': 2}])
    monkeypatch.setattr(qr_ideal.PoolQR, 'verificar_integridade', lambda *a: None)
    conferir_falha(offline, [{'type': 'QR_IDEAL'}], 'qr_base_v2', 'base_ausente', diagnosticos_isolados)


def test_origem_fonte_recusada_sem_expor_url(local, monkeypatch, diagnosticos_isolados):
    monkeypatch.setitem(sys.modules, 'db', SimpleNamespace(get_catalogo_fontes=lambda: []))
    monkeypatch.setitem(sys.modules, 'fontes_sistema', SimpleNamespace(
        _fontes_instaladas=lambda: {}, _chaves_de_fonte=lambda *a: []))
    conferir_falha(local[0], [{'font_name': 'teste', 'font_url': 'https://privado.invalid/segredo.ttf'}],
                   'fontes', 'origem_fonte_recusada', diagnosticos_isolados)


def test_falha_fonte_http_sem_expor_corpo(local, monkeypatch, diagnosticos_isolados):
    import font_cache
    monkeypatch.setitem(sys.modules, 'db', SimpleNamespace(get_catalogo_fontes=lambda: []))
    monkeypatch.setitem(sys.modules, 'fontes_sistema', SimpleNamespace(
        _fontes_instaladas=lambda: {}, _chaves_de_fonte=lambda *a: []))
    monkeypatch.setattr(font_cache, '_pasta_cache', lambda: str(local[1]))
    def abrir(*a, **kw):
        raise HTTPError('https://privado.invalid', 403, 'segredo', {}, None)
    monkeypatch.setattr(font_cache.urllib.request, 'urlopen', abrir)
    conferir_falha(local[0], [{'font_name': 'teste', 'font_url':
        'https://example.invalid/storage/v1/object/public/fontes/teste.ttf'}],
        'fontes', 'http_recusado', diagnosticos_isolados)


def test_sem_dependencias_nao_cria_diagnostico(local):
    local[0].preparar_dependencias('99', {'numeracoes': []})
    assert dg.resumo()['recentes'] == []


def test_mensagem_fora_da_preparacao_nao_classifica_e_campos_livres_sao_descartados():
    erro = ValueError('QR Ideal: integridade da base privada nao confirmada')
    assert dg._dependencia_local(erro) == {}
    ident = dg.registrar(erro, 'abrir_pedido', 'abrir-pedido')
    registro = dg.resumo()['recentes'][0]
    assert registro['id'] == ident and registro['motivo_local'] is None
    seguro = dg._limpar({**registro, 'recurso_local': 'segredo', 'motivo_local': 'https://privado'})
    assert seguro['recurso_local'] is None and seguro['motivo_local'] is None
