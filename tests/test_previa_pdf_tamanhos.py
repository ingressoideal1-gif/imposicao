import os
import subprocess


def test_previa_pdf_preserva_tamanho_de_cada_pagina():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    resultado = subprocess.run(
        ['node', os.path.join(raiz, 'tests', 'previa_pdf_tamanhos_harness.js')],
        cwd=raiz, timeout=120, capture_output=True,
        text=True, encoding='utf-8', errors='replace',
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert 'OK:' in resultado.stdout
