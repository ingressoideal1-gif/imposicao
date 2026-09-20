"""Ponte da estação para pedidos, cadastros, pagamentos e fundo do PWA.

Não importa db nem lê configurações ao carregar o módulo. A Edge Function
revalida operador ativo/permissões, além de autenticar o agente.
"""
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

router = APIRouter()


def _encaminhar(acao, codigo, corpo, recurso="propostas"):
    if recurso not in ("propostas", "fundo"):
        raise HTTPException(404, "Recurso inexistente")
    import acesso_local
    import acesso_publicacao

    codigo = str(codigo or "").strip().upper()
    if not codigo or not acesso_local.validar(codigo):
        raise HTTPException(401, "Operador local invalido")
    segredo = acesso_publicacao._segredo()
    if not segredo:
        raise HTTPException(503, "Canal autenticado da estacao indisponivel")
    req = urllib.request.Request(
        f"{acesso_publicacao._base()}/api/acesso/{recurso}/{acao}",
        data=json.dumps(corpo).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "X-Agente-Segredo": segredo,
                 "X-Operador-Codigo": codigo},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Não expor corpo remoto arbitrário, headers ou credenciais nos logs.
        mensagens = {401: "Operador local invalido", 403: "Sem permissao para esta operacao",
                     409: "A gravacao nao foi confirmada", 422: "Solicitacao de pedido invalida"}
        raise HTTPException(exc.code if exc.code in mensagens else 503,
                            mensagens.get(exc.code, "Nao foi possivel consultar o servico de pedidos")) from None
    except (OSError, ValueError):
        raise HTTPException(503, "Servico de pedidos indisponivel") from None


@router.post("/api/fundo/{acao}")
@router.post("/api/propostas/{acao}")
async def propostas_da_estacao(acao: str, request: Request):
    recurso = "fundo" if request.url.path.startswith("/api/fundo/") else "propostas"
    acoes = ("publicar", "remover") if recurso == "fundo" else ("consultar", "status", "cadastro", "pagamentos")
    if acao not in acoes:
        raise HTTPException(404, "Operacao inexistente")
    codigo = request.headers.get("x-operador-codigo")
    if not codigo:
        raise HTTPException(401, "Identifique o operador local")
    raw = await request.body()
    if len(raw) > 32768:
        raise HTTPException(413, "Solicitacao muito grande")
    try:
        corpo = json.loads(raw)
    except (ValueError, UnicodeError):
        raise HTTPException(422, "JSON invalido") from None
    if not isinstance(corpo, dict):
        raise HTTPException(422, "Esperava um objeto JSON")
    if recurso == "fundo":
        return await run_in_threadpool(_encaminhar, acao, codigo, corpo, recurso)
    return await run_in_threadpool(_encaminhar, acao, codigo, corpo)
