import ast
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
import gestao_estacoes as g
import gestao_estacoes_api as api


@pytest.fixture
def historico(tmp_path, monkeypatch):
    h=g.Historico(tmp_path/'gestao')
    monkeypatch.setattr(g,'_historico',h)
    return h


def test_envio_e_fim_de_fila_nao_confirmam_papel(historico):
    ident=historico.iniciar('impressora','windows')
    historico.transicao(ident,'enviado',spool_id=12)
    historico.reconciliar({'disponivel':False,'trabalhos':[]})
    assert historico.relatorio()['trabalhos'][0]['estado']=='enviado'
    historico.reconciliar({'disponivel':True,'trabalhos':[]})
    assert historico.relatorio()['trabalhos'][0]['estado']=='incerto'
    historico.transicao(ident,'conferido')
    historico.transicao(ident,'incerto')
    assert historico.relatorio()['trabalhos'][0]['estado']=='conferido'


def test_reinicio_preserva_tentativa_incerta(historico):
    ident=historico.iniciar('p','windows')
    historico.transicao(ident,'envio_iniciado',spool_id=2)
    g.Historico(historico.raiz).recuperar()
    assert historico.relatorio()['trabalhos'][0]['estado']=='incerto'


def test_id_reciclado_nao_atualiza_trabalho(historico):
    ident=historico.iniciar('p','windows')
    historico.transicao(ident,'enviado',spool_id=2)
    historico.reconciliar({'disponivel':True,'trabalhos':[{'impressora':'p','spool_id':2,'estado':'imprimindo','criado':'2020-01-01T00:00:00+00:00'}]})
    assert historico.relatorio()['trabalhos'][0]['estado']=='incerto'


def test_falha_depois_de_abrir_spool_proibe_repeticao(historico):
    with pytest.raises(OSError):
        with g.acompanhar_envio('p') as ident:
            g.spool_iniciado(12)
            assert not g.envio_pode_repetir()
            raise OSError('falha sintetica')
    assert historico.relatorio()['trabalhos'][0]['estado']=='incerto'


@pytest.mark.parametrize('texto',['Authorization: Bearer secreto','{"password": "segredo"}','token=123','senha SMTP secreta','https://x.invalid/?key=123','eyJaaaa.bbbbb.ccccc'])
def test_segredos_nao_entram_nos_logs(texto):
    saida=g.texto_seguro(texto)
    assert 'secreto' not in saida and '123' not in saida and 'eyJaaaa' not in saida and 'segredo' not in saida


def test_exportacao_neutraliza_formula():
    assert "'=cmd" in g.csv_relatorio([{'valor':'=cmd'}])


def test_reenvio_mesma_tentativa_nao_duplica_e_nao_troca_destino(historico):
    chave='tentativa-sintetica-123'
    ident=historico.iniciar('p','windows','a'*64,chave)
    historico.transicao(ident,'enviado',spool_id=1)
    with pytest.raises(g.EnvioRepetido) as r:historico.iniciar('p','windows','a'*64,chave)
    assert r.value.trabalho==ident and r.value.estado=='enviado'
    with pytest.raises(ValueError):historico.iniciar('outra','windows','a'*64,chave)
    assert len(historico.relatorio()['trabalhos'])==1


def test_logs_rotacionam_e_nao_sobrescrevem_no_reinicio(tmp_path):
    import logging
    from logs_estacao import instalar
    logger=logging.getLogger('newprod.estacao')
    for handler in list(logger.handlers): handler.close();logger.removeHandler(handler)
    saida=instalar(tmp_path)
    logger.handlers[0].maxBytes=100
    saida.write('primeiro registro\n');saida.flush()
    instalar(tmp_path).write('segundo registro\n')
    assert 'primeiro' in (tmp_path/'agent.log').read_text()
    for _ in range(10):saida.write('evento sintetico de impressao\n')
    assert (tmp_path/'agent.log.1').is_file()
    for handler in list(logger.handlers):handler.close();logger.removeHandler(handler)


def test_relatorio_paginado_e_metricas(historico):
    for _ in range(3): historico.evento('teste')
    pagina=historico.relatorio(limite=2)
    proxima=historico.relatorio(limite=2,antes=pagina['proximo_evento'])
    assert len(pagina['eventos'])==2 and len(proxima['eventos'])==1
    with pytest.raises(ValueError):historico.relatorio(dias=999)
    historico.amostra({'disco_temp_livre_bytes':100})
    assert historico.relatorio()['amostras'][0]['dados']['disco_temp_livre_bytes']==100


def test_heartbeat_publico_nao_inclui_logs_ou_trabalhos(historico,monkeypatch):
    ident=historico.iniciar('impressora privada','windows')
    historico.evento('falha','erro',trabalho=ident)
    r=g.resumo_publico()
    assert r['erros_24h']==1 and r['totais_30d'][0]['quantidade']==1
    assert ident not in json.dumps(r) and 'impressora privada' not in json.dumps(r)


def test_heartbeat_piloto_independente_da_fila(historico):
    from datetime import datetime, timezone
    import datetime as dt
    tree=ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sync_heartbeat')
    capturados=[]
    contexto=dict(PILOTO=True,AGENT_ID='piloto-id',AGENT_NAME='PC-TESTE',datetime=dt,
        print_service=SimpleNamespace(get_printers=lambda:[],get_printer_capabilities=lambda _:{}),
        versao_do_painel=lambda:{},get_local_ip=lambda:'127.0.0.1',_acesso_base=lambda:'',diagnostico_fontes=lambda:{},
        temp_manager=SimpleNamespace(diagnostico=lambda:{}),diagnostico_impressao=lambda:{},ultimo_update=lambda:{},
        _gravar_heartbeat=lambda p,c,n:capturados.append(p))
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'heartbeat','exec'),contexto)
    contexto['sync_heartbeat']()
    assert capturados[0]['name']=='PC-TESTE [Piloto]'
    assert capturados[0]['printers_json']['recebe_fila_remota'] is False


def test_permissoes_gestao_exigem_administracao():
    from autorizacao_local import autorizar
    from fastapi import HTTPException
    with pytest.raises(HTTPException):autorizar({'permissoes':{'perm_imprimir':True}},'POST','/api/gestao-estacoes/fila')
    autorizar({'permissoes':{'perm_admin_view':True}},'GET','/api/gestao-estacoes/relatorio')
    with pytest.raises(HTTPException):autorizar({'permissoes':{'perm_admin_view':True}},'POST','/api/gestao-estacoes/limpeza')


def test_rotas_recusam_reenvio_cancelamento_e_corpo_excessivo(historico):
    app=FastAPI();app.include_router(api.router)
    @app.middleware('http')
    async def identidade(request,call_next):
        request.state.operador={'uid':'operador-sintetico'}
        return await call_next(request)
    with TestClient(app) as c:
        assert c.post('/api/gestao-estacoes/fila',json={'acao':'cancelar','confirmacao':True}).status_code==422
        assert c.post('/api/gestao-estacoes/fila',content=b'x'*8193).status_code==413
        assert c.post('/api/gestao-estacoes/conferir',json={'trabalho':'ausente','resultado':'conferido','confirmacao':True}).status_code==409
        assert c.get('/api/gestao-estacoes/relatorio?dias=900').status_code==422


def test_backup_cifrado_verificado_sintetico(tmp_path):
    from backup_gestao import executar, restaurar
    raiz=tmp_path/'estacao';raiz.mkdir();inst=tmp_path/'inst';inst.mkdir()
    (inst/'formats_db.json').write_text('{"sintetico":true}')
    result=executar(raiz,inst,proteger=lambda t,p:{'teste':t},recuperar=lambda e,p:e['teste'])
    assert result['verificado'] and result['arquivos']==1
    assert result['copia_externa_confirmada'] is False
    data=(raiz/'gestao/backups'/result['arquivo']).read_bytes()
    assert b'sintetico' not in data
    destino=tmp_path/'recuperado'
    r=restaurar(raiz/'gestao/backups'/result['arquivo'],raiz/'gestao/backup-chave.dpapi',destino,recuperar=lambda e,p:e['teste'])
    assert r['aplicado_na_estacao'] is False
    assert (destino/'instalacao/formats_db.json').read_text()=='{"sintetico":true}'
    with pytest.raises(ValueError,match='pasta nova'):
        restaurar(raiz/'gestao/backups'/result['arquivo'],raiz/'gestao/backup-chave.dpapi',destino)
