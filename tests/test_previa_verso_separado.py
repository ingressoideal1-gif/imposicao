import os
import subprocess


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_a_previa_escolhe_o_arquivo_correto_para_cada_face():
    harness = os.path.join(RAIZ, 'tests', 'previa_verso_separado_harness.js')
    resultado = subprocess.run(
        ['node', harness], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding='utf-8', errors='replace',
    )
    assert resultado.returncode == 0, (resultado.stdout or '') + (resultado.stderr or '')
    assert 'OK:' in (resultado.stdout or '')
