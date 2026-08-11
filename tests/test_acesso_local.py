# -*- coding: utf-8 -*-
"""Acesso local ao NewProd: validação do código e login na estação."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

import db
import acesso_local


# ─── Código escolhido pelo administrador ──────────────────────────────────────

def test_aceita_codigo_de_seis_letras_e_numeros():
    assert db.validar_codigo_acesso("NEW123") == "NEW123"
    assert db.validar_codigo_acesso("ABCDEF") == "ABCDEF"
    assert db.validar_codigo_acesso("123456") == "123456"


def test_normaliza_o_que_o_administrador_digitou():
    # Ele digita como quiser; o que vai ao banco é sempre a mesma forma.
    assert db.validar_codigo_acesso(" new 123 ") == "NEW123"
    assert db.validar_codigo_acesso("new123") == "NEW123"


def test_recusa_tamanho_diferente_de_seis():
    for ruim in ("NEW12", "NEW1234", ""):
        with pytest.raises(db.CodigoInvalido) as erro:
            db.validar_codigo_acesso(ruim)
        assert "6 caracteres" in str(erro.value)


def test_recusa_caractere_que_nao_e_letra_nem_numero():
    with pytest.raises(db.CodigoInvalido) as erro:
        db.validar_codigo_acesso("NEW-12")
    assert "letras e numeros" in str(erro.value)


def test_recusa_codigo_de_outro_operador():
    # Sem esta conferência, o erro que apareceria seria o de chave única do
    # Postgres — que não diz a quem o código pertence nem o que fazer.
    with pytest.raises(db.CodigoInvalido) as erro:
        db.validar_codigo_acesso("new123", existentes=["NEW123", "ZZZ999"])
    assert "ja esta em uso" in str(erro.value)


def test_codigo_livre_passa_mesmo_havendo_outros():
    assert db.validar_codigo_acesso("QQQ777", existentes=["NEW123"]) == "QQQ777"


# ─── Validação na estação ─────────────────────────────────────────────────────

PERMS_IMPRESSOR = {"perm_imposicao_view": True, "perm_admin_view": False}


def _preparar_lista(tmp_path, acessos):
    acesso_local.ARQUIVO = str(tmp_path / "acessos_locais.json")
    acesso_local._erros_seguidos = 0
    assert acesso_local.salvar_lista(acessos)


def test_sem_arquivo_nao_exige_codigo(tmp_path):
    # Instalação nova, ou máquina que nunca alcançou a nuvem: a estação entra
    # como entrava antes, em vez de parar a produção por falta de rede.
    acesso_local.ARQUIVO = str(tmp_path / "nao_existe.json")
    assert acesso_local.ha_lista() is False
    assert acesso_local.validar("NEW123") is None


def test_codigo_certo_entra_com_as_permissoes(tmp_path):
    _preparar_lista(tmp_path, [{
        "nome": "Maria", "codigo": "NEW123",
        "role": "impressor", "permissoes": PERMS_IMPRESSOR,
    }])
    assert acesso_local.ha_lista() is True
    acesso = acesso_local.validar("new123")   # digitado em minúsculas
    assert acesso is not None
    assert acesso["nome"] == "Maria"
    assert acesso["role"] == "impressor"
    assert acesso["permissoes"] == PERMS_IMPRESSOR


def test_codigo_errado_nao_entra(tmp_path):
    _preparar_lista(tmp_path, [{"nome": "Maria", "codigo": "NEW123"}])
    assert acesso_local.validar("ZZZ999") is None
    assert acesso_local.validar("") is None


def test_acesso_inativo_nao_entra(tmp_path):
    _preparar_lista(tmp_path, [{"nome": "Joao", "codigo": "NEW123", "ativo": False}])
    assert acesso_local.validar("NEW123") is None


def test_desativar_o_ultimo_acesso_nao_libera_a_estacao(tmp_path):
    # Contar só os ativos produzia o oposto do que o administrador pediu: a lista
    # zerava, a estação concluía que não havia código nenhum e voltava a deixar
    # qualquer um entrar. Desativar tem de restringir, nunca liberar.
    _preparar_lista(tmp_path, [{"nome": "Joao", "codigo": "NEW123", "ativo": False}])
    assert acesso_local.ha_lista() is True


def test_lista_gravada_guarda_so_o_que_o_login_usa(tmp_path):
    _preparar_lista(tmp_path, [{
        "id": "uuid-qualquer",
        "nome": "Maria",
        "codigo": "new123",
        "role": "impressor",
        "permissoes": PERMS_IMPRESSOR,
        "criado_em": "2026-08-11T00:00:00Z",
    }])
    (gravado,) = acesso_local.carregar_lista()
    assert gravado == {
        "codigo": "NEW123", "nome": "Maria", "role": "impressor",
        "permissoes": PERMS_IMPRESSOR, "ativo": True,
    }


def test_retardo_liga_depois_de_erros_seguidos(tmp_path, monkeypatch):
    _preparar_lista(tmp_path, [{"nome": "Maria", "codigo": "NEW123"}])
    esperas = []
    monkeypatch.setattr(acesso_local.time, "sleep", lambda s: esperas.append(s))

    for _ in range(acesso_local.ERROS_ATE_RETARDO):
        assert acesso_local.validar("ZZZ999") is None
    assert esperas == []          # ainda dentro da margem

    assert acesso_local.validar("ZZZ999") is None
    assert esperas == [acesso_local.RETARDO_S]

    # Acertar zera o contador: quem errou e depois lembrou não fica de castigo.
    assert acesso_local.validar("NEW123") is not None
    assert acesso_local.validar("ZZZ999") is None
    # Duas esperas ao todo — a do acerto, que ainda estava em castigo, e nenhuma
    # depois dele: o erro seguinte passou direto.
    assert esperas == [acesso_local.RETARDO_S, acesso_local.RETARDO_S]
