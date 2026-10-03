"""A credencial da estacao e protegida; o instalador nao precisa conter o segredo."""
import ast
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import acesso_publicacao
import segredos_estacao


def test_credencial_dpapi_da_estacao(tmp_path, monkeypatch):
    monkeypatch.delenv('ACESSO_AGENTE_SEGREDO', raising=False)
    monkeypatch.setitem(sys.modules, 'db', SimpleNamespace(DB_DIR=str(tmp_path), ler_env_local=lambda _: None))
    envelope = segredos_estacao.proteger_texto('segredo-sintetico', 'publicacao-faixas')
    (tmp_path / 'credencial-publicacao.json').write_text(json.dumps(envelope), encoding='utf-8')
    assert acesso_publicacao._segredo() == 'segredo-sintetico'


def test_credencial_invalida_nao_autoriza_publicacao(tmp_path, monkeypatch):
    monkeypatch.delenv('ACESSO_AGENTE_SEGREDO', raising=False)
    monkeypatch.setitem(sys.modules, 'db', SimpleNamespace(DB_DIR=str(tmp_path), ler_env_local=lambda _: None))
    monkeypatch.setitem(sys.modules, 'acesso_segredo', SimpleNamespace(SEGREDO=None))
    (tmp_path / 'credencial-publicacao.json').write_text('{invalido', encoding='utf-8')
    assert acesso_publicacao._segredo() is None


def test_segredo_esta_excluido_do_executavel():
    spec = Path(__file__).resolve().parents[1] / 'agent_tray.spec'
    arvore = ast.parse(spec.read_text(encoding='utf-8-sig'))
    analise = next(n.value for n in arvore.body if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and getattr(n.value.func, 'id', '') == 'Analysis')
    opcoes = {k.arg: k.value for k in analise.keywords}
    assert 'acesso_segredo' in ast.literal_eval(opcoes['excludes'])
    assert 'acesso_segredo' not in ast.literal_eval(opcoes['hiddenimports'])
