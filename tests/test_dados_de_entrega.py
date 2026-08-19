# -*- coding: utf-8 -*-
"""A caixa "Dados de Entrega e Faturamento" mostra o que o CLIENTE pediu.

Pedido 20928, 19/08/2026: o painel exibia, sob o titulo "Solicitacao de
Alteracao enviada pelo Cliente", a frase "Registrada nova cobranca PIX, valor:
R$ 250,00". O cliente nao tinha pedido nada -- a frase foi escrita pelo
Financeiro do sistema PARCEIRO, no chat dele.

Onde a solicitacao do cliente e realmente guardada: `pedidos_artes`, tabela
nossa, no campo `entrega_dados` (o status) e na chave
`correcao_entrega_faturamento` do JSON `observacoes` (o texto, com data e hora).

A causa do conflito: nao achando o texto ali, o painel ia ler `propostas_chat`
-- tabela do parceiro -- e escolhia uma mensagem com um filtro que terminava em
`|| m.length > 5`, ou seja, aceitava qualquer coisa.

O caminho foi removido, e nao consertado, porque nunca teve como funcionar:
todas as nossas gravacoes naquele chat mandam a coluna `remetente_nome`, que nao
existe la (a coluna e `autor_nome`), entao o PostgREST recusa a linha inteira e o
erro cai num catch vazio. Conferido no banco: zero mensagens nossas, em tres
buscas diferentes. O que aquele trecho lia era, sempre e so, dado do parceiro.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "dados_de_entrega_harness.js")


def test_o_harness_dos_dados_de_entrega_passa():
    assert os.path.exists(HARNESS), "o harness dos dados de entrega sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
