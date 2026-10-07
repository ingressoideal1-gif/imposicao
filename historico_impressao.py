"""Metadados de impressão e transporte limitado; nunca transporta PDFs ou bancos."""
import json
import os
import re
import threading
import time
import uuid


def contexto_validado(valor):
    if valor is None:
        return {'alvos': [], 'tipo': 'nao_identificado', 'escopo': 'sem_identificacao'}
    if not isinstance(valor, dict) or len(json.dumps(valor)) > 16384:
        raise ValueError('Contexto de impressao invalido')
    alvos = valor.get('alvos', [])
    if not isinstance(alvos, list) or len(alvos) > 128:
        raise ValueError('Limite de modelos do historico excedido')
    limpos = []
    for a in alvos:
        if not isinstance(a, dict) or any(not re.fullmatch(r'[1-9][0-9]{0,15}', str(a.get(k, ''))) for k in ('pedido', 'modelo')):
            raise ValueError('Pedido ou modelo invalido no historico')
        par = {k: str(a[k]) for k in ('pedido', 'modelo')}
        if par not in limpos:
            limpos.append(par)
    tipo = valor.get('tipo', 'nao_identificado')
    if tipo not in ('capa', 'contracapa', 'miolo', 'nao_identificado'):
        raise ValueError('Tipo de arquivo invalido')
    lote = valor.get('lote')
    if lote is not None:
        lote = str(uuid.UUID(lote))
    return dict(alvos=limpos, tipo=tipo, lote=lote,
                escopo='modelo' if len(limpos) == 1 else 'selecao' if limpos else 'sem_identificacao',
                reimpressao=valor.get('reimpressao') is True)


def preparar(con):
    con.execute('CREATE TABLE IF NOT EXISTS contexto_impressao (trabalho TEXT PRIMARY KEY, dados TEXT NOT NULL)')
    con.execute('CREATE INDEX IF NOT EXISTS eventos_trabalho_seq ON eventos(trabalho,seq)')


def lote_pendente(h, limite=30):
    """Uma leitura por intervalo, pagina por chave; sem varrer PDFs ou disco."""
    with h.banco() as con:
        con.execute('INSERT OR IGNORE INTO controles VALUES (?,?)', ('historico_instalacao', json.dumps(str(uuid.uuid4()))))
        instalacao = json.loads(con.execute("SELECT dados FROM controles WHERE nome='historico_instalacao'").fetchone()[0])
        r = con.execute("SELECT dados FROM controles WHERE nome='historico_cursor'").fetchone()
        cursor = json.loads(r[0]) if r else 0
        rows = con.execute('SELECT e.*,c.dados contexto,t.impressora,t.spool_id,t.origem FROM eventos e '
                           'LEFT JOIN contexto_impressao c ON c.trabalho=e.trabalho '
                           'LEFT JOIN trabalhos t ON t.id=e.trabalho WHERE e.seq>? ORDER BY e.seq LIMIT ?', (cursor, limite)).fetchall()
    eventos = []
    ultimo = cursor
    for r in rows:
        if r['trabalho']:
            evento = dict(seq=r['seq'], quando=r['quando'], trabalho=r['trabalho'], codigo=r['codigo'],
                          nivel=r['nivel'], dados=json.loads(r['dados']),
                          contexto=json.loads(r['contexto']) if r['contexto'] else contexto_validado(None),
                          impressora='Hot folder / RIP' if r['origem'] == 'hotfolder' else r['impressora'], spool_id=r['spool_id'])
            if len(json.dumps(eventos + [evento]).encode()) > 196608:
                break
            eventos.append(evento)
        ultimo = r['seq']
    return dict(instalacao=instalacao, eventos=eventos, cursor=ultimo)


class Sincronizador:
    def __init__(self, historico, enviar):
        self.h, self.enviar = historico, enviar
        self.proxima = 0
        self.falhas = 0

    def ciclo(self, agora=None):
        agora = time.monotonic() if agora is None else agora
        if agora < self.proxima:
            return
        self.proxima = agora + 30
        try:
            lote = lote_pendente(self.h)
            if lote['eventos']:
                resposta = self.enviar(lote)
                if resposta != {'confirmado': lote['cursor'], 'instalacao': lote['instalacao']}:
                    raise ValueError('Confirmacao da central divergente')
            # Nao avancar cursor antes de receber confirmacao; retry e idempotente.
            self.h.controle('historico_cursor', lote['cursor'])
            with self.h.banco() as con:
                pendente = con.execute('SELECT 1 FROM eventos WHERE seq>? LIMIT 1', (lote['cursor'],)).fetchone() is not None
            self.h.controle('historico_sync', {'estado': 'enviando' if pendente else 'sincronizado', 'cursor': lote['cursor'],
                'quando': __import__('gestao_estacoes').agora()})
            self.falhas = 0
        except Exception:
            self.falhas += 1
            self.proxima = agora + min(900, 30 * 2 ** min(self.falhas, 5))
            self.h.controle('historico_sync', {'estado': 'pendente', 'tentativas': self.falhas})


_thread = None


def iniciar(h):
    global _thread
    from canais_newprod import OFICIAL
    if not OFICIAL or (_thread and _thread.is_alive()):
        return

    def enviar(lote):
        import urllib.request
        from coleta_autonoma import segredo_do_agente
        from pacotes_download import SemRedirecionamento
        host = 'vwbtitjlpelrcnsytzqw.supabase.co'
        corpo = {**lote, 'estacao': os.environ.get('NEWPROD_PILOTO_ESTACAO', '')}
        req = urllib.request.Request('https://' + host + '/functions/v1/historico-impressao/enviar',
            data=json.dumps(corpo).encode(), headers={'Content-Type': 'application/json', 'X-Agente-Segredo': segredo_do_agente()})
        with urllib.request.build_opener(SemRedirecionamento()).open(req, timeout=5) as r:
            return json.loads(r.read(8192))

    def rodar():
        sync = Sincronizador(h, enviar)
        while True:
            try:
                sync.ciclo()
            except Exception:
                # Falha de disco/telemetria nao termina o monitor nem o motor.
                pass
            time.sleep(30)
    _thread = threading.Thread(target=rodar, name='HistoricoCentral', daemon=True)
    _thread.start()
