# -*- coding: utf-8 -*-
"""O trabalho que PEDE numeração e não a recebe tem de parar, não sair em branco.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 o pedido 20508 saiu da impressora três vezes **sem número e sem QR**, com a
prévia mostrando os dois. Foram 62 ingressos perdidos e uma madrugada de investigação.

O motor recebia o `numeracao_id` preenchido e o objeto `numeracao` nulo. Ele não tinha o
que desenhar, então desenhava só a arte — e não dizia nada. No log ficava um silêncio: a
linha `[impose] numeracao tem N elements` simplesmente não aparecia, e é preciso conhecer
muito bem o arquivo para reparar na ausência de uma linha.

Um ingresso sem código não é um ingresso com defeito visível: ele parece pronto, é
entregue, e só falha na portaria do evento — quando não há mais o que fazer. Vale a mesma
regra do QR Ideal sem pool: **falhar alto é a regra, não a exceção.**

O que este arquivo cobra:

1. quem pede numeração e não a recebe **para o trabalho**, com mensagem que diz o que fazer;
2. o log registra o `numeracao_id` pedido, para a próxima investigação começar com o dado
   na mão em vez de com a ausência de uma linha.
"""

import inspect
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _corpo_do_impose():
    import app
    return inspect.getsource(app.impose_file)


def test_o_impose_recusa_quando_pediram_numeracao_e_ela_nao_veio():
    """Duas formas de chegar inútil, e as duas dão a mesma folha em branco: o
    objeto não vir, ou vir sem `elements`. A segunda é a mais traiçoeira —
    o diagnóstico de elementos só imprime quando há `elements`, então ela
    produzia exatamente o mesmo silêncio no log."""
    corpo = _corpo_do_impose()
    assert re.search(r'numeracao_id.*and not _n_els', corpo, re.S), (
        "o /api/impose aceita numeracao_id preenchido sem elementos de numeracao "
        "— e ai a folha sai sem numero e sem QR, em silencio"
    )
    assert re.search(r'_n_els\s*=\s*len\(', corpo), (
        "a contagem de elementos precisa cobrir tambem o objeto que vem vazio"
    )


def test_a_recusa_explica_o_que_aconteceu():
    """Mensagem que serve para quem está na frente da impressora, não para quem
    lê o código: ela precisa dizer que o trabalho pediu numeração, que ela não
    chegou, e que o papel sairia em branco."""
    corpo = _corpo_do_impose()
    trecho = corpo[corpo.find("numeracao_id"):]
    for palavra in ("numeracao", "sem"):
        assert palavra in trecho.lower(), f"a recusa nao menciona {palavra!r}"


def test_o_log_registra_o_numeracao_id_pedido():
    """Sem isto, a investigação começa com a AUSÊNCIA de uma linha — que foi
    exatamente o que fez a madrugada de 15/08 durar seis horas."""
    corpo = _corpo_do_impose()
    assert re.search(r"\[impose\].*numeracao_id", corpo), (
        "o log nao registra qual numeracao o trabalho pediu"
    )
