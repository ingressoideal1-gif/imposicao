# -*- coding: utf-8 -*-
"""A coluna Pagamento da Lista de Arte, e a regra de "pago" que ela usa.

Pedido do usuário em 25/08/2026: uma coluna entre Status e Itens, com o carimbo
PAGO nos pedidos sinalizados como pagos.

## O que estas conferências prendem

A pergunta "este pedido está pago?" é feita em DOIS lugares — a aba 💳 Pagar do
link do cliente e esta coluna. Duas respostas diferentes sobre o mesmo dinheiro
fariam o cliente e a gráfica verem coisas diferentes, com a gráfica descobrindo
por último. Por isso a regra mora em `frontend/pagamento-do-pedido.js`, e o
harness prende que as duas telas continuam bebendo dali.

O resto é o que é fácil desfazer sem perceber: a posição da coluna nas duas
telas que têm a tabela (`index.html` e `producao.html`), o plano B de quando o
carimbo não carrega, e a consulta trazendo só `id_int` e `status`.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "pagamento_do_pedido_harness.js")


def test_o_harness_da_coluna_pagamento_passa():
    assert os.path.exists(HARNESS), "o harness da coluna Pagamento sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida
