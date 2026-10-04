"""API montada com funcoes reais, credenciais sinteticas e nenhuma rede."""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import sys

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

import autorizacao_local as auth
import persistencia_local
import segredos_estacao

RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture
def operador(monkeypatch):
    registro = {'codigo': 'ABC123', 'nome': 'Operador sintetico', 'role': 'impressor',
                'ativo': True, 'permissoes': {'perm_imprimir': True, 'perm_admin_edit': False}}
    monkeypatch.setitem(sys.modules, 'acesso_local', SimpleNamespace(
        validar=lambda c: dict(registro) if c == registro['codigo'] and registro['ativo'] else None))
    auth._sessoes.clear()
    return registro


@pytest.fixture
def client(operador):
    app = FastAPI()
    arvore = ast.parse((RAIZ / 'app.py').read_text(encoding='utf-8-sig'))
    nomes = {'proteger_api_local', 'login_local', 'conferir_sessao_local', 'sair_da_estacao'}
    funcoes = [n for n in arvore.body if isinstance(n, ast.AsyncFunctionDef) and n.name in nomes]
    assert len(funcoes) == len(nomes)
    exec(compile(ast.Module(body=funcoes, type_ignores=[]), 'app_isolado', 'exec'),
         {'app': app, 'Request': Request, 'HTTPException': HTTPException, 'JSONResponse': JSONResponse})

    @app.post('/api/print/submit')
    def imprimir():
        return {'ok': True}

    @app.post('/api/acessos-locais')
    def administrar():
        pytest.fail('Operador sem permissao alcancou a administracao')

    @app.get('/api/formatos')
    def catalogo():
        return [{'nome': 'Formato sintetico'}]

    @app.post('/api/nova-rota')
    def nova_rota():
        pytest.fail('Rota nova nasceu aberta')

    with TestClient(app) as cliente:
        yield cliente


def test_anonimo_nao_imprime_nem_administra(client):
    assert client.post('/api/print/submit').status_code == 401
    assert client.post('/api/acessos-locais').status_code == 401
    assert client.post('/api/nova-rota').status_code == 401


def test_catalogo_publico_do_portal_continua_legivel(client):
    assert client.get('/api/formatos').json() == [{'nome': 'Formato sintetico'}]
    assert auth.exige_identidade('GET', '/api/formatos/novo/privado')
    assert auth.exige_identidade('POST', '/api/formatos')


def test_login_token_permissoes_revogacao_e_logout(client, operador):
    assert client.post('/api/local/login', content='{invalido').status_code == 401
    assert client.post('/api/local/login', json=[]).status_code == 401
    assert client.post('/api/local/login', json={'codigo': 'ERRADO'}).status_code == 401
    login = client.post('/api/local/login', json={'codigo': 'ABC123'}).json()
    assert 'codigo' not in login
    headers = {'X-NewProd-Sessao': login['token']}
    assert client.post('/api/print/submit', headers=headers).status_code == 200
    assert client.post('/api/acessos-locais', headers=headers).status_code == 403
    operador['permissoes']['perm_imprimir'] = False
    assert client.post('/api/print/submit', headers=headers).status_code == 403
    assert client.post('/api/local/logout', headers=headers).status_code == 200
    assert client.get('/api/local/sessao', headers=headers).status_code == 401


def test_desativar_operador_invalida_token(operador):
    token = auth.criar_sessao(operador)
    operador['ativo'] = False
    with pytest.raises(HTTPException) as e:
        auth.operador_da_sessao(token)
    assert e.value.status_code == 401


def test_expiracao_nao_depende_de_relogio_de_parede(operador, monkeypatch):
    monkeypatch.setattr(auth.time, 'monotonic', lambda: 100)
    token = auth.criar_sessao(operador)
    monkeypatch.setattr(auth.time, 'monotonic', lambda: 100 + auth.VALIDADE_SESSAO)
    with pytest.raises(HTTPException):
        auth.operador_da_sessao(token)


def test_grade_explicitamente_negada_prevalece_e_desconhecido_nao_e_admin():
    assert not auth.permissoes_efetivas({'role': 'admin', 'permissoes': {'perm_imprimir': False}})['permissoes']['perm_imprimir']
    assert not auth.permissoes_efetivas({'role': 'desconhecido'})['admin']
    assert not auth.permissoes_efetivas({'role': 'admin'})['admin']


def test_copia_local_usa_permissao_de_producao_sem_conceder_administracao():
    operador = auth.permissoes_efetivas({'role': 'impressor',
        'permissoes': {'perm_producao_edit': True, 'perm_admin_edit': False}})
    auth.autorizar(operador, 'POST', '/api/pacotes-locais/controle-painel')
    with pytest.raises(HTTPException) as erro:
        auth.autorizar(operador, 'POST', '/api/acessos-locais')
    assert erro.value.status_code == 403
    operador['permissoes']['perm_producao_edit'] = False
    auth.autorizar(operador, 'GET', '/api/pacotes-locais/resumo-painel')
    with pytest.raises(HTTPException) as erro:
        auth.autorizar(operador, 'POST', '/api/pacotes-locais/controle-painel')
    assert erro.value.status_code == 403


def test_gravacao_interrompida_preserva_arquivo_anterior(tmp_path, monkeypatch):
    destino = tmp_path / 'dados.json'
    destino.write_text('{"valor": 1}')
    monkeypatch.setattr(persistencia_local.os, 'replace', lambda *a: (_ for _ in ()).throw(OSError('falha sintetica')))
    with pytest.raises(OSError):
        persistencia_local.gravar_json_atomico(destino, {'valor': 2})
    assert json.loads(destino.read_text()) == {'valor': 1}
    assert list(tmp_path.iterdir()) == [destino]


@pytest.mark.skipif(sys.platform != 'win32', reason='DPAPI pertence ao Windows')
def test_dpapi_real_com_dado_sintetico_exige_mesma_finalidade():
    envelope = segredos_estacao.proteger_texto('somente-dado-sintetico', 'teste')
    assert 'somente-dado-sintetico' not in json.dumps(envelope)
    assert segredos_estacao.recuperar_texto(envelope, 'teste') == 'somente-dado-sintetico'
    with pytest.raises(segredos_estacao.ProtecaoIndisponivel):
        segredos_estacao.recuperar_texto(envelope, 'outro-contexto')


def test_token_do_navegador_nao_vaza_para_outros_enderecos():
    import subprocess
    result = subprocess.run(['node', 'tests/token_estacao_harness.js'], cwd=RAIZ,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_perfis_do_backend_correspondem_aos_perfis_da_tela():
    import subprocess
    codigo = "const fs=require('fs'),vm=require('vm');const s=fs.readFileSync('frontend/script.js','utf8');const a=s.indexOf('const ROLE_DEFAULTS =');const b=s.indexOf('\\n};',a)+3;process.stdout.write(JSON.stringify(vm.runInNewContext(s.slice(a,b)+'; ROLE_DEFAULTS')));"
    result = subprocess.run(['node', '-e', codigo], cwd=RAIZ, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout) == auth.PADROES


def test_sessao_supabase_confere_usuario_e_grade(monkeypatch):
    uid = '12345678-1234-1234-1234-123456789abc'
    monkeypatch.setitem(sys.modules, 'acesso_api', SimpleNamespace(_usuario_logado=lambda _: {'id': uid}))
    monkeypatch.setitem(sys.modules, 'db', SimpleNamespace(SUPABASE_URL='https://teste.invalid', SUPABASE_KEY='publica-sintetica'))
    class Resposta:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return json.dumps({'ok': True, 'permissions': grade}).encode()
    grade = {'user_id': uid, 'role': 'impressor', 'perm_imprimir': True}
    monkeypatch.setattr(auth.urllib.request, 'urlopen', lambda *a, **k: Resposta())
    operador = auth.autenticar({'authorization': 'Bearer sintetico'})
    assert operador['uid'] == uid and not operador['admin']
    auth.autorizar(operador, 'POST', '/api/print/submit')
    auth.autorizar(operador, 'GET', '/api/user/permissions/' + uid)
    grade['user_id'] = 'outro-usuario'
    with pytest.raises(HTTPException) as erro:
        auth.autenticar({'authorization': 'Bearer sintetico'})
    assert erro.value.status_code == 403


def test_build_inclui_somente_frontend_rastreado(tmp_path, monkeypatch):
    fonte = (RAIZ / 'agent_tray.spec').read_text(encoding='utf-8')
    cabecalho = fonte[:fonte.index('# mfc140u.dll:')]
    (tmp_path / 'frontend').mkdir()
    (tmp_path / 'frontend' / 'index.html').write_text('pagina sintetica')
    (tmp_path / 'frontend' / 'pessoal.txt').write_text('arquivo local sintetico')
    monkeypatch.chdir(tmp_path)
    import subprocess
    monkeypatch.setattr(subprocess, 'run', lambda *a, **k: SimpleNamespace(stdout=b'frontend/index.html\0'))
    contexto = {}
    exec(compile(cabecalho, 'spec-isolado', 'exec'), contexto)
    assert contexto['_frontend_datas'] == [('frontend/index.html', 'frontend')]
