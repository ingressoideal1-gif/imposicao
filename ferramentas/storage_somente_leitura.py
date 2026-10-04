"""Downloads GET administrativos com credencial apenas em memoria."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from urllib.parse import quote

import requests


class TamanhoDivergente(ValueError):
    """Objeto nao corresponde ao inventario; nenhuma publicacao parcial."""


def chave_administrativa(cli_path, project):
    result = subprocess.run([str(cli_path), 'projects', 'api-keys', '--project-ref', project,
                             '--reveal', '--output-format', 'json'], capture_output=True)
    if result.returncode:
        raise RuntimeError('Credencial administrativa indisponivel; valores nao exibidos')
    data = json.loads(result.stdout.decode('utf-8-sig'))
    keys = data.get('keys', []) if isinstance(data, dict) else data
    for item in keys:
        if item.get('name') == 'service_role' and item.get('api_key'):
            return item['api_key']
    raise RuntimeError('Chave administrativa esperada indisponivel')


def baixar_objetos(cli_path, project, bucket, objects, folder, workers=4):
    key = chave_administrativa(cli_path, project)
    local = threading.local()
    sessions = []
    lock = threading.Lock()

    def baixar(item):
        if not hasattr(local, 'session'):
            session = requests.Session()
            session.trust_env = False  # Nao busca .netrc ou credenciais pessoais.
            session.headers.update({'Authorization': 'Bearer ' + key, 'apikey': key, 'Accept-Encoding': 'identity'})
            local.session = session
            with lock:
                sessions.append(session)
        path = (Path(folder) / item['name']).resolve()
        if not path.is_relative_to(Path(folder).resolve()):
            raise ValueError('Caminho fora da pasta privada')
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise ValueError('Download nao sobrescreve arquivo existente')
        url = (f'https://{project}.supabase.co/storage/v1/object/authenticated/' +
               quote(bucket, safe='') + '/' + quote(item['name'], safe='/'))
        status = None
        for attempt in range(6):
            temporary = None
            try:
                with local.session.get(url, stream=True, timeout=(15, 120), allow_redirects=False) as response:
                    status = response.status_code
                    if status in (401, 403, 404) or 300 <= status < 400:
                        raise RuntimeError(f'Objeto indisponivel na leitura administrativa: HTTP {status}')
                    response.raise_for_status()
                    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.transferindo-', delete=False) as target:
                        temporary = Path(target.name)
                        for chunk in response.iter_content(1024 * 1024):
                            target.write(chunk)
                        target.flush()
                        os.fsync(target.fileno())
                if item['bytes'] is not None and temporary.stat().st_size != item['bytes']:
                    raise TamanhoDivergente('Tamanho do objeto mudou durante o download')
                os.link(temporary, path)  # Publica somente arquivo completo, sem overwrite.
                return
            except (requests.RequestException, OSError, TamanhoDivergente) as erro:
                if attempt == 5:
                    if isinstance(erro, TamanhoDivergente):
                        raise
                    raise RuntimeError(f'Download interrompido apos repeticoes: HTTP {status}') from None
                time.sleep(min(2 ** attempt, 8))
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        raise RuntimeError('Download incompleto')

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(baixar, item) for item in objects]
            try:
                for count, future in enumerate(as_completed(futures), 1):
                    future.result()
                    if count % 500 == 0:
                        print(json.dumps({'bucket': bucket, 'downloaded': count, 'expected': len(objects)}), flush=True)
            except Exception:
                for future in futures:
                    future.cancel()
                raise
    finally:
        for session in sessions:
            session.headers.clear()
            session.close()
        key = None
