"""Prepara localmente a base v2; nenhum segredo novo via instalador/HTTP."""
import hashlib
import os
import tempfile
import threading
from pathlib import Path

from qr_ideal import PoolQR, POOL_V2_NOME, POOL_V2_SHA256, POOL_SHA256, TOTAL, TAMANHO
from qr_derivacao import blocos

_pool = None
_lock = threading.Lock()


def obter(legado):
    global _pool
    with _lock:
        if _pool is not None:
            return _pool
        from migracao_estacao import pasta_dados, proteger_pasta
        pasta = pasta_dados()
        pasta.mkdir(parents=True, exist_ok=True)
        proteger_pasta(pasta)
        destino = pasta / POOL_V2_NOME
        if not destino.exists():
            privados = Path(legado.caminho).read_bytes()
            if len(privados) != TOTAL*TAMANHO or hashlib.sha256(privados).hexdigest() != POOL_SHA256:
                raise ValueError("QR Ideal: integridade da base mestra nao confirmada")
            temporario = None
            try:
                with tempfile.NamedTemporaryFile(dir=pasta, delete=False) as f:
                    temporario = Path(f.name)
                    h = hashlib.sha256()
                    for bloco in blocos(privados, TOTAL):
                        h.update(bloco); f.write(bloco)
                if h.hexdigest() != POOL_V2_SHA256:
                    raise ValueError("Base privada incompleta ou sem integridade")
                # Publica somente depois de verificar; nunca sobrescreve outra base.
                os.link(temporario, destino)
            finally:
                if temporario is not None:
                    temporario.unlink(missing_ok=True)
        pool = PoolQR(str(destino))
        try:
            pool.verificar_integridade(POOL_V2_SHA256)
        except Exception:
            pool.fechar()
            raise
        _pool = pool
        return pool
