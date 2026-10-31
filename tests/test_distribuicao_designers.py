"""Regras do painel e calendário, sem acesso a banco ou credenciais."""
import subprocess
from pathlib import Path


def test_distribuicao_designers():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests/distribuicao_designers_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
