# -*- coding: utf-8 -*-
"""As duas portarias respondem a MESMA coisa.

Enquanto o Python do Render e a Edge Function do Supabase convivem, este teste
e o que autoriza o corte. Ele nao usa dublê: bate nos dois enderecos de
verdade, com o mesmo token, e compara.

## Por que sem dublê

O que estamos migrando nao e logica de calculo -- e uma conversa com o
PostgREST. Filtro, ordenacao, teto de linhas, formato de data na querystring:
tudo isso so existe de verdade contra o banco de verdade. Um dublê provaria
que os dois codigos concordam com a MINHA ideia do PostgREST, que e
exatamente a coisa que ja errei uma vez neste projeto (o `+00:00` que virava
espaco na URL).

## O que ele exige para rodar

`PORTARIA_TOKEN_DE_TESTE`, um token de aparelho pareado de verdade. Nao ha
como fabricar isso sem escrever no banco: o token e sorteado no pareamento e o
banco guarda so o sha256 dele. Sem a variavel, o teste PULA em vez de falhar
-- ele nao pode quebrar a suite de quem nao tem o token.

O aparelho usado precisa estar num evento com **mais de 500 credenciais**
(`POR_PAGINA`), senao `test_a_paginacao_...` passa sem nunca virar a pagina e
o teto de linhas do PostgREST fica sem prova. Em 16/08/2026 o aparelho
"Paridade (teste)" ficava no evento "Teste Ideal Control", com 2000
credenciais -- quatro paginas.
"""
import json
import os
import urllib.error
import urllib.request

import pytest

TOKEN = os.environ.get("PORTARIA_TOKEN_DE_TESTE")
PYTHON = "https://imposicao.onrender.com/api/acesso/portaria"
EDGE = "https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/portaria"

# O Render dorme quando ninguem usa, e acordar leva quase um minuto. O teto
# alto e para o primeiro pedido do dia, nao para o caso normal.
ESPERA = 120

pytestmark = pytest.mark.skipif(
    not TOKEN,
    reason="defina PORTARIA_TOKEN_DE_TESTE com um token de aparelho pareado",
)


def _pedir(base, caminho, corpo=None, token=None, cabecalho=None):
    """Devolve (status, corpo). Recusa NAO levanta: comparar como as duas
    recusam e metade do teste.

    `cabecalho` manda o Authorization cru, malformado inclusive -- e o unico
    jeito de exercitar a recusa de cabecalho invalido, que `token` nao alcanca
    porque sempre monta um "Bearer ..." bem formado.
    """
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    cabecalhos = {"Content-Type": "application/json"}
    if cabecalho is not None:
        cabecalhos["Authorization"] = cabecalho
    else:
        cabecalhos["Authorization"] = f"Bearer {token or TOKEN}"
    req = urllib.request.Request(
        f"{base}/{caminho}",
        data=dados,
        method="POST" if corpo is not None else "GET",
        headers=cabecalhos,
    )
    try:
        with urllib.request.urlopen(req, timeout=ESPERA) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        texto = e.read().decode("utf-8")
        try:
            return e.code, json.loads(texto)
        except ValueError:
            return e.code, texto


def _leitura_de_teste(sufixo):
    """Os `id_local` sao fixos de proposito: rodar isto mil vezes deixa duas
    linhas, nao duas mil. Quem garante e a chave unica
    `(dispositivo_id, id_local)` mais o `ignore-duplicates` do envio."""
    return {"leituras": [{
        "id_local": f"paridade-{sufixo}",
        "momento": "2026-08-16T12:00:00.000Z",
        "resultado": "negado",
        "motivo": "teste de paridade",
    }]}


CAMPOS_DA_LINHA = "id_local,resultado,motivo,momento,tipo,credencial_id,setor_id"


def _ler_do_banco():
    """As linhas de teste, pela chave de servico, indexadas por `id_local`."""
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/producao_acesso_leituras"
        f"?id_local=in.(paridade-python,paridade-edge)&select={CAMPOS_DA_LINHA}",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
    )
    with urllib.request.urlopen(req, timeout=ESPERA) as r:
        return {x["id_local"]: x for x in json.loads(r.read().decode("utf-8"))}


def _faixa(base, desde=0):
    situacao, corpo = _pedir(base, f"faixa?desde={desde}")
    assert situacao == 200, f"{base} respondeu {situacao}: {corpo}"
    return corpo


def test_a_faixa_e_identica_nas_duas():
    """Campo a campo. Uma diferenca aqui e um ingresso recusado no portao."""
    a = _faixa(PYTHON)
    b = _faixa(EDGE)

    assert sorted(a) == sorted(b), "os dois nao devolvem os mesmos campos"
    assert a["evento"] == b["evento"], "o evento diverge"
    assert a["aparelho"] == b["aparelho"], "o aparelho diverge"
    assert a["sais"] == b["sais"], "os sais dos pedidos divergem"
    assert a["setores"] == b["setores"], "os setores divergem"
    assert a["bloqueios"] == b["bloqueios"], "os bloqueios divergem"
    assert a["proxima"] == b["proxima"], "a paginacao diverge"

    # As credenciais sao o coracao: se um hash sair diferente, o ingresso
    # correspondente e recusado na porta com o portador olhando.
    assert len(a["credenciais"]) == len(b["credenciais"])
    por_id = {c["id"]: c for c in b["credenciais"]}
    for c in a["credenciais"]:
        assert c == por_id.get(c["id"]), f"credencial {c['id']} diverge"


def test_a_paginacao_percorre_o_evento_inteiro_igual():
    """O defeito do teto de linhas do PostgREST so aparece na pagina seguinte.
    Percorrer ate o fim e o unico jeito de pega-lo."""

    def tudo(base):
        credenciais, desde, paginas = [], 0, 0
        while desde is not None:
            p = _faixa(base, desde)
            credenciais += p["credenciais"]
            desde = p["proxima"]
            paginas += 1
            assert paginas < 200, "paginacao nao termina -- `proxima` nao avanca?"
        return credenciais, paginas

    do_python, paginas = tudo(PYTHON)
    da_edge, _ = tudo(EDGE)

    # Sem isto o teste passa de graca num evento pequeno, provando nada sobre
    # a virada de pagina -- que e a unica razao dele existir.
    assert paginas > 1, (
        "o evento deste aparelho cabe numa pagina so; aponte o token para um "
        "evento com mais de 500 credenciais ou esta prova nao vale"
    )
    assert do_python == da_edge, "a carga completa diverge entre as duas"


def test_token_invalido_recusa_igual_nas_duas():
    """Recusar diferente conta a um estranho o que existe do outro lado.

    As duas mensagens sao de ramificacoes distintas, e a diferenca entre elas
    importa: "nao pareado" e o cabecalho malformado, que nunca chega ao banco;
    "ou revogado" e o token bem formado que o banco nao reconheceu -- inclusive
    o do aparelho que o dono acabou de revogar na tela dele.
    """
    casos = [
        ("Bearer " + "0" * 64, "aparelho nao pareado ou revogado"),
        ("sopa", "aparelho nao pareado"),
        ("", "aparelho nao pareado"),
    ]
    for cabecalho, mensagem in casos:
        a = _pedir(PYTHON, "faixa?desde=0", token=None, cabecalho=cabecalho)
        b = _pedir(EDGE, "faixa?desde=0", token=None, cabecalho=cabecalho)
        assert a == b, f"as duas recusam diferente para {cabecalho!r}: {a} vs {b}"
        assert a == (401, {"detail": mensagem}), f"recusa inesperada para {cabecalho!r}: {a}"


def test_leituras_recusa_igual_nas_duas():
    """As tres recusas do envio da fila. Nenhuma delas escreve no banco."""
    casos = [
        ({"leituras": [{"id_local": "x", "momento": "2026-08-16T12:00:00Z",
                        "resultado": "talvez"}]}, "resultado invalido"),
        ({"leituras": [{"momento": "2026-08-16T12:00:00Z",
                        "resultado": "permitido"}]}, "sem id_local"),
        ({"leituras": [{"id_local": "x", "resultado": "permitido"}]}, "sem momento"),
    ]
    for corpo, porque in casos:
        a = _pedir(PYTHON, "leituras", corpo)
        b = _pedir(EDGE, "leituras", corpo)
        assert a == b, f"as duas recusam diferente quando a leitura vem {porque}: {a} vs {b}"
        assert a[0] == 422, f"esperava 422 quando a leitura vem {porque}, veio {a}"


def test_leituras_vazia_nao_escreve_e_responde_igual():
    """A fila vazia e o caso comum: o celular sincroniza sem ter lido nada."""
    a = _pedir(PYTHON, "leituras", {"leituras": []})
    b = _pedir(EDGE, "leituras", {"leituras": []})
    assert a == b == (200, {"gravadas": 0})


def test_leituras_grava_igual_nas_duas():
    """O primeiro teste que ESCREVE. E seguro repetir: o reenvio cai no
    `ignore-duplicates`, que e exatamente o caso do celular que passou tres
    horas offline e mandou a fila inteira de novo."""
    a = _pedir(PYTHON, "leituras", _leitura_de_teste("python"))
    b = _pedir(EDGE, "leituras", _leitura_de_teste("edge"))
    assert a == b == (200, {"gravadas": 1})

    # Reenviar o id_local que o Python ja gravou tem de ser aceito sem
    # duplicar -- e o caminho do `ignore-duplicates`, que e diferente do
    # caminho da linha nova.
    assert _pedir(EDGE, "leituras", _leitura_de_teste("python")) == (200, {"gravadas": 1})


@pytest.mark.skipif(
    not (os.environ.get("SUPABASE_SERVICE_KEY")
         and os.environ.get("NEXT_PUBLIC_SUPABASE_URL")),
    reason="precisa da chave de servico para ler a tabela de volta",
)
def test_a_linha_gravada_e_igual_e_nao_so_a_resposta():
    """O teste que pegou o defeito de 16/08/2026.

    As duas rotas respondem `{"gravadas": 1}` ANTES de saber o que o banco fez,
    porque o envio pede `return=minimal`. Enquanto a prova era so por HTTP, uma
    Edge Function que gravasse a linha com um campo a menos passava limpa -- e
    foi o que aconteceu: ela deixava `motivo` de fora, e `motivo` e o "por que"
    da recusa no portao. A tela do dono mostrava o ingresso negado sem saber
    dizer a razao.

    Por isso este teste desce ate a tabela. Ele so roda para quem tem a chave
    de servico -- o que exclui o CI, de proposito: chave de servico em
    integracao continua e a chave que le o banco inteiro.
    """
    _pedir(PYTHON, "leituras", _leitura_de_teste("python"))
    _pedir(EDGE, "leituras", _leitura_de_teste("edge"))

    gravadas = _ler_do_banco()
    do_python = gravadas.get("paridade-python")
    da_edge = gravadas.get("paridade-edge")
    assert do_python, "o Python nao gravou a leitura"
    assert da_edge, "a Edge Function nao gravou a leitura"

    # `id_local` diverge por construcao: e ele que separa as duas linhas.
    del do_python["id_local"], da_edge["id_local"]
    assert do_python == da_edge, (
        "a linha que a Edge Function grava difere da que o Python grava, ainda "
        f"que as duas respondam igual: {do_python} vs {da_edge}"
    )
