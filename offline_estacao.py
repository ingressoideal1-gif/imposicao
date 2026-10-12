"""Preparacao e confirmacoes persistentes da estacao; nenhum envio a impressora."""
from datetime import datetime, timezone
import json
import time
import uuid
import hashlib
from contextlib import contextmanager

from conferencia_piloto import ConferenciaIndisponivel


class OfflineEstacao:
    def __init__(self, servico, selecao):
        self.servico, self.selecao = servico, selecao
        with self.banco() as con:
            con.execute('CREATE TABLE IF NOT EXISTS offline_lista (id INTEGER PRIMARY KEY CHECK(id=1), dados TEXT NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS offline_catalogos (id INTEGER PRIMARY KEY CHECK(id=1), dados TEXT NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS offline_confirmacoes ('
                        'id TEXT PRIMARY KEY, dados TEXT NOT NULL, estado TEXT NOT NULL, criado REAL NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS offline_faixas ('
                        'id TEXT PRIMARY KEY, dados TEXT NOT NULL, enviado INTEGER NOT NULL DEFAULT 0)')
            con.execute('CREATE TABLE IF NOT EXISTS offline_dependencias (url TEXT PRIMARY KEY, sha256 TEXT NOT NULL, dados BLOB NOT NULL)')
        self.proxima = 0
        self.proxima_lista = 0
        self.tentativas = {}
        self.falhas = {}

    @contextmanager
    def banco(self):
        con = self.servico._db()
        try:
            with con:
                yield con
        finally:
            con.close()

    def catalogos(self):
        with self.banco() as con:
            row = con.execute('SELECT dados FROM offline_catalogos WHERE id=1').fetchone()
        return json.loads(row[0]) if row else None

    def lista(self):
        with self.banco() as con:
            row = con.execute('SELECT dados FROM offline_lista WHERE id=1').fetchone()
        return json.loads(row[0]) if row else None

    def sincronizar_lista(self, cliente):
        if time.monotonic() < self.proxima_lista:
            return
        self.proxima_lista = time.monotonic() + 60
        anterior = self.lista()
        dados = cliente.chamar('lista-offline', {'empresa':self.servico.empresa,
                              'revisao':anterior['revisao'] if anterior else ''})
        import re
        if dados.get('empresa') != self.servico.empresa or not re.fullmatch('[a-f0-9]{64}', str(dados.get('revisao', ''))):
            raise ValueError('Lista da estacao incompleta.')
        if dados.get('sem_mudanca') is True:
            if not anterior or dados['revisao'] != anterior['revisao']:
                raise ValueError('Revisao da lista divergente.')
            return
        lista = dados.get('lista')
        if dados.get('sem_mudanca') is not False or not isinstance(lista, dict) or any(
                not isinstance(lista.get(k), list) for k in ('pedidos','origens','modelos','prazos','produtos','artes')):
            raise ValueError('Lista da estacao incompleta.')
        dados['coletado_em'] = datetime.now(timezone.utc).isoformat()
        with self.banco() as con:
            con.execute('INSERT OR REPLACE INTO offline_lista VALUES (1,?)', (json.dumps(dados),))

    def ciclo(self, checkpoint=lambda: None):
        cliente = self.servico.coleta_autonoma.cliente
        if time.monotonic() < self.proxima:
            return
        self.proxima = time.monotonic() + 30
        for nome, tarefa in (('lista', lambda: self.sincronizar_lista(cliente)),
                             ('confirmacoes', lambda: self.sincronizar_confirmacoes(cliente, checkpoint)),
                             ('faixas', lambda: self.sincronizar_faixas(checkpoint))):
            checkpoint()
            try:
                tarefa()
                self.falhas.pop(nome, None)
            except (ValueError, OSError):
                self.falhas[nome] = 'Sincronizacao pendente; os registros continuam guardados.'
        checkpoint()
        dados = self.catalogos()
        if not dados or (datetime.now(timezone.utc)-datetime.fromisoformat(dados['coletado_em'])).total_seconds() > 1800:
            dados = cliente.chamar('catalogos-offline', {'empresa':self.servico.empresa})
            tabelas = ('formatos','saidas','cores','modelos_imposicao')
            if (dados.get('empresa') != self.servico.empresa
                    or any(not isinstance(dados.get(t), list) for t in tabelas)):
                raise ValueError('Catalogo da estacao incompleto.')
            dados['coletado_em'] = datetime.now(timezone.utc).isoformat()
            with self.banco() as con:
                con.execute('INSERT OR REPLACE INTO offline_catalogos VALUES (1,?)', (json.dumps(dados),))
        # Pedidos ainda nao preparados primeiro; no maximo tres por ciclo.
        pedidos = self.servico.pedidos_locais()
        pedidos.sort(key=lambda p: (self.selecao._cache.obter(p) or {}).get('conferido_em', ''))
        pedidos = [p for p in pedidos if time.monotonic() >= self.tentativas.get(p, 0)]
        for pedido in pedidos[:3]:
            checkpoint()
            self.tentativas[pedido] = time.monotonic() + 300
            try:
                self.selecao.abrir_pedido({'pedido':pedido})
                self.falhas.pop(pedido, None)
            except (ValueError, OSError):
                # Um pedido incompleto nao impede preparar os demais.
                self.falhas[pedido] = 'Preparacao incompleta; nova tentativa automatica.'
                continue

    def guardar_faixa(self, job, pedido, numeracoes, contratos):
        dados = {'pedido':str(pedido), 'numeracoes':numeracoes, 'contratos':contratos}
        with self.banco() as con:
            con.execute('INSERT OR IGNORE INTO offline_faixas (id,dados) VALUES (?,?)',
                        (str(uuid.UUID(job))+':'+str(pedido),json.dumps(dados)))

    def sincronizar_faixas(self, checkpoint):
        with self.banco() as con:
            rows = con.execute('SELECT id,dados FROM offline_faixas WHERE enviado=0 ORDER BY rowid LIMIT 10').fetchall()
        for id_, texto in rows:
            checkpoint()
            import acesso_publicacao
            import qr_ideal
            import qr_base_v2
            dados = json.loads(texto)
            # JSON transforma as chaves em texto; o publicador consulta IDs inteiros.
            numeracoes = {int(k):v for k,v in dados['numeracoes'].items()}
            legado = None
            try:
                pool = None
                if acesso_publicacao._precisa_do_pool(numeracoes):
                    legado = qr_ideal.PoolQR()
                    legado.verificar_integridade()
                    contratos = dados['contratos']
                    base_v2 = qr_base_v2.obter(legado) if any(c['versao']==2 for c in contratos) else None
                    pool = qr_ideal.PoolComContratos(legado,contratos,base_v2) if contratos else legado
                resposta = acesso_publicacao.publicar(int(dados['pedido']),pool,numeracoes)
                if resposta.get('completo') or (resposta.get('enviadas') == 0 and not resposta.get('erro')):
                    with self.banco() as con:
                        con.execute('UPDATE offline_faixas SET enviado=1 WHERE id=?',(id_,))
            finally:
                if legado is not None:
                    legado.fechar()

    def preparados(self):
        with self.banco() as con:
            registros = [json.loads(r[0]) for r in con.execute('SELECT conteudo FROM revisoes_pedidos_piloto')]
        # A abertura verifica todos os bytes; a lista nao varre arquivos grandes.
        return [r for r in registros if r.get('empresa') == self.servico.empresa
                and r.get('offline_schema') == 1
                and r.get('protocolo') == 2 and not r.get('offline_bloqueado')]

    def preparar_dependencias(self, pedido, snapshot):
        elementos = [e for n in snapshot['numeracoes'] for e in (n.get('elements') or []) if isinstance(e, dict)]
        if any(e.get('type') == 'QR_IDEAL' for e in elementos):
            import qr_contratos
            import qr_ideal
            import qr_base_v2
            contratos = qr_contratos.obter(pedido)
            pool = qr_ideal.PoolQR()
            try:
                pool.verificar_integridade()
                if any(c['versao']==2 for c in contratos):
                    qr_base_v2.obter(pool)
            finally:
                pool.fechar()
        familias = {str(e.get('font_name') or e.get('font_family') or '') for e in elementos}
        familias.discard('')
        if familias:
            import db
            import font_cache
            catalogo = db.get_catalogo_fontes()
            for nome in familias:
                familia = nome.split('|')[0].removeprefix('system:').lower().replace(' ', '')
                # Regular, negrito e italico da mesma familia, conforme a selecao do motor.
                fontes = [f for f in catalogo if any(str(f.get(k, '')).lower().replace(' ', '').startswith(familia)
                          for k in ('font_family', 'nome'))]
                for fonte in fontes:
                    if fonte.get('arquivo_url'):
                        url = fonte['arquivo_url']
                        if url.startswith('/'):
                            import os
                            url = db.FONTES_BUCKET_URL + db._nome_objeto_fonte(os.path.basename(url))
                        from pacotes_download import validar_url
                        validar_url(url, self.servico.host)
                        dados = font_cache.obter_bytes(url)
                        with self.banco() as con:
                            con.execute('INSERT OR REPLACE INTO offline_dependencias VALUES (?,?,?)',
                                        (url, hashlib.sha256(dados).hexdigest(), dados))

    def ler_dependencia(self, url):
        with self.banco() as con:
            row = con.execute('SELECT sha256,dados FROM offline_dependencias WHERE url=?', (url,)).fetchone()
        if row is None:
            return None
        dados = bytes(row[1])
        if hashlib.sha256(dados).hexdigest() != row[0]:
            raise ValueError('Dependencia local alterada; conecte para preparar novamente.')
        return dados

    def bootstrap(self):
        pedidos = []
        for registro in self.preparados():
            snapshot = {k:registro['snapshot'].get(k, []) for k in
                        ('modelos','origens','produtos','pedidos','prazos','artes')}
            snapshot['numeracoes'] = [{k:v for k,v in n.items() if k != 'csv_data'}
                                     for n in registro['snapshot']['numeracoes']]
            pedidos.append({'pedido':registro['pedido'], 'revisao':registro['revisao'], 'snapshot':snapshot})
        return {'catalogos':self.catalogos(), 'lista':self.lista(), 'pedidos':pedidos, 'preparacao':{
                    'prontos':len(pedidos), 'catalogados':len(self.servico.pedidos_locais()), 'pendencias':dict(self.falhas)},
                'confirmacoes':self.confirmacoes()}

    def conferir(self, referencias):
        if not isinstance(referencias, list) or not 1 <= len(referencias) <= 128:
            raise ValueError('Referencias invalidas.')
        pedidos = []
        for ref in referencias:
            registro = self.selecao._cache.obter(str(ref.get('pedido', '')))
            if not registro or ref.get('revisao') != registro.get('revisao'):
                raise ConferenciaIndisponivel('A revisao local mudou. Reabra o pedido.')
            atual = self.selecao._abrir_copia_offline(registro['pedido'], registro)
            pedidos.append(atual)
        catalogos = self.catalogos()
        if catalogos is None:
            raise ConferenciaIndisponivel('Catalogos ainda nao preparados nesta estacao.')
        return {'pedidos':pedidos, 'catalogos':catalogos}

    def confirmar(self, dados, operador):
        if (not isinstance(dados, dict) or set(dados) != {'id','pedido','revisao','modelos'}
                or str(uuid.UUID(dados['id'])) != dados['id']
                or not isinstance(dados['modelos'], list) or not dados['modelos']
                or len(dados['modelos']) > 128 or len(set(dados['modelos'])) != len(dados['modelos'])):
            raise ValueError('Confirmacao invalida.')
        registro = self.selecao._cache.obter(dados['pedido'])
        if not registro or registro['revisao'] != dados['revisao']:
            raise ConferenciaIndisponivel('Reabra o pedido antes de confirmar.')
        permitidos = {i['modelo'] for i in registro['itens']}
        if not set(dados['modelos']) <= permitidos:
            raise ValueError('Modelo de outro pedido ou sem preparacao.')
        corpo = {**dados, 'empresa':self.servico.empresa, 'operador':str(operador)}
        with self.banco() as con:
            antigo = con.execute('SELECT dados FROM offline_confirmacoes WHERE id=?', (dados['id'],)).fetchone()
            if antigo and json.loads(antigo[0]) != corpo:
                raise ValueError('Identificador ja usado por outra confirmacao.')
            con.execute('INSERT OR IGNORE INTO offline_confirmacoes VALUES (?,?,?,?)',
                        (dados['id'],json.dumps(corpo),'pendente',time.time()))
        return {'id':dados['id'], 'registrado_localmente':True}

    def confirmacoes(self):
        with self.banco() as con:
            return [{'id':r[0], 'dados':json.loads(r[1]), 'estado':r[2]}
                    for r in con.execute('SELECT id,dados,estado FROM offline_confirmacoes ORDER BY criado DESC LIMIT 500')]

    def sincronizar_confirmacoes(self, cliente, checkpoint):
        with self.banco() as con:
            lote = con.execute("SELECT id,dados FROM offline_confirmacoes WHERE estado='pendente' ORDER BY criado LIMIT 10").fetchall()
        for id_, texto in lote:
            checkpoint()
            resposta = cliente.chamar('confirmar-offline', json.loads(texto))
            if resposta.get('id') != id_ or resposta.get('estado') not in ('sincronizado','conflito'):
                raise ValueError('Confirmacao remota incompleta.')
            with self.banco() as con:
                con.execute('UPDATE offline_confirmacoes SET estado=? WHERE id=?', (resposta['estado'],id_))
