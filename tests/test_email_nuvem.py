"""Integração do painel com e-mail na nuvem, sem rede ou credenciais reais."""
import subprocess
from pathlib import Path
import pytest


@pytest.mark.parametrize("harness", ["email_envio_harness.js", "email_campos_browser_harness.js", "email_banner_browser_harness.js"])
def test_envio_do_painel_sem_newprod(harness):
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "tests/" + harness], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
