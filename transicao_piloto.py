"""Handoff inicial do Piloto legado, executado localmente pelo MSI autorizado."""
import json
from pathlib import Path
import time
import urllib.request


def consultar(token, rota, post=False):
    req=urllib.request.Request('http://127.0.0.1:9001'+rota,
        headers={'X-NewProd-Piloto':token},data=b'' if post else None)
    abrir=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    with abrir(req,timeout=10) as r:
        raw=r.read(4*1024**2+1)
    if len(raw)>4*1024**2:raise ValueError('Estado local excede limite')
    return json.loads(raw)


def ocioso(estado, spool):
    fila=estado.get('fila',{})
    return (fila.get('ocupado') is False and fila.get('ativo') is False
            and spool.get('disponivel') is True and not spool.get('trabalhos'))


def restaurar_pausa(raiz, pausado):
    from pacotes_api import ServicoPacotes
    ServicoPacotes(raiz/'dados',host='vwbtitjlpelrcnsytzqw.supabase.co',empresa='Ingresso Ideal').pausar(pausado)


def encerrar_exato(exe):
    import win32api,win32con,win32process
    handles=[]
    try:
        for pid in win32process.EnumProcesses():
            if not pid:continue
            h=None
            try:
                h=win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION|win32con.PROCESS_VM_READ|win32con.PROCESS_TERMINATE,False,pid)
                caminho=win32process.GetModuleFileNameEx(h,0)
                if Path(caminho)==exe:
                    handles.append(h);h=None
            except Exception:
                pass
            finally:
                if h:h.Close()
        if not handles:raise ValueError('Processo do Piloto nao identificado; migracao adiada')
        for h in handles:win32api.TerminateProcess(h,0)
    finally:
        for h in handles:h.Close()


def preparar(base, *, api=consultar, spool=None, parar=encerrar_exato, esperar=time.sleep,
             restaurar=restaurar_pausa):
    from piloto_instalacao import sem_links,sha,token_local
    from gestao_estacoes import spool_do_windows
    import socket
    base=sem_links(base)
    if (base/'NewProd Agent'/'perfil-oficial.json').exists():return False
    raiz=sem_links(base/'NewProd Piloto');manifesto=sem_links(raiz/'versao-ativa.json')
    if not manifesto.exists():return False
    with socket.socket() as s:
        s.settimeout(1)
        if s.connect_ex(('127.0.0.1',9001))!=0:return False
    ativo=json.loads(manifesto.read_text(encoding='utf-8-sig'))
    relativo=Path(ativo['executavel'])
    if relativo.is_absolute() or '..' in relativo.parts:raise ValueError('Runtime fora da conta')
    exe=sem_links(raiz/relativo)
    if exe.name!='NewProdPiloto.exe' or not exe.is_relative_to(raiz/'versoes') or sha(exe)!=ativo['sha256']:
        raise ValueError('Runtime do Piloto divergente')
    if not (raiz/'token-local.dpapi').is_file():raise ValueError('Token anterior ausente')
    token=token_local(raiz)
    v=api(token,'/api/version')
    if v.get('canal')!='piloto' or v.get('version')!='NewProd '+ativo['versao']:
        raise ValueError('Outro processo ocupa o painel; migracao adiada')
    spool=spool or spool_do_windows
    anterior=api(token,'/api/pacotes-locais/estado')
    if not ocioso(anterior,spool()):raise ValueError('Piloto ocupado; migracao adiada')
    pausado=anterior['fila'].get('pausado')
    if type(pausado) is not bool:raise ValueError('Estado de pausa desconhecido')
    fechado=False
    try:
        api(token,'/api/pacotes-locais/pausa/true',True)
        # A versao legada nao oferece reserva atomica entre processos. Requer
        # duas observacoes ociosas e fila vazia; nao cancela qualquer job.
        for _ in range(2):
            esperar(5)
            if not ocioso(api(token,'/api/pacotes-locais/estado'),spool()):
                raise ValueError('Atividade detectada; migracao adiada')
        parar(exe);fechado=True;esperar(2)
        # O produto novo conserva a preferencia de coleta anterior.
        restaurar(raiz,pausado)
        return True
    finally:
        if not fechado and not pausado:
            try:api(token,'/api/pacotes-locais/pausa/false',True)
            except Exception:pass
