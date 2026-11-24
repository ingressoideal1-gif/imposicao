"""Regressões de carga, preservação e restauração das amostras."""
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


def test_lista_arte_restauracao_por_f5():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "--test", "tests/navegacao_arte_f5_harness.js", "tests/retomada_arte_dados_harness.js"], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
