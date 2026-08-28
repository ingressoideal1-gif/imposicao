# -*- coding: utf-8 -*-
"""A barra do titulo de cada produto diz quanto tem, quanto falta e filtra por cor.

Pedido do usuario em 28/08/2026, sobre o Painel de Producao -> edicao do pedido:
"no modal de cada produto (Triband, Mobi, Tex ...) no local marcado na imagem
(barra do titulo do produto) colocar a informacao da quantidade total do produto
(soma das quantidades de todos os modelos) e a quantidade restante. Substituir o
drop no final desta mesma linha por um drop com as cores de cada produto, ao
selecionar no drop uma cor, mostra apenas na tela os produtos da mesma cor."

E, no mesmo dia: "Adicionar no topo da pagina, lateral direita da tela, lado
oposto do titulo, um botao escrito 'Aguardando' quando clicado mostra apenas os
modelos ainda nao impressos, desmarcado mostra todos".

O comportamento (a conta, a cor e o filtro) e medido rodando as funcoes de
verdade no harness em Node. O que este arquivo cobre e a ligacao com a tela:
que o cabeçalho realmente mostre a conta, que o drop do fim da linha seja o de
cor, e que a linha carregue a cor para o filtro achar.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "cor_e_conta_do_produto_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _corpo_da_fila():
    fonte = _ler("frontend/pedido.js")
    i = fonte.index("function renderPedOSQueue()")
    return fonte[i:fonte.index("function updatePedImprimirButtonsVisibility", i)]


def test_o_harness_da_barra_do_produto_passa():
    assert os.path.exists(HARNESS), "o harness da barra do produto sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_barra_do_titulo_mostra_a_conta_do_produto():
    corpo = _corpo_da_fila()
    assert "contaDoProduto(groupItens)" in corpo, (
        "a fila nao conta mais o produto inteiro"
    )
    assert "${resumoDoProduto}" in corpo, (
        "a conta saiu da barra do titulo do produto -- e la que o operador "
        "pergunta quantas pecas o pedido tem"
    )
    # A conta fica ao lado do nome do produto, dentro do cabecalho.
    i_titulo = corpo.index("${nomeReal} ${setorBadge}")
    i_conta = corpo.index("${resumoDoProduto}")
    assert 0 < i_conta - i_titulo < 400, (
        "a conta se afastou do nome do produto na barra do titulo"
    )


def test_o_drop_do_fim_da_linha_e_o_filtro_de_cor():
    corpo = _corpo_da_fila()
    assert "filtrarFilaPorCor(" in corpo, (
        "o drop de cor sumiu do cabecalho do produto"
    )
    assert "${coresFiltroOptions}" in corpo, (
        "o drop de cor nao lista mais as cores dos modelos deste produto"
    )
    assert "updateBoxSaida" not in corpo, (
        "o drop de Saida voltou ao cabecalho: o usuario pediu que ele desse "
        "lugar ao de cor. A Saida continua no campo '4. Saida' do formulario, "
        "que e o que runPedImposition le na hora de imprimir."
    )


def test_a_linha_e_a_caixa_carregam_a_cor_para_o_filtro_achar():
    corpo = _corpo_da_fila()
    assert 'data-caixa-cor="${chaveDaCaixa}"' in corpo, (
        "a caixa do produto nao se identifica mais para o filtro"
    )
    assert 'data-cor-chave="${corDoItem.chave}"' in corpo, (
        "a linha nao carrega mais a cor: o filtro nao teria como escondê-la"
    )
    assert "aplicarFiltrosDaFila();" in corpo, (
        "o redesenho da fila nao reaplica os filtros, e a escolha se perde "
        "a cada campo salvo"
    )
    assert 'data-impresso=' in corpo, (
        "a linha nao diz mais se ja foi impressa: o botao Aguardando nao teria "
        "como escondê-la"
    )


def test_a_cor_da_linha_e_a_do_filtro_sao_a_mesma_resposta():
    """Duas resolucoes de cor divergiriam, e o filtro esconderia o que a bolinha pinta."""
    corpo = _corpo_da_fila()
    assert "corPorItem.get(String(item.id))" in corpo, (
        "a linha voltou a resolver a cor por conta propria em vez de reaproveitar "
        "a que alimentou o filtro do cabecalho"
    )
    # O casamento aproximado da NUMERACAO continua aqui; o da COR e que saiu.
    assert "globalFuzzyMatch(c.name" not in corpo, (
        "o casamento aproximado de cor voltou para dentro do desenho da linha: "
        "ele mora em resolverCorDoModelo, que a fila e o filtro dividem"
    )


def test_o_botao_aguardando_fica_no_topo_oposto_ao_titulo():
    """Ele vale para a fila inteira, entao nao podia morar na caixa de um produto."""
    for pagina in ("frontend/producao.html", "frontend/index.html"):
        fonte = _ler(pagina)
        i = fonte.index('<section id="view-pedido"')
        cabecalho = fonte[i:fonte.index("<!-- Steps bar", i)]

        assert 'id="btn-ped-so-aguardando"' in cabecalho, (
            pagina + ": o botao Aguardando saiu do cabecalho do view-pedido"
        )
        assert "page-header-text" in cabecalho, pagina + ": cabecalho inesperado"
        assert cabecalho.index("page-header-text") < cabecalho.index("btn-ped-so-aguardando"), (
            pagina + ": o botao tem de vir DEPOIS do texto do titulo -- o "
            ".page-header e um flex com space-between, e e essa ordem que o joga "
            "para o lado oposto"
        )
        assert "alternarSoAguardando()" in cabecalho, (
            pagina + ": o botao nao chama mais o filtro"
        )


def test_a_lista_vazia_pelo_filtro_se_explica():
    """Tela vazia sem explicacao deixa o operador achar que o pedido sumiu."""
    for pagina in ("frontend/producao.html", "frontend/index.html"):
        fonte = _ler(pagina)
        i = fonte.index('<div id="ped-os-queue"')
        fim = fonte.index('<div class="form-grid', i)
        fila = fonte[i:fim]

        assert 'id="ped-fila-vazia"' in fila, (
            pagina + ": o recado da lista vazia precisa morar DENTRO do "
            "#ped-os-queue -- fora dele, ele apareceria sem pedido aberto"
        )
        assert "Aguardando" in fila, (
            pagina + ": o recado tem de dizer qual botao desfaz o filtro"
        )
