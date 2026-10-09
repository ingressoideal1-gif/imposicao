"""Coleta explícita de fotos/fontes usando a pré-validação do motor, sem imprimir.

Não autoriza offline nem substitui a revisão aprovada. Recebe configuração já
resolvida pelo chamador; não importa app/db nem consulta pedidos por conta própria.
"""
import copy
import hashlib
from pathlib import Path
import shutil
import tempfile
import threading
import urllib.request

from engine import ImpositionEngine
from pacotes_download import SemRedirecionamento, validar_url
from pacotes_locais import (_manifesto, _json, _sem_links, LIMITE_RECURSO_BYTES,
                            LIMITE_TOTAL_BYTES)


class ColetorRecursos:
    def __init__(self, armazenamento, *, host, abrir=None,
                 limite_recurso=LIMITE_RECURSO_BYTES, limite_total=LIMITE_TOTAL_BYTES):
        self.local = armazenamento
        self.host = host
        self.abrir = abrir or urllib.request.build_opener(SemRedirecionamento()).open
        if not 0 < limite_recurso <= limite_total:
            raise ValueError('Limites de coleta inválidos.')
        self.limite_recurso, self.limite_total = limite_recurso, limite_total

    def preparar(self, manifesto, config, *, checkpoint=lambda: None):
        controle = checkpoint
        interrupcao = []
        def checkpoint():
            try:
                controle()
            except Exception as erro:
                interrupcao.append(erro)
                raise
        entrada = _manifesto(manifesto)
        # Também compara o manifesto imutável recebido com o índice local.
        if self.local.consultar(entrada['empresa'], entrada['modelo'], entrada['revisao'],
                                checkpoint=checkpoint)['estado'] != 'local_validado':
            raise ValueError('Entrada local não validada.')
        self.local.preparar(entrada, {}, checkpoint=checkpoint)
        cfg = copy.copy(config)
        for chave in ('elements', 'multi_artes', 'csv_data'):
            setattr(cfg, chave, copy.deepcopy(getattr(config, chave)))
        contexto = {k: getattr(cfg, k) for k in
                    ('elements', 'multi_artes', 'csv_data', 'total_items', 'item_w', 'item_h')}
        # Snapshot anterior à incorporação transitória das fontes pelo motor.
        contexto = copy.deepcopy(contexto)
        area = self.local.raiz / 'coleta'
        _sem_links(area)
        area.mkdir(parents=True, exist_ok=True)
        mapa, infos, fontes, criados = {}, {}, {}, []
        total = 0
        lock = threading.RLock()

        def coletar(origem):
            nonlocal total
            # O aquecimento do motor pode chamar em paralelo. Não duplicar URL
            # nem ultrapassar o orçamento somando downloads concorrentes.
            with lock:
                checkpoint()
                if origem in mapa:
                    return fontes[mapa[origem]].read_bytes()
                validar_url(origem, self.host)  # nunca abrir caminho local vindo dos dados
                if len(mapa) >= 4096:
                    raise ValueError('Limite de dependências atingido.')
                nome = 'motor_' + hashlib.sha256(origem.encode('utf-8')).hexdigest()
                if nome in entrada['arquivos']:
                    raise ValueError('Nome de dependência já utilizado na entrada.')
                limite = min(self.limite_recurso, self.limite_total - total)
                if limite <= 0:
                    raise ValueError('Limite total de coleta atingido.')
                if shutil.disk_usage(area).free < 2 * limite + self.local.reserva_bytes:
                    raise OSError('Espaço insuficiente para coleta.')
                with tempfile.NamedTemporaryFile(dir=area, prefix='recurso-', delete=False) as saida:
                    caminho = Path(saida.name); criados.append(caminho)
                    h, tamanho = hashlib.sha256(), 0
                    req = urllib.request.Request(origem, headers={'User-Agent': 'NewProd-Piloto/1'})
                    with self.abrir(req, timeout=15) as resposta:
                        if getattr(resposta, 'status', 200) != 200:
                            raise ValueError('Resposta incompleta de dependência.')
                        while True:
                            checkpoint()
                            bloco = resposta.read(min(1024 * 1024, limite - tamanho + 1))
                            if not bloco:
                                break
                            tamanho += len(bloco)
                            if tamanho > limite:
                                raise ValueError('Dependência excede orçamento de coleta.')
                            h.update(bloco); saida.write(bloco)
                    if not tamanho:
                        raise ValueError('Dependência vazia.')
                total += tamanho
                mapa[origem] = nome
                fontes[nome] = caminho
                infos[nome] = {'sha256': h.hexdigest(), 'bytes': tamanho}
                return caminho.read_bytes()

        motor = ImpositionEngine(cfg, resolver_recurso=coletar)
        try:
            checkpoint()
            motor._conferir_e_aquecer_fotos()
            motor._preparar_elementos_obrigatorios()
            # Artes devem vir da entrada conferida; não aceitar outra URL
            # desconhecida sem o contrato das faces/materialização.
            if any(a.get('pdf_url') or a.get('pdf_verso_url') for a in cfg.multi_artes):
                raise ValueError('Artes devem estar capturadas antes da coleta.')
            derivado = copy.deepcopy(entrada)
            derivado['arquivos'].update(infos)
            derivado['configuracao'].update(
                recursos_motor={**entrada['configuracao'].get('recursos_motor', {}), **mapa},
                contexto_recursos_motor=contexto,
                revisao_entrada=entrada['revisao'], preparacao_completa=False,
                coleta_fotos_fontes=True)
            # A coleta cria outra revisão, sem modificar a entrada ou alegar
            # completude de pool QR, ICC, fontes da estação e aprovação.
            derivado['revisao'] = hashlib.sha256(_json({
                'configuracao': derivado['configuracao'], 'arquivos': derivado['arquivos']
            }).encode('utf-8')).hexdigest()
            checkpoint()
            if self.local.preparar(derivado, fontes, checkpoint=checkpoint)['estado'] != 'local_validado':
                raise ValueError('Coleta não validada após persistência.')
            return derivado
        except Exception:
            # Validação de foto envolve erros em ValueError; preservar o sinal
            # de encerramento para a fila marcar interrompido, não download ruim.
            if interrupcao:
                raise interrupcao[0] from None
            raise
        finally:
            motor._fechar_fontes_temporarias()
            motor._url_cache.close()
            for caminho in criados:
                if caminho.exists():
                    caminho.unlink()
