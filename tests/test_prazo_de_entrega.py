# -*- coding: utf-8 -*-
"""O PRAZO ENTREGA do Painel de Producao (20/08/2026).

O usuario apontou o campo real: **`propostas_os.data_termino`**. Ate entao a
coluna mostrava um prazo INVENTADO -- `getFallbackPrazo` devolvia a data de
criacao mais 3 a 7 dias, escolhidos pelo resto da divisao do numero do pedido.
Ele existia so para o filtro "Para Hoje / Atrasados" ter em que se apoiar
enquanto o campo verdadeiro nao fosse definido, e o comentario no codigo dizia
que sairia quando o campo aparecesse. Apareceu, e ele saiu.

Duas consequencias que o teste guarda:

1. **Pedido sem linha em `propostas_os` fica sem prazo, e a coluna mostra "--".**
   A tabela e nova do parceiro e ainda nao cobre todo pedido. Data de entrega
   chutada numa grafica e pior do que campo vazio -- foi a mesma razao que
   derrubou os nomes de cliente de mentira.

2. **"Atrasado" passou a ser "o DIA do prazo ja passou"**, e nao mais "data e
   hora anteriores ao momento atual". `data_termino` e data pura: chega sempre a
   meia-noite, e comparar por instante pintaria de vermelho, o dia inteiro, todo
   pedido que vence HOJE -- que e justamente o que o operador precisa distinguir
   do que ele ja perdeu.

O harness recorta as tres funcoes do script.js e as executa com datas montadas a
partir do dia de hoje -- nada aqui e copia da regra.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "prazo_de_entrega_harness.js")


def test_o_harness_do_prazo_de_entrega_passa():
    assert os.path.exists(HARNESS), "o harness do prazo de entrega sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
