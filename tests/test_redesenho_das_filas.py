# -*- coding: utf-8 -*-
"""As filas se redesenham uma vez por rajada, nao uma por campo salvo (27/08/2026).

Depois de a rede sair do caminho da troca de modelo (a releitura enxuta, v739),
sobrou uma conta de CPU que era a maior parte do que o usuario sentia no pedido
21202. Medido na tela, com o pedido aberto e todos os bancos ja em memoria, UM
clique num modelo chamava `renderPedOSQueue` 8 vezes (631 ms) e
`renderImpOSQueue` 7 vezes (454 ms) -- seis de cada vindas do
`saveActiveOSItemField`, porque abrir um modelo salva meia duzia de campos e
cada salvamento redesenhava as duas filas inteiras: 52 linhas, cada uma com um
`<select>` de 152 numeracoes.

O comportamento do agendador e medido pelo harness em Node. O que este arquivo
cobre e a ligacao: que o salvamento passe pelo agendador em vez de desenhar
direto.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "redesenho_das_filas_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_redesenho_passa():
    assert os.path.exists(HARNESS), "o harness do redesenho sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_salvamento_do_item_ativo_passa_pelo_agendador():
    """Desenhar direto aqui e o que fazia seis redesenhos por clique."""
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function saveActiveOSItemField")
    corpo = fonte[i:fonte.index("window.saveActiveOSItemField", i)]
    assert "agendarRedesenhoDasFilas()" in corpo, (
        "saveActiveOSItemField nao usa mais o agendador"
    )
    assert "renderPedOSQueue()" not in corpo and "renderImpOSQueue()" not in corpo, (
        "saveActiveOSItemField voltou a redesenhar as filas direto: sao seis "
        "redesenhos das duas tabelas por clique num modelo"
    )


def test_o_render_da_fila_continua_aplicando_o_formato_padrao():
    """Por que as filas NAO podem ser simplesmente puladas quando escondidas.

    `renderPedOSQueue` e `renderImpOSQueue` tem efeito colateral no estado:
    aplicam em `item.formato_id`/`item.saida_id` o padrao do produto. O
    `abrirImposicaoDoPedido` depende disso e os chama de proposito ANTES de
    carregar o modelo -- sem eles o `enviarParaImposicao` acha o formato vazio,
    cai no primeiro formato do sistema e a cor do modelo se perde.

    Este teste existe para que a proxima tentativa de otimizar (pular o
    redesenho da fila que esta escondida, por exemplo) esbarre nesta nota antes
    de quebrar aquilo.
    """
    for arquivo, funcao in (("frontend/pedido.js", "renderPedOSQueue"),
                            ("frontend/script.js", "renderImpOSQueue")):
        fonte = _ler(arquivo)
        i = fonte.index("function " + funcao + "()")
        corpo = fonte[i:i + 20000]
        assert "item.formato_id = formatoPadraoId" in corpo, (
            funcao + " nao aplica mais o formato padrao do produto: confira o "
            "abrirImposicaoDoPedido, que conta com isso"
        )
