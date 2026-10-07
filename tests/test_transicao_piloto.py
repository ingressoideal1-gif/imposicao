import json
import socket
from types import SimpleNamespace
import pytest
import transicao_piloto as t


@pytest.fixture
def ambiente(tmp_path,monkeypatch):
    from piloto_instalacao import sha
    raiz=tmp_path/'NewProd Piloto';exe=raiz/'versoes'/'v30'/'NewProdPiloto.exe'
    exe.parent.mkdir(parents=True);exe.write_bytes(b'sintetico')
    (raiz/'versao-ativa.json').write_text(json.dumps(dict(executavel=str(exe.relative_to(raiz)),sha256=sha(exe),versao='1.2.363-piloto-local.30')))
    (raiz/'token-local.dpapi').write_text('sintetico')
    monkeypatch.setattr('piloto_instalacao.token_local',lambda _: 'sintetico')
    class Conexao:
        def __enter__(self):return self
        def __exit__(self,*_):pass
        def settimeout(self,*_):pass
        def connect_ex(self,*_):return 0
    monkeypatch.setattr(socket,'socket',Conexao)
    estado={'fila':{'ocupado':False,'ativo':False,'pausado':False}}
    chamadas=[]
    def api(token,rota,post=False):
        chamadas.append(rota)
        if rota=='/api/version':return {'canal':'piloto','version':'NewProd 1.2.363-piloto-local.30'}
        return estado
    op=dict(api=api,spool=lambda:{'disponivel':True,'trabalhos':[]},parar=lambda e:chamadas.append(('parar',e)),esperar=lambda _:None,restaurar=lambda r,p:chamadas.append(('pausa',p)))
    return tmp_path,exe,estado,chamadas,op


def test_migracao_ociosa_preserva_preferencia_e_nao_cancela_spool(ambiente):
    base,exe,estado,chamadas,op=ambiente
    assert t.preparar(base,**op)
    assert chamadas.count('/api/pacotes-locais/estado')==3
    assert ('parar',exe) in chamadas and ('pausa',False) in chamadas


@pytest.mark.parametrize('falha',['motor','preparacao','spool','spool_indisponivel','atividade_posterior'])
def test_atividade_impede_encerramento(ambiente,falha):
    base,exe,estado,chamadas,op=ambiente
    if falha=='motor':estado['fila']['ocupado']=True
    if falha=='preparacao':estado['fila']['ativo']=True
    if falha=='spool':op['spool']=lambda:{'disponivel':True,'trabalhos':[{'id':7}]}
    if falha=='spool_indisponivel':op['spool']=lambda:{'disponivel':False,'trabalhos':[]}
    if falha=='atividade_posterior':op['esperar']=lambda _:estado['fila'].update(ocupado=True)
    with pytest.raises(ValueError):t.preparar(base,**op)
    assert not any(isinstance(c,tuple) and c[0]=='parar' for c in chamadas)
    if falha=='atividade_posterior':assert chamadas[-1]=='/api/pacotes-locais/pausa/false'


def test_preferencia_de_coleta_restaurada_pela_api_local(tmp_path):
    from pacotes_api import ServicoPacotes
    s=ServicoPacotes(tmp_path/'dados',host='vwbtitjlpelrcnsytzqw.supabase.co',empresa='Ingresso Ideal')
    s.pausar(True)
    t.restaurar_pausa(tmp_path,False)
    with s._db() as con:
        assert con.execute("SELECT valor FROM controle_piloto WHERE chave='pausado'").fetchone()[0]=='0'
