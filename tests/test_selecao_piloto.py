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
        assert cursor == 9 and pedido == '99'
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
