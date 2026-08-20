# -*- coding: utf-8 -*-
"""O link do Vibe repetido DENTRO do pedido aberto.

Pedido do usuario em 19/08/2026: o icone que leva ao sistema parceiro ja existia
na linha da Lista de Arte, mas quem abriu o pedido tinha de voltar para a lista
so para chegar la. Ele pediu o mesmo link repetido no cabecalho do pedido, ao
lado do numero.

O botao nasce de uma funcao unica (`botaoDoVibeHtml`) em vez de um terceiro HTML
copiado: e o mesmo destino, e a copia numero tres e onde a divergencia costuma
comecar -- quando o endereco ou o menu do parceiro mudar, muda num lugar so.

Este arquivo roda a prova de tela: um Chrome de verdade monta o cabecalho que
esta no index.html, chama a funcao que esta no script.js e mede onde o botao
ficou. O harness estatico prova que o codigo existe; so o navegador prova que o
botao aparece na mesma linha do numero, tem tamanho de alvo de clique e nao
empurra o nome do cliente para baixo.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "vibe_no_pedido_harness.js")


def test_o_harness_do_vibe_no_pedido_passa():
    assert os.path.exists(HARNESS), "o harness do botao do Vibe sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
