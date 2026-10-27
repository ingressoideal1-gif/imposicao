"""Confirma o envio de um lote antes de gerar o seguinte; sem acesso externo."""
import secrets
import threading
import time


class EntregasPendentes:
    def __init__(self):
        self._lock = threading.Lock()
        self._pendentes = {}

    def registrar(self):
        token = secrets.token_urlsafe(32)
        evento = threading.Event()
        with self._lock:
            self._pendentes[token] = evento
        return token

    def confirmar(self, token):
        with self._lock:
            evento = self._pendentes.get(token)
            if evento is None:
                return False
            evento.set()
            return True

    def esperar(self, token, cancelado, timeout=300):
        with self._lock:
            evento = self._pendentes[token]
        limite = time.monotonic() + timeout
        try:
            while True:
                if cancelado.is_set():
                    raise RuntimeError("Entrega interrompida: conexao encerrada.")
                if evento.wait(min(0.1, max(0, limite - time.monotonic()))):
                    return
                if time.monotonic() >= limite:
                    raise RuntimeError("Envio do lote nao confirmado; geracao interrompida.")
        finally:
            with self._lock:
                self._pendentes.pop(token, None)


entregas = EntregasPendentes()
