"""Regressao local de copia/colagem, sem dados reais ou integracoes."""
from pathlib import Path
import subprocess


def test_copiar_colar_modelos():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/copiar_colar_modelos_harness.cjs"], cwd=root,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
