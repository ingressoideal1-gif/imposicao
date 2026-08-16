# -*- coding: utf-8 -*-
"""As duas tabelas sensíveis só se leem pela chave de SERVIÇO.

## O que este arquivo tranca

Em 16/08/2026 mediu-se, com a chave anônima — a que está no código-fonte de toda
página do painel — que `imposition_acessos_locais` devolvia os códigos de acesso
da gráfica em texto claro, e `imposition_user_permissions` devolvia a grade
inteira. O passo 3 do RLS (`sql/rls_passo3_fechar_leitura.sql`) tira o
privilégio de tabela das chaves públicas.

Tirar o privilégio quebra quem lia por elas. Estes testes fixam os dois lados do
conserto:

1. o motor lê pela chave de serviço, e não pela anônima;
2. quando não consegue ler, ele DIZ que não conseguiu, em vez de devolver lista
   vazia.

O segundo item é o que mais importa. Lista vazia é a mentira mais cara deste
projeto: no Menu Usuários ela diz "não há operador nenhum cadastrado", e o
administrador que ler isso recadastra quem já existe ou conclui que a tranca das
estações sumiu. É a mesma lição que `sincronizar_acessos` carrega do lado da
estação e que `list_all_user_permissions` já carregava aqui.
"""
import io
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import app as app_modulo
import db


class _Resposta:
    def __init__(self, corpo):
        self.corpo = corpo

    def read(self):
        return self.corpo

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def nuvem(monkeypatch):
    """Um motor de nuvem com banco configurado, sem sair para a rede."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "SUPABASE_KEY", "chave-anonima")
    monkeypatch.setattr(db, "SUPABASE_SERVICE_KEY", "chave-de-servico")


def _capturar(monkeypatch, corpo=b"[]"):
    """Guarda o cabeçalho com que a leitura saiu."""
    vistas = []

    def urlopen(req, timeout=None):
        vistas.append(dict(req.headers))
        return _Resposta(corpo)

    monkeypatch.setattr(db.urllib.request, "urlopen", urlopen)
    return vistas


def _negado(monkeypatch):
    """O que o PostgREST responde depois do REVOKE."""
    def urlopen(req, timeout=None):
        raise urllib.error.HTTPError(
            "https://exemplo.invalido", 401, "Unauthorized", {},
            io.BytesIO(b'{"code":"42501","message":"permission denied for table"}'))

    monkeypatch.setattr(db.urllib.request, "urlopen", urlopen)


# ─── 1. A leitura sai pela chave certa ────────────────────────────────────────


@pytest.mark.parametrize("ler", [
    lambda: db.listar_acessos_locais(),
    lambda: db.get_user_permissions("u1"),
    lambda: db.list_all_user_permissions(),
])
def test_le_com_a_chave_de_servico(nuvem, monkeypatch, ler):
    vistas = _capturar(monkeypatch)
    ler()
    enviado = " ".join(str(v) for v in vistas[0].values())
    assert "chave-de-servico" in enviado
    assert "chave-anonima" not in enviado, (
        "a leitura saiu pela chave publica; depois do REVOKE ela levaria 401"
    )


@pytest.mark.parametrize("ler", [
    lambda: db.listar_acessos_locais(),
    lambda: db.get_user_permissions("u1"),
    lambda: db.list_all_user_permissions(),
])
def test_sem_a_chave_de_servico_recusa_em_vez_de_tentar_pela_anonima(
        nuvem, monkeypatch, ler):
    """Numa estação não há chave de serviço, e é assim de propósito: ela abre
    cliente, proposta e financeiro do parceiro. O certo ali é recusar."""
    monkeypatch.setattr(db, "SUPABASE_SERVICE_KEY", "")
    _capturar(monkeypatch)

    with pytest.raises(db.BancoIndisponivel):
        ler()


# ─── 2. Recusa não vira lista vazia ───────────────────────────────────────────


def test_leitura_negada_levanta_em_vez_de_devolver_lista_vazia(nuvem, monkeypatch):
    """O caso que o passo 3 do RLS produz se algo der errado do lado de cá."""
    _negado(monkeypatch)

    with pytest.raises(db.BancoIndisponivel):
        db.listar_acessos_locais()


def test_o_endpoint_responde_503_e_nao_lista_vazia(nuvem, monkeypatch):
    _negado(monkeypatch)
    monkeypatch.setattr(app_modulo.security_config, "is_cloud_runtime", lambda: False)

    r = TestClient(app_modulo.app).get("/api/acessos-locais")
    assert r.status_code == 503, r.text


def test_lista_boa_continua_passando(nuvem, monkeypatch):
    _capturar(monkeypatch, b'[{"codigo": "M9KGJD", "nome": "Bernardo"}]')
    monkeypatch.setattr(app_modulo.security_config, "is_cloud_runtime", lambda: False)

    r = TestClient(app_modulo.app).get("/api/acessos-locais")
    assert r.status_code == 200
    assert r.json()["acessos"][0]["codigo"] == "M9KGJD"
