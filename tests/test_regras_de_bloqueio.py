# -*- coding: utf-8 -*-
"""As tres regras de bloqueio do negocio, ditadas pelo usuario em 19/08/2026.

Elas nao sao configuracao: nao ha caixa para marcar na tela de Usuarios, porque
nao e decisao de quem administra o painel -- e como a grafica trabalha.

  1. Quem define o designer de um pedido e o atendimento. O designer executa; nao
     escolhe quem executa.
  2. Modelo que o cliente aprovou nao se altera. Nem cor, nem numeracao, nem as
     tabelas do banco, nem a arte. Continuam de pe apenas a anotacao e o botao
     "Em Alteracao", e so para atendimento, gerente e administrador.
  3. O banco da numeracao tem de fechar com a Qtd do pedido -- X linhas, seja
     Frente ou FxVerso. Enquanto nao fechar, o modelo nao pode ser marcado
     PRONTO, e sem todos os modelos PRONTO o pedido nao vira "Enviar Arte". A
     Qtd NUNCA e corrigida pelo painel: ela vem do ERP e e a quantidade
     contratada, ou seja, o valor do pedido.

     A regra 3 nasceu em 19/08 pedindo 2X no FxVerso, e o usuario a corrigiu em
     26/08/2026: *"modelos frente e verso utilizam as mesmas linhas em colunas
     diferentes, se Qtd=15 devem ser utilizadas 15 linhas, sendo somente frente
     ou sendo frente e verso"*. Uma linha e UMA PECA; o verso dela le outras
     colunas da mesma linha, que e como o `engine.py` sempre montou a folha.

O harness de node roda as funcoes lidas do `script.js`, e nao copias delas.
"""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# O primeiro prova as DECISOES (quem pode o que, e quando a conta fecha); o
# segundo prova a TELA, num Chrome de verdade: quais controles do card ficaram
# mesmo travados. Um seletor errado no segundo nao quebra nada -- o card so
# continua editavel, calado --, e nenhuma funcao pura alcancaria isso.
HARNESSES = [
    "regras_de_bloqueio_harness.js",
    "trava_do_card_harness.js",
]


@pytest.mark.parametrize("harness", HARNESSES)
def test_o_harness_das_regras_de_bloqueio_passa(harness):
    caminho = os.path.join(RAIZ, "tests", harness)
    assert os.path.exists(caminho), "o harness " + harness + " sumiu"

    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, harness + " falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), harness + " nao relatou sucesso:" + (r.stdout or "")


def _script_js():
    with open(os.path.join(RAIZ, "frontend", "script.js"), encoding="utf-8") as f:
        return f.read()


def test_a_qtd_do_pedido_nunca_e_escrita_pelo_painel():
    """A trava de coerencia corrige a NUMERACAO, nunca a quantidade.

    Foi a primeira coisa que o usuario cortou quando ofereci "o sistema corrige
    sozinho": a Qtd chega do ERP e e a quantidade contratada. Um numero que o
    painel ajustasse para fechar uma conta de producao passaria a valer como
    quantidade vendida, e a diferenca so apareceria na fatura.
    """
    js = _script_js()
    # As quatro funcoes da regra 3, da leitura da Qtd ate a frase do bloqueio.
    for nome in ("celulasEsperadasDoModelo", "celulasGeradasDoModelo",
                 "divergenciaDeCelulasDoModelo", "textoDaDivergenciaDeCelulas"):
        i = js.index("function " + nome + "(")
        trecho = js[i:js.index("\n}", i)]
        for proibido in ("item.quantidade =", "item.qtd =", "saveAmostraToDB",
                         "supabaseClient", ".update("):
            assert proibido not in trecho, (
                nome + " escreve em vez de so conferir: " + proibido
            )
