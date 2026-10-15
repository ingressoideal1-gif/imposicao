import subprocess


def test_lotes_releitura_e_fotos_com_sessao():
    resultado = subprocess.run(
        ['node', 'tests/consultas_seguras_harness.js'],
        capture_output=True, text=True, encoding='utf-8', check=False,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
