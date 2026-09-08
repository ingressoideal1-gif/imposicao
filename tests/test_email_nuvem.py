"""Integração do painel com e-mail na nuvem, sem rede ou credenciais reais."""
import subprocess
from pathlib import Path


def test_envio_do_painel_sem_newprod():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "tests/email_envio_harness.js"], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
