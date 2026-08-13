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


def itens_do_pedido(pedido, tiragem: dict, sal: str, pool):
    """Gera {modelo_id, numero, hash} da TIRAGEM INTEIRA de cada modelo.

    A quantidade vem do ERP, e NÃO do intervalo de folhas deste trabalho. É a
    diferença que decide se o evento funciona: quem imprime 2.000 hoje e 3.000
    na semana que vem ficaria com 2.000 ingressos válidos e 3.000 recusados na
    porta se a faixa seguisse a folha.

    Gerador, e não lista: uma tiragem de 30.000 são 30.000 hashes, e não há
    razão para segurar todos na memória antes de começar a enviar.
    """
    for modelo_id, quantidade in tiragem.items():
        for numero in range(1, int(quantidade) + 1):
            conteudo = pool.conteudo(pedido, modelo_id, numero)
            yield {
                "modelo_id": int(modelo_id),
                "numero": numero,
                "hash": qr_ideal.hash_codigo(conteudo, sal),
            }


def publicar(pedido, pool) -> dict:
    """Abre, envia em lotes e fecha. Devolve o resumo do que o servidor viu."""
    abertura = _post(f"pedidos/{pedido}/abrir")
    sal = abertura["sal"]
    tiragem = {int(k): int(v) for k, v in (abertura.get("tiragem") or {}).items()}
    if not tiragem:
        return {"pedido": pedido, "erro": "o ERP nao tem tiragem para este pedido"}

    enviadas = 0
    lote = []
    for item in itens_do_pedido(pedido, tiragem, sal, pool):
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


def _publicar_protegido(pedido, pool_factory):
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
        if pool is None:
            print(f"[acesso] Faixa do pedido {pedido} NAO publicada: pool ausente.", flush=True)
            return
        resumo = publicar(pedido, pool)
        if resumo.get("completo"):
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


def publicar_em_fundo(pedido, pool_factory):
    """Devolve NA HORA. O trabalho de verdade acontece numa thread.

    `pool_factory` é chamável em vez de o pool já aberto: quem chama não deve
    pagar nem a abertura do arquivo de 24 MB no caminho do operador.
    """
    threading.Thread(
        target=_publicar_protegido,
        args=(pedido, pool_factory),
        daemon=True,
        name=f"PublicarAcesso-{pedido}",
    ).start()
