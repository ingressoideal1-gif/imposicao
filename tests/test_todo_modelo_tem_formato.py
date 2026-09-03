# -*- coding: utf-8 -*-
"""A moldura da janela sai do formato DO MODELO — nunca da arte nem de um palpite.

## A regra, dada pelo usuário em 02/09/2026

> "Todo modelo exige obrigatoriamente um formato vinculado"

E, na mesma conversa:

> "O que define o tamanho da janela de visualização é o formato" — "Não a arte"

## Onde o formato mora

`pedidos_modelos` **não tem coluna de formato**. Ele chega ao modelo por três
caminhos, e é preciso olhar os três:

1. a **cor** escolhida (`producao_cores.formato_id`);
2. a **numeração** escolhida (`producao_numeracoes.formato_id`);
3. `item.formato_id`, preenchido em memória a partir do produto do ERP — ver
   `formatoPadraoId` no `script.js`.

O `formatoDoModelo()` olhava só os dois primeiros. Um modelo que tem formato
pelo produto, mas ainda sem cor e sem numeração, era tratado como "sem formato" —
e caía nos planos B.

## O que os planos B faziam (medido antes do conserto)

Modelo com `formato_id` de 105 × 148 mm, sem cor e sem numeração, em modo PDF:

| arte carregada | moldura desenhada | deveria ser |
|---|---|---|
| 104,35 × 158,35 mm | 104,42 × 158,40 mm | 105,00 × 148,00 |
| 110,70 × 164,70 mm | 110,77 × 164,75 mm | 105,00 × 148,00 |

A moldura seguia o **arquivo** e mudava junto com ele — duas faces com artes
diferentes apareceriam em molduras diferentes. O outro plano B, no card do
modelo, caía no **primeiro formato do catálogo**, que não tem relação nenhuma
com o modelo.

## A ordem, e por que ela é essa

Cor → numeração → formato do modelo. A cor e a numeração são a escolha explícita
do operador para AQUELE card, e a célula tem de ser a que elas implicam; o
formato do produto é o que vale enquanto ninguém escolheu. Com cor ou numeração
presentes — 323 dos 467 modelos dos últimos 120 dias — nada muda.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _corpo(fonte, assinatura):
    i = fonte.index(assinatura)
    return fonte[i:fonte.index("\n}", i) + 2]


def test_o_formato_do_modelo_entra_na_conta():
    """`formatoDoModelo` passou a olhar o formato do próprio modelo."""
    corpo = _corpo(_ler("frontend/script.js"), "function formatoDoModelo(")

    assert "item && item.formato_id" in corpo, (
        "o formatoDoModelo voltou a ignorar o formato do próprio modelo; sem ele, "
        "um modelo sem cor e sem numeração é tratado como se não tivesse formato"
    )
    # A ordem importa: a escolha do operador vem antes do padrão do produto.
    assert corpo.index("cor && cor.formato_id") < corpo.index("item && item.formato_id"), (
        "o formato do produto passou na frente da COR escolhida pelo operador"
    )
    assert corpo.index("num && num.formato_id") < corpo.index("item && item.formato_id"), (
        "o formato do produto passou na frente da NUMERAÇÃO escolhida pelo operador"
    )


def test_a_moldura_do_visualizador_nao_cai_mais_na_pagina_da_arte():
    """O plano B que fazia a moldura seguir o arquivo."""
    script = _ler("frontend/script.js")
    i = script.index("const larguraCelula =")
    # So a LINHA da atribuicao: logo abaixo o `viewport.width` volta a aparecer,
    # e ali ele esta certo -- e o tamanho da ARTE, que segue mesmo o arquivo.
    linha = script[i:script.index(chr(10), i)]

    assert "viewport.width" not in linha, (
        "a moldura do visualizador voltou a cair no tamanho da página da arte. "
        "Todo modelo tem formato: sem formato resolvido, a tela tem de dizer que "
        "falta, não adivinhar uma medida."
    )


def test_o_card_do_modelo_nao_cai_mais_no_primeiro_formato_do_catalogo():
    """`state.formatos[0]` não tem relação nenhuma com o modelo."""
    corpo = _corpo(_ler("frontend/script.js"), "async function renderItemAmostraCombinada(")

    assert "formatoDoModelo(item, cor, num)" in corpo, (
        "o card do modelo parou de consultar a cadeia do formato; repetir a "
        "cadeia aqui é o que faz as duas divergirem no primeiro ajuste"
    )
    assert "fmt = state.formatos[0]" not in corpo, (
        "o card voltou a cair no primeiro formato do catálogo quando não acha o "
        "do modelo — um formato qualquer, de outro produto"
    )
    assert "avisarModeloSemFormato(" in corpo, (
        "sem formato o card precisa DIZER que falta, com a saída na frase, em "
        "vez de desenhar a peça com uma medida inventada"
    )


def test_a_regra_mora_uma_vez_so():
    """Quem precisa do formato do modelo chama a função, não repete a cadeia."""
    script = _ler("frontend/script.js")
    assert "function formatoDoModelo(" in script
    for arquivo in ("frontend/pedido.js", "frontend/cliente.js"):
        assert "function formatoDoModelo(" not in _ler(arquivo), (
            f"{arquivo} reimplementou a resolução do formato em vez de consultá-la"
        )
