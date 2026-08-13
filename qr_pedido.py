# -*- coding: utf-8 -*-
"""O token do QR do Pedido: assinar e conferir. Não sabe de HTTP nem de banco.

O atendente gera este QR no painel do pedido e manda ao cliente. É a **única**
porta de entrada do evento no aplicativo: o cliente abre a câmera, lê, e o app
troca o token pelo esqueleto do evento.

## O que o QR carrega, e o que não carrega

Carrega o número do pedido, uma validade e uma assinatura. Só isso.

**Não carrega os dados do evento** — nem o nome dos setores, nem as
quantidades. Isso é decisão de arquitetura, não economia de bytes: neste
projeto o que o parceiro escreve no banco é a origem da verdade, e um QR com a
lista de setores dentro continuaria afirmando a quantidade velha depois que o
pedido mudasse no ERP. O app lê o pedido do token e busca o resto na hora.

O número do pedido ir em claro não é vazamento: ele está impresso no próprio
ingresso. O que protege é a assinatura, que só o servidor sabe produzir.

## O que este módulo NÃO faz

Não sabe de revogação. Gerar um QR novo para o mesmo pedido invalida o
anterior, e quem guarda esse estado é a coluna `qr_revogado_em` de
`producao_acesso_pedidos` — conferida pelo `acesso_api.py`. Aqui é só
criptografia: um token pode ser criptograficamente válido e mesmo assim estar
revogado.
"""

import base64
import hashlib
import hmac
import os
import time

import db

SEGREDO_ENV = "QR_PEDIDO_SEGREDO"

# 27 caracteres base64url são 162 bits de assinatura. Muito acima do necessário
# para impedir forja, e curto o bastante para o QR não ficar denso — ele vai ser
# lido de uma tela de celular, às vezes de uma foto de WhatsApp.
TAMANHO_ASSINATURA = 27

VALIDADE_PADRAO_DIAS = 180

_SEGREDO_CACHE = None


def _segredo() -> bytes:
    """O segredo do servidor. Ambiente primeiro, `.env.local` depois.

    Falha alto se não existir. Assinar com segredo vazio seria pior do que não
    assinar: pareceria protegido.
    """
    global _SEGREDO_CACHE
    if _SEGREDO_CACHE is None:
        _SEGREDO_CACHE = os.environ.get(SEGREDO_ENV) or db.ler_env_local(SEGREDO_ENV)
    if not _SEGREDO_CACHE:
        raise RuntimeError(
            f"{SEGREDO_ENV} nao configurada. Sem ela qualquer um fabricaria um QR "
            "para qualquer pedido do sistema."
        )
    return _SEGREDO_CACHE.encode("utf-8")


def configurado() -> bool:
    """Se dá para gerar QR neste servidor. Não levanta."""
    try:
        _segredo()
        return True
    except RuntimeError:
        return False


def _assinar(corpo: str) -> str:
    mac = hmac.new(_segredo(), corpo.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")[:TAMANHO_ASSINATURA]


def gerar(pedido_id_int: int, dias: int = VALIDADE_PADRAO_DIAS) -> str:
    """`<pedido>.<vencimento>.<assinatura>` — pronto para ir numa URL."""
    corpo = f"{int(pedido_id_int)}.{int(time.time()) + int(dias) * 86400}"
    return f"{corpo}.{_assinar(corpo)}"


def conferir(token: str) -> int:
    """Devolve o número do pedido, ou levanta `ValueError` dizendo por quê.

    A ordem importa: **assinatura antes de validade**. Conferir a validade
    primeiro contaria, para quem estivesse tentando, se aquele token existiu
    algum dia — e o vencimento é um campo que o atacante controla no palpite.
    """
    partes = str(token or "").split(".")
    if len(partes) != 3 or not all(partes):
        raise ValueError("token malformado")
    pedido, expira, assinatura = partes
    if not pedido.isdigit() or not expira.isdigit():
        raise ValueError("token malformado")

    # A assinatura cobre pedido E vencimento: não adianta trocar o número para
    # entrar no evento do vizinho, nem esticar a data para reviver um token.
    if not hmac.compare_digest(_assinar(f"{pedido}.{expira}"), assinatura):
        raise ValueError("assinatura invalida")

    if int(expira) < time.time():
        raise ValueError("token vencido")

    return int(pedido)
