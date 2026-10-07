import json
import threading
import time
import pytest
from gestao_estacoes import Historico
from historico_impressao import Sincronizador, contexto_validado, lote_pendente


def contexto():
    return dict(alvos=[dict(pedido='23143', modelo='1002240')], tipo='capa', lote='12345678-1234-1234-1234-123456789012')


def test_contexto_e_eventos_sobrevivem_reinicio_e_retentativa(tmp_path):
    h = Historico(tmp_path)
    ident = h.iniciar('sintetica', 'windows', contexto=contexto())
    h.transicao(ident, 'envio_iniciado', spool_id=12)
    h.transicao(ident, 'enviado')
    recebidos = []
    def enviar(lote):
        recebidos.append(lote)
        if len(recebidos) == 1: raise TimeoutError()
        return dict(confirmado=lote['cursor'], instalacao=lote['instalacao'])
    s = Sincronizador(h, enviar)
    s.ciclo(0)
    assert h.controle('historico_cursor') is None
    s.ciclo(1)
    assert len(recebidos) == 1
    s = Sincronizador(Historico(tmp_path), enviar)
    s.ciclo(100)
    assert recebidos[0] == recebidos[1]
    assert recebidos[1]['eventos'][0]['contexto']['alvos'] == contexto()['alvos']
    assert lote_pendente(h)['eventos'] == []


def test_ack_divergente_preserva_fila(tmp_path):
    h = Historico(tmp_path); h.iniciar('p', 'windows')
    Sincronizador(h, lambda lote: {'confirmado':999, 'instalacao':lote['instalacao']}).ciclo(0)
    assert h.controle('historico_cursor') is None


def test_lote_limitado_e_sem_identificacao_legada(tmp_path):
    h = Historico(tmp_path)
    for _ in range(33): h.iniciar('p', 'windows')
    lote = lote_pendente(h)
    assert len(lote['eventos']) == 30
    assert lote['eventos'][0]['contexto']['escopo'] == 'sem_identificacao'
    assert len(json.dumps(lote).encode()) < 262144


def test_repetir_coleta_sem_mudanca_nao_regrava_trabalho(tmp_path):
    h = Historico(tmp_path); ident = h.iniciar('p','windows')
    h.transicao(ident,'na_fila',spool_id=1)
    with h.banco() as c: antes = c.execute('SELECT atualizado FROM trabalhos').fetchone()[0]
    h.transicao(ident,'na_fila',spool_id=1)
    with h.banco() as c: assert c.execute('SELECT atualizado FROM trabalhos').fetchone()[0] == antes


def test_rede_lenta_nao_segue_com_transacao_sqlite_aberta(tmp_path):
    h = Historico(tmp_path); h.iniciar('p','windows')
    entrou, liberar = threading.Event(), threading.Event()
    def enviar(lote):
        entrou.set(); liberar.wait(3)
        return dict(confirmado=lote['cursor'], instalacao=lote['instalacao'])
    t = threading.Thread(target=Sincronizador(h,enviar).ciclo)
    t.start()
    try:
        assert entrou.wait(2)
        inicio = time.monotonic()
        h.iniciar('outra','windows',contexto=contexto())
        assert time.monotonic() - inicio < 1
    finally: liberar.set(); t.join(5)


@pytest.mark.parametrize('valor',[{'alvos':[{'pedido':'1&empresa=x','modelo':'2'}]}, {'alvos':[{'pedido':'1','modelo':'vibe_item_2'}]}, {'alvos':[], 'tipo':'secret'}, {'alvos':[], 'lote':'invalido'}])
def test_contexto_invalido_rejeitado(valor):
    with pytest.raises(ValueError): contexto_validado(valor)


def test_retentacao_preserva_eventos_nao_sincronizados(tmp_path):
    h = Historico(tmp_path); ident = h.iniciar('p','windows'); h.transicao(ident,'conferido')
    with h.banco() as c: c.execute("UPDATE eventos SET quando='2020-01-01T00:00:00Z'")
    h.amostra({})
    assert len(lote_pendente(h)['eventos']) == 2


def test_sequencia_nao_reutiliza_cursor_apos_retencao(tmp_path):
    h = Historico(tmp_path); h.iniciar('p','windows')
    h.controle('historico_cursor', 150)
    with h.banco() as c: c.execute('DELETE FROM eventos')
    h.iniciar('p','windows')
    assert lote_pendente(h)['eventos'][0]['seq'] == 151


def test_hotfolder_registra_uma_unica_tentativa_com_contexto(tmp_path, monkeypatch):
    import hotfolder
    import gestao_estacoes as g
    h = Historico(tmp_path/'gestao')
    monkeypatch.setattr(g,'_historico',h);monkeypatch.setattr(g,'_thread',object())
    monkeypatch.setattr(hotfolder,'_soltar',lambda *args:str(tmp_path/'sintetico.pdf'))
    monkeypatch.setattr(hotfolder.threading,'Thread',lambda **kw:type('ThreadSimulada',(),{'start':lambda self:None})())
    hotfolder.soltar(str(tmp_path),'sintetico.pdf',b'sintetico',contexto=contexto())
    with h.banco() as c: assert c.execute('SELECT count(*) FROM trabalhos').fetchone()[0] == 1
    eventos=lote_pendente(h)['eventos']
    assert eventos[-1]['codigo']=='trabalho_enviado'
    assert eventos[-1]['contexto']['alvos']==contexto()['alvos']
    assert eventos[-1]['impressora']=='Hot folder / RIP'
