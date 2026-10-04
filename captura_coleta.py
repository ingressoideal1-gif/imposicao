"""Ponte entre entrada capturada e coleta em ociosidade; não gera impressão."""
from contextlib import contextmanager, ExitStack
import copy
import csv
import hashlib
import io

from engine import ImpositionConfig
from pacotes_locais import _sem_links


class ConfiguracaoPendente(ValueError):
    pass


@contextmanager
def config_da_captura(local, manifesto):
    cfg = manifesto['configuracao']
    dados = copy.deepcopy(cfg.get('dados'))
    if not isinstance(dados, dict) or not isinstance(dados.get('formato'), dict) or not isinstance(dados.get('saida'), dict):
        raise ConfiguracaoPendente('configuracao_ausente')
    if dados.get('mapa_teatro_id'):
        # O endpoint normal resolve esse mapa no banco; o worker não pode consultar
        # banco real implicitamente ou inventar os assentos durante uma coleta.
        raise ConfiguracaoPendente('mapa_teatro_nao_capturado')
    nums = [dados.get('numeracao'), dados.get('numeracao_2')]
    artes = dados.get('multi_artes') or []
    for alvo in [dados, *artes]:
        if alvo.get('local_path') or alvo.get('local_verso_path') or alvo.get('pdf_url') or alvo.get('pdf_verso_url'):
            raise ConfiguracaoPendente('arte_fora_da_captura')
    for arte in artes:
        nums.extend([arte.get('numeracao'), arte.get('numeracao_2')])
    for num in nums:
        for el in (num or {}).get('elements', []):
            if str(el.get('font_name', '')).startswith('system:') and not (
                    el.get('_font_data') or el.get('arquivo_url') or el.get('font_url')):
                raise ConfiguracaoPendente('fonte_do_sistema_nao_capturada')
    linhas = (dados.get('numeracao') or {}).get('csv_data')
    campos = cfg.get('campos', {})
    csv_nome = next((k for k, v in campos.items() if v == 'csv_file'), None)
    if csv_nome:
        info = manifesto['arquivos'][csv_nome]
        caminho = local._pasta(manifesto['empresa']) / 'objetos' / info['sha256']
        _sem_links(caminho)
        with caminho.open('rb') as f:
            conteudo = f.read(info['bytes'] + 1)
        if len(conteudo) != info['bytes'] or hashlib.sha256(conteudo).hexdigest() != info['sha256']:
            raise ValueError('CSV capturado alterado.')
        try:
            texto = conteudo.decode('utf-8-sig')
        except UnicodeDecodeError:
            texto = conteudo.decode('latin-1')
        linhas = list(csv.DictReader(io.StringIO(texto)))
    # Materializar PDF apenas quando o construtor realmente conta suas páginas.
    # Não produzir arquivo de saída nem adivinhar páginas pelo número do pedido.
    with ExitStack() as pilha:
        base = None
        if dados.get('schema') == 'pdf_multiple':
            if not manifesto['arquivos'].get('frente'):
                raise ConfiguracaoPendente('pdf_paginado_ausente')
            base = str(pilha.enter_context(local.pdf_para_motor(
                manifesto['empresa'], manifesto['modelo'], manifesto['revisao'])))
        mode = dados.get('print_mode', 'front')
        if artes and mode == 'front' and any(v.startswith('ma_verso_') for v in campos.values()):
            mode = 'duplex'
        chaves = ('seq_start', 'seq_end', 'seq_increment', 'pdf_expected_items', 'rotate_page',
                  'cut_stack_mode', 'sheets_per_block', 'block_depth', 'c_ini', 'q_cam', 'l_cam',
                  'refazer_de', 'refazer_ate', 'refazer_set', 'refazer_celulas', 'refazer_repetir',
                  'pedido', 'modelo', 'arte_escala_h', 'arte_escala_v')
        argumentos = {k: dados[k] for k in chaves if k in dados}
        yield ImpositionConfig(base_file=base, out_pdf='', formato=dados['formato'],
            saida=dados['saida'], numeracao=dados.get('numeracao'), numeracao_2=dados.get('numeracao_2'),
            csv_data=linhas, multi_artes=artes, print_mode=mode,
            layout_schema=dados.get('schema', 'sequential'), **argumentos)


class PreparacaoComColeta:
    def __init__(self, download, coletor, obter, salvar):
        self.download, self.coletor = download, coletor
        self.obter, self.salvar = obter, salvar

    @property
    def habilitado(self):
        return self.download.habilitado

    def preparar(self, manifesto, fontes, *, checkpoint=None):
        checkpoint = checkpoint or (lambda: None)
        resultado = self.download.preparar(manifesto, fontes, checkpoint=checkpoint)
        if resultado['estado'] != 'local_validado':
            raise ValueError('Entrada não validada após preparação.')
        if manifesto['configuracao'].get('tipo') != 'entrada_online':
            return resultado
        derivado = self.obter(manifesto)
        local = self.download.local
        if derivado and ((derivado['empresa'], derivado['modelo']) != (manifesto['empresa'], manifesto['modelo'])
                         or derivado['configuracao'].get('revisao_entrada') != manifesto['revisao']):
            raise ValueError('Coleta não pertence à entrada.')
        if derivado and local.consultar(derivado['empresa'], derivado['modelo'], derivado['revisao'],
                                        checkpoint=checkpoint)['estado'] == 'local_validado':
            if local.preparar(derivado, {}, checkpoint=checkpoint)['estado'] != 'local_validado':
                raise ValueError('Manifesto da coleta não validado.')
            resultado.update(coleta_fotos_fontes=True, revisao_recursos=derivado['revisao'])
            return resultado
        try:
            with config_da_captura(local, manifesto) as config:
                derivado = self.coletor.preparar(manifesto, config, checkpoint=checkpoint)
        except ConfiguracaoPendente as erro:
            resultado.update(coleta_fotos_fontes=False, motivo_coleta=str(erro))
            return resultado
        checkpoint()
        self.salvar(manifesto, derivado)
        resultado.update(coleta_fotos_fontes=True, revisao_recursos=derivado['revisao'])
        return resultado
