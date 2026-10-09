"""Adaptador de preparação HTTP restrito a recursos públicos do projeto."""
from pathlib import Path
import tempfile
import urllib.request
from urllib.parse import urlsplit, unquote

from pacotes_locais import (_manifesto, _sem_links, _hash_arquivo, LIMITE_RECURSO_BYTES,
                            LIMITE_TOTAL_BYTES, LimiteRecursoExcedido)


class SemRedirecionamento(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirecionamento de recurso não permitido.')


def validar_url(url, host):
    if not isinstance(url, str) or url != url.strip() or any(ord(c) < 32 or ord(c) == 127 for c in url):
        raise ValueError('Origem de recurso não permitida.')
    u = urlsplit(url)
    caminho = unquote(u.path)
    if (u.scheme != 'https' or u.hostname != host or u.port not in (None, 443)
            or u.username or u.password or u.fragment or u.query
            or not caminho.startswith('/storage/v1/object/public/')
            or '\\' in caminho or '..' in caminho.split('/') or '%' in caminho
            or any(ord(c) < 32 for c in caminho)):
        raise ValueError('Origem de recurso não permitida.')
    return url


class ArmazemComDownload:
    def __init__(self, armazenamento, *, host, abrir=None):
        self.local = armazenamento
        self.host = host
        self._abrir = abrir or urllib.request.build_opener(SemRedirecionamento()).open

    @property
    def habilitado(self):
        return self.local.habilitado

    def preparar(self, manifesto, fontes, *, checkpoint=None):
        m = _manifesto(manifesto)
        total = 0
        for info in m['arquivos'].values():
            if info is None:
                continue
            if info['bytes'] > LIMITE_RECURSO_BYTES:
                raise LimiteRecursoExcedido(info['bytes'], LIMITE_RECURSO_BYTES, m['modelo'])
            total += info['bytes']
        if total > LIMITE_TOTAL_BYTES:
            raise LimiteRecursoExcedido(total, LIMITE_TOTAL_BYTES, m['modelo'], 'conjunto')
        # Reuso validado não requer fonte nem rede.
        if self.local.consultar(m['empresa'], m['modelo'], m['revisao'], checkpoint=checkpoint)['estado'] == 'local_validado':
            # Ainda compara o manifesto imutável, impedindo reutilização de revisão alterada.
            return self.local.preparar(m, {}, checkpoint=checkpoint)
        urls = {nome: validar_url(url, self.host) for nome, url in fontes.items()}
        area = self.local.raiz / 'downloads'
        _sem_links(area)
        area.mkdir(parents=True, exist_ok=True)
        caminhos = {}
        criados = []
        try:
            for nome, info in m['arquivos'].items():
                if info is None:
                    continue
                if checkpoint:
                    checkpoint()
                existente = self.local._pasta(m['empresa']) / 'objetos' / info['sha256']
                _sem_links(existente)
                if existente.is_file() and _hash_arquivo(existente, checkpoint) == (info['sha256'], info['bytes']):
                    continue
                compartilhado = next((caminhos[k] for k in caminhos
                                      if m['arquivos'][k]['sha256'] == info['sha256']), None)
                if compartilhado is not None:
                    caminhos[nome] = compartilhado
                    continue
                if nome not in urls:
                    raise ValueError('Dependência remota ausente.')
                # Espaço para a cópia transitória e a persistente, sem baixar até lotar disco.
                import shutil
                if shutil.disk_usage(area).free < 2 * info['bytes'] + self.local.reserva_bytes:
                    raise OSError('Espaço insuficiente para preparação remota.')
                with tempfile.NamedTemporaryFile(dir=area, prefix='download-', delete=False) as destino:
                    caminho = Path(destino.name)
                    criados.append(caminho)
                    with self._abrir(urllib.request.Request(urls[nome], headers={'User-Agent': 'NewProd-Piloto/1'}), timeout=15) as resposta:
                        if getattr(resposta, 'status', 200) != 200:
                            raise ValueError('Resposta incompleta do recurso.')
                        tamanho = 0
                        while True:
                            if checkpoint:
                                checkpoint()
                            bloco = resposta.read(min(1024 * 1024, info['bytes'] - tamanho + 1))
                            if not bloco:
                                break
                            tamanho += len(bloco)
                            if tamanho > info['bytes']:
                                raise ValueError('Download maior que o manifesto.')
                            destino.write(bloco)
                caminhos[nome] = caminho
            return self.local.preparar(m, caminhos, checkpoint=checkpoint)
        finally:
            for caminho in criados:
                if caminho.exists():
                    caminho.unlink()  # somente os arquivos temporários criados nesta chamada
