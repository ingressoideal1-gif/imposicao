"""Falhas de rede e recuperação da janela combinada, sem acesso externo."""
from pathlib import Path
import subprocess


def test_amostras_carga_recuperacao():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/amostras_carga_recuperacao_harness.js"], cwd=root,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
