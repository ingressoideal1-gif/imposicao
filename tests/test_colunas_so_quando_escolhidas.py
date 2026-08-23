# -*- coding: utf-8 -*-
"""Carregar o banco NAO poe coluna nenhuma no ticket.

Pedido do usuario em 23/08/2026: *"Ao carregar arquivos .csv ou indicar a url na
numeracao, nao deve carregar as colunas na janela de visualizacao, deve trazer
para janela apenas quando selecionadas"*.

Ate a v698 os tres caminhos que trazem um banco -- upload de arquivo, busca na
web e "atualizar da planilha" -- chamavam `adicionarColunasComoElementos()`, que
desenhava um campo de texto no ticket para CADA coluna. A ideia (v537) era que o
canvas vazio depois do upload parecia uma busca que tinha falhado. O usuario
decidiu o contrario: a coluna so vai para a janela quando ele a escolhe.

A razao que fez a criacao automatica nascer continua valendo, e por isso ela nao
some sem substituto -- a tela passou a DIZER o passo seguinte, no aviso e dentro
da barra de colunas. Sem isso, a v699 traria de volta exatamente o problema que a
v537 resolveu.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_a_criacao_automatica_de_campos_nao_existe_mais():
    js = _ler("frontend/script.js")

    # Ela pode ser CITADA num comentario que conta a historia, mas nao pode mais
    # ser declarada nem chamada.
    assert "function adicionarColunasComoElementos" not in js, (
        "a funcao que desenhava um campo por coluna voltou"
    )
    assert not re.search(r"^\s*(const \w+ = )?adicionarColunasComoElementos\(", js, re.MULTILINE), (
        "alguem voltou a chamar a criacao automatica de campos"
    )


def test_os_tres_caminhos_do_banco_nao_poem_campo_no_ticket():
    """Upload, busca na web e atualizar da planilha: nenhum deles desenha nada.

    O `addCsvColumnElement` continua existindo -- ele e a porta pela qual a coluna
    ENTRA no ticket --, mas so pode ser chamado pelo clique do operador.
    """
    js = _ler("frontend/script.js")

    # A unica chamada legitima e a do botao de cada coluna, montado em
    # `renderNumCsvInterface`, e a definicao da propria funcao.
    chamadas = [m.start() for m in re.finditer(r"addCsvColumnElement\(", js)]
    assert chamadas, "o botao que poe a coluna no ticket sumiu"

    for i in chamadas:
        trecho = js[max(0, i - 200):i]
        ehBotao = 'onclick="addCsvColumnElement' in js[i - 30:i + 30]
        ehDefinicao = "window.addCsvColumnElement" in js[max(0, i - 40):i + 10]
        assert ehBotao or ehDefinicao, (
            "chamada de addCsvColumnElement fora do clique do operador:\n" + trecho[-160:]
        )


def test_a_tela_diz_o_passo_seguinte():
    """Sem campo nenhum desenhado, o canvas depois do upload fica igual ao de
    antes dele. Quem nao conhece a tela concluiria que a busca falhou -- entao a
    tela precisa dizer, em texto, o que fazer agora."""
    js = _ler("frontend/script.js")
    html = _ler("frontend/index.html")

    assert 'id="num-csv-columns-recado"' in html, "o recado da barra de colunas sumiu do HTML"
    assert "num-csv-columns-recado" in js, "e ninguem o preenche"
    assert "CONVITE_DAS_COLUNAS" in js, "o aviso do upload precisa apontar para as colunas"

    # O recado precisa distinguir os dois momentos: nenhuma coluna posta ainda, e
    # o ticket que ja tem campos.
    i = js.index("num-csv-columns-recado")
    corpo = js[i:i + 700]
    assert "Nenhuma coluna está no ticket ainda" in corpo
    assert "mais um campo" in corpo


def test_os_botoes_de_coluna_continuam_na_barra():
    """A porta pela qual a coluna entra no ticket e o botao dela."""
    js = _ler("frontend/script.js")

    i = js.index("num-csv-columns-bar")
    corpo = js[i:i + 1500]
    assert "state.numCsvHeaders.map" in corpo, "a barra precisa continuar listando uma coluna por botao"
    assert "addCsvColumnElement" in corpo
