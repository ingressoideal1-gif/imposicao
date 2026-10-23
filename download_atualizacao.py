"""Download conferido, sem substituir um pacote completo por uma copia parcial."""
import hashlib
import errno
import os
from pathlib import Path
import shutil
import tempfile

BLOQUEIOS = {'instalacao_falhou', 'instalacao_nao_confirmada',
             'reinicio_falhou', 'validacao_pendente'}


class FalhaDownload(ValueError):
    pass


def baixar(abrir, req, destino, tamanho, sha256, instalacao):
    destino = Path(destino)
    limite = tamanho if tamanho is not None else 512 * 1024**2
    if type(limite) is not int or not 0 < limite <= 512 * 1024**2:
        raise FalhaDownload('tamanho_invalido')
    # Reserva conservadora para MSI, extracao onefile e rollback do Windows.
    # Nao e uma estimativa exata do espaco descompactado.
    reserva = 4 * limite + 512 * 1024**2
    for pasta in (destino.parent, Path(instalacao)):
        if shutil.disk_usage(pasta).free < reserva:
            raise FalhaDownload('espaco_insuficiente')
    parcial = None
    try:
        with abrir(req, timeout=600) as resposta:
            fd, parcial = tempfile.mkstemp(prefix='newprod-update-', suffix='.part', dir=destino.parent)
            digest = hashlib.sha256()
            total = 0
            with os.fdopen(fd, 'wb') as saida:
                while bloco := resposta.read(1024 * 1024):
                    total += len(bloco)
                    if total > limite:
                        raise FalhaDownload('tamanho_excedido')
                    saida.write(bloco)
                    digest.update(bloco)
                saida.flush()
                os.fsync(saida.fileno())
            if tamanho is not None and total != tamanho:
                raise FalhaDownload('download_incompleto')
            if digest.hexdigest() != sha256:
                raise FalhaDownload('sha_divergente')
            os.replace(parcial, destino)
    except OSError as erro:
        if erro.errno == errno.ENOSPC or getattr(erro, 'winerror', None) == 112:
            raise FalhaDownload('espaco_insuficiente') from None
        raise
    finally:
        if parcial is not None:
            Path(parcial).unlink(missing_ok=True)


def exige_intervencao(registro, versao, forcado=False):
    """Mantem a evidencia da falha; nova versao ou tentativa humana libera."""
    return (not forcado and registro.get('versao_alvo') == versao and
            registro.get('etapa') in BLOQUEIOS)
