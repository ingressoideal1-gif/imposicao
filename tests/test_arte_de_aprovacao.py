# -*- coding: utf-8 -*-
"""A arte de aprovacao e regerada e salva sempre que o modelo e marcado PRONTO.

Regra do usuario, 19/08/2026: "deve ser gerada e salva novamente a arte de
amostra sempre que clicar em Arte Pronta". O motivo dela: depois de uma
correcao, o cliente continuava vendo a arte antiga no link.

A logistica antiga tinha dois gatilhos, e os dois eram frouxos:

  1. `_needsSnapshot`, ligado so por certas edicoes, agendava a gravacao para
     2 s DEPOIS do desenho -- fechar o card antes disso perdia a imagem;
  2. o "Gerar Link" disparava a regeneracao em segundo plano, sem esperar, LOGO
     DEPOIS de o link ja ter sido copiado para a area de transferencia.

Nos dois casos o atendente podia mandar o link antes de a imagem nova subir, e
o cliente aprovava a arte anterior a correcao -- sem nada na tela dizendo isso.

Marcar PRONTO e o momento em que o designer declara que a arte esta pronta: e o
lugar certo para congela-la, e o unico que o fluxo garante que sempre acontece
antes de o cliente ver. Agora a geracao e esperada ate o fim, e se falhar o
modelo NAO vira pronto -- porque marcar assim mesmo seria mandar o cliente
aprovar a arte velha.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "arte_de_aprovacao_harness.js")


def test_o_harness_da_arte_de_aprovacao_passa():
    assert os.path.exists(HARNESS), "o harness da arte de aprovacao sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_composicao_da_amostra_existe_uma_vez_so():
    """Uma segunda composicao faria a arte que o cliente aprova divergir da que o
    painel mostra, no dia em que so uma das duas fosse corrigida. E o defeito que
    este projeto ja produziu tres vezes clonando `script.js` para `pedido.js`."""
    with open(os.path.join(RAIZ, "frontend", "script.js"), encoding="utf-8") as f:
        js = f.read()
    assert js.count("async function regenerarAmostraDoModelo") == 1
    # O laco em lote nao pode ter voltado a compor por conta propria.
    i = js.index("async function forceRegenerateSnapshots")
    lote = js[i:js.index("\n}", i)]
    assert "drawAmostraFace" not in lote, (
        "o forceRegenerateSnapshots voltou a compor sozinho em vez de delegar"
    )
