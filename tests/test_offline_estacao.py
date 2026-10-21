import json
import uuid
from types import SimpleNamespace
import pytest
from offline_estacao import OfflineEstacao
from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2
from conferencia_piloto import ConexaoPilotoIndisponivel


def ambiente(tmp_path):
    s,e,itens,snapshot=ambiente_v2(tmp_path)
    p=SelecaoPiloto(s);o=OfflineEstacao(s,p)
    s.pedidos_locais=lambda:['99']
    chamadas=[]
    def chamar(acao,corpo):
        chamadas.append(acao)
        if acao=='lista-offline': return {'empresa':'teste','revisao':'c'*64,'sem_mudanca':False,'lista':{k:[] for k in ('pedidos','origens','modelos','prazos','produtos','artes')}}
        if acao=='catalogos-offline': return {'empresa':'teste',**{k:[] for k in ('formatos','saidas','cores','modelos_imposicao')}}
        return {'id':corpo['id'],'estado':'sincronizado'}
    s.coleta_autonoma.cliente.chamar=chamar
    return s,e,p,o,chamadas


def test_prepara_sem_navegador_e_conferencia_sobrevive_reinicio(tmp_path):
    s,e,p,o,chamadas=ambiente(tmp_path)
    o.ciclo()
    assert e['downloads']==2
    local=OfflineEstacao(s,SelecaoPiloto(s))
    assert len(local.bootstrap()['pedidos'])==1
    assert local.conferir([{'pedido':'99','revisao':'a'*64}])['pedidos'][0]['execucao_offline']
    assert chamadas==['lista-offline','catalogos-offline']
    with pytest.raises(ValueError): local.conferir([{'pedido':'99','revisao':'b'*64}])


def test_abertura_atualiza_catalogo_recente_sem_mudanca_no_pedido(tmp_path):
    s, _, _, o, chamadas = ambiente(tmp_path)
    o.ciclo()
    novo = {'empresa':'teste', 'formatos':[{'id':'f', 'height_mm':480}],
            'saidas':[{'id':'s', 'name':'Cartaz'}], 'cores':[], 'modelos_imposicao':[]}
    s.coleta_autonoma.cliente.chamar = lambda *_: dict(novo)
    assert o.sincronizar_catalogos(s.coleta_autonoma.cliente)['formatos'] == []
    assert o.catalogos_para_pedido({'execucao_offline':False})['formatos'] == novo['formatos']
    assert OfflineEstacao(s, SelecaoPiloto(s)).catalogos()['saidas'] == novo['saidas']
    def sem_rede(*_): raise AssertionError('Abertura offline nao consulta rede')
    s.coleta_autonoma.cliente.chamar = sem_rede
    assert o.catalogos_para_pedido({'execucao_offline':True})['saidas'] == novo['saidas']


def test_catalogo_invalido_ou_recusa_preserva_copia_sem_liberar_abertura_online(tmp_path):
    s, _, _, o, _ = ambiente(tmp_path)
    o.ciclo(); anterior = o.catalogos()
    s.coleta_autonoma.cliente.chamar = lambda *_: {'empresa':'outra'}
    with pytest.raises(ValueError): o.catalogos_para_pedido({'execucao_offline':False})
    assert o.catalogos() == anterior
    from conferencia_piloto import ConferenciaIndisponivel
    def negado(*_): raise ConferenciaIndisponivel('403')
    s.coleta_autonoma.cliente.chamar = negado
    with pytest.raises(ConferenciaIndisponivel): o.catalogos_para_pedido({'execucao_offline':False})
    assert o.catalogos() == anterior


def test_lista_completa_sem_arquivos_preservada_apos_falha_e_reinicio(tmp_path):
    s,_,_,o,_=ambiente(tmp_path)
    lista={k:[] for k in ('pedidos','origens','modelos','prazos','produtos','artes')}
    lista['pedidos']=[{'id_int':n,'cliente_exibicao':'Cliente','id_cliente':10} for n in range(65)]
    cliente=SimpleNamespace(chamar=lambda *_:{'empresa':'teste','revisao':'c'*64,'sem_mudanca':False,'lista':lista})
    o.sincronizar_lista(cliente)
    novo=OfflineEstacao(s,SelecaoPiloto(s))
    assert len(novo.bootstrap()['lista']['lista']['pedidos'])==65
    assert novo.bootstrap()['pedidos']==[]
    cliente.chamar=lambda *_:{'empresa':'teste','revisao':'d'*64,'sem_mudanca':False,'lista':{}}
    with pytest.raises(ValueError):novo.sincronizar_lista(cliente)
    assert novo.lista()['lista']==lista
    novo.proxima_lista=0
    cliente.chamar=lambda *_:{'empresa':'teste','revisao':'c'*64,'sem_mudanca':True}
    novo.sincronizar_lista(cliente)
    assert novo.lista()['lista']==lista


def test_confirmacao_duravel_idempotente_sem_spool_e_reconexao(tmp_path):
    s,e,p,o,_=ambiente(tmp_path);o.ciclo()
    dados={'id':str(uuid.uuid4()),'pedido':'99','revisao':'a'*64,'modelos':['10','11']}
    o.confirmar(dados,'operador-local');o.confirmar(dados,'operador-local')
    assert len(o.confirmacoes())==1
    def falha(*args): raise ConexaoPilotoIndisponivel('offline')
    with pytest.raises(ConexaoPilotoIndisponivel): o.sincronizar_confirmacoes(SimpleNamespace(chamar=falha),lambda:None)
    local=OfflineEstacao(s,SelecaoPiloto(s))
    assert local.confirmacoes()[0]['estado']=='pendente'
    local.sincronizar_confirmacoes(s.coleta_autonoma.cliente,lambda:None)
    assert local.confirmacoes()[0]['estado']=='sincronizado'
    assert e['downloads']==2
    with pytest.raises(ValueError):o.confirmar(dict(dados,modelos=['500']),'operador-local')


def test_resposta_perdida_repete_mesmo_identificador(tmp_path):
    s,_,_,o,_=ambiente(tmp_path);o.ciclo()
    dados={'id':str(uuid.uuid4()),'pedido':'99','revisao':'a'*64,'modelos':['10']}
    o.confirmar(dados,'op');entregues=[]
    def enviar(acao,corpo):
        entregues.append(corpo['id'])
        if len(entregues)==1: raise ConexaoPilotoIndisponivel('resposta perdida')
        return {'id':corpo['id'],'estado':'sincronizado'}
    c=SimpleNamespace(chamar=enviar)
    with pytest.raises(ConexaoPilotoIndisponivel):o.sincronizar_confirmacoes(c,lambda:None)
    o.sincronizar_confirmacoes(c,lambda:None)
    assert entregues==[dados['id'],dados['id']]


def test_conflito_fica_visivel_sem_descartar_confirmacao(tmp_path):
    s,_,_,o,_=ambiente(tmp_path);o.ciclo()
    dados={'id':str(uuid.uuid4()),'pedido':'99','revisao':'a'*64,'modelos':['10']}
    o.confirmar(dados,'op')
    c=SimpleNamespace(chamar=lambda a,d:{'id':d['id'],'estado':'conflito'})
    o.sincronizar_confirmacoes(c,lambda:None)
    assert o.bootstrap()['confirmacoes'][0]['estado']=='conflito'


def test_faixa_fica_em_fila_apos_reinicio_e_nao_duplica(tmp_path):
    s,_,_,o,_=ambiente(tmp_path)
    job=str(uuid.uuid4());o.guardar_faixa(job,'99',{'10':{'tipo':'QR'}},[])
    o.guardar_faixa(job,'99',{'10':{'tipo':'QR'}},[])
    outro=OfflineEstacao(s,SelecaoPiloto(s))
    with outro.banco() as con:
        assert con.execute('SELECT COUNT(*) FROM offline_faixas WHERE enviado=0').fetchone()[0]==1


@pytest.mark.parametrize('status', ['Aguardando', 'Corrigir Arte'])
def test_decisao_manual_substitui_recibo_antigo_apos_reinicio(tmp_path, status):
    s,_,_,o,_=ambiente(tmp_path);o.ciclo()
    impresso={'id':str(uuid.uuid4()),'pedido':'99','revisao':'a'*64,'modelos':['10']}
    o.confirmar(impresso,'op')
    decisao={'id':str(uuid.uuid4()),'pedido':'99','modelo':'10','status':status,'acao':'iniciar'}
    o.decisao_manual(decisao,'op')
    envios=[]
    def enviar(a,d):
        envios.append(d)
        return {'id':d['id'],'estado':'sincronizado'}
    cliente=SimpleNamespace(chamar=enviar)
    o=OfflineEstacao(s,SelecaoPiloto(s))
    o.sincronizar_confirmacoes(cliente,lambda:None)
    assert envios==[], 'reserva incerta nao reenvia uma confirmacao antiga'
    o.decisao_manual({**decisao,'acao':'concluir'},'op')
    o=OfflineEstacao(s,SelecaoPiloto(s))
    o.sincronizar_confirmacoes(cliente,lambda:None)
    assert envios==[]
    assert o.confirmacoes()[0]['dados']['status']==status
    assert o.confirmacoes()[0]['estado']=='manual'
    o.confirmar({**impresso,'id':str(uuid.uuid4())},'op')
    o.sincronizar_confirmacoes(cliente,lambda:None)
    assert len(envios)==1, 'nova impressao deliberada volta a sincronizar'


def test_reserva_manual_espera_envio_em_andamento(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    s,_,_,o,_=ambiente(tmp_path);o.ciclo()
    o.confirmar({'id':str(uuid.uuid4()),'pedido':'99','revisao':'a'*64,'modelos':['10']},'op')
    entrou=threading.Event();liberar=threading.Event()
    def enviar(a,d):
        entrou.set();assert liberar.wait(5)
        return {'id':d['id'],'estado':'sincronizado'}
    with ThreadPoolExecutor(2) as pool:
        envio=pool.submit(o.sincronizar_confirmacoes,SimpleNamespace(chamar=enviar),lambda:None)
        assert entrou.wait(5)
        reserva=pool.submit(o.decisao_manual,{'id':str(uuid.uuid4()),'pedido':'99','modelo':'10','status':'Aguardando','acao':'iniciar'},'op')
        assert not reserva.done()
        liberar.set();envio.result(5);reserva.result(5)
    assert o.confirmacoes()[0]['estado']=='manual_pendente'


def test_decisao_manual_recusa_modelo_e_operador_divergentes(tmp_path):
    _,_,_,o,_=ambiente(tmp_path);o.ciclo()
    d={'id':str(uuid.uuid4()),'pedido':'99','modelo':'10','status':'Aguardando','acao':'iniciar'}
    with pytest.raises(ValueError):o.decisao_manual({**d,'modelo':'999'},'op')
    o.decisao_manual(d,'op')
    with pytest.raises(ValueError):o.decisao_manual({**d,'acao':'concluir'},'outro')


def test_sincronizacao_indisponivel_nao_impede_preparacao(tmp_path):
    s,e,p,o,chamadas=ambiente(tmp_path)
    def falha(*args): raise ConexaoPilotoIndisponivel('sem rede')
    o.sincronizar_confirmacoes=falha
    o.ciclo()
    assert e['downloads']==2 and o.bootstrap()['preparacao']['prontos']==1
    assert 'confirmacoes' in o.bootstrap()['preparacao']['pendencias']


def test_dependencia_com_hash_persistida_e_corrupcao_recusada(tmp_path):
    import hashlib
    s,_,_,o,_=ambiente(tmp_path)
    with o.banco() as con:
        con.execute('INSERT INTO offline_dependencias VALUES (?,?,?)',('https://test.invalid/f.ttf',hashlib.sha256(b'font').hexdigest(),b'font'))
    outro=OfflineEstacao(s,SelecaoPiloto(s))
    assert outro.ler_dependencia('https://test.invalid/f.ttf')==b'font'
    assert outro.ler_dependencia('https://test.invalid/ausente.ttf') is None
    with o.banco() as con:
        con.execute('UPDATE offline_dependencias SET dados=?',(b'corrompido',))
    with pytest.raises(ValueError):outro.ler_dependencia('https://test.invalid/f.ttf')


def test_reenvio_faixa_recupera_ids_inteiros_apos_json(tmp_path,monkeypatch):
    import acesso_publicacao
    s,_,_,o,_=ambiente(tmp_path)
    o.guardar_faixa(str(uuid.uuid4()),'99',{10:{'tipo':'QR'}},[])
    chamadas=[]
    def publicar(pedido,pool,numeracoes):
        assert numeracoes.get(10)=={'tipo':'QR'} and pedido==99 and pool is None
        chamadas.append(1)
        return {'completo':True,'enviadas':30}
    monkeypatch.setattr(acesso_publicacao,'publicar',publicar)
    outro=OfflineEstacao(s,SelecaoPiloto(s))
    outro.sincronizar_faixas(lambda:None);outro.sincronizar_faixas(lambda:None)
    assert chamadas==[1]


def test_prepara_comic_e_estilos_com_as_mesmas_chaves_do_motor(tmp_path, monkeypatch):
    import db
    import font_cache
    import fontes_sistema
    import socket
    import ast
    import base64
    from pathlib import Path
    s, _, _, offline, _ = ambiente(tmp_path)
    base = 'https://' + s.host + '/storage/v1/object/public/fontes/'
    catalogo = [{'nome':n, 'font_family':n, 'arquivo_url':base+n+'.ttf'}
                for n in ['arial', 'arialbd', 'comic', 'comicbd', 'comici']]
    monkeypatch.setattr(db, 'get_catalogo_fontes', lambda: catalogo)
    monkeypatch.setattr(fontes_sistema, '_fontes_instaladas', lambda: {
        ('arial', True, False):'arialbd.ttf',
        ('comic sans ms', False, False):'comic.ttf',
        ('comic sans ms', True, False):'comicbd.ttf',
        ('comic sans ms', False, True):'comici.ttf',
    })
    def proibido(*a, **kw): raise AssertionError('Rede proibida')
    monkeypatch.setattr(socket.socket, 'connect', proibido)
    baixadas=[]
    def baixar(url):
        baixadas.append(url)
        return ('fonte-sintetica:'+url).encode()
    monkeypatch.setattr(font_cache, 'obter_bytes', baixar)
    elementos=[{'font_name':'system:Arial|bold'},
               {'font_name':'system:Comic Sans MS'},
               {'font_name':'system:Comic Sans MS|bold'},
               {'font_name':'system:Comic Sans MS', 'font_style':'italic'},
               {'font_name':'system:Comic Sans MS', 'bold':True},
               {'font_name':'Custom', 'font_url':base+'custom.ttf'}]
    offline.preparar_dependencias('99', {'numeracoes':[{'elements':elementos}]})
    assert set(baixadas)=={base+n+'.ttf' for n in ['arialbd','comic','comicbd','comici','custom']}
    assert len(baixadas)==5
    # Executa a incorporacao real sem importar a aplicacao/servicos.
    tree=ast.parse((Path(__file__).parents[1]/'app.py').read_text(encoding='utf-8-sig'))
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_embed_system_fonts')
    ns={'db':db, '_fontes_instaladas':fontes_sistema._fontes_instaladas,
        '_chaves_de_fonte':fontes_sistema._chaves_de_fonte}
    exec(compile(ast.Module(body=[node],type_ignores=[]),'app.py','exec'),ns)
    ns['_embed_system_fonts']({'elements':elementos},resolver_recurso=offline.ler_dependencia)
    for e in elementos:
        assert base64.b64decode(e['_font_data']).startswith(b'fonte-sintetica:')
    reinicio=OfflineEstacao(s, offline.selecao)
    assert all(reinicio.ler_dependencia(u) is not None for u in baixadas)
