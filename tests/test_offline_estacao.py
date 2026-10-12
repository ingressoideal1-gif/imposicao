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
