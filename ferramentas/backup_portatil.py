"""Backup Git portatil cifrado; nao acessa nuvem nem restaura sobre a producao."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import zipfile

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

MAGIC = b'IIBACKUP1\0'
CHUNK = 1024 * 1024


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(CHUNK), b''):
            h.update(chunk)
    return h.hexdigest()


def ler_chave(path):
    key = Path(path).read_bytes()
    if len(key) != 32:
        raise ValueError('Chave de recuperacao invalida')
    return key


def cifrar(origem, destino, key):
    nonce = secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(MAGIC)
    with Path(origem).open('rb') as source, Path(destino).open('xb') as target:
        target.write(MAGIC + nonce)
        for chunk in iter(lambda: source.read(CHUNK), b''):
            target.write(encryptor.update(chunk))
        target.write(encryptor.finalize())
        target.write(encryptor.tag)
        target.flush()
        os.fsync(target.fileno())


def decifrar(origem, destino, key):
    origem, destino = Path(origem), Path(destino)
    if destino.exists():
        raise ValueError('A restauracao nao sobrescreve arquivos')
    with origem.open('rb') as source:
        if source.read(len(MAGIC)) != MAGIC:
            raise ValueError('Formato de backup invalido')
        nonce = source.read(12)
        tamanho = origem.stat().st_size - len(MAGIC) - 12 - 16
        if tamanho < 0:
            raise ValueError('Backup incompleto')
        source.seek(-16, 2)
        tag = source.read(16)
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        decryptor.authenticate_additional_data(MAGIC)
        source.seek(len(MAGIC) + 12)
        temp_name = None
        try:
            with tempfile.NamedTemporaryFile(dir=destino.parent, prefix='.validando-', delete=False) as target:
                temp_name = Path(target.name)
                restante = tamanho
                while restante:
                    chunk = source.read(min(CHUNK, restante))
                    if not chunk:
                        raise ValueError('Backup incompleto')
                    restante -= len(chunk)
                    target.write(decryptor.update(chunk))
                target.write(decryptor.finalize())  # Nao libera arquivo sem autenticacao.
                target.flush()
                os.fsync(target.fileno())
            # Publicacao sem overwrite, inclusive se outro processo criou o alvo.
            os.link(temp_name, destino)
        finally:
            if temp_name is not None:
                temp_name.unlink(missing_ok=True)


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True)
    if result.returncode:
        raise RuntimeError('Falha Git na operacao ' + args[0])
    return result.stdout


def caminho_seguro(base, nome):
    path = Path(nome)
    result = (base / path).resolve()
    if path.is_absolute() or not result.is_relative_to(base.resolve()) or result == base.resolve():
        raise ValueError('Caminho de arquivo fora do destino')
    return result


def criar(root, destino, key_path, runtime=()):
    root, destino = Path(root).resolve(), Path(destino).resolve()
    if destino == root or destino.is_relative_to(root):
        raise ValueError('Backup deve ficar fora do repositorio')
    if destino.exists():
        raise ValueError('Destino ja existe')
    key = ler_chave(key_path)
    destino.mkdir()
    inventory = []
    # O chamador precisa criar um pai com ACL restrita antes desta operacao.
    temporario = destino / 'conteudo-temporario'
    temporario.mkdir()
    bundle = temporario / 'repository.bundle'
    git(root, 'bundle', 'create', str(bundle), '--all')
    git(root, 'bundle', 'verify', str(bundle))
    zip_path = temporario / 'snapshot.zip'
    with zipfile.ZipFile(zip_path, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        blocks = git(root, 'worktree', 'list', '--porcelain').decode('utf-8').strip().split('\n\n')
        for index, block in enumerate(blocks):
            fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
            path = Path(fields['worktree']).resolve()
            prefix = f'worktrees/{index:03d}'
            working = git(path, 'diff', '--binary')
            staged = git(path, 'diff', '--cached', '--binary')
            archive.writestr(prefix + '/working.patch', working)
            archive.writestr(prefix + '/staged.patch', staged)
            saved, omitted = [], []
            for raw in git(path, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0'):
                if not raw:
                    continue
                name = os.fsdecode(raw)
                source = caminho_seguro(path, name)
                if (path / name).is_symlink():
                    raise ValueError('Arquivo simbolico no trabalho pendente')
                if name.startswith(('.claude/', '.codex/', '.aws/', '.env')):
                    omitted.append(name)
                    continue
                archive.write(source, prefix + '/untracked/' + name.replace('\\', '/'))
                saved.append({'name': name, 'sha256': sha256(source)})
            inventory.append({**fields, 'prefix': prefix, 'dirty': bool(working or staged),
                              'untracked': saved, 'omitted_personal': omitted})
        # Somente alvos adicionais nomeados pelo operador; nenhum arquivo secreto
        # e buscado automaticamente. Nao incluir a chave do backup entre eles.
        runtime_info = []
        for index, nome in enumerate(runtime):
            source = Path(nome).resolve()
            if source == Path(key_path).resolve() or not source.is_file() or Path(nome).is_symlink():
                raise ValueError('Arquivo de runtime invalido')
            archive.write(source, f'runtime/{index:03d}/{source.name}')
            runtime_info.append({'source': str(source), 'sha256': sha256(source)})
        refs = git(root, 'for-each-ref', '--format=%(refname) %(objectname)').decode('utf-8')
        archive.writestr('refs.txt', refs)
        archive.writestr('inventory.json', json.dumps({'worktrees': inventory, 'runtime': runtime_info}, ensure_ascii=False))
        archive.write(bundle, 'repository.bundle')
    bundle.unlink()
    sealed = destino / 'snapshot.iib'
    cifrar(zip_path, sealed, key)
    # Verifica decifracao integral antes de descartar o temporario criado aqui.
    checked = temporario / 'conferido.zip'
    decifrar(sealed, checked, key)
    if sha256(checked) != sha256(zip_path):
        raise ValueError('Falha na verificacao do backup')
    checked.unlink()
    zip_path.unlink()
    temporario.rmdir()
    manifest = {'format': 1, 'algorithm': 'AES-256-GCM', 'file': sealed.name,
                'sha256': sha256(sealed), 'bytes': sealed.stat().st_size,
                'worktrees': len(inventory), 'dirty': sum(x['dirty'] for x in inventory),
                'runtime_files': len(runtime_info),
                'coverage': 'Git refs, patches, nonignored untracked and explicitly named runtime files. Cloud database/Storage excluded.',
                'recovery': 'Requires the separate 32-byte key file. Keep an offline copy outside this computer; never upload beside the backup.'}
    (destino / 'manifesto.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def restaurar(backup, destino, key_path):
    backup, destino = Path(backup).resolve(), Path(destino).resolve()
    if destino.exists():
        raise ValueError('A restauracao exige um destino novo')
    manifest = json.loads((backup / 'manifesto.json').read_text(encoding='utf-8-sig'))
    sealed = caminho_seguro(backup, manifest['file'])
    if sha256(sealed) != manifest['sha256'] or sealed.stat().st_size != manifest['bytes']:
        raise ValueError('Backup incompleto ou alterado')
    key = ler_chave(key_path)
    destino.mkdir()
    checked = destino / 'conteudo.zip'
    try:
        decifrar(sealed, checked, key)
        with zipfile.ZipFile(checked) as archive:
            # Valida TODOS os nomes antes de extrair o primeiro arquivo.
            for info in archive.infolist():
                target = caminho_seguro(destino, info.filename)
                if target == checked or (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Entrada nao permitida no backup')
            archive.extractall(destino)
    finally:
        checked.unlink(missing_ok=True)
    return {'restored': True, 'destination': str(destino)}


def verificar_restauracao(destino):
    destino = Path(destino).resolve()
    inventory = json.loads((destino / 'inventory.json').read_text(encoding='utf-8'))
    result = subprocess.run(['git', 'clone', '--mirror', str(destino / 'repository.bundle'), str(destino / 'repository.git')], capture_output=True)
    if result.returncode:
        raise RuntimeError('Falha na clonagem do ensaio')
    mirror = destino / 'repository.git'
    git(mirror, 'bundle', 'verify', str(destino / 'repository.bundle'))
    git(mirror, 'fsck', '--full')
    if git(mirror, 'for-each-ref', '--format=%(refname) %(objectname)').decode('utf-8') != (destino / 'refs.txt').read_text(encoding='utf-8'):
        raise ValueError('Referencias diferentes na restauracao')
    dirty = 0
    for index, item in enumerate(inventory['runtime']):
        restored = destino / 'runtime' / f'{index:03d}' / Path(item['source']).name
        if sha256(restored) != item['sha256']:
            raise ValueError('Arquivo de runtime diferente na restauracao')
    for index, item in enumerate(inventory['worktrees']):
        for untracked in item['untracked']:
            if sha256(caminho_seguro(destino / item['prefix'] / 'untracked', untracked['name'])) != untracked['sha256']:
                raise ValueError('Arquivo pendente diferente')
        if not item['dirty']:
            continue
        tree = destino / f'ensaio-worktree-{index:03d}'
        git(mirror, 'worktree', 'add', '--detach', str(tree), item['HEAD'])
        for name, option in [('staged.patch', '--index'), ('working.patch', None)]:
            patch = destino / item['prefix'] / name
            if patch.stat().st_size:
                git(tree, 'apply', *([option] if option else []), str(patch))
        if git(tree, 'diff', '--binary') != (destino / item['prefix'] / 'working.patch').read_bytes() or git(tree, 'diff', '--cached', '--binary') != (destino / item['prefix'] / 'staged.patch').read_bytes():
            raise ValueError('Alteracoes pendentes diferentes na restauracao')
        dirty += 1
    result = {'git_fsck': True, 'refs': len((destino / 'refs.txt').read_text().splitlines()),
              'dirty_worktrees_restored': dirty,
              'untracked_verified': sum(len(x['untracked']) for x in inventory['worktrees']),
              'runtime_verified': len(inventory['runtime'])}
    (destino / 'evidencia-restauracao.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('acao', choices=['criar', 'restaurar', 'verificar'])
    parser.add_argument('--raiz')
    parser.add_argument('--backup')
    parser.add_argument('--destino', required=True)
    parser.add_argument('--chave')
    parser.add_argument('--runtime', action='append', default=[])
    args = parser.parse_args()
    try:
        if args.acao == 'criar':
            result = criar(args.raiz, args.destino, args.chave, args.runtime)
        elif args.acao == 'restaurar':
            result = restaurar(args.backup, args.destino, args.chave)
        else:
            result = verificar_restauracao(args.destino)
        print(json.dumps(result))
    except Exception:
        # Excecoes externas podem conter dados privados: nunca imprimir conteudo.
        print('Operacao incompleta. Preserve o destino protegido para diagnostico; nenhum alvo original foi alterado.', file=__import__('sys').stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
