"""Confere o cabeçalho do modelo no portal com dados sintéticos."""
from pathlib import Path
import subprocess


def test_as_informacoes_do_modelo_no_portal():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "tests/cliente_modelo_informacoes_harness.js"],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK:" in resultado.stdout
