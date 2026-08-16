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
from datetime import datetime, timezone

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

    # `lotacao` NÃO entra no select, e a razão é a regra do negócio: a lotação
    # de um setor É a quantidade contratada no ERP. Não existe um segundo
    # número, digitado à parte, que possa discordar do contrato — ele
    # envelheceria no instante em que o cliente aumentasse o pedido.
    #
    # Também não há contagem de publicadas por setor. Ela existia para uma
    # comparação "encomendado × publicado" que o usuário tirou da tela em
    # 14/08/2026: como cada modelo publica quando é impresso, um pedido pela
    # metade acusava divergência pelo motivo mais banal do mundo, e o aviso
    # gritava quase sempre. Sem ninguém para mostrar o número, a contagem era
    # uma consulta por setor a cada abertura do painel, sem leitor.
    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em,pedido_id_int,modelo_id"
        "&order=nome.asc",
    ) or []

    # A faixa que está IMPRESSA em cada setor — "de 0001 a 0400". Ela vem do
    # ERP, e não de um MIN/MAX sobre as credenciais publicadas, por duas
    # razões. A primeira é a mesma que vale para a quantidade: quem manda na
    # tiragem é o pedido, e uma faixa deduzida do que já foi impresso encolhe
    # quando metade dos modelos ainda não passou pela impressora. A segunda é
    # custo: agregação está desligada neste PostgREST ("Use of aggregate
    # functions is not allowed"), então o mínimo e o máximo por setor sairiam
    # em duas consultas CADA — aqui é uma só para o evento inteiro.
    modelos = sorted({int(s["modelo_id"]) for s in setores
                      if s.get("modelo_id") is not None})
    faixas = {}
    if modelos:
        for m in supabase(
            "GET",
            f"pedidos_modelos?id=in.({','.join(str(m) for m in modelos)})"
            "&select=id,numeracao_inicio,numeracao_fim",
        ) or []:
            faixas[int(m["id"])] = m
    for s in setores:
        faixa = faixas.get(int(s["modelo_id"])) if s.get("modelo_id") is not None else None
        # Ausente e não zero: o modelo pode não ter faixa cadastrada, e um
        # "de 0000 a 0000" na tela do dono seria pior que linha nenhuma.
        s["numero_de"] = (faixa or {}).get("numeracao_inicio")
        s["numero_ate"] = (faixa or {}).get("numeracao_fim")

    # Uma consulta só para o evento inteiro, distribuída por setor aqui — e não
    # uma por setor. É o mesmo cuidado que os vínculos dos aparelhos já tomam
    # logo abaixo: um evento com doze setores faria doze idas ao banco a cada
    # abertura da tela, e a lista de bloqueios de um evento cabe folgada numa
    # resposta só.
    #
    # `status=eq.ativo` porque bloqueio liberado é histórico, não configuração.
    # Mostrá-lo na lista faria o dono liberar de novo o que já está liberado.
    bloqueios = supabase(
        "GET",
        f"producao_acesso_bloqueios?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,setor_id,de,ate,motivo&order=de.asc",
    ) or []
    for s in setores:
        s["bloqueios"] = [b for b in bloqueios
                          if str(b["setor_id"]) == str(s["id"])]

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

    # Os códigos que o cliente forneceu (staff, cortesia) passaram a ser
    # contados POR SETOR: a caixa de carregá-los saiu da seção própria e vive
    # dentro do "Configurar" do setor a que eles pertencem — que é onde o dono
    # já escolheu de qual setor está tratando.
    #
    # A contagem por setor só acontece quando o evento tem algum código de
    # cliente. Sem esta guarda, um evento comum — que é a maioria, e nunca
    # carregou código nenhum — pagaria uma ida ao banco por setor a cada
    # abertura da tela para receber zero em todas.
    codigos = contar(
        f"producao_acesso_credenciais?evento_id=eq.{evento_id}&origem=eq.cliente"
    )
    for s in setores:
        s["codigos_cliente"] = contar(
            f"producao_acesso_credenciais?setor_id=eq.{s['id']}&origem=eq.cliente"
        ) if codigos else 0

    return {
        "evento": evento,
        "setores": setores,
        "aparelhos": aparelhos,
        "pedidos": pedidos,
        "codigos_cliente": codigos,
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


def _momento(valor, campo: str):
    """Um instante para o banco, ou `None`.

    `None` e `""` são o mesmo pedido — sem limite daquele lado —, porque o dono
    precisa de um jeito de voltar atrás depois de ter posto um horário; a única
    alternativa seria inventar uma data absurda.

    A validação é de FORMA, não de calendário: o `datetime-local` do navegador
    manda "2026-09-28T20:00", e o Postgres aceita. Data impossível é recusada
    pelo próprio banco, e repetir a regra aqui seria uma segunda verdade para
    manter.
    """
    if valor is None or (isinstance(valor, str) and valor.strip() == ""):
        return None
    texto = str(valor).strip()
    try:
        datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"{campo}: escreva uma data e hora validas, ou deixe vazio",
        )
    return texto


def _conferir_janela(abre, fecha):
    """Fechar antes de abrir recusa SEMPRE, não "às vezes".

    O dono descobriria isso com a fila na porta. E como o baile que vira a
    madrugada é o caso normal — abre sábado 22h, fecha domingo 5h —, a confusão
    natural aqui é errar o DIA; por isso a mensagem diz o que está errado, e não
    só "inválido".

    Comparação em UTC: sem `astimezone`, um `abre_em` com fuso e um `fecha_em`
    sem fuso estouram `TypeError` no `<` em vez de recusar com 422.
    """
    if not abre or not fecha:
        return                      # um lado só é configuração legítima
    a = datetime.fromisoformat(abre.replace("Z", "+00:00"))
    f = datetime.fromisoformat(fecha.replace("Z", "+00:00"))
    if a.tzinfo is None:
        a = a.replace(tzinfo=timezone.utc)
    if f.tzinfo is None:
        f = f.replace(tzinfo=timezone.utc)
    if f <= a:
        raise HTTPException(
            status_code=422,
            detail="a hora em que fecha tem de ser depois da hora em que abre "
                   "— confira se o dia esta certo, no caso de virar a madrugada",
        )


def _setor_do_dono(setor_id: str, usuario: dict) -> dict:
    """O setor, se o evento dele for desta conta. Reaproveita `_evento_do_dono`
    em vez de repetir a checagem, para que só exista um lugar respondendo
    "este evento é seu?"."""
    linha = (supabase(
        "GET",
        f"producao_acesso_setores?id=eq.{setor_id}"
        "&select=id,evento_id,quantidade,abre_em,fecha_em",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=403, detail="setor nao encontrado nesta conta")
    _evento_do_dono(linha["evento_id"], usuario)
    return linha


# ── O que muda, separado de quem pode mudar ─────────────────────────────────
#
# As funções `_aplicar_*` abaixo NÃO autorizam nada: elas conferem o corpo e
# gravam. Quem responde "esta pessoa pode?" é a camada de cima, e são duas,
# com regras deliberadamente diferentes:
#
#   - o cliente, em `controle.html`, precisa da senha cadastrada dele e só
#     alcança os próprios eventos (`_evento_do_dono` + `_exigir_elevacao`);
#   - a equipe da gráfica, em `acesso_interno.py`, precisa estar logada no
#     painel como ADM ou Atendimento, e alcança qualquer evento — porque o
#     trabalho dela é justamente pré-configurar o evento do cliente antes de
#     entregá-lo.
#
# A separação existe para que a REGRA de negócio — o que é um nome de setor
# válido, o que é uma janela invertida — tenha um lugar só. Duas cópias
# divergiriam no dia em que uma delas mudasse, e o sintoma seria o pior
# possível: a gráfica pré-configura um evento de um jeito que o cliente não
# consegue reproduzir, ou pior, grava algo que a tela dele recusa.


def _aplicar_evento(evento_id: str, corpo: dict) -> dict:
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


def _aplicar_setor(setor: dict, corpo: dict) -> dict:
    """`setor` é a linha JÁ LIDA do banco — quem chama é que decide como
    encontrá-la e se pode tocá-la."""
    # Nem `quantidade` nem `lotacao` entram, e é a mesma razão para as duas:
    # quem manda na tiragem contratada é o ERP, e a lotação do setor É essa
    # tiragem. Aceitar qualquer uma delas aqui criaria uma segunda fonte da
    # verdade, que passa a discordar do contrato no instante em que o cliente
    # aumenta o pedido — e a tela nem oferece mais onde digitar.
    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do setor", 1, 60)
    if "tipo_uso" in corpo:
        tipo = str(corpo["tipo_uso"] or "").strip()
        if tipo not in TIPOS_DE_USO:
            raise HTTPException(
                status_code=422,
                detail="tipo de uso: escolha 'vale uma entrada so' ou 'permite sair e voltar'",
            )
        mudanca["tipo_uso"] = tipo
    if "abre_em" in corpo:
        mudanca["abre_em"] = _momento(corpo["abre_em"], "hora em que abre")
    if "fecha_em" in corpo:
        mudanca["fecha_em"] = _momento(corpo["fecha_em"], "hora em que fecha")

    # Contra o que JÁ ESTÁ gravado, e não só contra o que veio no corpo: a tela
    # manda apenas o que o dono mexeu. Comparar só os dois campos do corpo
    # deixaria uma janela invertida entrar pela porta dos fundos, um campo de
    # cada vez — grava o `abre_em` tarde hoje, o `fecha_em` cedo em seguida, e
    # nenhuma das duas chamadas vê o par completo.
    if "abre_em" in mudanca or "fecha_em" in mudanca:
        _conferir_janela(mudanca.get("abre_em", setor.get("abre_em")),
                         mudanca.get("fecha_em", setor.get("fecha_em")))

    if mudanca:
        supabase("PATCH", f"producao_acesso_setores?id=eq.{setor['id']}", mudanca,
                 prefer="return=minimal")
    return {"ok": True, "gravado": sorted(mudanca)}


def _gravar_evento(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)
    return _aplicar_evento(evento_id, corpo)


def _gravar_setor(setor_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    # A elevação é exigida contra o evento DO SETOR, achado agora — nunca
    # contra um evento_id que o chamador tivesse mandado por fora, o que
    # deixaria a senha de um evento abrir a escrita de outro.
    setor = _setor_do_dono(setor_id, usuario)
    _exigir_elevacao(setor["evento_id"], usuario, elevacao, navegador)
    return _aplicar_setor(setor, corpo)


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


# ── Bloqueio de faixas de ingresso ──────────────────────────────────────────
#
# Acontece na gráfica de verdade: um ponto de venda recebe 500 ingressos e não
# paga; um lote é roubado. Os códigos já estão publicados, e sem isto a portaria
# os aceita.
#
# O bloqueio NÃO toca em `producao_acesso_credenciais`. Ele é uma linha dizendo
# "do ingresso 1000 ao 1500, motivo X" — e liberar depois é apagar essa linha, e
# não corrigir quinhentas, cada uma delas uma chance de parar no meio.
#
# A faixa é um intervalo de `numero`, a posição do ingresso na tiragem, que o
# agente já grava em cada credencial. Nenhum código em claro entra nisto.

def _faixa(corpo: dict, quantidade: int) -> tuple:
    """`(de, ate)` conferidos, ou 422 dizendo o que está errado."""
    try:
        de = int(corpo.get("de"))
        ate = int(corpo.get("ate"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422, detail="de/ate: escreva o primeiro e o ultimo ingresso da faixa")

    if de < 1:
        # A tiragem começa em 1. `de = 0` costuma ser o dono pensando em índice.
        raise HTTPException(status_code=422, detail="o primeiro ingresso da faixa e o 1")
    if ate < de:
        # Faixa invertida não bloqueia ingresso NENHUM — o pior resultado
        # possível, porque o dono acha que bloqueou e só descobre na porta.
        raise HTTPException(
            status_code=422, detail="o ultimo ingresso da faixa tem de vir depois do primeiro")
    if quantidade and ate > quantidade:
        # Não faz mal a ninguém bloquear número que não existe, mas quase sempre
        # é o dono confundindo o setor — e o silêncio o deixaria achando que
        # protegeu ingresso que está em outro lugar.
        raise HTTPException(
            status_code=422,
            detail=f"este setor tem {quantidade} ingressos; a faixa nao pode passar disso")
    return de, ate


def _aplicar_bloqueio(setor: dict, corpo: dict, autor_id) -> dict:
    de, ate = _faixa(corpo, int(setor.get("quantidade") or 0))
    # Obrigatório, e é a razão de tudo isto existir: um bloqueio sem motivo
    # aparece na portaria como "recusado" e ninguém sabe o que dizer para a
    # pessoa que está na frente.
    motivo = _texto(corpo.get("motivo"), "motivo", 1, 200)

    linha = {
        "evento_id": setor["evento_id"],
        "setor_id": setor["id"],
        "de": de,
        "ate": ate,
        "motivo": motivo,
        "status": "ativo",
        "criado_por": autor_id,
    }
    supabase("POST", "producao_acesso_bloqueios", linha, prefer="return=minimal")
    return {"ok": True, "de": de, "ate": ate}


def _aplicar_liberacao(setor: dict, bloqueio_id: str) -> dict:
    # O bloqueio tem de pertencer A ESTE setor. Sem esta conferência, o dono de
    # um evento liberaria o bloqueio de outro cliente mandando o id alheio pela
    # própria URL — a guarda de cima só provou que o SETOR é dele.
    alvo = (supabase(
        "GET",
        f"producao_acesso_bloqueios?id=eq.{bloqueio_id}&select=id,setor_id",
    ) or [None])[0]
    if not alvo or str(alvo["setor_id"]) != str(setor["id"]):
        raise HTTPException(status_code=403, detail="bloqueio nao encontrado neste setor")

    # `status='removido'`, nunca DELETE: "liberamos o lote às 22h40" é
    # informação que a portaria vai querer ter depois.
    supabase("PATCH", f"producao_acesso_bloqueios?id=eq.{bloqueio_id}",
             {"status": "removido"}, prefer="return=minimal")
    return {"ok": True, "liberado": bloqueio_id}


def _bloquear(setor_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    setor = _setor_do_dono(setor_id, usuario)
    _exigir_elevacao(setor["evento_id"], usuario, elevacao, navegador)
    return _aplicar_bloqueio(setor, corpo, usuario["id"])


def _liberar(setor_id, bloqueio_id, usuario, elevacao, navegador) -> dict:
    setor = _setor_do_dono(setor_id, usuario)
    _exigir_elevacao(setor["evento_id"], usuario, elevacao, navegador)
    return _aplicar_liberacao(setor, bloqueio_id)


@router.post("/setores/{setor_id}/bloqueios")
def bloquear(setor_id: str, corpo: dict, authorization: str = Header(None),
             x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _bloquear(setor_id, _usuario_logado(authorization),
                     x_elevacao, x_navegador, corpo)


@router.delete("/setores/{setor_id}/bloqueios/{bloqueio_id}")
def liberar(setor_id: str, bloqueio_id: str, authorization: str = Header(None),
            x_elevacao: str = Header(None), x_navegador: str = Header(None)):
    return _liberar(setor_id, bloqueio_id, _usuario_logado(authorization),
                    x_elevacao, x_navegador)


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


def _aplicar_aparelho_novo(evento_id: str, corpo: dict) -> dict:
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


def _aplicar_aparelho(aparelho: dict, corpo: dict) -> dict:
    mudanca = {}
    if "nome" in corpo:
        mudanca["nome"] = _texto(corpo["nome"], "nome do aparelho", 1, 60)
    if "status" in corpo:
        if corpo["status"] not in ("ativo", "revogado"):
            raise HTTPException(status_code=422, detail="status: ativo ou revogado")
        mudanca["status"] = corpo["status"]
    if mudanca:
        supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho['id']}", mudanca,
                 prefer="return=minimal")

    if "setores" in corpo:
        _trocar_setores(aparelho["id"],
                        _conferir_setores(aparelho["evento_id"], corpo["setores"]))
    return {"ok": True}


def _aplicar_novo_codigo(aparelho: dict) -> dict:
    codigo = _sortear_codigo()
    supabase("PATCH", f"producao_acesso_dispositivos?id=eq.{aparelho['id']}",
             {"codigo_hash": _hash_do_codigo(codigo, _sal_do_evento(aparelho["evento_id"]))},
             prefer="return=minimal")
    return {"codigo": codigo}


def _criar_aparelho(evento_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    _evento_do_dono(evento_id, usuario)
    _exigir_elevacao(evento_id, usuario, elevacao, navegador)
    return _aplicar_aparelho_novo(evento_id, corpo)


def _gravar_aparelho(aparelho_id, usuario, elevacao, navegador, corpo: dict) -> dict:
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)
    return _aplicar_aparelho(aparelho, corpo)


def _novo_codigo(aparelho_id, usuario, elevacao, navegador) -> dict:
    """Gera outro código curto. NÃO mexe no `token_hash`, de propósito.

    Quem mantém o aparelho conectado é o token dele. Se gerar código novo o
    apagasse, o dono derrubaria a portaria no meio do evento só por ter
    esquecido um código — e a tela, que promete o contrário em texto, estaria
    mentindo. Desligar o aparelho é a outra ação, separada: revogar.
    """
    aparelho = _aparelho_do_dono(aparelho_id, usuario)
    _exigir_elevacao(aparelho["evento_id"], usuario, elevacao, navegador)
    return _aplicar_novo_codigo(aparelho)


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
    return _aplicar_codigos(evento_id, corpo)


def _aplicar_codigos(evento_id: str, corpo: dict) -> dict:
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
    # `chave_dedup` e não `codigo_hash`: é a mesma chave única da publicação da
    # faixa, e ela vale igual aqui. Estes códigos não têm pedido, modelo nem
    # número — os três entram como zero na chave —, então na prática eles
    # continuam sendo únicos pelo hash, que é o que sempre foi. O que muda é só
    # o nome do índice que o banco consulta.
    gravadas = supabase(
        "POST",
        "producao_acesso_credenciais?on_conflict=chave_dedup",
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
