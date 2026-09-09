"""A numeração atual prevalece sobre o verso antigo do modelo (pedido 21894)."""
import subprocess
from pathlib import Path


def test_portal_e_painel_respeitam_a_numeracao_atual():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / "cliente_verso_atual_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8",
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
