# -*- coding: utf-8 -*-
"""A solicitacao de alteracao dos dados de nota fiscal e entrega (20/08/2026).

O cliente abre o link, clica em ALTERAR, escreve o que precisa ser corrigido na
nota fiscal ou no endereco de entrega e salva. No painel, dentro do pedido, essa
frase tinha de aparecer na caixa "Dados de Entrega / Faturamento Alterados".

Nao aparecia nunca. No lugar dela vinha a frase generica "O cliente solicitou
revisao nos dados de entrega e faturamento", que e o texto de fallback.

Tres causas somadas, todas silenciosas:

1. A tela do cliente gravava com `.update()` em `pedidos_artes`. Um UPDATE que
   nao acha linha nenhuma NAO e erro no PostgREST: responde 200 com `[]`, e o
   supabase-js nao lanca. O `try/catch` em volta era enfeite.

2. A linha do pedido quase nunca existia: 38 linhas para 8.263 propostas em
   20/08/2026 -- dos 12 pedidos mais recentes, um so tinha linha. Ela nascia
   apenas quando alguem preenchia o briefing no painel.

3. E a tela do cliente nao pode cria-la: roda como `anon` e a RLS recusa o
   INSERT (42501). Ler e atualizar, pode.

O conserto tem os dois lados: o painel cria a linha quando gera o link do
cliente (`garantirLinhaDePedidoArte`), e a tela do cliente grava por
`gravarCorrecaoDoCliente`, que pede as linhas afetadas de volta e devolve o
resultado -- se nao gravou, o cliente ve um aviso com o que fazer, em vez de um
"aprovado com sucesso" mentiroso. O botao "Salvar Correcao", que ate entao so
pintava a tela, passou a gravar de verdade.

Para os pedidos que ja estavam com o cliente, ha
`sql/correcao_do_cliente_precisa_de_linha.sql`.

O harness recorta as duas funcoes do frontend e as executa contra um banco de
mentira -- nada aqui e copia da regra.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "correcao_do_cliente_harness.js")
SQL = os.path.join(RAIZ, "sql", "correcao_do_cliente_precisa_de_linha.sql")


def test_o_harness_da_correcao_do_cliente_passa():
    assert os.path.exists(HARNESS), "o harness da correcao do cliente sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_sql_de_reparo_existe_e_so_insere_o_que_falta():
    """O reparo dos pedidos que ja estavam com o cliente pode ser repetido."""
    assert os.path.exists(SQL), "o SQL de reparo sumiu"
    texto = open(SQL, encoding="utf-8").read()

    assert "INSERT INTO pedidos_artes" in texto, "o SQL nao cria as linhas que faltam"
    assert "NOT EXISTS" in texto, "o SQL precisa pular quem ja tem linha (poder repetir)"
    assert "DELETE" not in texto.upper(), "reparo nao apaga nada"
    assert "DROP" not in texto.upper(), "reparo nao derruba nada"
