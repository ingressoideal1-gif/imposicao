# -*- coding: utf-8 -*-
"""Os quatro harnesses do Portal do Pedido, rodando na suite.

## Por que este arquivo existe

Cada harness `.js` deste projeto e executado por um `test_*.py` que o chama com
`node` -- e assim ele entra na suite e ninguem precisa lembrar de roda-lo a mao.
Os quatro do Portal do Pedido nasceram sem esse par: em 25/08/2026 uma varredura
mostrou que `portal_abas`, `portal_dados`, `portal_confirmacoes` e
`portal_orcamento` nao eram citados por nenhum arquivo de teste. Eram 250
conferencias escritas com cuidado, que so rodavam quando alguem digitava
`node tests/portal_dados_harness.js` -- ou seja, quase nunca.

Um teste que nao roda nao prende nada. Foi por isso que este arquivo apareceu no
mesmo dia em que a conferencia geral do link do cliente consertou seis defeitos:
sem ele, as travas escritas para esses consertos nasceriam mortas junto.

## Como um harness relata

Ele sai com codigo 0 e imprime uma linha comecando por `OK:` ou terminando em
`verificacoes passaram.`. Falhou, sai com codigo diferente de zero e imprime o
que falhou -- e e isso que aparece aqui.
"""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HARNESSES = [
    "portal_abas_harness.js",
    "portal_dados_harness.js",
    "portal_confirmacoes_harness.js",
    "portal_orcamento_harness.js",
]


@pytest.mark.parametrize("nome", HARNESSES)
def test_o_harness_do_portal_passa(nome):
    caminho = os.path.join(RAIZ, "tests", nome)
    assert os.path.exists(caminho), "o harness " + nome + " sumiu"

    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, nome + " falhou:\n" + saida
    assert "OK:" in saida or "passaram" in saida, (
        nome + " nao relatou sucesso:\n" + saida
    )
