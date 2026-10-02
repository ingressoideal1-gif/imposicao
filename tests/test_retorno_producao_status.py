"""Regressao do status consolidado no retorno da correcao para a producao."""
from pathlib import Path
import subprocess


def test_retorno_da_correcao_nao_reabre_aprovacao_e_recupera_status_interrompido():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / "retorno_producao_status_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK:" in resultado.stdout
