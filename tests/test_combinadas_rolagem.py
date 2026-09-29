"""Rolagem, prioridade e ampliacao com recursos lentos, sem servicos reais."""
from pathlib import Path
import subprocess


def test_rolagem_nao_espera_downloads_de_outros_modelos():
    raiz = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/combinadas_rolagem_harness.js"], cwd=raiz,
        capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
