"""Diagnóstico limitado e assíncrono; nunca recebe corpos HTTP ou credenciais."""
from collections import deque
from datetime import datetime, timezone
import json
from pathlib import Path
import queue
import re
import sqlite3
import socket
import ssl
import threading
import uuid


CODIGOS = {'canal_autonomo', 'credencial_ausente', 'resposta_invalida',
           'revisao_invalida', 'relogio_divergente', 'abrir_pedido', 'selecionar_modelo',
           'impressao'}
ETAPAS = {'listar', 'conferir', 'conferir-pedido', 'abrir-pedido', 'recibo',
          'preparar-pedido', 'selecionar', 'spool', 'catalogos-offline', 'lista-offline', 'confirmar-offline'}


def _numero(valor):
    texto = str(valor) if isinstance(valor, (str, int)) and not isinstance(valor, bool) else ''
    return texto if re.fullmatch('[0-9]{1,16}', texto) else None


def _limpar(dados):
    """Lista positiva também ao ler o arquivo local, antes do heartbeat."""
    if not isinstance(dados, dict):
        return None
    if not re.fullmatch('D-[a-f0-9]{12}', str(dados.get('id', ''))):
        return None
    try:
        quando = datetime.fromisoformat(dados['quando'])
        if quando.tzinfo is None:
            return None
    except (KeyError, ValueError, TypeError):
        return None
    r = dict(id=dados['id'], quando=quando.isoformat(),
             codigo=dados.get('codigo') if dados.get('codigo') in CODIGOS else 'resposta_invalida',
             etapa=dados.get('etapa') if dados.get('etapa') in ETAPAS else 'recibo')
    for campo in ('pedido', 'modelo'):
        r[campo] = _numero(dados.get(campo))
    versao = dados.get('versao', '')
    r['versao'] = versao if isinstance(versao, str) and re.fullmatch('[0-9.a-z-]{1,40}', versao) else 'desconhecida'
    r['tipo'] = dados.get('tipo') if dados.get('tipo') in {
        'HTTPError', 'URLError', 'TimeoutError', 'ConnectionError', 'OSError',
        'ValueError', 'JSONDecodeError', 'ConferenciaIndisponivel', 'PermissionError',
        'KeyError', 'TypeError', 'Exception'} else 'Exception'
    origem = dados.get('origem', '')
    r['origem'] = origem if isinstance(origem, str) and re.fullmatch(
        r'(coleta_autonoma|selecao_piloto|revisao_pedido_piloto|print_service|gestao_estacoes|estatisticas_piloto)\.py:[0-9]{1,6}', origem) else None
    r['transporte'] = dados.get('transporte') if dados.get('transporte') in {'dns', 'tls', 'timeout', 'conexao'} else None
    for campo, minimo, maximo in [('http_origem', 100, 599), ('duracao_ms', 0, 3600000)]:
        v = dados.get(campo)
        r[campo] = v if type(v) is int and minimo <= v <= maximo else None
    return r


class Diagnosticos:
    def __init__(self, raiz, capacidade=256):
        self.raiz = raiz
        self.fila = queue.Queue(maxsize=capacidade)
        self.lock = threading.Lock()
        self.recentes = deque(maxlen=20)
        self.descartados = 0
        self.falhas_gravacao = 0
        self.carregado = False
        self.thread = None

    def iniciar(self):
        with self.lock:
            if self.thread is None:
                self.thread = threading.Thread(target=self._rodar, name='DiagnosticosNewProd', daemon=True)
                self.thread.start()

    def registrar(self, dados):
        registro = _limpar(dados)
        if registro is None:
            return
        self.iniciar()
        with self.lock:
            self.recentes.append(registro)
        try:
            self.fila.put_nowait(registro)
        except queue.Full:
            with self.lock:
                self.descartados += 1

    def resumo(self):
        self.iniciar()
        with self.lock:
            return dict(schema=1, carregado=self.carregado, pendentes=self.fila.qsize(),
                        descartados=self.descartados, falhas_gravacao=self.falhas_gravacao,
                        recentes=[dict(r) for r in reversed(self.recentes)])

    def _banco(self):
        from pacotes_locais import _sem_links
        raiz = Path(self.raiz())
        _sem_links(raiz)
        raiz.mkdir(parents=True, exist_ok=True)
        arquivo = raiz / 'diagnosticos.sqlite3'
        _sem_links(arquivo)
        con = sqlite3.connect(arquivo, timeout=1)
        con.execute('CREATE TABLE IF NOT EXISTS diagnosticos (seq INTEGER PRIMARY KEY, dados TEXT NOT NULL)')
        return con

    def _rodar(self):
        try:
            con = self._banco()
            try:
                antigos = [_limpar(json.loads(r[0])) for r in con.execute(
                    'SELECT dados FROM diagnosticos ORDER BY seq DESC LIMIT 20')]
                with self.lock:
                    novos = list(self.recentes)
                    self.recentes.clear()
                    self.recentes.extend(r for r in reversed(antigos) if r)
                    self.recentes.extend(novos)
            finally:
                con.close()
        except Exception:
            with self.lock:
                self.falhas_gravacao += 1
        finally:
            with self.lock:
                self.carregado = True
        while True:
            registro = self.fila.get()
            if registro is None:
                self.fila.task_done()
                return
            try:
                con = self._banco()
                try:
                    with con:
                        con.execute('INSERT INTO diagnosticos(dados) VALUES (?)', (json.dumps(registro),))
                        con.execute('DELETE FROM diagnosticos WHERE seq NOT IN '
                                    '(SELECT seq FROM diagnosticos ORDER BY seq DESC LIMIT 2000)')
                finally:
                    con.close()
            except Exception:
                with self.lock:
                    self.falhas_gravacao += 1
            finally:
                self.fila.task_done()


def _raiz():
    from canais_newprod import pasta_local
    return pasta_local() / 'gestao'


_registros = Diagnosticos(_raiz)


def registrar(erro, codigo, etapa, *, pedido=None, modelo=None, duracao_ms=None):
    """Não lança, não grava no disco nem espera rede na thread da operação."""
    try:
        anterior = getattr(erro, 'diagnostico_id', None)
        if isinstance(anterior, str) and re.fullmatch('D-[a-f0-9]{12}', anterior):
            return anterior
        from agent_version import AGENT_VERSION
        ident = 'D-' + uuid.uuid4().hex[:12]
        origem = None
        trace = erro.__traceback__
        while trace:
            nome = Path(trace.tb_frame.f_code.co_filename).name
            if nome in {'coleta_autonoma.py', 'selecao_piloto.py', 'revisao_pedido_piloto.py',
                        'print_service.py', 'gestao_estacoes.py', 'estatisticas_piloto.py'}:
                origem = nome + ':' + str(trace.tb_lineno)
            trace = trace.tb_next
        causa = getattr(erro, 'reason', erro)
        transporte = ('dns' if isinstance(causa, socket.gaierror) else
                      'tls' if isinstance(causa, ssl.SSLError) else
                      'timeout' if isinstance(causa, TimeoutError) else
                      'conexao' if isinstance(causa, ConnectionError) else None)
        _registros.registrar(dict(id=ident, quando=datetime.now(timezone.utc).isoformat(),
            codigo=codigo, etapa=etapa, pedido=pedido, modelo=modelo, versao=AGENT_VERSION,
            origem=origem, transporte=transporte,
            tipo=type(erro).__name__, http_origem=getattr(erro, 'code', None), duracao_ms=duracao_ms))
        erro.diagnostico_id = ident
        return ident
    except Exception:
        return None


def resumo():
    try:
        return _registros.resumo()
    except Exception:
        return {'schema': 1, 'indisponivel': True, 'recentes': []}
