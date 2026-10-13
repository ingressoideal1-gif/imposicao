import io
import json
import sqlite3
import threading
import time
import socket
from urllib.error import URLError
from urllib.error import HTTPError

import pytest

import diagnostico_estacao as dg
from coleta_autonoma import ClienteAutonomo
from conferencia_piloto import ConferenciaIndisponivel


def test_http_original_preservado_sem_segredos(diagnosticos_isolados):
    def abrir(*args, **kwargs):
        raise HTTPError('https://privado.invalid?token=segredo', 403,
                        'cliente João token privado', {}, io.BytesIO(b'senha'))
    c = ClienteAutonomo('example.invalid', 'privada', 'PC', segredo=lambda: 'segredo', abrir=abrir)
    with pytest.raises(ConferenciaIndisponivel) as exc:
        c.abrir_pedido('23381')
    ident = exc.value.diagnostico_id
    assert dg.registrar(exc.value, 'abrir_pedido', 'abrir-pedido') == ident
    r = dg.resumo()['recentes']
    assert len(r) == 1 and r[0]['id'] == ident
    assert r[0]['http_origem'] == 403 and r[0]['pedido'] == '23381'
    assert r[0]['etapa'] == 'abrir-pedido'
    assert not any(v in json.dumps(r) for v in ['segredo', 'João', 'privado', 'senha'])
    diagnosticos_isolados.fila.join()
    con = diagnosticos_isolados._banco()
    try:
        assert len(con.execute('SELECT * FROM diagnosticos').fetchall()) == 1
    finally:
        con.close()


def test_credencial_ausente_identificada_sem_tentar_rede():
    c = ClienteAutonomo('example.invalid', 'teste', 'PC', segredo=lambda: '',
                        abrir=lambda *a, **k: pytest.fail('não deve chamar rede'))
    with pytest.raises(ConferenciaIndisponivel):
        c.abrir_pedido('23381')
    assert dg.resumo()['recentes'][0]['codigo'] == 'credencial_ausente'


def test_gravacao_bloqueada_nao_bloqueia_operacao_e_fila_limitada(tmp_path):
    liberar = threading.Event()
    def raiz():
        liberar.wait(5)
        return tmp_path
    registros = dg.Diagnosticos(raiz, capacidade=2)
    inicio = time.monotonic()
    try:
        for n in range(25):
            registros.registrar(dict(id=f'D-{n:012x}', quando='2026-10-13T12:00:00+00:00',
                                    codigo='abrir_pedido', etapa='abrir-pedido'))
        assert time.monotonic()-inicio < 1
        assert registros.resumo()['descartados'] == 23
        assert len(registros.resumo()['recentes']) == 20
    finally:
        liberar.set()
        registros.fila.put(None, timeout=5)
        registros.thread.join(10)
        assert not registros.thread.is_alive()


def test_falha_do_disco_visivel_sem_afetar_chamador(diagnosticos_isolados, monkeypatch):
    def falhar():
        raise OSError('senha ou caminho privado não deve sair')
    monkeypatch.setattr(diagnosticos_isolados, '_banco', falhar)
    assert dg.registrar(ValueError('privado'), 'abrir_pedido', 'abrir-pedido')
    diagnosticos_isolados.fila.join()
    r = dg.resumo()
    assert r['falhas_gravacao'] >= 1 and len(r['recentes']) == 1
    assert 'privado' not in json.dumps(r)


def test_reinicio_restaura_e_limpa_dados_locais(diagnosticos_isolados, tmp_path):
    ident = dg.registrar(ValueError(), 'abrir_pedido', 'abrir-pedido', pedido='123')
    diagnosticos_isolados.fila.join()
    novo = dg.Diagnosticos(lambda: tmp_path / 'diagnosticos')
    novo.iniciar()
    novo.fila.put(None)
    novo.thread.join(10)
    assert novo.resumo()['recentes'][0]['id'] == ident
    seguro = dg._limpar(dict(novo.resumo()['recentes'][0], pedido='token', modelo='nome',
                            http_origem='Bearer segredo', detalhe='senha', tipo='tipo_privado'))
    assert seguro['pedido'] is None and seguro['http_origem'] is None
    assert 'detalhe' not in seguro and seguro['tipo'] == 'Exception'


def test_limite_persistido(diagnosticos_isolados):
    con = diagnosticos_isolados._banco()
    with con:
        con.executemany('INSERT INTO diagnosticos(dados) VALUES (?)', [('{}',)] * 2050)
    con.close()
    dg.registrar(ValueError(), 'abrir_pedido', 'abrir-pedido')
    diagnosticos_isolados.fila.join()
    con = diagnosticos_isolados._banco()
    assert con.execute('SELECT count(*) FROM diagnosticos').fetchone()[0] == 2000
    con.close()


def test_dns_classificado_sem_registrar_host():
    dg.registrar(URLError(socket.gaierror('host privado')), 'canal_autonomo', 'listar')
    assert dg.resumo()['recentes'][0]['transporte'] == 'dns'
    assert 'host privado' not in json.dumps(dg.resumo())


def test_http_local_tem_mesmo_codigo_da_falha_de_origem():
    from estatisticas_piloto import _erro_diagnosticado
    falha = HTTPError('https://segredo.invalid', 401, 'privado', {}, None)
    ident = dg.registrar(falha, 'canal_autonomo', 'abrir-pedido', pedido='123')
    resposta = _erro_diagnosticado(409, 'Pedido não conferido.', falha, 'abrir-pedido', b'{"pedido":"123"}')
    assert resposta.status_code == 409
    assert resposta.headers['X-NewProd-Diagnostico'] == ident
    assert len(dg.resumo()['recentes']) == 1
    assert dg.resumo()['recentes'][0]['http_origem'] == 401


def test_relogio_divergente_identificado():
    from revisao_pedido_piloto import validar_recibo
    with pytest.raises(ConferenciaIndisponivel):
        validar_recibo(dict(empresa='teste', pedido='123', revisao='a'*64,
            sem_mudanca=False, execucao_offline=False, conferido_em='2000-01-01T00:00:00+00:00', itens=[]),
            'teste', '123', '')
    assert dg.resumo()['recentes'][0]['codigo'] == 'relogio_divergente'
