"""Telemetria duravel da estacao. Importar nao abre banco, nuvem ou impressora."""
from contextlib import contextmanager
from datetime import datetime, timezone
import csv
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import uuid


def agora():
    return datetime.now(timezone.utc).isoformat()


class EnvioRepetido(ValueError):
    def __init__(self, trabalho, estado):
        self.trabalho, self.estado = trabalho, estado
        super().__init__('Tentativa ja registrada; nenhum arquivo foi reenviado.')


def texto_seguro(texto):
    texto = str(texto)
    if re.search(r'(?i)\b(password|senha|secret|segredo|token|apikey|authorization|codigo_acesso)\b', texto):
        return '[conteudo de autenticacao omitido]'
    texto = re.sub(r'https?://\S+', '[URL]', texto)
    texto = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[JWT]', texto)
    texto = re.sub(r'(?i)(bearer\s+|(?:password|senha|secret|token|apikey|authorization|codigo_acesso)\s*[=:]\s*)[^\s,;}]+', r'\1[REMOVIDO]', texto)
    return texto[:2000]


class Historico:
    def __init__(self, raiz):
        self.raiz = Path(raiz)

    @contextmanager
    def banco(self):
        self.raiz.mkdir(parents=True, exist_ok=True)
        from pacotes_locais import _sem_links
        _sem_links(self.raiz)
        _sem_links(self.raiz / 'gestao.sqlite3')
        con = sqlite3.connect(self.raiz / 'gestao.sqlite3', timeout=15)
        con.row_factory = sqlite3.Row
        try:
            con.execute('PRAGMA journal_mode=WAL')
            con.execute('CREATE TABLE IF NOT EXISTS eventos (seq INTEGER PRIMARY KEY, quando TEXT NOT NULL, nivel TEXT NOT NULL, codigo TEXT NOT NULL, trabalho TEXT, dados TEXT NOT NULL)')
            con.execute('CREATE INDEX IF NOT EXISTS eventos_quando ON eventos(quando)')
            con.execute('CREATE TABLE IF NOT EXISTS trabalhos (id TEXT PRIMARY KEY, criado TEXT NOT NULL, atualizado TEXT NOT NULL, estado TEXT NOT NULL, impressora TEXT NOT NULL, spool_id INTEGER, origem TEXT NOT NULL, digest TEXT, paginas INTEGER, erro TEXT)')
            con.execute('CREATE TABLE IF NOT EXISTS amostras (minuto INTEGER PRIMARY KEY, quando TEXT NOT NULL, dados TEXT NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS controles (nome TEXT PRIMARY KEY, dados TEXT NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS requisicoes (chave TEXT PRIMARY KEY, trabalho TEXT NOT NULL UNIQUE)')
            yield con
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def evento(self, codigo, nivel='info', trabalho=None, **dados):
        # Nunca persistir corpos HTTP, configuracoes ou documentos.
        permitidos = {'tipo', 'etapa', 'quantidade', 'bytes', 'estado', 'operador', 'spool_id', 'motivo'}
        dados = {k: texto_seguro(v) if isinstance(v, str) else v for k, v in dados.items() if k in permitidos}
        with self.banco() as con:
            con.execute('INSERT INTO eventos(quando,nivel,codigo,trabalho,dados) VALUES (?,?,?,?,?)',
                        (agora(), nivel, codigo[:100], trabalho, json.dumps(dados)))

    def iniciar(self, impressora, origem, digest=None, chave=None):
        if chave is not None and (not isinstance(chave,str) or not re.fullmatch('[a-zA-Z0-9_-]{16,100}',chave)):
            raise ValueError('Identificador de tentativa invalido')
        ident = str(uuid.uuid4())
        with self.banco() as con:
            con.execute('BEGIN IMMEDIATE')
            if chave:
                existente=con.execute('SELECT t.id,t.estado,t.digest,t.impressora FROM requisicoes r JOIN trabalhos t ON t.id=r.trabalho WHERE r.chave=?',(chave,)).fetchone()
                if existente:
                    if existente['digest']!=digest or existente['impressora']!=impressora: raise ValueError('Tentativa reutilizada para outro conteudo ou impressora')
                    raise EnvioRepetido(existente['id'],existente['estado'])
            con.execute('INSERT INTO trabalhos VALUES (?,?,?,?,?,?,?,?,?,?)',
                        (ident, agora(), agora(), 'preparado', impressora[:256], None, origem[:40], digest, None, None))
            if chave: con.execute('INSERT INTO requisicoes VALUES (?,?)',(chave,ident))
        self.evento('trabalho_preparado', trabalho=ident)
        return ident

    def transicao(self, ident, estado, *, spool_id=None, paginas=None, erro=None):
        if estado not in {'preparado','envio_iniciado','enviado','na_fila','imprimindo','erro_fila','pausado','incerto','conferido','cancelado','falha','simulado','consumido_rip'}:
            raise ValueError('Estado invalido')
        with self.banco() as con:
            row = con.execute('SELECT estado FROM trabalhos WHERE id=?', (ident,)).fetchone()
            if not row: raise ValueError('Trabalho inexistente')
            if row['estado'] in {'conferido','cancelado','falha','simulado'}:
                return
            con.execute('UPDATE trabalhos SET estado=?,atualizado=?,spool_id=COALESCE(?,spool_id),paginas=COALESCE(?,paginas),erro=? WHERE id=?',
                        (estado, agora(), spool_id, paginas, texto_seguro(erro) if erro else None, ident))
        if row['estado'] != estado:
            self.evento('trabalho_' + estado, 'erro' if estado in {'falha','erro_fila','incerto'} else 'info', trabalho=ident, spool_id=spool_id)

    def recuperar(self):
        with self.banco() as con:
            ids = [r[0] for r in con.execute("SELECT id FROM trabalhos WHERE estado IN ('preparado','envio_iniciado')")]
        for ident in ids: self.transicao(ident, 'incerto')

    def controle(self, nome, dados=None):
        with self.banco() as con:
            if dados is not None:
                con.execute('INSERT OR REPLACE INTO controles VALUES (?,?)', (nome, json.dumps(dados)))
            row = con.execute('SELECT dados FROM controles WHERE nome=?', (nome,)).fetchone()
        return json.loads(row[0]) if row else None

    def amostra(self, dados):
        with self.banco() as con:
            con.execute('INSERT OR REPLACE INTO amostras VALUES (?,?,?)', (int(time.time() // 300), agora(), json.dumps(dados)))
            # Retencao somente da telemetria; trabalhos incertos nunca sao apagados.
            con.execute("DELETE FROM amostras WHERE julianday(quando) < julianday('now','-90 days')")
            con.execute("DELETE FROM eventos WHERE julianday(quando) < julianday('now','-90 days') AND (trabalho IS NULL OR trabalho IN (SELECT id FROM trabalhos WHERE estado IN ('conferido','cancelado','falha','simulado')))")

    def reconciliar(self, spool):
        # Falha de consulta nao transforma ausencia em conclusao.
        if not spool.get('disponivel'): return
        jobs = {(j['impressora'], j['spool_id']): j for j in spool['trabalhos']}
        with self.banco() as con:
            rows = con.execute("SELECT * FROM trabalhos WHERE estado IN ('enviado','na_fila','imprimindo','pausado','erro_fila') AND spool_id IS NOT NULL").fetchall()
        for row in rows:
            job = jobs.get((row['impressora'], row['spool_id']))
            if job:
                # Windows reutiliza IDs. Nao associar um trabalho de outra data.
                try:
                    enviado=datetime.fromisoformat(job['criado'])
                    if enviado.tzinfo is None: enviado=enviado.astimezone()
                    criado=datetime.fromisoformat(row['criado'])
                    if abs((enviado-criado).total_seconds()) > 600:
                        self.transicao(row['id'],'incerto')
                        continue
                except (ValueError,KeyError,TypeError):
                    self.transicao(row['id'],'incerto')
                    continue
                self.transicao(row['id'], job['estado'], paginas=job.get('paginas_enviadas'))
            else:
                self.transicao(row['id'], 'incerto')

    def relatorio(self, dias=7, limite=500, antes=None):
        if type(dias) is not int or not 1 <= dias <= 90 or type(limite) is not int or not 1 <= limite <= 1000:
            raise ValueError('Periodo ou limite invalido')
        with self.banco() as con:
            eventos = [dict(r) for r in con.execute("SELECT * FROM eventos WHERE julianday(quando) >= julianday('now',?) AND seq < ? ORDER BY seq DESC LIMIT ?", (f'-{dias} days', antes or 9223372036854775807, limite))]
            trabalhos = [dict(r) for r in con.execute("SELECT * FROM trabalhos WHERE julianday(criado) >= julianday('now',?) OR estado IN ('incerto','erro_fila','pausado','envio_iniciado','enviado','na_fila','imprimindo') ORDER BY atualizado DESC LIMIT ?", (f'-{dias} days', limite))]
            totais = [dict(r) for r in con.execute("SELECT substr(criado,1,10) dia,estado,count(*) quantidade FROM trabalhos WHERE julianday(criado) >= julianday('now',?) GROUP BY dia,estado", (f'-{dias} days',))]
            amostras = [dict(r) for r in con.execute("SELECT * FROM amostras WHERE julianday(quando) >= julianday('now',?) ORDER BY minuto DESC LIMIT 288", (f'-{dias} days',))]
        for e in eventos: e['dados'] = json.loads(e['dados'])
        for a in amostras: a['dados'] = json.loads(a['dados'])
        return dict(gerado_em=agora(), dias=dias, eventos=eventos, trabalhos=trabalhos, totais=totais, amostras=amostras,
                    proximo_evento=eventos[-1]['seq'] if len(eventos) == limite else None,
                    limite_trabalhos=limite, limite_amostras=288, impressao_fisica='exige conferencia')


_historico = None
_lock = threading.Lock()
_snapshot = {'estado':'aguardando_coleta'}
_thread = None
_contexto = threading.local()
_backup_thread = None
_backup_tentativa = -float('inf')


def diagnostico_ampliado():
    import shutil
    from canais_newprod import pasta_local
    from newprod_temp import diagnostico, medir_pasta
    dados=diagnostico()
    raiz=pasta_local()
    dados['versoes']=medir_pasta(raiz/'versoes')
    dados['pacotes']=medir_pasta(raiz/'dados'/'pacotes')
    dados['gestao']=medir_pasta(raiz/'gestao')
    volumes=[]
    if os.name=='nt':
        import ctypes
        k=ctypes.WinDLL('kernel32',use_last_error=True)
        k.GetDriveTypeW.argtypes=[ctypes.c_wchar_p]
        mascara=k.GetLogicalDrives()
        for i in range(26):
            unidade=chr(65+i)+':\\'
            if mascara & (1<<i) and k.GetDriveTypeW(unidade)==3:
                try:
                    uso=shutil.disk_usage(unidade)
                    volumes.append(dict(unidade=unidade,total=uso.total,livre=uso.free))
                except OSError:volumes.append(dict(unidade=unidade,erro='indisponivel'))
    dados['volumes_fixos']=volumes
    return dados


def backup_periodico():
    global _backup_thread,_backup_tentativa
    from controle_producao import controle
    if (_backup_thread and _backup_thread.is_alive()) or time.monotonic()-_backup_tentativa<3600 or controle.segundos_ociosos()<300:
        return
    config=historico().controle('politica') or {'backup_automatico':True}
    if not config.get('backup_automatico'):return
    ultimo=historico().controle('backup')
    if ultimo and (datetime.now(timezone.utc)-datetime.fromisoformat(ultimo['quando'])).total_seconds()<86400:return
    _backup_tentativa=time.monotonic()
    def rodar():
        try:
            import sys
            from canais_newprod import pasta_local
            from backup_gestao import executar
            result=executar(pasta_local(),Path(sys.executable).parent)
            historico().controle('backup',result)
            historico().evento('backup_automatico_verificado',quantidade=result['arquivos'],bytes=result['bytes'])
        except Exception as e:
            historico().evento('backup_automatico_falhou','erro',tipo=type(e).__name__)
    _backup_thread=threading.Thread(target=rodar,daemon=True,name='BackupGestao')
    _backup_thread.start()


def historico():
    global _historico
    with _lock:
        if _historico is None:
            from canais_newprod import pasta_local
            _historico = Historico(pasta_local() / 'gestao')
        return _historico


def spool_do_windows():
    try:
        import win32print
        trabalhos = []
        for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
            h = win32print.OpenPrinter(p[2])
            try:
                for j in win32print.EnumJobs(h, 0, 1000, 1):
                    status = int(j.get('Status') or 0)
                    estado = 'erro_fila' if status & (2|32|64|512|1024) else 'pausado' if status & 1 else 'imprimindo' if status & 16 else 'na_fila'
                    trabalhos.append(dict(impressora=p[2], spool_id=int(j['JobId']), estado=estado,
                        flags=status, paginas_total=j.get('TotalPages'), paginas_enviadas=j.get('PagesPrinted'),
                        criado=str(j.get('Submitted') or ''), confirmado_fisicamente=False))
            finally: win32print.ClosePrinter(h)
        return dict(disponivel=True, coletado_em=agora(), trabalhos=trabalhos, limite_por_impressora=1000)
    except Exception as e:
        return dict(disponivel=False, coletado_em=agora(), trabalhos=[], erro=type(e).__name__)


def snapshot():
    with _lock: return json.loads(json.dumps(_snapshot))


def saude_painel():
    import urllib.request
    from canais_newprod import PORTA, CANAL
    from agent_version import AGENT_VERSION
    try:
        # Somente loopback, sem proxy ou redirecionamento para outra origem.
        from pacotes_download import SemRedirecionamento
        abrir = urllib.request.build_opener(urllib.request.ProxyHandler({}), SemRedirecionamento()).open
        with abrir(f'http://127.0.0.1:{PORTA}/api/version', timeout=2) as r:
            dados = json.loads(r.read(8193))
        ok = dados.get('version') == 'NewProd ' + AGENT_VERSION and dados.get('canal') == CANAL
        return dict(estado='saudavel' if ok else 'versao_divergente', porta=PORTA, conferido_em=agora())
    except Exception:
        return dict(estado='indisponivel', porta=PORTA, conferido_em=agora())


def iniciar_monitor():
    global _thread
    with _lock:
        if _thread and _thread.is_alive(): return
        def ciclo():
            global _snapshot
            recuperado = False
            ultimo_disco = -float('inf')
            discos={}
            while True:
                try:
                    if not recuperado:
                        historico().recuperar()
                        recuperado = True
                    spool = spool_do_windows()
                    historico().reconciliar(spool)
                    if time.monotonic() - ultimo_disco > 300:
                        discos=diagnostico_ampliado()
                        historico().amostra(discos)
                        ultimo_disco = time.monotonic()
                    from canais_newprod import CANAL
                    novo = dict(estado='ativo', canal=CANAL, coletado_em=agora(), spool=spool, painel=saude_painel(),
                                backup=historico().controle('backup'), manutencao=historico().controle('manutencao'),armazenamento=discos)
                    with _lock: _snapshot = novo
                    backup_periodico()
                except Exception as e:
                    with _lock: _snapshot = dict(estado='erro_coleta', erro=type(e).__name__, coletado_em=agora())
                time.sleep(5)
        _thread = threading.Thread(target=ciclo, daemon=True, name='GestaoEstacoes')
        _thread.start()


def resumo_publico():
    """Somente metricas operacionais no heartbeat existente, sem logs/pedidos."""
    s = snapshot()
    spool = s.get('spool', {})
    estados = {}
    for j in spool.get('trabalhos', []): estados[j['estado']] = estados.get(j['estado'], 0) + 1
    contagens, erros = [], None
    try:
        with historico().banco() as con:
            contagens=[dict(r) for r in con.execute("SELECT substr(criado,1,10) dia,estado,count(*) quantidade FROM trabalhos WHERE julianday(criado) >= julianday('now','-30 days') GROUP BY dia,estado")]
            erros=con.execute("SELECT count(*) FROM eventos WHERE nivel='erro' AND julianday(quando) >= julianday('now','-1 day')").fetchone()[0]
    except (OSError, sqlite3.Error):
        # A indisponibilidade do historico nao deve ocultar a presenca da estacao.
        s['estado'] = 'historico_indisponivel'
    backup=s.get('backup')
    if backup: backup={k:backup.get(k) for k in ('quando','verificado','arquivos','bytes','copia_externa_confirmada')}
    return dict(schema=2, estado=s['estado'], coletado_em=s.get('coletado_em'), painel=s.get('painel'),
                fila_disponivel=spool.get('disponivel', False), fila=estados,
                erros_24h=erros, totais_30d=contagens, backup=backup, manutencao=s.get('manutencao'))


@contextmanager
def acompanhar_envio(impressora, origem='local', digest=None, chave=None):
    h = historico()
    ident = h.iniciar(impressora, origem, digest, chave)
    _contexto.trabalho = ident
    _contexto.spool_iniciado = False
    h.transicao(ident, 'envio_iniciado')
    try:
        yield ident
    except BaseException as e:
        h.transicao(ident, 'incerto' if _contexto.spool_iniciado else 'falha', erro=type(e).__name__)
        raise
    finally:
        _contexto.trabalho = None


def spool_iniciado(ident):
    if getattr(_contexto, 'trabalho', None):
        _contexto.spool_iniciado = True
        historico().transicao(_contexto.trabalho, 'envio_iniciado', spool_id=int(ident))


def envio_pode_repetir():
    return not getattr(_contexto, 'spool_iniciado', False)


def csv_relatorio(rows):
    output = io.StringIO(newline='')
    colunas = sorted({k for r in rows for k in r})
    writer = csv.DictWriter(output, fieldnames=colunas)
    writer.writeheader()
    for row in rows:
        def celula(v):
            v = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict,list)) else str(v if v is not None else '')
            return "'" + v if v.lstrip().startswith(('=','+','-','@')) else v
        writer.writerow({k:celula(v) for k,v in row.items()})
    return output.getvalue()
