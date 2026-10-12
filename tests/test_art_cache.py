"""Prova HTTP real em loopback, sem credenciais, Supabase ou impressão."""
import io
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from art_cache import CacheArtes, RetryAdiado


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name)
        self.agora = 1000

    def cache(self, abrir):
        return CacheArtes(self.raiz, abrir, relogio=lambda: self.agora)

    def baixar(self, cache, url='http://localhost/arte.pdf'):
        with cache.abrir_recurso(urllib.request.Request(url), limite=256 * 1024**2,
                                 checkpoint=lambda: None) as f:
            return f.read()

    def test_http_200_304_novo_etag_e_cache_fresco(self):
        eventos = []
        estado = {'etag': '"v1"', 'body': b'%PDF-sintetico', 'ttl': '0'}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cond = self.headers.get('If-None-Match')
                status = 304 if cond == estado['etag'] else 200
                eventos.append((status, cond, 0 if status == 304 else len(estado['body'])))
                self.send_response(status)
                self.send_header('ETag', estado['etag'])
                self.send_header('Cache-Control', 'max-age=' + estado['ttl'])
                self.send_header('Content-Length', str(0 if status == 304 else len(estado['body'])))
                self.end_headers()
                if status == 200:
                    self.wfile.write(estado['body'])

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/arte.pdf'
            abrir = urllib.request.build_opener(urllib.request.ProxyHandler({})).open
            self.assertEqual(self.baixar(self.cache(abrir), url), estado['body'])
            # Nova instância comprova persistência do arquivo e do ETag.
            self.assertEqual(self.baixar(self.cache(abrir), url), estado['body'])
            self.assertEqual(eventos, [(200, None, 14), (304, '"v1"', 0)])
            estado.update(etag='"v2"', body=b'%PDF-atualizado', ttl='3600')
            self.assertEqual(self.baixar(self.cache(abrir), url), estado['body'])
            self.baixar(self.cache(abrir), url)
            self.assertEqual(len(eventos), 3)
            print('PROVA HTTP:', eventos, '; quarta chamada: zero requisicoes')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_timeout_backoff_persistido_30_60_120(self):
        chamadas = []
        def falha(*args, **kwargs):
            chamadas.append(1)
            raise TimeoutError('simulado')
        for espera in (30, 60, 120):
            with self.assertRaises(TimeoutError):
                self.baixar(self.cache(falha))
            for _ in range(4):
                self.agora += 5
                with self.assertRaises(RetryAdiado):
                    self.baixar(self.cache(falha))
            self.agora += espera - 20
        self.assertEqual(len(chamadas), 3)

    def test_parcial_nao_publica_e_corrupcao_refaz_sem_condicional(self):
        chamadas = []
        def abrir(req, **kwargs):
            chamadas.append(req.get_header('If-none-match'))
            f = io.BytesIO(b'%PDF-ok')
            f.headers = {'ETag': '"v1"', 'Content-Length': '7'}
            return f
        self.baixar(self.cache(abrir))
        next(self.raiz.glob('*.pdf')).write_bytes(b'corrompido')
        with self.assertRaises(RetryAdiado):
            self.baixar(self.cache(abrir))
        self.agora += 3601
        self.baixar(self.cache(abrir))
        self.assertEqual(chamadas, [None, None, None])
        def curto(*args, **kwargs):
            f = io.BytesIO(b'curto')
            f.headers = {'Content-Length': '100', 'ETag': '"v2"'}
            return f
        with self.assertRaisesRegex(OSError, 'incompleto'):
            self.baixar(self.cache(curto))
        self.assertEqual(next(self.raiz.glob('*.pdf')).read_bytes(), b'%PDF-ok')
        self.assertFalse([p for p in self.raiz.iterdir() if p.name.startswith('tmp')])

    def test_antecipacao_preserva_frente_se_verso_falhar(self):
        from antecipacao_local import AntecipadorRecursos
        from types import SimpleNamespace
        chamadas = []
        def abrir(req, **kwargs):
            chamadas.append(req.full_url)
            if req.full_url.endswith('verso.pdf'):
                raise TimeoutError('verso indisponivel')
            f = io.BytesIO(b'%PDF-frente')
            f.headers = {'ETag': '"frente"', 'Cache-Control': 'max-age=3600'}
            return f
        local = SimpleNamespace(raiz=self.raiz, reserva_bytes=0)
        p = AntecipadorRecursos(None, local, 'test.invalid', lambda m: None,
                               lambda *a: self.fail('Nao pode publicar conjunto parcial'), abrir)
        m = {'empresa': 'teste', 'modelo': '10', 'revisao': 'a' * 64,
             'configuracao': {'tipo': 'antecipacao_online', 'fontes': {
                 nome: 'https://test.invalid/storage/v1/object/public/artes/' + nome + '.pdf'
                 for nome in ('frente', 'verso')}}}
        with self.assertRaises(TimeoutError):
            p.preparar(m, {})
        with self.assertRaises(RetryAdiado):
            p.preparar(m, {})
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(next((self.raiz / 'cache-artes-http').glob('*.pdf')).read_bytes(), b'%PDF-frente')

    def test_demora_total_interrompe_e_aplica_backoff(self):
        def abrir(*args, **kwargs):
            return io.BytesIO(b'%PDF-lento')
        cache = self.cache(abrir)
        tempos = iter([0, 601])
        cache.monotonic = lambda: next(tempos)
        with self.assertRaises(TimeoutError):
            self.baixar(cache)
        with self.assertRaises(RetryAdiado):
            self.baixar(self.cache(abrir))
        self.assertFalse(list(self.raiz.glob('*.pdf')))

    def test_etag_igual_com_200_nao_le_corpo_novamente(self):
        leituras = []
        class Resposta(io.BytesIO):
            def read(self, n=-1):
                leituras.append(n)
                return super().read(n)
        def abrir(*args, **kwargs):
            f = Resposta(b'%PDF-ok')
            f.headers = {'ETag': '"v1"'}
            return f
        self.baixar(self.cache(abrir))
        total = len(leituras)
        self.baixar(self.cache(abrir))
        self.assertEqual(len(leituras), total)

    def test_sem_etag_nao_reusa_arte_possivelmente_antiga(self):
        def abrir(*args, **kwargs):
            return io.BytesIO(b'%PDF-sem-etag')
        self.baixar(self.cache(abrir))
        with self.assertRaises(RetryAdiado):
            with self.cache(abrir).abrir_recurso(
                    urllib.request.Request('http://localhost/arte.pdf', headers={'Cache-Control': 'no-cache'}),
                    limite=1000, checkpoint=lambda: None):
                self.fail('Revalidacao sem ETag deve aguardar')

    def test_falha_no_meio_bloqueia_corpo_por_uma_hora(self):
        chamadas = []
        def abrir(*args, **kwargs):
            chamadas.append(1)
            f = io.BytesIO(b'%PDF-parcial')
            f.headers = {'Content-Length': '100', 'ETag': '"v1"'}
            return f
        with self.assertRaises(OSError):
            self.baixar(self.cache(abrir))
        for _ in range(719):
            self.agora += 5
            with self.assertRaises(RetryAdiado):
                self.baixar(self.cache(abrir))
        self.assertEqual(len(chamadas), 1)


if __name__ == '__main__':
    unittest.main()
