"""Abre a base independente provisionada por canal privado na estacao."""
import threading

from qr_ideal import PoolQR, POOL_V2_NOME, POOL_V2_SHA256

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
            from qr_provisionamento import obter_automaticamente
            obter_automaticamente(destino)
        pool = PoolQR(str(destino))
        try:
            pool.verificar_integridade(POOL_V2_SHA256)
        except Exception:
            pool.fechar()
            raise
        _pool = pool
        return pool
