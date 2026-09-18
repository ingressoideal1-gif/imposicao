import subprocess
from pathlib import Path


def test_portal_duplica_pagina_no_verso():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / "cliente_pdf_duplicate_back_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
