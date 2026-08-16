# -*- coding: utf-8 -*-
"""Os tres endpoints do aparelho da portaria.

Separado do `acesso_config.py` porque quem entra aqui e OUTRA pessoa: la e o
dono, com a conta do Vibe e a senha; aqui e o porteiro, com um codigo de seis
caracteres e um celular que pode estar offline ha horas. As duas portas nao se
misturam.

O que NAO se separou foi a chave: este modulo importa a `supabase()` do
`acesso_api` em vez de abrir a propria conexao, para que a pergunta "quem tem a
chave-mestra do banco na mao?" continue tendo um arquivo so por resposta.

## O que o aparelho pode

Ler ingresso e registrar entrada. Nada mais. Configurar o evento exige a senha
do dono e passa pelo `acesso_config.py` -- decisao do usuario em 13/08/2026.
"""

import hashlib
import hmac
import re
import secrets

from fastapi import APIRouter, Header, HTTPException

import qr_ideal
from acesso_api import supabase

router = APIRouter(prefix="/api/acesso/portaria", tags=["acesso"])

# Quantas credenciais por pagina da carga. Um evento de 30.000 sao ~3,5 MB de
# JSON; mandar de uma vez castiga o 4G do portao e estoura memoria em celular
# velho.
#
# TEM DE FICAR ABAIXO DE 1000: este projeto tem `max-rows = 1000` no
# PostgREST, e esse teto vence QUALQUER `limit` pedido na URL -- pedir
# limit=5001 volta 1000 linhas, caladamente, sem erro. O paginador abaixo
# pede POR_PAGINA + 1 para saber se ha proxima pagina (ver o comentario em
# `_faixa`); com POR_PAGINA >= 1000, esse "+1" tambem seria cortado pelo teto
# e `tem_proxima` (que compara contra o teto, nao contra o que foi pedido)
# nunca ficaria True -- o aparelho pararia achando que baixou o evento
# inteiro faltando metade. E o mesmo defeito que ja mordeu o `_fechar_pedido`
# (contagem por tamanho de resposta) e a auditoria de 15/08/2026 (pedido
# 18560: 2.000 credenciais gravadas, leitura devolvendo 1.000).
POR_PAGINA = 500

# Quantas leituras o servidor aceita por chamada. O aparelho manda em lotes.
MAXIMO_LEITURAS = 500

# Forca bruta no pareamento: 31^6 sao 887 milhoes de codigos, e cada tentativa
# ja custa um PBKDF2 de 10.000 voltas. Isto aqui e o segundo freio.
#
# A contagem mora no BANCO, e nao na memoria do processo. Ate 16/08/2026 era um
# dicionario aqui, e o comentario original ja registrava o defeito: nao
# sobrevivia a um reinicio do Render nem a duas instancias.
#
# O que forcou a troca foi a migracao para Edge Function, que e stateless por
# natureza -- la cada invocacao comecaria a contagem do zero, e o segundo freio
# deixaria de existir. E enquanto as duas versoes conviverem, contar em lugares
# separados daria ao atacante o dobro de tentativas, bastando alternar entre os
# dois enderecos.
MAXIMO_FALHAS = 10
JANELA_DE_FALHAS = 300          # segundos
TABELA_FALHAS = "producao_acesso_falhas_pareamento"


def _instante_para_url(d) -> str:
    """ISO 8601 terminado em `Z`, sem o `+00:00` do `isoformat()`.

    ARMADILHA, e ela custaria um 500 no portao: `datetime.isoformat()` produz
    `2026-08-16T04:52:51.988513+00:00`, e o `supabase()` monta a URL por
    concatenacao, sem escapar nada. Numa query string o `+` significa ESPACO --
    o servidor recebe `...988513 00:00`, o PostgREST recusa o filtro, o
    `supabase()` levanta, e o porteiro leva "Internal Server Error" com fila na
    frente.

    O `Z` diz a mesma coisa e nao tem caractere que precise de escape.
    """
    return d.replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z"


def _conferir_forca_bruta(evento_id: str):
    from datetime import datetime, timedelta, timezone
    desde = _instante_para_url(
        datetime.now(timezone.utc) - timedelta(seconds=JANELA_DE_FALHAS)
    )
    # `limit=MAXIMO_FALHAS`: nao interessa se sao 10 ou 10.000 falhas, so se
    # chegou ao teto. Trazer a lista inteira seria pagar, em trafego, o tamanho
    # do ataque.
    recentes = supabase(
        "GET",
        f"{TABELA_FALHAS}?evento_id=eq.{evento_id}&momento=gte.{desde}"
        f"&select=id&limit={MAXIMO_FALHAS}",
    ) or []
    if len(recentes) >= MAXIMO_FALHAS:
        raise HTTPException(
            status_code=429,
            detail="muitas tentativas; espere cinco minutos e tente de novo",
        )


def _anotar_falha(evento_id: str):
    # `return=minimal`: a resposta nao interessa, e devolver a linha gravada
    # seria trafego a toa num caminho que ja esta sob ataque.
    #
    # O `momento` nao vai no corpo de proposito: quem carimba e o banco
    # (`default now()`). Mandar daqui deixaria o freio a merce do relogio de
    # quem chama -- e, na Edge Function, de um relogio diferente do da estacao.
    supabase("POST", TABELA_FALHAS, {"evento_id": evento_id},
             prefer="return=minimal")


def _recusar_pareamento(evento_id: str):
    """A MESMA resposta para codigo errado, aparelho revogado e evento que nao
    existe. Responder diferente contaria a um estranho o que existe do outro
    lado."""
    _anotar_falha(evento_id)
    raise HTTPException(status_code=401, detail="codigo invalido")


def _hash_do_token(token: str) -> str:
    """SHA-256 puro, sem sal e sem KDF lento -- ao contrario do codigo de seis
    caracteres, que precisa de PBKDF2. Aqui a entrada tem 32 bytes sorteados:
    nao ha dicionario que ataque isso, e o token e conferido a cada requisicao
    do aparelho, onde 10.000 voltas seriam desperdicio puro."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _setores_do_aparelho(dispositivo_id: str) -> list:
    return [v["setor_id"] for v in (supabase(
        "GET",
        f"producao_acesso_dispositivo_setores?dispositivo_id=eq.{dispositivo_id}"
        "&select=setor_id",
    ) or [])]


FORMATO_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


def _entrar(corpo: dict) -> dict:
    """Troca o codigo de seis caracteres por um token do aparelho."""
    evento_id = str((corpo or {}).get("evento_id") or "").strip()
    codigo = str((corpo or {}).get("codigo") or "").strip().upper()
    if not evento_id or not codigo:
        raise HTTPException(status_code=422, detail="informe o evento e o codigo")

    # O formato do id e conferido AQUI, antes de ir ao banco. Sem isto o
    # PostgREST recusa `id=eq.nao-e-uuid` com um erro de tipo, o `supabase()`
    # levanta, e o porteiro recebe "Internal Server Error" -- num portao, com
    # fila, e sem nada que ele possa fazer. Conferido contra o Render em
    # 15/08/2026, logo depois de publicar: UUID valido inexistente devolvia 401,
    # id malformado devolvia 500.
    #
    # E a resposta e a MESMA dos outros casos, de proposito: um 500 aqui e um
    # 401 ali contariam a um estranho que aquele id chegou a existir.
    if not FORMATO_UUID.match(evento_id):
        _recusar_pareamento(evento_id)

    _conferir_forca_bruta(evento_id)

    evento = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=id,nome_evento,sal",
    ) or [None])[0]
    if not evento:
        _recusar_pareamento(evento_id)

    # UM PBKDF2 para a tentativa inteira: o hash depende do codigo e do sal do
    # evento, e nao do aparelho. Comparar contra cada aparelho depois disso e
    # de graca.
    tentativa = qr_ideal.hash_codigo(codigo, evento["sal"])

    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,codigo_hash",
    ) or []
    achado = None
    for a in aparelhos:
        if hmac.compare_digest(str(a.get("codigo_hash") or ""), tentativa):
            achado = a
            break
    if not achado:
        _recusar_pareamento(evento_id)

    token = secrets.token_hex(32)
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{achado['id']}",
             {"token_hash": _hash_do_token(token), "ultimo_visto": "now()"},
             prefer="return=minimal")

    # Quem acertou provou que nao e o atacante. Deixar a contagem de pe faria o
    # porteiro que errou duas vezes antes de acertar chegar mais perto do teto
    # sem motivo -- e o teto existe para quem NAO acerta.
    supabase("DELETE", f"{TABELA_FALHAS}?evento_id=eq.{evento_id}",
             prefer="return=minimal")
    return {
        "token": token,
        "aparelho": {"id": achado["id"], "nome": achado["nome"],
                     "setores": _setores_do_aparelho(achado["id"])},
        "evento": {"id": evento["id"], "nome": evento.get("nome_evento")},
    }


def _aparelho_do_token(cabecalho: str | None) -> dict:
    """Quem esta falando. Revogar o aparelho na tela do dono zera o `token_hash`
    e faz esta funcao recusar na requisicao seguinte -- e o unico jeito de tirar
    um aparelho de circulacao."""
    valor = (cabecalho or "").strip()
    if not valor.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="aparelho nao pareado")
    achados = supabase(
        "GET",
        f"producao_acesso_dispositivos?token_hash=eq.{_hash_do_token(valor[7:].strip())}"
        "&status=eq.ativo&select=id,evento_id,nome",
    ) or []
    if not achados:
        raise HTTPException(status_code=401, detail="aparelho nao pareado ou revogado")
    return achados[0]


def _faixa(cabecalho: str | None, desde: int) -> dict:
    """A carga do evento: tudo o que o aparelho precisa para decidir sem rede."""
    aparelho = _aparelho_do_token(cabecalho)
    evento_id = aparelho["evento_id"]
    desde = max(0, int(desde or 0))

    evento = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=id,nome_evento,sal",
    ) or [None])[0]
    if not evento:
        raise HTTPException(status_code=409, detail="evento nao existe mais")

    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em&order=nome.asc",
    ) or []
    bloqueios = supabase(
        "GET",
        f"producao_acesso_bloqueios?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=setor_id,de,ate,motivo",
    ) or []
    pedidos = supabase(
        "GET",
        f"producao_acesso_pedidos?evento_id=eq.{evento_id}&select=pedido_id_int,sal",
    ) or []

    # O evento INTEIRO, e nao so os setores deste aparelho. E o que torna a
    # regra `setor_nao_autorizado` possivel: com so os setores autorizados, um
    # ingresso de outra porta cairia em `desconhecido` e o porteiro devolveria
    # ingresso bom achando que e falso.
    #
    # Pede POR_PAGINA + 1: e o unico jeito de saber se ha proxima pagina quando
    # o total e MULTIPLO exato de POR_PAGINA. `len(pagina) == POR_PAGINA` sozinho
    # nao distingue "esta e a ultima pagina, e ela veio cheia" de "ha mais depois
    # dela" -- as duas dao o mesmo tamanho. O item extra nunca sobe na resposta.
    pagina_mais_uma = supabase(
        "GET",
        f"producao_acesso_credenciais?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,codigo_hash,setor_id,numero&order=id.asc"
        f"&offset={desde}&limit={POR_PAGINA + 1}",
    ) or []
    tem_proxima = len(pagina_mais_uma) > POR_PAGINA
    pagina = pagina_mais_uma[:POR_PAGINA]

    return {
        "evento": {"id": evento["id"], "nome": evento.get("nome_evento"),
                   "sal": evento["sal"]},
        "aparelho": {"id": aparelho["id"], "nome": aparelho["nome"],
                     "setores": _setores_do_aparelho(aparelho["id"])},
        "sais": {str(p["pedido_id_int"]): p["sal"] for p in pedidos},
        "setores": setores,
        "bloqueios": bloqueios,
        # Nomes curtos de proposito: sao 30.000 objetos numa rede de portao, e
        # `codigo_hash`/`setor_id`/`numero` por extenso somariam ~1 MB so de
        # nomes de campo.
        "credenciais": [{"h": c["codigo_hash"], "s": c["setor_id"],
                         "n": c["numero"], "id": c["id"]} for c in pagina],
        "proxima": (desde + POR_PAGINA) if tem_proxima else None,
    }


RESULTADOS = ("permitido", "negado")


def _leituras(cabecalho: str | None, corpo: dict) -> dict:
    """Recebe a fila que o aparelho acumulou."""
    aparelho = _aparelho_do_token(cabecalho)
    itens = (corpo or {}).get("leituras") or []
    if len(itens) > MAXIMO_LEITURAS:
        raise HTTPException(
            status_code=422,
            detail=f"mande no maximo {MAXIMO_LEITURAS} leituras por vez",
        )
    if not itens:
        return {"gravadas": 0}

    linhas = []
    for i in itens:
        resultado = str(i.get("resultado") or "")
        if resultado not in RESULTADOS:
            raise HTTPException(status_code=422, detail="resultado invalido")
        if not i.get("id_local") or not i.get("momento"):
            raise HTTPException(status_code=422, detail="leitura sem id_local ou momento")
        linhas.append({
            "evento_id": aparelho["evento_id"],
            # O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo
            # deixaria um aparelho gravar leitura no nome de outro.
            "dispositivo_id": aparelho["id"],
            "credencial_id": i.get("credencial_id"),
            "setor_id": i.get("setor_id"),
            "id_local": str(i["id_local"]),
            "momento": i["momento"],
            "tipo": "entrada",
            "resultado": resultado,
            "motivo": i.get("motivo"),
        })

    # `(dispositivo_id, id_local)` e a chave unica que ja existe no esquema
    # desde 13/08, criada exatamente para isto: o celular que ficou tres horas
    # offline reenvia a fila inteira, e nada duplica.
    supabase(
        "POST", "producao_acesso_leituras?on_conflict=dispositivo_id,id_local",
        linhas, prefer="resolution=ignore-duplicates,return=minimal",
    )
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho['id']}",
             {"ultimo_visto": "now()"}, prefer="return=minimal")
    return {"gravadas": len(linhas)}


@router.post("/entrar")
def entrar(corpo: dict):
    return _entrar(corpo)


@router.get("/faixa")
def faixa(desde: int = 0, authorization: str = Header(None)):
    return _faixa(authorization, desde)


@router.post("/leituras")
def leituras(corpo: dict, authorization: str = Header(None)):
    return _leituras(authorization, corpo)
