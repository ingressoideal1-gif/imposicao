"""Exclusão entre produção local e instalação; sem rede ou arquivos no import."""
import threading


class Reserva:
    def __init__(self, controle):
        self._controle = controle
        self._liberada = False

    def liberar(self):
        with self._controle._lock:
            if not self._liberada:
                self._controle._ativos -= 1
                self._liberada = True


class ControleProducao:
    def __init__(self):
        self._lock = threading.Lock()
        self._ativos = 0
        self._atualizando = False
        self.download_lock = threading.Lock()

    def reservar(self):
        with self._lock:
            if self._atualizando:
                return None
            self._ativos += 1
            return Reserva(self)

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
    CAMINHOS = {'/api/impose', '/api/print/submit', '/api/hotfolder/drop'}

    def __init__(self, app, controlador=None):
        self.app = app
        self.controle = controlador or controle

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path', '').rstrip('/') not in self.CAMINHOS:
            return await self.app(scope, receive, send)
        reserva = self.controle.reservar()
        if reserva is None:
            from starlette.responses import JSONResponse
            resposta = JSONResponse({'detail': 'NewProd em atualização. Aguarde reiniciar antes de enviar o trabalho.'},
                                    status_code=503, headers={'Retry-After': '30'})
            return await resposta(scope, receive, send)
        try:
            return await self.app(scope, receive, send)
        finally:
            reserva.liberar()
