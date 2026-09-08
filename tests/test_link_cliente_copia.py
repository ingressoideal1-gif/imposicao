"""Regressões do botão de link, com DOM e banco simulados no Node."""
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("harness", [
    "link_cliente_copia_harness.js",
    "link_cliente_copia_browser_harness.js",
])
def test_geracao_e_copia_do_link_cliente(harness):
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / harness)],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK:" in resultado.stdout
