"""Exercita o checkbox e a composicao real de canvas sem rede."""
import subprocess
from pathlib import Path


def test_pdf_mesclar_no_painel_e_portal():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(["node", str(root / "tests/pdf_mesclar_browser_harness.js")],
                            cwd=root, capture_output=True, text=True,
                            encoding="utf-8", timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
