import io
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pacotes_api import ServicoPacotes
from selecao_piloto import SelecaoPiloto
from conferencia_piloto import ConferenciaIndisponivel
from estatisticas_piloto import criar_router_estatisticas
from canais_newprod import PORTA
from test_antecipacao_local import candidato
from test_pacotes_api import BYTES


def ambiente(tmp_path):
    estado = {'bytes': BYTES, 'downloads': 0, 'conferencias': 0}
    def abrir(*a, **k):
        estado['downloads'] += 1
        if estado.get('falha'): raise OSError('falha simulada')
        return io.BytesIO(estado['bytes'])
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', abrir=abrir)
    item = candidato(); item['pedido'] = '99'
    def listar(cursor, pedido):
        estado['listagens'] = estado.get('listagens', 0) + 1
        assert cursor in (0, 9) and pedido == '99'
        return {'itens': [] if estado.get('removido') else [item]}
    def conferir(i):
        estado['conferencias'] += 1
        if estado.get('mudou') and estado['conferencias'] % 2 == 0:
            raise ConferenciaIndisponivel('alterado')
        return '2026-09-27T12:00:00+00:00'
    s.coleta_autonoma = SimpleNamespace(cliente=SimpleNamespace(listar=listar, conferir=conferir))
    return s, estado, {'pedido':'99', 'modelo':'10', 'digest':'a'*64}


def test_selecao_confere_baixa_le_do_disco_e_revalida_mesma_url(tmp_path):
    s, estado, dados = ambiente(tmp_path); p = SelecaoPiloto(s)
    r = p.preparar(dados)
    assert r['origem'] == 'local' and r['atualizado'] and not r['execucao_offline']
    estado['falha'] = True
    assert p.ler('10', r['revisao'], 'frente') == BYTES
    with pytest.raises(OSError): p.preparar(dados)
    estado['falha'] = False
    estado['bytes'] = BYTES + b'\n% nova revisao'
    novo = p.preparar(dados)
    assert novo['revisao'] != r['revisao'] and novo['atualizado']
    assert p.ler('10', novo['revisao'], 'frente') == estado['bytes']
    assert p.ler('10', r['revisao'], 'frente') == BYTES


def test_pdf_grande_prepara_le_do_cache_e_preserva_hash(tmp_path):
    import hashlib
    from pacotes_locais import PacoteInvalido
    # Transporte maior que o teto antigo, sem rede real ou impressão.
    tamanho = 151 * 1024 * 1024
    class ArquivoSintetico:
        headers = {'Content-Length': str(tamanho)}
        def __init__(self): self.restante = tamanho
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, n):
            n = min(n, self.restante); self.restante -= n
            return b'x' * n
    s, _, dados = ambiente(tmp_path)
    s.preparador.armazenamento.abrir = lambda *a, **k: ArquivoSintetico()
    p = SelecaoPiloto(s)
    r = p.preparar_pedido({'pedido': '99', 'modelos': [
        {'modelo': '10', 'digest': dados['digest']}]})['pacotes'][0]
    def sem_rede(*a, **k): raise AssertionError('Leitura local não baixa novamente')
    s.preparador.armazenamento.abrir = sem_rede
    conteudo = p.ler('10', r['revisao'], 'frente')
    assert len(conteudo) == tamanho
    assert hashlib.sha256(conteudo).hexdigest() == r['hashes']['frente']
    del conteudo
    manifesto = s.obter_coleta(s.catalogo()[0]['manifesto'])
    manifesto['modelo'] = '11'
    manifesto['configuracao']['recursos_motor'] = {'origem-sintetica': 'frente'}
    s.local.preparar(manifesto, {})
    resolver = s.local.resolver_para_motor('teste', '11', r['revisao'])
    assert len(resolver('origem-sintetica')) == tamanho
    objeto = s.local._pasta('teste') / 'objetos' / r['hashes']['frente']
    with objeto.open('r+b') as f: f.write(b'z')
    with pytest.raises(PacoteInvalido, match='alterado'):
        p.ler('10', r['revisao'], 'frente')


@pytest.mark.parametrize('declarado', [None, '100'])
def test_rota_informa_limite_sem_urls_e_remove_download_parcial(tmp_path, monkeypatch, declarado):
    import antecipacao_local
    monkeypatch.setattr(antecipacao_local, 'LIMITE_RECURSO_BYTES', 8)
    s, _, dados = ambiente(tmp_path)
    def abrir(*a, **k):
        r = io.BytesIO(b'x' * 100)
        r.headers = {} if declarado is None else {'Content-Length': declarado}
        return r
    s.preparador.armazenamento.abrir = abrir
    app = FastAPI(); app.include_router(criar_router_estatisticas(s))
    headers = {'Origin': f'http://127.0.0.1:{PORTA}', 'Sec-Fetch-Site': 'same-origin', 'X-Piloto-Painel': '1'}
    with TestClient(app, base_url=f'http://127.0.0.1:{PORTA}', client=('127.0.0.1', 55)) as c:
        r = c.post('/api/pacotes-locais/preparar-pedido-painel', headers=headers,
                   json={'pedido': '99', 'modelos': [{'modelo': '10', 'digest': dados['digest']}]})
    assert r.status_code == 413
    assert r.json()['detail'] == {'codigo': 'limite_recurso', 'tamanho_bytes': 100,
        'limite_bytes': 8, 'modelo': '10', 'escopo': 'arquivo'}
    assert not list((s.local.raiz / 'antecipacao').iterdir())
    assert not s.obter_coleta(s.catalogo()[0]['manifesto'])


@pytest.mark.parametrize('tipo', ['digest', 'removido', 'mudou'])
def test_nao_libera_selecao_divergente(tmp_path, tipo):
    s, estado, dados = ambiente(tmp_path)
    if tipo == 'digest': dados['digest'] = 'b'*64
    else: estado[tipo] = True
    with pytest.raises(ConferenciaIndisponivel): SelecaoPiloto(s).preparar(dados)


def test_origem_limites_e_integridade_da_rota(tmp_path):
    s, estado, dados = ambiente(tmp_path)
    app = FastAPI(); app.include_router(criar_router_estatisticas(s))
    headers = {'Origin':f'http://127.0.0.1:{PORTA}','Sec-Fetch-Site':'same-origin','X-Piloto-Painel':'1'}
    with TestClient(app, base_url=f'http://127.0.0.1:{PORTA}', client=('127.0.0.1',55)) as c:
        path = '/api/pacotes-locais/selecionar-painel'
        assert c.post(path, json=dados).status_code == 403
        assert c.post(path, headers=headers, content=b'x'*1025).status_code == 413
        r = c.post(path, headers=headers, json=dados)
        assert r.status_code == 200, r.text
        recurso = r.json()['recursos']['frente']
        assert c.get(recurso).status_code == 403
        assert c.get(recurso, headers=headers).content == BYTES
        objeto = next(s.local.raiz.rglob('objetos/*')); objeto.write_bytes(b'corrompido')
        assert c.get(recurso, headers=headers).status_code == 409


def test_prepara_pedido_uma_listagem_e_reabertura_revalida_bytes(tmp_path):
    s, estado, dados = ambiente(tmp_path)
    p = SelecaoPiloto(s)
    pedido = {'pedido':'99', 'modelos':[{'modelo':'10', 'digest':dados['digest']}]}
    r = p.preparar_pedido(pedido)
    assert r['pedido'] == '99' and len(r['pacotes']) == 1
    assert estado['listagens'] == 1 and estado['conferencias'] == 2
    downloads = estado['downloads']
    for _ in range(3):
        assert p.ler('10', r['pacotes'][0]['revisao'], 'frente') == BYTES
    assert estado['downloads'] == downloads and estado['conferencias'] == 2
    estado['bytes'] += b'\n% alterado'
    novo = p.preparar_pedido(pedido)
    assert novo['pacotes'][0]['revisao'] != r['pacotes'][0]['revisao']


def test_preparacao_pedido_exige_origem_limites_e_digest(tmp_path):
    s, estado, dados = ambiente(tmp_path)
    app = FastAPI(); app.include_router(criar_router_estatisticas(s))
    headers = {'Origin':f'http://127.0.0.1:{PORTA}','Sec-Fetch-Site':'same-origin','X-Piloto-Painel':'1'}
    pedido = {'pedido':'99', 'modelos':[{'modelo':'10', 'digest':dados['digest']}]}
    with TestClient(app, base_url=f'http://127.0.0.1:{PORTA}', client=('127.0.0.1',55)) as c:
        path = '/api/pacotes-locais/preparar-pedido-painel'
        assert c.post(path, json=pedido).status_code == 403
        assert c.post(path, headers=headers, content=b'x'*65537).status_code == 413
        assert c.post(path, headers=headers, json=pedido).status_code == 200
        pedido['modelos'][0]['digest'] = 'b'*64
        assert c.post(path, headers=headers, json=pedido).status_code == 409
        pedido['modelos'] *= 129
        assert c.post(path, headers=headers, json=pedido).status_code == 422


def test_modelos_independentes_preparam_em_paralelo_com_limite(tmp_path):
    import copy
    import threading
    contagem = {'ativos':0, 'pico':0, 'chamadas':0}; lock = threading.Lock()
    barreira = threading.Barrier(4)
    def abrir(*args, **kwargs):
        with lock:
            contagem['ativos'] += 1
            contagem['pico'] = max(contagem['pico'], contagem['ativos'])
            contagem['chamadas'] += 1
            primeira_rodada = contagem['chamadas'] <= 4
        if primeira_rodada: barreira.wait(timeout=15)
        with lock: contagem['ativos'] -= 1
        return io.BytesIO(BYTES)
    s = ServicoPacotes(tmp_path,host='test.invalid',empresa='teste',abrir=abrir)
    itens = []
    for n in range(10, 16):
        item = copy.deepcopy(candidato()); item.update(modelo=str(n), pedido='99'); itens.append(item)
    s.coleta_autonoma = SimpleNamespace(cliente=SimpleNamespace(
        listar=lambda cursor,pedido:{'itens':itens,'fim':True}, conferir=lambda item:'2026-09-27T12:00:00+00:00'))
    r = SelecaoPiloto(s).preparar_pedido({'pedido':'99','modelos':[
        {'modelo':i['modelo'],'digest':i['observacao']['digest']} for i in itens]})
    assert 1 < contagem['pico'] <= 4
    assert [p['modelo'] for p in r['pacotes']] == [i['modelo'] for i in itens]
    for p in r['pacotes']:
        assert s.local.ler_recurso('teste',p['modelo'],p['revisao'],'frente') == BYTES


def test_modelo_fora_do_catalogo_nao_bloqueia_outros_nem_fica_liberado(tmp_path):
    s, _, dados = ambiente(tmp_path)
    r = SelecaoPiloto(s).preparar_pedido({'pedido':'99','modelos':[
        {'modelo':'10','digest':dados['digest']},{'modelo':'11','digest':'b'*64}]})
    assert [p['modelo'] for p in r['pacotes']] == ['10'] and r['sem_arte'] == ['11']


def test_paginas_progridem_ate_o_modelo_solicitado(tmp_path):
    s, _, dados = ambiente(tmp_path)
    item = candidato(); item['pedido'] = '99'; cursores = []
    def listar(cursor,pedido):
        cursores.append(cursor)
        return {'itens':[],'proximo':9,'fim':False} if cursor == 0 else {'itens':[item],'proximo':0,'fim':True}
    s.coleta_autonoma.cliente.listar = listar
    assert len(SelecaoPiloto(s).preparar_pedido({'pedido':'99','modelos':[{'modelo':'10','digest':dados['digest']} ]})['pacotes']) == 1
    assert cursores == [0,9]
