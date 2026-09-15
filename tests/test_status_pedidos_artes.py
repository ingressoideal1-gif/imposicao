import subprocess


def test_status_consolidado_pedidos_artes():
    resultado = subprocess.run(
        ["node", "tests/status_pedidos_artes_harness.js"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "22 casos OK" in resultado.stdout
