import json
import os
from datetime import datetime, timezone
import pytest
from diagnostico_update import resumo, LIMITE


def preparar(tmp_path, texto, encoding='utf-8'):
    arquivo = tmp_path / 'update-1.3.27.log'
    arquivo.write_text(texto, encoding=encoding)
    registro = dict(etapa='instalacao_falhou', versao_alvo='1.3.27',
                    quando=datetime.fromtimestamp(arquivo.stat().st_mtime, timezone.utc).isoformat())
    return arquivo, registro


@pytest.mark.parametrize('encoding', ['utf-8', 'utf-16'])
def test_envia_apenas_codigos_sem_conteudo_sensivel(tmp_path, encoding):
    _, registro = preparar(tmp_path, 'Error 1402. C:\\Users\\Pessoa\\segredo\n'
        'PASSWORD=privado token=secreto\nAction ended 10:00: InstallFinalize. Return value 3.\n', encoding)
    r = resumo(tmp_path, registro)
    assert r['codigos_msi'] == [1402] and r['retorno_3']
    assert not r['causa_confirmada']
    assert all(v not in json.dumps(r) for v in ('Pessoa', 'privado', 'secreto', 'PASSWORD'))


def test_leitura_limitada_e_codigo_desconhecido(tmp_path):
    _, registro = preparar(tmp_path, 'Error 1303.\n' + 'x' * LIMITE + '\nError 1920.\nError 9999.\n')
    r = resumo(tmp_path, registro)
    assert r['codigos_msi'] == [1920] and r['leitura_parcial']


def test_log_antigo_nao_e_atribuido_a_tentativa(tmp_path):
    arquivo, registro = preparar(tmp_path, 'Error 1402.')
    os.utime(arquivo, (0, 0))
    assert resumo(tmp_path, registro)['estado'] == 'log_de_outra_tentativa'


def test_ausente_e_traversal(tmp_path):
    arquivo, registro = preparar(tmp_path, '')
    arquivo.unlink()
    assert resumo(tmp_path, registro)['estado'] == 'log_ausente'
    registro['versao_alvo'] = '../../credenciais'
    assert resumo(tmp_path, registro)['estado'] == 'registro_invalido'


def test_sucesso_nao_abre_arquivo(tmp_path):
    assert resumo(tmp_path, {'etapa': 'validado'})['estado'] == 'nao_aplicavel'


def test_acao_falha_somente_por_lista_positiva(tmp_path):
    _, registro = preparar(tmp_path,
        'Error 1722. Program failed. Action PreservarDadosEstacao, location: SEGREDO\n'
        'Action ended 10:00: InstallFinalize. Return value 3.\n'
        'Action ended 10:00: TOKEN_PRIVADO. Return value 3.\n')
    r = resumo(tmp_path, registro)
    assert r['acoes_falhas'] == ['InstallFinalize', 'PreservarDadosEstacao']
    assert 'SEGREDO' not in json.dumps(r) and 'TOKEN_PRIVADO' not in json.dumps(r)


def test_juncao_recusada(tmp_path, monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    arquivo, registro = preparar(tmp_path, 'Error 1402.')
    original = Path.lstat
    def lstat(caminho):
        if caminho == arquivo:
            return SimpleNamespace(st_mode=0, st_file_attributes=0x400)
        return original(caminho)
    monkeypatch.setattr(Path, 'lstat', lstat)
    assert resumo(tmp_path, registro)['estado'] == 'caminho_recusado'


@pytest.mark.parametrize('ausente', [False, True])
def test_integracao_heartbeat_sem_importar_worker(tmp_path, monkeypatch, ausente):
    import ast
    import datetime as dt
    from pathlib import Path
    from types import SimpleNamespace
    import gestao_estacoes
    monkeypatch.setattr(gestao_estacoes, 'resumo_publico', lambda: {})
    arquivo, registro = preparar(tmp_path, 'Error 1920. servico-sensivel\n')
    if ausente:
        arquivo.unlink()
    tree = ast.parse((Path(__file__).resolve().parents[1] / 'agent_worker.py').read_text(encoding='utf-8-sig'))
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'sync_heartbeat')
    enviados = []
    contexto = dict(PILOTO=True, OFICIAL=True, AGENT_ID='sintetico', AGENT_NAME='TESTE',
        datetime=dt, _CONFIG_DIR=str(tmp_path),
        print_service=SimpleNamespace(get_printers=lambda: []),
        versao_do_painel=lambda: {}, get_local_ip=lambda: '127.0.0.1',
        _acesso_base=lambda: '', diagnostico_fontes=lambda: {},
        temp_manager=SimpleNamespace(diagnostico=lambda: {}),
        diagnostico_impressao=lambda: {}, ultimo_update=lambda: registro,
        _gravar_heartbeat=lambda payload, *args: enviados.append(payload))
    exec(compile(ast.Module(body=[fn], type_ignores=[]), 'heartbeat', 'exec'), contexto)
    contexto['sync_heartbeat']()
    p = enviados[0]['printers_json']
    assert p['ultimo_update'] == registro
    assert p['diagnostico_update']['estado'] == ('log_ausente' if ausente else 'coletado')
    assert 'servico-sensivel' not in json.dumps(enviados)
