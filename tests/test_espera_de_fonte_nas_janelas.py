# -*- coding: utf-8 -*-
"""Toda janela que pinta um ingresso espera a fonte antes do traço.

Canvas não reflui. Se o arquivo da fonte ainda está baixando na hora do traço, o
navegador desenha com uma genérica e NUNCA redesenha sozinho — diferente de texto
em HTML. A janela fica assim até alguém mandar redesenhar.

E o prejuízo não é só de desenho: a centralização usa a largura MEDIDA do texto,
então a fonte errada desloca também a posição do número na peça.

O `script.js` e o `cliente.js` já esperavam. A prévia do Painel de Produção
(`pedido.js`) e a camada de numeração do Criador de Arte (`criador-arte.js`) não —
levantado na análise de fidelidade de 27/08/2026. Estes testes prendem as quatro.

Duas formas de esperar, e as duas valem:

  · quem pinta de dentro de uma função `async` **aguarda** e sai certo de primeira;
  · quem pinta de função síncrona dispara a busca e **manda redesenhar** quando a
    fonte chega — é o que a prévia de imposição faz desde sempre.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _corpo(texto, cabecalho, fim="\n}"):
    i = texto.index(cabecalho)
    return texto[i:texto.index(fim, i) + len(fim)]


def test_a_previa_de_imposicao_pede_as_fontes_e_redesenha():
    corpo = _corpo(_ler("frontend/script.js"), "function drawPreview(")
    assert "fontesDosElementos(state.numElements)" in corpo
    assert "garantirFontesCarregadas(" in corpo
    assert "drawPreview()" in corpo, "sem o redesenho, a fonte chega e ninguem repinta"


def test_a_janela_de_arte_aguarda_as_fontes():
    corpo = _corpo(_ler("frontend/script.js"), "async function drawAmostraFace(")
    assert "await garantirFontesCarregadas(fontesDosElementos(" in corpo


def test_o_link_do_cliente_aguarda_as_fontes():
    texto = _ler("frontend/cliente.js")
    assert texto.count("await garantirFontesCarregadas(fontesDosElementos(") >= 2, (
        "as duas janelas do link do cliente precisam esperar"
    )


def test_a_previa_do_painel_de_producao_espera_as_fontes():
    """Era a janela onde o operador confere o pedido, e ela pintava sem esperar."""
    corpo = _corpo(_ler("frontend/pedido.js"), "function drawPedPreview(")
    assert "fontesDosElementos(" in corpo, (
        "drawPedPreview nao pede as fontes dos elementos da numeracao"
    )
    assert "garantirFontesCarregadas(" in corpo, (
        "drawPedPreview nao espera as fontes chegarem"
    )
    assert "drawPedPreview()" in corpo, (
        "sem o redesenho, a fonte chega depois do traco e a janela fica na generica"
    )


def test_o_criador_de_arte_espera_as_fontes_antes_da_camada_de_numeracao():
    texto = _ler("frontend/criador-arte.js")
    corpo = _corpo(texto, "async function setupEditorWorkspace(")
    assert "garantirFontesCarregadas(" in corpo, (
        "o Criador de Arte pinta a numeracao sem esperar a fonte"
    )
    # A espera tem de vir ANTES do traco, senao nao serve de nada.
    assert corpo.index("garantirFontesCarregadas(") < corpo.index("renderEditorLayer2Numeracao("), (
        "a espera esta depois do desenho da camada 2"
    )


def test_as_paginas_carregam_o_modulo_das_fontes_antes_de_quem_desenha():
    """Ordem importa: `fonte-canvas.js` e quem define as duas funcoes."""
    for pagina, consumidores in (
        ("frontend/index.html", ("script.js?v=", "criador-arte.js?v=", "pedido.js?v=")),
        ("frontend/producao.html", ("pedido.js?v=",)),
    ):
        texto = _ler(pagina)
        if "fonte-canvas.js" not in texto:
            continue
        pos = texto.index("fonte-canvas.js")
        for consumidor in consumidores:
            for prefixo in ('src="', 'src="/'):
                alvo = prefixo + consumidor
                if alvo in texto:
                    assert pos < texto.index(alvo), (
                        f"{pagina} carrega {consumidor} antes do fonte-canvas.js"
                    )
