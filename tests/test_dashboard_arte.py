from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def test_dashboard_arte_harness():
    resultado = subprocess.run(
        ["node", str(ROOT / "tests" / "dashboard_arte_harness.js")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "dashboard_arte_harness: ok" in resultado.stdout
