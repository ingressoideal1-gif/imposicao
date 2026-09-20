"""Envio de arte: SMTP simulado, sem rede ou credenciais reais."""
import smtplib
from unittest.mock import MagicMock

import pytest
import ast
import datetime
import os
from pathlib import Path
from types import ModuleType

RAIZ = Path(__file__).resolve().parents[1]


def carregar_funcoes(arquivo, nomes, contexto):
    """Executa somente as funções alvo, sem inicializar estação, banco ou worker."""
    arvore = ast.parse((RAIZ / arquivo).read_text(encoding="utf-8-sig"))
    funcoes = [no for no in arvore.body
               if isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)) and no.name in nomes]
    assert {no.name for no in funcoes} == set(nomes)
    modulo = ModuleType('teste_' + arquivo.replace('.', '_'))
    modulo.__dict__.update(contexto)
    exec(compile(ast.Module(body=funcoes, type_ignores=[]), arquivo, "exec"), modulo.__dict__)
    return modulo


def proibido(*args, **kwargs):
    pytest.fail('Acesso a configuracao ou rede real nao permitido neste teste')


db = carregar_funcoes("db.py", ["validar_email_config", "send_email_smtp", "get_email_config", "save_email_config"],
                     {"os": os, "datetime": datetime, "_get_db": proibido,
                      "_save_db": proibido, "_supabase_request": proibido})


def test_frontend_email():
    import subprocess
    from pathlib import Path
    r = subprocess.run(['node', 'tests/email_envio_harness.js'],
                       cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.fixture
def config():
    return dict(host='smtp.example.com', port=587, user='arte@example.com',
                password='senha-ficticia', email_remetente='arte@example.com', use_tls=True)


@pytest.fixture
def smtp(monkeypatch):
    server = MagicMock()
    server.sendmail.return_value = {}
    monkeypatch.setattr(smtplib, 'SMTP', MagicMock(return_value=server))
    monkeypatch.setattr(smtplib, 'SMTP_SSL', MagicMock(return_value=server))
    return server


def test_tls_e_texto_seguro(config, smtp):
    from email import message_from_string
    r = db.send_email_smtp('cliente@example.com', 'Arte', '<script>arte</script>\nLink', smtp_config=config)
    assert r['ok']
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with(config['user'], config['password'])
    msg = message_from_string(smtp.sendmail.call_args.args[2])
    html = msg.get_payload()[1].get_payload(decode=True).decode()
    assert '&lt;script&gt;' in html and '<script>' not in html
    smtp.quit.assert_called_once()


def test_ssl_e_quit_nao_desfaz_envio(config, smtp):
    config['port'] = 465
    smtp.quit.side_effect = OSError('conexao fechada')
    assert db.send_email_smtp('cliente@example.com', 'Arte', 'Link', smtp_config=config)['ok']
    smtplib.SMTP_SSL.assert_called_once()
    smtp.starttls.assert_not_called()


@pytest.mark.parametrize('erro,trecho', [
    (smtplib.SMTPAuthenticationError(535, b'senha-ficticia'), 'login'),
    (ConnectionRefusedError(), 'conectar'),
    (TimeoutError(), 'confirmado'),
    (smtplib.SMTPRecipientsRefused({}), 'destinatário'),
])
def test_falhas_sem_segredo(config, smtp, erro, trecho):
    smtp.login.side_effect = erro
    r = db.send_email_smtp('cliente@example.com', 'Arte', 'Link', smtp_config=config)
    assert not r['ok'] and trecho in r['error']
    assert config['password'] not in str(r)
    smtp.sendmail.assert_not_called()


def test_destinatario_recusado(config, smtp):
    smtp.sendmail.return_value = {'cliente@example.com': (550, b'recusado')}
    assert not db.send_email_smtp('cliente@example.com', 'Arte', 'Link', smtp_config=config)['ok']


@pytest.mark.parametrize('campo,valor', [('port', 'abc'), ('port', 0), ('host', ''), ('password', ''), ('email_remetente', 'invalido')])
def test_config_invalida(config, campo, valor):
    config[campo] = valor
    with pytest.raises(ValueError):
        db.validar_email_config(config)


def test_cabecalho_injetado_nao_envia(config, smtp):
    assert not db.send_email_smtp('cliente@example.com', 'Arte\r\nBcc: outro@example.com', 'Link', smtp_config=config)['ok']
    smtp.sendmail.assert_not_called()


@pytest.fixture
def client(config, monkeypatch):
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.testclient import TestClient
    # As rotas reais são montadas em app isolado, sem importar app.py.
    monkeypatch.setattr(db, 'get_email_config', lambda: dict(config), raising=False)
    monkeypatch.setattr(db, 'save_email_config', lambda _: pytest.fail('escrita inesperada'), raising=False)
    app = FastAPI()
    carregar_funcoes('app.py', ['get_email_config_endpoint', 'save_email_config_endpoint', 'send_email_endpoint'],
                     {'app': app, 'db': db, 'HTTPException': HTTPException, 'Request': Request})
    return TestClient(app)


def test_api_nao_devolve_senha(client):
    r = client.get('/api/email/config').json()
    assert r['config']['has_password']
    assert 'password' not in r['config']


def test_salvar_preserva_senha(client, config, monkeypatch):
    salvar = MagicMock(return_value=True)
    monkeypatch.setattr(db, 'save_email_config', salvar)
    entrada = {**config, 'password': ''}
    assert client.post('/api/email/config', json=entrada).status_code == 200
    assert salvar.call_args.args[0]['password'] == config['password']


def test_teste_com_host_preserva_senha(client, config, smtp):
    r = client.post('/api/email/enviar', json=dict(to='cliente@example.com', subject='Teste',
        body_text='Teste', smtp_config={**config, 'password': ''}))
    assert r.status_code == 200
    smtp.login.assert_called_once_with(config['user'], config['password'])


def test_api_primeira_config_exige_senha(client, config, monkeypatch):
    monkeypatch.setattr(db, 'get_email_config', lambda: {})
    assert client.post('/api/email/config', json={**config, 'password': ''}).status_code == 400


def test_config_so_local(config, monkeypatch):
    monkeypatch.setattr(db, '_get_db', lambda: {})
    gravar = MagicMock()
    nuvem = MagicMock(side_effect=AssertionError('Não publicar SMTP'))
    monkeypatch.setattr(db, '_save_db', gravar)
    monkeypatch.setattr(db, '_supabase_request', nuvem)
    assert db.save_email_config(config)
    assert gravar.call_args.args[0]['email_config']['host'] == config['host']
    nuvem.assert_not_called()
