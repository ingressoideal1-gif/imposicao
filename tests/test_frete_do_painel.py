# -*- coding: utf-8 -*-
"""A logomarca do frete na coluna "Frete" do Painel de Producao.

Pedido do usuario em 19/08/2026: o frete Veppo deve aparecer com a marca dele,
como ja acontecia com Sedex, Sao Miguel, Motoboy e Retirada.

O nome do frete vem do parceiro, escrito a mao no campo
`propostas.frete_escolhido`, e chega em varias grafias. No banco de producao o
Veppo aparece em 27 pedidos, escrito de quatro jeitos: `VEPPO`, `veppo`, `Veppo`
e `VEPPO-RS` (esta ultima nos pedidos antigos, de 13824 a 17537). Uma chave so
no mapa cobre os quatro: a comparacao e feita em maiusculas e o sufixo `-RS`
entra pela busca por correspondencia parcial que ja existia.

Ha tambem uma coluna `tem_veppo` na tabela do parceiro, e ela NAO serve: sao 5
linhas no total, todas antigas, e uma delas marca `true` num pedido cujo frete
escrito e "SAO MIGUEL". Quem manda e o texto de `frete_escolhido`.

O harness recorta do script.js o proprio trecho que escolhe a imagem e o executa
-- nao ha copia da regra aqui. A busca parcial e o motivo de o teste conferir
tambem os OUTROS fretes: chave nova casa por pedaco de texto e pode sequestrar
frete alheio sem ninguem perceber.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "frete_do_painel_harness.js")


def test_o_harness_do_frete_do_painel_passa():
    assert os.path.exists(HARNESS), "o harness do frete do painel sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
