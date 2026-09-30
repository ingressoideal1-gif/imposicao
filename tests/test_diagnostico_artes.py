"""Coleta opt-in, contratos da fila e recuperação parcial, com dados sintéticos."""
from pathlib import Path
import subprocess


def test_diagnostico_artes():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", "tests/diagnostico_artes_harness.js"], cwd=root,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
