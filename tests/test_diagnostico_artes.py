"""Coleta opt-in, contratos da fila e recuperação parcial, com dados sintéticos."""
from pathlib import Path
import subprocess
import pytest


@pytest.mark.parametrize("harness", ["diagnostico_artes_harness.js", "diagnostico_rede_artes_harness.js"])
def test_diagnostico_artes(harness):
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/" + harness], cwd=root,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
