import subprocess
from pathlib import Path


def test_numeracao_comum_aparece_nas_duas_janelas_do_pdf_paginado():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests" / "pdf_duplex_preview_numbering_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
