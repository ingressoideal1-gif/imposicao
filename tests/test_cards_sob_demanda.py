# -*- coding: utf-8 -*-
"""Os cards do pedido desenham conforme o operador rola (26/08/2026).

Relato do usuario: *"a pagina com varios modelos segue travando, conferir se os
modelos multipaginas esta trazendo ou tentando carregar a visualizacao ao rolar
o pedido ou se busca carregar apenas ao tentar paginar o modelo"*.

A resposta foi: nem uma coisa nem outra. A PAGINACAO ja era sob demanda -- o
`amostraCsvPagina` redesenha uma linha, quando se clica em uma das setas. O que
nao era sob demanda era a ABERTURA: um laco percorria TODOS os modelos e
desenhava cada card, em serie, com 20 ms de pausa entre um e outro, estivessem
na tela ou nao. Num pedido de 52 modelos sao 52 desenhos completos (arte, cor,
numeracao e, no modo PDF, o arquivo) enquanto o operador olha para os dois
primeiros cards.

O grosso da regra e medido pelo `cards_sob_demanda_harness.js`, que roda num
Chrome DE VERDADE -- e nao num DOM de mentira -- porque a peca central e o
`IntersectionObserver`, que nao dispara para elemento escondido. Um duble diria
que tudo funciona; o Chrome mostra o pedido em branco.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "cards_sob_demanda_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_no_navegador_passa():
    assert os.path.exists(HARNESS), "o harness do desenho sob demanda sumiu"
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_laco_que_desenhava_todos_saiu():
    fonte = _ler("frontend/script.js")

    # A `renderAmostrasOSItens` tem quase mil linhas; a janela vai ate a proxima
    # declaracao de funcao na coluna zero, e nao a um numero de caracteres.
    i = fonte.index("function renderAmostrasOSItens(osId)")
    fim = fonte.index("\nfunction ", i + 10)
    corpo = fonte[i:fim]

    assert "desenharCardsAoAparecer(osId, itens, container)" in corpo, (
        "a abertura do pedido nao usa mais o desenho sob demanda"
    )
    assert "// Pequena pausa para permitir" not in corpo, (
        "o laco que desenhava TODOS os cards na abertura voltou"
    )


def test_a_ancora_do_observador_e_um_elemento_VISIVEL():
    """A parte facil de errar, e a que este teste existe para travar.

    O canvas do card (`amostra-item-canvas-N`) e a caixa do banco
    (`linha-csv-N`) nascem com `display:none`. O `IntersectionObserver` NUNCA
    dispara para elemento escondido -- observa-los deixaria o pedido inteiro em
    branco, para sempre, e sem erro nenhum no console.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("function desenharCardsAoAparecer")
    corpo = fonte[i:i + 3500]
    assert "amostra-item-header-${idx}" in corpo, (
        "a ancora do observador precisa ser um elemento sempre visivel"
    )
    assert "amostra-item-canvas-${idx}`)" not in corpo, (
        "o observador voltou a olhar o canvas, que nasce escondido"
    )


def test_o_pdf_prova_forca_o_desenho_antes_de_esperar():
    """Card nunca rolado nunca desenha. Sem isto, o PDF Prova esperaria o teto
    inteiro e listaria como "de fora" os modelos que ninguem chegou a ver."""
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function prepararTelaParaOPdfProva")
    corpo = fonte[i:i + 1600]
    assert "desenharTodosOsCards(osId, itens)" in corpo
    assert corpo.index("desenharTodosOsCards") < corpo.index("const limite ="), (
        "forcar o desenho depois de comecar a esperar nao adianta"
    )
