"""Alinha somente a main principal por fast-forward, com backup e sem descartar trabalho."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def git(raiz, *args):
    resultado = subprocess.run(['git', '-C', str(raiz), *args], capture_output=True, check=True, timeout=180)
    texto = resultado.stdout.decode('utf-8', errors='strict')
    return texto if '-z' in args else texto.strip()


def consultar(raiz):
    raiz = Path(raiz).resolve()
    adiante, atras = map(int, git(raiz, 'rev-list', '--left-right', '--count', 'HEAD...origin/main').split())
    return {'raiz': str(raiz), 'branch': git(raiz, 'branch', '--show-current'),
            'head': git(raiz, 'rev-parse', 'HEAD'), 'remoto': git(raiz, 'rev-parse', 'origin/main'),
            'adiante': adiante, 'atras': atras}


def bloqueios(raiz, estado):
    raiz = Path(raiz).resolve()
    motivos = []
    if estado['branch'] != 'main':
        motivos.append('A pasta principal precisa estar na branch main.')
    if estado['adiante']:
        motivos.append('Ha commits locais exclusivos; integracao manual necessaria.')
    if git(raiz, 'diff', '--name-only') or git(raiz, 'diff', '--cached', '--name-only'):
        motivos.append('Ha alteracoes em arquivos rastreados; preserve e revise antes de alinhar.')
    for nome in git(raiz, 'diff', '--name-only', '-z', '--diff-filter=A', 'HEAD', estado['remoto']).split('\0'):
        if not nome:
            continue
        caminho = raiz / nome
        if caminho.exists() or caminho.is_symlink():
            motivos.append('Arquivo local ocupa um caminho novo da main: ' + nome)
    return motivos


def conferir_backup(pasta):
    pasta = Path(pasta).resolve()
    pacote = pasta / 'snapshot.iib'
    manifesto = json.loads((pasta / 'manifesto.json').read_text(encoding='utf-8-sig'))
    if not (pasta / 'evidencia-restauracao.json').is_file():
        raise ValueError('Backup exige evidencia de ensaio da restauracao.')
    evidencia = json.loads((pasta / 'evidencia-restauracao.json').read_text(encoding='utf-8-sig'))
    if evidencia.get('git_fsck') is not True or manifesto.get('algorithm') != 'AES-256-GCM':
        raise ValueError('Backup ou ensaio nao foi validado.')
    with pacote.open('rb') as arquivo:
        sha = hashlib.file_digest(arquivo, 'sha256').hexdigest()
    esperado = manifesto.get('sha256') or manifesto.get('sha256_cifrado')
    if sha != esperado:
        raise ValueError('Hash do backup cifrado diverge do manifesto.')


def alinhar(raiz, backup):
    estado = consultar(raiz)
    motivos = bloqueios(raiz, estado)
    if motivos:
        return {**estado, 'estado': 'BLOQUEADO', 'motivos': motivos}
    if not estado['atras']:
        return {**estado, 'estado': 'ALINHADO'}
    conferir_backup(backup)
    # O alvo e o SHA previamente conferido, nao uma ref que pode avancar.
    git(raiz, 'merge', '--ff-only', estado['remoto'])
    posterior = consultar(raiz)
    if posterior['head'] != estado['remoto']:
        raise RuntimeError('Main local nao chegou ao alvo conferido.')
    return {**posterior, 'estado': 'ALINHADO', 'anterior': estado['head']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raiz', required=True)
    parser.add_argument('--aplicar', action='store_true')
    parser.add_argument('--backup')
    parser.add_argument('--buscar-remoto', action='store_true')
    args = parser.parse_args()
    if args.buscar_remoto:
        git(args.raiz, 'fetch', 'origin', '--prune')
    if args.aplicar:
        if not args.backup:
            parser.error('--aplicar exige --backup com ensaio verificado')
        resultado = alinhar(args.raiz, args.backup)
    else:
        resultado = consultar(args.raiz)
        resultado['motivos'] = bloqueios(args.raiz, resultado)
        resultado['estado'] = ('BLOQUEADO' if resultado['motivos'] else
                               'PENDENTE' if resultado['adiante'] or resultado['atras'] else 'ALINHADO')
    print(json.dumps(resultado, ensure_ascii=False))
    raise SystemExit(0 if resultado['estado'] == 'ALINHADO' else 2)
