# -*- coding: utf-8 -*-
"""A elevação de 15 minutos que separa operar de configurar.

Sem a senha do dono, a tela do evento é somente leitura — decisão do usuário em
13/08/2026. Este módulo é o pedaço criptográfico dessa regra: ele assina e
confere um bilhete curto, e não sabe de HTTP, de banco nem de quem é dono do quê.

## Por que elevação, e não sessão

O celular da portaria fica na mão do porteiro, e ele entra com a conta do
cliente. Uma autorização que não vence transformaria aquele aparelho num painel
de configuração permanente.

## Por que um segredo só para isto

Reaproveitar o `QR_PEDIDO_SEGREDO` funcionaria. Não vale: no dia em que um
segredo precisar ser trocado, trocar aquele invalidaria todo QR do Pedido em
circulação, inclusive os que já estão no WhatsApp dos clientes.
"""

import base64
import hashlib
import hmac
import os
import re
import time

import db

SEGREDO_ENV = "ACESSO_ELEVACAO_SEGREDO"

VALIDADE_MINUTOS = 15

# Mesmo tamanho do `qr_pedido.py`: 27 caracteres base64url são 162 bits, muito
# acima do necessário para impedir forja.
TAMANHO_ASSINATURA = 27

# O corpo assinado é montado por concatenação com pontos, então nenhum campo
# pode conter ponto — senão daria para deslocar os campos e fazer uma assinatura
# valer para outra combinação. UUID e identificador de navegador cabem aqui.
IDENTIFICADOR = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_SEGREDO_CACHE = None


def _segredo() -> bytes:
    global _SEGREDO_CACHE
    if _SEGREDO_CACHE is None:
        _SEGREDO_CACHE = os.environ.get(SEGREDO_ENV) or db.ler_env_local(SEGREDO_ENV)
    if not _SEGREDO_CACHE:
        raise RuntimeError(
            f"{SEGREDO_ENV} nao configurada. Sem ela nao ha como provar que a "
            "senha do dono foi conferida, e a tela ficaria somente leitura para "
            "sempre."
        )
    return _SEGREDO_CACHE.encode("utf-8")


def configurado() -> bool:
    """Se dá para emitir elevação neste servidor. Não levanta."""
    try:
        _segredo()
        return True
    except RuntimeError:
        return False


def _conferir_identificadores(*valores):
    for v in valores:
        if not IDENTIFICADOR.match(str(v or "")):
            raise ValueError("identificador invalido")


def _assinar(corpo: str) -> str:
    mac = hmac.new(_segredo(), corpo.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")[:TAMANHO_ASSINATURA]


def gerar(evento_id: str, conta_id: str, navegador: str,
          minutos: int = VALIDADE_MINUTOS) -> tuple:
    """`<evento>.<conta>.<navegador>.<vencimento>.<assinatura>` e o vencimento."""
    _conferir_identificadores(evento_id, conta_id, navegador)
    expira = int(time.time()) + int(minutos) * 60
    corpo = f"{evento_id}.{conta_id}.{navegador}.{expira}"
    return f"{corpo}.{_assinar(corpo)}", expira


def conferir(token: str, evento_id: str, conta_id: str, navegador: str) -> None:
    """Levanta `ValueError` dizendo o que houve. Silêncio é aprovação.

    A assinatura é recalculada sobre os valores que o CHAMADOR afirma, e não
    sobre os que vieram no token. Assim um bilhete emitido para outro evento,
    outra conta ou outro navegador simplesmente não bate — sem precisar de uma
    comparação campo a campo que alguém possa esquecer de escrever.

    A ordem é assinatura antes de validade, como no `qr_pedido.conferir`:
    conferir a validade primeiro contaria a quem estivesse tentando que aquele
    token existiu algum dia, e o vencimento é justamente o campo que o atacante
    controlaria no palpite.
    """
    _conferir_identificadores(evento_id, conta_id, navegador)

    partes = str(token or "").split(".")
    if len(partes) != 5 or not all(partes):
        raise ValueError("token malformado")
    expira = partes[3]
    if not expira.isdigit():
        raise ValueError("token malformado")

    corpo = f"{evento_id}.{conta_id}.{navegador}.{expira}"
    if not hmac.compare_digest(_assinar(corpo), partes[4]):
        raise ValueError("assinatura invalida")

    if int(expira) < time.time():
        raise ValueError("token vencido")
