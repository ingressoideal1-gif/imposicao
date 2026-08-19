# -*- coding: utf-8 -*-
"""Link direto para um pedido: `https://.../pedido/20928`.

Pedido do usuario em 19/08/2026: um endereco para mandar ao parceiro que, ao ser
clicado, cai dentro do pedido.

E CAMINHO, e nao `?pedido=20928`, por um motivo pratico: quando a pessoa nao esta
logada, o login do Supabase volta para `origin + pathname`, e a query string se
perde no caminho de ida. O caminho sobrevive, entao o link continua valendo para
quem precisa entrar antes de ver.

O link abre o pedido, e nao a lista com a linha destacada. Parar na lista
deixaria mais um clique para o parceiro dar, e um filtro qualquer da sessao
anterior poderia esconder justamente aquela linha.

A pegadinha que so apareceu abrindo o endereco num Chrome de verdade: o
`index.html` carrega 23 scripts por caminho RELATIVO. Em `/pedido/20928` eles
resolveriam para `/pedido/script.js`, e a reescrita da Vercel devolveria o
proprio index.html no lugar de cada arquivo -- "Unexpected token '<'" oito vezes,
pagina morta. O mesmo valeria para o icone do Vibe, que o JS escreve na linha do
pedido. Um `<base href="/">` no topo do documento resolve todos de uma vez.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "link_do_pedido_harness.js")


def test_o_harness_do_link_do_pedido_passa():
    assert os.path.exists(HARNESS), "o harness do link do pedido sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
