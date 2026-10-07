"""Rotas administrativas locais; identidade e permissao exigidas pelo app."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from fastapi import APIRouter, HTTPException, Request, Response
from gestao_estacoes import historico, snapshot, spool_do_windows, csv_relatorio, agora

router = APIRouter(prefix='/api/gestao-estacoes')


def operador(request):
    o = getattr(request.state, 'operador', None)
    if not o: raise HTTPException(401, 'Identifique o operador.')
    return o.get('uid') or o.get('id') or 'operador-local'


@router.get('/resumo')
def resumo():
    from canais_newprod import CANAL, PORTA
    from newprod_temp import diagnostico
    from agent_version import AGENT_VERSION
    from controle_producao import controle
    dados=snapshot()
    dados.update(versao=AGENT_VERSION, canal=CANAL, porta=PORTA,
                armazenamento=dados.get('armazenamento') or diagnostico(), ocupado=controle.ocupado(),
                retencao_logs='6 arquivos de ate 5 MiB', retencao_metricas_dias=90,
                atualizacao='pacote proprio' if CANAL == 'piloto' else 'manifesto oficial')
    return dados


@router.get('/relatorio')
def relatorio(dias: int=7, limite: int=500, antes: int|None=None, formato: str='json', tipo: str='trabalhos'):
    try: dados = historico().relatorio(dias, limite, antes)
    except ValueError as e: raise HTTPException(422, str(e)) from None
    if formato == 'json': return dados
    if formato != 'csv' or tipo not in ('trabalhos','eventos','totais','amostras'):
        raise HTTPException(422, 'Formato invalido')
    return Response('\ufeff'+csv_relatorio(dados[tipo]), media_type='text/csv',
                    headers={'Content-Disposition':f'attachment; filename="estacao-{tipo}.csv"'})


@router.get('/logs')
def logs():
    from canais_newprod import pasta_local
    from gestao_estacoes import texto_seguro
    path = pasta_local() / 'gestao' / 'logs' / 'agent.log'
    if not path.is_file(): return {'linhas':[], 'limite_bytes':65536}
    from pacotes_locais import _sem_links
    _sem_links(path)
    with path.open('rb') as f:
        f.seek(max(0,path.stat().st_size-65536))
        linhas = [texto_seguro(x) for x in f.read(65536).decode('utf-8',errors='replace').splitlines()[-300:]]
    return {'linhas':linhas, 'limite_bytes':65536}


@router.post('/backup')
async def backup(request: Request):
    uid=operador(request)
    d=await corpo(request)
    if d.get('confirmacao') is not True: raise HTTPException(422,'Confirme o backup local de configuracoes e historico.')
    from controle_producao import controle
    if not controle.iniciar_atualizacao(): raise HTTPException(409,'Estacao ocupada')
    try:
        import sys
        from canais_newprod import pasta_local
        from backup_gestao import executar
        from starlette.concurrency import run_in_threadpool
        result=await run_in_threadpool(executar,pasta_local(),Path(sys.executable).parent)
        historico().controle('backup',result)
        historico().evento('backup_verificado',operador=uid,quantidade=result['arquivos'],bytes=result['bytes'])
        return result
    except (OSError,ValueError):
        historico().evento('backup_falhou','erro')
        raise HTTPException(503,'Backup nao confirmado; consulte o diagnostico local.') from None
    finally: controle.cancelar_atualizacao()


@router.post('/conferir')
async def conferir(request: Request):
    uid = operador(request)
    dados = await corpo(request)
    if dados.get('resultado') not in ('conferido','cancelado') or dados.get('confirmacao') is not True:
        raise HTTPException(422,'Confirme o resultado fisico; esta acao nao cancela a fila do Windows.')
    ident = dados.get('trabalho')
    with historico().banco() as con:
        row = con.execute('SELECT estado FROM trabalhos WHERE id=?',(ident,)).fetchone()
    if not row or row['estado'] not in ('incerto','enviado','erro_fila','pausado'):
        raise HTTPException(409,'Trabalho nao elegivel para conferencia.')
    historico().transicao(ident,dados['resultado'])
    historico().evento('conferencia_operador', trabalho=ident, operador=uid, estado=dados['resultado'])
    return {'ok':True}


async def corpo(request):
    total = bytearray()
    async for parte in request.stream():
        total.extend(parte)
        if len(total) > 8192: raise HTTPException(413,'Corpo excede limite')
    try:
        result = json.loads(total)
        if not isinstance(result,dict): raise ValueError()
        return result
    except (ValueError,TypeError): raise HTTPException(422,'JSON invalido') from None


def assinatura_spool(job):
    return hashlib.sha256(json.dumps({k:job.get(k) for k in ('impressora','spool_id','criado')},sort_keys=True).encode()).hexdigest()


@router.get('/fila')
def fila():
    s = spool_do_windows()
    for j in s['trabalhos']: j['assinatura'] = assinatura_spool(j)
    return s


@router.post('/fila')
async def controlar_fila(request: Request):
    uid = operador(request)
    d = await corpo(request)
    if d.get('acao') not in ('pausar','retomar') or d.get('confirmacao') is not True:
        raise HTTPException(422,'Somente pausa ou retomada explicita; nao ha cancelamento ou reenvio automatico.')
    s = spool_do_windows()
    if not s['disponivel']: raise HTTPException(503,'Fila indisponivel')
    j = next((j for j in s['trabalhos'] if j['impressora']==d.get('impressora') and j['spool_id']==d.get('spool_id')),None)
    if not j or assinatura_spool(j)!=d.get('assinatura'): raise HTTPException(409,'Trabalho mudou; atualize a fila.')
    import win32print
    h=win32print.OpenPrinter(j['impressora'])
    try:
        # Revalida sob o handle usado na mutacao; protege reutilizacao do ID.
        atual=win32print.GetJob(h,j['spool_id'],1)
        if str(atual.get('Submitted') or '') != j['criado']: raise HTTPException(409,'Trabalho mudou')
        win32print.SetJob(h,j['spool_id'],0,None,win32print.JOB_CONTROL_PAUSE if d['acao']=='pausar' else win32print.JOB_CONTROL_RESUME)
    finally: win32print.ClosePrinter(h)
    historico().evento('fila_'+d['acao'], operador=uid, spool_id=j['spool_id'])
    return {'ok':True, 'impressao_fisica_confirmada':False}


@router.get('/limpeza')
def previa_limpeza():
    from newprod_temp import pasta_raiz, RETENCAO_SEGUNDOS, _JOB, _sem_links, MARCADOR
    raiz = pasta_raiz()
    candidatos=[]
    if raiz.exists():
        if not _sem_links(raiz): raise HTTPException(409,'Raiz temporaria invalida')
        for pasta in raiz.iterdir():
            marcador=pasta/'.owner.lock'
            try:
                if (_JOB.fullmatch(pasta.name) and _sem_links(marcador) and marcador.is_file()
                        and time.time()-marcador.stat().st_mtime >= RETENCAO_SEGUNDOS):
                    with marcador.open('rb') as f:
                        if f.read(len(MARCADOR)+1)==MARCADOR: candidatos.append(pasta.name)
            except OSError: continue
    return {'raiz':str(raiz), 'candidatos':candidatos, 'exige_trava_livre':True,
            'exclui_cache_versoes_spool':False, 'descricao':'Somente temporarios gerenciados abandonados por pelo menos 24 horas.'}


@router.post('/limpeza')
async def limpeza(request: Request):
    uid=operador(request)
    d=await corpo(request)
    from controle_producao import controle
    if d.get('confirmacao') is not True: raise HTTPException(422,'Confirme a previa da limpeza.')
    if not controle.iniciar_atualizacao(): raise HTTPException(409,'Estacao ocupada')
    try:
        from newprod_temp import limpar_abandonados
        result=limpar_abandonados()
        historico().controle('manutencao',dict(quando=agora(),tipo='temporarios',resultado=result))
        historico().evento('limpeza_gerenciada',operador=uid)
        return result
    finally: controle.cancelar_atualizacao()
