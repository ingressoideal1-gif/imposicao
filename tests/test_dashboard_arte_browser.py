from pathlib import Path
import os
import subprocess


ROOT = Path(__file__).resolve().parents[1]


def test_dashboard_arte_no_navegador():
    env = os.environ.copy()
    dependencias = ROOT / "node_modules"
    if not dependencias.exists():
        dependencias = ROOT.parent / "ideal-imposition" / "node_modules"
    env["NODE_PATH"] = str(dependencias)
    resultado = subprocess.run(
        ["node", str(ROOT / "tests" / "dashboard_arte_browser_harness.js")],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "dashboard_arte_browser_harness: ok" in resultado.stdout
