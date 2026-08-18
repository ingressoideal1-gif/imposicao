# -*- coding: utf-8 -*-
"""O /saude é a única chance de descobrir uma variável faltando ANTES do cliente.

O último teste deste arquivo — o que conferia o nome do serviço escrito no
`ferramentas/copiar_para_render.ps1` — saiu em 17/08/2026 junto com o script.
As variáveis não moram mais num painel de serviço hospedado: vão para os
segredos do Supabase, e quem as confere de fora é este mesmo `/saude`.

Cada uma das quatro falha num lugar diferente e tarde. Conferir as quatro num
endpoint só é o que transforma "não funcionou" em "falta a variável X".

A resposta diz SE cada variável existe, nunca o que ela vale — este endpoint não
pede login.
"""

import pytest
from fastapi import HTTPException

import acesso_api
import acesso_elevacao


VARIAVEIS = [
    "SUPABASE_SERVICE_KEY",
    "ACESSO_AGENTE_SEGREDO",
    "QR_PEDIDO_SEGREDO",
    "ACESSO_ELEVACAO_SEGREDO",
]


@pytest.fixture
def tudo_presente(monkeypatch):
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "segredo")
    monkeypatch.setattr(acesso_api, "supabase", lambda *a, **k: [])
    import qr_pedido
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", "segredo-do-qr-do-pedido")
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-da-elevacao")


def test_o_saude_cobra_as_QUATRO_variaveis(tudo_presente):
    resposta = acesso_api.saude()
    assert sorted(resposta["variaveis"]) == sorted(VARIAVEIS)
    assert resposta["ok"] is True
    assert resposta["faltando"] == []


def test_a_elevacao_faltando_aparece_pelo_nome(tudo_presente, monkeypatch):
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(acesso_elevacao.SEGREDO_ENV, raising=False)

    with pytest.raises(HTTPException) as e:
        acesso_api.saude()
    assert e.value.status_code == 503
    assert e.value.detail["faltando"] == ["ACESSO_ELEVACAO_SEGREDO"]


def test_a_resposta_nunca_traz_o_VALOR_de_nenhuma_variavel(tudo_presente):
    """O endpoint nao pede login: dizer o valor seria entregar o segredo."""
    resposta = acesso_api.saude()
    assert all(v is True for v in resposta["variaveis"].values())

