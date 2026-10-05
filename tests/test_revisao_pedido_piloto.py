from copy import deepcopy
from datetime import datetime, timezone
import io
from types import SimpleNamespace

import pytest

from conferencia_piloto import ConferenciaIndisponivel
from pacotes_api import ServicoPacotes
from selecao_piloto import SelecaoPiloto
from test_antecipacao_local import candidato
from test_pacotes_api import BYTES


def ambiente(tmp_path, total=1):
    estado={'revisao':'a'*64,'consultas':0,'downloads':0,'etags':{},'bytes':{}}
    itens=[]
    for n in range(10,10+total):
        i=deepcopy(candidato());i.update(modelo=str(n),pedido='99')
        i['fontes']['frente']='https://test.invalid/storage/v1/object/public/artes/'+str(n)+'.pdf'
        i['versoes_fontes']={'frente':{'revisao':'b'*64,'etag':'etag-'+str(n)}}
        itens.append(i);estado['bytes'][str(n)]=BYTES
    def abrir(req, **kwargs):
        estado['downloads']+=1
        assert req.headers['Cache-control']=='no-cache'
        assert 'piloto_revisao=' in req.full_url
        modelo=req.full_url.split('/')[-1].split('.')[0]
        r=io.BytesIO(estado['bytes'][modelo]);r.headers={'ETag':'"'+estado['etags'].get(modelo,'etag-'+modelo)+'"'}
        if estado.get('mudou_download'):estado['revisao']='c'*64
        return r
    def conferir_pedido(pedido,revisao):
        estado['consultas']+=1
        assert pedido=='99'
        r={'empresa':'teste','pedido':pedido,'revisao':estado['revisao'],'sem_mudanca':revisao==estado['revisao'],
           'conferido_em':datetime.now(timezone.utc).isoformat(),'execucao_offline':False}
        if not r['sem_mudanca']:r['itens']=deepcopy(itens)
        if estado.get('sem_rede'):raise ConferenciaIndisponivel('sem rede')
        return r
    s=ServicoPacotes(tmp_path,host='test.invalid',empresa='teste',abrir=abrir)
    def proibido(*a,**kw):raise AssertionError('Conferencia por modelo/listagem antiga proibida')
    s.coleta_autonoma=SimpleNamespace(cliente=SimpleNamespace(conferir_pedido=conferir_pedido,listar=proibido,conferir=proibido))
    dados={'pedido':'99','modelos':[{'modelo':i['modelo'],'digest':i['observacao']['digest']} for i in itens]}
    return s,estado,itens,dados


def test_primeira_copia_e_reabertura_uma_consulta_zero_downloads_e_zero_hashes(tmp_path,monkeypatch):
    s,e,_,dados=ambiente(tmp_path,total=11);p=SelecaoPiloto(s)
    r=p.preparar_pedido(dados)
    assert e['consultas']==2 and e['downloads']==11 and r['reutilizados']==0
    def proibido(*a,**kw):raise AssertionError('Reabertura nao deve reler todos os bytes')
    import pacotes_locais
    with monkeypatch.context() as m:
        m.setattr(pacotes_locais,'_hash_arquivo',proibido)
        novo=SelecaoPiloto(s).preparar_pedido(dados)  # cache persiste no reinicio
    assert e['consultas']==3 and e['downloads']==11 and novo['reutilizados']==11
    assert [p['revisao'] for p in novo['pacotes']]==[p['revisao'] for p in r['pacotes']]


def test_alteracao_mesma_url_atualiza_so_modelo_afetado(tmp_path):
    s,e,itens,dados=ambiente(tmp_path,total=3);p=SelecaoPiloto(s);antes=p.preparar_pedido(dados)
    e['revisao']='c'*64;itens[1]['versoes_fontes']['frente']={'revisao':'d'*64,'etag':'novo'}
    e['etags']['11']='novo';e['bytes']['11']=BYTES+b'\n% nova arte'
    r=p.preparar_pedido(dados)
    assert e['downloads']==4 and r['reutilizados']==2
    assert r['pacotes'][1]['revisao']!=antes['pacotes'][1]['revisao']
    assert p.ler('11',r['pacotes'][1]['revisao'],'frente')==e['bytes']['11']


@pytest.mark.parametrize('falha',['corrida','etag','digest','sem_rede'])
def test_nao_libera_corrida_versao_incorreta_digest_ou_sem_rede(tmp_path,falha):
    s,e,itens,dados=ambiente(tmp_path)
    if falha=='corrida':e['mudou_download']=True
    if falha=='etag':e['etags']['10']='conteudo-antigo-cache'
    if falha=='digest':dados['modelos'][0]['digest']='f'*64
    if falha=='sem_rede':e['sem_rede']=True
    with pytest.raises((ValueError,ConferenciaIndisponivel)):SelecaoPiloto(s).preparar_pedido(dados)
    assert SelecaoPiloto(s)._cache.obter('99') is None


def test_corrupcao_mesmo_tamanho_detectada_na_leitura_usada_pelo_motor(tmp_path):
    s,_,_,dados=ambiente(tmp_path);p=SelecaoPiloto(s);r=p.preparar_pedido(dados)
    obj=next(s.local.raiz.rglob('objetos/*'));obj.write_bytes(b'x'*len(BYTES))
    r=p.preparar_pedido(dados)
    with pytest.raises(ValueError):p.ler('10',r['pacotes'][0]['revisao'],'frente')


def test_arquivo_ausente_reparado_antes_de_liberar(tmp_path):
    s,e,_,dados=ambiente(tmp_path);p=SelecaoPiloto(s);r=p.preparar_pedido(dados)
    next(s.local.raiz.rglob('objetos/*')).unlink()
    novo=p.preparar_pedido(dados)
    assert e['downloads']==2 and novo['reutilizados']==0
    assert p.ler('10',novo['pacotes'][0]['revisao'],'frente')==BYTES


def test_sem_versionamento_revalida_url_em_cada_abertura(tmp_path):
    s,e,itens,dados=ambiente(tmp_path);itens[0]['versoes_fontes']['frente']=None
    def abrir(req,**kwargs):
        e['downloads']+=1
        return io.BytesIO(e['bytes']['10'])
    s.preparador.armazenamento.abrir=abrir
    p=SelecaoPiloto(s);antes=p.preparar_pedido(dados)
    e['bytes']['10']=BYTES+b'\n% mudou sem revisao de Storage'
    novo=p.preparar_pedido(dados)
    assert e['downloads']==2 and e['consultas']==4 and novo['reutilizados']==0
    assert novo['pacotes'][0]['revisao']!=antes['pacotes'][0]['revisao']


def test_recibo_incorreto_expirado_e_outra_empresa_bloqueiam(tmp_path):
    from revisao_pedido_piloto import validar_recibo
    bom={'empresa':'teste','pedido':'99','revisao':'a'*64,'sem_mudanca':False,
         'conferido_em':datetime.now(timezone.utc).isoformat(),'execucao_offline':False,'itens':[]}
    for alterar in ({'empresa':'outra'},{'pedido':'100'},{'sem_mudanca':True},
                    {'conferido_em':'2020-01-01T00:00:00+00:00'},{'execucao_offline':True}):
        with pytest.raises(ConferenciaIndisponivel):validar_recibo(dict(bom,**alterar),'teste','99','')
