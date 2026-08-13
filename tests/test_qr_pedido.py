# -*- coding: utf-8 -*-
"""O token do QR do Pedido: o que o atendente manda ao cliente por WhatsApp.

É a única porta de entrada do evento no aplicativo. Quem conseguisse fabricar um
token entraria em qualquer pedido do sistema — veria os setores, as quantidades,
e reivindicaria o evento de outro cliente para a conta dele.

Por isso ele é assinado com um segredo que vive só no servidor. O token carrega
o número do pedido em claro (não é segredo: está impresso no ingresso) e uma
assinatura que só o servidor sabe produzir.
"""

import time

import pytest

import qr_pedido


def test_o_token_devolve_o_pedido_de_volta():
    assert qr_pedido.conferir(qr_pedido.gerar(20272)) == 20272


def test_pedido_adulterado_e_recusado():
    """Trocar o número no token não pode dar acesso a outro pedido.

    É a tentativa mais óbvia: quem recebe o QR do pedido 20272 edita para 20273
    e tenta o evento do vizinho. A assinatura cobre o número, então não cola.
    """
    token = qr_pedido.gerar(20272)
    pedido, expira, assinatura = token.split(".")
    with pytest.raises(ValueError, match="assinatura"):
        qr_pedido.conferir(f"20273.{expira}.{assinatura}")


def test_validade_esticada_e_recusada():
    """Nem adiantar o vencimento para reviver um token velho."""
    token = qr_pedido.gerar(20272)
    pedido, expira, assinatura = token.split(".")
    esticado = str(int(expira) + 86400 * 365)
    with pytest.raises(ValueError, match="assinatura"):
        qr_pedido.conferir(f"{pedido}.{esticado}.{assinatura}")


def test_assinatura_adulterada_e_recusada():
    token = qr_pedido.gerar(20272)
    trocado = "a" if not token.endswith("a") else "b"
    with pytest.raises(ValueError, match="assinatura"):
        qr_pedido.conferir(token[:-1] + trocado)


def test_token_vencido_e_recusado():
    with pytest.raises(ValueError, match="venc"):
        qr_pedido.conferir(qr_pedido.gerar(20272, dias=-1))


def test_token_malformado_e_recusado():
    for lixo in ("", "abc", "20272", "20272.123", "a.b.c.d", "..", "20272..x"):
        with pytest.raises(ValueError):
            qr_pedido.conferir(lixo)


def test_segredo_diferente_nao_valida_o_token(monkeypatch):
    """A prova de que a assinatura depende mesmo do segredo."""
    token = qr_pedido.gerar(20272)
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", "outro segredo qualquer")
    with pytest.raises(ValueError, match="assinatura"):
        qr_pedido.conferir(token)


def test_sem_segredo_configurado_falha_alto(monkeypatch):
    """Nunca assinar com segredo vazio: seria o mesmo que não assinar."""
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", None)
    monkeypatch.setenv("QR_PEDIDO_SEGREDO", "")
    monkeypatch.setattr(qr_pedido.db, "ler_env_local", lambda *a, **k: None)
    with pytest.raises(RuntimeError, match="QR_PEDIDO_SEGREDO"):
        qr_pedido.gerar(20272)


def test_o_token_cabe_numa_url_sem_escape():
    """Ele vai dentro de um QR que o celular lê da tela ou do papel.

    Caractere que precise de escape aumenta a URL, aumenta a densidade do QR e
    piora a leitura — justamente no dia do evento, com pressa e luz ruim.
    """
    token = qr_pedido.gerar(20272)
    assert all(c.isalnum() or c in "-._~" for c in token), token
    assert len(token) < 60, f"token de {len(token)} caracteres deixaria o QR denso"


def test_a_comparacao_e_em_tempo_constante():
    """`==` em assinatura vaza o quanto do palpite estava certo.

    Com muitas tentativas dá para reconstruir a assinatura byte a byte medindo
    o tempo de resposta. `hmac.compare_digest` não tem esse vazamento.
    """
    import inspect
    fonte = inspect.getsource(qr_pedido)
    assert "compare_digest" in fonte


def test_o_segredo_nao_esta_escrito_no_codigo():
    """Segredo em arquivo versionado é o que o publicar.ps1 existe para barrar."""
    import inspect
    fonte = inspect.getsource(qr_pedido)
    assert "os.environ" in fonte or "ler_env_local" in fonte
