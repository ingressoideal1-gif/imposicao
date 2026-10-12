import ssl
import urllib.error

import pytest

from coleta_autonoma import ClienteAutonomo
from conferencia_piloto import ConexaoPilotoIndisponivel, ConferenciaIndisponivel, PedidoLocalIndisponivel
from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2


def desconectar(s):
    def sem_rede(*args):
        raise ConexaoPilotoIndisponivel('sem rede')
    s.coleta_autonoma.cliente.abrir_pedido = sem_rede


def test_reabre_snapshot_e_arquivos_sem_rede_apos_reinicio(tmp_path):
    s, e, _, snapshot = ambiente_v2(tmp_path)
    antes = SelecaoPiloto(s).abrir_pedido({'pedido':'99'})
    desconectar(s)
    p = SelecaoPiloto(s)
    depois = p.abrir_pedido({'pedido':'99'})
    assert depois['execucao_offline'] and depois['snapshot'] == snapshot
    assert depois['revisao_pedido'] == antes['revisao_pedido']
    assert e['downloads'] == 2
    for pacote in depois['pacotes']:
        assert p.ler(pacote['modelo'], pacote['revisao'], 'frente') == e['bytes'][pacote['modelo']]


@pytest.mark.parametrize('falha', ['sem_cache', 'ausente', 'corrompido', 'empresa', 'snapshot', 'pacote'])
def test_offline_nao_libera_copia_incompleta_ou_invalida(tmp_path, falha):
    s, _, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    if falha != 'sem_cache':
        p.abrir_pedido({'pedido':'99'})
    if falha in ('ausente', 'corrompido'):
        obj = next(s.local.raiz.rglob('objetos/*'))
        if falha == 'ausente': obj.unlink()
        else: obj.write_bytes(b'x' * obj.stat().st_size)
    if falha in ('empresa', 'snapshot', 'pacote'):
        registro = p._cache.obter('99')
        if falha == 'empresa': registro['empresa'] = 'outra'
        if falha == 'snapshot': registro['snapshot']['modelos'][0]['id_int'] = 100
        if falha == 'pacote': registro['pacotes'].pop()
        p._cache.obter = lambda _: registro
    desconectar(s)
    with pytest.raises(PedidoLocalIndisponivel): p.abrir_pedido({'pedido':'99'})


def test_revisao_nova_com_download_falho_nao_ressuscita_anterior_offline(tmp_path):
    s, e, itens, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    p.abrir_pedido({'pedido':'99'})
    e['revisao'] = 'd'*64
    itens[0]['versoes_fontes']['frente'] = {'revisao':'e'*64, 'etag':'novo'}
    e['etags']['10'] = 'novo'
    e['mudou_download'] = True
    with pytest.raises(ConferenciaIndisponivel): p.abrir_pedido({'pedido':'99'})
    desconectar(s)
    with pytest.raises(PedidoLocalIndisponivel): SelecaoPiloto(s).abrir_pedido({'pedido':'99'})


def test_reconexao_retoma_conferencia_online(tmp_path):
    s, e, itens, snapshot = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    p.abrir_pedido({'pedido':'99'})
    online = s.coleta_autonoma.cliente.abrir_pedido
    desconectar(s)
    assert p.abrir_pedido({'pedido':'99'})['execucao_offline']
    s.coleta_autonoma.cliente.abrir_pedido = online
    e['revisao'] = 'd'*64
    itens[0]['observacao']['digest'] = 'e'*64
    snapshot['modelos'][0]['quantidade'] = 500
    resposta = p.abrir_pedido({'pedido':'99'})
    assert not resposta['execucao_offline']
    assert resposta['snapshot']['modelos'][0]['quantidade'] == 500


def test_recusa_online_nao_se_transforma_em_permissao_offline(tmp_path):
    s, _, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    p.abrir_pedido({'pedido':'99'})
    def recusado(*args): raise ConferenciaIndisponivel('acesso recusado')
    s.coleta_autonoma.cliente.abrir_pedido = recusado
    with pytest.raises(ConferenciaIndisponivel): p.abrir_pedido({'pedido':'99'})
    desconectar(s)
    with pytest.raises(PedidoLocalIndisponivel): SelecaoPiloto(s).abrir_pedido({'pedido':'99'})


@pytest.mark.parametrize('erro,offline', [
    (urllib.error.URLError('DNS indisponivel'), True), (TimeoutError(), True),
    (urllib.error.HTTPError('https://test.invalid',403,'recusado',{},None), False),
    (urllib.error.HTTPError('https://test.invalid',500,'erro',{},None), False),
    (urllib.error.URLError(ssl.SSLError('certificado')), False), (ValueError(), False)])
def test_so_falhas_de_transporte_autorizam_leitura_offline(erro, offline):
    def abrir(*args, **kwargs): raise erro
    cliente = ClienteAutonomo('test.invalid','teste','PC',segredo=lambda:'sintetico',abrir=abrir)
    with pytest.raises(ConferenciaIndisponivel) as exc:
        cliente.abrir_pedido('99')
    assert isinstance(exc.value, ConexaoPilotoIndisponivel) is offline
