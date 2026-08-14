# -*- coding: utf-8 -*-
"""Toda prévia tem de desenhar todo elemento que vai ao papel.

O defeito que este arquivo previne é sempre o mesmo, e já aconteceu duas vezes
com o QR Ideal, nas duas direções:

- **A tela mostrava e o papel falhava** (parte 1): o elemento aparecia em todas
  as janelas, mas a imposição era recusada porque `pedido` e `modelo` nunca
  chegavam ao motor.
- **O papel saía e a tela não mostrava** (14/08/2026): o `pedido.js` — que tem a
  própria prévia, separada da do `script.js` — não conhecia `QR_IDEAL`. O
  elemento caía fora de todos os ramos e sumia. O operador conferia a folha sem
  ele, e o PDF saía com ele.

A causa dos dois é a mesma: **há mais de um lugar que desenha**, e um deles foi
esquecido. Este teste varre os desenhadores conhecidos e cobra que nenhum tipo
que vai ao papel fique de fora.

Elementos de tela (`PICOTE`, e `SVG`/`PDF` marcados como Layout) não entram na
cobrança: eles têm razão para não aparecer em algumas janelas.
"""

import os
import re

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Os tipos que carregam DADO VARIÁVEL e vão ao papel. É o conjunto que uma
# prévia não pode ignorar sem mentir sobre a folha.
TIPOS_QUE_VAO_AO_PAPEL = {"TEXT", "FIXED", "QR", "QR_IDEAL", "BARCODE"}

# Cada desenhador do projeto: o arquivo e o trecho onde ele decide por tipo.
DESENHADORES = [
    ("frontend/pedido.js", "prévia do Painel de Produção"),
    ("frontend/script.js", "editor, card do pedido e prévia de imposição"),
]


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


@pytest.mark.parametrize("arquivo,quem", DESENHADORES)
def test_o_desenhador_conhece_todo_tipo_que_vai_ao_papel(arquivo, quem):
    texto = _ler(arquivo)
    citados = set(re.findall(r"el\.type\s*===\s*'([A-Z_]+)'", texto))
    faltando = sorted(TIPOS_QUE_VAO_AO_PAPEL - citados)
    assert not faltando, (
        f"{quem} ({arquivo}) nao desenha: {faltando}. "
        "O elemento sai no papel e some da tela — o operador confere uma folha "
        "que nao e a que vai imprimir."
    )


def test_o_qr_ideal_esta_nos_dois_desenhadores():
    """O caso concreto, nomeado, porque ele ja falhou nas duas direcoes."""
    for arquivo, quem in DESENHADORES:
        assert "QR_IDEAL" in _ler(arquivo), f"{quem} nao conhece QR_IDEAL"


def test_o_qr_ideal_e_o_qr_ocupam_a_mesma_area_no_painel():
    """Mesmo `size_mm`, mesmo ramo: um desenho so para os dois.

    Se um dia alguem separar os ramos, o tamanho tem de continuar igual — senao
    a previa mostra um retangulo e o papel recebe outro.
    """
    texto = _ler("frontend/pedido.js")
    assert "el.type === 'QR' || el.type === 'QR_IDEAL'" in texto
