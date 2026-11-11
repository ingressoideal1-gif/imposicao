"""Confirma o envio de um lote antes de gerar o seguinte; sem acesso externo."""
import secrets
import threading
import time


class EntregasPendentes:
    def __init__(self, relogio=None):
        self._lock = threading.Lock()
        self._pendentes = {}
        self._relogio = relogio or time.monotonic

    def registrar(self):
        token = secrets.token_urlsafe(32)
        evento = threading.Event()
        with self._lock:
            agora = self._relogio()
            self._pendentes[token] = dict(evento=evento, inicio=agora, atividade=agora,
                                         timeout=300, limite_total=900)
        return token

    def confirmar(self, token):
        with self._lock:
            pendente = self._pendentes.get(token)
            if pendente is None or not self._vigente(pendente):
                return False
            pendente['evento'].set()
            return True

    def _vigente(self, pendente):
        agora = self._relogio()
        return (agora - pendente['atividade'] < pendente['timeout']
                and agora - pendente['inicio'] < pendente['limite_total'])

    def acompanhar(self, token):
        """Renova comunicacao; nunca confirma envio nem estende o limite total."""
        with self._lock:
            pendente = self._pendentes.get(token)
            if pendente is None or pendente['evento'].is_set() or not self._vigente(pendente):
                return False
            pendente['atividade'] = self._relogio()
            return True

    def esperar(self, token, cancelado, timeout=300, limite_total=900):
        with self._lock:
            pendente = self._pendentes[token]
            pendente.update(timeout=timeout, limite_total=limite_total)
            evento = pendente['evento']
        try:
            while True:
                if cancelado.is_set():
                    raise RuntimeError("Entrega interrompida: conexao encerrada.")
                if evento.is_set():
                    return
                with self._lock:
                    vigente = self._vigente(pendente)
                if not vigente:
                    raise RuntimeError("Envio do lote nao confirmado; geracao interrompida.")
                evento.wait(0.1)
        finally:
            with self._lock:
                self._pendentes.pop(token, None)


entregas = EntregasPendentes()
