import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from canais_newprod import PORTA
from estatisticas_piloto import criar_router_estatisticas
from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2


@pytest.mark.parametrize('falha', [None, 'marcador', 'pacote', 'digest', 'revisao', 'pedido', 'catalogo'])
def test_abertura_conferencia_http_e_reinicio_sem_arte_base(tmp_path, falha):
    s, estado, itens, _ = ambiente_v2(tmp_path)
    # Pedido misto: modelo sem arte de base e modelo com PDF preparado.
    itens[0].update(fontes={}, versoes_fontes={}, gabarito_sem_arte_base=True)
    p = SelecaoPiloto(s)
    aberto = p.abrir_pedido({'pedido': '99'})
    assert len(aberto['pacotes']) == 2 and estado['downloads'] == 1
    app = FastAPI()
    app.include_router(criar_router_estatisticas(s))
    s.offline.catalogos = lambda: None if falha == 'catalogo' else {'formatos': [], 'saidas': []}
    registro = p._cache.obter('99')
    if falha == 'marcador': registro['itens'][0].pop('gabarito_sem_arte_base')
    if falha == 'pacote': registro['pacotes'].pop(0)
    if falha == 'digest': registro['pacotes'][0]['digest'] = 'e' * 64
    p._cache.salvar('99', registro['revisao'], registro['itens'], registro['pacotes'], snapshot=registro['snapshot'])
    body = [{'pedido': '100' if falha == 'pedido' else '99',
             'revisao': 'f' * 64 if falha == 'revisao' else aberto['revisao_pedido']}]
    headers = {'Origin': f'http://127.0.0.1:{PORTA}', 'Sec-Fetch-Site': 'same-origin', 'X-Piloto-Painel': '1'}
    with TestClient(app, base_url=f'http://127.0.0.1:{PORTA}', client=('127.0.0.1', 55)) as client:
        resposta = client.post('/api/pacotes-locais/conferencia-trabalho-painel', json=body, headers=headers)
    if falha:
        assert resposta.status_code == 409
    else:
        assert resposta.status_code == 200
        assert resposta.json()['pedidos'][0]['sem_arte'] == []
        assert len(s.offline.bootstrap()['pedidos']) == 1
        from conferencia_piloto import ConexaoPilotoIndisponivel
        def sem_rede(*args): raise ConexaoPilotoIndisponivel('offline sintetico')
        s.coleta_autonoma.cliente.abrir_pedido = sem_rede
        depois = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
        assert depois['execucao_offline'] and len(depois['pacotes']) == 2
    assert estado['downloads'] == 1
