"""Descarte de cópias regeneráveis, após confirmação online de pedido Impresso."""
from datetime import datetime, timezone
from functools import wraps
import json
import re
import time

def serializar_cache(funcao):
    @wraps(funcao)
    def executar(self, *args, **kwargs):
        with self._cache_lock:
            return funcao(self, *args, **kwargs)
    return executar


def usar_cache(funcao):
    """Download/hash pode esperar produção; nunca segura a trava nessa espera."""
    @wraps(funcao)
    def executar(self, *args, **kwargs):
        with self._cache_lock:
            self._cache_em_uso += 1
        try:
            return funcao(self, *args, **kwargs)
        finally:
            with self._cache_lock:
                self._cache_em_uso -= 1
    return executar


def validar_recibo(dados, empresa, pedidos):
    if not isinstance(dados, dict) or dados.get('empresa') != empresa:
        raise ValueError('Empresa do cache divergente.')
    quando = datetime.fromisoformat(dados['conferido_em'])
    if quando.tzinfo is None or abs((datetime.now(timezone.utc) - quando).total_seconds()) > 120:
        raise ValueError('Confirmação de cache vencida.')
    rows = dados.get('pedidos')
    if not isinstance(rows, list) or len(rows) != len(pedidos):
        raise ValueError('Confirmação de cache incompleta.')
    vistos = set()
    for row in rows:
        if (not isinstance(row, dict) or row.get('pedido') not in pedidos
                or row['pedido'] in vistos or type(row.get('impresso')) is not bool
                or not isinstance(row.get('modelos'), list)
                or len(row['modelos']) > 10000
                or any(not isinstance(m, str) or not re.fullmatch(r'[1-9][0-9]{0,14}', m) for m in row['modelos'])
                or len(set(row['modelos'])) != len(row['modelos'])
                or row['impresso'] and not row['modelos']):
            raise ValueError('Confirmação de cache divergente.')
        vistos.add(row['pedido'])
    return rows


def _tabela(con, nome):
    return bool(con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (nome,)).fetchone())


def _hashes(manifesto):
    hashes = set()
    for info in manifesto['arquivos'].values():
        if info is None:
            continue
        digest = info['sha256']
        if not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('Objeto de cache inválido.')
        hashes.add(digest)
    return hashes


def descartar(servico, rows, *, controle, spool_livre):
    """Falha fechada. O lock comum cobre admissões, leitura e remoção de objetos."""
    from pacotes_locais import _sem_links
    offline = getattr(servico, 'offline', None)
    # Não reservar produção enquanto aguarda um download cujo checkpoint pode
    # esperar a própria produção ficar ociosa (inversão de espera).
    if not offline or not servico._cache_lock.acquire(blocking=False):
        return {'adiado': True}
    if not controle.iniciar_atualizacao():
        servico._cache_lock.release()
        return {'adiado': True}
    selecao = offline.selecao
    if not selecao._lock.acquire(blocking=False):
        controle.cancelar_atualizacao()
        servico._cache_lock.release()
        return {'adiado': True}
    if not offline._confirmacoes_lock.acquire(blocking=False):
        selecao._lock.release()
        controle.cancelar_atualizacao()
        servico._cache_lock.release()
        return {'adiado': True}
    try:
        with servico._cache_lock, servico.preparador._cv:
            prep = servico.preparador
            if (prep._pausado or servico._stop.is_set() or prep._ativo or prep._tarefas or servico._revisoes_em_uso
                    or servico.local._cache_em_uso or not spool_livre()):
                return {'adiado': True}
            from retencao_fontes import manter
            manter(servico)
            if not any(row['impresso'] for row in rows):
                consulta = servico._db()
                try:
                    pendentes = _tabela(consulta, 'cache_objetos_pendentes') and consulta.execute('SELECT 1 FROM cache_objetos_pendentes LIMIT 1').fetchone()
                finally:
                    consulta.close()
                if not pendentes:
                    return {'adiado': False, 'modelos': 0, 'bytes_removidos': 0}
            pasta = servico.local._pasta(servico.empresa)
            # Inicializa somente o índice local; sem objetos, nenhum arquivo é removido.
            servico.local._conectar(pasta).close()
            indice = pasta / 'indice.sqlite3'
            _sem_links(indice)
            con = servico._db()
            removidos = set()
            pedidos_removidos = set()
            try:
                con.execute('ATTACH DATABASE ? AS recursos', (str(indice),))
                if any(con.execute(f'PRAGMA {base}.journal_mode').fetchone()[0] != 'delete' for base in ('main', 'recursos')):
                    raise ValueError('Modo transacional incompatível; cache preservado.')
                con.execute('CREATE TABLE IF NOT EXISTS cache_objetos_pendentes (sha256 TEXT PRIMARY KEY)')
                con.commit()
                con.execute('BEGIN IMMEDIATE')
                referencias = {}
                # Uma leitura por lote; nunca carregar bancos de numeração inteiros.
                if _tabela(con, 'revisoes_pedidos_piloto'):
                    for p, itens, pacotes in con.execute("SELECT pedido,json_extract(conteudo,'$.itens'),json_extract(conteudo,'$.pacotes') FROM revisoes_pedidos_piloto"):
                        if itens is None or pacotes is None:
                            raise ValueError('Referências incompletas; cache preservado.')
                        referencias[p] = {i['modelo'] for i in json.loads(itens)} | {i['modelo'] for i in json.loads(pacotes)}
                for row in rows:
                    if not row['impresso']:
                        continue
                    pedido = row['pedido']
                    modelos = {r[0] for r in con.execute('SELECT modelo FROM modelos_pedidos WHERE pedido=?', (pedido,))}
                    modelos.update(referencias.get(pedido, set()))
                    # Modelos excluídos/movidos ou vínculos ambíguos não autorizam descarte.
                    if not modelos or not modelos <= set(row['modelos']):
                        continue
                    if any(p != pedido and modelos & ids for p, ids in referencias.items()):
                        continue
                    if any(con.execute('SELECT 1 FROM modelos_pedidos WHERE modelo=? AND pedido<>?', (m, pedido)).fetchone() for m in modelos):
                        continue
                    pendente = False
                    for tabela, filtro in (('offline_confirmacoes', "estado IN ('pendente','manual_pendente','conflito')"), ('offline_faixas', 'enviado=0')):
                        if _tabela(con, tabela) and con.execute(f"SELECT 1 FROM {tabela} WHERE {filtro} AND CAST(json_extract(dados,'$.pedido') AS TEXT)=?", (pedido,)).fetchone():
                            pendente = True
                    if pendente:
                        continue
                    # Capturas manuais podem ser a única cópia do original.
                    if any(con.execute("SELECT 1 FROM " + tabela + " WHERE modelo=? AND COALESCE(json_extract(conteudo,'$.manifesto.configuracao.tipo'),'')<>'antecipacao_online'", (m,)).fetchone()
                           for m in modelos for tabela in ('catalogo', 'catalogo_arquivo')):
                        continue
                    hashes = set()
                    for modelo in modelos:
                        for (texto,) in con.execute('SELECT manifesto FROM recursos.pacotes WHERE modelo=?', (modelo,)):
                            m = json.loads(texto)
                            if m['empresa'] != servico.empresa or m['modelo'] != modelo:
                                raise ValueError('Índice de cache divergente.')
                            hashes.update(_hashes(m))
                        for tabela in ('catalogo', 'catalogo_arquivo', 'coletas', 'origens', 'conferencias', 'modelos_pedidos'):
                            con.execute(f'DELETE FROM {tabela} WHERE modelo=?', (modelo,))
                        con.execute('DELETE FROM recursos.pacotes WHERE modelo=?', (modelo,))
                    for tabela in ('revisoes_pedidos_piloto', 'aberturas_piloto', 'preferencias_piloto'):
                        if _tabela(con, tabela):
                            con.execute(f'DELETE FROM {tabela} WHERE pedido=?', (pedido,))
                    con.execute('DELETE FROM controle_piloto WHERE chave=?', ('pedido_cursor_' + pedido,))
                    con.executemany('INSERT OR IGNORE INTO cache_objetos_pendentes VALUES (?)', ((h,) for h in hashes))
                    removidos.update(modelos)
                    pedidos_removidos.add(pedido)
                if not removidos and not con.execute('SELECT 1 FROM cache_objetos_pendentes LIMIT 1').fetchone():
                    con.commit()
                    return {'adiado': False, 'modelos': 0, 'bytes_removidos': 0}
                # Um objeto pode pertencer a vários pedidos/revisões. Não somar nem apagar duas vezes.
                usados = set()
                for (texto,) in con.execute('SELECT manifesto FROM recursos.pacotes'):
                    usados.update(_hashes(json.loads(texto)))
                for (texto,) in con.execute('SELECT manifesto FROM coletas'):
                    usados.update(_hashes(json.loads(texto)))
                for tabela in ('catalogo', 'catalogo_arquivo'):
                    for (texto,) in con.execute("SELECT json_extract(conteudo,'$.manifesto') FROM " + tabela):
                        usados.update(_hashes(json.loads(texto)))
                candidatos = []
                for (digest,) in con.execute('SELECT sha256 FROM cache_objetos_pendentes'):
                    if not re.fullmatch('[a-f0-9]{64}', digest):
                        raise ValueError('Objeto pendente inválido.')
                    arquivo = pasta / 'objetos' / digest
                    _sem_links(arquivo)
                    if not arquivo.resolve().is_relative_to(pasta.resolve() / 'objetos'):
                        raise ValueError('Objeto fora do cache.')
                    candidatos.append((digest, arquivo))
                con.commit()
                # Só depois de retirar referências atomicamente. Falha/reinício conserva
                # o diário; o próximo ciclo tenta os mesmos objetos, sem varrer TEMP.
                bytes_removidos = 0
                for digest, arquivo in candidatos:
                    try:
                        if digest not in usados and arquivo.exists():
                            tamanho = arquivo.stat().st_size
                            arquivo.unlink()
                            bytes_removidos += tamanho
                        con.execute('DELETE FROM cache_objetos_pendentes WHERE sha256=?', (digest,))
                        con.commit()
                    except OSError:
                        continue
                for chave in list(prep._estados):
                    if chave[1] in removidos:
                        del prep._estados[chave]
                prep._preferenciais.difference_update(removidos)
                for pedido in pedidos_removidos:
                    offline.tentativas.pop(pedido, None)
                    offline.falhas.pop(pedido, None)
                armazenamento = prep.armazenamento
                for nome in ('_revalidar', '_atualizar_ao_abrir'):
                    cache = getattr(armazenamento, nome, None)
                    if cache is not None:
                        for chave in list(cache):
                            if chave[1] in removidos:
                                if isinstance(cache, dict): del cache[chave]
                                else: cache.discard(chave)
                return {'adiado': False, 'modelos': len(removidos), 'bytes_removidos': bytes_removidos}
            except BaseException:
                con.rollback()
                raise
            finally:
                con.close()
    finally:
        offline._confirmacoes_lock.release()
        selecao._lock.release()
        controle.cancelar_atualizacao()
        servico._cache_lock.release()


class RetencaoCache:
    def __init__(self, servico, *, controle, spool_livre, relogio=time.monotonic):
        self.servico, self.controle, self.spool_livre = servico, controle, spool_livre
        self.relogio = relogio
        self.proxima = 0
        self.estado = {}

    def ciclo(self, cliente):
        if self.relogio() < self.proxima:
            return
        self.proxima = self.relogio() + 60
        con = self.servico._db()
        try:
            pedidos = {p for (p,) in con.execute('SELECT DISTINCT pedido FROM modelos_pedidos')}
            if _tabela(con, 'revisoes_pedidos_piloto'):
                pedidos.update(p for (p,) in con.execute('SELECT pedido FROM revisoes_pedidos_piloto'))
            if any(not re.fullmatch(r'[1-9][0-9]{0,9}', p) or int(p) > 2147483647 for p in pedidos):
                raise ValueError('Pedido local inválido.')
            row = con.execute("SELECT valor FROM controle_piloto WHERE chave='cursor_retencao'").fetchone()
            cursor = row[0] if row else ''
            ordenados = sorted(pedidos)
            lote = ([p for p in ordenados if p > cursor] + [p for p in ordenados if p <= cursor])[:32]
        finally:
            con.close()
        rows = validar_recibo(cliente.chamar('estado-cache', {'empresa': self.servico.empresa, 'pedidos': lote}), self.servico.empresa, lote) if lote else []
        self.estado = descartar(self.servico, rows, controle=self.controle, spool_livre=self.spool_livre)
        self.estado['quando'] = datetime.now(timezone.utc).isoformat()
        if lote and not self.estado['adiado']:
            con = self.servico._db()
            try:
                con.execute('INSERT OR REPLACE INTO controle_piloto VALUES (?,?)', ('cursor_retencao', lote[-1]))
                con.commit()
            finally:
                con.close()
