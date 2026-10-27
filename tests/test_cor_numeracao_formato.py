"""Reconciliacao e recarga do ERP com dados sinteticos."""
import subprocess
from pathlib import Path


def test_personalizacao_de_outro_formato_e_recarga():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ['node', str(raiz / 'tests/cor_numeracao_formato_harness.js')],
        cwd=raiz, capture_output=True, text=True, encoding='utf-8', timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr


def test_reabertura_preserva_numeracao_compativel_com_verso():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ['node', str(raiz / 'tests/numeracao_verso_reabertura_harness.js')],
        cwd=raiz, capture_output=True, text=True, encoding='utf-8', timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
