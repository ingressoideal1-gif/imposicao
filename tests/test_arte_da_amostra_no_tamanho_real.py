# -*- coding: utf-8 -*-
"""A arte em PDF entra na amostra no tamanho real, como a impressora faz.

Havia duas regras diferentes para a mesma coisa, e ninguém percebia enquanto a
arte tinha exatamente o tamanho da peça:

- **O motor** (`engine.py`) abre a arte em PDF e a coloca na célula com o rect
  do tamanho da *própria página* (`base_w`/`base_h`), centrada. A arte nunca é
  reduzida; o que passa da peça fica de fora, que é o que a faca corta.
- **A amostra na tela** encolhia a arte até o arquivo inteiro caber dentro da
  peça.

Onde a arte não batia com a peça, o operador via na tela uma arte menor do que
a que ia sair no papel, com faixa branca em volta que o papel não tem. Medido em
18/08/2026 nos 25 modelos mais recentes: as credenciais têm arte de 98 x 148 mm
numa peça de 105 x 148 mm, e dois modelos do pedido 20508 têm arte de 245 x 20 mm
numa peça Mobi de 148,5 x 52,25 mm — nesse a arte aparecia a 60% do tamanho.

A conversão: a página do PDF vem em pontos (2,8346 pt = 1 mm) e o canvas tem S
pixels por milímetro, então a escala do tamanho real é `S / 2.8346`.

Arte em **imagem** é outro caso e continua encaixando proporcionalmente: o motor
faz o mesmo com ela em `_load_base_as_pdf()`, que converte a imagem para uma
página do tamanho do item e encaixa dentro. O comentário lá diz, com todas as
letras, "equivalente ao frontend".
"""

import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _corpo_da_funcao(fonte, assinatura):
    inicio = fonte.index(assinatura)
    return fonte[inicio:fonte.index("\n}", inicio)]


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/cliente.js"])
def test_a_arte_em_pdf_usa_a_escala_do_tamanho_real(arquivo):
    corpo = _corpo_da_funcao(_ler(arquivo), "async function drawAmostraFace(")
    # `S / 2.8346` sozinho nao serve de prova: a camada da COR ja usava essa
    # conversao antes do conserto. O que distingue e a escala da ARTE.
    assert "const escalaTamanhoReal = S / 2.8346;" in corpo, (
        f"{arquivo}: drawAmostraFace nao calcula mais a escala do tamanho real da "
        f"arte. Sem isso a arte em PDF deixa de sair do tamanho que vai imprimir."
    )
    assert "page.getViewport({ scale: escalaTamanhoReal })" in corpo, (
        f"{arquivo}: a escala do tamanho real foi calculada e nao foi usada no "
        f"viewport da arte."
    )


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/cliente.js"])
def test_a_arte_em_pdf_nao_volta_a_encolher_ate_caber(arquivo):
    corpo = _corpo_da_funcao(_ler(arquivo), "async function drawAmostraFace(")
    for proibido in ("pdfScale = finalWidth / vp.width", "pdfScale = finalHeight / vp.height"):
        assert proibido not in corpo, (
            f"{arquivo}: a arte em PDF voltou a ser reduzida para caber na peca "
            f"({proibido}). A impressora nao reduz, entao a tela passa a mostrar "
            f"a arte menor do que ela sai no papel."
        )


def test_o_criador_de_arte_usa_a_mesma_regra_do_card():
    """O editor reproduz o card. Divergir poe a arte num lugar no editor e noutro no pedido."""
    corpo = _corpo_da_funcao(_ler("frontend/criador-arte.js"), "async function carregarArteBaseNoCanvas(")
    assert "escalaPranchaPxPorMm / (2.0 * 2.8346)" in corpo, (
        "criador-arte.js nao poe mais a arte em PDF no tamanho real. O editor volta a "
        "mostrar a arte num tamanho e o card do pedido noutro."
    )
    assert "if (ehPdf)" in corpo, (
        "criador-arte.js perdeu a separacao entre arte em PDF (tamanho real) e arte em "
        "imagem (contain)."
    )


def test_o_motor_continua_pondo_a_arte_no_tamanho_da_propria_pagina():
    """Se o motor mudar de regra, a tela tem de mudar junto — e este teste avisa.

    Desde 31/08/2026 a conta mora em `_arte_na_celula()`, que aceita uma escala
    por eixo (a do modo PDF Multi-Pagina). A regra guardada aqui e a do PADRAO,
    100%: a arte entra com o rect do tamanho da PROPRIA PAGINA, centrada, sem
    encolher para caber — e e essa que a amostra na tela copia.
    """
    import fitz
    from engine import _arte_na_celula

    fonte = _ler("engine.py")
    assert "base_w = page_base.rect.width" in fonte
    assert "base_h = page_base.rect.height" in fonte

    class _Cfg:
        item_w, item_h = 100.0, 50.0
        offset_h = offset_v = 0.0
        gap_h = gap_v = 0.0

    # Arte MAIOR que a celula num eixo: e o caso que separa "tamanho real" de
    # "encolhe ate caber".
    origem = fitz.Rect(0, 0, 120.0, 40.0)
    rect, clip = _arte_na_celula(_Cfg(), 10.0, 20.0, 120.0, 40.0, origem, 1.0, 1.0)

    assert rect.width == pytest.approx(120.0), (
        "engine.py nao poe mais a arte com a largura da propria pagina. "
        "A amostra na tela copia essa regra e precisa ser revista junto."
    )
    assert rect.height == pytest.approx(40.0), (
        "engine.py nao poe mais a arte com a altura da propria pagina. "
        "A amostra na tela copia essa regra e precisa ser revista junto."
    )
    assert rect.x0 == pytest.approx(10.0 + (100.0 - 120.0) / 2), "a arte saiu do centro da celula"
    assert rect.y0 == pytest.approx(20.0 + (50.0 - 40.0) / 2), "a arte saiu do centro da celula"
    assert clip == origem, "a 100% a pagina inteira da arte tem de ser colada"


# ── A janela de visualizacao da imposicao (02/09/2026) ──────────────────────
#
# O TERCEIRO lugar com a mesma regra, e o unico que tinha ficado para tras. O
# conserto de 18/08/2026 arrumou o card do modelo (`drawAmostraFace`) e o
# Criador de Arte; a previa da folha continuou encolhendo a arte em PDF ate ela
# caber na celula, com um comentario dizendo que "o backend sempre ajusta
# proporcionalmente" -- o que so vale para arte em IMAGEM.
#
# Medido no pedido 21408, celula de 105 x 148 mm:
#
#   modelo 1000739  arte 104,35 x 158,35 mm  ->  a previa mostrava 93,5% do tamanho
#   modelo 1000740  arte 110,70 x 164,70 mm  ->  a previa mostrava 89,9% do tamanho
#
# O motor imprimia certo nos dois. Era so a janela.

PREVIAS_DA_IMPOSICAO = [
    ("frontend/pedido.js", "function drawPedPreview("),
    ("frontend/script.js", "function drawPreview("),
]


@pytest.mark.parametrize("arquivo,assinatura", PREVIAS_DA_IMPOSICAO)
def test_a_previa_da_imposicao_nao_encolhe_a_arte_em_pdf(arquivo, assinatura):
    fonte = _ler(arquivo)
    assert assinatura in fonte, f"{arquivo}: nao achei a previa da imposicao"

    proibido = "const fitScale = Math.min(item_w / art_orig_w, item_h / art_orig_h);"
    assert proibido not in fonte, (
        f"{arquivo}: a previa voltou a encolher TODA arte ate caber na celula. "
        f"Arte em PDF entra no tamanho real (o motor usa `base_w`/`base_h`); so "
        f"a arte em IMAGEM encaixa proporcionalmente."
    )


@pytest.mark.parametrize("arquivo,assinatura", PREVIAS_DA_IMPOSICAO)
def test_a_previa_separa_arte_em_pdf_de_arte_em_imagem(arquivo, assinatura):
    fonte = _ler(arquivo)
    trecho = fonte[fonte.index(assinatura):]
    trecho = trecho[:trecho.index("let dh = art_orig_h") + 200]

    assert "const arteEhPdf = !!activePdfDoc;" in trecho, (
        f"{arquivo}: a previa nao distingue mais arte em PDF de arte em imagem. "
        f"O motor trata as duas de formas diferentes -- PDF no tamanho real, "
        f"imagem encaixada -- e a tela tem de copiar as duas."
    )
    assert "arteEhPdf ? 1 : Math.min(" in trecho, (
        f"{arquivo}: a arte em PDF deixou de entrar no tamanho real na previa."
    )


def test_a_previa_do_pedido_usa_o_tamanho_da_pagina_do_VERSO():
    """Frente e verso podem ser arquivos de tamanhos diferentes.

    No modelo 1000740 do pedido 21408 a frente tem 110,70 x 164,70 mm e o verso
    104,35 x 158,35 mm. O motor le o rect de CADA pagina (`base_w_verso`);
    desenhar o verso com a medida da frente poria o verso 6% maior do que ele
    sai no papel.
    """
    fonte = _ler("frontend/pedido.js")
    assert "state.pedArtVersoWidth" in fonte, (
        "pedido.js nao guarda mais o tamanho da pagina do verso"
    )
    trecho = fonte[fonte.index("function drawPedPreview("):]
    trecho = trecho[:trecho.index("let dh = art_orig_h") + 200]
    assert "state.pedArtVersoWidth" in trecho, (
        "a previa nao usa o tamanho do VERSO ao desenhar a face de tras"
    )

    engine = _ler("engine.py")
    assert "base_w_verso = page_base_v.rect.width" in engine, (
        "o motor mudou de regra para o verso; a previa copia essa regra e "
        "precisa ser revista junto"
    )


def test_a_folha_combinada_desenha_cada_arte_no_tamanho_do_arquivo():
    """Somar modelos numa folha so' e o unico caminho que nao passa pelo `loadPedArtFile`.

    Cada arte e baixada dentro do proprio `drawPedPreview`, pela URL, e ninguem
    anotava de que tamanho ela era: `art_orig_w` caia no `item_w` de reserva e
    toda arte da folha combinada saia desenhada do tamanho da CELULA, enquanto o
    motor a cola no tamanho do arquivo.
    """
    pedido = _ler("frontend/pedido.js")

    assert "async function medirArteDaFolhaCombinada(" in pedido, (
        "a medida das artes da folha combinada sumiu"
    )
    corpo = _corpo_da_funcao(pedido, "function drawPedPreview(")
    assert "medirArteDaFolhaCombinada(itemArteUrl, doc)" in corpo, (
        "a previa nao mede mais a arte da folha combinada quando ela chega"
    )
    assert "artWidth: (state.multiArtesPdfTamanho[itemArteUrl] || {}).w" in corpo, (
        "a medida foi tirada e nao chega ao objeto que a previa desenha"
    )
    assert "art_orig_w = multiArteItem.artWidth || item_w;" in corpo, (
        "a previa parou de usar a medida da arte da folha combinada"
    )


def test_o_payload_da_impressao_nao_ganhou_campo_novo():
    """A medida e' coisa de TELA. O motor le o tamanho do arquivo sozinho.

    O `runPedImposition` monta o payload que vai ao motor; campo novo ali e'
    risco no caminho da impressao, e nao traz nada -- o `base_w` do engine.py
    sai do proprio PDF.
    """
    pedido = _ler("frontend/pedido.js")
    i = pedido.index("window.runPedImposition = async function")
    j = pedido.index("window.pedQueueUpdateCor", i)
    corpo = pedido[i:j]

    assert "artWidth" not in corpo, (
        "o payload da impressao ganhou a medida da arte; ela e' so da previa"
    )
    assert "medirArteDaFolhaCombinada" not in corpo, (
        "o caminho da impressao passou a medir arte; nao e' trabalho dele"
    )
