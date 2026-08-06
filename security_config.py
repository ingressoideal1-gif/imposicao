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
# O frontend envia sempre a mesma URL fixa (frontend/script.js), então esta
# allowlist não altera o comportamento do botão "Atualizar Agora".
UPDATE_ALLOWED_HOSTS = {
    "ideal-imposition.vercel.app",
    "imposicao.vercel.app",
}


def is_allowed_update_url(url: str) -> bool:
    """Aceita apenas HTTPS, host da nossa distribuição e caminho de executável."""
    try:
        parsed = urlparse(url or "")
    except Exception:
        return False
    return (
        parsed.scheme == "https"
        and (parsed.hostname or "").lower() in UPDATE_ALLOWED_HOSTS
        and parsed.path.lower().endswith(".exe")
    )


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
