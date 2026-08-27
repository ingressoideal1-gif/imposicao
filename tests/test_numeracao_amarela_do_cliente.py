# -*- coding: utf-8 -*-
"""A numeracao exclusiva do cliente sai amarela no seletor do modelo.

Pedido do usuario em 27/08/2026: na lista de arte, ao editar um pedido, as
numeracoes exclusivas daquele cliente aparecem em amarelo no dropdown de
Numeracao; as demais continuam brancas.

O dropdown ja misturava as duas familias -- o filtro do `renderAmostrasOSItens`
deixa passar o catalogo geral E as numeracoes com `Cli_Num` deste cliente -- e
nada as distinguia a nao ser o nome.

O harness de node roda as funcoes LIDAS do `script.js`, e nao copias delas.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "numeracao_amarela_do_cliente_harness.js")


def test_o_harness_da_numeracao_amarela_passa():
    assert os.path.exists(HARNESS), "o harness da numeracao amarela sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
