# -*- coding: utf-8 -*-
"""Lista de acessos vazia não substitui lista cheia.

## O modo de falhar que este arquivo existe para impedir

`acesso_local.ha_lista()` é o que responde ao `app.py` se a estação deve pedir
código no login. Com a lista vazia ela responde **não** — e o painel abre para
quem sentar na máquina. É o contrário do que a lista existe para fazer.

Até 16/08/2026 uma resposta vazia da nuvem era gravada como se fosse verdade. E
uma resposta vazia quase nunca significa "ninguém tem acesso": significa que a
leitura foi recusada. Vai significar isso literalmente quando o RLS fechar a
leitura de `imposition_acessos_locais` para a chave anônima — o passo 3 de
`sql/rls_acessos_e_permissoes.sql`. Sem este freio, aquele passo **destrancaria
onze computadores** em vez de trancar um vazamento.

Esvaziar de verdade continua possível: desative os operadores um a um, ou apague
a cópia da estação. O que não se faz por acidente é destrancar tudo com uma
requisição que voltou vazia.
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import acesso_local
import agent_worker


LISTA = [
    {"codigo": "M9KGJD", "nome": "Bernardo", "role": "impressor", "ativo": True},
    {"codigo": "Y6P4KN", "nome": "Eduardo", "role": "admin", "ativo": True},
]


@pytest.fixture
def estacao(tmp_path, monkeypatch):
    """Uma estação com arquivo de acessos próprio, longe do da máquina real."""
    arquivo = tmp_path / "acessos_locais.json"
    monkeypatch.setattr(acesso_local, "ARQUIVO", str(arquivo))
    monkeypatch.setattr(agent_worker, "_relay_ativo", lambda: True)
    return arquivo


def _responder(monkeypatch, corpo):
    monkeypatch.setattr(agent_worker, "_supabase_request",
                        lambda *a, **k: corpo)


def test_a_lista_boa_e_gravada(estacao, monkeypatch):
    _responder(monkeypatch, LISTA)
    assert agent_worker.sincronizar_acessos() is True
    assert len(acesso_local.carregar_lista()) == 2
    assert acesso_local.ha_lista()


def test_lista_vazia_nao_apaga_a_que_estava(estacao, monkeypatch):
    """O caso que destrancaria a estação."""
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()

    _responder(monkeypatch, [])
    assert agent_worker.sincronizar_acessos() is False, "não devia ter gravado"

    assert len(acesso_local.carregar_lista()) == 2, "a lista boa foi apagada"
    assert acesso_local.ha_lista(), "a estação parou de pedir código"


def test_a_estacao_continua_pedindo_o_codigo_certo(estacao, monkeypatch):
    """Não basta a lista sobreviver: o login tem de continuar funcionando."""
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()
    _responder(monkeypatch, [])
    agent_worker.sincronizar_acessos()

    assert acesso_local.validar("Y6P4KN"), "o código bom parou de entrar"
    assert not acesso_local.validar("XXXXXX")


def test_instalacao_nova_com_lista_vazia_continua_sem_lista(estacao, monkeypatch):
    """Numa estação que nunca recebeu lista, vazio é vazio mesmo.

    Ali a resposta certa é a de sempre: sem lista sincronizada, o painel entra
    como entrava antes. Parar a produção por falta de rede seria pior do que o
    problema que a tranca resolve — é o que o próprio `estado_login_local`
    documenta.
    """
    _responder(monkeypatch, [])
    agent_worker.sincronizar_acessos()
    assert acesso_local.carregar_lista() == []
    assert not acesso_local.ha_lista()


def test_erro_de_rede_nao_toca_na_copia(estacao, monkeypatch):
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()

    _responder(monkeypatch, None)
    assert agent_worker.sincronizar_acessos() is False
    assert len(acesso_local.carregar_lista()) == 2
