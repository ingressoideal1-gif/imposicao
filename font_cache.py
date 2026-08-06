# -*- coding: utf-8 -*-
"""
Cache local das fontes baixadas do Storage.

As 222 fontes do catalogo deixaram de ser empacotadas no agente (o instalador
caiu de ~125 MB para ~47 MB) e passaram a ser servidas pelo Supabase. Sem cache,
uma queda de internet impediria a imposicao de qualquer arte que use essas
fontes — antes isso funcionava offline, porque os arquivos estavam em disco.

Com o cache, cada fonte e baixada uma unica vez por maquina e reutilizada do
disco nas proximas imposicoes.
"""

import hashlib
import os
import tempfile
import urllib.request

_TIMEOUT = 20


def _pasta_cache() -> str:
    """%LOCALAPPDATA%\\NewProd Agent\\fonts_cache no Windows; temp como reserva.

    O agente instala em modo perUser, entao LOCALAPPDATA sempre existe na
    estacao. Na nuvem (Render) cai no temp, que e efemero mas ainda evita
    rebaixar a mesma fonte durante a vida do processo.
    """
    base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    caminho = os.path.join(base, "NewProd Agent", "fonts_cache")
    try:
        os.makedirs(caminho, exist_ok=True)
    except Exception:
        caminho = os.path.join(tempfile.gettempdir(), "newprod_fonts_cache")
        os.makedirs(caminho, exist_ok=True)
    return caminho


def _nome_em_cache(url: str) -> str:
    """Nome derivado do hash da URL — evita colisao e path traversal."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest() + ".fonte"


def obter_bytes(url: str) -> bytes:
    """Devolve os bytes da fonte, do cache quando possivel.

    Ordem: cache em disco -> download -> grava no cache.
    Se o download falhar e nao houver cache, a excecao sobe para quem chamou
    tratar (o app.py registra e cai para Helvetica).
    """
    destino = os.path.join(_pasta_cache(), _nome_em_cache(url))

    if os.path.isfile(destino) and os.path.getsize(destino) > 0:
        try:
            with open(destino, "rb") as f:
                return f.read()
        except Exception:
            pass  # cache ilegivel: segue para o download

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resposta:
        dados = resposta.read()

    # Grava por arquivo temporario + rename: outra requisicao concorrente nunca
    # enxerga um arquivo pela metade.
    try:
        temp = destino + f".{os.getpid()}.tmp"
        with open(temp, "wb") as f:
            f.write(dados)
        os.replace(temp, destino)
    except Exception:
        try:
            if os.path.exists(temp):
                os.remove(temp)
        except Exception:
            pass

    return dados
