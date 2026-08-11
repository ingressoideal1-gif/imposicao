# -*- coding: utf-8 -*-
"""Acesso local ao NewProd: geração do código e validação na estação."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db
import acesso_local


# ─── Geração do código ────────────────────────────────────────────────────────

def test_codigo_tem_seis_caracteres_do_alfabeto_seguro():
    codigo = db.gerar_codigo_acesso([])
    assert len(codigo) == 6
    assert all(c in db.ALFABETO_CODIGO_ACESSO for c in codigo)


def test_codigo_nao_usa_caracteres_ambiguos():
    # O código é ditado por telefone: O/0 e I/1 viram erro de digitação.
    for proibido in "O0I1":
        assert proibido not in db.ALFABETO_CODIGO_ACESSO


def test_codigo_nunca_repete_um_ja_existente():
    # Alfabeto de um caractere só deixa uma combinação possível de 6 posições,
    # então bloquear essa única combinação obriga o gerador a desistir.
    alfabeto_original = db.ALFABETO_CODIGO_ACESSO
    try:
        db.ALFABETO_CODIGO_ACESSO = "A"
        try:
            db.gerar_codigo_acesso(["AAAAAA"])
            assert False, "deveria ter desistido em vez de devolver um código repetido"
        except RuntimeError:
            pass
    finally:
        db.ALFABETO_CODIGO_ACESSO = alfabeto_original


def test_normalizar_aceita_o_que_o_operador_digita():
    assert db.normalizar_codigo_acesso(" a2b 4c6 ") == "A2B4C6"
    assert db.normalizar_codigo_acesso(None) == ""


# ─── Validação na estação ─────────────────────────────────────────────────────

def _preparar_lista(tmp_path, acessos):
    acesso_local.ARQUIVO = str(tmp_path / "acessos_locais.json")
    acesso_local._erros_seguidos = 0
    assert acesso_local.salvar_lista(acessos)


def test_sem_arquivo_nao_exige_codigo(tmp_path):
    # Instalação nova, ou máquina que nunca alcançou a nuvem: a estação entra
    # como entrava antes, em vez de parar a produção por falta de rede.
    acesso_local.ARQUIVO = str(tmp_path / "nao_existe.json")
    assert acesso_local.ha_lista() is False
    assert acesso_local.validar("A2B4C6") is None


def test_codigo_certo_entra(tmp_path):
    _preparar_lista(tmp_path, [{"nome": "Maria", "codigo": "A2B4C6", "is_admin": True}])
    assert acesso_local.ha_lista() is True
    acesso = acesso_local.validar("a2b4c6")   # digitado em minúsculas
    assert acesso is not None
    assert acesso["nome"] == "Maria"
    assert acesso["is_admin"] is True


def test_codigo_errado_nao_entra(tmp_path):
    _preparar_lista(tmp_path, [{"nome": "Maria", "codigo": "A2B4C6"}])
    assert acesso_local.validar("Z9Z9Z9") is None
    assert acesso_local.validar("") is None


def test_acesso_inativo_nao_entra(tmp_path):
    _preparar_lista(tmp_path, [{"nome": "Joao", "codigo": "A2B4C6", "ativo": False}])
    assert acesso_local.ha_lista() is False
    assert acesso_local.validar("A2B4C6") is None


def test_lista_gravada_guarda_so_o_que_o_login_usa(tmp_path):
    _preparar_lista(tmp_path, [{
        "id": "uuid-qualquer",
        "nome": "Maria",
        "codigo": "a2b4c6",
        "is_admin": False,
        "criado_em": "2026-08-11T00:00:00Z",
    }])
    (gravado,) = acesso_local.carregar_lista()
    assert gravado == {"codigo": "A2B4C6", "nome": "Maria", "is_admin": False, "ativo": True}


def test_retardo_liga_depois_de_erros_seguidos(tmp_path, monkeypatch):
    _preparar_lista(tmp_path, [{"nome": "Maria", "codigo": "A2B4C6"}])
    esperas = []
    monkeypatch.setattr(acesso_local.time, "sleep", lambda s: esperas.append(s))

    for _ in range(acesso_local.ERROS_ATE_RETARDO):
        assert acesso_local.validar("Z9Z9Z9") is None
    assert esperas == []          # ainda dentro da margem

    assert acesso_local.validar("Z9Z9Z9") is None
    assert esperas == [acesso_local.RETARDO_S]

    # Acertar zera o contador: quem errou e depois lembrou não fica de castigo.
    assert acesso_local.validar("A2B4C6") is not None
    assert acesso_local.validar("Z9Z9Z9") is None
    # Duas esperas ao todo — a do acerto, que ainda estava em castigo, e nenhuma
    # depois dele: o erro seguinte passou direto.
    assert esperas == [acesso_local.RETARDO_S, acesso_local.RETARDO_S]
