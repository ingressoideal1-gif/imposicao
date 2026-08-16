# -*- coding: utf-8 -*-
"""O QR do Pedido responde a mesma coisa nas duas pilhas.

Mesmo padrão da paridade da tela interna: bate nos dois endereços de verdade,
com o MESMO JWT, e compara.

## O que aqui é barato e o que é caro

As recusas — caminho que não é número, método errado, rota que não existe, sem
sessão — são baratas: não escrevem nada e rodam sempre que houver um usuário de
teste no ambiente.

Gerar um QR de verdade é caro, e por isso é opcional: **gerar REVOGA o
anterior**. Quem gera duas vezes mata o primeiro token, e num pedido de cliente
isso é um QR que para de abrir. Então essa metade só roda quando
`QR_PEDIDO_DE_TESTE` disser em qual pedido pode mexer.

## A prova que essa metade dá, e que nenhum teste de mesa dá

Os casos de mesa (`assinatura_test.ts` e `test_assinatura_paridade.py`) provam
que as duas implementações do HMAC concordam com um segredo FIXO, de mesa. O que
eles não podem provar é que as duas pilhas estão usando o MESMO SEGREDO DE
PRODUÇÃO — e é justamente isso que invalidaria todo QR em circulação.

Aqui a prova é cruzada e contra o banco de verdade: o token que uma pilha emite,
a outra abre pela rota `/evento`. Se os segredos divergirem, a assinatura não
bate e o teste falha na hora, em vez de o cliente descobrir no celular dele.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import pytest

PYTHON = "https://imposicao.onrender.com/api/acesso"
EDGE_QR = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-pedido"
EDGE_EVENTO = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-evento"

# O Render dorme quando ninguém usa, e acordar leva quase um minuto.
ESPERA = 120

EMAIL = os.environ.get("INTERNO_EMAIL_DE_TESTE")
SENHA = os.environ.get("INTERNO_SENHA_DE_TESTE")
URL_SUPABASE = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not (EMAIL and SENHA and URL_SUPABASE and ANON):
    # Em desenvolvimento os mesmos valores vivem no `.env.local`, que o git
    # ignora. Sem esta ponte o arquivo inteiro pularia na máquina de quem o
    # escreveu — e um teste que nunca roda não prova nada.
    try:
        import db

        EMAIL = EMAIL or db.ler_env_local("INTERNO_EMAIL_DE_TESTE")
        SENHA = SENHA or db.ler_env_local("INTERNO_SENHA_DE_TESTE")
        URL_SUPABASE = URL_SUPABASE or db.ler_env_local("NEXT_PUBLIC_SUPABASE_URL")
        ANON = ANON or db.ler_env_local("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    except Exception:
        pass

pytestmark = pytest.mark.skipif(
    not (EMAIL and SENHA and URL_SUPABASE and ANON),
    reason="defina INTERNO_EMAIL_DE_TESTE e INTERNO_SENHA_DE_TESTE (usuário real)",
)

PEDIDO_DE_TESTE = os.environ.get("QR_PEDIDO_DE_TESTE")


@pytest.fixture(scope="module")
def jwt():
    """Entra de verdade e devolve o token da sessão."""
    corpo = json.dumps({"email": EMAIL, "password": SENHA}).encode()
    req = urllib.request.Request(
        f"{URL_SUPABASE.rstrip('/')}/auth/v1/token?grant_type=password",
        data=corpo,
        headers={"apikey": ANON, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=ESPERA) as r:
        return json.loads(r.read().decode())["access_token"]


def _pedir(url, metodo="POST", token=None):
    """Devolve (status, corpo). Recusa NÃO levanta: comparar como os dois
    recusam é metade do teste."""
    cabecalhos = {}
    if token:
        cabecalhos["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=cabecalhos, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=ESPERA) as r:
            return r.status, json.loads(r.read().decode())
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


def _dos_dois(caminho, token, metodo="POST"):
    a = _pedir(f"{PYTHON}/{caminho}", metodo, token)
    b = _pedir(f"{EDGE_QR}/{caminho}", metodo, token)
    if _ainda_nao_subiu(b):
        pytest.skip("a Edge Function `acesso-pedido` ainda não foi publicada")
    if b[0] == 503:
        pytest.skip(f"a Edge Function ainda não tem o segredo do QR: {b[1]}")
    assert a[0] == b[0], f"{caminho}: status diferente — Render {a[0]}, Edge {b[0]}"
    return a[1], b[1]


def test_caminho_que_nao_e_numero_recusa_igual(jwt):
    """O 422 do FastAPI, campo a campo — inclusive a `loc`.

    Vem ANTES da sessão nos dois lados, porque o Starlette valida o parâmetro
    antes de a rota rodar. Uma ordem diferente faria a mesma URL responder 401
    num endereço e 422 no outro.
    """
    a, b = _dos_dois("pedidos/nao-e-numero/qr", jwt)
    assert a == b, f"o 422 diverge:\n  Render {a}\n  Edge   {b}"


def test_metodo_errado_recusa_igual(jwt):
    a, b = _dos_dois("pedidos/1/qr", jwt, metodo="GET")
    assert a == b


def test_rota_desconhecida_recusa_igual(jwt):
    a, b = _dos_dois("pedidos/1/nada-disso", jwt)
    assert a == b


def test_sem_sessao_recusa_igual():
    """O portão do Supabase recusa o JWT malformado ANTES da função; o Render
    recusa dentro dela. Os dois têm de dizer 401 — o corpo pode diferir, porque
    um deles é o gateway falando."""
    a = _pedir(f"{PYTHON}/pedidos/1/qr", "POST", "sopa")
    b = _pedir(f"{EDGE_QR}/pedidos/1/qr", "POST", "sopa")
    if _ainda_nao_subiu(b):
        pytest.skip("a Edge Function `acesso-pedido` ainda não foi publicada")
    assert a[0] == b[0] == 401, f"Render {a}, Edge {b}"


# ─── A metade que emite ───────────────────────────────────────────────────────

precisa_de_pedido = pytest.mark.skipif(
    not PEDIDO_DE_TESTE,
    reason="defina QR_PEDIDO_DE_TESTE com um pedido em que se possa gerar QR "
           "(gerar REVOGA o QR anterior daquele pedido)",
)


def _token_da_url(url):
    return urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["t"][0]


@precisa_de_pedido
def test_as_duas_pilhas_geram_a_mesma_forma_de_url(jwt):
    a, b = _dos_dois(f"pedidos/{PEDIDO_DE_TESTE}/qr", jwt)
    assert a["pedido"] == b["pedido"] == int(PEDIDO_DE_TESTE)
    # O token muda a cada geração (o vencimento entra na assinatura), então o
    # que se compara é o resto do endereço.
    assert a["url"].split("?t=")[0] == b["url"].split("?t=")[0], (
        f"o painel apontado diverge: {a['url']} vs {b['url']}"
    )


@precisa_de_pedido
def test_o_python_abre_o_qr_que_a_edge_function_emitiu(jwt):
    """A prova de que os dois lados usam o MESMO segredo de produção."""
    situacao, corpo = _pedir(f"{EDGE_QR}/pedidos/{PEDIDO_DE_TESTE}/qr", "POST", jwt)
    assert situacao == 200, f"a Edge Function não gerou o QR: {situacao} {corpo}"

    token = _token_da_url(corpo["url"])
    situacao, esqueleto = _pedir(
        f"{PYTHON}/evento?t={urllib.parse.quote(token)}", "GET"
    )
    assert situacao == 200, f"o Render recusou o QR da Edge Function: {esqueleto}"
    assert esqueleto["pedido"] == int(PEDIDO_DE_TESTE)


@precisa_de_pedido
def test_a_edge_function_abre_o_qr_que_o_python_emitiu(jwt):
    """O caminho contrário, que é o que protege quem já tem QR na mão."""
    situacao, corpo = _pedir(f"{PYTHON}/pedidos/{PEDIDO_DE_TESTE}/qr", "POST", jwt)
    assert situacao == 200, f"o Render não gerou o QR: {situacao} {corpo}"

    token = _token_da_url(corpo["url"])
    situacao, esqueleto = _pedir(
        f"{EDGE_EVENTO}?t={urllib.parse.quote(token)}", "GET"
    )
    assert situacao == 200, f"a Edge Function recusou o QR do Render: {esqueleto}"
    assert esqueleto["pedido"] == int(PEDIDO_DE_TESTE)


@precisa_de_pedido
def test_o_qr_anterior_morre_quando_outro_e_gerado(jwt):
    """A revogação é o conserto de quando o QR cai na conta errada.

    Sem ela, quem recebeu a imagem antiga por WhatsApp continuaria podendo
    reivindicar o pedido depois de o atendente ter gerado outro.

    ## A espera de um segundo, que não é frescura

    O corpo assinado é `<pedido>.<vencimento>`, e o vencimento tem resolução de
    UM SEGUNDO. Duas gerações dentro do mesmo segundo produzem o MESMO token,
    byte a byte — e aí não há nada a revogar: o hash guardado continua batendo,
    e o "QR anterior" É o atual.

    Isso não é defeito: dois QR idênticos valem a mesma coisa e vencem juntos.
    Mas sem a espera este teste falha de vez em quando, conforme os dois pedidos
    caiam ou não no mesmo segundo — e teste que pisca é pior do que teste
    nenhum, porque ensina a ignorar vermelho.
    """
    situacao, primeiro = _pedir(f"{EDGE_QR}/pedidos/{PEDIDO_DE_TESTE}/qr", "POST", jwt)
    assert situacao == 200, primeiro

    time.sleep(1.2)

    situacao, segundo = _pedir(f"{EDGE_QR}/pedidos/{PEDIDO_DE_TESTE}/qr", "POST", jwt)
    assert situacao == 200

    velho = _token_da_url(primeiro["url"])
    assert velho != _token_da_url(segundo["url"]), (
        "os dois QR saíram idênticos: a espera de um segundo não foi suficiente"
    )
    for base in (f"{PYTHON}/evento", EDGE_EVENTO):
        situacao, corpo = _pedir(f"{base}?t={urllib.parse.quote(velho)}", "GET")
        assert situacao == 403, f"{base} ainda aceita o QR substituído: {corpo}"
