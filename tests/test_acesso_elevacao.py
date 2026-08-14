# -*- coding: utf-8 -*-
"""A elevação de 15 minutos: só criptografia, sem HTTP e sem banco.

O celular fica na mão do porteiro, e ele entra com a conta do cliente — é assim
que a parte 2 desenhou o acesso. A senha do dono é o que separa OPERAR de
CONFIGURAR, e por isso ela precisa ser reapresentada de tempos em tempos, em vez
de virar uma sessão que nunca vence.

Este módulo não sabe de evento nem de usuário: recebe três identificadores e uma
validade, assina, e depois confere. Quem decide se aquele evento é daquela conta
é o `acesso_config.py`.
"""

import time

import pytest

import acesso_elevacao as ae

EVENTO = "11111111-1111-1111-1111-111111111111"
CONTA = "22222222-2222-2222-2222-222222222222"
NAV = "33333333-3333-3333-3333-333333333333"


@pytest.fixture(autouse=True)
def segredo(monkeypatch):
    monkeypatch.setattr(ae, "_SEGREDO_CACHE", "segredo-de-teste-com-tamanho-suficiente")


def test_o_token_recem_emitido_confere():
    token, expira = ae.gerar(EVENTO, CONTA, NAV)
    ae.conferir(token, EVENTO, CONTA, NAV)          # não levanta
    assert expira > time.time()


def test_assinatura_adulterada_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token[:-1] + ("A" if token[-1] != "A" else "B"), EVENTO, CONTA, NAV)


def test_token_vencido_e_recusado():
    token, _ = ae.gerar(EVENTO, CONTA, NAV, minutos=-1)
    with pytest.raises(ValueError, match="token vencido"):
        ae.conferir(token, EVENTO, CONTA, NAV)


def test_elevacao_de_outro_navegador_e_recusada():
    """A trava que existe porque o aparelho fica na mao do porteiro."""
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, EVENTO, CONTA, "44444444-4444-4444-4444-444444444444")


def test_elevacao_de_outro_evento_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, "55555555-5555-5555-5555-555555555555", CONTA, NAV)


def test_elevacao_de_outra_conta_e_recusada():
    token, _ = ae.gerar(EVENTO, CONTA, NAV)
    with pytest.raises(ValueError, match="assinatura invalida"):
        ae.conferir(token, EVENTO, "66666666-6666-6666-6666-666666666666", NAV)


def test_token_com_numero_de_partes_errado_e_malformado():
    for ruim in ("", "a.b.c", "a.b.c.d.e.f", None):
        with pytest.raises(ValueError, match="token malformado"):
            ae.conferir(ruim, EVENTO, CONTA, NAV)


def test_ponto_no_identificador_e_recusado_antes_de_assinar():
    """A armadilha de montar o corpo assinado por concatenacao.

    O `navegador` vem do navegador do cliente. Se ele pudesse conter um ponto,
    daria para deslocar os campos dentro do corpo assinado e fazer uma assinatura
    valer para outra combinacao de evento e conta.
    """
    with pytest.raises(ValueError, match="identificador invalido"):
        ae.gerar(EVENTO, CONTA, "aa.bb")
    with pytest.raises(ValueError, match="identificador invalido"):
        ae.conferir("x.y.z.1.2", EVENTO, CONTA, "aa.bb")


def test_sem_segredo_configurado_nao_assina(monkeypatch):
    """Falha FECHADA. Assinar com segredo vazio pareceria protegido."""
    monkeypatch.setattr(ae, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(ae.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(ae.SEGREDO_ENV, raising=False)
    assert ae.configurado() is False
    with pytest.raises(RuntimeError, match=ae.SEGREDO_ENV):
        ae.gerar(EVENTO, CONTA, NAV)


def test_a_validade_padrao_e_de_quinze_minutos():
    assert ae.VALIDADE_MINUTOS == 15
    _token, expira = ae.gerar(EVENTO, CONTA, NAV)
    assert 14 * 60 < expira - time.time() <= 15 * 60
