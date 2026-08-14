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
import secrets
import urllib.error
import urllib.request

from fastapi import APIRouter, Header, HTTPException

import acesso_elevacao
import db
import qr_ideal
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
        # alguém publicou sem dever. `origem=eq.qr_ideal` é o que falta para
        # essa comparação fazer sentido: sem ele, os códigos de staff que o
        # PRÓPRIO dono importa (`origem='cliente'`) entravam na contagem e
        # deslocavam o alarme para sempre — importar 42 códigos de staff num
        # setor com a tiragem toda publicada fazia o cartão dizer "5042 no
        # ar" permanentemente, porque a única forma de "corrigir" o número
        # seria desimportar o próprio staff.
        s["publicadas"] = contar(
            f"producao_acesso_credenciais?setor_id=eq.{s['id']}"
            "&status=eq.ativo&origem=eq.qr_ideal"
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
    except urllib.error.HTTPError as e:
        if e.code in (400, 401):
            # 400 é corpo mal formado, 401 é credencial errada — os dois são
            # "senha não confere" do ponto de vista do dono. Qualquer outro
            # código (429 de limite de taxa, 5xx do provedor) NÃO é senha
            # errada: toda elevação sai do mesmo IP de saída do Render, então
            # um limite por IP é compartilhado por toda a base de clientes, e
            # dizer "senha errada" aqui manda o dono procurar um papel com a
            # senha quando o problema é outro.
            return False
        raise HTTPException(
            status_code=503,
            detail=f"nao consegui conferir a senha agora (codigo {e.code})",
        )
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
    except (ValueError, RuntimeError):
        # RuntimeError entra aqui de propósito: é o que `acesso_elevacao`
        # levanta quando `ACESSO_ELEVACAO_SEGREDO` não está configurada, e
        # esse é literalmente o estado do servidor até o dia em que a
        # variável for colada no Render — não é hipotético. Um token BEM
        # FORMADO chegando nessa janela não pode virar 500 numa tela que já
        # sabe tratar 401.
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
                detail="tipo de uso: escolha 'vale uma entrada so' ou 'permite sair e voltar'",
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


# ── Os aparelhos da portaria ─────────────────────────────────────────────────
#
# Cada celular da portaria nasce com um nome, um código curto que o porteiro
# digita uma vez para conectar, e a lista de setores que ele tem permissão de
# validar — um aparelho no portão A precisa recusar um ingresso VIP, e dizer
# isso com uma cara diferente da que usa para um ingresso forjado (parte 3b).
#
# Sem `0`, `O`, `1`, `I` e `L`: o porteiro lê este código de um papel, e esses
# cinco caracteres são erro garantido. São 31 símbolos, e 31^6 ≈ 8,9 x 10^8.
ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
TAMANHO_CODIGO = 6


def _sortear_codigo() -> str:
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(TAMANHO_CODIGO))


def _sal_do_evento(evento_id: str) -> str:
    linha = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=sal",
    ) or [None])[0]
    if not linha or not linha.get("sal"):
        raise HTTPException(status_code=409, detail="evento sem sal; recadastre o pedido")
    return linha["sal"]


def _hash_do_codigo(codigo: str, sal: str) -> str:
    """O mesmo PBKDF2 de 10.000 voltas do QR Ideal, com o sal do evento.

    Um código de seis caracteres é curto. O custo do KDF é o que torna caro
    tentar em massa contra o endpoint de entrada do aparelho, na parte 3b.
    """
    return qr_ideal.hash_codigo(codigo.strip().upper(), sal)


def _setores_do_evento(evento_id: str) -> set:
    # `status=eq.ativo`, para o mesmo filtro que `_painel` já aplica: sem
    # ele, um aparelho podia ser vinculado a um setor que a tela nunca
    # mostra, e o dono nunca teria como saber que aquele vínculo existe.
    return {str(s["id"]) for s in (supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo&select=id",
    ) or [])}


def _conferir_setores(evento_id: str, setores) -> list:
    pedidos = [str(s) for s in (setores or [])]
    validos = _setores_do_evento(evento_id)
    intrusos = [s for s in pedidos if s not in validos]
    if intrusos:
        raise HTTPException(
            status_code=422,
            detail="ha setor que nao e deste evento na lista do aparelho",
        )
    return pedidos


def _trocar_setores(aparelho_id: str, setores: list) -> None:
    supabase("DELETE",
             f"producao_acesso_dispositivo_setores?dispositivo_id=eq.{aparelho_id}",
             prefer="return=minimal")
    if setores:
        supabase("POST", "producao_acesso_dispositivo_setores",
                 [{"dispositivo_id": aparelho_id, "setor_id": s} for s in setores],
                 prefer="return=minimal")


def _aparelho_do_dono(aparelho_id: str, usuario: dict) -> dict:
    linha = (supabase(
        "GET", f"producao_acesso_dispositivos?id=eq.{aparelho_id}&select=id,evento_id",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=403, detail="aparelho nao encontrado nesta conta")
    _evento_do_dono(linha["evento_id"], usuario)
    return linha


def _criar_aparelho(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    nome = _texto(corpo.get("nome"), "nome do aparelho", 1, 60)
    setores = _conferir_setores(evento_id, corpo.get("setores"))
    codigo = _sortear_codigo()

    criado = supabase("POST", "producao_acesso_dispositivos", {
        "evento_id": evento_id,
        "nome": nome,
        "codigo_hash": _hash_do_codigo(codigo, _sal_do_evento(evento_id)),
    })[0]
    _trocar_setores(criado["id"], setores)

    # O código volta AQUI e nunca mais: o que fica guardado é o hash.
    return {"id": criado["id"], "nome": nome, "codigo": codigo}


def _gravar_aparelho(aparelho_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)

    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do aparelho", 1, 60)
    if "status" in corpo:
        if corpo["status"] not in ("ativo", "revogado"):
            raise HTTPException(status_code=422, detail="status: ativo ou revogado")
        mudanca["status"] = corpo["status"]
    if mudanca:
        supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho_id}", mudanca,
                 prefer="return=minimal")

    if "setores" in corpo:
        _trocar_setores(aparelho_id,
                        _conferir_setores(aparelho["evento_id"], corpo["setores"]))
    return {"ok": True}


def _novo_codigo(aparelho_id, usuario, elevacao, navegador) -> dict:
    """Gera outro código curto. NÃO mexe no `token_hash`, de propósito.

    Quem mantém o aparelho conectado é o token dele. Se gerar código novo o
    apagasse, o dono derrubaria a portaria no meio do evento só por ter
    esquecido um código — e a tela, que promete o contrário em texto, estaria
    mentindo. Desligar o aparelho é a outra ação, separada: revogar.
    """
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)

    codigo = _sortear_codigo()
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho_id}",
             {"codigo_hash": _hash_do_codigo(codigo, _sal_do_evento(aparelho["evento_id"]))},
             prefer="return=minimal")
    return {"codigo": codigo}


@router.post("/eventos/{evento_id}/aparelhos")
def criar_aparelho(evento_id: str, corpo: dict, authorization: str = Header(None),
                   x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _criar_aparelho(evento_id, _usuario_logado(authorization),
                           x_elevacao, x_navegador, corpo)


@router.patch("/aparelhos/{aparelho_id}")
def gravar_aparelho(aparelho_id: str, corpo: dict, authorization: str = Header(None),
                    x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _gravar_aparelho(aparelho_id, _usuario_logado(authorization),
                            x_elevacao, x_navegador, corpo)


@router.post("/aparelhos/{aparelho_id}/codigo")
def novo_codigo(aparelho_id: str, authorization: str = Header(None),
                x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _novo_codigo(aparelho_id, _usuario_logado(authorization),
                        x_elevacao, x_navegador)


# ── Os códigos do próprio cliente ───────────────────────────────────────────
#
# Além do ingresso impresso, um evento tem crachá de staff, cortesia e lista
# VIP — códigos que o CLIENTE fornece, não os que o QR Ideal gera. O dono cola
# a lista no celular e escolhe o setor. A linha que não se borra: o código do
# QR Ideal nunca aparece em claro; o código do cliente é dele, e ele precisa
# administrar a própria lista — por isso fica legível em `codigo_visivel`.

MAXIMO_CODIGOS = 5000

TAMANHO_MAXIMO_DO_CODIGO = 64


def _importar_codigos(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    """Grava os códigos que o CLIENTE forneceu: staff, cortesia, lista VIP.

    Eles são hasheados com o sal do EVENTO — não com o sal de um pedido, que é
    o que os códigos do QR Ideal usam. E ficam legíveis em `codigo_visivel`,
    porque são do cliente e ele precisa administrar a própria lista.

    Reenviar a mesma lista é inofensivo: a chave única
    `uq_acesso_credencial_hash_simples` ignora o repetido.
    """
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)

    brutos = corpo.get("codigos") or []
    if len(brutos) > MAXIMO_CODIGOS:
        raise HTTPException(
            status_code=413,
            detail=f"envie no maximo {MAXIMO_CODIGOS} codigos por vez",
        )

    setor_id = str(corpo.get("setor_id") or "")
    if setor_id not in _setores_do_evento(evento_id):
        raise HTTPException(status_code=422, detail="escolha um setor deste evento")

    # Aparar, subir para maiúscula e reduzir repetidos preservando a ordem em
    # que o cliente colou — a ordem é a única pista que ele tem para conferir.
    vistos, limpos = set(), []
    for bruto in brutos:
        codigo = str(bruto or "").strip().upper()
        if not codigo or codigo in vistos:
            continue
        if len(codigo) > TAMANHO_MAXIMO_DO_CODIGO:
            raise HTTPException(
                status_code=422,
                detail=f"ha codigo com mais de {TAMANHO_MAXIMO_DO_CODIGO} caracteres",
            )
        vistos.add(codigo)
        limpos.append(codigo)

    if not limpos:
        return {"gravados": 0, "ja_existiam": 0}

    sal = _sal_do_evento(evento_id)
    # `return=representation` em vez de `return=minimal`: o achado da
    # revisão final foi que `len(limpos)` conta o que foi ENVIADO, não o que
    # foi ESCRITO. Reenviar a mesma lista — o que um dono faz depois de
    # escolher o setor errado, já que 3a não tem como apagar um código —
    # gravava zero linha nova (a chave única ignora o repetido) e a tela
    # dizia "42 códigos entraram" nas duas vezes. Contar as linhas que
    # voltaram de verdade é o que distingue as duas.
    gravadas = supabase(
        "POST",
        "producao_acesso_credenciais?on_conflict=codigo_hash",
        [{
            "evento_id": evento_id,
            "setor_id": setor_id,
            "codigo_hash": qr_ideal.hash_codigo(c, sal),
            "codigo_visivel": c,
            "origem": "cliente",
        } for c in limpos],
        prefer="resolution=ignore-duplicates,return=representation",
    ) or []
    novos = len(gravadas)
    return {"gravados": novos, "ja_existiam": len(limpos) - novos}


@router.post("/eventos/{evento_id}/codigos")
def importar_codigos(evento_id: str, corpo: dict, authorization: str = Header(None),
                     x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _importar_codigos(evento_id, _usuario_logado(authorization),
                             x_elevacao, x_navegador, corpo)
