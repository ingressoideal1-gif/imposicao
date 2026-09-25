import subprocess


def test_prontidao_exige_paginas_compativeis_com_quantidade_e_modo():
    result = subprocess.run(
        ["node", "tests/arte_pronta_pdf_harness.js"],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "24 casos OK" in result.stdout
