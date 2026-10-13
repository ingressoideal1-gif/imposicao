"""Contrato do painel/motor, sem importar o servidor ou consultar dados reais."""
import ast
from pathlib import Path
import subprocess

import pytest

RAIZ = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('canal', ['producao', 'piloto'])
def test_endpoint_anuncia_recursos_compartilhados(canal, monkeypatch):
    import canais_newprod
    monkeypatch.setattr(canais_newprod, 'CANAL', canal)
    arvore = ast.parse((RAIZ / 'app.py').read_text(encoding='utf-8-sig'))
    funcao = next(n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == 'version_info')
    funcao.decorator_list = []
    namespace = {'LOCAL_AGENT_VERSION': 'NewProd sintetico', 'CANAL': canal}
    exec(compile(ast.Module(body=[funcao], type_ignores=[]), 'version_info_isolado', 'exec'), namespace)
    resposta = namespace['version_info']()
    assert resposta['canal'] == canal
    assert {'texto_banco_contorno_v1', 'escala_modelo_blocos_v1', 'integridade_impressao_v1',
            'qr_ideal_contrato_v2', 'multi_artes_pdf_duplex_unico'} <= set(resposta['capabilities'])


def test_painel_confere_motor_antes_de_enviar():
    resultado = subprocess.run(['node', str(RAIZ / 'tests/compatibilidade_motor_harness.cjs')],
                               cwd=RAIZ, capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
