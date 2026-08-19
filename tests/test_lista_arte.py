# -*- coding: utf-8 -*-
"""Lista de Arte: pedido liberado para producao so aparece em "Pedidos Concluidos".

Quando o pedido e liberado, `liberarParaProducao()` grava EM PRODUCAO no
`status_interno` e ele passa a ser trabalho da Lista de Impressao. Antes desta
regra ele continuava contado nos cards "TODOS", "Em Arte" ou "Aprovados" e
continuava na tabela da Lista de Arte -- ou seja, aparecia como servico
pendente de arte um pedido que ja estava na maquina.

O harness de node roda a funcao LIDA do `script.js`, e nao uma copia dela.
"""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "lista_arte_harness.js")


def test_o_harness_da_lista_de_arte_passa():
    assert os.path.exists(HARNESS), "o harness da Lista de Arte sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
