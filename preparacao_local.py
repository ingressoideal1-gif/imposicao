"""Preparador opt-in do piloto. Sem rede, startup automático ou impressão.

A fila é de preparação, em memória; pacotes concluídos persistem no armazenamento.
Consulta de estado nunca lê PDFs nem executa hashes. Não é uma fila de impressão.
"""
from copy import deepcopy
from datetime import datetime, timezone
import threading
import time

from pacotes_locais import _manifesto


class PreparacaoInterrompida(Exception):
    pass


def prioridade(setor, prazo, setor_prioritario, agora):
    """Setor primeiro; vencidos/24h por prazo; sem prazo por último."""
    if prazo is not None:
        if not isinstance(prazo, datetime) or prazo.tzinfo is None or prazo.utcoffset() is None:
            raise ValueError("Prazo precisa conter fuso horário.")
        instante = prazo.timestamp()
    else:
        instante = float("inf")
    return (str(setor).strip().casefold() != setor_prioritario.strip().casefold(),
            instante > agora.timestamp() + 24 * 3600, instante)


class PreparadorLocal:
    def __init__(self, armazenamento, *, setor_prioritario="laser", ocupado=lambda: False,
                 limite=128, validade_estado=60, relogio=time.monotonic):
        if limite < 1 or validade_estado <= 0:
            raise ValueError("Limite e validade devem ser positivos.")
        self.armazenamento = armazenamento
        self.setor_prioritario = setor_prioritario
        self.ocupado = ocupado
        self.limite = limite
        self.validade_estado = validade_estado
        self.expirar_estado = True
        self.relogio = relogio
        self._cv = threading.Condition()
        self._tarefas = {}
        self._preferenciais = set()
        self._estados = {}
        self._ativo = None
        self._manifesto_ativo = None
        self._thread = None
        self._parar = False
        self._pausado = False

    def preferir(self, modelos):
        with self._cv:
            self._preferenciais = set(modelos)
            self._cv.notify_all()

    def _prioridade(self, chave, agora):
        _, _, setor, prazo = self._tarefas[chave]
        instante = prazo.timestamp() if prazo else float('inf')
        faixa = 0 if chave[1] in self._preferenciais else (1 if instante <= agora.timestamp() + 86400 else 2)
        return (faixa, instante, str(setor).strip().casefold() != self.setor_prioritario.strip().casefold(), chave)

    def iniciar(self, *, antes_de_executar=None):
        with self._cv:
            if not self.armazenamento.habilitado:
                raise RuntimeError("Preparação local desativada.")
            if self._thread and self._thread.is_alive():
                if self._parar:
                    raise RuntimeError('Preparador ainda está encerrando.')
                return
            self._parar = False
            try:
                if antes_de_executar:
                    antes_de_executar()
            except Exception:
                self._parar = True
                raise
            self._thread = threading.Thread(target=self._executar, name="PreparacaoLocalPiloto", daemon=True)
            self._thread.start()

    def agendar(self, manifesto, fontes, *, setor, prazo=None):
        m = _manifesto(manifesto)
        prioridade(setor, prazo, self.setor_prioritario, datetime.now(timezone.utc))
        chave = (m["empresa"], m["modelo"], m["revisao"])
        with self._cv:
            if not self.armazenamento.habilitado or self._parar:
                raise RuntimeError("Preparador desativado ou encerrado.")
            if chave in self._tarefas or chave == self._ativo:
                anterior = self._tarefas[chave][0] if chave in self._tarefas else self._manifesto_ativo
                if anterior != m:
                    raise ValueError("Revisão já agendada com conteúdo diferente.")
                return False
            if len(self._tarefas) + (self._ativo is not None) >= self.limite:
                raise RuntimeError("Fila local de preparação cheia.")
            self._tarefas[chave] = (m, dict(fontes), setor, prazo)
            self._registrar(chave, {"estado": "aguardando_preparacao"})
            self._cv.notify_all()
        return True

    def _registrar(self, chave, dados):
        self._estados[chave] = {
            **dados, "autorizado_offline": False,
            "verificado_em": datetime.now(timezone.utc).isoformat()
            if dados["estado"] == "local_validado" else None,
            "_instante": self.relogio(),
        }
        # Diagnósticos finalizados são cache descartável; pacotes não são apagados.
        while len(self._estados) > self.limite * 2:
            candidato = next((k for k in self._estados
                              if k != self._ativo and k not in self._tarefas), None)
            if candidato is None:
                break
            del self._estados[candidato]

    def atualizar_agenda(self, manifesto, *, setor, prazo=None):
        prioridade(setor, prazo, self.setor_prioritario, datetime.now(timezone.utc))
        chave = (manifesto['empresa'], manifesto['modelo'], manifesto['revisao'])
        with self._cv:
            if chave in self._tarefas:
                m, fontes, _, _ = self._tarefas[chave]
                if m != manifesto:
                    raise ValueError('Revisão divergente na atualização da agenda.')
                self._tarefas[chave] = (m, fontes, setor, prazo)
                self._cv.notify_all()

    def estado(self, empresa, modelo, revisao, *, revisao_online=None):
        chave = (empresa, modelo, revisao)
        with self._cv:
            if not self.armazenamento.habilitado:
                return {"estado": "desativado", "autorizado_offline": False}
            dados = deepcopy(self._estados.get(chave, {"estado": "desconhecido"}))
        instante = dados.pop("_instante", None)
        dados["autorizado_offline"] = False
        dados["revisao"] = revisao
        dados["atualidade_online"] = "desconhecida"
        if dados["estado"] == "local_validado":
            if self.expirar_estado and (instante is None or self.relogio() - instante >= self.validade_estado):
                dados["estado"] = "revalidacao_pendente"
            if revisao_online is not None:
                dados["atualidade_online"] = "confirmada" if revisao_online == revisao else "desatualizada"
                if revisao_online != revisao:
                    dados["estado"] = "atualizacao_pendente"
        return dados

    def pausar(self, pausado=True):
        with self._cv:
            self._pausado = pausado
            self._cv.notify_all()

    def resumo(self):
        try:
            ocupado = bool(self.ocupado())
        except Exception:
            ocupado = True
        with self._cv:
            return {'pausado': self._pausado, 'encerrando': self._parar,
                    'pendentes': len(self._tarefas), 'ativo': self._ativo is not None,
                    'ocupado': ocupado}

    def encerrar(self, timeout=5):
        with self._cv:
            self._parar = True
            self._cv.notify_all()
            thread = self._thread
        if thread:
            thread.join(timeout)
        return thread is None or not thread.is_alive()

    def _checkpoint(self):
        while True:
            with self._cv:
                if self._parar or not self.armazenamento.habilitado:
                    raise PreparacaoInterrompida()
                pausado = self._pausado
            # Callback sem lock: um integrador lento não bloqueia a consulta da UI.
            ocupado = self.ocupado()
            if not pausado and not ocupado:
                return
            with self._cv:
                if self._ativo is not None:
                    self._registrar(self._ativo, {"estado": "preparacao_pausada"})
                self._cv.wait(0.1)

    def _executar(self):
        while True:
            with self._cv:
                while not self._tarefas and not self._parar:
                    self._cv.wait()
                if self._parar:
                    return
            try:
                self._checkpoint()
            except PreparacaoInterrompida:
                return
            except Exception:
                # Diagnóstico de atividade indisponível: não assumir ociosidade.
                with self._cv:
                    self._cv.wait(0.1)
                continue
            with self._cv:
                agora = datetime.now(timezone.utc)
                chave = min(self._tarefas, key=lambda k: self._prioridade(k, agora))
                m, fontes, _, _ = self._tarefas.pop(chave)
                self._ativo = chave
                self._manifesto_ativo = m
                self._registrar(chave, {"estado": "preparando_local"})
            try:
                resultado = self.armazenamento.preparar(m, fontes, checkpoint=self._checkpoint)
            except PreparacaoInterrompida:
                resultado = {"estado": "preparacao_interrompida"}
            except Exception:
                # Não devolver caminhos, nomes de arquivos ou dados do trabalho à UI.
                resultado = {"estado": "falha_preparacao"}
            with self._cv:
                self._registrar(chave, resultado)
                self._ativo = None
                self._manifesto_ativo = None
                self._cv.notify_all()
