"""Conferência explícita de seleção e leitura dos recursos persistidos no piloto."""
import re
import threading
from concurrent.futures import ThreadPoolExecutor

from antecipacao_local import AntecipadorRecursos
from conferencia_piloto import ConferenciaIndisponivel
from revisao_pedido_piloto import CacheRevisaoPedido, validar_recibo, versoes_confiaveis


class SelecaoPiloto:
    def __init__(self, servico):
        self.servico = servico
        self._lock = threading.Lock()
        self._cache = CacheRevisaoPedido(servico)

    def preparar(self, dados):
        if (not isinstance(dados, dict) or set(dados) != {'pedido', 'modelo', 'digest'}
                or any(not isinstance(dados[k], str) for k in dados)
                or not re.fullmatch(r'[1-9][0-9]{0,14}', dados['pedido'])
                or not re.fullmatch(r'[1-9][0-9]{0,14}', dados['modelo'])
                or not re.fullmatch('[a-f0-9]{64}', dados['digest'])):
            raise ValueError('Seleção inválida.')
        s = self.servico
        if not s.coleta_autonoma:
            raise ConferenciaIndisponivel('Coleta da estação indisponível.')
        # Não concorrer com outra seleção; o navegador pode ter abandonado uma
        # requisição, mas o servidor ainda precisa concluir sua gravação.
        if not self._lock.acquire(blocking=False):
            raise ConferenciaIndisponivel('Outra seleção está sendo preparada. Tente novamente.')
        try:
            cliente = s.coleta_autonoma.cliente
            pagina = cliente.listar(int(dados['modelo']) - 1, pedido=dados['pedido'])
            item = next((i for i in pagina['itens'] if i['modelo'] == dados['modelo']), None)
            return self._preparar_item(dados, item)
        finally:
            self._lock.release()

    def _preparar_item(self, dados, item, *, conferido_em=None, recursos_anteriores=None):
        s = self.servico
        cliente = s.coleta_autonoma.cliente
        if not item or item['observacao']['digest'] != dados['digest']:
            raise ConferenciaIndisponivel('O modelo mudou ou não está disponível. Selecione novamente.')
        if not item['fontes'].get('frente'):
            raise ConferenciaIndisponivel('Arte de frente ainda não disponível para preparação local.')
        resposta = s.antecipar(item, _conferidor=lambda i, _: conferido_em or cliente.conferir(i))
        entrada = next(i['manifesto'] for i in s.catalogo()
                       if i['manifesto']['modelo'] == dados['modelo']
                       and i['manifesto']['revisao'] == resposta['revisao'])
        anterior = s.obter_coleta(entrada)
        # Instância dedicada: sem herdar a dispensa de atualização do coletor
        # ocioso. URLs iguais também são revalidadas (ETag ou download).
        preparador = AntecipadorRecursos(None, s.local, s.host, s.obter_coleta, s.salvar_coleta,
                                         abrir=s.preparador.armazenamento.abrir, intervalo=0,
                                         versoes_fontes=item.get('versoes_fontes') if conferido_em else None,
                                         recursos_anteriores=recursos_anteriores)
        preparador.preparar(entrada, {})
        atual = s.obter_coleta(entrada)
        if not conferido_em:
            cliente.conferir(item)  # legado: mudanca durante download nao libera
        if not atual or s.local.consultar(s.empresa, dados['modelo'], atual['revisao'])['estado'] != 'local_validado':
            raise ValueError('Cópia local não validada.')
        recursos = {nome: '/api/pacotes-locais/recurso-painel/' + dados['modelo'] + '/' + atual['revisao'] + '/' + nome
                    for nome, info in atual['arquivos'].items() if info}
        return {'modelo': dados['modelo'], 'digest': dados['digest'], 'revisao': atual['revisao'],
                'atualizado': not anterior or anterior['arquivos'] != atual['arquivos'],
                'recursos': recursos, 'hashes': {n: i['sha256'] for n, i in atual['arquivos'].items() if i},
                'fontes': item['fontes'], 'origem': 'local', 'execucao_offline': False}

    def preparar_pedido(self, dados):
        """Uma listagem paginada por abertura, sem repetir a consulta por modelo."""
        if (not isinstance(dados, dict) or set(dados) != {'pedido', 'modelos'}
                or not isinstance(dados['pedido'], str)
                or not re.fullmatch(r'[1-9][0-9]{0,14}', dados['pedido'])
                or not isinstance(dados['modelos'], list) or not 1 <= len(dados['modelos']) <= 128):
            raise ValueError('Pedido inválido.')
        solicitados = {}
        for modelo in dados['modelos']:
            if (not isinstance(modelo, dict) or set(modelo) != {'modelo', 'digest'}
                    or not isinstance(modelo['modelo'], str) or not isinstance(modelo['digest'], str)
                    or not re.fullmatch(r'[1-9][0-9]{0,14}', str(modelo['modelo']))
                    or not re.fullmatch('[a-f0-9]{64}', str(modelo['digest']))
                    or modelo['modelo'] in solicitados):
                raise ValueError('Modelos inválidos.')
            solicitados[modelo['modelo']] = modelo['digest']
        if not self.servico.coleta_autonoma:
            raise ConferenciaIndisponivel('Coleta indisponível.')
        cliente = self.servico.coleta_autonoma.cliente
        if callable(getattr(cliente, 'conferir_pedido', None)):
            return self._preparar_por_revisao(dados['pedido'], solicitados, cliente)
        encontrados, cursor = {}, 0
        for _ in range(256):
            pagina = cliente.listar(cursor, pedido=dados['pedido'])
            for item in pagina['itens']:
                if item['modelo'] in solicitados:
                    encontrados[item['modelo']] = item
            if pagina.get('fim', True) or len(encontrados) == len(solicitados):
                break
            proximo = pagina.get('proximo')
            if type(proximo) is not int or proximo <= cursor:
                raise ConferenciaIndisponivel('Paginação inválida.')
            cursor = proximo
        if any(encontrados[m]['observacao']['digest'] != d
               for m, d in solicitados.items() if m in encontrados):
            raise ConferenciaIndisponivel('Pedido alterado. Reabra para conferir.')
        indisponiveis = [m for m in solicitados if m not in encontrados or not encontrados[m]['fontes'].get('frente')]
        aptos = [m for m in solicitados if m not in indisponiveis]
        if not self._lock.acquire(blocking=False):
            raise ConferenciaIndisponivel('Outro pedido está sendo preparado. Aguarde e reabra.')
        try:
            # Quatro modelos independentes; cada revisão mantém as conferências
            # antes/depois e sua gravação própria. O executor aguarda até as
            # tarefas terminarem, inclusive se uma delas falhar.
            def preparar(modelo):
                return self._preparar_item({'pedido':dados['pedido'], 'modelo':modelo,
                                          'digest':solicitados[modelo]}, encontrados[modelo])
            with ThreadPoolExecutor(max_workers=4, thread_name_prefix='PedidoPiloto') as pool:
                pacotes = list(pool.map(preparar, aptos))
        finally:
            self._lock.release()
        return {'pedido':dados['pedido'], 'pacotes':pacotes, 'sem_arte':indisponiveis}

    def abrir_pedido(self, dados):
        if (not isinstance(dados, dict) or set(dados) != {'pedido'}
                or not isinstance(dados['pedido'], str)
                or not re.fullmatch(r'[1-9][0-9]{0,9}', dados['pedido'])):
            raise ValueError('Pedido invalido.')
        coleta = self.servico.coleta_autonoma
        if not coleta or not callable(getattr(coleta.cliente, 'abrir_pedido', None)):
            raise ConferenciaIndisponivel('Revisao persistida indisponivel.')
        return self._preparar_por_revisao(dados['pedido'], None, coleta.cliente)

    def _preparar_por_revisao(self, pedido, solicitados, cliente):
        if not self._lock.acquire(blocking=False):
            raise ConferenciaIndisponivel('Outro pedido esta sendo preparado. Aguarde e reabra.')
        try:
            anterior = self._cache.obter(pedido)
            persistida = solicitados is None
            if persistida and (not anterior or anterior.get('protocolo') != 2):
                anterior = None
            conferir = cliente.abrir_pedido if persistida else cliente.conferir_pedido
            rev_anterior = anterior['revisao'] if anterior and anterior['empresa'] == self.servico.empresa else ''
            recibo = validar_recibo(conferir(pedido, rev_anterior),
                                    self.servico.empresa, pedido, rev_anterior)
            itens = anterior['itens'] if recibo['sem_mudanca'] else recibo['itens']
            snapshot = None
            if persistida:
                if recibo.get('protocolo') != 2:
                    raise ConferenciaIndisponivel('Sinal persistido nao confirmado.')
                snapshot = anterior['snapshot'] if recibo['sem_mudanca'] else recibo.get('snapshot')
                if (not isinstance(snapshot, dict) or any(not isinstance(snapshot.get(k), list)
                        for k in ('modelos','numeracoes','origens','produtos','bancos','vinculos','artes','mapas'))):
                    raise ConferenciaIndisponivel('Dados locais incompletos.')
                solicitados = {i['modelo']:i['observacao']['digest'] for i in itens}
            encontrados = {}
            for item in itens:
                if (item.get('empresa') != self.servico.empresa or item.get('pedido') != pedido
                        or not re.fullmatch('[1-9][0-9]{0,14}', item.get('modelo',''))
                        or item['modelo'] in encontrados):
                    raise ConferenciaIndisponivel('Resposta do pedido divergente.')
                encontrados[item['modelo']] = item
            for modelo, digest in solicitados.items():
                if modelo in encontrados and encontrados[modelo]['observacao']['digest'] != digest:
                    raise ConferenciaIndisponivel('Pedido alterado. Reabra para conferir.')
            sem_arte = [m for m in solicitados if m not in encontrados or not encontrados[m]['fontes'].get('frente')]
            antigos_itens = {i['modelo']:i for i in anterior['itens']} if anterior else {}
            antigos_pacotes = {p['modelo']:p for p in anterior['pacotes']} if anterior else {}
            reutilizados, preparar = {}, []
            for modelo in solicitados:
                if modelo in sem_arte: continue
                item, pacote = encontrados[modelo], antigos_pacotes.get(modelo)
                antigo = antigos_itens.get(modelo)
                # Versao do Storage acompanha tambem substituicao na mesma URL.
                # Aqui basta existencia/tamanho; leitura real sempre verifica SHA.
                if (pacote and antigo and (persistida and recibo['sem_mudanca'] or versoes_confiaveis(item))
                        and all(item[k] == antigo.get(k) for k in ('fontes','versoes_fontes','observacao'))
                        and self.servico.local.consultar(self.servico.empresa,modelo,pacote['revisao'],
                                                        verificar_bytes=False)['estado'] == 'local_validado'):
                    reutilizados[modelo] = dict(pacote, atualizado=False)
                else:
                    preparar.append(modelo)
            def preparar_modelo(modelo):
                reuso = {}
                pacote, antigo = antigos_pacotes.get(modelo), antigos_itens.get(modelo)
                atual = encontrados[modelo]
                if pacote and antigo and versoes_confiaveis(antigo) and versoes_confiaveis(atual):
                    manifestos = self.servico.copias_presentes(modelo)
                    manifesto = next((m for m in manifestos if m['revisao'] == pacote['revisao']), None)
                    if manifesto and self.servico.local.consultar(self.servico.empresa, modelo, pacote['revisao'])['estado'] == 'local_validado':
                        for nome, url in atual['fontes'].items():
                            original = next((n for n,u in antigo['fontes'].items() if u == url
                                and antigo['versoes_fontes'][n] == atual['versoes_fontes'][nome]), None)
                            if original and manifesto['arquivos'].get(original):
                                reuso[nome] = (manifesto['arquivos'][original],
                                    manifesto['configuracao'].get('validadores_http', {}).get(original))
                return self._preparar_item({'pedido':pedido,'modelo':modelo,'digest':solicitados[modelo]},
                                          encontrados[modelo],conferido_em=recibo['conferido_em'],recursos_anteriores=reuso)
            with ThreadPoolExecutor(max_workers=4,thread_name_prefix='RevisaoPedidoPiloto') as pool:
                for pacote in pool.map(preparar_modelo, preparar):
                    reutilizados[pacote['modelo']] = pacote
            # Downloads/recursos sem versao exigem uma segunda revisao do pedido
            # como barreira da corrida. Caminho inteiramente reutilizado: uma so.
            if preparar:
                final = validar_recibo(conferir(pedido,recibo['revisao']),
                                        self.servico.empresa,pedido,recibo['revisao'])
                if not final['sem_mudanca']:
                    raise ConferenciaIndisponivel('Pedido mudou durante a copia. Reabra para conferir.')
            pacotes = [reutilizados[m] for m in solicitados if m in reutilizados]
            self._cache.salvar(pedido,recibo['revisao'],itens,pacotes,snapshot=snapshot)
            return {'pedido':pedido,'revisao_pedido':recibo['revisao'],'pacotes':pacotes,'sem_arte':sem_arte,
                    'reutilizados':len(pacotes)-len(preparar),
                    **({'protocolo':2,'snapshot':snapshot} if persistida else {})}
        finally:
            self._lock.release()

    def ler(self, modelo, revisao, nome):
        if (not re.fullmatch(r'[1-9][0-9]{0,14}', modelo)
                or not re.fullmatch('[a-f0-9]{64}', revisao)
                or not re.fullmatch(r'frente|verso|recurso_\d+', nome)):
            raise ValueError('Recurso inválido.')
        # O leitor confere tamanho e hash dos bytes retornados. Nunca busca web.
        return self.servico.local.ler_recurso(self.servico.empresa, modelo, revisao, nome)
