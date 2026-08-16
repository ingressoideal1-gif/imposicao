# -*- coding: utf-8 -*-
"""
Configuração central de segurança — compartilhada pelo backend na nuvem (Render)
e pelo agente local (NewProd.exe / local_print_agent.py).

Fica em um módulo único porque app.py e local_print_agent.py implementam os
mesmos endpoints separadamente; sem isto, uma correção aplicada em um dos
arquivos silenciosamente não vale para o outro.
"""

import os
from urllib.parse import urlparse

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Origens fixas em uso hoje. As chamadas do frontend para /api/* passam tanto
# direto no Render (cross-origin) quanto pelo rewrite do Vercel (same-origin).
ALLOWED_ORIGINS = [
    "https://ideal-imposition.vercel.app",
    "https://imposicao.vercel.app",
    "https://imposicao.onrender.com",
]

# Cobre os deploys de preview do Vercel (URL dinâmica por branch) e o
# desenvolvimento local em qualquer porta.
ALLOWED_ORIGIN_REGEX = (
    r"https://(ideal-imposition|imposicao)(-[a-z0-9-]+)?\.vercel\.app"
    r"|http://(localhost|127\.0\.0\.1)(:\d+)?"
)


# ─── Auto-atualização do agente local ─────────────────────────────────────────
# Modelo pull: o agente consulta este manifesto sozinho, num endereço fixo
# compilado no binário. Nada externo escolhe o que ele baixa — foi justamente
# a URL vinda de fora que tornava o /api/update uma porta de execução remota.
#
# A URL do projeto fica literal de propósito: se viesse de variável de
# ambiente, quem controlasse o ambiente controlaria a origem da atualização.
SUPABASE_PROJETO = "https://vwbtitjlpelrcnsytzqw.supabase.co"
RELEASES_BASE_URL = f"{SUPABASE_PROJETO}/storage/v1/object/public/agent-releases/"
MANIFEST_URL = RELEASES_BASE_URL + "latest.json"


def is_allowed_release_url(url: str) -> bool:
    """Confere que o instalador apontado pelo manifesto está no nosso bucket.

    Segunda barreira: mesmo que o manifesto seja adulterado, o download só
    acontece se continuar dentro de agent-releases.
    """
    return (url or "").lower().startswith(RELEASES_BASE_URL.lower())


# ─── Painel servido pelo agente ───────────────────────────────────────────────
# O painel embutido no executável envelhecia a cada publicação do site, e
# atualizá-lo custava um release de agente por vez. Agora o agente baixa os
# arquivos do painel desta origem e serve a cópia local.
#
# ISSO NÃO MOVE A IMPOSIÇÃO PARA A NUVEM. Quem decide o motor é o
# supabase-config.js, em tempo de execução, pela porta da página:
#
#     const isPort9000 = window.location.port === "9000";
#     const API_BASE_URL = (isLocalhost || isPort9000) ? "" : "https://imposicao.onrender.com";
#
# Servido pelo agente na 9000, API_BASE_URL fica vazio e o motor é o da própria
# máquina. Baixar o arquivo da nuvem não altera essa decisão.
#
# Origem literal pelo mesmo motivo do manifesto: vinda de fora, quem controlasse
# o ambiente controlaria o código que roda na estação.
PAINEL_BASE_URL = "https://imposicao.vercel.app"

# Só o que a estação precisa. As fontes (fonts_local) ficam de fora: são ~140 MB
# e já têm o próprio sincronismo, pelo Storage.
#
# A REGRA: todo arquivo local que index.html, producao.html ou cliente.html
# carregam tem de estar aqui. Arquivo de fora desta lista nunca se atualiza na
# estação — o `_semear_painel` do app.py o copia da cópia embutida e a
# sincronização não o baixa. Se ele nasceu depois do build do agente, dá 404; se
# mudou depois, fica congelado, e o `?v=NNN` do HTML ainda por cima anuncia a
# versão nova. Foi assim que o `amostra-modal.js` passou a dar 404 em toda
# estação e o `csv-editor.js` ficou três releases atrás sem ninguém notar.
# `tests/test_painel_estacao.py` compara esta lista com o que o HTML pede.
PAINEL_ARQUIVOS = [
    "index.html",
    "producao.html",
    "cliente.html",
    "evento.html",
    "evento.js",
    "acesso-conta.js",
    "controle.html",
    "controle.js",
    "controle.css",
    "ideal-control.js",
    "script.js",
    "pedido.js",
    "cliente.js",
    "criador-arte.js",
    "cor-numeracao-do-modelo.js",
    "arte-de-impressao.js",
    "qr-canvas.js",
    "qr-ideal-colunas.js",
    "qr-ideal-hash.js",
    "fonte-canvas.js",
    "fonte-nome.js",
    "csv-editor.js",
    "texto-ajuste.js",
    "foto-lib.js",
    "gerenciador-fotos.js",
    "editor-foto.js",
    "amostra-modal.js",
    "mapas.js",
    "supabase-config.js",
    "pdf-lib.min.js",
    # Vendorizados em 16/08/2026, quando sairam do CDN: sem eles aqui, a
    # estacao serviria uma tela que referencia arquivo que ela nao tem, e a
    # pagina abriria quebrada SO na maquina da grafica.
    "supabase-js.min.js",
    "qrcode-generator.min.js",
    # A camera do "+ Novo Evento" da casa do Ideal Control. Ela e a MESMA da
    # portaria -- um segundo leitor herdaria os defeitos que o primeiro ja
    # corrigiu -- e por isso `jsqr.min.js` e `portaria-camera.js` entram aqui
    # mesmo a estacao nao servindo a tela do portao.
    "jsqr.min.js",
    "portaria-camera.js",
    "ler-qr.js",
    "instalar.js",
    "sw-registro.js",
    "style.css",
]


# ─── Proxy de arquivos (/api/proxy) ───────────────────────────────────────────
# Usado como fallback para buscar PDFs quando o fetch direto falha por CORS.
# Na prática só aponta para o Storage do Supabase.
PROXY_ALLOWED_HOST_SUFFIXES = (".supabase.co", ".supabase.in")

# Legado do Firebase: 3 elementos em producao_numeracoes.elements[].pdf_content
# ainda apontam para o bucket antigo (numerações "87x54 - Amostra", "- Ovaide" e
# "- Registro") e os PDFs seguem online. Liberado apenas o bucket do projeto,
# não o host inteiro. Remover quando esses registros forem migrados.
PROXY_ALLOWED_LEGACY_PREFIXES = (
    "https://firebasestorage.googleapis.com/v0/b/ideal-arte-e64f6.firebasestorage.app/",
)


def is_allowed_proxy_url(url: str) -> bool:
    """Aceita http(s) do Storage do Supabase e o bucket legado do Firebase."""
    try:
        parsed = urlparse(url or "")
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if any(host.endswith(suffix) for suffix in PROXY_ALLOWED_HOST_SUFFIXES):
        return True
    return (url or "").lower().startswith(PROXY_ALLOWED_LEGACY_PREFIXES)


# ─── Contexto de execução ─────────────────────────────────────────────────────
def is_cloud_runtime() -> bool:
    """True quando rodando no Render.

    O mesmo app.py serve a nuvem e o agente da gráfica. Na nuvem o deploy é
    feito por git, então a auto-atualização não tem uso legítimo e fica off.
    """
    return bool(os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID"))
