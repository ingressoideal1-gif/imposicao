"""Plano e artefatos locais de entrega. Nao instala, publica ou inicia o agente."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 1


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def chave(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args]).decode('utf-8').strip()


def alterados(root, base):
    # Inclui staged, unstaged, exclusoes e nomes novos em renomeacoes.
    result = set()
    for args in [('diff', '--name-only', '--no-renames', '-z', f'{base}...HEAD'),
                 ('diff', '--name-only', '--no-renames', '-z', 'HEAD'),
                 ('ls-files', '--others', '--exclude-standard', '-z')]:
        result.update(p for p in git(root, *args).split('\0') if p)
    return sorted(result)


def plano(paths):
    paths = sorted(set(p.replace('\\', '/') for p in paths))
    relevantes = [p for p in paths if not p.startswith(('docs/', 'design/')) and not p.endswith('.md')]
    visual = bool(relevantes) and all(
        p.startswith('frontend/') and Path(p).suffix.lower() in {'.css', '.png', '.jpg', '.jpeg', '.ico', '.webp'}
        for p in relevantes)
    componentes = sorted({('painel' if p.startswith('frontend/') else
                           'nuvem' if p.startswith(('supabase/', 'sql/')) else
                           'testes' if p.startswith('tests/') else 'agente/ferramentas')
                          for p in relevantes})
    return {'arquivos': paths, 'componentes': componentes,
            'perfil': 'visual' if visual else 'completo' if relevantes else 'documentacao',
            'motivo': 'Somente CSS/imagens; contratos e navegador dos dois canais preservados.' if visual else
                      'Logica, contrato, testes ou arquivo sem classificacao: bateria completa.' if relevantes else
                      'Sem codigo afetado; verificacoes documentais e de seguranca permanecem.'}


def impacto_testes(root, base):
    paths = alterados(root, base)
    efetivos = []
    for name in paths:
        if name.startswith('frontend/') and name.endswith('.html') and (root / name).is_file():
            try:
                before = git(root, 'show', f'{base}:{name}')
                after = (root / name).read_text(encoding='utf-8-sig').strip()
                def normalizar(s):
                    def tag(m):
                        return re.sub(r'''((?:src|href)=["'][^"']+\.(?:js|css)\?v=)\d+''', r'\1CACHE', m[0])
                    return re.sub(r'<(?:script|link)\b[^>]*>', tag, s).replace('\r\n', '\n').lstrip('\ufeff')
                if normalizar(before) == normalizar(after):
                    continue
            except subprocess.CalledProcessError:
                pass  # HTML novo: perfil completo.
        efetivos.append(name)
    return efetivos


def ambiente():
    # Versoes reais e metadados dos pacotes, alem dos locks versionados.
    pacotes = sorted((d.metadata['Name'], d.version, chave(d.read_text('RECORD') or ''))
                     for d in importlib.metadata.distributions())
    dlls = {}
    for name in ('mfc140u.dll', 'VCRUNTIME140.dll', 'VCRUNTIME140_1.dll'):
        for folder in (Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32', Path(sys.base_prefix)):
            path = folder / name
            if path.is_file():
                dlls[name] = digest(path)
                break
    return {'python': sys.version, 'plataforma': platform.platform(),
            'python_sha256': digest(sys.executable), 'pacotes': pacotes, 'dlls': dlls}


def estado(root, env=None):
    arquivos = [p for p in git(root, 'ls-files', '-z').split('\0') if p]
    novos = [p for p in git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
             if p and (p.startswith('frontend/') or Path(p).suffix in {'.py', '.spec', '.dll'})
             and not p.startswith(('tests/', 'docs/'))]
    if novos:
        raise ValueError('Fontes nao rastreadas: registre na entrega antes de empacotar: ' + ', '.join(novos))
    fontes, painel = {}, {}
    for name in arquivos:
        # Exclusoes deliberadas: nao entram no executavel. Todo arquivo desconhecido
        # restante invalida a base, em vez de presumir que nao tem impacto.
        if name.startswith(('docs/', 'tests/', 'design/', 'design-montagem/', '.github/', '.agents/', 'sql/', 'supabase/')) or name.endswith('.md'):
            continue
        path = root / name
        if Path(name).name.startswith('.env') or any(s in name.lower() for s in ('qr_ideal_pool', 'acesso_segredo', 'credencial-publicacao')):
            raise ValueError('Entrada privada nao permitida no pacote: ' + name)
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError('Fonte fora da raiz: ' + name)
        value = digest(path) if path.is_file() else None
        (painel if name.startswith('frontend/') else fontes)[name] = value
    protocolo = json.loads((root / 'frontend/painel-protocolo.json').read_text(encoding='utf-8-sig'))
    runtime = chave({'schema': SCHEMA, 'fontes': fontes, 'ambiente': ambiente() if env is None else env})
    return {'schema': SCHEMA, 'runtime': runtime, 'painel': painel, 'protocolo': protocolo,
            'chave': chave({'runtime': runtime, 'painel': painel})}


def base_validada(folder):
    try:
        m = json.loads((folder / 'manifesto-piloto.json').read_text(encoding='utf-8-sig'))
        exe = folder / 'NewProdPiloto.exe'
        if (m['schema'] == SCHEMA and m['canal'] == 'piloto' and m['auditado'] is True
                and exe.is_file() and not exe.is_symlink()
                and exe.stat().st_size == m['bytes'] and digest(exe) == m['sha256']):
            return m
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def decidir(current, cached, permitir_painel):
    if not cached:
        return 'compilar'
    old = cached.get('entradas', {})
    if old.get('chave') == current['chave']:
        return 'reutilizar'
    if (permitir_painel and old.get('runtime') == current['runtime']
            and old.get('protocolo') == current['protocolo']
            and old.get('painel', {}).keys() == current['painel'].keys()
            and all(current['painel'].values())):
        return 'painel'
    return 'compilar'


def escrever(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def preparar(root, output, cache, permitir_painel=False, build=None):
    inicio = time.monotonic()
    current = estado(root)
    candidatos = sorted(cache.glob('*/manifesto-piloto.json')) if cache.exists() else []
    escolhido, manifest, acao = None, None, 'compilar'
    for file in candidatos:
        try:
            header = json.loads(file.read_text(encoding='utf-8-sig'))
            prevista = decidir(current, header, permitir_painel)
        except (OSError, ValueError, TypeError, AttributeError):
            continue
        # Nao reler centenas de MB de EXEs de bases que nem sao candidatas.
        if prevista == 'compilar' or (prevista == 'painel' and acao == 'painel'):
            continue
        valid = base_validada(file.parent)
        decision = decidir(current, valid, permitir_painel)
        if decision == 'reutilizar' or (decision == 'painel' and acao == 'compilar'):
            escolhido, manifest, acao = file.parent, valid, decision
        if acao == 'reutilizar':
            break
    output.mkdir(parents=True, exist_ok=True)
    # Nunca deixa um EXE antigo ao lado de um resultado que entrega apenas painel.
    destino = output / (acao + '-' + uuid.uuid4().hex[:12])
    destino.mkdir()
    if acao == 'compilar':
        if build is None:
            subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--distpath', str(destino),
                            '--workpath', str(destino / 'build'), 'agent_tray.spec'], cwd=root,
                           env={**os.environ, 'NEWPROD_BUILD_PILOTO': '1'}, check=True)
            subprocess.run([sys.executable, str(root / 'ferramentas/conferir_pacote_agente.py'),
                            '--exe', str(destino / 'NewProdPiloto.exe')], cwd=root, check=True)
        else:
            build(destino)
        if estado(root) != current:
            raise ValueError('Fontes ou dependencias mudaram durante o build; pacote nao reutilizavel.')
        exe = destino / 'NewProdPiloto.exe'
        manifest = {'schema': SCHEMA, 'canal': 'piloto', 'porta': 9001, 'auditado': True,
                    'executavel': exe.name, 'sha256': digest(exe), 'bytes': exe.stat().st_size,
                    'commit': git(root, 'rev-parse', 'HEAD'), 'entradas': current}
        escrever(destino / 'manifesto-piloto.json', manifest)
        cache.mkdir(parents=True, exist_ok=True)
        # Uma entrada nova evita sobrescrita de cache corrompido ou concorrente.
        with tempfile.TemporaryDirectory(dir=cache, prefix='.preparando-') as temp:
            staging = Path(temp)
            shutil.copy2(exe, staging / exe.name)
            shutil.copy2(destino / 'manifesto-piloto.json', staging / 'manifesto-piloto.json')
            staging.rename(cache / (current['chave'] + '-' + uuid.uuid4().hex[:12]))
    elif acao == 'reutilizar':
        for name in ('NewProdPiloto.exe', 'manifesto-piloto.json'):
            shutil.copy2(escolhido / name, destino / name)
        if not base_validada(destino):
            raise ValueError('Cache mudou durante a copia.')
    else:
        # Conjunto completo, sem exclusoes: pode ser aplicado a uma copia do pacote
        # base, preservando executavel, dados e configuracoes da estacao.
        for name, expected in current['painel'].items():
            target = destino / 'painel' / Path(name).relative_to('frontend')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, target)
            if digest(target) != expected:
                raise ValueError('Painel mudou durante a preparacao.')
        escrever(destino / 'manifesto-painel.json', {
            'schema': SCHEMA, 'canal': 'piloto', 'base_exe_sha256': manifest['sha256'],
            'base_runtime': current['runtime'], 'protocolo': current['protocolo'],
            'arquivos': {p.removeprefix('frontend/'): h for p, h in current['painel'].items()}})
    result = {'acao': acao, 'destino': str(destino), 'segundos': round(time.monotonic() - inicio, 3),
              'chave': current['chave'], 'instalado': False}
    escrever(output / 'resultado-entrega.json', result)
    return result


def montar_painel(pacote, exe, destino):
    """Monta nova pasta de distribuicao; nunca escreve na instalacao em uso."""
    manifest = json.loads((pacote / 'manifesto-painel.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != SCHEMA or manifest.get('canal') != 'piloto':
        raise ValueError('Manifesto de painel invalido.')
    if exe.is_symlink() or digest(exe) != manifest['base_exe_sha256']:
        raise ValueError('Executavel incompativel com a base do painel.')
    files = manifest['arquivos']
    if not files or 'index.html' not in files or 'painel-protocolo.json' not in files:
        raise ValueError('Painel incompleto.')
    for name, expected in files.items():
        path = pacote / 'painel' / name
        if (not path.resolve().is_relative_to((pacote / 'painel').resolve())
                or path.is_symlink() or ':' in name or '\\' in name or '..' in Path(name).parts
                or digest(path) != expected):
            raise ValueError('Arquivo do painel invalido: ' + name)
    protocol = json.loads((pacote / 'painel/painel-protocolo.json').read_text(encoding='utf-8-sig'))
    if protocol != manifest['protocolo']:
        raise ValueError('Protocolo diferente do manifesto.')
    destino.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(exe, destino / 'NewProdPiloto.exe')
    for name in files:
        target = destino / 'painel' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(pacote / 'painel' / name, target)
        if digest(target) != files[name]:
            raise ValueError('Painel mudou durante montagem; nao instalar esta pasta.')
    if digest(destino / 'NewProdPiloto.exe') != manifest['base_exe_sha256']:
        raise ValueError('Executavel mudou durante montagem; nao instalar esta pasta.')
    escrever(destino / 'manifesto-painel.json', manifest)
    return {'acao': 'painel-montado', 'destino': str(destino), 'instalado': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('acao', choices=['plano', 'preparar', 'montar-painel'])
    parser.add_argument('--base', default='origin/main')
    parser.add_argument('--saida', type=Path, default=ROOT / 'dist/piloto')
    parser.add_argument('--cache', type=Path)
    parser.add_argument('--permitir-painel', action='store_true')
    parser.add_argument('--pacote', type=Path)
    parser.add_argument('--executavel-base', type=Path)
    args = parser.parse_args()
    if args.acao == 'plano':
        result = plano(alterados(ROOT, args.base))
    elif args.acao == 'montar-painel':
        if not args.pacote or not args.executavel_base:
            parser.error('montar-painel exige --pacote, --executavel-base e --saida nova')
        result = montar_painel(args.pacote.resolve(), args.executavel_base.resolve(), args.saida.resolve())
    else:
        common = Path(git(ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
        result = preparar(ROOT, args.saida.resolve(), args.cache or common / 'entrega-cache/piloto', args.permitir_painel)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
