from hashlib import sha256
import io
import json
from urllib.error import URLError

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from canais_newprod import PORTA
from coleta_autonoma import BLOCO_PEDIDO, LIMITE_PEDIDO_EM_PARTES, ClienteAutonomo
from conferencia_piloto import ConferenciaIndisponivel, ConexaoPilotoIndisponivel
from estatisticas_piloto import criar_router_estatisticas
from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2


def resposta_http(dados, *, em_partes=True, falha=None):
    raw = json.dumps(dados, ensure_ascii=False, separators=(',', ':')).encode()
    if em_partes:
        assert len(raw) > 8 * 1024 * 1024
    resposta = io.BytesIO(raw[:-1] if falha == 'interrompida' else raw)
    resposta.headers = {}
    if em_partes:
        resposta.headers.update({
            'X-NewProd-Pedido-Partes': '1',
            'X-NewProd-Pedido-Bytes': str(len(raw)),
            'X-NewProd-Pedido-SHA256': sha256(raw).hexdigest(),
        })
    return resposta


def test_ticket_5_acima_de_8_mib_abre_no_painel_e_reabre_do_cache(tmp_path):
    s, estado, _, snapshot = ambiente_v2(tmp_path)
    colunas = [f'Ticket {pos} - Link' for pos in range(1, 6)]
    inicio = 200003

    def link(numero):
        return 'https://ticket.invalid/' + 'c\u00e9lula-' * 11 + str(numero)

    linhas = [
        {coluna: link(inicio + celula * 5 + pos)
         for pos, coluna in enumerate(colunas)}
        for celula in range(8000)
    ]
    snapshot['bancos'] = [
        {'id': 'vinculado', 'csv_headers': colunas, 'csv_data': linhas},
        {'id': 'original', 'csv_headers': ['link'],
         'csv_data': [{'link': link(numero)} for numero in range(inicio, inicio + 40002)]},
    ]
    mapa = {}
    elementos = []
    for pos, coluna in enumerate(colunas, 1):
        for tipo in ('QR', 'TEXT'):
            elemento_id = f'{tipo}-{pos}'
            mapa['el:' + elemento_id] = coluna
            elementos.append({'id': elemento_id, 'type': tipo, 'source': 'database', 'ticket_pos': pos})
    snapshot['modelos'][0].update(quantidade=8000, amostra_num_id='ticket')
    snapshot['numeracoes'] = [{'id': 'ticket', 'tipo': 'TICKET', 'ticket_qtd': 5, 'elements': elementos}]
    snapshot['vinculos'] = [{'modelo_id': '10', 'banco_id': 'vinculado', 'csv_mapa': mapa}]
    conferir = s.coleta_autonoma.cliente.abrir_pedido
    revisoes = []
    modo = 'legado'

    def abrir(req, timeout):
        assert req.get_header('X-newprod-pedido-partes') == '1'
        if modo == 'offline':
            raise URLError('conexao indisponivel')
        dados = json.loads(req.data)
        revisoes.append(dados['revisao'])
        recibo = conferir(dados['pedido'], dados['revisao'])
        return resposta_http(recibo, em_partes=modo != 'legado' and not recibo['sem_mudanca'], falha=modo)

    s.coleta_autonoma.cliente = ClienteAutonomo(
        'test.invalid', 'teste', 'PC-TESTE', segredo=lambda: 'sintetico', abrir=abrir)
    app = FastAPI()
    app.include_router(criar_router_estatisticas(s))
    s.offline.catalogos_para_pedido = lambda _: {}
    origem = f'http://127.0.0.1:{PORTA}'
    headers = {'sec-fetch-site': 'same-origin', 'origin': origem, 'x-piloto-painel': '1'}
    with TestClient(app, base_url=origem, client=('127.0.0.1', 55)) as http:
        def abrir_no_painel():
            return http.post('/api/pacotes-locais/abrir-pedido-painel', json={'pedido': '99'}, headers=headers)

        assert abrir_no_painel().status_code == 409
        modo = 'interrompida'
        assert abrir_no_painel().status_code == 409
        assert SelecaoPiloto(s)._cache.obter('99') is None
        assert estado['downloads'] == 0

        modo = 'partes'
        resposta = abrir_no_painel()
        assert resposta.status_code == 200
        dados = resposta.json()
        assert dados['snapshot'] == snapshot
        assert dados['snapshot']['bancos'][0]['csv_data'][0][colunas[0]] == link(200003)
        assert dados['snapshot']['bancos'][0]['csv_data'][-1][colunas[-1]] == link(240002)
        assert revisoes == ['', '', '', dados['revisao_pedido']]
        assert estado['downloads'] == 2

        modo = 'offline'
        offline = abrir_no_painel().json()
        assert offline['execucao_offline'] is True
        assert offline['snapshot'] == snapshot
        assert estado['downloads'] == 2


def test_banco_novo_reconfere_revisao_com_pdfs_reutilizados(tmp_path):
    s, estado, _, snapshot = ambiente_v2(tmp_path)
    conferir = s.coleta_autonoma.cliente.abrir_pedido
    painel = SelecaoPiloto(s)
    anterior = painel.abrir_pedido({'pedido': '99'})
    estado['revisao'] = 'b' * 64
    snapshot['bancos'] = [{'id': 'banco', 'csv_data': [{'codigo': '000123'}]}]

    def abrir(pedido, revisao):
        r = conferir(pedido, revisao)
        if revisao == anterior['revisao_pedido']:
            r['recebido_em_partes'] = True
            estado['revisao'] = 'c' * 64
        return r

    s.coleta_autonoma.cliente.abrir_pedido = abrir
    with pytest.raises(ConferenciaIndisponivel, match='mudou durante a copia'):
        painel.abrir_pedido({'pedido': '99'})
    cache = painel._cache.obter('99')
    assert cache['revisao'] == anterior['revisao_pedido']
    assert cache['offline_bloqueado'] is True
    assert estado['downloads'] == 2


@pytest.mark.parametrize('falha', ['checksum', 'bytes_extras', 'limite', 'timeout', 'protocolo'])
def test_transferencia_invalida_recusada_antes_de_entregar_o_snapshot(falha):
    raw = b'{"protocolo":2,"sem_mudanca":false}'
    headers = {
        'X-NewProd-Pedido-Partes': '1',
        'X-NewProd-Pedido-Bytes': str(len(raw)),
        'X-NewProd-Pedido-SHA256': sha256(raw).hexdigest(),
    }
    if falha == 'checksum':
        headers['X-NewProd-Pedido-SHA256'] = 'a' * 64
    if falha == 'limite':
        headers['X-NewProd-Pedido-Bytes'] = str(LIMITE_PEDIDO_EM_PARTES + 1)
    if falha == 'protocolo':
        headers['X-NewProd-Pedido-Partes'] = '2'

    class Resposta(io.BytesIO):
        def read(self, tamanho):
            assert falha not in ('limite', 'protocolo')
            assert 0 < tamanho <= BLOCO_PEDIDO
            if falha == 'timeout':
                raise TimeoutError('transferencia interrompida')
            return super().read(tamanho)

    resposta = Resposta(raw + b'x' if falha == 'bytes_extras' else raw)
    resposta.headers = headers
    cliente = ClienteAutonomo('test.invalid', 'teste', 'PC-TESTE',
                              segredo=lambda: 'sintetico', abrir=lambda *_args, **_kw: resposta)
    with pytest.raises(ConferenciaIndisponivel) as erro:
        cliente.abrir_pedido('99')
    assert not isinstance(erro.value, ConexaoPilotoIndisponivel)
