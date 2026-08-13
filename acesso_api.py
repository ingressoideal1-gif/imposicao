# -*- coding: utf-8 -*-
"""Controle de acesso: o único caminho até as tabelas `producao_acesso_*`.

Arquivo separado do `app.py` de propósito. Tudo que usa a `service_role` mora
aqui, num arquivo que dá para ler inteiro de uma vez — se um dia alguém precisar
auditar quem tem a chave-mestra do banco na mão, é este e só este.

## Por que a chave-mestra, e não a anônima

As sete tabelas do controle de acesso nasceram com RLS ligado e **zero
políticas** (ver `sql/schema_acesso.sql`). Com a chave anônima não se lê nem se
escreve uma linha delas. Isso é o desenho, não um descuido: elas guardam quem
entrou no evento do cliente e o hash de todo ingresso impresso, e nenhuma tela
fala com elas diretamente.

Escrever com a anônima não daria um erro claro — daria zero linhas na leitura e
recusa na escrita, no meio da publicação de uma faixa, com o papel já impresso.
Por isso `supabase()` recusa alto e cedo quando a chave não está configurada.

## Por que a chave NÃO vai para as estações

O `NewProd.exe` embute todo o Python do projeto, este arquivo incluído — mas não
a variável de ambiente. É deliberado: a `service_role` abre o banco inteiro,
incluindo cliente, proposta e financeiro do parceiro Vibecode, e o agente não
tem autenticação de verdade hoje (o `AGENT_ID` é um UUID em arquivo local, que
qualquer um forjaria). Distribuir a chave-mestra em cada estação seria bem pior
do que a chave anônima que já circula.

O agente publica a faixa de códigos falando com o Render por HTTPS. A chave fica
lá, num lugar só.

Consequência prática: onde não há chave, `disponivel()` é falso e o `app.py` não
monta este router. A estação simplesmente não serve `/api/acesso/*` — melhor do
que servir endpoints que respondem 503 a tudo e confundem quem for diagnosticar.
"""

import json
import os
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException

import db

router = APIRouter(prefix="/api/acesso", tags=["acesso"])

CHAVE_ENV = "SUPABASE_SERVICE_KEY"

# Ordem: variável de ambiente (Render) primeiro, `.env.local` depois
# (desenvolvimento). Na estação as duas faltam, e é assim que tem de ser.
SERVICE_KEY = os.environ.get(CHAVE_ENV) or db.ler_env_local(CHAVE_ENV)

TIMEOUT = 60


def disponivel() -> bool:
    """Se este servidor pode falar com as tabelas do controle de acesso."""
    return bool(SERVICE_KEY)


def supabase(method: str, path: str, body=None, prefer: str | None = None):
    """REST do Supabase com a `service_role`. Não usar fora do controle de acesso.

    `path` é o caminho depois de `/rest/v1/`, com o filtro do PostgREST junto —
    por exemplo `producao_acesso_pedidos?pedido_id_int=eq.20272&select=*`.
    """
    if not SERVICE_KEY:
        raise RuntimeError(
            f"{CHAVE_ENV} nao configurada. O controle de acesso nao fala com o "
            "banco pela chave anonima: as tabelas estao com RLS ligado e sem "
            "politica, entao a leitura viria vazia e a escrita seria recusada."
        )

    url = f"{db.SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    elif method in ("POST", "PATCH"):
        headers["Prefer"] = "return=representation"

    dados = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, headers=headers, method=method, data=dados)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            conteudo = resp.read().decode("utf-8")
            return json.loads(conteudo) if conteudo else None
    except urllib.error.HTTPError as e:
        # O corpo do erro do PostgREST diz o que houve (constraint violada,
        # coluna inexistente). Sem ele, sobra só "HTTP 400" e uma investigacao.
        detalhe = ""
        try:
            detalhe = e.read().decode("utf-8")[:400]
        except Exception:
            pass
        raise RuntimeError(f"Supabase {method} {path}: HTTP {e.code} {detalhe}") from e


@router.get("/saude")
def saude():
    """Diz se este servidor consegue mesmo falar com as tabelas.

    Existe para a estação e o Render darem respostas diferentes e óbvias quando
    alguém for diagnosticar por que uma publicação não chegou.
    """
    if not disponivel():
        raise HTTPException(
            status_code=503,
            detail=f"{CHAVE_ENV} nao configurada neste servidor",
        )
    try:
        supabase("GET", "producao_acesso_pedidos?select=id&limit=1")
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:300])
    return {"ok": True}
