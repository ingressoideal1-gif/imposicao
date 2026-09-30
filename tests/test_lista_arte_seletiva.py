"""Leitura ativa, historico sob demanda e concorrencia, sem servicos reais."""
from pathlib import Path
import subprocess


def test_lista_arte_seletiva():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/lista_arte_seletiva_harness.js"], cwd=root,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
