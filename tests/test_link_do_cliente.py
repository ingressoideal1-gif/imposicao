# -*- coding: utf-8 -*-
"""O link do cliente mostra a arte, inclusive quando ela e um PDF.

Pedido 20927, 19/08/2026: o cliente abriu o link e viu um icone de imagem
quebrada no lugar da pulseira.

A cadeia era esta. O painel salva um "snapshot" -- a previa ja composta de cor +
arte + numeracao -- em `amostra_arte_base64`, e a tela do cliente mostra esse
snapshot num `<img>`. Quando o snapshot nao existe, o carregamento faz o campo
cair para `arte_url`, a arte crua. Se a arte crua e um PDF, o `<img>` nao tem o
que desenhar: sobra um icone minusculo, sem legenda -- e o aviso "arte ainda nao
enviada" fica ESCONDIDO, justamente porque o campo esta preenchido.

A correcao nao foi caçar o snapshot que faltou: foi parar de depender dele. O
`cliente.js` ja sabia compor a peca num canvas e ja sabia ler PDF pelo pdfjsLib
-- so nunca criava o canvas fora do caso de numeracao com banco de dados.

Conferido num Chrome contra o pedido 20927 de verdade: o canvas passou a nascer,
1447x118, desenhado.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "link_do_cliente_harness.js")


def test_o_harness_do_link_do_cliente_passa():
    assert os.path.exists(HARNESS), "o harness do link do cliente sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_pagina_do_cliente_carrega_o_leitor_de_pdf():
    """Sem o pdf.js na pagina, o desenho ao vivo de uma arte em PDF cairia no
    ramo de imagem e nao desenharia nada -- o mesmo retangulo vazio, por outro
    caminho. O `cliente.js` so entra no ramo do PDF se `pdfjsLib` existir."""
    with open(os.path.join(RAIZ, "frontend", "cliente.html"), encoding="utf-8") as f:
        html = f.read()
    assert "pdf.min.js" in html, "a pagina do cliente nao carrega o pdf.js"
