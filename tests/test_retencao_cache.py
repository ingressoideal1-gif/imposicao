from copy import deepcopy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import threading
from types import SimpleNamespace

import pytest

from controle_producao import ControleProducao
from offline_estacao import OfflineEstacao
from revisao_pedido_piloto import CacheRevisaoPedido
from retencao_cache import RetencaoCache, descartar, validar_recibo
from selecao_piloto import SelecaoPiloto
from test_revisao_pedido_piloto import ambiente
from test_pacotes_api import BYTES
from test_catalogo_revisoes import entrada, registros


@pytest.fixture(autouse=True)
def perfil_isolado(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'perfil'))


def preparado(tmp_path):
    s, estado, itens, dados = ambiente(tmp_path)
    s.coleta_autonoma.solicitar = lambda: None
    selecao = SelecaoPiloto(s)
    s.offline = OfflineEstacao(s, selecao)
    resultado = selecao.preparar_pedido(dados)
    return s, estado, dados, resultado


def recibo(impresso=True):
    return {'empresa': 'teste', 'conferido_em': datetime.now(timezone.utc).isoformat(),
            'pedidos': [{'pedido': '99', 'impresso': impresso, 'modelos': ['10']}]}


def limpar(s, rows=None, controle=None, spool=True):
    return descartar(s, recibo()['pedidos'] if rows is None else rows,
                    controle=controle or ControleProducao(), spool_livre=lambda: spool)


def test_impresso_libera_catalogo_snapshots_arquivo_e_memoria_sem_apagar_historico(tmp_path):
    s, _, dados, _ = preparado(tmp_path)
    for nome in ('historico.sqlite3', 'base-qr.bin', 'configuracao.json'):
        (tmp_path / nome).write_bytes(b'preservar')
    con = s._db()
    con.execute('INSERT INTO catalogo_arquivo SELECT * FROM catalogo')
    con.execute('INSERT INTO offline_confirmacoes VALUES (?,?,?,?)', ('ok', json.dumps({'pedido':'99'}), 'sincronizado', 1))
    con.commit(); con.close()
    s.preferir('99', True)
    s.preparador._estados[('teste','10','antiga')] = {'estado':'local_validado'}
    r = limpar(s)
    assert r['modelos'] == 1 and r['bytes_removidos'] == len(BYTES)
    assert not registros(s) and not registros(s, 'catalogo_arquivo')
    assert not s.pedidos_locais() and not s.preferencias()
    assert CacheRevisaoPedido(s).obter('99') is None
    assert not list(s.local._pasta('teste').glob('objetos/*'))
    assert not s.preparador._estados
    con = s._db(); assert con.execute('SELECT estado FROM offline_confirmacoes').fetchone()[0] == 'sincronizado'; con.close()
    assert all((tmp_path / n).read_bytes() == b'preservar' for n in ('historico.sqlite3','base-qr.bin','configuracao.json'))
    # Reimpressão explícita baixa novamente, sem alterar status comercial.
    novo = s.offline.selecao.preparar_pedido(dados)
    assert s.offline.selecao.ler('10', novo['pacotes'][0]['revisao'], 'frente') == BYTES


def test_objeto_compartilhado_so_sai_apos_ultimo_pedido_impresso(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    old = s.copias_presentes('10')[0]
    item = entrada('20'); item['pedido'] = '98'
    rev = s.antecipar(item)['revisao']
    manifesto = registros(s)[('20', rev)]['manifesto']
    shared = deepcopy(old); shared.update(modelo='20', revisao='outro')
    arquivo = s.local._pasta('teste') / 'objetos' / shared['arquivos']['frente']['sha256']
    s.local.preparar(shared, {'frente':arquivo})
    s.salvar_coleta(manifesto, shared)
    assert limpar(s)['bytes_removidos'] == 0 and arquivo.exists()
    assert s.local.ler_recurso('teste','20','outro','frente') == BYTES
    r = limpar(s, [{'pedido':'98','impresso':True,'modelos':['20']}])
    assert r['bytes_removidos'] == len(BYTES) and not arquivo.exists()


@pytest.mark.parametrize('barreira', ['pausa','parada','parcial','modelo_ausente','spool','producao','selecao','fila','ativo','preparacao','referencia','manual','pendente','manual_pendente','conflito','faixa'])
def test_barreiras_preservam_todo_cache(tmp_path, barreira):
    s, _, _, _ = preparado(tmp_path)
    rows = recibo()['pedidos']; controle = ControleProducao(); reserva = None
    if barreira == 'pausa': s.preparador._pausado = True
    if barreira == 'parada': s._stop.set()
    if barreira == 'parcial': rows[0]['impresso'] = False
    if barreira == 'modelo_ausente': rows[0]['modelos'] = ['11']
    if barreira == 'producao': reserva = controle.reservar()
    if barreira == 'selecao': s.offline.selecao._lock.acquire()
    if barreira == 'fila': s.preparador._tarefas[('teste','10','r')] = None
    if barreira == 'ativo': s.preparador._ativo = ('teste','10','r')
    if barreira == 'preparacao': s._revisoes_em_uso[('10','r')] = 1
    if barreira == 'referencia': CacheRevisaoPedido(s).salvar('98','r',[{'modelo':'10'}],[])
    con = s._db()
    if barreira in ('pendente','manual_pendente','conflito'):
        con.execute('INSERT INTO offline_confirmacoes VALUES (?,?,?,?)', ('x',json.dumps({'pedido':'99'}),barreira,1))
    if barreira == 'faixa': con.execute('INSERT INTO offline_faixas VALUES (?,?,0)', ('x',json.dumps({'pedido':'99'})))
    if barreira == 'manual':
        con.execute("UPDATE catalogo SET conteudo=json_set(conteudo,'$.manifesto.configuracao.tipo','entrada_online')")
    con.commit(); con.close()
    antes = registros(s)
    try: limpar(s, rows, controle, spool=barreira != 'spool')
    finally:
        if reserva: reserva.liberar()
        if barreira == 'selecao': s.offline.selecao._lock.release()
    assert registros(s) == antes
    assert s.copias_presentes('10') and CacheRevisaoPedido(s).obter('99')
    assert not controle.ocupado()


def test_reversao_atomica_dos_dois_indices(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    con = s._db()
    con.execute("CREATE TRIGGER impedir BEFORE DELETE ON revisoes_pedidos_piloto BEGIN SELECT RAISE(ABORT,'teste'); END")
    con.commit(); con.close()
    antes = registros(s)
    with pytest.raises(Exception, match='teste'): limpar(s)
    assert registros(s) == antes and s.copias_presentes('10')
    assert CacheRevisaoPedido(s).obter('99')


@pytest.mark.parametrize('compartilhado', [False, True])
def test_arquivo_ocupado_e_retentado_sem_apagar_novo_compartilhamento(tmp_path, monkeypatch, compartilhado):
    s, _, _, _ = preparado(tmp_path)
    manifesto = s.copias_presentes('10')[0]
    arquivo = next(s.local._pasta('teste').glob('objetos/*'))
    original = Path.unlink
    def falhar(p, *a, **kw):
        if p == arquivo: raise PermissionError('ocupado')
        return original(p, *a, **kw)
    with monkeypatch.context() as m:
        m.setattr(Path,'unlink',falhar)
        assert limpar(s)['bytes_removidos'] == 0
    assert not registros(s) and arquivo.exists()
    if compartilhado:
        manifesto.update(modelo='20',revisao='nova')
        s.local.preparar(manifesto, {'frente':arquivo})
    assert limpar(s, [])['bytes_removidos'] == (0 if compartilhado else len(BYTES))
    assert arquivo.exists() == compartilhado


def test_trava_de_download_nao_prende_producao(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    controle = ControleProducao(); entrou = threading.Event(); sair = threading.Event()
    def ocupado():
        with s._cache_lock:
            entrou.set(); sair.wait(5)
    t=threading.Thread(target=ocupado);t.start();assert entrou.wait(2)
    try:
        assert limpar(s, controle=controle)['adiado']
        assert not controle.ocupado()
    finally: sair.set();t.join(3)
    assert not t.is_alive() and s.copias_presentes('10')


@pytest.mark.parametrize('falha', ['empresa','vencido','duplicado','ausente','tipo','vazio','id'])
def test_recibo_incompleto_ou_antigo_nao_autoriza_descarte(falha):
    d=recibo()
    if falha=='empresa':d['empresa']='outra'
    if falha=='vencido':d['conferido_em']=(datetime.now(timezone.utc)-timedelta(minutes=3)).isoformat()
    if falha=='duplicado':d['pedidos']*=2
    if falha=='ausente':d['pedidos']=[]
    if falha=='tipo':d['pedidos'][0]['impresso']='true'
    if falha=='vazio':d['pedidos'][0]['modelos']=[]
    if falha=='id':d['pedidos'][0]['modelos']=['../x']
    with pytest.raises(ValueError): validar_recibo(d,'teste',['99'])


def test_ciclo_usa_confirmacao_atual_e_falha_de_rede_preserva(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    tempo=[0];r=RetencaoCache(s,controle=ControleProducao(),spool_livre=lambda:True,relogio=lambda:tempo[0])
    def chamar(acao, corpo):
        assert acao=='estado-cache' and corpo=={'empresa':'teste','pedidos':['99']}
        raise OSError('sem rede')
    with pytest.raises(OSError):r.ciclo(SimpleNamespace(chamar=chamar))
    assert registros(s) and s.copias_presentes('10')
    tempo[0]=61
    r.ciclo(SimpleNamespace(chamar=lambda *_:recibo()))
    assert not s.pedidos_locais() and r.estado['modelos']==1


def test_checkpoint_de_download_nao_bloqueia_leitura_nem_e_removido(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    m = s.copias_presentes('10')[0]
    entrou = threading.Event(); sair = threading.Event(); erros = []
    def checkpoint(): entrou.set(); assert sair.wait(3)
    def consultar():
        try: s.local.consultar('teste','10',m['revisao'],checkpoint=checkpoint)
        except BaseException as e: erros.append(e)
    t=threading.Thread(target=consultar);t.start();assert entrou.wait(2)
    try:
        assert limpar(s)['adiado']
        assert s.local.ler_recurso('teste','10',m['revisao'],'frente') == BYTES
    finally: sair.set();t.join(3)
    assert not erros and not t.is_alive() and s.local._cache_em_uso == 0


def test_link_fora_do_cache_impede_exclusao_e_preserva_referencias(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    arquivo = next(s.local._pasta('teste').glob('objetos/*'))
    externo = tmp_path / 'original-nao-cache.pdf';externo.write_bytes(BYTES)
    arquivo.unlink()
    try: arquivo.symlink_to(externo)
    except OSError: pytest.skip('Criacao de symlink indisponivel nesta conta')
    with pytest.raises(ValueError, match='links'): limpar(s)
    assert externo.read_bytes() == BYTES and registros(s)
    assert CacheRevisaoPedido(s).obter('99')


def test_journal_incompativel_preserva_cache(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    con=s._db();con.execute('PRAGMA journal_mode=WAL');con.close()
    with pytest.raises(ValueError,match='transacional'): limpar(s)
    assert registros(s) and s.copias_presentes('10')


def test_limpeza_nao_disputa_lock_com_sincronizacao_de_status(tmp_path):
    s, _, _, _ = preparado(tmp_path)
    entrou=threading.Event();sair=threading.Event();controle=ControleProducao()
    def sincronizando():
        with s.offline._confirmacoes_lock:
            entrou.set();sair.wait(3)
            s.preparador.resumo()
    t=threading.Thread(target=sincronizando);t.start();assert entrou.wait(2)
    try: assert limpar(s,controle=controle)['adiado'] and not controle.ocupado()
    finally: sair.set();t.join(3)
    assert not t.is_alive() and registros(s)


def test_cursor_em_lotes_nao_deixa_pedidos_antigos_sem_verificacao(tmp_path):
    from test_catalogo_revisoes import servico
    s=servico(tmp_path);s.offline=OfflineEstacao(s,SelecaoPiloto(s))
    con=s._db()
    con.executemany('INSERT INTO modelos_pedidos VALUES (?,?)', ((str(n),str(n)) for n in range(100,165)))
    con.commit();con.close()
    tempo=[0];lotes=[]
    def chamar(_,corpo):
        lotes.append(corpo['pedidos'])
        return {'empresa':'teste','conferido_em':datetime.now(timezone.utc).isoformat(),
                'pedidos':[{'pedido':p,'impresso':False,'modelos':[p]} for p in corpo['pedidos']]}
    r=RetencaoCache(s,controle=ControleProducao(),spool_livre=lambda:True,relogio=lambda:tempo[0])
    for n in range(3):tempo[0]=n*61;r.ciclo(SimpleNamespace(chamar=chamar))
    assert all(len(lote)<=32 for lote in lotes)
    assert set().union(*map(set,lotes)) == {str(n) for n in range(100,165)}


def test_ciclo_offline_nao_reabre_pedido_retirado_do_cache(tmp_path, monkeypatch):
    s, _, _, _ = preparado(tmp_path)
    s.offline.tentativas['99']=1;s.offline.falhas['99']='anterior'
    limpar(s)
    assert '99' not in s.offline.tentativas and '99' not in s.offline.falhas
    for nome in ('sincronizar_lista','sincronizar_confirmacoes','sincronizar_faixas','sincronizar_catalogos'):
        monkeypatch.setattr(s.offline,nome,lambda *a,**kw:None)
    def proibido(*a,**kw):raise AssertionError('Pedido impresso nao deve ser preparado automaticamente')
    monkeypatch.setattr(s.offline.selecao,'abrir_pedido',proibido)
    s.offline.ciclo()
