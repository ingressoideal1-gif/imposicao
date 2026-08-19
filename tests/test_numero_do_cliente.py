# -*- coding: utf-8 -*-
"""O numero do cliente aparece ao lado do nome: "Patrick Soares Furtado - 28449".

Pedido do usuario em 19/08/2026. Ele deu tres exemplos, e os tres serviram de
prova contra o banco:

    pedido 20951 -> cliente 23860 (USINA MKM1 LTDA)
    pedido 20925 -> cliente 59131 (P49 CENTRO DE DISTRIBUICAO DE BEBIDAS LTDA)
    pedido 20928 -> cliente 28449 (Patrick Soares Furtado)

Os tres batem com `propostas.id_cliente`, que e a mesma chave da tabela
`clientes` (`clientes.id_cliente`). Essa e a relacao.

A armadilha esta na coluna vizinha. O painel ja carregava um campo `id_cliente`
montado como `id_faturado || id_cliente`: ele serve para buscar os dados de
faturamento e para casar as numeracoes do cliente (`Cli_Num`), e por isso ficou
como estava. Mas quem paga pode ser outro -- numa amostra de mil propostas, duas
divergem, e o pedido 20940 e do cliente 43520 faturando no 66163. Ao lado de um
NOME tem de vir o numero de quem esse nome nomeia, entao o rotulo usa
`id_cliente` puro, num campo proprio (`numero_cliente`).
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "numero_do_cliente_harness.js")


def test_o_harness_do_numero_do_cliente_passa():
    assert os.path.exists(HARNESS), "o harness do numero do cliente sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
