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

ONDE A RECUSA PASSOU DO PONTO, E POR QUE ELA FOI ESTREITADA

Em 03/09/2026 o pedido 21411 foi travado por esta mesma recusa, estando certo. A guarda
tinha sido alargada para cobrir também a numeração que chega com a lista de elementos
**vazia**, e esse caso não é defeito nenhum: o usuário confirmou que é comum, porque nem
todo trabalho leva número ou QR. A numeração está escolhida no seletor, ela simplesmente
não desenha nada, e a folha sair só com a arte é o resultado correto.

Pior: a mensagem mandava o operador reabrir o modelo e escolher a numeração — que já
estava escolhida. Uma trava sem saída, o oposto do que uma trava deve ser.

O que este arquivo cobra:

1. quem pede numeração e recebe o objeto **nulo** para o trabalho, com mensagem que diz
   o que fazer;
2. quem pede numeração e recebe um objeto **sem elementos** SEGUE, porque a folha só com
   arte é o resultado esperado;
3. o log registra o `numeracao_id` pedido e diz, em texto, quando a numeração veio vazia —
   para a próxima investigação começar com o dado na mão em vez de com a ausência de uma
   linha.
"""

import inspect
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _corpo_do_impose():
    import app
    return inspect.getsource(app.impose_file)


def test_o_impose_recusa_quando_pediram_numeracao_e_o_objeto_nao_veio():
    """O caso do 20508: `numeracao_id` preenchido, objeto nulo, nada para desenhar."""
    corpo = _corpo_do_impose()
    assert re.search(r'if data\.get\(["\']numeracao_id["\']\)\s+and\s+not\s+numeracao\s*:', corpo), (
        "o /api/impose aceita numeracao_id preenchido com o objeto da numeracao nulo "
        "— e ai a folha sai sem numero e sem QR, em silencio"
    )


def test_o_impose_nao_recusa_numeracao_sem_elementos():
    """O caso do 21411: numeração escolhida, sem nenhum elemento. É comum, e a folha
    só com a arte é o resultado certo. Travar isso é parar produção boa."""
    corpo = _corpo_do_impose()
    # `not _n_els` continua no arquivo — é o que faz o AVISO no log. O que não
    # pode voltar é ele decidir a recusa: `numeracao_id` preenchido + zero
    # elementos não é motivo para parar.
    assert not re.search(
        r'if\s+data\.get\(["\']numeracao_id["\']\)\s+and\s+not\s+_n_els\s*:', corpo
    ), (
        "a recusa voltou a depender da contagem de elementos: numeracao escolhida sem "
        "nenhum elemento e caso comum (nem todo trabalho leva numero ou QR) e nao pode "
        "travar a imposicao — foi o que aconteceu com o pedido 21411 em 03/09/2026"
    )
    # E o aviso do log não pode virar exceção por outro caminho: o bloco do
    # `if` da numeração vazia (até a linha em branco que o fecha) só avisa.
    _ini = corpo.find("and numeracao and not _n_els")
    assert _ini != -1, "o caminho da numeracao vazia desapareceu do codigo"
    _bloco = corpo[_ini:]
    _fim = _bloco.find("\n\n")
    _bloco = _bloco[:_fim] if _fim != -1 else _bloco
    assert "raise" not in _bloco, (
        "o caminho da numeracao vazia voltou a levantar excecao"
    )


def test_a_recusa_explica_o_que_aconteceu():
    """Mensagem que serve para quem está na frente da impressora, não para quem
    lê o código: ela precisa dizer que o trabalho pediu numeração, que ela não
    chegou, e que o papel sairia em branco."""
    corpo = _corpo_do_impose()
    trecho = corpo[corpo.find("nao chegou ao motor"):]
    for palavra in ("numeracao", "sem"):
        assert palavra in trecho.lower(), f"a recusa nao menciona {palavra!r}"


def test_o_log_registra_o_numeracao_id_pedido():
    """Sem isto, a investigação começa com a AUSÊNCIA de uma linha — que foi
    exatamente o que fez a madrugada de 15/08 durar seis horas."""
    corpo = _corpo_do_impose()
    assert re.search(r"\[impose\].*numeracao_id", corpo), (
        "o log nao registra qual numeracao o trabalho pediu"
    )


def test_o_log_diz_quando_a_numeracao_veio_vazia():
    """A numeração vazia deixou de parar o trabalho — então ela tem de ficar dita
    no log, senão o silêncio de 15/08 volta pela outra porta."""
    corpo = _corpo_do_impose()
    assert re.search(r"_n_els\s*=\s*len\(", corpo), (
        "a contagem de elementos saiu do codigo: sem ela o log nao consegue dizer "
        "que a numeracao veio vazia"
    )
    assert re.search(r"and\s+numeracao\s+and\s+not\s+_n_els", corpo), (
        "o log nao avisa, em texto, quando a numeracao escolhida nao tem nenhum "
        "elemento — a folha sai so com a arte e ninguem fica sabendo"
    )
