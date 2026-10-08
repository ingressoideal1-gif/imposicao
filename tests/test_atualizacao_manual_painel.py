"""Regressao da atualizacao manual nos dois paineis, sem agentes reais."""
from pathlib import Path
import subprocess


def test_atualizacao_manual_nos_dois_paineis():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ['node', 'tests/atualizacao_manual_painel_harness.js'],
        cwd=raiz, capture_output=True, text=True, encoding='utf-8', timeout=60,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
