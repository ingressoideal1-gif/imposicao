"""Recursos do pedido conferido no motor real; ativação exclusiva do Piloto."""
import re
import urllib.request
from pathlib import Path
from pacotes_download import validar_url, SemRedirecionamento


def resolver_do_pedido(servico, referencias):
    if (not isinstance(referencias, list) or not 1 <= len(referencias) <= 128):
        raise ValueError('Referências locais inválidas.')
    mapa = {}
    for ref in referencias:
        if (not isinstance(ref, dict) or set(ref) != {'modelo', 'revisao'}
                or not isinstance(ref['modelo'], str) or not isinstance(ref['revisao'], str)
                or not re.fullmatch(r'[1-9][0-9]{0,14}', ref['modelo'])
                or not re.fullmatch('[a-f0-9]{64}', ref['revisao'])):
            raise ValueError('Revisão local inválida.')
        m = servico.manifesto_coletado(ref['modelo'], ref['revisao'])
        if not m or servico.local.consultar(servico.empresa, ref['modelo'], ref['revisao'])['estado'] != 'local_validado':
            raise ValueError('Pedido local ausente ou alterado. Reabra o pedido.')
        for nome, origem in m['configuracao'].get('fontes', {}).items():
            info = m['arquivos'].get(nome)
            if not info:
                raise ValueError('Recurso do pedido incompleto.')
            if origem in mapa and mapa[origem][2] != info['sha256']:
                raise ValueError('Modelos usam revisões diferentes do mesmo recurso.')
            mapa[origem] = (ref, nome, info['sha256'])
    # Dependências fora do catálogo do pedido ainda exigem rede, antes da
    # entrega. O motor mantém seu cache por trabalho; uma falha nunca troca
    # um recurso local corrompido por uma cópia online silenciosamente.
    abrir = urllib.request.build_opener(SemRedirecionamento()).open
    def resolver(origem):
        if origem in mapa:
            ref, nome, _ = mapa[origem]
            return servico.local.ler_recurso(servico.empresa, ref['modelo'], ref['revisao'], nome)
        # O fluxo existente admite fotos apontadas pelo operador no disco.
        # Preservar esse caso, sem interpretar URL remota como caminho.
        if not origem.lower().startswith(('http:', 'https:')):
            if origem.lower().startswith(('data:', 'blob:', 'file:')):
                raise ValueError('Origem de dependência não suportada.')
            with Path(origem).open('rb') as entrada:
                dados = entrada.read(64 * 1024 * 1024 + 1)
            if not dados or len(dados) > 64 * 1024 * 1024:
                raise ValueError('Dependência local excede limite.')
            return dados
        validar_url(origem, servico.host)
        with abrir(urllib.request.Request(origem, headers={'User-Agent':'NewProd-Piloto/1'}), timeout=15) as r:
            if getattr(r, 'status', 200) != 200:
                raise ValueError('Dependência remota incompleta.')
            dados = r.read(64 * 1024 * 1024 + 1)
        if not dados or len(dados) > 64 * 1024 * 1024:
            raise ValueError('Dependência excede o limite do Piloto.')
        return dados
    return resolver
