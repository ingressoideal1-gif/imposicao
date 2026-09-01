# -*- coding: utf-8 -*-
"""O elemento nasce "Apenas Frente" e o editor abre em "Frente".

Regra do usuário em 01/09/2026: *"na lista de numeração, na edição das
numerações, sempre que adicionar um elemento de numeração, de qualquer formato,
deve sempre ser adicionado o elemento de numeração com a opção 'FACE' do box de
configuração dos elementos de numeração na opção 'Apenas Frente', assim como ao
criar qualquer numeração deve trazer a edição da numeração sempre no modo de
Impressão 'Frente'"*.

## Por que as duas regras andam juntas

São uma coisa só vista de dois lugares: se o editor sempre abre em Frente, o
elemento nascer "Apenas Frente" é o elemento nascer onde a pessoa está olhando.
Qualquer outro padrão coloca conteúdo numa face que ninguém escolheu.

## O que havia antes, e por que ninguém percebia

A face do elemento novo tinha **dois** padrões, escolhidos pelo Modo de
Impressão:

- No modo **Frente** ele nascia `both`. Nada denunciava isso na tela — não há
  verso para olhar. A conta chegava depois: no dia em que a numeração virasse
  FxVerso, todo elemento desenhado na frente aparecia também no verso de uma vez
  só, e alguém teria de descobrir um por um quais tirar.
- No **FxVerso** ele seguia `state.lastActiveFace`, a última face clicada — que
  não era zerada entre numerações. Um clique no verso da numeração A fazia o
  primeiro elemento da numeração B nascer no verso.

E o Modo de Impressão era o único campo do formulário que sobrevivia ao
`cancelNumEdit()`. Quem editasse uma FxVerso e clicasse em "+ Nova Numeração"
começava a numeração nova em FxVerso, com o segundo canvas aberto, sem ter
escolhido isso — o modo mora num `select` lá em cima, longe do desenho.

## Onde a regra NÃO se aplica

Abrir uma numeração existente traz o `print_mode` gravado dela (`editNumeracao`),
e a numeração de um modelo criada a partir de uma base herda o modo da base.
"Criar" aqui é o formulário em branco, não toda entrada no editor — forçar
Frente naqueles dois caminhos apagaria o verso de uma numeração que já tem um.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "face_frente_por_padrao_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_face_passa():
    """As duas funções, recortadas do `script.js` e executadas de verdade.

    Cobre os quinze tipos de elemento nos três modos de impressão, a contaminação
    pela última face clicada, e o `cancelNumEdit` saindo de cada modo.
    """
    assert os.path.exists(HARNESS), "o harness da face sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida


def test_abrir_uma_numeracao_existente_continua_trazendo_o_modo_gravado():
    """O reset é do formulário em branco, não de toda entrada no editor.

    Se `editNumeracao` passasse a forçar Frente, abrir uma FxVerso esconderia o
    canvas do verso e o próximo save gravaria uma numeração sem verso — perda
    silenciosa de trabalho aprovado.
    """
    fonte = _ler(SCRIPT)
    assert "document.getElementById('num-print-mode').value = n.print_mode || 'front';" in fonte, (
        "abrir uma numeração gravada tem de escrever o print_mode dela"
    )


def test_a_numeracao_do_modelo_herda_o_modo_da_base():
    """`editCustomNumeracao` carrega a base pelo `editNumeracao` e só depois
    decide se edita no lugar ou clona. Forçar Frente ali faria a exclusiva de um
    modelo nascer sem o verso da base de onde ela veio."""
    fonte = _ler(SCRIPT)
    i = fonte.index("function editCustomNumeracao(idx, osId, itemId)")
    corpo = fonte[i:fonte.index("\nwindow.editCustomNumeracao", i)]

    assert "editNumeracao(baseNumId)" in corpo, "a base é quem dita o modo"
    assert "num-print-mode" not in corpo, (
        "este caminho não pode mexer no Modo de Impressão — ele herda o da base"
    )
