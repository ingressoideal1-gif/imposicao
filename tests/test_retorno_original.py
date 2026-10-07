import ast
import os
from pathlib import Path
from types import SimpleNamespace
import pytest
import retorno_original as retorno


@pytest.fixture
def estacao(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    monkeypatch.setattr(retorno.socket, 'gethostname', lambda: 'GUSTAVO-PROD')
    import migracao_estacao
    monkeypatch.setattr(migracao_estacao, 'proteger_pasta', lambda _: None)
    raiz = tmp_path / 'NewProd Agent'
    raiz.mkdir()
    (raiz / 'NewProd.exe').write_bytes(b'executavel-anterior-sintetico')
    (raiz / 'agent_config.json').write_text('{"agent_id":"identidade-sintetica"}')
    return raiz


def test_retorno_preserva_exe_identidade_e_configuracoes(estacao):
    etapas = []
    dados = (estacao / 'agent_config.json').read_bytes()
    assert retorno.preparar(estacao, conferir=lambda _: etapas.append('ocioso'),
        backup=lambda *_: etapas.append('backup'), preservar=lambda _: etapas.append('preservar')) == 0
    assert etapas == ['ocioso', 'backup', 'preservar', 'ocioso']
    copias = list((estacao.parent / 'NewProd Dados Protegidos' / 'retorno-original').glob('*.exe'))
    assert len(copias) == 1
    assert copias[0].read_bytes() == (estacao / 'NewProd.exe').read_bytes()
    assert (estacao / 'agent_config.json').read_bytes() == dados


def test_ocupado_aborta_antes_de_backup_ou_modificacao(estacao):
    def ocupado(_):
        raise ValueError('ocupado')
    with pytest.raises(ValueError, match='ocupado'):
        retorno.preparar(estacao, conferir=ocupado, backup=lambda *_: pytest.fail('backup indevido'))
    assert not (estacao.parent / 'NewProd Dados Protegidos').exists()


def test_estacao_diferente_recusada(estacao, monkeypatch):
    monkeypatch.setattr(retorno.socket, 'gethostname', lambda: 'LASER-01')
    with pytest.raises(ValueError, match='somente para GUSTAVO-PROD'):
        retorno.preparar(estacao, conferir=lambda _: pytest.fail('estacao incorreta'))


def test_backup_falha_impede_troca(estacao):
    def falha(*_):
        raise OSError('disco sintetico cheio')
    with pytest.raises(OSError):
        retorno.preparar(estacao, conferir=lambda _: None, backup=falha,
                         preservar=lambda _: pytest.fail('nao deve continuar'))
    assert (estacao / 'NewProd.exe').read_bytes() == b'executavel-anterior-sintetico'


def test_entrada_remove_ambiente_piloto(monkeypatch):
    from agent_original_retorno import configurar
    monkeypatch.setenv('NEWPROD_CANAL', 'oficial')
    monkeypatch.setenv('NEWPROD_PILOTO_LOCAL', '1')
    monkeypatch.setenv('NEWPROD_PILOTO_TOKEN', 'sintetico')
    monkeypatch.setenv('NEWPROD_RETORNO_ORIGINAL', '0')
    configurar()
    assert os.environ['NEWPROD_CANAL'] == 'producao'
    assert os.environ['NEWPROD_RETORNO_ORIGINAL'] == '1'
    assert 'NEWPROD_PILOTO_LOCAL' not in os.environ
    assert 'NEWPROD_PILOTO_TOKEN' not in os.environ


@pytest.mark.parametrize('nome', ['consultar_manifesto', 'verificar_atualizacao',
                                   '_verificar_atualizacao_ociosa', 'sincronizar_painel'])
def test_retorno_nao_consulta_rede_nem_instala_manifesto_piloto(nome):
    # Executa as funcoes reais isoladas, sem importar worker (que le configuracao).
    tree = ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == nome)
    scope = {'os': SimpleNamespace(environ={'NEWPROD_RETORNO_ORIGINAL': '1'})}
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'agent_worker.py', 'exec'), scope)
    result = scope[nome]()
    if nome == 'consultar_manifesto':
        assert result['ha_atualizacao'] is False
    else:
        assert not result


def test_painel_embutido_no_retorno():
    tree = ast.parse(Path('app.py').read_text(encoding='utf-8'))
    cond = next(n.test for n in tree.body if isinstance(n, ast.If)
        and any(isinstance(v, ast.Name) and v.id == '_candidato' for v in ast.walk(n)))
    scope = {'sys': SimpleNamespace(frozen=True),
             'os': SimpleNamespace(environ={'NEWPROD_RETORNO_ORIGINAL': '1'})}
    assert eval(compile(ast.Expression(cond), 'app.py', 'eval'), scope) is False
