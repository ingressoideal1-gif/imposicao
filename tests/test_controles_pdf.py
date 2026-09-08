"""Regressao dos controles multipaginas com navegador e dados sinteticos."""
import subprocess
from pathlib import Path


def test_controles_pdf():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / "controles_pdf_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=120,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK:" in resultado.stdout
