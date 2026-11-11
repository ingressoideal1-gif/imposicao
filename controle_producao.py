"""Exclusão entre produção local e instalação; sem rede ou arquivos no import."""
import threading
import time


class Reserva:
    def __init__(self, controle, exclusiva=False):
        self._controle = controle
        self._liberada = False
        self._exclusiva = exclusiva

    def liberar(self):
        with self._controle._lock:
            if not self._liberada:
                self._controle._ativos -= 1
                if self._exclusiva:
                    self._controle._impressao_exclusiva = False
                self._controle._ultima_atividade = self._controle._relogio()
                self._liberada = True


class ControleProducao:
    def __init__(self, *, relogio=time.monotonic):
        self._relogio = relogio
        self._ultima_atividade = relogio()
        self._lock = threading.Lock()
        self._ativos = 0
        self._atualizando = False
        self._impressao_exclusiva = False
        self.download_lock = threading.Lock()

    def reservar(self):
        with self._lock:
            if self._atualizando or self._impressao_exclusiva:
                return None
            self._ativos += 1
            self._ultima_atividade = self._relogio()
            return Reserva(self)

    def reservar_impressao(self):
        """Aceite dentro de /impose: so sua propria reserva HTTP pode existir."""
        with self._lock:
            if self._atualizando or self._impressao_exclusiva or self._ativos > 1:
                return None
            self._impressao_exclusiva = True
            self._ativos += 1
            self._ultima_atividade = self._relogio()
            return Reserva(self, exclusiva=True)

    def segundos_ociosos(self):
        with self._lock:
            return 0 if self._ativos or self._atualizando else self._relogio() - self._ultima_atividade

    def ocupado(self):
        with self._lock:
            return self._ativos > 0 or self._atualizando

    def iniciar_atualizacao(self):
        with self._lock:
            if self._ativos or self._atualizando:
                return False
            self._atualizando = True
            return True

    def cancelar_atualizacao(self):
        with self._lock:
            self._atualizando = False


controle = ControleProducao()


class ProtegerProducaoMiddleware:
    """Mantém reserva até o fim do envio HTTP, inclusive StreamingResponse."""
    CAMINHOS = {'/api/impose', '/api/print/submit', '/api/hotfolder/drop',
                '/api/print/experimental/submit', '/api/print/experimental/submit-lote'}

    def __init__(self, app, controlador=None):
        self.app = app
        self.controle = controlador or controle

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path', '').rstrip('/') not in self.CAMINHOS:
            return await self.app(scope, receive, send)
        reserva = self.controle.reservar()
        if reserva is None:
            from starlette.responses import JSONResponse
            resposta = JSONResponse({'detail': 'NewProd ocupado com impressão ou atualização. Acompanhe o trabalho antes de iniciar outro.'},
                                    status_code=503, headers={'Retry-After': '30'})
            return await resposta(scope, receive, send)
        try:
            return await self.app(scope, receive, send)
        finally:
            reserva.liberar()
