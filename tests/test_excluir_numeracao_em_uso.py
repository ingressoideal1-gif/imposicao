# -*- coding: utf-8 -*-
"""Excluir uma numeracao diz em que pedidos ela esta em uso, e de quando eles sao.

Pedido do usuario em 27/08/2026. Ate entao a pergunta era "Excluir esta
numeracao?" e mais nada: o registro saia do `producao_numeracoes` e os modelos
que apontavam para ele ficavam com um `amostra_num_id` que nao resolve mais --
perdem numero, QR e codigo de barras, sem aviso nenhum. Quem descobre e o
operador, no papel.

A lista e por PEDIDO, e nao por modelo, porque e assim que o usuario reconhece
o trabalho. A data sai de `propostas.created_at`.

O harness de node roda as funcoes LIDAS do `script.js`, e nao copias delas.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "excluir_numeracao_em_uso_harness.js")


def test_o_harness_da_exclusao_em_uso_passa():
    assert os.path.exists(HARNESS), "o harness da exclusao em uso sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
