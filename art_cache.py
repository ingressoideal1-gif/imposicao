"""Cache HTTP em disco para artes; independente do polling e da fila de impressão."""
from contextlib import contextmanager
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.request
import weakref
from urllib.parse import urlsplit, unquote, parse_qsl, urlencode, urlunsplit
from datetime import datetime, timezone

from pacotes_locais import _sem_links, _hash_arquivo, LimiteRecursoExcedido

_LOCK = threading.RLock()
_ARQUIVOS_TRAVADOS = set()
_TRAVAS = weakref.WeakValueDictionary()


class RetryAdiado(OSError):
    pass


class CacheArtes:
    def __init__(self, raiz, abrir, *, relogio=time.time, monotonic=time.monotonic):
        self.raiz, self.abrir = Path(raiz), abrir
        self.relogio, self.monotonic = relogio, monotonic

    def _chave(self, req):
        partes = urlsplit(req.full_url)
        query = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True) if k != 'piloto_revisao']
        endereco = urlunsplit(partes._replace(query=urlencode(query)))
        return hashlib.sha256(endereco.encode()).hexdigest()

    def _lock(self, req):
        chave = (str(self.raiz.resolve()), self._chave(req))
        with _LOCK:
            trava = _TRAVAS.get(chave)
            if trava is None:
                trava = threading.RLock()
                _TRAVAS[chave] = trava
            return trava

    def _registrar(self, chave, req, evento, **dados):
        with _LOCK:
            self._registrar_sem_lock(chave, req, evento, **dados)

    def _registrar_sem_lock(self, chave, req, evento, **dados):
        """Log local limitado; nunca grava query strings nem credenciais."""
        path = self.raiz / 'tentativas.jsonl'
        _sem_links(path)
        handler = RotatingFileHandler(path, maxBytes=5 * 1024**2, backupCount=3, encoding='utf-8')
        try:
            registro = dict(horario=datetime.now(timezone.utc).isoformat(), arquivo_id=chave,
                            arquivo=unquote(urlsplit(req.full_url).path.rsplit('/', 1)[-1])[:200],
                            evento=evento, **dados)
            record = logging.LogRecord('cache-artes', logging.INFO, '', 0,
                                       json.dumps(registro, ensure_ascii=True), (), None)
            handler.emit(record)
        finally:
            handler.close()

    def _salvar(self, caminho, estado):
        with tempfile.NamedTemporaryFile(dir=self.raiz, mode='w', encoding='utf-8', delete=False) as f:
            parcial = Path(f.name)
            try:
                json.dump(estado, f)
                f.flush()
                os.fsync(f.fileno())
            except BaseException:
                f.close()
                parcial.unlink(missing_ok=True)
                raise
        try:
            os.replace(parcial, caminho)
        finally:
            parcial.unlink(missing_ok=True)

    @contextmanager
    def abrir_recurso(self, req, *, timeout=15, limite, checkpoint, reserva=0, modelo=''):
        with self._lock(req):
            _sem_links(self.raiz)
            self.raiz.mkdir(parents=True, exist_ok=True)
            chave = self._chave(req)
            trava = self.raiz / (chave + '.lock')
            _sem_links(trava)
            with self._travar(trava):
                with self._abrir_recurso(req, timeout=timeout, limite=limite,
                                         checkpoint=checkpoint, reserva=reserva, modelo=modelo) as resposta:
                    yield resposta

    @contextmanager
    def _travar(self, caminho):
        # Reentrante no thread protegido por _LOCK e exclusivo entre processos.
        chave = str(caminho.resolve())
        if chave in _ARQUIVOS_TRAVADOS:
            yield
            return
        with caminho.open('a+b') as f:
            if not f.tell():
                f.write(b'0')
                f.flush()
            f.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise RetryAdiado('Outro processo está baixando esta arte.') from None
            _ARQUIVOS_TRAVADOS.add(chave)
            try:
                yield
            finally:
                _ARQUIVOS_TRAVADOS.remove(chave)
                f.seek(0)
                if os.name == 'nt':
                    msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    @contextmanager
    def _abrir_recurso(self, req, *, timeout, limite, checkpoint, reserva, modelo):
        # Serializa também leitores: um arquivo não é substituído enquanto está aberto.
        with self._lock(req):
            _sem_links(self.raiz)
            self.raiz.mkdir(parents=True, exist_ok=True)
            chave = self._chave(req)
            arquivo, meta = self.raiz / (chave + '.pdf'), self.raiz / (chave + '.json')
            _sem_links(arquivo)
            _sem_links(meta)
            try:
                estado = json.loads(meta.read_text(encoding='utf-8'))
            except FileNotFoundError:
                estado = {}
            except (OSError, ValueError):
                raise RetryAdiado('Metadados do cache indisponíveis; download bloqueado.') from None
            agora = self.relogio()
            if agora < estado.get('retry_em', 0):
                self._registrar(chave, req, 'retry_adiado', proxima=estado['retry_em'])
                raise RetryAdiado('Download aguardando nova tentativa.')
            valido = (arquivo.is_file() and
                      _hash_arquivo(arquivo, checkpoint) == (estado.get('sha256'), estado.get('bytes')))
            parcial = None
            revalidar = (req.has_header('If-none-match') or req.get_header('Cache-control') == 'no-cache')
            if not valido or revalidar or agora >= estado.get('expira', 0):
                headers = dict(req.header_items())
                if valido and estado.get('etag'):
                    headers['If-none-match'] = estado['etag']
                pedido = urllib.request.Request(req.full_url, headers=headers)
                inicio = self.monotonic()
                try:
                    try:
                        resposta = self.abrir(pedido, timeout=timeout)
                    except urllib.error.HTTPError as e:
                        if e.code != 304 or not valido:
                            e.close()
                            raise
                        resposta = e
                    with resposta:
                        status = getattr(resposta, 'status', 200)
                        rh = getattr(resposta, 'headers', {})
                        self._registrar(chave, req, 'resposta', status=status)
                        if status == 304 and valido:
                            pass
                        elif status == 200:
                            etag = rh.get('ETag')
                            # Persistir ANTES do primeiro byte também protege contra
                            # encerramento do processo ou conjunto que falha depois.
                            dentro_da_hora = agora < estado.get('download_em', 0) + 3600
                            mesma_versao = not etag or etag == estado.get('etag_tentativa')
                            if dentro_da_hora and mesma_versao and estado.get('download_em'):
                                if valido and etag and etag == estado.get('etag'):
                                    estado.update(expira=estado['download_em'] + 3600)
                                    self._salvar(meta, estado)
                                    self._registrar(chave, req, 'corpo_ignorado', status=200, bytes=0)
                                    with arquivo.open('rb') as entrada:
                                        entrada.headers = {'ETag': estado.get('etag'), 'Content-Length': str(estado['bytes'])}
                                        entrada.status = 200
                                        yield entrada
                                    return
                                raise RetryAdiado('Mesmo arquivo bloqueado por uma hora.')
                            estado.update(download_em=agora, etag_tentativa=etag)
                            self._salvar(meta, estado)
                            digest, tamanho = hashlib.sha256(), 0
                            declarado = rh.get('Content-Length')
                            if declarado is not None and int(declarado) > limite:
                                raise LimiteRecursoExcedido(int(declarado), limite, modelo)
                            with tempfile.NamedTemporaryFile(dir=self.raiz, delete=False) as f:
                                parcial = Path(f.name)
                                while True:
                                    checkpoint()
                                    if self.monotonic() - inicio > 600:
                                        raise TimeoutError('Tempo total de download excedido.')
                                    bloco = resposta.read(1024 * 1024)
                                    if not bloco:
                                        break
                                    tamanho += len(bloco)
                                    if tamanho > limite:
                                        raise LimiteRecursoExcedido(tamanho, limite, modelo)
                                    if shutil.disk_usage(self.raiz).free < reserva + len(bloco):
                                        raise OSError('Reserva de disco insuficiente durante a cópia.')
                                    f.write(bloco)
                                    digest.update(bloco)
                            if not tamanho or (declarado is not None and tamanho != int(declarado)):
                                raise OSError('Download incompleto.')
                            os.replace(parcial, arquivo)
                            estado.update(sha256=digest.hexdigest(), bytes=tamanho, etag=rh.get('ETag'))
                            self._registrar(chave, req, 'download_concluido', status=200, bytes=tamanho)
                        else:
                            raise OSError('Resposta HTTP inesperada.')
                        controle = rh.get('Cache-Control', '')
                        idade = re.search(r'(?:^|,)\s*max-age=(\d+)', controle, re.I)
                        ttl = max(0, min(3600, int(idade[1])) - int(rh.get('Age', '0'))) if idade else (0 if estado.get('etag') else 3600)
                        if 'no-cache' in controle.lower() or 'no-store' in controle.lower():
                            ttl = 0
                        estado.update(expira=self.relogio() + ttl, falhas=0, retry_em=0)
                        self._salvar(meta, estado)
                except Exception as erro:
                    # Migração: o manifesto antigo pode ter ETag sem haver ainda
                    # entrada neste cache. O chamador já sabe reutilizar esse 304.
                    if isinstance(erro, urllib.error.HTTPError) and erro.code == 304:
                        raise
                    falhas = min(estado.get('falhas', 0) + 1, 8)
                    proxima = self.relogio() + min(3600, 30 * 2 ** (falhas - 1))
                    if estado.get('download_em'):
                        proxima = max(proxima, estado['download_em'] + 3600)
                    estado.update(falhas=falhas, retry_em=proxima)
                    self._salvar(meta, estado)
                    self._registrar(chave, req, 'falha', erro=type(erro).__name__, proxima=proxima)
                    raise
                finally:
                    if parcial is not None:
                        parcial.unlink(missing_ok=True)
            with arquivo.open('rb') as entrada:
                self._registrar(chave, req, 'arquivo_local', bytes_rede=0)
                entrada.headers = {'ETag': estado.get('etag'), 'Content-Length': str(estado['bytes'])}
                entrada.status = 200
                yield entrada
