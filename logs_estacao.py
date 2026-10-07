"""Logs locais limitados e com ocultacao de credenciais; sem iniciar no import."""
import logging
from logging.handlers import RotatingFileHandler
import threading
import time
from gestao_estacoes import texto_seguro


class SaidaLog:
    encoding = 'utf-8'
    def __init__(self, logger):
        self.logger = logger
        self._pendentes = {}
        self._lock = threading.Lock()
        self._ultimo_erro = 0

    def write(self, texto):
        ident = threading.get_ident()
        with self._lock:
            partes = (self._pendentes.pop(ident, '') + texto).split('\n')
            restante = partes.pop()[-4000:]
            if restante: self._pendentes[ident] = restante
            while len(self._pendentes) > 128:
                self._pendentes.pop(next(iter(self._pendentes)))
            for linha in partes:
                if linha.strip(): self.logger.info(texto_seguro(linha))
                if any(p in linha.lower() for p in ('erro','error','falha','exception')) and time.monotonic()-self._ultimo_erro > 10:
                    self._ultimo_erro=time.monotonic()
                    try:
                        from gestao_estacoes import historico
                        historico().evento('erro_log_agente','erro',motivo=texto_seguro(linha))
                    except Exception:
                        pass  # Falha do banco nao recursa sobre o logger.
        return len(texto)

    def flush(self):
        for handler in self.logger.handlers: handler.flush()

    def isatty(self): return False


def instalar(raiz):
    from pathlib import Path
    raiz = Path(raiz)
    raiz.mkdir(parents=True, exist_ok=True)
    from pacotes_locais import _sem_links
    _sem_links(raiz)
    _sem_links(raiz / 'agent.log')
    logger = logging.getLogger('newprod.estacao')
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = RotatingFileHandler(raiz / 'agent.log', maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
        handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
        logger.addHandler(handler)
    return SaidaLog(logger)
