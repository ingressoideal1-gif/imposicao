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


def test_dashboard_arte_paginacao():
    resultado = subprocess.run(
        ["node", "tests/dashboard_arte_paginacao_harness.js"], cwd=ROOT,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK: quatro fontes acima de 1000" in resultado.stdout


def test_dashboard_reprovacoes():
    resultado = subprocess.run(
        ["node", "tests/dashboard_reprovacoes_harness.js"], cwd=ROOT,
        capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
