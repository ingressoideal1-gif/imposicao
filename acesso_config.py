# -*- coding: utf-8 -*-
"""A tela do dono do evento: ler e configurar.

Separado do `acesso_api.py` porque aquele arquivo já fazia três coisas — a
publicação da faixa, o QR do Pedido e a reivindicação — e configuração é a
quarta. O que NÃO se separou foi a chave: este módulo importa a `supabase()` de
lá em vez de abrir a própria conexão, para que a pergunta "quem tem a
chave-mestra do banco na mão?" continue tendo um arquivo só por resposta.

## As duas chaves de entrada

Toda LEITURA exige o JWT do Supabase e ser dono do evento. Toda ESCRITA exige,
além disso, um token de elevação — prova de que a senha do dono foi digitada nos
últimos 15 minutos, naquele navegador.

É a decisão do usuário em 13/08/2026: sem a senha é somente leitura. Ler
ingresso e registrar entrada, que é o trabalho do porteiro, nunca pedem senha —
mas isso é a parte 3b, e não passa por aqui.
"""

import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Header, HTTPException

import acesso_elevacao
import db
from acesso_api import _usuario_logado, contar, supabase

router = APIRouter(prefix="/api/acesso", tags=["acesso"])


def _evento_do_dono(evento_id: str, usuario: dict) -> dict:
    """O evento, se ele for desta conta. 403 em qualquer outro caso.

    A MESMA resposta para "não existe" e para "não é seu": responder diferente
    contaria a um estranho quais eventos existem.
    """
    linha = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,dono_auth_id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    if not linha or str(linha.get("dono_auth_id")) != str(usuario.get("id")):
        raise HTTPException(status_code=403, detail="evento nao encontrado nesta conta")
    return linha


def _painel(evento_id: str) -> dict:
    """Tudo que a tela mostra, numa resposta só."""
    evento = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,lotacao,tipo_uso,pedido_id_int,modelo_id"
        "&order=nome.asc",
    ) or []
    for s in setores:
        # O número que a tela compara com `quantidade`. Divergência aqui é ou
        # impressão que ainda não terminou de publicar, ou credencial que
        # alguém publicou sem dever.
        s["publicadas"] = contar(
            f"producao_acesso_credenciais?setor_id=eq.{s['id']}&status=eq.ativo"
        )

    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}"
        "&select=id,nome,status,ultimo_visto&order=nome.asc",
    ) or []
    # Escopado aos aparelhos já buscados acima: sem o `in.(...)`, esta consulta
    # trazia os vínculos de TODOS os eventos do sistema a cada abertura do
    # painel, e piorava sozinha conforme eventos se acumulassem. Evento sem
    # aparelho nenhum pula a ida ao banco — `in.()` vazio é URL malformada.
    ids_aparelhos = [str(a["id"]) for a in aparelhos]
    vinculos = (supabase(
        "GET",
        f"producao_acesso_dispositivo_setores?dispositivo_id=in.({','.join(ids_aparelhos)})"
        "&select=dispositivo_id,setor_id",
    ) or []) if ids_aparelhos else []
    for a in aparelhos:
        a["setores"] = [v["setor_id"] for v in vinculos
                        if str(v["dispositivo_id"]) == str(a["id"])]

    pedidos = supabase(
        "GET",
        f"producao_acesso_pedidos?evento_id=eq.{evento_id}"
        "&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc",
    ) or []

    return {
        "evento": evento,
        "setores": setores,
        "aparelhos": aparelhos,
        "pedidos": pedidos,
        "codigos_cliente": contar(
            f"producao_acesso_credenciais?evento_id=eq.{evento_id}&origem=eq.cliente"
        ),
    }


@router.get("/eventos/{evento_id}")
def ver_evento(evento_id: str, authorization: str = Header(None)):
    _evento_do_dono(evento_id, _usuario_logado(authorization))
    return _painel(evento_id)


# ── A elevação pela senha do dono ───────────────────────────────────────────
#
# Ler exige só o JWT. Escrever exige, além dele, a prova de que a senha do
# dono foi digitada nos últimos 15 minutos, naquele navegador — porque o
# celular da portaria fica na mão do porteiro, logado com a conta do cliente.

def _conferir_senha(email: str, senha: str) -> bool:
    """A senha do dono está certa? Quem sabe é o Supabase.

    Usa a chave anônima de propósito: a API de autenticação a exige, e aqui não
    se toca em tabela nenhuma. Uma sessão nova nasce desta chamada e é
    descartada — não há efeito colateral.
    """
    corpo = json.dumps({"email": email, "password": senha}).encode("utf-8")
    req = urllib.request.Request(
        f"{db.SUPABASE_URL}/auth/v1/token?grant_type=password",
        data=corpo,
        headers={"apikey": db.SUPABASE_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return bool(json.loads(resp.read().decode("utf-8")).get("access_token"))
    except urllib.error.HTTPError:
        return False
    except Exception as e:
        # Rede fora não é senha errada, e confundir os dois manda o dono
        # procurar um papel com a senha quando o problema é outro.
        raise HTTPException(
            status_code=503, detail=f"nao consegui conferir a senha agora: {e}"
        )


def _elevar(evento_id: str, usuario: dict, senha: str, navegador: str) -> dict:
    _evento_do_dono(evento_id, usuario)

    if not acesso_elevacao.configurado():
        raise HTTPException(
            status_code=503,
            detail=f"{acesso_elevacao.SEGREDO_ENV} nao configurada neste servidor",
        )
    if not _conferir_senha(usuario.get("email") or "", senha or ""):
        # Uma frase só: não dizer se o problema foi o e-mail ou a senha.
        raise HTTPException(status_code=401, detail="senha nao confere")

    token, expira = acesso_elevacao.gerar(evento_id, usuario["id"], navegador)
    return {"token": token, "expira_em": expira,
            "minutos": acesso_elevacao.VALIDADE_MINUTOS}


def _exigir_elevacao(evento_id: str, usuario: dict, elevacao, navegador) -> None:
    """A porta de toda escrita. Silêncio é aprovação.

    O 401 vem com um código próprio porque a tela precisa distinguir "a sessão
    caiu" de "a elevação venceu": são consertos diferentes, e confundi-los faz a
    tela deslogar quem só precisava digitar a senha de novo.
    """
    try:
        acesso_elevacao.conferir(elevacao, evento_id, usuario.get("id"), navegador)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail={"codigo": "elevacao_expirada",
                    "mensagem": "digite a senha do dono para alterar o evento"},
        )


@router.post("/eventos/{evento_id}/elevar")
def elevar(evento_id: str, corpo: dict, authorization: str = Header(None)):
    return _elevar(
        evento_id,
        _usuario_logado(authorization),
        corpo.get("senha") or "",
        corpo.get("navegador") or "",
    )


# ── Gravar evento e setor ───────────────────────────────────────────────────
#
# Toda escrita passa por aqui: confere o dono, exige a elevação, valida cada
# campo, e só então toca o banco. `if "campo" in corpo` em vez de `corpo.get`
# é o que permite gravar um campo de cada vez sem apagar os outros — a tela
# manda só o que o dono mudou.

TIPOS_DE_USO = ("unico", "reentrada")  # a portaria decide a fila por isto; nada mais existe

LOTACAO_MAXIMA = 10_000_000


def _texto(valor, campo: str, minimo: int, maximo: int) -> str:
    """Apara espaços e checa tamanho. `campo` entra na mensagem para o dono
    saber o que corrigir sem precisar adivinhar qual caixa da tela errou."""
    limpo = str(valor or "").strip()
    if not (minimo <= len(limpo) <= maximo):
        raise HTTPException(
            status_code=422,
            detail=f"{campo}: escreva de {minimo} a {maximo} caracteres",
        )
    return limpo


def _lotacao(valor):
    """`None` e `""` são o mesmo pedido — sem limite — porque o dono precisa
    de um jeito de voltar atrás depois de ter digitado um número. `0` não cai
    aqui: é lotação zero de verdade, não ausência de valor."""
    if valor is None or valor == "":
        return None          # sem limite
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="lotacao: escreva um numero inteiro")
    if not (0 <= n <= LOTACAO_MAXIMA):
        raise HTTPException(
            status_code=422,
            detail=f"lotacao: escreva de 0 a {LOTACAO_MAXIMA}, ou deixe vazio para sem limite",
        )
    return n


def _setor_do_dono(setor_id: str, usuario: dict) -> dict:
    """O setor, se o evento dele for desta conta. Reaproveita `_evento_do_dono`
    em vez de repetir a checagem, para que só exista um lugar respondendo
    "este evento é seu?"."""
    linha = (supabase(
        "GET", f"producao_acesso_setores?id=eq.{setor_id}&select=id,evento_id",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=403, detail="setor nao encontrado nesta conta")
    _evento_do_dono(linha["evento_id"], usuario)
    return linha


def _gravar_evento(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    mudanca = {}
    if "nome_evento" in corpo:
        mudanca["nome_evento"] = _texto(corpo["nome_evento"], "nome do evento", 1, 120)
    if "local_evento" in corpo:
        mudanca["local_evento"] = _texto(corpo["local_evento"], "local", 0, 200) or None
    if "data_evento" in corpo:
        mudanca["data_evento"] = corpo["data_evento"] or None

    if mudanca:
        supabase("PATCH", f"producao_acesso_eventos?id=eq.{evento_id}", mudanca,
                 prefer="return=minimal")
    return {"ok": True, "gravado": sorted(mudanca)}


def _gravar_setor(setor_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    # A elevação é exigida contra o evento DO SETOR, achado agora — nunca
    # contra um evento_id que o chamador tivesse mandado por fora, o que
    # deixaria a senha de um evento abrir a escrita de outro.
    setor = _setor_do_dono(setor_id, usuario)
    _exigir_elevacao(setor["evento_id"], usuario, elevacao, navegador)

    # `quantidade` NÃO entra: quem manda na tiragem é o ERP. Aceitá-la aqui
    # deixaria a tela silenciar a divergência que ela existe para mostrar.
    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do setor", 1, 60)
    if "lotacao" in corpo:
        mudanca["lotacao"] = _lotacao(corpo["lotacao"])
    if "tipo_uso" in corpo:
        tipo = str(corpo["tipo_uso"] or "").strip()
        if tipo not in TIPOS_DE_USO:
            raise HTTPException(
                status_code=422,
                detail="tipo de uso: escolha entre uma entrada so ou permite reentrada",
            )
        mudanca["tipo_uso"] = tipo

    if mudanca:
        supabase("PATCH", f"producao_acesso_setores?id=eq.{setor_id}", mudanca,
                 prefer="return=minimal")
    return {"ok": True, "gravado": sorted(mudanca)}


@router.patch("/eventos/{evento_id}")
def gravar_evento(evento_id: str, corpo: dict, authorization: str = Header(None),
                  x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_evento(evento_id, _usuario_logado(authorization),
                          x_elevacao, x_navegador, corpo)


@router.patch("/setores/{setor_id}")
def gravar_setor(setor_id: str, corpo: dict, authorization: str = Header(None),
                 x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_setor(setor_id, _usuario_logado(authorization),
                         x_elevacao, x_navegador, corpo)
