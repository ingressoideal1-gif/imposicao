"""Restaura um bucket cifrado em pasta local nova; nao acessa a nuvem."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import stat
import zipfile

from backup_portatil import CHUNK, caminho_seguro, decifrar, ler_chave
from backup_storage import validar_objetos


def restaurar(pacote, destino, chave):
    destino = Path(destino).resolve()
    destino.mkdir()  # Recusa alvos existentes, inclusive uma restauracao parcial.
    aberto = destino / '.bucket-validado.zip'
    try:
        decifrar(pacote, aberto, ler_chave(chave))
        with zipfile.ZipFile(aberto) as archive:
            infos = archive.infolist()
            nomes = [info.filename for info in infos]
            if len(nomes) != len(set(nomes)) or 'inventario.json' not in nomes:
                raise ValueError('Inventario ausente ou entradas duplicadas')
            if archive.getinfo('inventario.json').file_size > 64 * 1024 * 1024:
                raise ValueError('Inventario excede o limite de leitura')
            inventario = json.loads(archive.read('inventario.json'))
            if not isinstance(inventario, list) or not inventario:
                raise ValueError('Inventario de objetos invalido')
            bucket = inventario[0]['bucket_id']
            if not re.fullmatch(r'[a-zA-Z0-9_-]+', bucket):
                raise ValueError('Bucket invalido')
            validar_objetos(bucket, inventario)
            esperados = {'inventario.json'} | {'objetos/' + item['name'] for item in inventario}
            if set(nomes) != esperados:
                raise ValueError('Conteudo diferente do inventario')
            for info in infos:
                modo = info.external_attr >> 16
                if info.is_dir() or stat.S_ISLNK(modo):
                    raise ValueError('Entrada de arquivo invalida')
                caminho_seguro(destino, info.filename)
            # Validar todo o inventario antes de extrair qualquer objeto.
            for item in inventario:
                if not re.fullmatch(r'[a-f0-9]{64}', item['sha256']):
                    raise ValueError('Hash de objeto invalido')
                size = item['bytes']
                if size is not None and (type(size) is not int or size < 0):
                    raise ValueError('Tamanho de objeto invalido')
                if size is not None and archive.getinfo('objetos/' + item['name']).file_size != size:
                    raise ValueError('Tamanho diferente do inventario')
            total = 0
            for item in inventario:
                nome = 'objetos/' + item['name']
                alvo = caminho_seguro(destino, nome)
                alvo.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                size = 0
                with archive.open(nome) as source, alvo.open('xb') as target:
                    for chunk in iter(lambda: source.read(CHUNK), b''):
                        target.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
                if digest.hexdigest() != item['sha256'] or size != archive.getinfo(nome).file_size:
                    raise ValueError('Objeto diferente do inventario; restauracao incompleta')
                total += size
            with (destino / 'inventario.json').open('x', encoding='utf-8') as f:
                json.dump(inventario, f, ensure_ascii=False)
        result = {'restored': True, 'bucket': bucket, 'objects': len(inventario), 'bytes': total,
                  'verified_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with (destino / 'evidencia-restauracao.json').open('x', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        return result
    finally:
        aberto.unlink(missing_ok=True)  # Apenas o ZIP temporario desta execucao.


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pacote', required=True)
    parser.add_argument('--destino', required=True)
    parser.add_argument('--chave', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(restaurar(args.pacote, args.destino, args.chave)))
    except Exception:
        print('Restauracao incompleta. Preserve a pasta privada; nenhum objeto remoto foi alterado.',
              file=__import__('sys').stderr)
        raise SystemExit(1)
