"""API opt-in do piloto. Sem app/db de produção no import."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import tempfile
import hashlib
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from pacotes_locais import ArmazemPacotes, _manifesto, _sem_links
from pacotes_download import ArmazemComDownload, validar_url
from preparacao_local import PreparadorLocal
from coleta_recursos_local import ColetorRecursos
from captura_coleta import PreparacaoComColeta
from antecipacao_local import AntecipadorRecursos
from conferencia_piloto import ConferidorPiloto, ConferenciaIndisponivel
from coleta_autonoma import ClienteAutonomo, ColetaAutonoma


def _conferencia_recente(quando):
    try:
        instante = datetime.fromisoformat(quando)
        return instante.tzinfo is not None and -120 <= (datetime.now(timezone.utc) - instante).total_seconds() <= 300
    except (TypeError, ValueError):
        return False


class ServicoPacotes:
    def __init__(self, raiz, *, host, empresa, setor='laser', ocupado=lambda: False, abrir=None, conferir=None,
                 limite_catalogo=4096):
        if type(limite_catalogo) is not int or not 1 <= limite_catalogo <= 4096:
            raise ValueError('Limite de catalogo invalido.')
        self.limite_catalogo = limite_catalogo
        self.raiz = Path(raiz).absolute()
        self.empresa = empresa
        self.host = host
        self.conferir = conferir
        self.coleta_autonoma = None
        self.intervalo_catalogo = 30
        self.local = ArmazemPacotes(self.raiz / 'pacotes', habilitado=True)
        download = ArmazemComDownload(self.local, host=host, abrir=abrir)
        coleta = ColetorRecursos(self.local, host=host, abrir=abrir)
        integrado = PreparacaoComColeta(download, coleta, self.obter_coleta, self.salvar_coleta)
        integrado = AntecipadorRecursos(integrado, self.local, host,
                                       self.obter_coleta, self.salvar_coleta, abrir)
        integrado.somente_ao_abrir = True
        self.preparador = PreparadorLocal(integrado,
                                         setor_prioritario=setor, ocupado=ocupado)
        self.preparador.expirar_estado = False
        self._stop = threading.Event()
        self._acordar = threading.Event()
        self._thread = None
        self.erro_catalogo = False

    def antecipar(self, item, authorization=None, *, _conferidor=None):
        """Snapshot limitado do catálogo online. Não recebe credenciais ou aprova impressão."""
        if not isinstance(item, dict) or item.get('empresa') != self.empresa:
            raise ValueError('Empresa incompatível.')
        modelo = item.get('modelo')
        if not isinstance(modelo, str) or not modelo.isascii() or not modelo.isdecimal():
            raise ValueError('Modelo inválido.')
        fontes = item.get('fontes')
        if not isinstance(fontes, dict) or not 1 <= len(fontes) <= 256:
            raise ValueError('Fontes ausentes ou excessivas.')
        for nome, url in fontes.items():
            if not re.fullmatch(r'frente|verso|recurso_\d+', nome):
                raise ValueError('Nome de recurso inválido.')
            validar_url(url, self.host)
        # Somente metadados operacionais explicitamente permitidos.
        observacao = item.get('observacao')
        if not isinstance(observacao, dict) or set(observacao) != {'digest', 'aprovacao'}:
            raise ValueError('Observação inválida.')
        if not re.fullmatch(r'[a-f0-9]{64}', str(observacao['digest'])):
            raise ValueError('Digest inválido.')
        if observacao['aprovacao'] not in {'APROVADO', 'APROVADA', 'APROVADA_CLIENTE',
                                         'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'}:
            raise ValueError('Modelo não aprovado na consulta.')
        conferidor = _conferidor or self.conferir
        conferido_em = conferidor(item, authorization) if conferidor else None
        cfg = {'tipo': 'antecipacao_online', 'fontes': fontes, 'observacao': observacao,
               'preparacao_completa': False, 'aprovacao_versionada': False}
        revisao = hashlib.sha256(json.dumps(cfg, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        m = dict(schema=1, empresa=self.empresa, modelo=modelo, revisao=revisao,
                 configuracao=cfg, arquivos={'frente': None, 'verso': None})
        pedido = item.get('pedido')
        if pedido is not None:
            if not isinstance(pedido, str) or not re.fullmatch(r'[1-9][0-9]{0,14}', pedido):
                raise ValueError('Pedido inválido.')
            con = self._db()
            try:
                con.execute('INSERT OR REPLACE INTO modelos_pedidos VALUES (?,?)', (modelo, pedido))
                con.commit()
            finally:
                con.close()
            self.atualizar_preferencias()
        self.cadastrar(dict(manifesto=m, fontes={}, setor=item.get('setor', ''), prazo=item.get('prazo')), _antecipacao=True)
        if conferido_em:
            con = self._db()
            try:
                con.execute('INSERT OR REPLACE INTO conferencias VALUES (?,?,?)', (modelo, revisao, conferido_em))
                con.commit()
            finally:
                con.close()
        return {'recebido': True, 'modelo': modelo, 'revisao': revisao, 'execucao_offline': False,
                'origem_conferida_em': conferido_em}

    def _db(self):
        _sem_links(self.raiz / 'catalogo.sqlite3')
        self.raiz.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.raiz / 'catalogo.sqlite3', timeout=15)
        con.execute('PRAGMA synchronous=FULL')
        con.execute('CREATE TABLE IF NOT EXISTS catalogo ('
                    'modelo TEXT NOT NULL,revisao TEXT NOT NULL,conteudo TEXT NOT NULL,'
                    'PRIMARY KEY(modelo,revisao))')
        con.execute('CREATE TABLE IF NOT EXISTS origens ('
                    'modelo TEXT NOT NULL,revisao TEXT NOT NULL,tipo TEXT NOT NULL,'
                    'PRIMARY KEY(modelo,revisao))')
        con.execute('CREATE TABLE IF NOT EXISTS coletas ('
                    'modelo TEXT NOT NULL,entrada TEXT NOT NULL,manifesto TEXT NOT NULL,'
                    'PRIMARY KEY(modelo,entrada))')
        con.execute('CREATE TABLE IF NOT EXISTS controle_piloto ('
                    'chave TEXT PRIMARY KEY, valor TEXT NOT NULL)')
        con.execute('CREATE TABLE IF NOT EXISTS aberturas_piloto (pedido TEXT PRIMARY KEY, cursor INTEGER NOT NULL, versao INTEGER NOT NULL)')
        con.execute('CREATE TABLE IF NOT EXISTS preferencias_piloto (pedido TEXT PRIMARY KEY)')
        con.execute('CREATE TABLE IF NOT EXISTS modelos_pedidos (modelo TEXT PRIMARY KEY, pedido TEXT NOT NULL)')
        con.execute('CREATE TABLE IF NOT EXISTS conferencias ('
                    'modelo TEXT NOT NULL, revisao TEXT NOT NULL, quando TEXT NOT NULL, PRIMARY KEY(modelo,revisao))')
        try:
            vinculo = con.execute('SELECT valor FROM controle_piloto WHERE chave=?', ('empresa',)).fetchone()
            if not vinculo:
                con.execute('BEGIN IMMEDIATE')
                vinculo = con.execute('SELECT valor FROM controle_piloto WHERE chave=?', ('empresa',)).fetchone()
                if any(json.loads(row[0])['manifesto']['empresa'] != self.empresa
                       for row in con.execute('SELECT conteudo FROM catalogo')):
                    raise ValueError('Raiz do piloto vinculada a outra empresa.')
                if not vinculo:
                    con.execute('INSERT INTO controle_piloto VALUES (?,?)', ('empresa', self.empresa))
                con.commit()
            if vinculo and vinculo[0] != self.empresa:
                raise ValueError('Raiz do piloto vinculada a outra empresa.')
        except BaseException:
            con.close()
            raise
        return con

    def copias_presentes(self, modelo):
        # Presença persistida, sem confundir com uma nova validação de integridade.
        con = self._db()
        try:
            manifestos = [json.loads(r[0]) for r in con.execute('SELECT manifesto FROM coletas WHERE modelo=?', (modelo,))]
        finally:
            con.close()
        presentes = []
        for m in manifestos:
            try:
                if m['empresa'] != self.empresa: continue
                arquivos = [a for a in m['arquivos'].values() if a]
                if not arquivos: continue
                for info in arquivos:
                    if not re.fullmatch(r'[a-f0-9]{64}', info['sha256']): raise ValueError()
                    caminho = self.local._pasta(self.empresa) / 'objetos' / info['sha256']
                    _sem_links(caminho)
                    if not caminho.is_file() or caminho.stat().st_size != info['bytes']: raise ValueError()
                presentes.append(m)
            except (OSError, ValueError, KeyError, TypeError):
                continue
        return presentes

    def pedidos_locais(self):
        con = self._db()
        try:
            return [r[0] for r in con.execute('SELECT DISTINCT pedido FROM modelos_pedidos JOIN coletas USING(modelo)')]
        finally:
            con.close()

    def abrir_pedido(self, pedido):
        import time
        if not self.coleta_autonoma or not isinstance(pedido, str) or not re.fullmatch(r'[1-9][0-9]{0,14}', pedido):
            raise ValueError('Pedido inválido ou coleta indisponível.')
        con = self._db()
        try:
            con.execute('BEGIN IMMEDIATE')
            if con.execute('SELECT COUNT(*) FROM aberturas_piloto').fetchone()[0] >= 128 and not con.execute('SELECT 1 FROM aberturas_piloto WHERE pedido=?', (pedido,)).fetchone():
                raise ValueError('Limite de aberturas pendentes atingido.')
            con.execute('INSERT OR REPLACE INTO aberturas_piloto VALUES (?,0,?)', (pedido,time.time_ns()))
            con.commit()
        finally:
            con.close()
        self.coleta_autonoma.solicitar()
        self._acordar.set()

    def preparar_abertura(self, resposta):
        for item in self.catalogo():
            m = item['manifesto']
            if m['modelo'] == resposta['modelo'] and m['revisao'] == resposta['revisao']:
                self.preparador.armazenamento._atualizar_ao_abrir.add((self.empresa,m['modelo'],m['revisao']))
                self.preparador.agendar(m,item['fontes'],setor=item['setor'],
                    prazo=datetime.fromisoformat(item['prazo']) if item['prazo'] else None)
                break

    def preferencias(self):
        con = self._db()
        try:
            return [r[0] for r in con.execute('SELECT pedido FROM preferencias_piloto ORDER BY pedido')]
        finally:
            con.close()

    def preferir(self, pedido, marcado):
        if not isinstance(pedido, str) or not re.fullmatch(r'[1-9][0-9]{0,14}', pedido) or type(marcado) is not bool:
            raise ValueError('Pedido ou preferência inválidos.')
        con = self._db()
        try:
            if marcado:
                if con.execute('SELECT COUNT(*) FROM preferencias_piloto').fetchone()[0] >= 128 and pedido not in self.preferencias():
                    raise ValueError('Limite de 128 pedidos preferenciais atingido.')
                con.execute('INSERT OR IGNORE INTO preferencias_piloto VALUES (?)', (pedido,))
            else:
                con.execute('DELETE FROM preferencias_piloto WHERE pedido=?', (pedido,))
            con.commit()
        finally:
            con.close()
        self.atualizar_preferencias()
        if self.coleta_autonoma:
            self.coleta_autonoma.solicitar()
        self._acordar.set()

    def atualizar_preferencias(self):
        con = self._db()
        try:
            modelos = {r[0] for r in con.execute('SELECT modelo FROM modelos_pedidos JOIN preferencias_piloto USING(pedido)')}
        finally:
            con.close()
        self.preparador.preferir(modelos)

    def iniciar_copia(self):
        if not self.coleta_autonoma:
            raise ValueError('Coleta autônoma indisponível nesta estação.')
        for pedido in self.preferencias():
            self.abrir_pedido(pedido)
        self.coleta_autonoma.solicitar(manual=True)
        self.pausar(False)
        self._acordar.set()

    def pausar(self, pausado):
        con = self._db()
        try:
            con.execute('INSERT OR REPLACE INTO controle_piloto VALUES (?,?)',
                        ('pausado', '1' if pausado else '0'))
            con.commit()
            self.preparador.pausar(pausado)
            if pausado and self.coleta_autonoma:
                self.coleta_autonoma.cancelar_manual()
        finally:
            con.close()

    def obter_coleta(self, entrada):
        con = self._db()
        try:
            row = con.execute('SELECT manifesto FROM coletas WHERE modelo=? AND entrada=?',
                              (entrada['modelo'], entrada['revisao'])).fetchone()
            return json.loads(row[0]) if row else None
        finally:
            con.close()

    def salvar_coleta(self, entrada, derivado):
        con = self._db()
        try:
            con.execute('INSERT OR REPLACE INTO coletas VALUES (?,?,?)',
                        (entrada['modelo'], entrada['revisao'], json.dumps(derivado, ensure_ascii=False)))
            con.commit()
        finally:
            con.close()

    def manifesto_coletado(self, modelo, revisao):
        con = self._db()
        try:
            # Somente na leitura explícita do recurso; status continua leve.
            for row in con.execute('SELECT manifesto FROM coletas WHERE modelo=?', (modelo,)):
                m = json.loads(row[0])
                if m['empresa'] == self.empresa and m['modelo'] == modelo and m['revisao'] == revisao:
                    return m
        finally:
            con.close()
        return None

    def catalogo(self):
        con = self._db()
        try:
            return [json.loads(row[0]) for row in con.execute('SELECT conteudo FROM catalogo')]
        finally:
            con.close()

    def identidades(self):
        con = self._db()
        try:
            return con.execute('SELECT modelo,revisao FROM catalogo').fetchall()
        finally:
            con.close()

    def cadastrar(self, item, *, _antecipacao=False):
        m = _manifesto(item['manifesto'])
        if m['empresa'] != self.empresa:
            raise ValueError('Empresa incompatível com a estação piloto.')
        if m['configuracao'].get('tipo') == 'entrada_online':
            raise ValueError('Entrada online exige a rota de captura conferida.')
        if m['configuracao'].get('tipo') == 'antecipacao_online' and not _antecipacao:
            raise ValueError('Antecipação exige a rota de conferência.')
        urls = item['fontes']
        if not isinstance(urls, dict):
            raise ValueError('Fontes inválidas.')
        obrigatorios = {k for k, v in m['arquivos'].items() if v is not None}
        if set(urls) != obrigatorios:
            raise ValueError('Fontes incompletas ou excedentes.')
        for url in urls.values():
            validar_url(url, self.host)
        prazo = item.get('prazo')
        if prazo:
            d = datetime.fromisoformat(prazo)
            if d.tzinfo is None or d.utcoffset() is None:
                raise ValueError('Prazo sem fuso.')
        setor = item.get('setor', '')
        if not isinstance(setor, str):
            raise ValueError('Setor inválido.')
        registro = dict(manifesto=m, fontes=urls, prazo=prazo, setor=setor)
        texto = json.dumps(registro, ensure_ascii=False, sort_keys=True, allow_nan=False)
        con = self._db()
        try:
            con.execute('BEGIN IMMEDIATE')
            anterior = con.execute('SELECT conteudo FROM catalogo WHERE modelo=? AND revisao=?',
                                   (m['modelo'], m['revisao'])).fetchone()
            if anterior and json.loads(anterior[0])['manifesto'] != m:
                raise ValueError('Revisão imutável.')
            if not anterior and con.execute('SELECT COUNT(*) FROM catalogo').fetchone()[0] >= self.limite_catalogo:
                raise ValueError('Limite do catálogo piloto atingido.')
            con.execute('INSERT OR REPLACE INTO catalogo VALUES (?,?,?)', (m['modelo'], m['revisao'], texto))
            con.commit()
            self.preparador.atualizar_agenda(m, setor=setor,
                prazo=datetime.fromisoformat(prazo) if prazo else None)
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def atualizar_fila(self):
        for item in self.catalogo():
            m = item['manifesto']
            chave = (self.empresa,m['modelo'],m['revisao'])
            if (chave not in self.preparador.armazenamento._atualizar_ao_abrir
                    and any(c['configuracao'].get('revisao_entrada') == m['revisao'] for c in self.copias_presentes(m['modelo']))):
                continue
            if self.conferir and m['configuracao'].get('tipo') == 'antecipacao_online':
                con = self._db()
                try:
                    r = con.execute('SELECT quando FROM conferencias WHERE modelo=? AND revisao=?',
                                    (m['modelo'], m['revisao'])).fetchone()
                finally:
                    con.close()
                if (not r or not _conferencia_recente(r[0])) and not self.obter_coleta(m):
                    continue
            estado = self.preparador.estado(self.empresa, m['modelo'], m['revisao'])['estado']
            if estado in ('desconhecido', 'revalidacao_pendente', 'falha_preparacao', 'preparacao_interrompida'):
                self.preparador.agendar(m, item['fontes'], setor=item['setor'],
                                       prazo=datetime.fromisoformat(item['prazo']) if item['prazo'] else None)

    def receber_entrada(self, manifesto, uploads):
        m = _manifesto(manifesto)
        cfg = m['configuracao']
        if m['empresa'] != self.empresa or cfg.get('tipo') != 'entrada_online' or cfg.get('preparacao_completa') is not False:
            raise ValueError('Entrada fora do escopo do piloto.')
        ids = cfg.get('modelos')
        contexto = cfg.get('contexto')
        modelos = contexto.get('modelos') if isinstance(contexto, dict) else None
        aprovados = {'APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA'}
        if (not isinstance(ids, list) or not ids
                or not all(isinstance(i, str) and i.isascii() and i.isdecimal() for i in ids)
                or len(ids) != len(set(ids))
                or not isinstance(modelos, list) or len(modelos) != len(ids)
                or not all(isinstance(i, dict) for i in modelos)
                or {str(i.get('id')) for i in modelos} != set(ids)
                or any(str(i.get('status_arte', '')).strip().upper() not in aprovados for i in modelos)):
            raise ValueError('Aprovação observada ou modelos incompletos.')
        esperado = ids[0] if len(ids) == 1 else 'combinacao:' + ','.join(sorted(ids))
        if m['modelo'] != esperado or cfg.get('pendencias') != ['dependencias_do_motor', 'aprovacao_versionada']:
            raise ValueError('Identidade/pendências divergentes.')
        campos = cfg.get('campos', {})
        recursos = {k for k, v in m['arquivos'].items() if v is not None}
        if not isinstance(campos, dict) or set(uploads) != recursos or set(campos) != recursos:
            raise ValueError('Recursos incompletos ou excedentes.')
        for nome, campo in campos.items():
            esperado = {'frente': 'file', 'verso': 'file_verso'}.get(nome, nome)
            if not isinstance(campo, str) or campo != esperado or not re.fullmatch(
                    r'file|file_verso|csv_file|ma_file_\d+|ma_verso_\d+', campo):
                raise ValueError('Mapeamento de recurso inválido.')
        if sum(info['bytes'] for info in m['arquivos'].values() if info is not None) > 64 * 1024 * 1024:
            raise ValueError('Entrada excede limite do piloto.')
        agenda = cfg.get('agendamento') or {}
        if not isinstance(agenda, dict):
            raise ValueError('Agendamento inválido.')
        setor, prazo = agenda.get('setor', ''), agenda.get('prazo')
        setores = agenda.get('setores', [])
        if not isinstance(setores, list) or not all(isinstance(s, str) for s in setores):
            raise ValueError('Setores inválidos.')
        preferido = self.preparador.setor_prioritario.strip().casefold()
        if setores:
            setor = next((s for s in setores if s.strip().casefold() == preferido), setores[0])
        if not isinstance(setor, str):
            raise ValueError('Setor inválido.')
        if prazo:
            d = datetime.fromisoformat(prazo)
            if d.tzinfo is None or d.utcoffset() is None:
                raise ValueError('Prazo sem fuso.')
        area = self.raiz / 'entradas'
        _sem_links(area)
        area.mkdir(parents=True, exist_ok=True)
        criados, fontes = [], {}
        con = self._db()
        try:
            # Reservar capacidade na mesma transação da admissão. Não gravar
            # pacote no disco para depois descobrir que o catálogo está cheio.
            con.execute('BEGIN IMMEDIATE')
            anterior = con.execute('SELECT conteudo FROM catalogo WHERE modelo=? AND revisao=?',
                                   (m['modelo'], m['revisao'])).fetchone()
            if anterior and json.loads(anterior[0])['manifesto'] != m:
                raise ValueError('Revisão imutável.')
            if not anterior and con.execute('SELECT COUNT(*) FROM catalogo').fetchone()[0] >= self.limite_catalogo:
                raise ValueError('Catálogo do piloto cheio.')
            for nome in recursos:
                info = m['arquivos'][nome]
                import shutil
                if shutil.disk_usage(area).free < 2 * info['bytes'] + self.local.reserva_bytes:
                    raise OSError('Espaço insuficiente para captura.')
                with tempfile.NamedTemporaryFile(dir=area, prefix='entrada-', delete=False) as saida:
                    caminho = Path(saida.name); criados.append(caminho)
                    digest, tamanho = hashlib.sha256(), 0
                    while True:
                        bloco = uploads[nome].read(min(1024 * 1024, info['bytes'] - tamanho + 1))
                        if not bloco: break
                        tamanho += len(bloco)
                        if tamanho > info['bytes']: raise ValueError('Recurso maior que o declarado.')
                        digest.update(bloco); saida.write(bloco)
                    if tamanho != info['bytes'] or digest.hexdigest() != info['sha256']:
                        raise ValueError('Integridade da entrada divergente.')
                fontes[nome] = caminho
            self.local.preparar(m, fontes)
            registro = dict(manifesto=m, fontes={}, prazo=prazo, setor=setor)
            try:
                if not con.execute('SELECT 1 FROM catalogo WHERE modelo=? AND revisao=?', (m['modelo'], m['revisao'])).fetchone():
                    if con.execute('SELECT COUNT(*) FROM catalogo').fetchone()[0] >= self.limite_catalogo:
                        raise ValueError('Catálogo do piloto cheio.')
                    con.execute('INSERT INTO catalogo VALUES (?,?,?)',
                                (m['modelo'], m['revisao'], json.dumps(registro, ensure_ascii=False)))
                con.execute('INSERT OR REPLACE INTO origens VALUES (?,?,?)', (m['modelo'], m['revisao'], 'entrada_online'))
                con.commit()
            except BaseException:
                con.rollback(); raise
            return {'recebido': True, 'revisao': m['revisao'], 'estado': 'dependencias_pendentes', 'execucao_offline': False}
        finally:
            con.close()  # rollback implícito se a admissão não chegou ao commit
            for caminho in criados:
                if caminho.exists(): caminho.unlink()

    def estado_modelo(self, modelo, revisao):
        resultado = self.preparador.estado(self.empresa, modelo, revisao)
        resultado['copia_local_presente'] = bool(self.copias_presentes(modelo))
        con = self._db()
        try:
            registro = con.execute('SELECT quando FROM conferencias WHERE modelo=? AND revisao=?', (modelo, revisao)).fetchone()
            if registro:
                resultado['origem_conferida_em'] = registro[0]
                resultado['conferencia_online_pendente'] = not _conferencia_recente(registro[0])
        finally:
            con.close()
        if resultado.get('antecipacao'):
            if resultado['estado'] == 'local_validado':
                resultado['estado'] = 'recursos_antecipados'
            resultado['aprovacao_versionada'] = False
        if resultado['estado'] == 'local_validado':
            con = self._db()
            try:
                row = con.execute('SELECT tipo FROM origens WHERE modelo=? AND revisao=?', (modelo, revisao)).fetchone()
            finally: con.close()
            if row and row[0] == 'entrada_online':
                resultado['estado'] = 'fotos_fontes_locais' if resultado.get('coleta_fotos_fontes') else 'dependencias_pendentes'
                resultado['arquivos_de_entrada_validados'] = True
        return resultado

    def iniciar(self):
        if self._thread and self._thread.is_alive():
            if self._stop.is_set():
                raise RuntimeError('Encerramento do piloto ainda em andamento.')
            return
        self._stop.clear()
        if self.coleta_autonoma:
            self.coleta_autonoma.proxima = 0
        con = self._db()
        try:
            row = con.execute('SELECT valor FROM controle_piloto WHERE chave=?', ('pausado',)).fetchone()
            if row:
                self.preparador.pausar(row[0] == '1')
        finally:
            con.close()
        self.atualizar_preferencias()
        self.preparador.iniciar(antes_de_executar=self.atualizar_fila)
        def ciclo():
            while not self._stop.is_set():
                self._acordar.wait(self.intervalo_catalogo)
                self._acordar.clear()
                if self._stop.is_set():
                    break
                try:
                    if self.coleta_autonoma:
                        self.coleta_autonoma.rodar()
                    self.atualizar_fila()
                    self.erro_catalogo = False
                except Exception:
                    # Falha não libera produção nem encerra o worker do agente.
                    self.erro_catalogo = True
                    continue
        self._thread = threading.Thread(target=ciclo, daemon=True, name='CatalogoPacotesPiloto')
        self._thread.start()

    def encerrar(self):
        self._stop.set()
        self._acordar.set()
        if self._thread:
            self._thread.join(5)
        encerrado = self.preparador.encerrar()
        return encerrado and (self._thread is None or not self._thread.is_alive())


def criar_router(servico, token):
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError('Token local do piloto ausente ou curto.')
    async def autorizar(request: Request, response: Response):
        if not request.client or request.client.host not in ('127.0.0.1', '::1'):
            raise HTTPException(403, 'Piloto restrito à estação local.')
        recebido = request.headers.get('x-newprod-piloto', '')
        if not secrets.compare_digest(recebido.encode('utf-8'), token.encode('utf-8')):
            raise HTTPException(401, 'Sessão do piloto necessária.')
        response.headers['Cache-Control'] = 'no-store'
    router = APIRouter(prefix='/api/pacotes-locais', dependencies=[Depends(autorizar)])

    @router.get('/estado')
    def estado():
        return {'piloto': True, 'setor': servico.preparador.setor_prioritario,
                'empresa': servico.empresa, 'fila': servico.preparador.resumo(),
                'erro_catalogo': servico.erro_catalogo,
                'coleta_autonoma': dict(servico.coleta_autonoma.estado) if servico.coleta_autonoma else {'habilitada':False},
                'execucao_offline': False,
                'modelos': [dict(modelo=modelo,
                                **servico.estado_modelo(modelo, revisao))
                            for modelo, revisao in servico.identidades()]}

    @router.post('/catalogo')
    async def cadastrar(request: Request):
        # Ler em blocos limita corpo inclusive sem Content-Length.
        corpo = bytearray()
        async for bloco in request.stream():
            corpo.extend(bloco)
            if len(corpo) > 2 * 1024 * 1024:
                raise HTTPException(413, 'Manifesto excede limite do piloto.')
        try:
            item = json.loads(corpo)
            # Não rodar SQLite no event loop.
            from starlette.concurrency import run_in_threadpool
            await run_in_threadpool(servico.cadastrar, item)
            await run_in_threadpool(servico.atualizar_fila)
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, 'Manifesto inválido, divergente ou fora do escopo.') from None
        return {'aceito': True, 'execucao_offline': False}

    @router.post('/pausa/{pausado}')
    def pausa(pausado: bool):
        servico.pausar(pausado)
        return {'pausado': pausado}

    @router.post('/antecipacao')
    async def antecipacao(request: Request):
        corpo = bytearray()
        async for bloco in request.stream():
            corpo.extend(bloco)
            if len(corpo) > 256 * 1024:
                raise HTTPException(413, 'Observação excede limite.')
        try:
            from starlette.concurrency import run_in_threadpool
            recibo = await run_in_threadpool(servico.antecipar, json.loads(corpo), request.headers.get('authorization'))
            await run_in_threadpool(servico.atualizar_fila)
            return recibo
        except ConferenciaIndisponivel:
            raise HTTPException(409, 'Origem não confirmada na nuvem; nova consulta autenticada necessária.') from None
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, 'Antecipação incompatível com o piloto.') from None

    @router.post('/entrada')
    async def entrada(request: Request):
        from starlette.formparsers import MultiPartParser, MultiPartException
        from starlette.datastructures import UploadFile
        from starlette.concurrency import run_in_threadpool
        async def limitado():
            tamanho = 0
            async for bloco in request.stream():
                tamanho += len(bloco)
                if tamanho > 68 * 1024 * 1024:
                    raise MultiPartException('Entrada excede limite.')
                yield bloco
        form = None
        try:
            form = await MultiPartParser(request.headers, limitado(), max_files=64, max_fields=1,
                                         max_part_size=2 * 1024 * 1024).parse()
            if len(form.multi_items()) != len(form): raise ValueError('Campos duplicados.')
            metadata = form['manifesto']
            if not isinstance(metadata, str) or len(metadata.encode('utf-8')) > 2 * 1024 * 1024:
                raise ValueError('Manifesto excede limite.')
            m = json.loads(metadata)
            uploads = {}
            for nome, valor in form.items():
                if nome == 'manifesto': continue
                if not nome.startswith('arquivo_') or not isinstance(valor, UploadFile):
                    raise ValueError('Campo inesperado.')
                uploads[nome[len('arquivo_'):]] = valor.file
            recibo = await run_in_threadpool(servico.receber_entrada, m, uploads)
            await run_in_threadpool(servico.atualizar_fila)
            return recibo
        except (KeyError, TypeError, ValueError, MultiPartException):
            raise HTTPException(400, 'Entrada não conferida ou incompatível com o piloto.') from None
        except OSError:
            raise HTTPException(507, 'Captura não persistida; confira o armazenamento local.') from None
        finally:
            if form is not None: await form.close()

    @router.get('/recurso/{modelo}/{revisao}/{nome}')
    def recurso(modelo: str, revisao: str, nome: str):
        item = next((i for i in servico.catalogo() if i['manifesto']['modelo'] == modelo
                     and i['manifesto']['revisao'] == revisao), None)
        m = item['manifesto'] if item else servico.manifesto_coletado(modelo, revisao)
        if not m:
            raise HTTPException(404, 'Pacote ausente.')
        if servico.local.consultar(servico.empresa, modelo, revisao)['estado'] != 'local_validado':
            raise HTTPException(409, 'Pacote precisa ser validado.')
        info = m['arquivos'].get(nome)
        if not info:
            raise HTTPException(404, 'Recurso ausente.')
        try:
            dados = servico.local.ler_recurso(servico.empresa, modelo, revisao, nome)
            digest = hashlib.sha256(dados).hexdigest()
            if digest != info['sha256'] or len(dados) != info['bytes']:
                raise ValueError('Índice de catálogo divergente.')
        except (ValueError, OSError):
            raise HTTPException(409, 'Recurso precisa ser validado.') from None
        # Entregar os mesmos bytes conferidos, sem reabrir o caminho depois.
        return Response(dados, media_type='application/octet-stream',
                        headers={'Cache-Control': 'no-store', 'X-Content-SHA256': digest})
    return router


def configurar_piloto(app, *, ocupado):
    """Somente ativação explícita por ambiente; falha de configuração é bloqueante."""
    if os.environ.get('NEWPROD_PILOTO_LOCAL') != '1':
        return None
    raiz = os.environ.get('NEWPROD_PILOTO_RAIZ')
    token = os.environ.get('NEWPROD_PILOTO_TOKEN', '')
    empresa = os.environ.get('NEWPROD_PILOTO_EMPRESA', '').strip()
    if not raiz or not Path(raiz).is_absolute():
        raise ValueError('Raiz absoluta explícita necessária para o piloto.')
    if len(token) < 32:
        raise ValueError('Token local do piloto não configurado.')
    if not empresa:
        raise ValueError('Identidade explícita da empresa necessária para o piloto.')
    host = 'vwbtitjlpelrcnsytzqw.supabase.co'
    servico = ServicoPacotes(raiz, host=host, empresa=empresa, ocupado=ocupado,
                            conferir=ConferidorPiloto(host))
    if os.environ.get('NEWPROD_PILOTO_AUTONOMO') == '1':
        estacao = os.environ.get('NEWPROD_PILOTO_ESTACAO', '').strip()
        if not estacao or len(estacao) > 80:
            raise ValueError('Identidade explícita da estação necessária para coleta autônoma.')
        from controle_producao import controle
        from coleta_autonoma import spool_vazio
        servico.coleta_autonoma = ColetaAutonoma(servico, ClienteAutonomo(host, empresa, estacao),
            ociosidade=controle.segundos_ociosos, spool_livre=spool_vazio)
    app.include_router(criar_router(servico, token))
    from estatisticas_piloto import criar_router_estatisticas, PainelPilotoMiddleware
    app.include_router(criar_router_estatisticas(servico))
    app.add_middleware(PainelPilotoMiddleware)
    if os.environ.get('NEWPROD_PILOTO_PAUSADO') == '1':
        servico.pausar(True)
    return servico
