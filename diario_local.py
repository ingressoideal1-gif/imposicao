"""Diário durável por tentativa/bloco. Não envia arquivos ou imprime."""
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timezone
import uuid

from pacotes_locais import _sem_links


class DiarioLocal:
    TRANSICOES = {
        None: {'preparado'},
        'preparado': {'envio_iniciado', 'cancelado'},
        'envio_iniciado': {'enviado', 'incerto'},
        'enviado': {'conferido', 'incerto'},
        'incerto': {'conferido', 'cancelado'},
        'conferido': set(), 'cancelado': set(),
    }

    def __init__(self, raiz, estacao):
        if not isinstance(estacao, str) or not estacao.strip():
            raise ValueError('Estação obrigatória.')
        self.raiz = Path(raiz).absolute()
        self.estacao = estacao

    def _conectar(self):
        _sem_links(self.raiz / 'diario.sqlite3')
        self.raiz.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.raiz / 'diario.sqlite3', timeout=15)
        con.execute('PRAGMA synchronous=FULL')
        con.execute('CREATE TABLE IF NOT EXISTS eventos ('
                    'seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, '
                    'empresa TEXT NOT NULL, trabalho TEXT NOT NULL, revisao TEXT NOT NULL, '
                    'bloco INTEGER NOT NULL, tentativa TEXT NOT NULL, estacao TEXT NOT NULL, '
                    'estado TEXT NOT NULL, quando TEXT NOT NULL, sincronizado INTEGER NOT NULL DEFAULT 0)')
        try:
            con.execute('CREATE TABLE IF NOT EXISTS identidade (id INTEGER PRIMARY KEY CHECK(id=1), estacao TEXT NOT NULL)')
            con.execute('BEGIN IMMEDIATE')
            antiga = con.execute('SELECT estacao FROM identidade WHERE id=1').fetchone()
            divergente = con.execute('SELECT 1 FROM eventos WHERE estacao<>? LIMIT 1', (self.estacao,)).fetchone()
            if divergente or (antiga and antiga[0] != self.estacao):
                raise ValueError('Diário pertence a outra estação.')
            con.execute('INSERT OR IGNORE INTO identidade VALUES (1,?)', (self.estacao,))
            con.commit()
            return con
        except BaseException:
            con.close()
            raise

    def registrar(self, empresa, trabalho, revisao, bloco, tentativa, estado):
        if any(not isinstance(v, str) or not v.strip() for v in (empresa, trabalho, revisao, tentativa)):
            raise ValueError('Identificação incompleta.')
        if type(bloco) is not int or bloco < 0 or estado not in self.TRANSICOES:
            raise ValueError('Bloco ou estado inválido.')
        con = self._conectar()
        try:
            con.execute('BEGIN IMMEDIATE')
            anterior = con.execute('SELECT estado, revisao FROM eventos WHERE empresa=? AND trabalho=? '
                                   'AND bloco=? AND tentativa=? ORDER BY seq DESC LIMIT 1',
                                   (empresa, trabalho, bloco, tentativa)).fetchone()
            atual = anterior[0] if anterior else None
            if anterior and anterior[1] != revisao:
                raise ValueError('Tentativa não pode mudar de revisão.')
            if estado not in self.TRANSICOES[atual]:
                raise ValueError('Transição de execução inválida.')
            identificador = str(uuid.uuid4())
            con.execute('INSERT INTO eventos (id,empresa,trabalho,revisao,bloco,tentativa,estacao,estado,quando) '
                        'VALUES (?,?,?,?,?,?,?,?,?)', (identificador, empresa, trabalho, revisao, bloco,
                         tentativa, self.estacao, estado, datetime.now(timezone.utc).isoformat()))
            con.commit()
            return identificador
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def pendentes(self, limite=100):
        if type(limite) is not int or not 1 <= limite <= 1000:
            raise ValueError('Lote inválido.')
        con = self._conectar()
        try:
            con.row_factory = sqlite3.Row
            return [dict(linha) for linha in con.execute(
                'SELECT * FROM eventos WHERE sincronizado=0 ORDER BY seq LIMIT ?', (limite,))]
        finally:
            con.close()

    def sincronizar(self, enviar, limite=100):
        """O receptor precisa persistir idempotentemente antes de devolver IDs."""
        lote = self.pendentes(limite)
        if not lote:
            return 0
        recibo = enviar(json.loads(json.dumps(lote)))
        ids = [evento['id'] for evento in lote]
        if (not isinstance(recibo, list) or not all(isinstance(i, str) for i in recibo)
                or len(recibo) != len(set(recibo)) or not set(recibo) <= set(ids)):
            raise ValueError('Recibo remoto inválido.')
        con = self._conectar()
        try:
            con.executemany('UPDATE eventos SET sincronizado=1 WHERE id=?', ((i,) for i in recibo))
            con.commit()
        finally:
            con.close()
        return len(recibo)

    def recuperar_envios_incertos(self):
        """Executar na inicialização, antes de admitir novos trabalhos."""
        con = self._conectar()
        try:
            con.execute('BEGIN IMMEDIATE')
            linhas = con.execute('SELECT empresa,trabalho,revisao,bloco,tentativa,estado FROM eventos '
                                 'WHERE seq IN (SELECT MAX(seq) FROM eventos '
                                 'GROUP BY empresa,trabalho,bloco,tentativa)').fetchall()
            for empresa, trabalho, revisao, bloco, tentativa, estado in linhas:
                if estado == 'envio_iniciado':
                    con.execute('INSERT INTO eventos (id,empresa,trabalho,revisao,bloco,tentativa,estacao,estado,quando) '
                                'VALUES (?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()), empresa, trabalho, revisao,
                                 bloco, tentativa, self.estacao, 'incerto', datetime.now(timezone.utc).isoformat()))
            con.commit()
        finally:
            con.close()
