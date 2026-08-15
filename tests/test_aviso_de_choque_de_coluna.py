# -*- coding: utf-8 -*-
"""O aviso de choque de coluna do QR Ideal tem de chegar ao operador, não só ao console.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Dois modelos do mesmo pedido cujos ids terminam nos mesmos dois dígitos caem na mesma coluna
do pool e sairiam com QRs **idênticos no mesmo evento** — o único choque que o número do
pedido no QR não separa. O motor só confere isso dentro de uma folha `multi_artes`; dois
modelos impressos em trabalhos separados dependem do aviso do painel, que confere o pedido
inteiro ao carregar os modelos.

Até 15/08/2026 esse aviso chamava `showToast(...)`, uma função que **não existe em lugar
nenhum do frontend** — a função de aviso deste projeto chama-se `toast`. Como a chamada
estava atrás de `if (typeof showToast === 'function')`, ela falhava em silêncio: o choque
ia para `console.warn`, que ninguém lê durante uma tiragem, e a documentação afirmava "o
painel avisa sobre o pedido inteiro". A auditoria da documentação foi o que achou.

Um aviso que não aparece é pior que aviso nenhum, porque quem escreveu o código acha que a
proteção existe.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"


def test_nenhum_arquivo_do_frontend_chama_uma_funcao_de_aviso_que_nao_existe():
    """`showToast` nunca foi definida. Qualquer chamada a ela é um aviso que
    some — ou, sem o guard, um erro em produção."""
    culpados = []
    for arquivo in sorted(FRONT.glob("*.js")):
        for numero, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\bshowToast\s*\(", linha) and not linha.strip().startswith("//"):
                culpados.append(f"{arquivo.name}:{numero}")
    assert not culpados, (
        "chamada a showToast(), que nao existe — o aviso some em silencio:\n  "
        + "\n  ".join(culpados)
    )


def test_o_choque_de_coluna_chega_ao_operador_pelo_toast():
    """A função existe, se chama `toast`, e o choque de coluna a usa sem guard."""
    corpo = (FRONT / "script.js").read_text(encoding="utf-8")
    assert re.search(r"^function toast\(", corpo, re.M), "a funcao de aviso `toast` sumiu"

    m = re.search(r"function conferirColunasQrIdealDosPedidos\(\)\s*\{.*?\n\}", corpo, re.S)
    assert m, "conferirColunasQrIdealDosPedidos nao existe mais"
    trecho = m.group(0)
    assert re.search(r"^\s*toast\(", trecho, re.M), (
        "o choque de coluna do QR Ideal nao chama toast() — o operador nao e avisado"
    )
    assert "typeof toast" not in trecho, (
        "o aviso esta atras de um `typeof` guard; se a funcao sumir, o choque volta a "
        "falhar em silencio em vez de estourar onde alguem veja"
    )
