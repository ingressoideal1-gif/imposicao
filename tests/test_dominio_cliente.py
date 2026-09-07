"""Links publicos usam o dominio canonico mesmo no painel local ou legado."""
from pathlib import Path
import subprocess


def test_dominio_dos_links_cliente():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["node", str(root / "tests/dominio_cliente_harness.js")],
        cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK:" in result.stdout
