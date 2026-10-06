"""Base v2 determinística derivada da base mestra privada completa.

O SHA público não é a chave: o domínio vem ANTES dos bytes privados. Candidatos
HMAC-SHA256/counter de 40 bits em Base32; sem duplicatas nem códigos legados.
"""
import base64
import hashlib
import hmac

DOMINIO = b"Ideal Control QR12 private pool v1\x00"


def blocos(legado: bytes, quantidade: int):
    if len(legado) % 8 or quantidade < 1:
        raise ValueError("Base privada invalida")
    proibidos = {legado[i:i+8] for i in range(0, len(legado), 8)}
    chave = hashlib.sha256(DOMINIO + legado).digest()
    vistos = set()
    contador = 0
    buffer = bytearray()
    while len(vistos) < quantidade:
        bruto = hmac.digest(chave, contador.to_bytes(8, "big"), "sha256")[:5]
        contador += 1
        if bruto in vistos:
            continue
        codigo = base64.b32encode(bruto)
        if codigo in proibidos:
            continue
        vistos.add(bruto)
        buffer.extend(codigo)
        if len(buffer) >= 800000:
            yield bytes(buffer)
            buffer.clear()
    if buffer:
        yield bytes(buffer)
