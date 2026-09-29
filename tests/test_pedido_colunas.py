"""Bancos manuais do pedido: edição, persistência simulada e interação no Chromium."""
from pathlib import Path
import subprocess

import pytest

RAIZ = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("arquivo", [
    "pedido_colunas_harness.js",
    "pedido_colunas_browser_harness.js",
])
def test_editor_de_colunas_do_pedido(arquivo):
    resultado = subprocess.run(
        ["node", str(RAIZ / "tests" / arquivo)], cwd=RAIZ,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
