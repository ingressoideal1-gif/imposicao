import subprocess


def test_duas_abas_nao_desfazem_arte_pronta():
    resultado = subprocess.run(
        ['node', 'tests/arte_transicao_browser_harness.js'],
        capture_output=True, text=True, encoding='utf-8', timeout=60,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert 'OK: duas abas' in resultado.stdout
