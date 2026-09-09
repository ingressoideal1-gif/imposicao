"""Regressao: acrescentar modelos nao herda a arte do produto compartilhado."""
import subprocess
from pathlib import Path


def test_modelos_novos_sem_arte():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests/modelos_novos_sem_arte_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
