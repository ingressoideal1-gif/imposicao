"""Ensaio completo em repositorio sintetico, sem banco, rede ou dados reais."""
import json
from pathlib import Path
import secrets
import subprocess
import zipfile

import pytest
from cryptography.exceptions import InvalidTag
from ferramentas import backup_portatil as backup


def repo_git(path, *args):
    r = subprocess.run(['git', '-C', str(path), *args], capture_output=True)
    assert r.returncode == 0, 'Falha no Git do repositorio sintetico'
    return r.stdout


def test_backup_restaura_refs_staged_working_e_untracked(tmp_path):
    root = tmp_path / 'fonte'
    root.mkdir()
    repo_git(root, 'init')
    repo_git(root, 'config', 'user.name', 'Teste Sintetico')
    repo_git(root, 'config', 'user.email', 'teste@example.invalid')
    (root / 'codigo.txt').write_text('inicial\n')
    repo_git(root, 'add', 'codigo.txt')
    repo_git(root, 'commit', '-m', 'base sintetica')
    repo_git(root, 'tag', 'v1')
    (root / 'codigo.txt').write_text('staged\n')
    repo_git(root, 'add', 'codigo.txt')
    (root / 'codigo.txt').write_text('working\n')
    (root / 'novo.bin').write_bytes(b'\0arquivo-sintetico\xff')
    (root / '.env.local').write_text('arquivo pessoal sintetico nao deve entrar')
    key = tmp_path / 'chave.key'
    key.write_bytes(secrets.token_bytes(32))
    sealed = tmp_path / 'backup'
    manifest = backup.criar(root, sealed, key)
    assert manifest['worktrees'] == 1 and manifest['dirty'] == 1
    assert {p.name for p in sealed.iterdir()} == {'snapshot.iib', 'manifesto.json'}
    restored = tmp_path / 'restaurado'
    backup.restaurar(sealed, restored, key)
    result = backup.verificar_restauracao(restored)
    assert result == {'git_fsck': True, 'refs': 2, 'dirty_worktrees_restored': 1, 'untracked_verified': 1, 'runtime_verified': 0}
    inventory = json.loads((restored / 'inventory.json').read_text())
    assert inventory['worktrees'][0]['omitted_personal'] == ['.env.local']
    assert (root / 'codigo.txt').read_text() == 'working\n'


def test_chave_errada_e_arquivo_alterado_nao_liberam_conteudo(tmp_path):
    source, encrypted, recovered = (tmp_path / x for x in ['original', 'cifrado', 'recuperado'])
    source.write_bytes(b'conteudo sintetico' * 100)
    key = secrets.token_bytes(32)
    backup.cifrar(source, encrypted, key)
    assert source.read_bytes() not in encrypted.read_bytes()
    with pytest.raises(InvalidTag):
        backup.decifrar(encrypted, recovered, secrets.token_bytes(32))
    assert not recovered.exists() and not list(tmp_path.glob('.validando-*'))
    dados = bytearray(encrypted.read_bytes())
    dados[-1] ^= 1
    encrypted.write_bytes(dados)
    with pytest.raises(InvalidTag):
        backup.decifrar(encrypted, recovered, key)
    assert not recovered.exists()


def test_restauracao_nao_sobrescreve_e_rejeita_travessia(tmp_path):
    sealed = tmp_path / 'backup'
    sealed.mkdir()
    zip_path = tmp_path / 'entrada.zip'
    with zipfile.ZipFile(zip_path, 'w') as z:
        z.writestr('permitido.txt', 'teste')
        z.writestr('../fora.txt', 'teste')
    key = tmp_path / 'chave.key'
    key.write_bytes(secrets.token_bytes(32))
    backup.cifrar(zip_path, sealed / 'snapshot.iib', key.read_bytes())
    (sealed / 'manifesto.json').write_text(json.dumps({'file': 'snapshot.iib',
        'bytes': (sealed / 'snapshot.iib').stat().st_size, 'sha256': backup.sha256(sealed / 'snapshot.iib')}))
    restored = tmp_path / 'restaurado'
    with pytest.raises(ValueError):
        backup.restaurar(sealed, restored, key)
    assert not (tmp_path / 'fora.txt').exists()
    assert not (restored / 'permitido.txt').exists()
    with pytest.raises(ValueError, match='destino novo'):
        backup.restaurar(sealed, restored, key)
