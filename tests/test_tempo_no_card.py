# -*- coding: utf-8 -*-
"""A coluna "Tempo" da Lista de Arte.

Pedido do usuario em 19/08/2026: a coluna "Data Liberacao" vira "Tempo" e mostra
ha quanto tempo o pedido esta no card em que esta ("01:05"). Verde ate 1h, azul
ate 2h, laranja ate 3h, vermelho depois -- nos quatro cards, por escolha dele. O
pedido de maior tempo assume o topo da lista. As duas datas que estavam na coluna
passaram para o titulo da celula.

O CARD e calculado no painel; o RELOGIO precisa de memoria. Essa memoria e a
tabela `imposition_tempo_no_card` (uma linha por pedido), escrita pelo proprio
painel quando ele percebe a troca. Foi a opcao escolhida contra um robo no
servidor: o robo seria fiel ao relogio real mesmo com todos os paineis fechados,
mas exigiria uma segunda copia da regra de classificacao, em SQL, que divergiria
da do painel no primeiro ajuste. A consequencia aceita e que troca acontecida de
madrugada so e registrada quando alguem abre o painel de manha.

A REGRA DOS 60 MINUTOS e o coracao disto: em "Em Arte", sair e voltar em ate 60
minutos nao apaga a contagem -- ela segue de onde parou. Passou de 60 minutos
fora, volta ao zero, em verde. Nos demais cards zera a cada troca.

Foi testando essa regra que apareceu um erro real da primeira implementacao: o
pedido que passava por DOIS cards fora da arte (Aprovacao e depois Aprovados)
perdia o credito no segundo salto, mesmo voltando em menos de 60 minutos. O que
conta e ha quanto tempo ele saiu DA ARTE, e nao do card anterior.

Sao dois harness: um roda a regra com um relogio de mentira, para adiantar as
horas sem esperar por elas; o outro desenha a coluna num Chrome de verdade e
confere que a cor chega ao pixel e que os digitos ficam alinhados de uma linha
para a outra.
"""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.mark.parametrize("harness", [
    "tempo_no_card_harness.js",
    "tempo_na_tela_harness.js",
])
def test_os_harness_do_tempo_no_card_passam(harness):
    caminho = os.path.join(RAIZ, "tests", harness)
    assert os.path.exists(caminho), "o harness " + harness + " sumiu"

    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
