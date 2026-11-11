"""Trabalho local independente do HTTP. Nunca retoma envios apos reinicio."""
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager


class Cancelado(Exception):
    pass


class Trabalhos:
    def __init__(self, caminho):
        self.caminho = Path(caminho)
        self.caminho.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.threads = {}
        with self.conexao() as db:
            db.execute('CREATE TABLE IF NOT EXISTS trabalhos (id TEXT PRIMARY KEY, assinatura TEXT NOT NULL, dados TEXT NOT NULL)')
            for ident, texto in db.execute('SELECT id,dados FROM trabalhos').fetchall():
                dados = json.loads(texto)
                if dados['estado'] in ('aceito', 'gerando', 'enviando', 'cancelando'):
                    dados.update(estado='conferencia', motivo='reinicio', atualizado=time.time())
                    self.gravar(db, dados)

    @contextmanager
    def conexao(self):
        db = sqlite3.connect(self.caminho, timeout=10)
        try:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def gravar(db, dados):
        db.execute('UPDATE trabalhos SET dados=? WHERE id=?', (json.dumps(dados), dados['id']))

    @staticmethod
    def registrar(dados):
        print(f'[print][autonomo] job={dados["id"]} estado={dados["estado"]} '
              f'gerados={dados["gerados"]} enviados={dados["enviados"]}', flush=True)

    def obter(self, ident):
        with self.lock, self.conexao() as db:
            row = db.execute('SELECT dados FROM trabalhos WHERE id=?', (ident,)).fetchone()
            return json.loads(row[0]) if row else None

    def listar(self):
        with self.lock, self.conexao() as db:
            rows = [json.loads(r[0]) for r in db.execute('SELECT dados FROM trabalhos')]
            return sorted(rows, key=lambda r: r['atualizado'], reverse=True)[:30]

    def atualizar(self, ident, **campos):
        with self.lock, self.conexao() as db:
            row = db.execute('SELECT dados FROM trabalhos WHERE id=?', (ident,)).fetchone()
            if not row:
                raise ValueError('Trabalho nao encontrado.')
            dados = json.loads(row[0])
            dados.update(campos, atualizado=time.time())
            self.gravar(db, dados)
            self.registrar(dados)
            return dados

    def cancelar(self, ident):
        with self.lock:
            dados = self.obter(ident)
            if dados is None:
                raise ValueError('Trabalho nao encontrado; consulte antes de tentar novamente.')
            if dados['estado'] in ('aceito', 'gerando', 'enviando', 'cancelando'):
                return self.atualizar(ident, cancelar=True)
            return dados

    def conferir(self, ident):
        with self.lock:
            dados = self.obter(ident)
            if not dados or dados['estado'] != 'conferencia':
                raise ValueError('Este trabalho nao esta aguardando conferencia.')
            return self.atualizar(ident, estado='encerrado', motivo='conferido_pelo_operador')

    def iniciar(self, ident, assinatura, produzir, enviar, finalizar, reservar):
        ident = str(uuid.UUID(ident))
        with self.lock, self.conexao() as db:
            anterior = db.execute('SELECT assinatura,dados FROM trabalhos WHERE id=?', (ident,)).fetchone()
            if anterior:
                if anterior[0] != assinatura:
                    raise ValueError('Identificador ja usado para outro trabalho.')
                return json.loads(anterior[1]), False
            for texto, in db.execute('SELECT dados FROM trabalhos'):
                if json.loads(texto)['estado'] in ('aceito','gerando','enviando','cancelando','conferencia'):
                    raise ValueError('Acompanhe ou confira o trabalho anterior antes de iniciar outro.')
            reserva = reservar()
            if reserva is None:
                raise ValueError('Agente ocupado com outro trabalho ou atualizacao. Aguarde.')
            dados = dict(id=ident, estado='aceito', cancelar=False, gerados=0, enviados=0,
                         paginas_enviadas=0, lotes=[], motivo=None, atualizado=time.time())
            try:
                db.execute('INSERT INTO trabalhos VALUES (?,?,?)', (ident, assinatura, json.dumps(dados)))
                db.commit()  # Aceite duravel ANTES de iniciar qualquer envio.
                thread = threading.Thread(target=self.executar, args=(ident, produzir, enviar, finalizar, reserva),
                                          daemon=True, name='ImpressaoAutonoma')
                self.threads[ident] = thread
                thread.start()
            except BaseException:
                reserva.liberar()
                raise
            return dados, True

    def executar(self, ident, produzir, enviar, finalizar, reserva):
        try:
            def lote(arquivo):
                dados = self.obter(ident)
                if dados['cancelar']:
                    raise Cancelado()
                numero = dados['gerados'] + 1
                # O identificador do envio nao muda em erros, timeout ou reinicio.
                envio = str(uuid.uuid5(uuid.UUID(ident), str(numero)))
                registro = dict(numero=numero, tipo=arquivo['type'], estado='enviando', envio=envio)
                lotes = dados['lotes'] + [registro]
                self.atualizar(ident, estado='enviando', gerados=numero, lotes=lotes)
                paginas = enviar(arquivo, envio, numero)
                registro.update(estado='enviado', paginas=paginas)
                self.atualizar(ident, estado='gerando', enviados=numero, lotes=lotes,
                               paginas_enviadas=dados['paginas_enviadas'] + paginas)
                if self.obter(ident)['cancelar']:
                    raise Cancelado()
            self.atualizar(ident, estado='gerando')
            if self.obter(ident)['cancelar']:
                raise Cancelado()
            produzir(lote)
            if not self.obter(ident)['gerados']:
                raise ValueError('Nenhum arquivo gerado.')
            self.atualizar(ident, estado='cancelado' if self.obter(ident)['cancelar'] else 'enviado')
        except Cancelado:
            self.atualizar(ident, estado='cancelado', motivo='solicitado_pelo_operador')
        except Exception as erro:
            # Nao persistir mensagens de driver, caminhos ou dados da arte.
            self.atualizar(ident, estado='conferencia', motivo='falha_' + type(erro).__name__)
        finally:
            try:
                finalizar()
            finally:
                reserva.liberar()


_instancia = None
_lock = threading.Lock()
_arquivo_lock = None


def trabalhos():
    global _instancia, _arquivo_lock
    with _lock:
        if _instancia is None:
            from canais_newprod import pasta_local
            import os
            pasta = pasta_local()
            pasta.mkdir(parents=True, exist_ok=True)
            arquivo = (pasta / 'impressao-autonoma.lock').open('a+b')
            try:
                arquivo.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    # Trava de processo: outro agente nao pode recuperar um trabalho vivo.
                    msvcrt.locking(arquivo.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(arquivo, fcntl.LOCK_EX | fcntl.LOCK_NB)
                _instancia = Trabalhos(pasta / 'impressao-autonoma.sqlite3')
                _arquivo_lock = arquivo
            except BaseException:
                arquivo.close()
                raise
        return _instancia


def assinatura(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
