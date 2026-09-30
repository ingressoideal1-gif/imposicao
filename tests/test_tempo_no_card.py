# -*- coding: utf-8 -*-
"""Relogios de etapa persistidos pelo servidor, leitura e exibicao no painel."""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.mark.parametrize("harness", [
    "tempo_no_card_harness.js",
    "tempo_carga_harness.js",
    "tempo_persistencia_harness.js",
    "tempo_na_tela_harness.js",
])
def test_os_harness_do_tempo_no_card_passam(harness):
    caminho = os.path.join(RAIZ, "tests", harness)
    assert os.path.exists(caminho), "o harness " + harness + " sumiu"

    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
