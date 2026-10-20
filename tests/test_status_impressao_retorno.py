"""Persistência confirmada e filtros estáveis ao abrir/voltar do pedido."""
import subprocess
from pathlib import Path


def test_status_impressao_e_retorno_do_pedido():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests/status_impressao_retorno_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8",
        errors="replace", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
