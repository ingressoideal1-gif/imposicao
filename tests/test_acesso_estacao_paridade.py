# -*- coding: utf-8 -*-
"""A publicação da faixa responde a mesma coisa nas duas pilhas.

Quem chama estas três rotas é o `acesso_publicacao.py` dentro do `NewProd.exe`,
sempre **depois** que o papel já saiu. É o consumidor mais perigoso dos quatro:
quando ele falha, os ingressos existem fisicamente e não valem no banco, e
ninguém descobre até alguém tentar entrar — dias depois, no portão.

## O que este teste escreve no banco: nada

É uma decisão, e ela molda o arquivo inteiro. As recusas (sem segredo, segredo
errado, caminho que não é número, método errado, lote grande demais, pedido que
nunca foi aberto) não escrevem nada, e o `fechar` de um pedido inexistente
carimba uma linha que não existe — um PATCH que casa com zero linhas.

O que sobra de fora é justamente o que mais importa, e por isso tem porta
própria: `ESTACAO_PEDIDO_DE_TESTE`.

## A idempotência do sal, que é o que não pode regredir

Reabrir um pedido tem de devolver o MESMO sal. O cliente reimprime 500 ingressos
de um pedido de 5.000; sal novo invalidaria os 4.500 que já estão na mão das
pessoas, e ninguém descobriria antes da portaria.

Com `ESTACAO_PEDIDO_DE_TESTE` apontando para um pedido, o teste chama `abrir`
nas duas pilhas e exige o mesmo sal. É a única prova possível de que o porte não
sorteia sal onde deveria reencontrar — nenhum teste de mesa alcança isso, porque
o sal mora no banco.

Atenção ao escolher o pedido: `abrir` **reabre** publicação fechada. Num pedido
de verdade isso é reversível (basta republicar), mas não é invisível.
"""
import json
import os
import urllib.error
import urllib.request

import pytest

PYTHON = "https://imposicao.onrender.com/api/acesso"
EDGE = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-estacao"

# O Render dorme quando ninguém usa, e acordar leva quase um minuto.
ESPERA = 120

# Um pedido que o ERP não tem. Serve para exercitar as recusas sem tocar em
# trabalho de cliente nenhum.
INEXISTENTE = 999999999

SEGREDO = os.environ.get("ACESSO_AGENTE_SEGREDO")
if not SEGREDO:
    # Em desenvolvimento o segredo vive no `.env.local`, que o git ignora.
    try:
        import db

        SEGREDO = db.ler_env_local("ACESSO_AGENTE_SEGREDO")
    except Exception:
        pass

pytestmark = pytest.mark.skipif(
    not SEGREDO,
    reason="defina ACESSO_AGENTE_SEGREDO (o mesmo das duas pilhas)",
)

PEDIDO_DE_TESTE = os.environ.get("ESTACAO_PEDIDO_DE_TESTE")


def _pedir(url, metodo="POST", segredo=None, corpo=None):
    """Devolve (status, corpo). Recusa NÃO levanta: comparar como os dois
    recusam é metade do teste."""
    cabecalhos = {"Content-Type": "application/json"}
    if segredo is not None:
        cabecalhos["X-Agente-Segredo"] = segredo
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, headers=cabecalhos, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=ESPERA) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, json.loads(texto)
        except ValueError:
            return e.code, texto


def _ainda_nao_subiu(resposta):
    """A função foi publicada?

    O 404 do portão do Supabase para função inexistente não tem `detail`; o
    nosso 404 de rota desconhecida tem. Distinguir os dois é o que permite este
    arquivo PULAR enquanto a função não subiu, em vez de acusar divergência
    onde não há função nenhuma para divergir.
    """
    situacao, corpo = resposta
    return situacao == 404 and not (isinstance(corpo, dict) and "detail" in corpo)


def _dos_dois(caminho, metodo="POST", segredo=None, corpo=None):
    a = _pedir(f"{PYTHON}/{caminho}", metodo, segredo, corpo)
    b = _pedir(f"{EDGE}/{caminho}", metodo, segredo, corpo)
    if _ainda_nao_subiu(b):
        pytest.skip("a Edge Function `acesso-estacao` ainda não foi publicada")
    if b[0] == 503:
        pytest.skip(f"a Edge Function ainda não tem o segredo do agente: {b[1]}")
    assert a[0] == b[0], f"{caminho}: status diferente — Render {a[0]}, Edge {b[0]}"
    return a[1], b[1]


# ─── As recusas ───────────────────────────────────────────────────────────────


def test_sem_segredo_nenhum_recusa_igual():
    """A trava que impede qualquer um de publicar credencial para qualquer
    pedido. Como o `abrir` devolve o sal, quem passasse daqui calcularia o hash
    de um conteúdo escolhido por ele — é a única forma de forjar ingresso sem
    ter o pool."""
    a, b = _dos_dois(f"pedidos/{INEXISTENTE}/abrir")
    assert a == b, f"a recusa diverge:\n  Render {a}\n  Edge   {b}"


def test_segredo_errado_recusa_igual():
    a, b = _dos_dois(f"pedidos/{INEXISTENTE}/abrir", segredo="nao-e-o-segredo")
    assert a == b


def test_as_tres_rotas_recusam_igual_sem_segredo():
    for rota in ("abrir", "credenciais", "fechar"):
        a, b = _dos_dois(f"pedidos/{INEXISTENTE}/{rota}", segredo="errado")
        assert a == b, f"a rota {rota} recusa diferente"


def test_caminho_que_nao_e_numero_recusa_igual():
    """Vem ANTES do segredo nos dois lados, porque o Starlette valida o
    parâmetro antes de a rota rodar."""
    a, b = _dos_dois("pedidos/nao-e-numero/abrir", segredo=SEGREDO)
    assert a == b, f"o 422 diverge:\n  Render {a}\n  Edge   {b}"


def test_metodo_errado_recusa_igual():
    a, b = _dos_dois(f"pedidos/{INEXISTENTE}/abrir", metodo="GET", segredo=SEGREDO)
    assert a == b


def test_rota_desconhecida_recusa_igual():
    a, b = _dos_dois(f"pedidos/{INEXISTENTE}/nada-disso", segredo=SEGREDO)
    assert a == b


def test_lote_acima_do_maximo_recusa_igual():
    """501 itens. O agente manda 500 exatos; um teto diferente aqui recusaria
    todo lote cheio, e a publicação pararia na primeira remessa."""
    itens = [{"modelo_id": 1, "numero": n, "hash": "x"} for n in range(1, 502)]
    a, b = _dos_dois(
        f"pedidos/{INEXISTENTE}/credenciais", segredo=SEGREDO, corpo={"itens": itens}
    )
    assert a == b, f"o 413 diverge:\n  Render {a}\n  Edge   {b}"


def test_lote_para_pedido_que_nunca_foi_aberto_recusa_igual():
    """409, e não um 500 de chave estrangeira: a mensagem diz o que fazer."""
    a, b = _dos_dois(
        f"pedidos/{INEXISTENTE}/credenciais",
        segredo=SEGREDO,
        corpo={"itens": [{"modelo_id": 1, "numero": 1, "hash": "x"}]},
    )
    assert a == b, f"o 409 diverge:\n  Render {a}\n  Edge   {b}"


def test_fechar_pedido_sem_nada_publicado_responde_igual():
    """Um PATCH que casa com zero linhas — não escreve nada.

    O que se compara aqui é a conta: `total` sai de `contar()`, e não do
    tamanho de uma lista que o PostgREST cortaria em 1.000; `esperado` conta só
    os modelos que a portaria tem como ler.
    """
    a, b = _dos_dois(f"pedidos/{INEXISTENTE}/fechar", segredo=SEGREDO)
    assert a == b, f"o fechamento diverge:\n  Render {a}\n  Edge   {b}"
    assert a == {"total": 0, "esperado": 0, "completo": True}


# ─── A parte que toca num pedido de verdade ───────────────────────────────────

precisa_de_pedido = pytest.mark.skipif(
    not PEDIDO_DE_TESTE,
    reason="defina ESTACAO_PEDIDO_DE_TESTE com um pedido em que se possa abrir "
           "publicação (abrir REABRE publicação fechada)",
)


@precisa_de_pedido
def test_as_duas_pilhas_devolvem_o_mesmo_sal():
    """O que não pode regredir: reabrir devolve o MESMO sal.

    Sal novo invalidaria em silêncio todo ingresso já impresso daquele pedido, e
    a descoberta aconteceria na portaria do evento.
    """
    a, b = _dos_dois(f"pedidos/{PEDIDO_DE_TESTE}/abrir", segredo=SEGREDO)
    assert a["sal"] == b["sal"], "as duas pilhas devolveram sais DIFERENTES"
    assert len(a["sal"]) == 64, "o sal do banco não tem 64 hexadecimais"


@precisa_de_pedido
def test_as_duas_pilhas_leem_a_mesma_tiragem():
    """A tiragem é o teto de cada modelo, e vem do ERP — é ela que impede
    inventar o ingresso 99.999 de uma tiragem de 3.000."""
    a, b = _dos_dois(f"pedidos/{PEDIDO_DE_TESTE}/abrir", segredo=SEGREDO)
    assert a["tiragem"] == b["tiragem"], "a tiragem lida do ERP diverge"
    assert a["reaberto"] == b["reaberto"]


@precisa_de_pedido
def test_ingresso_fora_da_tiragem_recusa_igual():
    """A trava que vale MESMO com o segredo do agente na mão."""
    modelos = _dos_dois(f"pedidos/{PEDIDO_DE_TESTE}/abrir", segredo=SEGREDO)[0]
    tiragem = modelos.get("tiragem") or {}
    if not tiragem:
        pytest.skip("o ERP não tem tiragem para este pedido")
    modelo = sorted(tiragem)[0]

    a, b = _dos_dois(
        f"pedidos/{PEDIDO_DE_TESTE}/credenciais",
        segredo=SEGREDO,
        corpo={"itens": [{"modelo_id": int(modelo), "numero": 999999, "hash": "x"}]},
    )
    assert a == b, f"a recusa por tiragem diverge:\n  Render {a}\n  Edge   {b}"


@precisa_de_pedido
def test_modelo_de_outro_pedido_recusa_igual():
    a, b = _dos_dois(
        f"pedidos/{PEDIDO_DE_TESTE}/credenciais",
        segredo=SEGREDO,
        corpo={"itens": [{"modelo_id": 1, "numero": 1, "hash": "x"}]},
    )
    assert a == b, f"a recusa por modelo diverge:\n  Render {a}\n  Edge   {b}"
