# -*- coding: utf-8 -*-
"""A portaria como aplicativo instalado no celular do porteiro.

O que estes testes protegem: que o aparelho INSTALE (manifesto e icones
validos), que ele ABRA SEM REDE depois de instalado, e que uma publicacao nova
chegue ao aparelho em vez de ficar presa na versao do dia da instalacao.
"""

import json
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Icones ──────────────────────────────────────────────────────────────────

ICONES_ESPERADOS = [
    ("frontend/icones/portaria-192.png", 192),
    ("frontend/icones/portaria-512.png", 512),
    ("frontend/icones/portaria-192-maskable.png", 192),
    ("frontend/icones/portaria-512-maskable.png", 512),
    ("frontend/apple-touch-icon.png", 180),
]


@pytest.mark.parametrize("caminho,lado", ICONES_ESPERADOS)
def test_o_icone_existe_e_e_quadrado(caminho, lado):
    from PIL import Image

    completo = os.path.join(RAIZ, caminho)
    assert os.path.exists(completo), (
        caminho + " nao existe. Rode: .\\venv\\Scripts\\python.exe "
        "ferramentas\\gerar_icones_pwa.py"
    )
    with Image.open(completo) as im:
        assert im.size == (lado, lado), f"{caminho} deveria ser {lado}x{lado}"


@pytest.mark.parametrize("caminho,_lado", ICONES_ESPERADOS)
def test_o_icone_e_opaco(caminho, _lado):
    """Sem canal alfa, de proposito.

    Um "maskable" com fundo transparente aparece como marca solta e cortada
    dentro da mascara do Android; o icone do iPhone com transparencia e
    composto sobre PRETO, e a marca escura some.
    """
    from PIL import Image

    with Image.open(os.path.join(RAIZ, caminho)) as im:
        assert im.mode == "RGB", f"{caminho} deveria ser opaco (RGB), veio {im.mode}"
