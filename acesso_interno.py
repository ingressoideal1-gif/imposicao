# -*- coding: utf-8 -*-
"""O Ideal Control visto de dentro da gráfica.

A tela do cliente (`controle.html`, servida pela Vercel) e esta são a mesma
configuração vista por duas pessoas diferentes, e a diferença que importa é a
porta de entrada:

    cliente   →  a senha cadastrada dele, e só os eventos dele
    gráfica   →  estar logado no painel como ADM ou Atendimento, e qualquer evento

A segunda existe porque o trabalho da gráfica é **entregar o Ideal Control já
pré-configurado**. O cliente recebe o QR do Pedido e encontra os setores com
nome de portaria, janela de horário, uso do ingresso e aparelhos já criados —
em vez de uma tela em branco e um manual.

## Por que a autorização aqui é mais forte que a do resto do painel

`app.py` ainda tem `get_current_user()` devolvendo um usuário fixo com
`admin: True` — o RLS foi adiado por decisão do usuário e aquele stub é o que
sobrou. Este módulo **não** usa esse caminho: ele confere o JWT do Supabase de
verdade (`_usuario_logado`) e depois lê o papel da pessoa em
`imposition_user_permissions`. Sem linha, ou com papel que não seja ADM ou
Atendimento, é 403 — e é 403 mesmo que o navegador tenha conseguido desenhar a
tela, porque esconder o botão nunca impediu ninguém de chamar a rota.

## O que NUNCA sai daqui

O código do QR Ideal. A tela lista os ingressos de cada setor pelo NÚMERO e
pela situação; `codigo_hash` não entra em nenhum `select`, e `codigo_visivel`
só aparece para os códigos que o próprio cliente carregou (staff, cortesia),
que são dele e ele precisa administrar. O sal do evento também não sai: ele é
o que transforma um código em hash, e esta tela não tem uso para ele.
"""

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

import acesso_config as cfg
from acesso_api import _usuario_logado, contar, supabase

router = APIRouter(prefix="/api/acesso/interno", tags=["acesso"])


FORMATO_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _uuid(valor, o_que: str) -> str:
    """O id tem de ser um UUID antes de virar filtro do PostgREST.

    Todo id desta API vai para a URL da consulta — `?id=eq.{valor}` —, e o `&`
    é o separador de filtros do PostgREST. Um id com `%26select=*` dentro sai
    do FastAPI já decodificado e emendaria um filtro que ninguém escreveu.
    Nenhum id legítimo deste sistema é outra coisa senão um UUID, então a
    conferência não custa nada e fecha a porta inteira.

    Também é o que impede um id malformado de virar 500: o PostgREST levanta
    `22P02` para `eq.nao-e-uuid`, e foi exatamente assim que a portaria
    respondeu 500 num portão em 15/08/2026.
    """
    texto = str(valor or "")
    if not FORMATO_UUID.match(texto):
        raise HTTPException(status_code=404, detail=f"{o_que} nao encontrado")
    return texto


# ── Quem pode configurar ────────────────────────────────────────────────────

#: Decisão do usuário em 15/08/2026: "a edição será feita sem o uso de senha,
#: basta estar logado na aplicação como ADM ou Atendimento". São os dois papéis
#: que falam com o cliente e montam o pedido; Designer e Operador trabalham na
#: arte e na impressora, e não têm o que fazer na configuração de um evento.
PAPEIS_QUE_CONFIGURAM = ("admin", "atendimento")


def _equipe(authorization) -> dict:
    """Quem está pedindo é da equipe, e com papel que configura?

    Duas perguntas, nesta ordem, e as duas contra o banco: o JWT prova QUEM é
    (o Supabase assina), e a tabela de permissões prova O QUE ELE PODE. Confiar
    num papel que viesse no corpo do pedido, ou num cabeçalho, seria deixar o
    navegador se autopromover.
    """
    usuario = _usuario_logado(authorization)
    linha = (supabase(
        "GET",
        f"imposition_user_permissions?user_id=eq.{usuario['id']}&select=user_id,role",
    ) or [None])[0]

    papel = ((linha or {}).get("role") or "").strip().lower()
    if papel not in PAPEIS_QUE_CONFIGURAM:
        # A mesma resposta para "não tem linha" e para "tem papel que não
        # configura": as duas são "você não pode", e distinguir contaria a
        # quem tentou em que ponto ele parou.
        raise HTTPException(
            status_code=403,
            detail="o Ideal Control da gráfica é para ADM e Atendimento; "
                   "peça a permissão ao administrador",
        )
    return {"id": usuario["id"], "email": usuario.get("email"), "papel": papel}


# ── Leitura: tudo sobre um pedido ───────────────────────────────────────────

#: Teto de linhas por página. **Não pode passar de 1.000**: o PostgREST corta
#: toda resposta nesse tamanho, em silêncio, e um `limit` maior não muda nada —
#: a página viria cortada e a tela mostraria menos ingressos do que diz ter.
#: Este projeto já foi mordido por isso três vezes. O `+1` do "há mais?" também
#: cabe: 500 + 1 continua longe do teto.
POR_PAGINA_MAXIMO = 500
POR_PAGINA_PADRAO = 200

#: Teto de leituras trazidas para montar o gráfico por hora. Os TOTAIS não
#: passam por aqui — eles saem de `contar()`, que é exato a qualquer tamanho.
#: Só o histograma precisa das linhas, e um evento gigante não pode travar a
#: tela. Quando o teto é atingido, a resposta DIZ (`truncado: true`): um corte
#: silencioso viraria um gráfico que parece completo e não é.
LEITURAS_PARA_O_GRAFICO = 20000


def _pagina(paginas_de: int, tamanho: int, indice: int) -> str:
    """O trecho `offset`/`limit` de uma consulta paginada."""
    return f"&offset={paginas_de + indice * tamanho}&limit={tamanho}"


def _todas_as_linhas(caminho: str, teto: int = None) -> tuple:
    """Traz uma tabela inteira em páginas de 1.000, até o teto.

    Devolve `(linhas, truncado)`. O `order` tem de vir no caminho: sem ordem
    definida, o PostgREST pode repetir e pular linhas entre páginas — duas
    páginas somariam 2.000 linhas com repetidas dentro.

    `teto=None` resolve para `LEITURAS_PARA_O_GRAFICO` AQUI DENTRO, e não no
    `def`. Escrito como valor padrão, o Python o congelaria na importação do
    módulo: mudar a constante depois não teria efeito nenhum, e o teste que
    força o truncamento passaria por engano — medindo o caminho que nunca
    trunca e chamando isso de "avisou".
    """
    if teto is None:
        teto = LEITURAS_PARA_O_GRAFICO
    linhas, inicio = [], 0
    while inicio < teto:
        lote = supabase("GET", f"{caminho}&offset={inicio}&limit=1000") or []
        linhas += lote
        if len(lote) < 1000:
            return linhas, False
        inicio += 1000
    return linhas, True


def _evento_do_pedido(pedido_id_int: int) -> dict:
    return (supabase(
        "GET",
        f"producao_acesso_pedidos?pedido_id_int=eq.{int(pedido_id_int)}&select="
        "pedido_id_int,evento_id,publicado_em,total_credenciais,qr_gerado_em,"
        "qr_revogado_em,status,created_at",
    ) or [None])[0]


def _modelos_do_pedido(pedido_id_int: int) -> list:
    """Os modelos do ERP, com a marca de quais a portaria tem como ler.

    Os dois lados juntos de propósito. O atendente precisa ver o modelo QUE NÃO
    SOBE tanto quanto os que sobem — senão ele conta os setores na tela, acha
    que falta um, e abre um chamado sobre um ingresso que simplesmente não tem
    código impresso. É a regra do usuário sobre o modelo 1000283.

    Duas idas ao banco, e não três: a versão anterior chamava
    `_modelos_legiveis()`, que consulta `pedidos_modelos` DE NOVO só para
    devolver a lista filtrada. Quem decide o que é legível continua sendo
    `acesso_publicacao.numeracao_do_modelo` — a mesma função que o agente usa
    para decidir o que publicar, e que `_modelos_legiveis` também chama. Duas
    definições de "tem código" divergiriam no dia em que uma delas mudasse.
    """
    import acesso_publicacao

    todos = supabase(
        "GET",
        f"pedidos_modelos?id_int=eq.{int(pedido_id_int)}"
        "&select=id,nome_modelo,quantidade,numeracao_inicio,numeracao_fim,"
        "tipo_numeracao,ordem,amostra_num_id&order=ordem.asc",
    ) or []

    ids = sorted({str(m["amostra_num_id"]) for m in todos if m.get("amostra_num_id")})
    numeracoes = {}
    if ids:
        lista = ",".join(f'"{i}"' for i in ids)
        numeracoes = {
            str(n["id"]): n.get("elements")
            for n in (supabase(
                "GET", f"producao_numeracoes?id=in.({lista})&select=id,elements"
            ) or [])
        }

    return [{
        "modelo_id": int(m["id"]),
        "nome": (m.get("nome_modelo") or f"Modelo {m['id']}").strip(),
        "quantidade": int(m.get("quantidade") or 0),
        "numero_de": m.get("numeracao_inicio"),
        "numero_ate": m.get("numeracao_fim"),
        "tipo_numeracao": m.get("tipo_numeracao"),
        "sobe_ao_controle": bool(acesso_publicacao.numeracao_do_modelo(
            numeracoes.get(str(m.get("amostra_num_id"))))),
    } for m in todos]


def _painel_do_pedido(pedido_id_int: int) -> dict:
    """Tudo que a tela da gráfica mostra sobre um pedido, numa resposta só."""
    pedido_id_int = int(pedido_id_int)
    modelos = _modelos_do_pedido(pedido_id_int)
    if not modelos:
        raise HTTPException(
            status_code=404,
            detail=f"o pedido {pedido_id_int} nao tem modelos cadastrados no ERP",
        )

    publicacao = _evento_do_pedido(pedido_id_int)
    evento_id = (publicacao or {}).get("evento_id")

    evento, setores, aparelhos = None, [], []
    if evento_id:
        evento = (supabase(
            "GET",
            f"producao_acesso_eventos?id=eq.{evento_id}"
            "&select=id,nome_evento,data_evento,local_evento,status,dono_auth_id,created_at",
        ) or [None])[0]
        setores = _setores_do_evento(evento_id, pedido_id_int)
        aparelhos = _aparelhos_do_evento(evento_id)

    return {
        "pedido": pedido_id_int,
        "modelos": modelos,
        "publicacao": {
            "existe": bool(publicacao),
            # Aberta quer dizer "o agente ainda pode mandar lote". É o estado
            # normal de um pedido que talvez seja reimpresso; fechada é que
            # exige reabrir antes.
            "aberta": bool(publicacao) and not (publicacao or {}).get("publicado_em"),
            "publicado_em": (publicacao or {}).get("publicado_em"),
            "total_credenciais": (publicacao or {}).get("total_credenciais") or 0,
            "qr_gerado_em": (publicacao or {}).get("qr_gerado_em"),
            "qr_revogado_em": (publicacao or {}).get("qr_revogado_em"),
        },
        "evento": evento,
        "setores": setores,
        "aparelhos": aparelhos,
        # O dashboard NÃO vem junto: ele custa cinco contagens, uma varredura
        # das leituras e uma contagem por setor. A tela pede em separado,
        # quando o atendente toca em "Ver o painel de público" — e até lá a
        # abertura do pedido não paga por ele.
        "tem_dashboard": bool(evento_id),
    }


def _setores_do_evento(evento_id: str, pedido_id_int=None) -> list:
    """Os setores com a configuração e os bloqueios. SEM contagem nenhuma.

    Duas consultas, as duas para o evento inteiro: uma de setores e uma de
    bloqueios. O custo não cresce com o número de setores — que é justamente o
    que fazia esta tela demorar.
    """
    filtro = f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
    if pedido_id_int is not None:
        filtro += f"&pedido_id_int=eq.{int(pedido_id_int)}"
    setores = supabase(
        "GET",
        filtro + "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em,"
                 "pedido_id_int,modelo_id&order=nome.asc",
    ) or []

    bloqueios = supabase(
        "GET",
        f"producao_acesso_bloqueios?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,setor_id,de,ate,motivo,created_at&order=de.asc",
    ) or []

    # NENHUMA contagem aqui. É a decisão do usuário em 16/08/2026: "não deve
    # carregar de imediato os códigos, apenas se solicitado, cada setor de uma
    # vez".
    #
    # Medido contra produção: com as contagens, abrir o pedido 18560 custava 20
    # idas ao banco — cada uma a ~160ms de Ohio até o Supabase — e cinco delas
    # existiam só para escrever um número que ninguém tinha pedido ainda. Agora
    # a abertura traz a ESTRUTURA (o que o pedido tem), e os números de cada
    # setor vêm com a lista de ingressos daquele setor, quando o atendente a
    # abre. Ver `_ingressos_do_setor`, que devolve os dois juntos.
    for s in setores:
        s["bloqueios"] = [b for b in bloqueios
                          if str(b["setor_id"]) == str(s["id"])]
    return setores


def _numeros_do_setor(setor_id: str) -> dict:
    """As três contagens de um setor. Custam três idas ao banco, e por isso
    só acontecem quando alguém pede aquele setor."""
    return {
        "publicadas": contar(
            f"producao_acesso_credenciais?setor_id=eq.{setor_id}&origem=eq.qr_ideal"),
        "codigos_cliente": contar(
            f"producao_acesso_credenciais?setor_id=eq.{setor_id}&origem=eq.cliente"),
        "entradas": contar(
            f"producao_acesso_leituras?setor_id=eq.{setor_id}"
            "&resultado=eq.permitido&tipo=eq.entrada"),
    }


def _aparelhos_do_evento(evento_id: str) -> list:
    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}"
        "&select=id,nome,status,ultimo_visto,token_hash,created_at&order=nome.asc",
    ) or []
    ids = [str(a["id"]) for a in aparelhos]
    vinculos = (supabase(
        "GET",
        f"producao_acesso_dispositivo_setores?dispositivo_id=in.({','.join(ids)})"
        "&select=dispositivo_id,setor_id",
    ) or []) if ids else []

    for a in aparelhos:
        a["setores"] = [v["setor_id"] for v in vinculos
                        if str(v["dispositivo_id"]) == str(a["id"])]
        # `token_hash` é segredo e não pode viajar; o que a tela precisa saber
        # é só se o aparelho já foi pareado alguma vez.
        a["pareado"] = bool(a.pop("token_hash", None))
    return aparelhos


# ── O dashboard de público ──────────────────────────────────────────────────

#: Os motivos que a portaria grava numa recusa, com o nome que o atendente
#: entende. Um dashboard que dissesse "setor_nao_autorizado" obrigaria quem
#: está lendo a saber o vocabulário do banco.
MOTIVOS = {
    "desconhecido": "Código não existe neste evento",
    "ja_entrou": "Ingresso já usado",
    "setor_nao_autorizado": "Aparelho não valida este setor",
    "fora_da_janela": "Fora do horário do setor",
    "bloqueado": "Faixa bloqueada",
    "cancelado": "Credencial cancelada",
    "fora_do_evento": "De outro evento",
    "erro_de_leitura": "Falha na leitura",
}


def _dashboard(evento_id: str, setores: list, modelos: list) -> dict:
    """Os números de gerenciamento de público deste evento.

    Pedido em separado da abertura do pedido, de propósito: ele custa cinco
    contagens, uma varredura das leituras e duas contagens por setor. Quem
    abre um pedido para renomear um setor não pode pagar por tudo isso.

    Os totais saem de `contar()`, que é exato em qualquer tamanho — inclusive
    `publicado` e `cortesias`, que ANTES eram a soma dos setores. Somar exigia
    contar setor por setor; perguntar ao evento inteiro é uma consulta só, e o
    número é o mesmo.

    Só o histograma por hora precisa das linhas, e ele avisa quando trunca.
    """
    contratado = sum(m["quantidade"] for m in modelos if m["sobe_ao_controle"])
    publicado = contar(f"producao_acesso_credenciais?evento_id=eq.{evento_id}"
                       "&origem=eq.qr_ideal")
    cortesias = contar(f"producao_acesso_credenciais?evento_id=eq.{evento_id}"
                       "&origem=eq.cliente")

    entradas = contar(f"producao_acesso_leituras?evento_id=eq.{evento_id}"
                      "&resultado=eq.permitido&tipo=eq.entrada")
    saidas = contar(f"producao_acesso_leituras?evento_id=eq.{evento_id}"
                    "&resultado=eq.permitido&tipo=eq.saida")
    recusadas = contar(f"producao_acesso_leituras?evento_id=eq.{evento_id}"
                       "&resultado=eq.negado")

    leituras, truncado = _todas_as_linhas(
        f"producao_acesso_leituras?evento_id=eq.{evento_id}"
        "&select=momento,resultado,motivo,tipo,setor_id,dispositivo_id&order=momento.asc")

    por_hora = defaultdict(lambda: {"entradas": 0, "saidas": 0, "recusas": 0})
    entradas_por_setor = Counter()
    for l in leituras:
        if (l.get("resultado") == "permitido" and l.get("tipo") != "saida"
                and l.get("setor_id")):
            entradas_por_setor[str(l["setor_id"])] += 1

        hora = _hora_cheia(l.get("momento"))
        if not hora:
            continue
        if l.get("resultado") == "negado":
            por_hora[hora]["recusas"] += 1
        elif l.get("tipo") == "saida":
            por_hora[hora]["saidas"] += 1
        else:
            por_hora[hora]["entradas"] += 1

    motivos = Counter(l.get("motivo") for l in leituras
                      if l.get("resultado") == "negado")

    bloqueados = sum(max(0, (b["ate"] - b["de"] + 1))
                     for s in setores for b in s.get("bloqueios") or [])

    return {
        "publico": {
            "contratado": contratado,
            "publicado": publicado,
            "cortesias": cortesias,
            "entraram": entradas,
            "sairam": saidas,
            # Quem está DENTRO agora. Só faz sentido onde há reentrada; nos
            # setores de entrada única, saídas são sempre zero e o número
            # coincide com "entraram" — que é o comportamento certo.
            "presentes": max(0, entradas - saidas),
            "recusadas": recusadas,
            "bloqueados": bloqueados,
            # A pergunta que o dono do evento faz primeiro: quantos dos que
            # compraram apareceram? Sem `publicado` ainda não há denominador,
            # e devolver 0% mentiria — devolve nulo e a tela diz "—".
            "comparecimento_pct": (round(entradas * 100.0 / publicado, 1)
                                   if publicado else None),
        },
        # Sai da MESMA varredura de leituras que o histograma usa — nenhuma
        # consulta a mais. Contar por setor no banco custaria uma ida por
        # setor, e o número já está aqui.
        "por_setor": [{
            "setor_id": s["id"],
            "nome": s["nome"],
            "contratado": s.get("quantidade") or 0,
            "entraram": entradas_por_setor.get(str(s["id"]), 0),
            "ocupacao_pct": (round(entradas_por_setor.get(str(s["id"]), 0)
                                   * 100.0 / s["quantidade"], 1)
                             if s.get("quantidade") else None),
        } for s in setores],
        "recusas": [{"motivo": m or "sem motivo",
                     "rotulo": MOTIVOS.get(m, m or "sem motivo"),
                     "quantas": q}
                    for m, q in motivos.most_common()],
        "por_hora": [{"hora": h, **v} for h, v in sorted(por_hora.items())],
        "pico": max(((h, v["entradas"]) for h, v in por_hora.items()),
                    key=lambda x: x[1], default=(None, 0))[0],
        # Nenhum corte silencioso: quando o histograma não cabe no teto, a
        # resposta diz. Um gráfico cortado que não avisa se lê como o evento
        # inteiro — e o número que ele contradiz (`entraram`) está logo acima.
        "grafico_truncado": truncado,
        "leituras_lidas": len(leituras),
    }


def _hora_cheia(momento) -> str:
    """"2026-08-15T22:33:16+00:00" → "2026-08-15T22:00". Nulo vira nulo."""
    if not momento:
        return ""
    try:
        d = datetime.fromisoformat(str(momento).replace("Z", "+00:00"))
    except ValueError:
        return ""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.strftime("%Y-%m-%dT%H:00")


# ── A lista de ingressos de um setor ────────────────────────────────────────

def _ingressos_do_setor(setor_id: str, pagina: int, por_pagina: int,
                        busca=None) -> dict:
    """Os ingressos de um setor, com a situação de cada um.

    O CÓDIGO NÃO ENTRA. A lista traz o número (que é o que está impresso e o
    que o atendente procura), a origem e a situação. `codigo_visivel` só sai
    para os códigos que o próprio cliente carregou — são dele, e sem vê-los
    ele não tem como administrar a própria lista de staff.
    """
    setor = _setor(setor_id)
    por_pagina = max(1, min(int(por_pagina or POR_PAGINA_PADRAO), POR_PAGINA_MAXIMO))
    pagina = max(1, int(pagina or 1))

    filtro = f"producao_acesso_credenciais?setor_id=eq.{setor_id}"
    if busca not in (None, ""):
        try:
            filtro += f"&numero=eq.{int(busca)}"
        except (TypeError, ValueError):
            # Busca por texto cai no código visível, que é o único texto que
            # existe aqui. `ilike` com o termo entre asteriscos é o "contém"
            # do PostgREST.
            seguro = str(busca).replace("*", "").replace(",", "").replace("&", "")[:64]
            filtro += f"&codigo_visivel=ilike.*{seguro}*"

    # `order` explícito e sempre o mesmo: sem ele, duas páginas do PostgREST
    # podem repetir e pular linhas, e a tela mostraria o mesmo ingresso duas
    # vezes em páginas diferentes.
    #
    # Pede UMA linha a mais do que cabe na página. É como se sabe que "há
    # mais" sem uma segunda consulta — e sem prometer um total que o teto de
    # 1.000 do PostgREST não deixaria contar de graça.
    linhas = supabase(
        "GET",
        filtro + "&select=id,numero,codigo_visivel,origem,status,created_at"
                 "&order=numero.asc,created_at.asc"
                 f"&offset={(pagina - 1) * por_pagina}&limit={por_pagina + 1}",
    ) or []
    ha_mais = len(linhas) > por_pagina
    linhas = linhas[:por_pagina]

    entradas = _entradas_por_credencial([l["id"] for l in linhas])
    faixas = [(b["de"], b["ate"], b["motivo"]) for b in (supabase(
        "GET",
        f"producao_acesso_bloqueios?setor_id=eq.{setor_id}&status=eq.ativo"
        "&select=de,ate,motivo",
    ) or [])]

    ingressos = []
    for l in linhas:
        numero = l.get("numero")
        bloqueio = next((m for de, ate, m in faixas
                         if numero is not None and de <= numero <= ate), None)
        entrada = entradas.get(l["id"])
        ingressos.append({
            "id": l["id"],
            "numero": numero,
            # Só o do cliente. O do QR Ideal não existe em claro em lugar
            # nenhum — nem aqui, nem no banco.
            "codigo": l.get("codigo_visivel") if l.get("origem") == "cliente" else None,
            "origem": l.get("origem"),
            "situacao": _situacao(l, bloqueio, entrada),
            "motivo_bloqueio": bloqueio,
            "entrou_em": entrada,
        })

    return {
        "setor": {"id": setor["id"], "nome": setor.get("nome"),
                  "quantidade": setor.get("quantidade")},
        "pagina": pagina,
        "por_pagina": por_pagina,
        "ha_mais": ha_mais,
        "ingressos": ingressos,
        # Os números deste setor vêm de carona, e só na PRIMEIRA página: quem
        # abriu a lista está olhando este setor agora, e é o momento certo de
        # contar. Repeti-los a cada página seriam três idas ao banco por toque
        # em "Próximos" para escrever o mesmo número.
        "numeros": _numeros_do_setor(setor["id"]) if pagina == 1 else None,
    }


def _situacao(credencial: dict, bloqueio, entrada) -> str:
    if (credencial.get("status") or "ativo") != "ativo":
        return "cancelado"
    if bloqueio:
        return "bloqueado"
    if entrada:
        return "entrou"
    return "disponivel"


def _entradas_por_credencial(ids: list) -> dict:
    """{credencial_id: momento da primeira entrada permitida}.

    Uma consulta para a página inteira, e não uma por ingresso: uma página de
    200 faria 200 idas ao banco para desenhar uma lista.
    """
    if not ids:
        return {}
    lista = ",".join(f'"{i}"' for i in ids)
    linhas = supabase(
        "GET",
        f"producao_acesso_leituras?credencial_id=in.({lista})"
        "&resultado=eq.permitido&tipo=eq.entrada"
        "&select=credencial_id,momento&order=momento.asc",
    ) or []
    primeira = {}
    for l in linhas:
        primeira.setdefault(str(l["credencial_id"]), l.get("momento"))
    return primeira


def _setor(setor_id: str) -> dict:
    setor_id = _uuid(setor_id, "setor")
    linha = (supabase(
        "GET",
        f"producao_acesso_setores?id=eq.{setor_id}"
        "&select=id,evento_id,nome,quantidade,abre_em,fecha_em",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=404, detail="setor nao encontrado")
    return linha


def _aparelho(aparelho_id: str) -> dict:
    aparelho_id = _uuid(aparelho_id, "aparelho")
    linha = (supabase(
        "GET",
        f"producao_acesso_dispositivos?id=eq.{aparelho_id}&select=id,evento_id,nome",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=404, detail="aparelho nao encontrado")
    return linha


def _evento(evento_id: str) -> dict:
    evento_id = _uuid(evento_id, "evento")
    linha = (supabase(
        "GET", f"producao_acesso_eventos?id=eq.{evento_id}&select=id,nome_evento",
    ) or [None])[0]
    if not linha:
        raise HTTPException(status_code=404, detail="evento nao encontrado")
    return linha


# ── A lista de pedidos com controle de acesso ───────────────────────────────

def _pedidos_com_controle(limite: int = 50) -> list:
    """Os pedidos que já têm alguma coisa no Ideal Control, mais novos primeiro.

    É o que a tela mostra antes de alguém pesquisar: sem isto, ela abriria numa
    caixa de busca vazia e o atendente teria de saber o número de cabeça.
    """
    limite = max(1, min(int(limite or 50), 200))
    pedidos = supabase(
        "GET",
        "producao_acesso_pedidos?select=pedido_id_int,evento_id,publicado_em,"
        f"total_credenciais,created_at&order=created_at.desc&limit={limite}",
    ) or []

    ids = sorted({str(p["evento_id"]) for p in pedidos if p.get("evento_id")})
    eventos = {}
    if ids:
        lista = ",".join(f'"{i}"' for i in ids)
        eventos = {str(e["id"]): e for e in (supabase(
            "GET",
            f"producao_acesso_eventos?id=in.({lista})&select=id,nome_evento,data_evento",
        ) or [])}

    for p in pedidos:
        ev = eventos.get(str(p.get("evento_id")))
        p["nome_evento"] = (ev or {}).get("nome_evento")
        p["data_evento"] = (ev or {}).get("data_evento")
    return pedidos


# ── As rotas ────────────────────────────────────────────────────────────────
#
# Todas passam por `_equipe`. Nenhuma pede elevação: a decisão do usuário é que
# estar logado como ADM ou Atendimento basta. O que essa decisão NÃO dispensa é
# a conferência do JWT — sem ela, "sem senha" viraria "sem porta".

@router.get("/pedidos")
def listar_pedidos(limite: int = 50, authorization: str = Header(None)):
    _equipe(authorization)
    return {"pedidos": _pedidos_com_controle(limite)}


@router.get("/pedidos/{pedido}")
def ver_pedido(pedido: int, authorization: str = Header(None)):
    _equipe(authorization)
    return _painel_do_pedido(pedido)


@router.get("/setores/{setor_id}/ingressos")
def listar_ingressos(setor_id: str, pagina: int = 1,
                     por_pagina: int = POR_PAGINA_PADRAO, busca: str = None,
                     authorization: str = Header(None)):
    _equipe(authorization)
    return _ingressos_do_setor(setor_id, pagina, por_pagina, busca)


@router.get("/pedidos/{pedido}/dashboard")
def ver_dashboard(pedido: int, authorization: str = Header(None)):
    """O painel de público, pedido em separado da abertura do pedido.

    Decisão do usuário em 16/08/2026: a abertura traz a estrutura, e o que
    custa contagem só vem quando alguém pede.
    """
    _equipe(authorization)
    pedido = int(pedido)
    publicacao = _evento_do_pedido(pedido)
    evento_id = (publicacao or {}).get("evento_id")
    if not evento_id:
        raise HTTPException(status_code=404,
                            detail="este pedido ainda nao virou evento")
    return _dashboard(evento_id,
                      _setores_do_evento(evento_id, pedido),
                      _modelos_do_pedido(pedido))


@router.patch("/eventos/{evento_id}")
def gravar_evento(evento_id: str, corpo: dict, authorization: str = Header(None)):
    _equipe(authorization)
    # O id gravado é o que voltou do banco, e não o que chegou na URL: assim a
    # conferência de formato de `_evento()` cobre também a escrita.
    return cfg._aplicar_evento(_evento(evento_id)["id"], corpo)


@router.patch("/setores/{setor_id}")
def gravar_setor(setor_id: str, corpo: dict, authorization: str = Header(None)):
    _equipe(authorization)
    return cfg._aplicar_setor(_setor(setor_id), corpo)


@router.post("/setores/{setor_id}/bloqueios")
def bloquear(setor_id: str, corpo: dict, authorization: str = Header(None)):
    quem = _equipe(authorization)
    return cfg._aplicar_bloqueio(_setor(setor_id), corpo, quem["id"])


@router.delete("/setores/{setor_id}/bloqueios/{bloqueio_id}")
def liberar(setor_id: str, bloqueio_id: str, authorization: str = Header(None)):
    _equipe(authorization)
    return cfg._aplicar_liberacao(_setor(setor_id), _uuid(bloqueio_id, "bloqueio"))


@router.post("/eventos/{evento_id}/aparelhos")
def criar_aparelho(evento_id: str, corpo: dict, authorization: str = Header(None)):
    _equipe(authorization)
    return cfg._aplicar_aparelho_novo(_evento(evento_id)["id"], corpo)


@router.patch("/aparelhos/{aparelho_id}")
def gravar_aparelho(aparelho_id: str, corpo: dict, authorization: str = Header(None)):
    _equipe(authorization)
    return cfg._aplicar_aparelho(_aparelho(aparelho_id), corpo)


@router.post("/aparelhos/{aparelho_id}/codigo")
def novo_codigo(aparelho_id: str, authorization: str = Header(None)):
    _equipe(authorization)
    return cfg._aplicar_novo_codigo(_aparelho(aparelho_id))


@router.post("/setores/{setor_id}/codigos")
def importar_codigos(setor_id: str, corpo: dict, authorization: str = Header(None)):
    """Os códigos de staff e cortesia, carregados pela gráfica.

    O `setor_id` vem da URL e sobrescreve qualquer um que viesse no corpo: a
    tela já está dentro de um setor, e aceitar um segundo pela porta dos fundos
    deixaria os códigos caírem em outro portão sem ninguém perceber.
    """
    _equipe(authorization)
    setor = _setor(setor_id)
    return cfg._aplicar_codigos(setor["evento_id"],
                                {**corpo, "setor_id": setor["id"]})
