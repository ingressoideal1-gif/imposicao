"""Quantidade do modelo pertence ao ERP; faixa do PDF é temporária."""
import pathlib
import subprocess


def test_quantidade_erp():
    raiz = pathlib.Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ['node', str(raiz / 'tests/quantidade_erp_harness.js')],
        cwd=raiz, capture_output=True, text=True, encoding='utf-8', timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
