# -*- coding: utf-8 -*-
"""A amostra não pode ter moldura desenhada dentro do próprio bitmap.

O card do pedido em arte, a janela ampliada que abre ao clicar nele e o link do
cliente mostram o MESMO desenho: `drawAmostraFace()` pinta o canvas e as outras
duas janelas copiam o bitmap pronto. Por isso um enfeite pintado ali viaja para
todo lugar — inclusive para o `amostra_arte_base64`, o JPEG de aprovação que o
cliente vê e que já foi parar na impressão (ver `frontend/arte-de-impressao.js`).

Até 18/08/2026 havia três molduras assim, e o usuário reclamou de "um fio de
contorno que corta parte da imagem":

- `// Borda decorativa` no fim de `drawAmostraFace`, em `script.js` e em
  `cliente.js`;
- `// contorno do formato` na camada de numeração, que é composta POR CIMA da
  arte — a moldura cobria a beirada do desenho;
- `// Borda final da amostra` em `renderAmostraCombinada`, com 1,5 px.

Medido no navegador antes do conserto: a primeira e a última fileira de pixels
da arte saíam manchadas (`165,54,64` no lugar do vermelho puro `255,0,0`). O
papel sempre saiu inteiro, porque o motor redesenha tudo do zero e nunca pinta
essas linhas — era defeito só de tela, e é justamente por isso que ninguém
percebia pelo resultado impresso.

Quem mostra até onde vai o ingresso é a borda do próprio canvas, com a sombra
do CSS. Moldura desenhada, não.
"""

import os
import re

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _corpo_da_funcao(fonte, assinatura):
    """O texto da função, do cabeçalho até a chave que a fecha na coluna 0."""
    inicio = fonte.index(assinatura)
    fim = fonte.index("\n}", inicio)
    return fonte[inicio:fim]


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/cliente.js"])
def test_draw_amostra_face_nao_desenha_moldura(arquivo):
    corpo = _corpo_da_funcao(_ler(arquivo), "async function drawAmostraFace(")
    # So a moldura que cerca a peca inteira. Os strokeRect de elemento
    # (`strokeRect(-hw, -hh_el, w, h)`) sao a caixa de cada elemento da
    # numeracao e continuam valendo.
    molduras = re.findall(r"strokeRect\(0,\s*0,[^)]*\)", corpo)
    assert molduras == [], (
        f"{arquivo}: drawAmostraFace voltou a desenhar moldura no bitmap "
        f"({molduras}). O fio cobre a beirada da arte e vai junto para a janela "
        f"ampliada, para o link do cliente e para o JPEG de aprovacao."
    )


def test_amostra_combinada_unificada_nao_desenha_moldura():
    corpo = _corpo_da_funcao(_ler("frontend/script.js"), "function renderAmostraCombinada(")
    # So a moldura que cerca a peca inteira. Os strokeRect de elemento
    # (`strokeRect(-hw, -hh_el, w, h)`) sao a caixa de cada elemento da
    # numeracao e continuam valendo.
    molduras = re.findall(r"strokeRect\(0,\s*0,[^)]*\)", corpo)
    assert molduras == [], (
        f"renderAmostraCombinada voltou a desenhar moldura no bitmap ({molduras})."
    )


@pytest.mark.parametrize(
    "arquivo", ["frontend/script.js", "frontend/cliente.js", "frontend/index.html"]
)
def test_a_caixa_da_amostra_nao_tem_fio_no_css(arquivo):
    """O outro fio, o do CSS, que emoldurava o canvas e o encolhia em 2 px."""
    fonte = _ler(arquivo)
    fio = "border: 1px solid var(--border); background: #ffffff;"
    assert fio not in fonte, (
        f"{arquivo}: a caixa da amostra voltou a ter borda de 1px. Com "
        f"box-sizing:border-box ela ainda encolhe o desenho em 2px."
    )
