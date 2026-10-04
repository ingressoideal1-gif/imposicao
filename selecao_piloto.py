"""Conferência explícita de seleção e leitura dos recursos persistidos no piloto."""
import re
import threading
from concurrent.futures import ThreadPoolExecutor

from antecipacao_local import AntecipadorRecursos
from conferencia_piloto import ConferenciaIndisponivel


class SelecaoPiloto:
    def __init__(self, servico):
        self.servico = servico
        self._lock = threading.Lock()

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

    def _preparar_item(self, dados, item):
        s = self.servico
        cliente = s.coleta_autonoma.cliente
        if not item or item['observacao']['digest'] != dados['digest']:
            raise ConferenciaIndisponivel('O modelo mudou ou não está disponível. Selecione novamente.')
        if not item['fontes'].get('frente'):
            raise ConferenciaIndisponivel('Arte de frente ainda não disponível para preparação local.')
        resposta = s.antecipar(item, _conferidor=lambda i, _: cliente.conferir(i))
        entrada = next(i['manifesto'] for i in s.catalogo()
                       if i['manifesto']['modelo'] == dados['modelo']
                       and i['manifesto']['revisao'] == resposta['revisao'])
        anterior = s.obter_coleta(entrada)
        # Instância dedicada: sem herdar a dispensa de atualização do coletor
        # ocioso. URLs iguais também são revalidadas (ETag ou download).
        preparador = AntecipadorRecursos(None, s.local, s.host, s.obter_coleta, s.salvar_coleta,
                                         abrir=s.preparador.armazenamento.abrir, intervalo=0)
        preparador.preparar(entrada, {})
        atual = s.obter_coleta(entrada)
        cliente.conferir(item)  # mudança durante download não libera a seleção
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

    def ler(self, modelo, revisao, nome):
        if (not re.fullmatch(r'[1-9][0-9]{0,14}', modelo)
                or not re.fullmatch('[a-f0-9]{64}', revisao)
                or not re.fullmatch(r'frente|verso|recurso_\d+', nome)):
            raise ValueError('Recurso inválido.')
        # O leitor confere tamanho e hash dos bytes retornados. Nunca busca web.
        return self.servico.local.ler_recurso(self.servico.empresa, modelo, revisao, nome)
