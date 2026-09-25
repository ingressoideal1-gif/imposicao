"""Retorno para o designer sem exigir uma reprovacao manual anterior."""
from pathlib import Path
import subprocess


def test_voltar_para_arte_confirma_fila_e_preserva_fluxos():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", "tests/voltar_para_arte_harness.js"], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
