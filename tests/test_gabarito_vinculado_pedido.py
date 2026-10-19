"""Regressao do filtro de gabaritos na impressao individual; dados sinteticos."""
import subprocess
from pathlib import Path


def test_gabarito_vinculado_com_cliente_de_faturamento_diferente():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', 'tests/gabarito_vinculado_pedido_harness.js'],
        cwd=root, capture_output=True, text=True, encoding='utf-8', timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
