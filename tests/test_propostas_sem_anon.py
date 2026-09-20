"""Regressão da ponte de propostas, sem importar app/db ou ler credenciais."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import urllib.error

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture
def ponte(monkeypatch):
    spec = importlib.util.spec_from_file_location("ponte_propostas_teste", RAIZ / "propostas_api.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    monkeypatch.setitem(sys.modules, "acesso_local", SimpleNamespace(validar=lambda c: {"role": "admin"} if c == "ABC123" else None))
    monkeypatch.setitem(sys.modules, "acesso_publicacao", SimpleNamespace(
        _base=lambda: "https://exemplo.invalid/acesso-estacao", _segredo=lambda: "segredo-sintetico"))
    return modulo


def test_navegador_identifica_operador_pagina_e_nao_recua_para_anon():
    r = subprocess.run(["node", "tests/propostas_sem_anon_harness.js"], cwd=RAIZ,
                       capture_output=True, text=True, timeout=20)
    assert r.returncode == 0, r.stdout + r.stderr


def test_nao_restou_postgrest_de_propostas_no_frontend():
    import re
    for arquivo in ("script.js", "acabamento.js", "cliente.js"):
        texto = (RAIZ / "frontend" / arquivo).read_text(encoding="utf-8")
        assert not re.search(r"\.from\(\s*['\"]propostas['\"]\s*\)", texto)


def test_estacao_sem_operador_nao_consulta_rede(ponte, monkeypatch):
    monkeypatch.setattr(ponte.urllib.request, "urlopen", lambda *a, **k: pytest.fail("rede indevida"))
    with pytest.raises(HTTPException) as e:
        ponte._encaminhar("consultar", "ERRADO", {"tipo": "lista"})
    assert e.value.status_code == 401


def test_estacao_sem_segredo_nao_recorre_a_anon(ponte, monkeypatch):
    monkeypatch.setattr(sys.modules["acesso_publicacao"], "_segredo", lambda: None)
    monkeypatch.setattr(ponte.urllib.request, "urlopen", lambda *a, **k: pytest.fail("rede indevida"))
    with pytest.raises(HTTPException) as e:
        ponte._encaminhar("consultar", "ABC123", {"tipo": "lista"})
    assert e.value.status_code == 503


def test_estacao_encaminha_operador_e_segredo_sem_service_role(ponte, monkeypatch):
    def abrir(req, timeout):
        assert req.full_url == "https://exemplo.invalid/acesso-estacao/api/acesso/propostas/consultar"
        headers = dict((k.lower(), v) for k, v in req.header_items())
        assert headers["x-operador-codigo"] == "ABC123"
        assert headers["x-agente-segredo"] == "segredo-sintetico"
        assert "authorization" not in headers and "apikey" not in headers
        assert json.loads(req.data) == {"tipo": "lista"}
        return io.BytesIO(b'[{"id_int":11}]')
    monkeypatch.setattr(ponte.urllib.request, "urlopen", abrir)
    assert ponte._encaminhar("consultar", "ABC123", {"tipo": "lista"}) == [{"id_int": 11}]


def test_erro_remoto_nao_expoe_corpo_ou_codigo(ponte, monkeypatch):
    def falhar(*a, **k):
        raise urllib.error.HTTPError("https://exemplo.invalid", 403, "erro", {}, io.BytesIO(b'ABC123 segredo'))
    monkeypatch.setattr(ponte.urllib.request, "urlopen", falhar)
    with pytest.raises(HTTPException) as e:
        ponte._encaminhar("status", "ABC123", {"pedido": 11, "status": "EM PRODUCAO"})
    assert e.value.status_code == 403
    assert "ABC123" not in e.value.detail and "segredo" not in e.value.detail


def test_rota_local_recusa_metodo_acao_e_corpo_invalidos(ponte, monkeypatch):
    app = FastAPI()
    app.include_router(ponte.router)
    monkeypatch.setattr(ponte, "_encaminhar", lambda *a: pytest.fail("encaminhamento indevido"))
    with TestClient(app) as client:
        assert client.get("/api/propostas/consultar").status_code == 405
        assert client.post("/api/propostas/apagar").status_code == 404
        assert client.post("/api/propostas/status", json={}).status_code == 401
        assert client.post("/api/propostas/status", json=[], headers={"X-Operador-Codigo": "ABC123"}).status_code == 422
        assert client.post("/api/propostas/status", content=b"x" * 32769, headers={"X-Operador-Codigo": "ABC123"}).status_code == 413


def test_fundo_local_encaminha_somente_operacoes_previstas(ponte, monkeypatch):
    chamadas = []
    def abrir(req, timeout):
        chamadas.append(req)
        assert req.full_url == "https://exemplo.invalid/acesso-estacao/api/acesso/fundo/remover"
        assert req.get_header("X-operador-codigo") == "ABC123"
        assert req.get_header("X-agente-segredo") == "segredo-sintetico"
        return io.BytesIO(b'{"ok":true}')
    monkeypatch.setattr(ponte.urllib.request, "urlopen", abrir)
    app = FastAPI()
    app.include_router(ponte.router)
    with TestClient(app) as client:
        assert client.post("/api/fundo/remover", json={}).status_code == 401
        headers = {"X-Operador-Codigo": "ABC123"}
        assert client.post("/api/fundo/apagar", json={}, headers=headers).status_code == 404
        assert client.post("/api/fundo/remover", json={}, headers=headers).json() == {"ok": True}
    assert len(chamadas) == 1


def test_frontend_nao_chama_rpcs_de_escrita_do_fundo():
    import re
    texto = (RAIZ / "frontend" / "script.js").read_text(encoding="utf-8")
    assert not re.search(r"\.rpc\(\s*['\"](?:publicar|remover)_fundo_do_pwa", texto)


@pytest.mark.parametrize("acao,corpo", [("cadastro", {"pedido": 11}), ("pagamentos", {"numeros": [11]})])
def test_novas_leituras_da_estacao_exigem_identificacao(ponte, monkeypatch, acao, corpo):
    chamadas = []
    monkeypatch.setattr(ponte, "_encaminhar", lambda *args: chamadas.append(args) or {"ok": True})
    app = FastAPI()
    app.include_router(ponte.router)
    with TestClient(app) as client:
        assert client.post(f"/api/propostas/{acao}", json=corpo).status_code == 401
        assert client.post(f"/api/propostas/{acao}", json=corpo,
                           headers={"X-Operador-Codigo": "ABC123"}).status_code == 200
    assert chamadas == [(acao, "ABC123", corpo)]
