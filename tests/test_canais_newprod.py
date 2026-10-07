"""Regressoes de coexistencia, sem importar banco, iniciar agente ou acessar rede."""
import ast
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]

@pytest.mark.parametrize('canal,porta,nome', [
    ('producao',9000,'NewProd Agent'), ('piloto',9001,'NewProd Piloto')])
def test_canais_tem_identidade_pastas_e_portas_distintas(canal,porta,nome):
    env = {**os.environ, 'NEWPROD_CANAL':canal, 'LOCALAPPDATA':str(ROOT/'nao-criar')}
    script = ('import json,canais_newprod as c,agent_version as v,migracao_estacao as m,newprod_temp as t;'
              'print(json.dumps([c.PORTA,c.NOME,str(c.pasta_local()),v.AGENT_VERSION,str(m.pasta_dados()),str(t.pasta_raiz())]))')
    p = subprocess.run([sys.executable,'-c',script],cwd=ROOT,env=env,capture_output=True,text=True,check=True)
    resultado = json.loads(p.stdout)
    assert resultado[0:2] == [porta,nome]
    assert Path(resultado[2]).name == nome
    assert ('-piloto-local.' in resultado[3]) == (canal=='piloto')
    assert ('Piloto' in resultado[4]) == (canal=='piloto')
    assert Path(resultado[5]).parents[1] == Path(resultado[2])
    assert not (ROOT/'nao-criar').exists()

def test_piloto_nao_consumira_fila_nem_instalara_release_padrao():
    tree = ast.parse((ROOT/'agent_worker.py').read_text(encoding='utf-8'))
    nomes = {'process_queue','sincronizar_painel','verificar_atualizacao','consultar_manifesto'}
    funcoes = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in nomes]
    assert len(funcoes)==len(nomes)
    # Imports desses modulos sao de configuracao pura; qualquer acesso seguinte
    # sem a guarda do canal encontraria dependencias ausentes e reprovaria.
    env = {'PILOTO':True, 'os':os}
    exec(compile(ast.Module(body=funcoes,type_ignores=[]),'worker_isolado','exec'),env)
    for nome in nomes - {'consultar_manifesto'}:
        assert env[nome]() in (None,False)
    resultado=env['consultar_manifesto']()
    assert resultado['canal']=='piloto' and not resultado['ha_atualizacao']

def test_token_de_coleta_nao_concede_impressao_ou_administracao(monkeypatch):
    import canais_newprod
    monkeypatch.setattr(canais_newprod,'PILOTO',True)
    token='token-sintetico-do-piloto-'+'x'*40
    monkeypatch.setenv('NEWPROD_PILOTO_TOKEN',token)
    app=FastAPI()
    tree=ast.parse((ROOT/'app.py').read_text(encoding='utf-8'))
    funcoes=[n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='proteger_api_local']
    exec(compile(ast.Module(body=funcoes,type_ignores=[]),'api_isolada','exec'),
         {'app':app,'Request':Request,'HTTPException':HTTPException,'JSONResponse':JSONResponse})
    @app.get('/api/pacotes-locais/estado')
    def estado(): return {'ok':True}
    @app.post('/api/print/submit')
    def imprimir(): pytest.fail('Token de coleta liberou impressao')
    @app.get('/api/pacotes-locais/resumo-painel')
    def painel(): pytest.fail('Token de coleta liberou painel sem operador')
    with TestClient(app) as client:
        headers={'x-newprod-piloto':token}
        assert client.get('/api/pacotes-locais/estado',headers=headers).status_code==200
        assert client.get('/api/pacotes-locais/estado',headers={'x-newprod-piloto':'errado'}).status_code==401
        assert client.post('/api/print/submit',headers=headers).status_code==401
        assert client.get('/api/pacotes-locais/resumo-painel',headers=headers).status_code==401

def test_painel_do_piloto_nao_faz_fallback_para_producao():
    for name in ('frontend/pedido.js','frontend/script.js'):
        text=(ROOT/name).read_text(encoding='utf-8')
        assert 'window.location.port === "9001" ? [window.location.origin]' in text


def test_pacote_recusa_coleta_sem_componente_dinamico_do_spool(monkeypatch):
    from ferramentas import conferir_pacote_agente as guard
    from types import SimpleNamespace
    modulos = {n: None for n in ('coleta_autonoma', 'autorizacao_local',
                                 'segredos_estacao', 'migracao_estacao')}
    pacote = SimpleNamespace(toc={'PYZ.pyz': None},
                             open_embedded_archive=lambda _: SimpleNamespace(toc=modulos))
    monkeypatch.setattr(guard, 'abrir_executavel', lambda _: pacote)
    with pytest.raises(ValueError, match='spool'):
        guard.conferir_exe('pacote-sintetico.exe')
    modulos['win32timezone'] = None
    guard.conferir_exe('pacote-sintetico.exe')
