"""Repositorios descartaveis verificam sincronizacao sem perder trabalho."""
import hashlib
import json
from pathlib import Path
import subprocess
import shutil
import sys

import pytest

from ferramentas import sincronizar_git as sync


def git(pasta, *args):
    return subprocess.check_output(['git', '-C', str(pasta), *args], stderr=subprocess.PIPE).decode().strip()


@pytest.fixture
def repos(tmp_path):
    remoto, publicador, principal = (tmp_path / n for n in ('origin.git', 'publicador', 'principal'))
    subprocess.run(['git', 'init', '--bare', str(remoto)], capture_output=True, check=True)
    subprocess.run(['git', 'init', '-b', 'main', str(publicador)], capture_output=True, check=True)
    git(publicador, 'config', 'user.email', 'teste@example.invalid')
    git(publicador, 'config', 'user.name', 'Teste Sincronia')
    (publicador / 'base.txt').write_text('base', encoding='utf-8')
    git(publicador, 'add', 'base.txt')
    git(publicador, 'commit', '-m', 'base')
    git(publicador, 'remote', 'add', 'origin', str(remoto))
    git(publicador, 'push', '-u', 'origin', 'main')
    subprocess.run(['git', 'clone', '-b', 'main', str(remoto), str(principal)], capture_output=True, check=True)
    git(principal, 'config', 'user.email', 'teste@example.invalid')
    git(principal, 'config', 'user.name', 'Teste Sincronia')
    return publicador, principal


def publicar(publicador, principal, nome='base.txt', conteudo='novo'):
    (publicador / nome).write_text(conteudo, encoding='utf-8')
    git(publicador, 'add', '-f', nome)
    git(publicador, 'commit', '-m', 'avanco remoto')
    git(publicador, 'push')
    git(principal, 'fetch', 'origin')


def test_consulta_detecta_pasta_atrasada_sem_alterar_seus_arquivos(repos):
    publicador, principal = repos
    publicar(publicador, principal)
    estado = sync.consultar(principal)
    assert (estado['adiante'], estado['atras']) == (0, 1)
    assert (principal / 'base.txt').read_text() == 'base'


def test_fast_forward_preserva_arquivo_nao_rastreado(repos, monkeypatch):
    publicador, principal = repos
    publicar(publicador, principal)
    (principal / 'rascunho.txt').write_text('preservar', encoding='utf-8')
    monkeypatch.setattr(sync, 'conferir_backup', lambda _: None)
    resultado = sync.alinhar(principal, 'backup-sintetico')
    assert resultado['estado'] == 'ALINHADO'
    assert (principal / 'base.txt').read_text() == 'novo'
    assert (principal / 'rascunho.txt').read_text() == 'preservar'


def test_modificacao_rastreada_bloqueia_sem_descartar(repos):
    publicador, principal = repos
    publicar(publicador, principal)
    anterior = git(principal, 'rev-parse', 'HEAD')
    (principal / 'base.txt').write_text('edicao local', encoding='utf-8')
    assert sync.alinhar(principal, 'nao-usar')['estado'] == 'BLOQUEADO'
    assert git(principal, 'rev-parse', 'HEAD') == anterior
    assert (principal / 'base.txt').read_text() == 'edicao local'


@pytest.mark.parametrize('ignorado', [False, True])
def test_colisao_com_arquivo_local_e_bloqueada(repos, ignorado):
    publicador, principal = repos
    nome = 'novo.local'
    if ignorado:
        (principal / '.git' / 'info' / 'exclude').write_text('*.local\n', encoding='utf-8')
    (principal / nome).write_text('original privado', encoding='utf-8')
    publicar(publicador, principal, nome)
    resultado = sync.alinhar(principal, 'nao-usar')
    assert resultado['estado'] == 'BLOQUEADO'
    assert any(nome in m for m in resultado['motivos'])
    assert (principal / nome).read_text() == 'original privado'


def test_commit_local_exclusivo_nao_e_reescrito(repos):
    publicador, principal = repos
    publicar(publicador, principal)
    (principal / 'local.txt').write_text('local', encoding='utf-8')
    git(principal, 'add', 'local.txt')
    git(principal, 'commit', '-m', 'trabalho local')
    anterior = git(principal, 'rev-parse', 'HEAD')
    assert sync.alinhar(principal, 'nao-usar')['estado'] == 'BLOQUEADO'
    assert git(principal, 'rev-parse', 'HEAD') == anterior


def test_colisao_com_nome_acentuado_nao_e_ocultada_por_escape_git(repos):
    publicador, principal = repos
    nome = ' relatório.txt'
    (principal / nome).write_text('privado', encoding='utf-8')
    publicar(publicador, principal, nome)
    assert sync.alinhar(principal, 'nao-usar')['estado'] == 'BLOQUEADO'
    assert (principal / nome).read_text(encoding='utf-8') == 'privado'


def test_outra_branch_no_mesmo_commit_nao_e_alinhada(repos):
    _, principal = repos
    git(principal, 'switch', '-c', 'rascunho')
    assert sync.alinhar(principal, 'nao-usar')['estado'] == 'BLOQUEADO'


def test_backup_adulterado_ou_ensaio_falho_nao_e_aceito(tmp_path):
    (tmp_path / 'snapshot.iib').write_bytes(b'pacote-sintetico')
    manifesto = {'algorithm': 'AES-256-GCM', 'sha256': '0' * 64}
    (tmp_path / 'manifesto.json').write_text(json.dumps(manifesto))
    (tmp_path / 'evidencia-restauracao.json').write_text('{"git_fsck":true}')
    with pytest.raises(ValueError, match='Hash'):
        sync.conferir_backup(tmp_path)
    manifesto['sha256'] = hashlib.sha256(b'pacote-sintetico').hexdigest()
    (tmp_path / 'manifesto.json').write_text(json.dumps(manifesto))
    (tmp_path / 'evidencia-restauracao.json').write_text('{"git_fsck":false}')
    with pytest.raises(ValueError, match='validado'):
        sync.conferir_backup(tmp_path)


@pytest.mark.skipif(sys.platform != 'win32', reason='Contrato do comando PowerShell Windows')
@pytest.mark.parametrize('aplicar', [False, True])
def test_entrega_segura_explica_pasta_atrasada_e_exige_backup(repos, aplicar):
    publicador, principal = repos
    publicar(publicador, principal)
    anterior = git(principal, 'rev-parse', 'HEAD')
    worktree = principal.parent / 'entrega'
    git(principal, 'worktree', 'add', '-b', 'entrega', str(worktree))
    fontes = Path(__file__).resolve().parents[1]
    shutil.copy2(fontes / 'entrega-segura.ps1', worktree)
    (worktree / 'ferramentas').mkdir()
    for nome in ('Publicacao.psm1', 'EntregaSegura.psm1', 'sincronizar_git.py'):
        shutil.copy2(fontes / 'ferramentas' / nome, worktree / 'ferramentas')
    comando = ['powershell.exe', '-NoProfile', '-NonInteractive', '-File',
               str(worktree / 'entrega-segura.ps1'), 'sincronizar', '-Python', sys.executable]
    if aplicar:
        comando += ['-BackupPrincipal', str(worktree / 'backup-ausente')]
    resultado = subprocess.run(comando, capture_output=True, timeout=60)
    assert resultado.returncode == (1 if aplicar else 2)
    assert (b'SINCRONIA_PENDENTE' in resultado.stdout if not aplicar else
            b'FALHA_ANTES_DA_PUBLICACAO' in resultado.stdout)
    assert git(principal, 'rev-parse', 'HEAD') == anterior
    assert (principal / 'base.txt').read_text() == 'base'
