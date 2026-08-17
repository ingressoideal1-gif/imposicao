# -*- coding: utf-8 -*-
"""As duas telas internas respondem a MESMA coisa.

O mesmo padrão da paridade da portaria (Fase 2a), agora para as 12 rotas do
Ideal Control da gráfica: bate nos dois endereços de verdade, com o MESMO JWT,
e compara.

## O que este teste exige, e por quê

`INTERNO_EMAIL_DE_TESTE` e `INTERNO_SENHA_DE_TESTE` no ambiente — um usuário de
verdade, com papel ADM em `imposition_user_permissions`. Não dá para fabricar
um JWT: a Edge Function roda com `verify_jwt = true`, e o portão do Supabase
confere a assinatura antes de invocá-la. Um token inventado morre no portão,
com 401, e o teste estaria medindo o portão em vez da função.

Esse usuário é criado com a chave de serviço (ver o histórico da Fase 2b). Sem
as variáveis, o teste PULA em vez de falhar.

## Só leitura

As oito rotas de escrita não entram aqui, e é uma decisão, não um esquecimento:
elas mudam a configuração de eventos de verdade. A paridade delas se prova pelo
teste de mesa dos validadores (`configuracao_test.ts`), que compara campo a
campo o que cada lado aceita e recusa, sem tocar no banco.

O que este arquivo cobre é o lado que só o banco pode responder: as consultas,
a paginação, as contagens e o dashboard.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

import pytest

PYTHON = "https://imposicao.onrender.com/api/acesso/interno"
EDGE = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/acesso-interno"

# O Render dorme quando ninguém usa, e acordar leva quase um minuto.
ESPERA = 120

EMAIL = os.environ.get("INTERNO_EMAIL_DE_TESTE")
SENHA = os.environ.get("INTERNO_SENHA_DE_TESTE")
URL_SUPABASE = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

pytestmark = pytest.mark.skipif(
    not (EMAIL and SENHA and URL_SUPABASE and ANON),
    reason="defina INTERNO_EMAIL_DE_TESTE e INTERNO_SENHA_DE_TESTE (usuário ADM real)",
)


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


def _pedir(base, caminho, token):
    """Devolve (status, corpo). Recusa NÃO levanta: comparar como os dois
    recusam é metade do teste."""
    req = urllib.request.Request(
        f"{base}/{caminho}", headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=ESPERA) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, json.loads(texto)
        except ValueError:
            return e.code, texto


def _dos_dois(caminho, token):
    a = _pedir(PYTHON, caminho, token)
    b = _pedir(EDGE, caminho, token)
    assert a[0] == b[0], f"{caminho}: status diferente — Render {a[0]}, Edge {b[0]}"
    return a[1], b[1]


@pytest.fixture(scope="module")
def um_pedido(jwt):
    """Um pedido de verdade, para as rotas que precisam de um."""
    situacao, corpo = _pedir(PYTHON, "pedidos?limite=50", jwt)
    assert situacao == 200, f"o Render recusou a lista de pedidos: {situacao} {corpo}"
    pedidos = corpo.get("pedidos") or []
    if not pedidos:
        pytest.skip("não há pedido nenhum no Ideal Control para comparar")
    # O que já virou evento é o que exercita mais código.
    com_evento = [p for p in pedidos if p.get("evento_id")]
    return (com_evento or pedidos)[0]


def test_a_lista_de_pedidos_e_identica(jwt):
    a, b = _dos_dois("pedidos?limite=50", jwt)
    assert a == b, "a lista de pedidos diverge"


def test_o_limite_da_lista_e_respeitado_igual(jwt):
    for limite in ("1", "3", "0", "9999", "abacaxi"):
        a, b = _dos_dois(f"pedidos?limite={limite}", jwt)
        assert a == b, f"a lista diverge com limite={limite}"


def test_o_painel_do_pedido_e_identico(jwt, um_pedido):
    a, b = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    # `cliente` nasceu só do lado Edge em 17/08/2026, quando o Python já estava
    # fora do caminho de produção (decisão do usuário de 16/08/2026). Não é
    # divergência: é uma chave que o Render nunca vai ganhar.
    b_sem_cliente = {k: v for k, v in b.items() if k != "cliente"}
    assert sorted(a) == sorted(b_sem_cliente), "os dois não devolvem os mesmos campos"
    for campo in ("pedido", "modelos", "publicacao", "evento", "setores",
                  "aparelhos", "tem_dashboard"):
        assert a.get(campo) == b.get(campo), f"o campo {campo} diverge"


def test_o_token_do_aparelho_nunca_viaja(jwt, um_pedido):
    """`token_hash` é segredo. A tela precisa saber só se já foi pareado."""
    _, b = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    for aparelho in b.get("aparelhos") or []:
        assert "token_hash" not in aparelho, "o hash do token do aparelho vazou"
        assert "pareado" in aparelho


def test_o_dashboard_e_identico(jwt, um_pedido):
    """Cinco contagens, o histograma por hora e a conta por setor."""
    if not um_pedido.get("evento_id"):
        pytest.skip("este pedido ainda não virou evento")
    a, b = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}/dashboard", jwt)
    assert a.get("publico") == b.get("publico"), "os números do público divergem"
    assert a.get("por_setor") == b.get("por_setor"), "a conta por setor diverge"
    assert a.get("recusas") == b.get("recusas"), "os motivos de recusa divergem"
    # O histograma é onde mora o defeito de fuso: converter para UTC deslocaria
    # o pico para uma hora em que não entrou ninguém.
    assert a.get("por_hora") == b.get("por_hora"), "o gráfico por hora diverge"
    assert a.get("pico") == b.get("pico"), "a hora de pico diverge"
    assert a.get("grafico_truncado") == b.get("grafico_truncado")
    assert a.get("leituras_lidas") == b.get("leituras_lidas")


def test_a_lista_de_ingressos_e_identica(jwt, um_pedido):
    if not um_pedido.get("evento_id"):
        pytest.skip("este pedido ainda não virou evento")
    _, painel = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    setores = painel.get("setores") or []
    if not setores:
        pytest.skip("este pedido não tem setor nenhum")

    for setor in setores[:3]:
        a, b = _dos_dois(f"setores/{setor['id']}/ingressos", jwt)
        assert a == b, f"a lista de ingressos do setor {setor['nome']} diverge"


def test_a_paginacao_dos_ingressos_bate_pagina_a_pagina(jwt, um_pedido):
    """O `+1` do 'há mais' e o corte da página são onde um porte erra."""
    if not um_pedido.get("evento_id"):
        pytest.skip("este pedido ainda não virou evento")
    _, painel = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    setores = painel.get("setores") or []
    if not setores:
        pytest.skip("este pedido não tem setor nenhum")
    setor = setores[0]["id"]

    # Página pequena de propósito: força virar página num setor pequeno.
    pagina, vistas = 1, 0
    while pagina <= 5:
        a, b = _dos_dois(f"setores/{setor}/ingressos?pagina={pagina}&por_pagina=2", jwt)
        assert a == b, f"a página {pagina} diverge"
        vistas += 1
        if not a.get("ha_mais"):
            break
        pagina += 1
    assert vistas >= 1


def test_os_numeros_do_setor_so_vem_na_primeira_pagina(jwt, um_pedido):
    """Repeti-los a cada página seriam três idas ao banco por toque em
    'Próximos' para escrever o mesmo número."""
    if not um_pedido.get("evento_id"):
        pytest.skip("este pedido ainda não virou evento")
    _, painel = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    setores = painel.get("setores") or []
    if not setores:
        pytest.skip("este pedido não tem setor nenhum")
    setor = setores[0]["id"]

    _, primeira = _dos_dois(f"setores/{setor}/ingressos?pagina=1&por_pagina=1", jwt)
    _, segunda = _dos_dois(f"setores/{setor}/ingressos?pagina=2&por_pagina=1", jwt)
    assert primeira.get("numeros") is not None
    assert segunda.get("numeros") is None


def test_a_busca_por_numero_e_por_texto_bate(jwt, um_pedido):
    if not um_pedido.get("evento_id"):
        pytest.skip("este pedido ainda não virou evento")
    _, painel = _dos_dois(f"pedidos/{um_pedido['pedido_id_int']}", jwt)
    setores = painel.get("setores") or []
    if not setores:
        pytest.skip("este pedido não tem setor nenhum")
    setor = setores[0]["id"]

    for busca in ("1", "0", "abc", "a*b,c&d", ""):
        termo = urllib.parse.quote(busca)
        a, b = _dos_dois(f"setores/{setor}/ingressos?busca={termo}", jwt)
        assert a == b, f"a busca por {busca!r} diverge"


def test_id_malformado_recusa_igual(jwt):
    """UUID inválido tem de virar 'não encontrado', e não 'erro interno'."""
    for caminho in ("setores/nao-e-uuid/ingressos", "pedidos/nao-e-numero"):
        a, b = _dos_dois(caminho, jwt)
        assert a == b, f"{caminho} recusa diferente: {a} vs {b}"


def test_pedido_que_nao_existe_recusa_igual(jwt):
    a, b = _dos_dois("pedidos/999999999", jwt)
    assert a == b


def test_rota_desconhecida_recusa_igual(jwt):
    a, b = _dos_dois("nada-disso", jwt)
    assert a == b


def test_sem_token_recusa_igual():
    a = _pedir(PYTHON, "pedidos", "sopa")
    b = _pedir(EDGE, "pedidos", "sopa")
    # O portão do Supabase recusa o JWT malformado ANTES da função; o Render
    # recusa dentro dela. Os dois têm de dizer 401 — o corpo pode diferir,
    # porque um deles é o gateway falando.
    assert a[0] == b[0] == 401, f"Render {a}, Edge {b}"
