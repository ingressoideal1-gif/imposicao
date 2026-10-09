"""Descoberta no agente, sem navegador, sem sessão persistida e sem impressão."""
from datetime import datetime
import json
import time
import threading
import urllib.request

from conferencia_piloto import ConferidorPiloto, ConferenciaIndisponivel
from pacotes_download import SemRedirecionamento


def segredo_do_agente():
    # Somente em runtime opt-in. Não ler configuração no import ou nos testes.
    import acesso_publicacao
    return acesso_publicacao._segredo()


class ClienteAutonomo:
    def __init__(self, host, empresa, estacao, *, segredo=segredo_do_agente, abrir=None):
        self.base = 'https://' + host + '/functions/v1/piloto-local/'
        self.empresa, self.estacao, self.segredo = empresa, estacao, segredo
        self.abrir = abrir or urllib.request.build_opener(SemRedirecionamento()).open

    def chamar(self, acao, corpo):
        if acao not in ('listar', 'conferir', 'conferir-pedido', 'abrir-pedido'):
            raise ValueError('Operação fora do piloto.')
        try:
            segredo = self.segredo()
            if not segredo: raise ValueError()
            req = urllib.request.Request(self.base + acao,
                data=json.dumps({**corpo, 'estacao': self.estacao}).encode(), method='POST',
                headers={'Content-Type':'application/json', 'X-Agente-Segredo':segredo})
            with self.abrir(req, timeout=20) as resposta:
                if getattr(resposta, 'status', 200) != 200: raise ValueError()
                limite = (8 if acao in ('conferir-pedido', 'abrir-pedido') else 1) * 1024 * 1024
                raw = resposta.read(limite + 1)
                if len(raw) > limite: raise ValueError()
                return json.loads(raw)
        except Exception:
            raise ConferenciaIndisponivel('Canal autônomo não confirmado; confira habilitação e acesso da estação.') from None

    def conferir(self, item):
        corpo = {k:item[k] for k in ('empresa','modelo','fontes')}
        corpo['digest'] = item['observacao']['digest']
        return ConferidorPiloto.validar(item, self.chamar('conferir', corpo))

    def conferir_pedido(self, pedido, revisao=''):
        return self.chamar('conferir-pedido', {'empresa':self.empresa, 'pedido':pedido, 'revisao':revisao})

    def abrir_pedido(self, pedido, revisao=''):
        return self.chamar('abrir-pedido', {'empresa':self.empresa, 'pedido':pedido, 'revisao':revisao})

    def listar(self, cursor, pedido=None):
        corpo = {'empresa':self.empresa, 'cursor':cursor}
        if pedido is not None: corpo['pedido'] = pedido
        dados = self.chamar('listar', corpo)
        if (not isinstance(dados, dict) or not isinstance(dados.get('itens'), list)
                or len(dados['itens']) > 16 or type(dados.get('proximo')) is not int
                or not 0 <= dados['proximo'] <= 9007199254740991
                or type(dados.get('fim')) is not bool
                or (dados['fim'] and dados['proximo'] != 0)
                or (not dados['fim'] and dados['proximo'] <= cursor)):
            raise ValueError('Página autônoma inválida.')
        anterior = cursor
        for item in dados['itens']:
            if (not isinstance(item, dict) or item.get('empresa') != self.empresa
                    or not isinstance(item.get('modelo'), str) or not item['modelo'].isascii()
                    or not item['modelo'].isdecimal() or int(item['modelo']) <= anterior
                    or (not dados['fim'] and int(item['modelo']) > dados['proximo'])):
                raise ValueError('Identidade divergente no catálogo.')
            if pedido is not None and item.get('pedido') != pedido:
                raise ValueError('Pedido divergente no catálogo.')
            anterior = int(item['modelo'])
        return dados


def spool_vazio():
    # Consulta somente leitura; não assume ociosidade quando o spool está inacessível.
    try:
        import win32print
        for impressora in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS, None, 4):
            handle = win32print.OpenPrinter(impressora['pPrinterName'])
            try:
                if win32print.EnumJobs(handle, 0, 1, 1):
                    spool_vazio.motivo = 'Trabalho presente no spool.'
                    return False
            finally:
                win32print.ClosePrinter(handle)
        return True
    except Exception as erro:
        spool_vazio.motivo = 'Consulta do spool indisponível: ' + type(erro).__name__ + ' / ' + str(getattr(erro, 'winerror', 'sem código'))
        return False


class ColetaPausada(Exception):
    pass


class ColetaAutonoma:
    def __init__(self, servico, cliente, *, relogio=time.monotonic, agora=lambda: datetime.now().astimezone(),
                 ociosidade=None, spool_livre=lambda: True):
        self.servico, self.cliente = servico, cliente
        self.relogio, self.agora = relogio, agora
        self.proxima = 0
        self.ociosidade, self.spool_livre = ociosidade, spool_livre
        self._inicio_ocioso = relogio()
        self._ultima_varredura = relogio()
        self._solicitado = threading.Event()
        self._manual = threading.Event()
        self._preferenciais_consultados = {}
        self.limite_ciclo = float('inf')
        self.estado = {'habilitada':True, 'estado':'aguardando', 'recebidos':0}

    def solicitar(self, *, manual=False):
        if manual:
            self._manual.set()
            self.estado = {**self.estado, 'estado':'iniciando', 'modo':'manual'}
        self._solicitado.set()

    def cancelar_manual(self):
        self._manual.clear()

    def _admitir(self, original, *, abertura=False):
        self._checkpoint()
        if original.get('pedido'):
            con = self.servico._db()
            try:
                con.execute('INSERT OR REPLACE INTO modelos_pedidos VALUES (?,?)', (original['modelo'],original['pedido']))
                con.commit()
            finally:
                con.close()
        if not abertura and self.servico.copias_presentes(original['modelo']):
            return
        item = dict(original)
        prazo = item.pop('prazo_erp', None)
        if prazo:
            item['prazo'] = datetime.fromisoformat(prazo).astimezone().isoformat()
        resposta = self.servico.antecipar(item, _conferidor=self._conferir)
        if abertura:
            self.servico.preparar_abertura(resposta)
        self.estado = {**self.estado, 'recebidos':self.estado['recebidos'] + 1}

    def _checkpoint(self):
        fila = self.servico.preparador.resumo()
        if self.servico._stop.is_set() or fila['pausado'] or fila['ocupado']:
            raise ColetaPausada()
        if self.relogio() >= self.limite_ciclo:
            raise TimeoutError('Ciclo excedeu limite.')

    def _guardar_cursor(self, cursor):
        con = self.servico._db()
        try:
            con.execute('INSERT OR REPLACE INTO controle_piloto VALUES (?,?)', ('cursor_autonomo', str(cursor)))
            con.commit()
        finally: con.close()

    def _conferir(self, item, _authorization):
        self._checkpoint()
        recibo = self.cliente.conferir(item)
        # A consulta pode ter atravessado uma pausa, ocupação ou encerramento.
        # Reavaliar antes de devolver o recibo que permite cadastrar o modelo.
        self._checkpoint()
        return recibo

    def verificar_ociosidade(self):
        if self.ociosidade is None: return
        agora = self.relogio()
        fila = self.servico.preparador.resumo()
        try:
            if fila['ocupado'] or not self.spool_livre():
                self._inicio_ocioso = agora
                return
            segundos = min(self.ociosidade(), agora - self._inicio_ocioso)
            if fila['pausado'] or segundos <= 1800 or agora - self._ultima_varredura <= 1800:
                return
            for pedido in self.servico.pedidos_locais():
                self.servico.abrir_pedido(pedido)
            self._ultima_varredura = agora
        except Exception:
            self._inicio_ocioso = agora

    def _listar(self, cursor, pedido=None):
        pagina = self.cliente.listar(cursor, pedido=pedido) if pedido is not None else self.cliente.listar(cursor)
        self.estado = {**self.estado,
            'lotes_consultados':self.estado.get('lotes_consultados', 0) + 1,
            'ultima_consulta':self.agora().isoformat()}
        return pagina

    def rodar(self):
        self.verificar_ociosidade()
        manual = self._manual.is_set()
        if self.relogio() < self.proxima and not self._solicitado.is_set() and not manual: return
        self.limite_ciclo = self.relogio() + 120
        try:
            self._checkpoint()
            # Copiar recursos nao imprime nem modifica trabalhos do Windows.
            # A producao ativa do NewProd continua protegida pelo checkpoint.
            # Um job pausado/antigo no spool nao pode bloquear downloads para sempre.
        except ColetaPausada:
            self.estado = {**self.estado, 'estado':'pausada'}
            return
        self._solicitado.clear()
        self.proxima = self.relogio() + 300
        reiniciar = self.estado.get('estado') == 'concluida'
        self.estado = {**self.estado, 'habilitada':True, 'estado':'consultando', 'recebidos':0,
                       'modo':'manual' if manual else 'automatico',
                       'fase':'pedidos abertos',
                       'lotes_consultados':0 if reiniciar else self.estado.get('lotes_consultados',0),
                       'lotes_catalogo':0 if reiniciar else self.estado.get('lotes_catalogo',0)}
        self.estado.pop('motivo', None)
        try:
            con = self.servico._db()
            try:
                row = con.execute('SELECT valor FROM controle_piloto WHERE chave=?', ('cursor_autonomo',)).fetchone()
                cursor = int(row[0]) if row else 0
                if not 0 <= cursor <= 9007199254740991: raise ValueError()
            finally: con.close()
        except Exception:
            self.estado = {**self.estado, 'estado':'pendente', 'motivo':'Não foi possível ler a posição da coleta local.'}
            return
        try:
            con = self.servico._db()
            try:
                aberturas = con.execute('SELECT pedido,cursor,versao FROM aberturas_piloto '
                    'ORDER BY CASE WHEN pedido IN (SELECT pedido FROM preferencias_piloto) THEN 0 ELSE 1 END, versao').fetchall()
            finally:
                con.close()
            for pedido, abertura_cursor, versao in aberturas:
                for _ in range(8):
                    self._checkpoint()
                    pagina = self._listar(abertura_cursor, pedido=pedido)
                    for original in pagina['itens']:
                        self._admitir(original, abertura=True)
                    self._checkpoint()
                    abertura_cursor = pagina['proximo']
                    con = self.servico._db()
                    try:
                        if pagina['fim']:
                            con.execute('DELETE FROM aberturas_piloto WHERE pedido=? AND versao=?', (pedido,versao))
                        else:
                            con.execute('UPDATE aberturas_piloto SET cursor=? WHERE pedido=? AND versao=?', (abertura_cursor,pedido,versao))
                        con.commit()
                    finally:
                        con.close()
                    if pagina['fim']: break
            # Cursores por pedido persistem sem interferir na varredura geral.
            preferencias = self.servico.preferencias()
            self._preferenciais_consultados = {p:t for p,t in self._preferenciais_consultados.items() if p in preferencias}
            self.estado = {**self.estado, 'fase':'pedidos preferenciais'}
            for pedido in preferencias:
                if not manual and self.relogio() < self._preferenciais_consultados.get(pedido, -float('inf')) + 300:
                    continue
                self._checkpoint()
                con = self.servico._db()
                try:
                    row = con.execute('SELECT valor FROM controle_piloto WHERE chave=?', ('pedido_cursor_' + pedido,)).fetchone()
                    preferencial_cursor = int(row[0]) if row else 0
                finally:
                    con.close()
                for _ in range(8):
                    self._checkpoint()
                    if pedido not in self.servico.preferencias(): break
                    pagina = self._listar(preferencial_cursor, pedido=pedido)
                    for original in pagina['itens']:
                        self._admitir(original)
                    self._checkpoint()
                    preferencial_cursor = pagina['proximo']
                    con = self.servico._db()
                    try:
                        con.execute('INSERT OR REPLACE INTO controle_piloto VALUES (?,?)', ('pedido_cursor_' + pedido, str(preferencial_cursor)))
                        con.commit()
                    finally:
                        con.close()
                    if pagina['fim']:
                        self._preferenciais_consultados[pedido] = self.relogio()
                        break
            self.estado = {**self.estado, 'fase':'catálogo geral'}
            hora = self.agora().hour
            for _ in range(8 if manual or hora >= 20 or hora < 7 else 1):
                self._checkpoint()
                pagina = self._listar(cursor)
                self.estado = {**self.estado, 'lotes_catalogo':self.estado.get('lotes_catalogo',0) + 1}
                for original in pagina['itens']:
                    self._admitir(original)
                    self._guardar_cursor(int(original['modelo']))
                self._checkpoint()
                cursor = pagina['proximo']
                self._guardar_cursor(cursor)
                if pagina['fim']: break
            self.estado = {**self.estado, 'estado':'concluida' if pagina['fim'] else 'lote_concluido',
                           'ultima_consulta':self.agora().isoformat()}
            if pagina['fim']:
                self._manual.clear()
            if not pagina['fim']:
                self.proxima = 0
                self.servico._acordar.set()
        except ColetaPausada:
            self.proxima = 0
            self.estado = {**self.estado, 'estado':'pausada'}
        except TimeoutError:
            self.proxima = 0
            self.servico._acordar.set()
            self.estado = {**self.estado, 'estado':'lote_concluido'}
        except Exception:
            self.estado = {**self.estado, 'estado':'pendente',
                           'motivo':'Consulta não concluída; nova tentativa automática em cinco minutos.'}
