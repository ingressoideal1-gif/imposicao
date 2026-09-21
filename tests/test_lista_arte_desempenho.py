"""Regressões de concorrência, retry e preservação das amostras no navegador."""
from pathlib import Path
import subprocess


def test_lista_arte_desempenho():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "tests/lista_arte_desempenho_harness.js"], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "PASS browser:" in resultado.stdout
