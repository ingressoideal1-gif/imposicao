"""Transporte HTTP real e Chromium; apenas a fila fisica e substituida."""
import ast
import json
from pathlib import Path
import socket
import subprocess
import threading
import time
from types import SimpleNamespace

import pytest
import uvicorn
from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse

from engine import ImpositionConfig, ImpositionEngine
import impressao_autonoma
from impressao_autonoma_api import router


def test_browser_fechado_nao_interrompe_capas_ou_miolo(tmp_path,monkeypatch):
    import print_experimental
    import print_service
    gestor=impressao_autonoma.Trabalhos(tmp_path/'jobs.sqlite')
    monkeypatch.setattr(impressao_autonoma,'_instancia',gestor)
    monkeypatch.setattr(print_service,'HAS_WIN32',True)
    chamadas=[]
    def spool(printer,path,options):
        chamadas.append(options['gestao_envio_id'])
        time.sleep(.4)
        return {'status':'success'}
    monkeypatch.setattr(print_experimental,'enviar',spool)
    tree=ast.parse(Path('app.py').read_text(encoding='utf-8'))
    impose=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='impose_file')
    ramo=next(n for n in ast.walk(impose) if isinstance(n,ast.If) and "data.get('impressao_autonoma')" in ast.unparse(n.test))
    fn=ast.AsyncFunctionDef(name='aceitar',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=ramo.body,decorator_list=[])
    compiled=compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),'app.py:autonomo','exec')
    app=FastAPI();app.include_router(router)
    @app.get('/')
    def home():return HTMLResponse('<button id="btn-cancel-imposition">Cancelar</button>')
    @app.get('/api/version')
    def version():return {'capabilities':['impressao_autonoma_v1']}
    @app.post('/api/impose')
    async def iniciar(request:Request):
        data=json.loads((await request.form())['payload'])
        request.state.operador={'permissoes':{'perm_imprimir':True}}
        config=ImpositionConfig(base_file='',out_pdf=str(tmp_path/(data['integridade']['job_id']+'.pdf')),
            formato={'width_mm':100,'height_mm':50,'cols':2,'rows':2,'has_cover':True},
            saida={'width_mm':300,'height_mm':300},numeracao={'tipo':'SEQUENCIAL','elements':[]},
            seq_start=1,seq_end=212,sheets_per_block=50,layout_schema='cut_stack',
            cut_stack_mode='strict_assembly',print_mode='duplex',limite_paginas_envio=10,
            refazer_capas=data['refazer_capas'],refazer_set_ate=2 if data['refazer_capas'] else None)
        ctx=dict(request=request,data=data,config=config,temporarios=SimpleNamespace(close=lambda:None),
            resolver_local=None,ImpositionEngine=ImpositionEngine,_publicar_faixa_qr_ideal=lambda *a:None,
            JSONResponse=JSONResponse)
        exec(compiled,ctx)
        return await ctx['aceitar']()
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    server=uvicorn.Server(uvicorn.Config(app,log_level='error',access_log=False))
    thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True);thread.start()
    try:
        for _ in range(100):
            if server.started:break
            time.sleep(.05)
        assert server.started
        result=subprocess.run(['node','tests/impressao_autonoma_browser.cjs',f'http://127.0.0.1:{port}'],
                              capture_output=True,text=True,encoding='utf-8',timeout=60)
        assert result.returncode==0,result.stdout+result.stderr
        assert len(chamadas)==18 and len(set(chamadas))==18
        assert all(not t.is_alive() for t in gestor.threads.values())
    finally:
        server.should_exit=True;thread.join(10);sock.close()
