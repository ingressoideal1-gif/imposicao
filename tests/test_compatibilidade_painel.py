"""Regressao do upgrade: um painel legado recente nao substitui o novo protocolo."""
import ast
import json
import os
from pathlib import Path
import shutil
import time

import pytest

import compatibilidade_painel as contrato

RAIZ = Path(__file__).resolve().parents[1]


def semear(destino, origem):
    arvore = ast.parse((RAIZ / 'app.py').read_text(encoding='utf-8-sig'))
    funcao = next(n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == '_semear_painel')
    namespace = {'os': os, 'shutil': shutil}
    exec(compile(ast.Module(body=[funcao], type_ignores=[]), 'semear_isolado', 'exec'), namespace)
    return namespace['_semear_painel'](str(destino), str(origem))


def marcar(pasta, protocolo=1):
    (pasta / contrato.ARQUIVO_PROTOCOLO).write_text(json.dumps({'sessao_local': protocolo}), encoding='utf-8')


@pytest.mark.parametrize('conteudo', ['{invalido', '[]', 'null', '{"sessao_local":true}', '{"sessao_local":"1"}', '{"sessao_local":2}'])
def test_marcador_invalido_ou_protocolo_futuro_nao_e_aceito(tmp_path, conteudo):
    (tmp_path / contrato.ARQUIVO_PROTOCOLO).write_text(conteudo, encoding='utf-8')
    assert not contrato.painel_compativel(tmp_path)


def test_upgrade_renova_conjunto_legado_mesmo_com_data_mais_recente(tmp_path):
    origem, destino = tmp_path / 'embutido', tmp_path / 'painel'
    origem.mkdir()
    destino.mkdir()
    marcar(origem)
    for nome in ('index.html', 'script.js'):
        (origem / nome).write_text('protocolo novo', encoding='utf-8')
        (destino / nome).write_text('protocolo legado', encoding='utf-8')
        futuro = time.time() + 3600
        os.utime(destino / nome, (futuro, futuro))
    (destino / 'anotacao-local.txt').write_text('preservar', encoding='utf-8')
    assert semear(destino, origem)
    assert contrato.painel_compativel(destino)
    assert all((destino / n).read_text(encoding='utf-8') == 'protocolo novo' for n in ('index.html', 'script.js'))
    assert (destino / 'anotacao-local.txt').read_text(encoding='utf-8') == 'preservar'


def test_reinicio_preserva_painel_mais_recente_do_mesmo_protocolo(tmp_path):
    origem, destino = tmp_path / 'embutido', tmp_path / 'painel'
    origem.mkdir()
    destino.mkdir()
    marcar(origem)
    marcar(destino)
    (origem / 'index.html').write_text('do build', encoding='utf-8')
    (destino / 'index.html').write_text('sincronizado', encoding='utf-8')
    passado = time.time() - 3600
    os.utime(origem / 'index.html', (passado, passado))
    assert semear(destino, origem)
    assert (destino / 'index.html').read_text(encoding='utf-8') == 'sincronizado'


def test_painel_embutido_inclui_vendor_em_subpastas_sem_perder_atualizacao(tmp_path):
    origem, destino = tmp_path / 'embutido', tmp_path / 'painel'
    origem.mkdir()
    marcar(origem)
    (origem / 'index.html').write_text('painel sintetico')
    vendor = origem / 'vendor' / 'editor'
    vendor.mkdir(parents=True)
    for nome in ('editor.js', 'editor.css'):
        (vendor / nome).write_text('recurso embutido')
    assert semear(destino, origem)
    assert (destino / 'vendor/editor/editor.css').read_text() == 'recurso embutido'
    atualizado = destino / 'vendor/editor/editor.js'
    atualizado.write_text('sincronizado posteriormente')
    futuro = time.time() + 3600
    os.utime(atualizado, (futuro, futuro))
    assert semear(destino, origem)
    assert atualizado.read_text() == 'sincronizado posteriormente'


def test_download_legado_nao_vira_painel_da_estacao(tmp_path, monkeypatch):
    # Extrai a funcao real sem importar o worker ou conectar na nuvem.
    import security_config
    monkeypatch.setattr(security_config, 'PAINEL_ARQUIVOS', ['index.html'])
    (tmp_path / 'index.html').write_text('<html>legado</html>', encoding='utf-8')
    arvore = ast.parse((RAIZ / 'agent_worker.py').read_text(encoding='utf-8-sig'))
    funcao = next(n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == '_painel_valido')
    namespace = {'os': os}
    exec(compile(ast.Module(body=[funcao], type_ignores=[]), 'worker_isolado', 'exec'), namespace)
    assert not namespace['_painel_valido'](str(tmp_path))
    marcar(tmp_path)
    assert namespace['_painel_valido'](str(tmp_path))
