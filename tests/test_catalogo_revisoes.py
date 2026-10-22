import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest

from catalogo_revisoes import CatalogoCheio
from pacotes_api import ServicoPacotes
from revisao_pedido_piloto import CacheRevisaoPedido


def entrada(modelo='1', versao=1):
    return {'empresa': 'teste', 'modelo': modelo, 'fontes': {
        'frente': 'https://test.invalid/storage/v1/object/public/artes/a.pdf'},
        'observacao': {'digest': hashlib.sha256(str(versao).encode()).hexdigest(), 'aprovacao': 'APROVADA'}}


def servico(tmp_path, limite=3):
    return ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', limite_catalogo=limite)


def registros(s, tabela='catalogo'):
    con = s._db()
    try:
        return {(m, r): json.loads(t) for m, r, t in con.execute('SELECT * FROM ' + tabela)}
    finally:
        con.close()


def preencher(s):
    return [s.antecipar(entrada(versao=n))['revisao'] for n in range(1, 4)]


def test_revisao_nova_arquiva_antiga_sem_apagar_recursos_ou_copia_offline(tmp_path):
    s = servico(tmp_path)
    revs = preencher(s)
    cache = CacheRevisaoPedido(s)
    cache.salvar('99', 'pedido', [entrada(versao=2)], [{'modelo': '1', 'revisao': 'derivada2'}])
    antes = registros(s)
    for n, rev in enumerate(revs, 1):
        m = deepcopy(antes[('1', rev)]['manifesto']); m['revisao'] = 'derivada' + str(n)
        s.salvar_coleta(antes[('1', rev)]['manifesto'], m)
    arquivo = tmp_path / 'pacotes' / 'arquivo-preservado'
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(b'conteudo-sintetico')
    con = s._db(); coletas = con.execute('SELECT * FROM coletas').fetchall(); con.close()
    novo = s.antecipar(entrada('2'))['revisao']
    assert set(registros(s)) == {('1', revs[1]), ('1', revs[2]), ('2', novo)}
    assert registros(s, 'catalogo_arquivo') == {('1', revs[0]): antes[('1', revs[0])]}
    assert cache.obter('99')['pacotes'][0]['revisao'] == 'derivada2'
    assert arquivo.read_bytes() == b'conteudo-sintetico'
    con = s._db(); assert con.execute('SELECT * FROM coletas').fetchall() == coletas; con.close()


def test_preparacao_em_uso_e_ultima_revisao_nao_sao_arquivadas(tmp_path):
    s = servico(tmp_path); revs = preencher(s)
    with s.proteger_antecipacao(entrada(versao=1)):
        s.antecipar(entrada('2'))
    assert ('1', revs[0]) in registros(s) and ('1', revs[2]) in registros(s)
    assert ('1', revs[1]) in registros(s, 'catalogo_arquivo')


@pytest.mark.parametrize('ativo', [True, False])
def test_fila_de_preparacao_protegida(tmp_path, ativo):
    s = servico(tmp_path); revs = preencher(s)
    chave = ('teste', '1', revs[0])
    if ativo:
        s.preparador._ativo = chave
    else:
        s.preparador._tarefas[chave] = None
    s.antecipar(entrada('2'))
    assert ('1', revs[0]) in registros(s)


def test_sem_candidato_recusa_sem_alterar_catalogo(tmp_path):
    s = servico(tmp_path, 2)
    s.antecipar(entrada('1')); s.antecipar(entrada('2'))
    antes = registros(s)
    with pytest.raises(CatalogoCheio): s.antecipar(entrada('3'))
    assert registros(s) == antes and not registros(s, 'catalogo_arquivo')


def test_falha_na_admissao_reverte_arquivamento(tmp_path):
    s = servico(tmp_path); preencher(s); antes = registros(s)
    con = s._db()
    con.execute("CREATE TRIGGER recusar BEFORE INSERT ON catalogo WHEN NEW.modelo='2' BEGIN SELECT RAISE(ABORT,'teste'); END")
    con.commit(); con.close()
    import sqlite3
    with pytest.raises(sqlite3.IntegrityError): s.antecipar(entrada('2'))
    assert registros(s) == antes and not registros(s, 'catalogo_arquivo')


def test_readmissao_apos_reinicio_preserva_imutabilidade(tmp_path):
    s = servico(tmp_path); revs = preencher(s); original = registros(s)[('1', revs[0])]
    s.antecipar(entrada('2'))
    s = servico(tmp_path)
    adulterado = deepcopy(original); adulterado['manifesto']['configuracao']['extra'] = True
    with pytest.raises(ValueError, match='imutável'): s.cadastrar(adulterado, _antecipacao=True)
    s.antecipar(entrada(versao=1))
    assert registros(s)[('1', revs[0])]['manifesto'] == original['manifesto']
    assert len(registros(s)) == 3


def test_admissoes_concorrentes_respeitam_teto(tmp_path):
    s = servico(tmp_path); preencher(s)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda m: s.antecipar(entrada(m)), ['2', '3']))
    assert len(registros(s)) == 3
    assert len(registros(s, 'catalogo_arquivo')) == 2


def test_cache_invalido_impede_arquivamento(tmp_path):
    s = servico(tmp_path); preencher(s); CacheRevisaoPedido(s)
    con = s._db(); con.execute("INSERT INTO revisoes_pedidos_piloto VALUES ('99','{}')"); con.commit(); con.close()
    antes = registros(s)
    with pytest.raises(ValueError, match='Referências'): s.antecipar(entrada('2'))
    assert registros(s) == antes and not registros(s, 'catalogo_arquivo')


def test_pacote_derivado_referenciado_protege_revisao_de_origem(tmp_path):
    s = servico(tmp_path); revs = preencher(s)
    original = registros(s)[('1', revs[0])]['manifesto']
    derivado = deepcopy(original); derivado['revisao'] = 'derivado'
    s.salvar_coleta(original, derivado)
    CacheRevisaoPedido(s).salvar('99', 'pedido', [], [{'modelo': '1', 'revisao': 'derivado'}])
    s.antecipar(entrada('2'))
    assert ('1', revs[0]) in registros(s)


def test_entrada_manual_antiga_nao_e_arquivada(tmp_path):
    from test_pacotes_api import item
    s = servico(tmp_path, 2)
    s.cadastrar(item())
    nova = item(); nova['manifesto']['revisao'] = 'r2'; s.cadastrar(nova)
    with pytest.raises(CatalogoCheio): s.antecipar(entrada('2'))
    assert not registros(s, 'catalogo_arquivo')


def test_pedido_alterado_abre_com_catalogo_cheio_e_preserva_pacote_anterior(tmp_path):
    from test_revisao_pedido_piloto import ambiente
    from selecao_piloto import SelecaoPiloto
    from test_pacotes_api import BYTES
    s, estado, itens, dados = ambiente(tmp_path)
    s.limite_catalogo = 4
    preencher(s)
    selecao = SelecaoPiloto(s)
    antes = selecao.preparar_pedido(dados)
    assert len(s.catalogo()) == 4
    estado['revisao'] = 'c' * 64
    itens[0]['observacao']['digest'] = 'd' * 64
    dados['modelos'][0]['digest'] = 'd' * 64
    novo = selecao.preparar_pedido(dados)
    assert novo['revisao_pedido'] == 'c' * 64
    assert selecao.ler('10', antes['pacotes'][0]['revisao'], 'frente') == BYTES
    assert selecao.ler('10', novo['pacotes'][0]['revisao'], 'frente') == BYTES
    assert len(s.catalogo()) == 4 and len(registros(s, 'catalogo_arquivo')) == 1
    assert not s._revisoes_em_uso


def test_abertura_expoe_codigo_especifico_quando_nao_pode_arquivar(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from canais_newprod import PORTA
    from estatisticas_piloto import criar_router_estatisticas
    from selecao_piloto import SelecaoPiloto
    def falhar(*args, **kwargs):
        raise CatalogoCheio('texto interno nao deve vazar')
    monkeypatch.setattr(SelecaoPiloto, 'abrir_pedido', falhar)
    s = servico(tmp_path)
    app = FastAPI(); app.include_router(criar_router_estatisticas(s))
    origem = f'http://127.0.0.1:{PORTA}'
    h = {'sec-fetch-site': 'same-origin', 'origin': origem, 'x-piloto-painel': '1'}
    with TestClient(app, base_url=origem, client=('127.0.0.1', 55)) as c:
        r = c.post('/api/pacotes-locais/abrir-pedido-painel', json={'pedido': '99'}, headers=h)
    assert r.status_code == 422
    assert r.json()['detail'] == {'codigo': 'catalogo_local_cheio'}
    assert r.headers['X-NewProd-Diagnostico'].startswith('D-')
