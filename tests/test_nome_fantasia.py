import os
import subprocess


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "nome_fantasia_harness.js")


def test_nome_fantasia_e_prioritario_em_todas_as_listas():
    resultado = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert resultado.returncode == 0, (resultado.stdout or "") + (resultado.stderr or "")
    assert "OK:" in (resultado.stdout or "")
