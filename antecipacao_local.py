"""Pré-cópia de recursos observados online; nunca constitui pacote aprovado."""
from copy import deepcopy
import hashlib
import json
import shutil
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from pacotes_download import validar_url, SemRedirecionamento
from pacotes_locais import (_sem_links, LIMITE_RECURSO_BYTES, LIMITE_TOTAL_BYTES,
                            LimiteRecursoExcedido)


def _etag_forte(valor):
    return (isinstance(valor, str) and 2 <= len(valor) <= 1024
            and valor.startswith('"') and valor.endswith('"')
            and all(32 <= ord(c) < 127 for c in valor))


class AntecipadorRecursos:
    def __init__(self, integrado, local, host, obter, salvar, abrir=None, *, relogio=time.monotonic, intervalo=300,
                 versoes_fontes=None, recursos_anteriores=None):
        self.integrado, self.local, self.host = integrado, local, host
        self.obter, self.salvar = obter, salvar
        self.abrir = abrir or urllib.request.build_opener(SemRedirecionamento()).open
        self.relogio, self.intervalo = relogio, intervalo
        self._revalidar = {}
        self._atualizar_ao_abrir = set()
        self.somente_ao_abrir = False
        self.versoes_fontes = versoes_fontes
        self.recursos_anteriores = recursos_anteriores or {}

    @property
    def habilitado(self):
        return self.local.habilitado

    def preparar(self, manifesto, fontes, *, checkpoint=None):
        if manifesto['configuracao'].get('tipo') != 'antecipacao_online':
            return self.integrado.preparar(manifesto, fontes, checkpoint=checkpoint)
        checkpoint = checkpoint or (lambda: None)
        anterior = self.obter(manifesto)
        chave = (manifesto['empresa'], manifesto['modelo'], manifesto['revisao'])
        agora = self.relogio()
        reutilizavel = False
        if anterior:
            if (anterior['empresa'], anterior['modelo'], anterior['configuracao'].get('revisao_entrada')) != (
                    manifesto['empresa'], manifesto['modelo'], manifesto['revisao']):
                raise ValueError('Antecipação pertence a outra entrada.')
            resultado = self.local.consultar(anterior['empresa'], anterior['modelo'], anterior['revisao'], checkpoint=checkpoint)
            if resultado['estado'] == 'local_validado':
                resultado = self.local.preparar(anterior, {}, checkpoint=checkpoint)
                reutilizavel = True
                # Reinício preserva o uso da cópia; não alega conferência online.
                self._revalidar.setdefault(chave, agora + self.intervalo)
                if (self.somente_ao_abrir and chave not in self._atualizar_ao_abrir) or (not self.somente_ao_abrir and agora < self._revalidar[chave]):
                    return dict(resultado, antecipacao=True, revisao_recursos=anterior['revisao'])
        area = self.local.raiz / 'antecipacao'
        _sem_links(area)
        area.mkdir(parents=True, exist_ok=True)
        arquivos = {'frente': None, 'verso': None}
        caminhos, criados, total = {}, [], 0
        validadores = {}
        try:
            for nome, url in manifesto['configuracao']['fontes'].items():
                checkpoint()
                validar_url(url, self.host)
                if shutil.disk_usage(area).free < self.local.reserva_bytes + 2 * LIMITE_RECURSO_BYTES:
                    raise OSError('Reserva de disco insuficiente.')
                reuso = self.recursos_anteriores.get(nome)
                if reuso:
                    info, etag_reuso = reuso
                    total += info['bytes']
                    if total > LIMITE_TOTAL_BYTES:
                        raise LimiteRecursoExcedido(total, LIMITE_TOTAL_BYTES, manifesto['modelo'], 'conjunto')
                    arquivos[nome] = deepcopy(info)
                    validadores[nome] = etag_reuso
                    continue
                antigo = anterior['configuracao'].get('validadores_http', {}).get(nome) if reutilizavel else None
                versao = (self.versoes_fontes or {}).get(nome)
                if versao and _etag_forte(antigo) and antigo.strip('"') == versao['etag'].strip('"'):
                    # A copia anterior acabou de passar pelo SHA local acima;
                    # o validador forte coincide com o snapshot atual do Storage.
                    arquivos[nome] = deepcopy(anterior['arquivos'][nome])
                    validadores[nome] = antigo
                    continue
                # Revalidacao legada para URLs sem versao verificavel.
                headers = {'If-None-Match': antigo} if _etag_forte(antigo) and not versao else {}
                endereco = url
                if versao:
                    partes = urllib.parse.urlsplit(url)
                    query = urllib.parse.parse_qsl(partes.query,keep_blank_values=True)
                    query.append(('piloto_revisao',versao['revisao']))
                    endereco = urllib.parse.urlunsplit(partes._replace(query=urllib.parse.urlencode(query)))
                    headers['Cache-Control'] = 'no-cache'
                try:
                    resposta = self.abrir(urllib.request.Request(endereco, headers=headers), timeout=15)
                except urllib.error.HTTPError as erro:
                    if erro.code != 304 or not headers:
                        erro.close()
                        raise
                    erro.close()
                    arquivos[nome] = deepcopy(anterior['arquivos'][nome])
                    validadores[nome] = antigo
                    continue
                with resposta:
                    if getattr(resposta, 'status', 200) == 304 and headers:
                        arquivos[nome] = deepcopy(anterior['arquivos'][nome])
                        validadores[nome] = antigo
                        continue
                    if getattr(resposta, 'status', 200) != 200:
                        raise ValueError('Recurso remoto incompleto.')
                    declarado = getattr(resposta, 'headers', {}).get('Content-Length', '')
                    if str(declarado).isascii() and str(declarado).isdigit():
                        declarado = int(declarado)
                        if declarado > LIMITE_RECURSO_BYTES:
                            raise LimiteRecursoExcedido(declarado, LIMITE_RECURSO_BYTES, manifesto['modelo'])
                    etag = getattr(resposta, 'headers', {}).get('ETag')
                    if versao and (not isinstance(etag,str) or etag.strip('"') != versao['etag'].strip('"')):
                        raise ValueError('Versao do arquivo nao corresponde ao Storage.')
                    if _etag_forte(etag):
                        validadores[nome] = etag
                    with tempfile.NamedTemporaryFile(dir=area, delete=False) as destino:
                        caminho = Path(destino.name)
                        criados.append(caminho)
                        tamanho, digest = 0, hashlib.sha256()
                        while True:
                            checkpoint()
                            bloco = resposta.read(1024 * 1024)
                            if not bloco:
                                break
                            tamanho += len(bloco)
                            total += len(bloco)
                            if tamanho > LIMITE_RECURSO_BYTES:
                                raise LimiteRecursoExcedido(tamanho, LIMITE_RECURSO_BYTES, manifesto['modelo'])
                            if total > LIMITE_TOTAL_BYTES:
                                raise LimiteRecursoExcedido(total, LIMITE_TOTAL_BYTES, manifesto['modelo'], 'conjunto')
                            if shutil.disk_usage(area).free < self.local.reserva_bytes + 2 * len(bloco):
                                raise OSError('Reserva de disco insuficiente durante a cópia.')
                            digest.update(bloco)
                            destino.write(bloco)
                        if not tamanho:
                            raise ValueError('Recurso vazio.')
                arquivos[nome] = {'sha256': digest.hexdigest(), 'bytes': tamanho}
                caminhos[nome] = caminho
            derivado = deepcopy(manifesto)
            derivado['arquivos'] = arquivos
            derivado['configuracao']['tipo'] = 'recursos_antecipados'
            derivado['configuracao']['revisao_entrada'] = manifesto['revisao']
            derivado['configuracao']['validadores_http'] = validadores
            derivado['revisao'] = hashlib.sha256(json.dumps(derivado, sort_keys=True,
                ensure_ascii=False, allow_nan=False).encode()).hexdigest()
            resultado = self.local.preparar(derivado, caminhos, checkpoint=checkpoint)
            if resultado['estado'] != 'local_validado':
                raise ValueError('Antecipação não validada.')
            self.salvar(manifesto, derivado)
            self._atualizar_ao_abrir.discard(chave)
            self._revalidar[chave] = self.relogio() + self.intervalo
            while len(self._revalidar) > 256:
                del self._revalidar[next(iter(self._revalidar))]
            return dict(resultado, antecipacao=True, revisao_recursos=derivado['revisao'])
        finally:
            for caminho in criados:
                caminho.unlink(missing_ok=True)
