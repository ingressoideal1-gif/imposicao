"""Somente bytes sintéticos e transporte simulado; nunca lê credenciais reais."""
import hashlib
import io
import json
from types import SimpleNamespace
from urllib.error import HTTPError, URLError

import pytest
import qr_provisionamento as p


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    import acesso_publicacao
    import migracao_estacao
    dados = b'ABCDEFGH12345678'
    monkeypatch.setattr(p, 'BYTES', len(dados))
    monkeypatch.setattr(p, 'POOL_V2_SHA256', hashlib.sha256(dados).hexdigest())
    monkeypatch.setattr(acesso_publicacao, '_segredo', lambda: 'credencial-sintetica')
    monkeypatch.setattr(migracao_estacao, 'proteger_pasta', lambda _: None)
    monkeypatch.setattr(p.socket, 'gethostname', lambda: 'LASER-TESTE')
    monkeypatch.setenv('NEWPROD_PILOTO_EMPRESA', 'empresa-sintetica')
    chamadas = []
    resposta = io.BytesIO(dados)
    resposta.status = 200
    resposta.geturl = lambda: p.URL
    resposta.headers = {'Content-Type': 'application/octet-stream',
        'Content-Length': str(len(dados)), 'X-NewProd-QR-Revisao': p.REVISAO,
        'X-NewProd-QR-SHA256': p.POOL_V2_SHA256}
    def abrir(req, **kw):
        chamadas.append(req)
        assert req.full_url == p.URL and req.get_method() == 'POST'
        assert req.get_header('X-agente-segredo') == 'credencial-sintetica'
        assert json.loads(req.data) == {'estacao':'LASER-TESTE', 'empresa':'empresa-sintetica', 'revisao':p.REVISAO}
        return resposta
    monkeypatch.setattr(p.urllib.request, 'build_opener', lambda *_: SimpleNamespace(open=abrir))
    return tmp_path / 'protegido' / 'base.bin', dados, resposta, chamadas


def test_instala_confere_e_reutiliza_sem_rede(ambiente):
    destino, dados, _, chamadas = ambiente
    p.obter_automaticamente(destino)
    assert destino.read_bytes() == dados
    assert list(destino.parent.iterdir()) == [destino]
    p.obter_automaticamente(destino)
    assert len(chamadas) == 1


@pytest.mark.parametrize('payload', [b'', b'curto', b'x'*16, b'x'*17])
def test_recusa_truncado_corrompido_ou_excedente_sem_deixar_parcial(ambiente, payload):
    destino, _, resposta, _ = ambiente
    resposta.seek(0); resposta.truncate(); resposta.write(payload); resposta.seek(0)
    with pytest.raises(p.ErroProvisionamentoQr): p.obter_automaticamente(destino)
    assert not destino.exists() and list(destino.parent.iterdir()) == []


@pytest.mark.parametrize('campo,valor', [('Content-Type','text/html'),
    ('Content-Length','999'), ('X-NewProd-QR-Revisao','outra'),
    ('X-NewProd-QR-SHA256','0'*64), ('Content-Encoding','gzip')])
def test_recusa_metadados_incompativeis(ambiente, campo, valor):
    destino, _, resposta, _ = ambiente
    resposta.headers[campo] = valor
    with pytest.raises(p.ErroProvisionamentoQr): p.obter_automaticamente(destino)
    assert not destino.exists() and list(destino.parent.iterdir()) == []


def test_arquivo_existente_divergente_nunca_e_substituido(ambiente):
    destino, _, _, chamadas = ambiente
    destino.parent.mkdir(); destino.write_bytes(b'privado-existente')
    with pytest.raises(p.ErroProvisionamentoQr): p.obter_automaticamente(destino)
    assert destino.read_bytes() == b'privado-existente' and chamadas == []


def test_nao_envia_sem_credencial(ambiente, monkeypatch):
    import acesso_publicacao
    monkeypatch.setattr(acesso_publicacao, '_segredo', lambda: None)
    destino, _, _, chamadas = ambiente
    with pytest.raises(p.ErroProvisionamentoQr, match='provisionamento_recusado'):
        p.obter_automaticamente(destino)
    assert chamadas == [] and not destino.exists()


@pytest.mark.parametrize('erro', [HTTPError('https://privado',403,'segredo',{},None),
    URLError('segredo'), TimeoutError('segredo')])
def test_falha_de_transporte_nao_expoe_detalhes(ambiente, monkeypatch, erro):
    destino, _, _, _ = ambiente
    def falhar(*a, **kw): raise erro
    monkeypatch.setattr(p.urllib.request, 'build_opener', lambda *_: SimpleNamespace(open=falhar))
    with pytest.raises(p.ErroProvisionamentoQr) as exc: p.obter_automaticamente(destino)
    assert 'segredo' not in str(exc.value) and 'https://' not in str(exc.value)
    assert not destino.exists()


def test_redirecionamento_nao_repassa_credencial():
    with pytest.raises(p.ErroProvisionamentoQr):
        p._SemRedirecionamento().redirect_request(None,None,307,'',{},'https://fora.invalid')


def test_concorrencia_preserva_arquivo_publicado_por_outra_instancia(ambiente, monkeypatch):
    destino, dados, _, _ = ambiente
    def concorrente(*_):
        destino.write_bytes(dados)
        raise FileExistsError()
    monkeypatch.setattr(p.os, 'link', concorrente)
    p.obter_automaticamente(destino)
    assert destino.read_bytes() == dados and list(destino.parent.iterdir()) == [destino]


def test_interrupcao_durante_stream_remove_temporario(ambiente, monkeypatch):
    destino, _, resposta, _ = ambiente
    ler = resposta.read
    chamadas = 0
    def interromper(n):
        nonlocal chamadas
        chamadas += 1
        if chamadas > 1:
            raise URLError('URL privada e credencial nao podem sair')
        return ler(min(n, 8))
    monkeypatch.setattr(resposta, 'read', interromper)
    with pytest.raises(p.ErroProvisionamentoQr, match='provisionamento_indisponivel'):
        p.obter_automaticamente(destino)
    assert not destino.exists() and list(destino.parent.iterdir()) == []


def test_concorrencia_nao_sobrescreve_destino_divergente(ambiente, monkeypatch):
    destino, _, _, _ = ambiente
    def concorrente(*_):
        destino.write_bytes(b'outro-conteudo')
        raise FileExistsError()
    monkeypatch.setattr(p.os, 'link', concorrente)
    with pytest.raises(p.ErroProvisionamentoQr): p.obter_automaticamente(destino)
    assert destino.read_bytes() == b'outro-conteudo'
    assert list(destino.parent.iterdir()) == [destino]


def test_base_v2_passa_a_baixar_quando_ausente_e_preserva_legada(ambiente, monkeypatch):
    import qr_base_v2, qr_ideal, migracao_estacao
    destino, dados, _, chamadas = ambiente
    monkeypatch.setattr(qr_base_v2, '_pool', None)
    monkeypatch.setattr(qr_base_v2, 'POOL_V2_SHA256', p.POOL_V2_SHA256)
    monkeypatch.setattr(qr_ideal, 'TOTAL', 2)
    monkeypatch.setattr(migracao_estacao, 'pasta_dados', lambda: destino.parent)
    destino.parent.mkdir()
    legada = destino.parent / qr_ideal.NOME_ARQUIVO
    legada.write_bytes(b'legada-preservada')
    pool = qr_base_v2.obter(None)
    try: assert pool.codigo_indice(1) == '12345678'
    finally: pool.fechar()
    assert legada.read_bytes() == b'legada-preservada' and len(chamadas) == 1


def test_diagnostico_identifica_recusa_sem_mensagem_privada(ambiente, monkeypatch):
    import qr_base_v2, qr_ideal, qr_contratos, migracao_estacao, diagnostico_estacao
    from offline_estacao import OfflineEstacao
    destino, _, resposta, _ = ambiente
    resposta.status = 403
    monkeypatch.setattr(qr_base_v2, '_pool', None)
    monkeypatch.setattr(migracao_estacao, 'pasta_dados', lambda: destino.parent)
    monkeypatch.setattr(qr_contratos, 'obter', lambda _: [{'versao':2}])
    monkeypatch.setattr(qr_ideal, 'PoolQR', lambda: SimpleNamespace(verificar_integridade=lambda:None, fechar=lambda:None))
    offline = OfflineEstacao.__new__(OfflineEstacao)
    with pytest.raises(p.ErroProvisionamentoQr) as exc:
        offline.preparar_dependencias('99', {'numeracoes':[{'elements':[{'type':'QR_IDEAL'}]}]})
    assert diagnostico_estacao._dependencia_local(exc.value) == {
        'recurso_local':'qr_base_v2', 'motivo_local':'provisionamento_recusado'}
