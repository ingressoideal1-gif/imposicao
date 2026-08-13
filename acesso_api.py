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

import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request

from fastapi import APIRouter, Header, HTTPException

import db
import qr_ideal

router = APIRouter(prefix="/api/acesso", tags=["acesso"])

CHAVE_ENV = "SUPABASE_SERVICE_KEY"

# Ordem: variável de ambiente (Render) primeiro, `.env.local` depois
# (desenvolvimento). Na estação as duas faltam, e é assim que tem de ser.
SERVICE_KEY = os.environ.get(CHAVE_ENV) or db.ler_env_local(CHAVE_ENV)

# Segredo que o agente apresenta para publicar. Não é a mesma coisa que a
# service_role: este só autoriza a publicar faixa de códigos, e é o único que
# viaja para as estações — ver a seção "O que o segredo do agente protege",
# mais abaixo.
SEGREDO_ENV = "ACESSO_AGENTE_SEGREDO"
AGENTE_SEGREDO = os.environ.get(SEGREDO_ENV) or db.ler_env_local(SEGREDO_ENV)

TIMEOUT = 60

# Lotes maiores estouram o corpo da requisição sem ganhar velocidade: o custo
# está no KDF, que roda na estação, e não na rede.
LOTE_MAXIMO = 500


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


# ─── A publicação da faixa de códigos ─────────────────────────────────────────
#
# O agente chama três endpoints em sequência, sempre DEPOIS que o papel saiu:
#
#   1. abrir       → devolve o sal daquele pedido (sorteado na primeira vez)
#   2. credenciais → envia {modelo_id, numero, hash} em lotes
#   3. fechar      → carimba publicado_em e o total
#
# ## O que o segredo do agente protege
#
# Estes endpoints ESCREVEM, e vivem num backend público. Sem segredo, qualquer
# um publicaria credencial para qualquer pedido — e o buraco não é cosmético:
# como o `abrir` devolve o sal, quem chegasse até aqui poderia calcular o hash
# de um conteúdo escolhido por ele e inserir um ingresso que a portaria
# aceitaria. É a ÚNICA forma de forjar ingresso sem ter o pool.
#
# Por isso, três travas além do segredo:
#
#   - `numero` não pode passar da quantidade que o ERP registrou para aquele
#     modelo, e `modelo_id` tem de ser mesmo daquele pedido. Nem com o segredo
#     na mão dá para inventar o ingresso 99.999 de uma tiragem de 3.000.
#   - publicação fechada não aceita mais lote. Reabrir é ato explícito.
#   - a falha é FECHADA: servidor sem segredo configurado recusa tudo, em vez
#     de virar porta aberta por esquecimento.
#
# Risco residual, registrado de propósito: quem tiver o segredo do agente e
# pegar a janela entre `abrir` e `fechar` ainda consegue ocupar uma posição da
# tiragem com um hash próprio. Endereçar isso é trabalho da parte 3 — a portaria
# vai ter como cruzar o total publicado com o que o ERP encomendou.


def _conferir_agente(segredo: str | None):
    """Quem está publicando é mesmo um agente nosso?"""
    if not AGENTE_SEGREDO:
        raise HTTPException(
            status_code=503,
            detail=(
                f"{SEGREDO_ENV} nao configurada neste servidor. A publicacao "
                "fica fechada ate que esteja: endpoint de escrita sem segredo e "
                "porta aberta."
            ),
        )
    if not segredo or not hmac.compare_digest(str(segredo), AGENTE_SEGREDO):
        raise HTTPException(status_code=401, detail="segredo do agente invalido")


def _abrir_pedido(pedido_id_int: int) -> dict:
    """Cria (ou reencontra) a linha do pedido e devolve o sal dele.

    IDEMPOTENTE, e isto é o ponto: reabrir tem de devolver o MESMO sal. O
    cliente reimprime 500 ingressos de um pedido de 5.000; sal novo invalidaria
    os 4.500 que já estão na mão das pessoas, e ninguém descobriria antes da
    portaria.

    Reabrir também destrava a publicação que já tinha fechado — é o que permite
    reimpressão. Voltar a aceitar lote é ato explícito, nunca efeito colateral.
    """
    achados = supabase(
        "GET", f"producao_acesso_pedidos?pedido_id_int=eq.{int(pedido_id_int)}&select=*"
    ) or []

    # A tiragem vai junto com o sal, numa resposta só. O agente precisa das duas
    # coisas para calcular a faixa, e quem sabe a quantidade é o ERP — não ele.
    # Duas idas à rede aqui seriam duas chances de falhar.
    tiragem = _tiragem_do_pedido(pedido_id_int)

    if achados:
        linha = achados[0]
        estava_fechado = bool(linha.get("publicado_em"))
        if estava_fechado:
            supabase(
                "PATCH",
                f"producao_acesso_pedidos?pedido_id_int=eq.{int(pedido_id_int)}",
                {"publicado_em": None},
            )
        return {"sal": linha["sal"], "reaberto": estava_fechado, "tiragem": tiragem}

    criado = supabase("POST", "producao_acesso_pedidos", {
        "pedido_id_int": int(pedido_id_int),
        "sal": qr_ideal.gerar_sal(),
    })
    return {"sal": criado[0]["sal"], "reaberto": False, "tiragem": tiragem}


def _tiragem_do_pedido(pedido_id_int: int) -> dict:
    """{modelo_id: quantidade}, lido do ERP. É o teto de cada modelo.

    Leitura de tabela do parceiro, que o REGRAS_BANCO.md autoriza.
    """
    linhas = supabase(
        "GET", f"pedidos_modelos?id_int=eq.{int(pedido_id_int)}&select=id,quantidade"
    ) or []
    return {int(l["id"]): int(l.get("quantidade") or 0) for l in linhas}


def _gravar_lote(pedido_id_int: int, itens: list) -> int:
    """Grava um lote de credenciais, ignorando o que já existe.

    `on_conflict=codigo_hash` é o que torna a publicação repetível: a rede cai
    no meio, o agente reenvia o lote inteiro, e nada duplica. Conferido contra o
    banco de verdade em 13/08/2026 — três envios do mesmo lote deixaram uma
    linha só.
    """
    pedido_id_int = int(pedido_id_int)

    linha = (supabase(
        "GET", f"producao_acesso_pedidos?pedido_id_int=eq.{pedido_id_int}&select=*"
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=409, detail="publicacao nao foi aberta para este pedido")
    if linha.get("publicado_em"):
        raise HTTPException(
            status_code=409,
            detail="publicacao ja fechada; reabra antes de enviar mais lotes",
        )

    tiragem = _tiragem_do_pedido(pedido_id_int)
    for i in itens:
        modelo = int(i["modelo_id"])
        numero = int(i["numero"])
        if modelo not in tiragem:
            raise HTTPException(
                status_code=422,
                detail=f"modelo {modelo} nao pertence ao pedido {pedido_id_int}",
            )
        if not (1 <= numero <= tiragem[modelo]):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"ingresso {numero} fora da tiragem do modelo {modelo} "
                    f"(1..{tiragem[modelo]})"
                ),
            )

    supabase(
        "POST",
        "producao_acesso_credenciais?on_conflict=codigo_hash",
        [{
            "pedido_id_int": pedido_id_int,
            "modelo_id": int(i["modelo_id"]),
            "numero": int(i["numero"]),
            "codigo_hash": i["hash"],
            "origem": "qr_ideal",
        } for i in itens],
        prefer="resolution=ignore-duplicates,return=minimal",
    )
    return len(itens)


def _fechar_pedido(pedido_id_int: int) -> dict:
    """Carimba o total publicado e trava a entrada de lotes novos."""
    pedido_id_int = int(pedido_id_int)
    gravadas = supabase(
        "GET", f"producao_acesso_credenciais?pedido_id_int=eq.{pedido_id_int}&select=id"
    ) or []
    esperado = sum(_tiragem_do_pedido(pedido_id_int).values())
    supabase("PATCH", f"producao_acesso_pedidos?pedido_id_int=eq.{pedido_id_int}", {
        "publicado_em": "now()",
        "total_credenciais": len(gravadas),
    })
    # `completo` é o que o agente olha para decidir se tenta de novo: um lote
    # perdido por rede não pode passar por publicação terminada.
    return {"total": len(gravadas), "esperado": esperado, "completo": len(gravadas) == esperado}


@router.post("/pedidos/{pedido}/abrir")
def abrir(pedido: int, x_agente_segredo: str = Header(None)):
    _conferir_agente(x_agente_segredo)
    return _abrir_pedido(pedido)


@router.post("/pedidos/{pedido}/credenciais")
def credenciais(pedido: int, corpo: dict, x_agente_segredo: str = Header(None)):
    _conferir_agente(x_agente_segredo)
    itens = corpo.get("itens") or []
    if len(itens) > LOTE_MAXIMO:
        raise HTTPException(status_code=413, detail=f"lote acima de {LOTE_MAXIMO} itens")
    return {"gravadas": _gravar_lote(pedido, itens)}


@router.post("/pedidos/{pedido}/fechar")
def fechar(pedido: int, x_agente_segredo: str = Header(None)):
    _conferir_agente(x_agente_segredo)
    return _fechar_pedido(pedido)


# ─── O QR do Pedido ───────────────────────────────────────────────────────────
#
# Este endpoint MINTA acesso: o token que ele devolve é o que permite reivindicar
# o evento de um pedido. Deixá-lo aberto desfaria tudo que as travas anteriores
# construíram — qualquer um geraria o QR do pedido alheio e tomaria o evento.
#
# O `get_current_user` do app.py não serve aqui: ele é um carimbo, devolve admin
# para todo mundo sem conferir nada ("sem auth por enquanto", diz o comentário
# de lá). Então conferimos o token do Supabase de verdade, perguntando ao próprio
# Supabase quem é o dono dele. Uma ida à rede por QR gerado, o que é raro.


def _usuario_logado(authorization: str | None) -> dict:
    """Quem está pedindo está mesmo logado no painel da gráfica?"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="faca login para gerar o QR do evento")
    token = authorization.split(" ", 1)[1].strip()

    req = urllib.request.Request(
        f"{db.SUPABASE_URL}/auth/v1/user",
        headers={"apikey": db.SUPABASE_KEY, "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError:
        raise HTTPException(status_code=401, detail="sessao expirada; entre de novo")
    except Exception as e:
        # Rede fora não é o mesmo que credencial inválida, e confundir os dois
        # manda o atendente procurar a senha quando o problema é outro.
        raise HTTPException(status_code=503, detail=f"nao consegui conferir a sessao: {e}")


def _url_do_evento(token: str) -> str:
    base = os.environ.get("PAINEL_BASE_URL")
    if not base:
        import security_config
        base = security_config.PAINEL_BASE_URL
    return f"{base.rstrip('/')}/evento.html?t={token}"


@router.post("/pedidos/{pedido}/qr")
def gerar_qr(pedido: int, authorization: str = Header(None)):
    """Gera o QR do evento e REVOGA o anterior.

    Revogar é o conserto de quando o QR cai na conta errada: o QR viaja por
    WhatsApp, e quem receber a imagem consegue reivindicar o pedido — uma vez.
    Se cair no cliente errado, o atendente gera outro e o primeiro morre na hora.
    """
    import qr_pedido

    usuario = _usuario_logado(authorization)
    if not qr_pedido.configurado():
        raise HTTPException(
            status_code=503,
            detail=f"{qr_pedido.SEGREDO_ENV} nao configurada neste servidor",
        )

    token = qr_pedido.gerar(pedido)
    _abrir_pedido(pedido)  # garante a linha e o sal, mesmo antes de imprimir

    supabase("PATCH", f"producao_acesso_pedidos?pedido_id_int=eq.{int(pedido)}", {
        "qr_token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
        "qr_gerado_em": "now()",
        "qr_revogado_em": None,
    })
    print(f"[acesso] QR do pedido {pedido} gerado por {usuario.get('email')}", flush=True)
    return {"url": _url_do_evento(token), "pedido": pedido}


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
