"""Ensaio em loopback com PDF real e segunda fonte real ou carga sintética explícita."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import sys
import tempfile
import threading
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from art_cache import CacheArtes, RetryAdiado


def provar(primeiro, segundo, saida):
    fontes = {'/primeiro.pdf': Path(primeiro), '/segundo.pdf': Path(segundo) if segundo else None}
    tamanhos = {nome: p.stat().st_size if p else 156 * 1024**2 for nome, p in fontes.items()}
    eventos, relogio = [], [10000]
    falhar = [True]

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            etag = '"' + self.path[1:] + '"'
            status = 304 if self.headers.get('If-None-Match') == etag else 200
            registro = dict(arquivo=self.path, status=status, bytes=0,
                            if_none_match=self.headers.get('If-None-Match'))
            eventos.append(registro)
            self.send_response(status)
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', 'max-age=3600')
            self.send_header('Content-Length', str(tamanhos[self.path] if status == 200 else 0))
            self.end_headers()
            if status == 304:
                return
            interromper = self.path == '/segundo.pdf' and falhar[0]
            if interromper:
                falhar[0] = False
            limite = 32 * 1024**2 if interromper else tamanhos[self.path]
            origem = fontes[self.path].open('rb') if fontes[self.path] else None
            try:
                while registro['bytes'] < limite:
                    n = min(1024**2, limite - registro['bytes'])
                    bloco = origem.read(n) if origem else b'x' * n
                    self.wfile.write(bloco)
                    registro['bytes'] += len(bloco)
                self.wfile.flush()
                if interromper:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
            finally:
                if origem:
                    origem.close()

        def log_message(self, *args):
            pass

    servidor = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=servidor.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix='prova-cache-artes-') as pasta:
            abrir = urllib.request.build_opener(urllib.request.ProxyHandler({})).open
            def baixar(nome):
                cache = CacheArtes(pasta, abrir, relogio=lambda: relogio[0])
                req = urllib.request.Request(f'http://127.0.0.1:{servidor.server_port}' + nome)
                h, n = hashlib.sha256(), 0
                with cache.abrir_recurso(req, limite=256 * 1024**2, checkpoint=lambda: None) as f:
                    while bloco := f.read(1024**2):
                        h.update(bloco)
                        n += len(bloco)
                assert n == tamanhos[nome]
                return h.hexdigest()
            digest = baixar('/primeiro.pdf')
            try:
                baixar('/segundo.pdf')
                raise AssertionError('Falha de rede não foi reproduzida')
            except OSError:
                pass
            for _ in range(3):
                relogio[0] += 8
                assert baixar('/primeiro.pdf') == digest
                try:
                    baixar('/segundo.pdf')
                    raise AssertionError('Retry não foi bloqueado')
                except RetryAdiado:
                    pass
            assert len(eventos) == 2
            relogio[0] += 3601
            assert baixar('/primeiro.pdf') == digest
            baixar('/segundo.pdf')
            assert [e['status'] for e in eventos] == [200, 200, 304, 200]
            assert sum(e['bytes'] for e in eventos if e['arquivo'] == '/primeiro.pdf') == tamanhos['/primeiro.pdf']
            prova = dict(primeiro_real=True, segundo_real=bool(segundo), tamanhos=tamanhos,
                         sha256_primeiro=digest, eventos=eventos, polling_sem_rede=3,
                         espera_segundo_segundos=3600, sucesso=True)
            Path(saida).write_text(json.dumps(prova, indent=2), encoding='utf-8')
            print(json.dumps(prova), flush=True)
    finally:
        servidor.shutdown()
        servidor.server_close()
        thread.join()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--primeiro', required=True)
    p.add_argument('--segundo')
    p.add_argument('--saida', required=True)
    a = p.parse_args()
    provar(a.primeiro, a.segundo, a.saida)
