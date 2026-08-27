# -*- coding: utf-8 -*-
"""O catalogo e o editor sabem dizer que uma numeracao e exclusiva de cliente.

Pedido do usuario em 27/08/2026, em quatro partes: um drop no catalogo com o
estado que faltava (ver so as exclusivas); nessa opcao, todas elas com preview e
o NUMERO do cliente; uma diferenciacao de cor ao editar uma exclusiva; e a opcao
de transformar a exclusiva em padrao, duplicando.

O harness de node roda as funcoes LIDAS do `script.js`, e nao copias delas.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "numeracoes_exclusivas_no_catalogo_harness.js")


def test_o_harness_das_exclusivas_no_catalogo_passa():
    assert os.path.exists(HARNESS), "o harness das exclusivas no catalogo sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
