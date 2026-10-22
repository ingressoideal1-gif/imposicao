"""Diagnóstico limitado e assíncrono; nunca persiste corpos HTTP ou credenciais."""
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
from urllib.error import HTTPError


CODIGOS = {'canal_autonomo', 'credencial_ausente', 'resposta_invalida',
           'revisao_invalida', 'relogio_divergente', 'abrir_pedido', 'selecionar_modelo',
           'impressao'}
ETAPAS = {'listar', 'conferir', 'conferir-pedido', 'abrir-pedido', 'recibo',
          'preparar-pedido', 'selecionar', 'spool', 'catalogos-offline', 'lista-offline', 'confirmar-offline'}

RECURSOS_LOCAIS = {'qr_contratos', 'qr_base_legada', 'qr_base_v2', 'fontes', 'dependencias'}
MOTIVOS_LOCAIS = {'contrato_recusado', 'contrato_sem_cache', 'contrato_invalido',
                  'base_ausente', 'base_integridade_invalida', 'base_tamanho_invalido',
                  'origem_fonte_recusada', 'http_recusado', 'permissao_negada',
                  'arquivo_ausente', 'timeout', 'falha_recurso',
                  'provisionamento_recusado', 'provisionamento_indisponivel',
                  'download_incompleto', 'download_integridade_invalida'}


def _dependencia_local(erro):
    """Classifica só a preparação local; nunca devolve mensagens ou caminhos.

    A pilha identifica o recurso mesmo quando a origem pública da exceção é
    selecao_piloto.py. Não abre arquivos, importa o motor nem consulta a rede.
    """
    quadros = []
    trace = erro.__traceback__
    while trace:
        quadros.append((Path(trace.tb_frame.f_code.co_filename).name,
                        trace.tb_frame.f_code.co_name))
        trace = trace.tb_next
    if ('offline_estacao.py', 'preparar_dependencias') not in quadros:
        return {}
    arquivos = {nome for nome, _ in quadros}
    if arquivos & {'qr_base_v2.py', 'qr_provisionamento.py'}:
        recurso = 'qr_base_v2'
    elif 'qr_contratos.py' in arquivos:
        recurso = 'qr_contratos'
    elif 'qr_ideal.py' in arquivos:
        recurso = 'qr_base_legada'
    elif arquivos & {'font_cache.py', 'fontes_sistema.py', 'pacotes_download.py', 'db.py'}:
        recurso = 'fontes'
    else:
        recurso = 'dependencias'
    motivo = 'falha_recurso'
    motivo_qr = getattr(erro, 'motivo_qr', None)
    if recurso == 'qr_base_v2' and isinstance(motivo_qr, str) and motivo_qr in MOTIVOS_LOCAIS:
        return {'recurso_local': recurso, 'motivo_local': motivo_qr}
    # Comparações exatas: não persistir texto livre nem partes da mensagem.
    texto = erro.args[0] if erro.args and isinstance(erro.args[0], str) else None
    if recurso == 'qr_contratos':
        motivo = {
            'QR Ideal: servidor recusou o contrato; confira a emissao antes de imprimir': 'contrato_recusado',
            'QR Ideal: conecte a estacao uma vez para reservar esta emissao': 'contrato_sem_cache',
            'Contrato QR invalido': 'contrato_invalido',
            'Contrato QR repetido': 'contrato_invalido',
        }.get(texto, motivo)
    elif recurso in {'qr_base_legada', 'qr_base_v2'}:
        if isinstance(erro, FileNotFoundError) or texto == 'QR12: base privada independente nao provisionada nesta estacao; solicite o provisionamento administrativo antes de imprimir':
            motivo = 'base_ausente'
        elif texto == 'QR Ideal: integridade da base privada nao confirmada':
            motivo = 'base_integridade_invalida'
        elif type(erro) is ValueError and ('qr_ideal.py', '__init__') in quadros:
            motivo = 'base_tamanho_invalido'
    elif recurso == 'fontes' and texto == 'Origem de recurso não permitida.':
        motivo = 'origem_fonte_recusada'
    if motivo == 'falha_recurso':
        if isinstance(erro, HTTPError):
            motivo = 'http_recusado'
        elif isinstance(erro, PermissionError):
            motivo = 'permissao_negada'
        elif isinstance(erro, FileNotFoundError):
            motivo = 'arquivo_ausente'
        elif isinstance(erro, TimeoutError):
            motivo = 'timeout'
    return {'recurso_local': recurso, 'motivo_local': motivo}


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
    from diagnostico_http import RESULTADOS
    for campo, permitidos in {
        'recurso_local': RECURSOS_LOCAIS,
        'motivo_local': MOTIVOS_LOCAIS,
        'motivo_http': RESULTADOS,
        'formato_resposta': {'json', 'html', 'outro'},
        'servidor_http': {'cloudflare', 'envoy', 'nginx', 'squid', 'outro'},
        'windows_edicao': {'Professional', 'Core', 'Enterprise', 'Education', 'ProfessionalWorkstation'},
    }.items():
        v = dados.get(campo)
        r[campo] = v if isinstance(v, str) and v in permitidos else None
    for campo in ('empresa_padrao', 'destino_padrao', 'via_presente', 'cf_ray_presente',
                  'desafio_cloudflare', 'proxy_https_configurado'):
        r[campo] = dados.get(campo) if type(dados.get(campo)) is bool else None
    build = dados.get('windows_build')
    r['windows_build'] = build if type(build) is int and 0 < build < 1000000 else None
    estacao = dados.get('estacao_enviada')
    r['estacao_enviada'] = estacao if isinstance(estacao, str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', estacao) else None
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

    def registrar(self, dados, resposta=None):
        registro = _limpar(dados)
        if registro is None:
            return
        self.iniciar()
        with self.lock:
            self.recentes.append(registro)
        try:
            self.fila.put_nowait((registro, resposta))
        except queue.Full:
            with self.lock:
                self.descartados += 1
            if resposta is not None:
                try:
                    resposta.close()
                except Exception:
                    pass

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
            item = self.fila.get()
            if item is None:
                self.fila.task_done()
                return
            registro, resposta = item
            try:
                if resposta is not None:
                    from diagnostico_http import classificar_corpo
                    registro = {**registro, 'motivo_http': classificar_corpo(resposta)}
                    with self.lock:
                        self.recentes = deque((registro if r['id'] == registro['id'] else r
                                               for r in self.recentes), maxlen=20)
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


def registrar(erro, codigo, etapa, *, pedido=None, modelo=None, duracao_ms=None, contexto_http=None):
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
        extras = _dependencia_local(erro)
        resposta = None
        if contexto_http is not None:
            from diagnostico_http import contexto
            extras.update(contexto(erro, *contexto_http))
            if isinstance(erro, HTTPError):
                # Manter o proprietário do stream vivo até a leitura em segundo plano.
                resposta = erro if getattr(erro, 'fp', None) is not None else None
                erro.__traceback__ = None
                extras['motivo_http'] = 'aguardando_leitura' if resposta is not None else 'corpo_indisponivel'
        _registros.registrar(dict(**extras, id=ident, quando=datetime.now(timezone.utc).isoformat(),
            codigo=codigo, etapa=etapa, pedido=pedido, modelo=modelo, versao=AGENT_VERSION,
            origem=origem, transporte=transporte,
            tipo=type(erro).__name__, http_origem=getattr(erro, 'code', None), duracao_ms=duracao_ms), resposta)
        erro.diagnostico_id = ident
        return ident
    except Exception:
        return None


def resumo():
    try:
        return _registros.resumo()
    except Exception:
        return {'schema': 1, 'indisponivel': True, 'recentes': []}
