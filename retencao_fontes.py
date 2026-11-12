"""Retencao de arquivos descartaveis em raiz exclusiva do agente.

TEMP geral, fonts do aplicativo e Windows/Fonts nunca sao alvos. Nomes
tmp*.ttf e _MEI sem marcador nao comprovam procedencia.
"""
from pathlib import Path
import re
import stat
import time

from font_cache import exclusivo
from newprod_temp import _sem_links

DIAS = 30
LIMITE_BYTES = 512 * 1024 * 1024
MINIMO_SEGUNDOS = 24 * 3600
_FONTE = re.compile(r'[a-f0-9]{64}\.fonte\Z')
_PARCIAL = re.compile(r'[a-f0-9]{64}\.fonte\.[0-9]+\.tmp\Z')


@exclusivo
def limpar(raiz, *, pedidos_pendentes, agora=None, limite=LIMITE_BYTES):
    """Raiz absoluta fonts_cache; somente filhos regulares, sem links.

Chamador deve reservar producao e admissoes antes da chamada. Retem todas
as fontes se houver qualquer pedido/modelo local: fontes de fallback nao
possuem necessariamente URL nos snapshots. Nunca sacrifica offline pelo teto.
"""
    raiz = Path(raiz)
    resultado = dict(bytes_removidos=0, arquivos_removidos=0, erros=0,
                     protegido=bool(pedidos_pendentes), acima_limite=False)
    if not raiz.is_absolute() or raiz.name != 'fonts_cache' or not _sem_links(raiz):
        raise ValueError('Raiz de fontes fora do escopo.')
    if not raiz.exists():
        return resultado
    agora = time.time() if agora is None else agora
    arquivos = []
    # Primeiro inventariar tudo; falha de leitura nao autoriza descarte parcial.
    for caminho in raiz.iterdir():
        if not (_FONTE.fullmatch(caminho.name) or _PARCIAL.fullmatch(caminho.name)):
            continue
        info = caminho.lstat()
        if (not _sem_links(caminho) or not stat.S_ISREG(info.st_mode)
                or info.st_nlink != 1 or caminho.resolve().parent != raiz.resolve()):
            continue
        arquivos.append((info.st_mtime, caminho, info))
    total = sum(i.st_size for _, _, i in arquivos)
    for modificado, caminho, antes in sorted(arquivos):
        idade = agora - modificado
        parcial = bool(_PARCIAL.fullmatch(caminho.name))
        if pedidos_pendentes or idade < MINIMO_SEGUNDOS:
            continue
        if not parcial and idade < DIAS * 86400 and total <= limite:
            continue
        try:
            # Um arquivo substituido ou tocado desde o inventario fica preservado.
            atual = caminho.lstat()
            if (not _sem_links(caminho) or atual != antes
                    or caminho.resolve().parent != raiz.resolve()):
                continue
            caminho.unlink()
            total -= antes.st_size
            resultado['bytes_removidos'] += antes.st_size
            resultado['arquivos_removidos'] += 1
        except OSError:
            resultado['erros'] += 1
    resultado['acima_limite'] = total > limite
    return resultado


def manter(servico):
    """Executado sob as mesmas travas da retencao dos pedidos."""
    agora = time.monotonic()
    if agora < getattr(servico, '_proxima_retencao_fontes', 0):
        return
    from canais_newprod import pasta_local
    from retencao_cache import _tabela
    con = servico._db()
    try:
        pendentes = any(con.execute('SELECT 1 FROM ' + tabela + ' LIMIT 1').fetchone()
                        for tabela in ('catalogo', 'catalogo_arquivo', 'coletas', 'modelos_pedidos'))
        for tabela in ('revisoes_pedidos_piloto', 'offline_faixas', 'offline_confirmacoes'):
            if _tabela(con, tabela):
                filtro = {'offline_faixas': ' WHERE enviado=0',
                          'offline_confirmacoes': " WHERE estado IN ('pendente','manual_pendente','conflito')"}.get(tabela, '')
                pendentes = pendentes or bool(con.execute('SELECT 1 FROM ' + tabela + filtro + ' LIMIT 1').fetchone())
    finally:
        con.close()
    servico.retencao_fontes = limpar(pasta_local() / 'fonts_cache', pedidos_pendentes=pendentes)
    servico._proxima_retencao_fontes = agora + 3600
