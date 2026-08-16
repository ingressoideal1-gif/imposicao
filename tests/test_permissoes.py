# -*- coding: utf-8 -*-
"""Permissoes dos usuarios do sistema.

O que estes testes protegem e uma distincao, nao um calculo: "este usuario nao
tem linha de permissao" e "nao consegui perguntar ao banco" precisam chegar
DIFERENTES ao navegador.

Enquanto chegavam iguais (as duas viravam `null`), o painel tratava as duas como
primeiro acesso e gravava o perfil visualizador por cima das permissoes reais de
quem so estava entrando de novo. Basta o motor estar lento — o Render dorme, e a
consulta aqui tem 8s de paciencia — para alguem perder metade do menu sem que
ninguem tenha mexido em nada.
"""

import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import db


# ─── db: as duas respostas sao diferentes ─────────────────────────────────────

def test_sem_linha_devolve_none(monkeypatch):
    """Banco respondeu, e a resposta foi 'nao ha linha para este usuario'."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})
    monkeypatch.setattr(db.urllib.request, "urlopen", _resposta(b"[]"))

    assert db.get_user_permissions("qualquer") is None


def test_linha_encontrada_volta_como_dicionario(monkeypatch):
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})
    monkeypatch.setattr(
        db.urllib.request, "urlopen",
        _resposta(b'[{"user_id": "u1", "role": "designer", "perm_pedidos_view": true}]'))

    perms = db.get_user_permissions("u1")
    assert perms["role"] == "designer"
    assert perms["perm_pedidos_view"] is True


def test_banco_mudo_levanta_em_vez_de_devolver_none(monkeypatch):
    """O caso que causou o estrago: timeout NAO pode parecer 'sem linha'."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})
    monkeypatch.setattr(db.urllib.request, "urlopen", _explode(TimeoutError("demorou")))

    with pytest.raises(db.BancoIndisponivel):
        db.get_user_permissions("u1")


def test_lista_vazia_por_falha_nao_vira_lista_vazia(monkeypatch):
    """Lista vazia significaria 'nao ha usuario nenhum' — e o proximo a entrar
    receberia ADMIN. Falha de rede nao pode passar por isso."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})
    monkeypatch.setattr(db.urllib.request, "urlopen", _explode(OSError("rede caiu")))

    with pytest.raises(db.BancoIndisponivel):
        db.list_all_user_permissions()


def test_gravacao_recusada_levanta_com_o_motivo(monkeypatch):
    """O corpo do erro do PostgREST tem o motivo; sem ele a tela so diria 'erro'."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})

    import io
    erro = urllib.error.HTTPError(
        "url", 400, "Bad Request", {},
        io.BytesIO(b'{"message":"column perm_novo_view does not exist"}'))
    monkeypatch.setattr(db.urllib.request, "urlopen", _explode(erro))

    with pytest.raises(db.BancoIndisponivel) as capturado:
        db.upsert_user_permissions({"user_id": "u1", "perm_novo_view": True})
    assert "perm_novo_view" in str(capturado.value)


def test_gravacao_confirmada_devolve_a_linha(monkeypatch):
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "_headers", lambda: {})
    monkeypatch.setattr(db, "_headers_servico", lambda: {})
    monkeypatch.setattr(
        db.urllib.request, "urlopen",
        _resposta(b'[{"user_id": "u1", "role": "designer"}]'))

    linha = db.upsert_user_permissions({"user_id": "u1", "role": "designer"})
    assert linha["role"] == "designer"


# ─── endpoints: 503 e nao 200-com-ok-false ────────────────────────────────────

def test_endpoint_responde_503_quando_o_banco_nao_responde(monkeypatch):
    """200 com {"ok": false} era indistinguivel de sucesso para quem nao lia o
    corpo — e o card de Usuarios nao lia. 503 nao tem como ser confundido."""
    import app

    def cai(_user_id):
        raise db.BancoIndisponivel("o banco dormiu")

    monkeypatch.setattr(db, "get_user_permissions", cai)
    cliente = TestClient(app.app)
    resp = cliente.get("/api/user/permissions/u1")
    assert resp.status_code == 503


def test_endpoint_de_gravacao_responde_503_quando_recusada(monkeypatch):
    import app

    def cai(_data):
        raise db.BancoIndisponivel("RLS ligado")

    monkeypatch.setattr(db, "upsert_user_permissions", cai)
    cliente = TestClient(app.app)
    resp = cliente.post("/api/user/permissions", json={"user_id": "u1"})
    assert resp.status_code == 503
    assert "RLS" in resp.json().get("detail", "")


def test_endpoint_devolve_none_sem_erro_quando_o_usuario_nao_tem_linha(monkeypatch):
    """Este caminho PRECISA continuar 200: e o primeiro acesso de verdade, e e
    ele que autoriza o painel a criar a linha."""
    import app

    monkeypatch.setattr(db, "get_user_permissions", lambda _u: None)
    cliente = TestClient(app.app)
    resp = cliente.get("/api/user/permissions/u1")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "permissions": None}


# ─── auxiliares ───────────────────────────────────────────────────────────────

class _RespostaFalsa:
    def __init__(self, corpo):
        self._corpo = corpo
        self.status = 200

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _resposta(corpo):
    return lambda *_args, **_kwargs: _RespostaFalsa(corpo)


def _explode(erro):
    def _falha(*_args, **_kwargs):
        raise erro
    return _falha
