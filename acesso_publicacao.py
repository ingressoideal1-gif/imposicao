# -*- coding: utf-8 -*-
"""O agente publica a faixa de códigos DEPOIS que o papel já saiu.

A ordem dos fatos é o que importa aqui. O operador está de pé na frente da
impressora, e o agente local existe justamente por causa disso — imposição e
geração de PDF rodam na estação para não depender de rede. Calcular 5.000
hashes leva uns quinze segundos, e esses quinze segundos acontecem numa thread
de fundo, depois que os PDFs foram entregues. Nunca antes.

Se a rede estiver fora, a publicação simplesmente não acontece nesta rodada. O
papel já saiu, o evento é dias depois, e reimprimir republica — a operação toda
é idempotente do lado do servidor.

## Por que fala com o Render, e não com o próprio app local

O `acesso_api.py` roda ao lado deste arquivo, mas na estação ele nem é montado:
a `service_role` do banco não vai para as estações, por decisão registrada lá.
Então este módulo é um CLIENTE HTTP do backend na nuvem, e se identifica com o
`ACESSO_AGENTE_SEGREDO` — um segredo que só autoriza publicar faixa, e nada mais.
"""

import json
import os
import threading
import urllib.error
import urllib.request

import qr_ideal

BASE_ENV = "ACESSO_BASE_URL"
BASE_PADRAO = "https://imposicao.onrender.com"

SEGREDO_ENV = "ACESSO_AGENTE_SEGREDO"

# Lotes de 500. O custo está no KDF, que roda aqui; lote maior não acelera nada
# e só aumenta o que se perde quando uma requisição falha.
LOTE = 500

TIMEOUT = 90


def _base() -> str:
    return (os.environ.get(BASE_ENV) or BASE_PADRAO).rstrip("/")


def _segredo():
    """O segredo, na ordem em que ele pode existir.

    Em desenvolvimento vem do ambiente ou do `.env.local`. Na estação vem do
    `acesso_segredo.py`, que o `build_agent.ps1` gera na hora de compilar e o
    git ignora — não existe no repositório.
    """
    valor = os.environ.get(SEGREDO_ENV)
    if valor:
        return valor
    try:
        import db
        valor = db.ler_env_local(SEGREDO_ENV)
        if valor:
            return valor
    except Exception:
        pass
    try:
        import acesso_segredo
        return getattr(acesso_segredo, "SEGREDO", None)
    except ImportError:
        return None


def _post(caminho: str, corpo=None):
    url = f"{_base()}/api/acesso/{caminho}"
    dados = json.dumps(corpo or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=dados,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Agente-Segredo": _segredo() or "",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        texto = resp.read().decode("utf-8")
        return json.loads(texto) if texto else None


# ── De onde sai o código de cada ingresso ────────────────────────────────────
#
# O QR Ideal tira o código de um pool de 3 milhões. Mas a portaria também
# precisa funcionar com numeração comum: 32 das 59 numerações do catálogo já
# têm um elemento QR, e o cliente que imprimiu com ele espera que o ingresso
# abra a porta.
#
# Isso é possível porque o `engine._render_element` desenha o QR e o código de
# barras a partir do MESMO `val_str` — `prefixo + numero.zfill(pad) + sufixo`.
# A conta abaixo é a réplica dela. Se as duas divergirem, todo ingresso do
# evento é recusado, e só dá para descobrir na portaria.
#
# O que muda é a natureza da proteção, e está registrado de propósito: o `0002`
# é adivinhável por quem tem o `0001`. Mas não é inventável — ele pertence a um
# ingresso de verdade, na mão de outra pessoa. A fraude vira clonagem, e quem a
# pega é a detecção de entrada repetida, não o sigilo do código.

# Ordem de preferência: o seguro primeiro. QR e BARCODE imprimem o mesmo texto,
# então entre os dois a escolha é indiferente — mas a ordem tem de ser fixa
# para o resultado não depender da ordem em que os elementos foram salvos.
_TIPOS_DE_CODIGO = ("QR_IDEAL", "QR", "BARCODE")


def numeracao_do_modelo(elements):
    """O elemento que a portaria vai ler, ou None se não houver.

    Devolve um dicionário achatado — `tipo`, `prefix`, `pad`, `suffix` — em vez
    do elemento cru, para o resto do módulo não depender do formato do editor.

    Recusa o elemento alimentado por coluna do CSV: ali o conteúdo vem da linha,
    e não do número do item. Publicar a conta sequencial gravaria um hash que
    NÃO corresponde ao que foi impresso — todo ingresso recusado, e a causa
    invisível. Melhor não publicar e dizer por quê.
    """
    por_tipo = {}
    for el in (elements or []):
        if not isinstance(el, dict):
            continue
        t = el.get("type")
        if t not in _TIPOS_DE_CODIGO or t in por_tipo:
            continue
        if el.get("source") == "database":
            continue
        if el.get("fixed"):
            # Valor fixo é o mesmo em todos os ingressos: não identifica nada.
            continue
        por_tipo[t] = {
            "tipo": t,
            "prefix": str(el.get("prefix", "") or ""),
            "pad": int(el.get("pad", 0) or 0),
            "suffix": str(el.get("suffix", "") or ""),
        }

    for t in _TIPOS_DE_CODIGO:
        if t in por_tipo:
            return por_tipo[t]
    return None


def conteudo_numeracao(numeracao: dict, numero: int) -> str:
    """O texto que foi impresso no QR ou no código de barras daquele item.

    Réplica de `engine._render_element`, ramo final do `val_str`. O `zfill`
    preenche mas nunca trunca: numa tiragem de 12.000 com `pad=4`, o item
    12.000 sai `12000` — e é isso que vai ao papel.
    """
    pad = int(numeracao.get("pad", 0) or 0)
    cru = str(numero).zfill(pad) if pad > 0 else str(numero)
    return f"{numeracao.get('prefix', '')}{cru}{numeracao.get('suffix', '')}"


def itens_do_pedido(pedido, tiragem: dict, sal: str, pool, numeracoes: dict = None):
    """Gera {modelo_id, numero, hash} da TIRAGEM INTEIRA de cada modelo.

    A quantidade vem do ERP, e NÃO do intervalo de folhas deste trabalho. É a
    diferença que decide se o evento funciona: quem imprime 2.000 hoje e 3.000
    na semana que vem ficaria com 2.000 ingressos válidos e 3.000 recusados na
    porta se a faixa seguisse a folha.

    `numeracoes` é `{modelo_id: numeracao_achatada}`, montado por quem chama a
    partir do trabalho que está sendo impresso — é o único lugar que conhece a
    numeração de cada modelo. Sem ele, todo modelo sai do pool, que é o
    comportamento anterior.

    Modelo cuja numeração este trabalho não conhece é **pulado**: ele publica
    quando for impresso. Publicar com uma conta suposta seria pior do que não
    publicar — gravaria hash errado, e reimprimir não consertaria, porque o
    servidor ignora duplicata.

    Gerador, e não lista: uma tiragem de 30.000 são 30.000 hashes, e não há
    razão para segurar todos na memória antes de começar a enviar.
    """
    for modelo_id, quantidade in tiragem.items():
        num = (numeracoes or {}).get(modelo_id) or (numeracoes or {}).get(str(modelo_id))
        if numeracoes is not None and num is None:
            continue
        usa_pool = num is None or num.get("tipo") == "QR_IDEAL"
        if usa_pool and pool is None:
            continue

        for numero in range(1, int(quantidade) + 1):
            if usa_pool:
                conteudo = pool.conteudo(pedido, modelo_id, numero)
            else:
                conteudo = conteudo_numeracao(num, numero)
            yield {
                "modelo_id": int(modelo_id),
                "numero": numero,
                "hash": qr_ideal.hash_codigo(conteudo, sal),
            }


def publicar(pedido, pool, numeracoes: dict = None) -> dict:
    """Abre, envia em lotes e fecha. Devolve o resumo do que o servidor viu."""
    abertura = _post(f"pedidos/{pedido}/abrir")
    sal = abertura["sal"]
    tiragem = {int(k): int(v) for k, v in (abertura.get("tiragem") or {}).items()}
    if not tiragem:
        return {"pedido": pedido, "erro": "o ERP nao tem tiragem para este pedido"}

    enviadas = 0
    lote = []
    for item in itens_do_pedido(pedido, tiragem, sal, pool, numeracoes):
        lote.append(item)
        if len(lote) >= LOTE:
            _post(f"pedidos/{pedido}/credenciais", {"itens": lote})
            enviadas += len(lote)
            lote = []
    if lote:
        _post(f"pedidos/{pedido}/credenciais", {"itens": lote})
        enviadas += len(lote)

    resumo = _post(f"pedidos/{pedido}/fechar") or {}
    resumo["enviadas"] = enviadas
    return resumo


def _precisa_do_pool(numeracoes) -> bool:
    """Só o QR Ideal depende do pool. Numeração comum se basta."""
    if not numeracoes:
        return True
    return any((n or {}).get("tipo") == "QR_IDEAL" for n in numeracoes.values())


def _publicar_protegido(pedido, pool_factory, numeracoes=None):
    """O que a thread roda. NUNCA levanta: ela morreria sozinha e em silêncio."""
    try:
        if not _segredo():
            print(
                f"[acesso] Faixa do pedido {pedido} NAO publicada: {SEGREDO_ENV} "
                "ausente nesta estacao. O papel saiu normalmente; a portaria e "
                "que nao tera o que conferir ate a faixa subir.",
                flush=True,
            )
            return
        pool = pool_factory()
        if pool is None and _precisa_do_pool(numeracoes):
            # Sem pool, um trabalho de QR Ideal nao tem codigo nenhum a publicar.
            # Um de numeracao comum tem, e por isso a falta do pool deixou de ser
            # motivo para desistir de tudo.
            print(f"[acesso] Faixa do pedido {pedido} NAO publicada: pool ausente.", flush=True)
            return
        resumo = publicar(pedido, pool, numeracoes)
        if resumo.get("erro"):
            print(f"[acesso] Faixa do pedido {pedido} NAO publicada: {resumo['erro']}", flush=True)
        elif resumo.get("enviadas") == 0:
            print(
                f"[acesso] Faixa do pedido {pedido} vazia: nenhum modelo deste "
                "trabalho tem QR ou codigo de barras que a portaria leia.",
                flush=True,
            )
        elif resumo.get("completo"):
            print(f"[acesso] Faixa do pedido {pedido} publicada: {resumo.get('total')} codigos.", flush=True)
        else:
            print(
                f"[acesso] Faixa do pedido {pedido} INCOMPLETA: "
                f"{resumo.get('total')} de {resumo.get('esperado')}. "
                "Reimprimir ou reabrir republica o que falta.",
                flush=True,
            )
    except urllib.error.HTTPError as e:
        corpo = ""
        try:
            corpo = e.read().decode("utf-8")[:200]
        except Exception:
            pass
        print(f"[acesso] Falha ao publicar a faixa do pedido {pedido}: HTTP {e.code} {corpo}", flush=True)
    except Exception as e:
        print(f"[acesso] Falha ao publicar a faixa do pedido {pedido}: {e}", flush=True)


def publicar_em_fundo(pedido, pool_factory, numeracoes=None):
    """Devolve NA HORA. O trabalho de verdade acontece numa thread.

    `pool_factory` é chamável em vez de o pool já aberto: quem chama não deve
    pagar nem a abertura do arquivo de 24 MB no caminho do operador.

    `numeracoes` é `{modelo_id: numeracao_achatada}` do trabalho impresso. Sem
    ele, tudo sai do pool — o comportamento de quando só existia QR Ideal.
    """
    threading.Thread(
        target=_publicar_protegido,
        args=(pedido, pool_factory, numeracoes),
        daemon=True,
        name=f"PublicarAcesso-{pedido}",
    ).start()
