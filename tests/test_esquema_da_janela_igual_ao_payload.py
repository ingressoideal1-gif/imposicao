# -*- coding: utf-8 -*-
"""A janela desenha o mesmo esquema de imposição que vai para a máquina.

## O que estava errado (02/09/2026)

Com vários modelos marcados, quem decide o esquema é
`esquemaDaSelecaoCombinada()`: o modo salvo nos modelos manda primeiro
(Sequencial enche a folha na ordem) e, dentro de Blocado, a barra **somar
folha** escolhe entre folha própria (`cut_stack`) e aproveitar a folha
(`multi_artes`).

O payload já lia dali. As duas prévias liam o seletor de **Regra de Paginação**
(`ped-schema` / `imp-schema`), e ninguém o atualiza quando a seleção ou a barra
mudam — só o padrão do formato escreve nele. Medido com dois modelos blocados
num formato de regra `sequential`:

| barra | ia para a máquina | a janela desenhava |
|---|---|---|
| folha própria | `cut_stack` | `sequential` |
| aproveitar a folha | `multi_artes` | `sequential` |

A janela nunca mudava, e nunca batia: clicar na barra trocava o que a impressora
faz e não mexia na tela.

## A forma do conserto

O seletor continua valendo para **um** modelo. Com vários, a regra da seleção
combinada vem depois e vence — a mesma função nas duas pontas, para que não haja
duas contas para divergirem de novo. E cada prévia publica o que decidiu em
`state.esquemaDaPrevia`, como o `state.contaDaTela` já fazia: sem publicar não há
como conferir, nem num teste nem no console, se a tela e a máquina estão
desenhando o mesmo trabalho.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "esquema_da_previa_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_esquema_passa():
    assert os.path.exists(HARNESS), "o harness do esquema da prévia sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_regra_mora_uma_vez_so():
    """Nenhuma das prévias reimplementa a decisão.

    Duas contas para "qual esquema" divergem no primeiro ajuste — foi assim que
    este defeito nasceu. As duas telas e os dois payloads chamam a MESMA função.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    assert "function esquemaDaSelecaoCombinada()" in script
    assert "function esquemaDaSelecaoCombinada" not in pedido, (
        "o pedido.js reimplementou a regra do esquema em vez de consultá-la"
    )
    # As quatro pontas: as duas janelas e os dois caminhos de impressão.
    assert pedido.count("esquemaDaSelecaoCombinada()") >= 2, (
        "a janela do Pedido ou o caminho de impressão dela parou de usar a regra"
    )
    assert script.count("esquemaDaSelecaoCombinada()") >= 3, (
        "a janela da Imposição ou o caminho de impressão dela parou de usar a regra"
    )


def test_um_modelo_so_continua_no_seletor():
    """A Regra de Paginação não foi desativada.

    Ela é o controle de quem imprime um modelo sozinho; o que mudou é que, com
    vários, ela deixa de ser a palavra final.
    """
    for arquivo, campo in (("frontend/pedido.js", "ped-schema"),
                           ("frontend/script.js", "imp-schema")):
        fonte = _ler(arquivo)
        assert f"getElementById('{campo}')" in fonte, (
            f"{arquivo}: o seletor de Regra de Paginação sumiu do desenho"
        )


def test_as_janelas_publicam_o_que_desenharam():
    """`state.esquemaDaPrevia`, no molde do `state.contaDaTela`."""
    for arquivo in ("frontend/pedido.js", "frontend/script.js"):
        assert "state.esquemaDaPrevia = schema;" in _ler(arquivo), (
            f"{arquivo}: a janela não publica mais o esquema que desenhou"
        )
