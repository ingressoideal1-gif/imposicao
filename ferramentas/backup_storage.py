"""Copia somente leitura do Storage e cifragem por bucket; nenhum upload Supabase."""
import argparse
import datetime
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
import zipfile

from backup_portatil import cifrar, decifrar, ler_chave, sha256
from storage_somente_leitura import baixar_objetos

PROJECT = 'vwbtitjlpelrcnsytzqw'


def publicar_manifesto(destino, dados):
    temporario = None
    try:
        with tempfile.NamedTemporaryFile(dir=destino, prefix='.manifesto-', mode='w', encoding='utf-8', delete=False) as f:
            temporario = Path(f.name)
            json.dump(dados, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporario, destino / 'manifesto-storage.json')
    finally:
        if temporario is not None:
            temporario.unlink(missing_ok=True)


def cli(executable, *args, cwd=None):
    result = subprocess.run([str(executable), *args, '--output-format', 'json'], capture_output=True, cwd=cwd)
    if result.returncode:
        raise RuntimeError('A CLI recusou a leitura ou copia; nenhuma escrita Supabase foi solicitada')
    if args[:2] != ('db', 'query'):
        return {}  # Progresso de copia pode ser NDJSON; nao expor nomes em logs.
    return json.loads(result.stdout.decode('utf-8-sig')) if result.stdout.strip() else {}


def linhas(dados):
    if isinstance(dados, list):
        return dados
    return dados.get('rows', [])


def validar_objetos(bucket, objects):
    nomes = set()
    for item in objects:
        name = item['name']
        parts = name.split('/')
        reserved = re.compile(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', re.I)
        if (not name or name.startswith(('/', '\\')) or
                any(p in ('', '..', '.') or p.endswith((' ', '.')) or reserved.match(p) for p in parts) or
                any(c in name for c in '\\:<>"|?*') or any(ord(c) < 32 for c in name)):
            raise ValueError('Objeto com caminho nao portavel para Windows')
        folded = name.casefold()
        if folded in nomes:
            raise ValueError('Objetos com nomes conflitantes no Windows')
        nomes.add(folded)
        if item['bucket_id'] != bucket:
            raise ValueError('Inventario de bucket divergente')


def copiar(cli_path, destino, chave, agent_pre_copiado=None, usar_http=False, pre_copiados=None, retomar=False):
    destino = Path(destino).resolve()
    private = destino / 'temporario-privado'
    if retomar:
        if not usar_http or private.is_symlink():
            raise ValueError('Retomada exige area privada existente e downloads GET')
        local_manifest = json.loads((destino / 'manifesto-storage.json').read_text(encoding='utf-8'))
        if local_manifest.get('project') != PROJECT or local_manifest.get('completed_at'):
            raise ValueError('Projeto divergente ou backup ja concluido')
        objects = json.loads((private / 'inventario-objetos.json').read_text(encoding='utf-8'))
    else:
        if destino.exists():
            raise ValueError('Use um destino novo em pasta privada')
        destino.mkdir()
        private.mkdir()
        sql = private / 'inventario.sql'
        sql.write_text("BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SELECT jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'bytes',(metadata->>'size')::bigint,'updated_at',updated_at)) AS objects FROM storage.objects; COMMIT;", encoding='utf-8')
        result = cli(cli_path, 'db', 'query', '--linked', '--project-ref', PROJECT, '--file', str(sql))
        objects = linhas(result)[0]['objects'] or []
        if isinstance(objects,str):
            objects = json.loads(objects)
        (private / 'inventario-objetos.json').write_text(json.dumps(objects), encoding='utf-8')
        local_manifest = {'project': PROJECT, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          'scope': 'All objects visible to project administrator, encrypted per bucket; database is separate.', 'buckets': []}
    # Nomes de objetos so ficam no inventario cifrado e na pasta local privada.
    buckets = sorted(set(x['bucket_id'] for x in objects))
    for bucket in buckets:
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', bucket):
            raise ValueError('Nome de bucket inesperado')
        validar_objetos(bucket, [x for x in objects if x['bucket_id'] == bucket])
    concluidos = {r['bucket']: r for r in local_manifest['buckets']}
    if len(concluidos) != len(local_manifest['buckets']) or not set(concluidos).issubset(buckets):
        raise ValueError('Manifesto de retomada divergente')
    key = ler_chave(chave)
    for bucket in buckets:
        expected = [x for x in objects if x['bucket_id'] == bucket]
        if bucket in concluidos:
            record = concluidos[bucket]
            sealed = destino / (bucket + '.iib')
            if (record['file'] != sealed.name or sealed.is_symlink() or sha256(sealed) != record['sha256'] or
                    record['objects'] != len(expected) or record['bytes'] != sum(x['bytes'] or 0 for x in expected)):
                raise ValueError('Pacote concluido divergente; retomada recusada')
            print(json.dumps({'bucket_reused': bucket, 'objects': record['objects']}), flush=True)
            continue
        pasta_cli = not usar_http
        origem_get = private if retomar and (private / bucket).is_dir() else pre_copiados
        if bucket == 'agent-releases' and agent_pre_copiado is not None:
            folder = Path(agent_pre_copiado).resolve()
            if not folder.is_dir() or Path(agent_pre_copiado).is_symlink():
                raise ValueError('Pasta pre-copiada invalida')
            pasta_cli = True
        elif origem_get is not None and (Path(origem_get) / bucket).is_dir():
            if not usar_http:
                raise ValueError('Retomada de objetos individuais exige downloads GET')
            folder = (Path(origem_get) / bucket).resolve()
            if Path(origem_get).is_symlink() or (Path(origem_get) / bucket).is_symlink():
                raise ValueError('Pasta pre-copiada invalida')
            existentes = list(folder.rglob('*'))
            if any(p.is_symlink() or not p.resolve().is_relative_to(folder) for p in existentes):
                raise ValueError('Arquivo copiado fora do destino privado')
            nomes_existentes = {p.relative_to(folder).as_posix().casefold() for p in existentes if p.is_file()}
            faltantes = [item for item in expected if item['name'].casefold() not in nomes_existentes]
            if faltantes:
                baixar_objetos(cli_path, PROJECT, bucket, faltantes, folder)
        else:
            folder = private / bucket
            folder.mkdir()
            # A CLI interpreta C: como protocolo remoto. Destino relativo e
            # cwd privado mantem a operacao no disco e evitam essa ambiguidade.
            if usar_http:
                baixar_objetos(cli_path, PROJECT, bucket, expected, folder)
            else:
                cli(cli_path, 'storage', 'cp', '--recursive', '--jobs', '4', '--linked', '--project-ref', PROJECT,
                    '--experimental', 'ss:///' + bucket + '/', '.', cwd=folder)
        files = sorted(p for p in folder.rglob('*') if p.is_file())
        for p in files:
            if p.is_symlink() or not p.resolve().is_relative_to(folder):
                raise ValueError('Arquivo copiado fora do destino privado')
        # A CLI pode preservar o nome do bucket como nivel adicional.
        if pasta_cli and (folder / bucket).is_dir():
            extras = [p for p in files if not p.is_relative_to(folder / bucket)]
            if any(not p.is_relative_to(folder / 'supabase' / '.temp') for p in extras):
                raise ValueError('Arquivos inesperados fora do bucket copiado')
            source_root = folder / bucket
            # A CLI cria metadados .temp de conexao no cwd, fora dos objetos.
            # Nao lemos nem arquivamos esse cache de configuracao.
            files = [p for p in files if p.is_relative_to(source_root)]
        else:
            source_root = folder
        actual = {p.relative_to(source_root).as_posix().casefold(): p for p in files}
        expected_names = {x['name'].casefold() for x in expected}
        if len(actual) != len(files) or set(actual) != expected_names:
            raise ValueError('Objetos copiados nao correspondem ao inventario; preserve o resultado incompleto')
        metadata = []
        for item in expected:
            p = actual[item['name'].casefold()]
            if item['bytes'] is not None and p.stat().st_size != item['bytes']:
                raise ValueError('Objeto alterado durante a copia; snapshot nao declarado completo')
            metadata.append({**item, 'sha256': sha256(p)})
        archive_path = private / (bucket + '.zip')
        with zipfile.ZipFile(archive_path, 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            archive.writestr('inventario.json', json.dumps(metadata, ensure_ascii=False))
            for item in metadata:
                # Preservar a grafia remota, mesmo quando pastas no Windows
                # compartilham o nome com diferenca apenas de maiusculas.
                archive.write(actual[item['name'].casefold()], 'objetos/' + item['name'])
        sealed = destino / (bucket + '.iib')
        cifrar(archive_path, sealed, key)
        checked = private / (bucket + '-conferido.zip')
        decifrar(sealed, checked, key)
        if sha256(checked) != sha256(archive_path):
            raise ValueError('Cifragem do bucket divergente')
        # Remove apenas ZIPs descartaveis gerados pelo proprio script. A pasta
        # privada dos objetos permanece para recuperacao; nunca e copiada ao Drive.
        checked.unlink()
        archive_path.unlink()
        record = {'bucket': bucket, 'objects': len(metadata), 'bytes': sum(x['bytes'] or 0 for x in metadata),
                  'file': sealed.name, 'sha256': sha256(sealed)}
        local_manifest['buckets'].append(record)
        publicar_manifesto(destino, local_manifest)
        print(json.dumps({'bucket_completed': bucket, 'objects': len(metadata), 'bytes': record['bytes']}), flush=True)
    local_manifest['completed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    local_manifest['consistency'] = 'Object names and sizes match initial inventory; downloads span the recorded window. Not a transaction with database backup.'
    publicar_manifesto(destino, local_manifest)
    return {'storage_complete': True, 'buckets': len(buckets), 'objects': len(objects)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cli', required=True)
    parser.add_argument('--destino', required=True)
    parser.add_argument('--chave', required=True)
    parser.add_argument('--agent-pre-copiado', help='Pasta privada de agent-releases copiada nesta janela; todos os objetos serao conferidos')
    parser.add_argument('--http', action='store_true', help='Downloads GET com repeticoes; credencial administrativa somente em memoria')
    parser.add_argument('--pre-copiados', help='Pasta privada de objetos GET de tentativa anterior; conferir novo inventario e completar apenas ausentes')
    parser.add_argument('--retomar', action='store_true', help='Completar backup interrompido no mesmo destino; manter inventario e janela originais, conferir SHA-256 dos pacotes concluidos')
    args = parser.parse_args()
    try:
        print(json.dumps(copiar(args.cli, args.destino, args.chave, args.agent_pre_copiado, args.http, args.pre_copiados, args.retomar)))
    except Exception as erro:
        print('Categoria: ' + type(erro).__name__, file=__import__('sys').stderr)
        print('Backup Storage incompleto. Nenhum arquivo original remoto foi modificado. Preserve a pasta privada para retomar.', file=__import__('sys').stderr)
        raise SystemExit(1)
