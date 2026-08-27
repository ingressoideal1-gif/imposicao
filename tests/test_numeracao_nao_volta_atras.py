# -*- coding: utf-8 -*-
"""A numeracao escolhida pelo operador nao volta atras sozinha (27/08/2026).

O usuario relatou, do pedido 21202: "ele mudou sozinho para o banco errado".

`pedidos_modelos` guarda a numeracao do modelo DUAS vezes -- o texto escrito
pelo ERP do parceiro (`gabarito_operacional`) e o id derivado por este painel
(`amostra_num_id`). Quando os dois discordam, quem manda e o texto: e a regra do
`cor-numeracao-do-modelo.js`, e ela existe porque o parceiro troca a numeracao
de um modelo e o id em cache nunca mais deixaria a troca chegar a tela.

As duas telas de fila gravavam so o id. O operador escolhia a numeracao certa, o
id ia para o banco, o texto ficava o antigo -- e na abertura seguinte a
reconciliacao devolvia o id ao que o texto dizia. Ele nao tinha como vencer.

No 21202 o modelo 1000563 (05/set CAMAROTE PATROCINADORES, Qtd 1.920) tem
`gabarito_operacional` = "CAMAROTE PRESIDENTE 05" no ERP, e voltava sozinho para
aquela numeracao, de 3.000 linhas: a tela pedia 300 folhas onde cabiam 192, e o
dado impresso seria o de outro modelo -- sem erro em tela nenhuma.

O ciclo inteiro (escolher pela fila -> remontar a linha do banco -> passar pela
reconciliacao de verdade) e medido pelo harness em Node. O que este arquivo
cobre e a ligacao nas DUAS telas: `pedido.js` e um clone do `script.js` com os
ids renomeados, e correcao que existisse so de um lado repetiria a historia.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "numeracao_nao_volta_atras_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_numeracao_que_nao_volta_atras_passa():
    assert os.path.exists(HARNESS), "o harness da numeracao sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_as_DUAS_filas_gravam_o_texto_junto_com_o_id():
    """Sao duas telas de fila, e a regra precisa das duas."""
    for arquivo, funcao in (("frontend/pedido.js", "pedQueueUpdateNum"),
                            ("frontend/script.js", "impQueueUpdateNum")):
        fonte = _ler(arquivo)
        i = fonte.index("function " + funcao + "(")
        corpo = fonte[i:i + 4000]
        assert "'amostra_num_id', num.id" in corpo, (
            funcao + " nao grava mais o id da numeracao"
        )
        assert "'gabarito_operacional'" in corpo, (
            funcao + " grava so o id: a escolha do operador volta atras na "
            "proxima abertura, porque o texto do parceiro vence o id"
        )


def test_a_reconciliacao_continua_deixando_o_parceiro_mandar():
    """O outro lado, que a correcao nao pode ter quebrado.

    O texto do parceiro vencer o id em cache e o motivo de a reconciliacao
    existir: sem isso, uma troca feita no ERP nunca mais chegaria a tela.
    """
    fonte = _ler("frontend/cor-numeracao-do-modelo.js")
    assert "linha.gabarito_operacional" in fonte
    assert "emCache.is_custom" in fonte, (
        "a protecao da numeracao exclusiva do operador saiu da reconciliacao"
    )
