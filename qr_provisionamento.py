"""Instala somente a base v2 ausente, por resposta privada autenticada.

Não inclui códigos no MSI, não altera contratos e não aceita URLs externas.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import tempfile
import urllib.error
import urllib.request

from qr_ideal import POOL_V2_SHA256, TOTAL, TAMANHO

URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/piloto-local/base-qr-v2'
REVISAO = 'ideal-qr12-1'
BYTES = TOTAL * TAMANHO


class ErroProvisionamentoQr(ValueError):
    def __init__(self, motivo):
        self.motivo_qr = motivo
        super().__init__('Base QR v2 nao provisionada: ' + motivo)


class _SemRedirecionamento(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ErroProvisionamentoQr('provisionamento_recusado')


def _conferir(arquivo):
    from pacotes_locais import _sem_links
    _sem_links(arquivo)
    if arquivo.stat().st_size != BYTES:
        raise ErroProvisionamentoQr('download_incompleto')
    with arquivo.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != POOL_V2_SHA256:
            raise ErroProvisionamentoQr('download_integridade_invalida')


def obter_automaticamente(destino):
    """Falha fechada; temporário protegido e publicação atômica sem sobrescrita."""
    from migracao_estacao import proteger_pasta
    from pacotes_locais import _sem_links
    destino = Path(destino)
    _sem_links(destino)
    if destino.exists():
        _conferir(destino)
        return
    from acesso_publicacao import _segredo
    credencial = _segredo()
    if not credencial:
        raise ErroProvisionamentoQr('provisionamento_recusado')
    corpo = {'empresa': os.environ.get('NEWPROD_PILOTO_EMPRESA') or 'Ingresso Ideal',
             'estacao': socket.gethostname(), 'revisao': REVISAO}
    req = urllib.request.Request(URL, data=json.dumps(corpo).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'X-Agente-Segredo': credencial,
                 'Cache-Control': 'no-store', 'Accept-Encoding': 'identity'})
    destino.parent.mkdir(parents=True, exist_ok=True)
    proteger_pasta(destino.parent)
    temporario = None
    try:
        abrir = urllib.request.build_opener(_SemRedirecionamento()).open
        with abrir(req, timeout=60) as resposta:
            if (resposta.status != 200 or resposta.geturl() != URL
                    or resposta.headers.get('Content-Type', '').split(';')[0] != 'application/octet-stream'
                    or resposta.headers.get('X-NewProd-QR-Revisao') != REVISAO
                    or resposta.headers.get('X-NewProd-QR-SHA256') != POOL_V2_SHA256
                    or resposta.headers.get('Content-Encoding', 'identity') != 'identity'
                    or resposta.headers.get('Content-Length') not in (None, str(BYTES))):
                raise ErroProvisionamentoQr('provisionamento_recusado')
            with tempfile.NamedTemporaryFile(dir=destino.parent, prefix='.qr-v2-', delete=False) as stream:
                temporario = Path(stream.name)
                tamanho = 0
                while True:
                    bloco = resposta.read(min(1024 * 1024, BYTES - tamanho + 1))
                    if not bloco:
                        break
                    tamanho += len(bloco)
                    if tamanho > BYTES:
                        raise ErroProvisionamentoQr('download_incompleto')
                    stream.write(bloco)
                stream.flush()
                os.fsync(stream.fileno())
            _conferir(temporario)
            _sem_links(destino)
            try:
                os.link(temporario, destino)
            except FileExistsError:
                # Outra instância pode ter concluído; só aceitar bytes válidos.
                _conferir(destino)
            _conferir(destino)
    except urllib.error.HTTPError as erro:
        motivo = ('provisionamento_indisponivel' if erro.code in (404, 408, 429, 500, 502, 503, 504)
                  else 'provisionamento_recusado')
        erro.close()
        raise ErroProvisionamentoQr(motivo) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise ErroProvisionamentoQr('provisionamento_indisponivel') from None
    finally:
        if temporario is not None:
            temporario.unlink(missing_ok=True)
