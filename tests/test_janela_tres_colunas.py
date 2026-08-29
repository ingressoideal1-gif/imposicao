# -*- coding: utf-8 -*-
"""A janela de visualizacao em tres colunas (28/08/2026).

O usuario apontou duas coisas na versao anterior: o cabecalho estava confuso --
titulo, dois botoes, a caixa inteira do Refazer e os controles da previa, tudo
na mesma faixa -- enquanto a previa da imposicao ficava "perdida no meio da
tela", espremida entre a regua de cima e o painel do driver, que ocupava 30% da
largura o tempo todo. E notou que os botoes de imprimir e PDF estavam repetidos.

O desenho aprovado: cabecalho de UMA linha (de que modelo e' esta janela, e os
numeros da imposicao); controles da previa a esquerda; a previa com o CENTRO
INTEIRO; e as acoes a direita, em quatro grupos que abrem e fecham -- Imprimir e
PDF, Configuracao de Impressao, Gerenciamento de Cores, Refazer Folhas.

O layout e a lista completa de controles preservados sao medidos desenhando, no
harness em Chrome. O que este arquivo cobre e a condicao que o usuario poe em
toda mudanca desta tela: nao perder funcionalidade nenhuma.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "janela_tres_colunas_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_das_tres_colunas_passa():
    assert os.path.exists(HARNESS), "o harness das tres colunas sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_existe_um_par_so_de_gerar_pdf_e_imprimir():
    """O Refazer tinha um par proprio, que saiu.

    Dois caminhos para a mesma acao ja produziram defeito nesta tela: em
    18/08/2026 um segundo par ("PDF Sel." e "Imp. Sel.", no cabecalho do
    produto) chamava a funcao da outra aba e imprimia UM modelo quando dois
    estavam marcados. Com o Refazer ligado, o par unico passa a valer para a
    faixa escolhida.
    """
    html = _ler("frontend/index.html")
    assert 'id="ped-refazer-btn-print"' not in html, (
        "voltou o par de botoes proprio do Refazer"
    )

    pedido = _ler("frontend/pedido.js")
    for fn in ("pedPreviewGerarPDF", "pedPreviewImprimir"):
        corpo = pedido[pedido.index("window." + fn + " = function()"):]
        corpo = corpo[:corpo.index("\n};")]
        assert "refazerLigado()" in corpo, (
            fn + " nao consulta o Refazer: com ele ligado, o botao refaria a "
            "tiragem inteira em vez da faixa escolhida"
        )


def test_o_refazer_devolve_o_imprimir_a_um_modelo_ja_impresso():
    """A excecao que o par unico obriga a escrever.

    Modelo ja impresso perde o botao Imprimir, para nao duplicar tiragem por
    engano. Mas reimprimir uma faixa so faz sentido DEPOIS que a tiragem saiu --
    a folha amassou. Enquanto o Refazer tinha botao proprio isso se resolvia
    sozinho; com um par so, a excecao precisa estar no codigo.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("function updatePedImprimirButtonsVisibility()"):]
    corpo = corpo[:corpo.index("\n}\n") + 3]
    assert "refazerLigado" in corpo, (
        "o Imprimir voltou a sumir num modelo ja impresso mesmo com o Refazer "
        "ligado -- a reimpressao ficaria inalcancavel justamente quando serve"
    )


def test_os_numeros_da_imposicao_voltaram_a_aparecer():
    """O sumario estava escondido sem querer.

    Formato, Grade, Total, Folhas Estimadas, Celulas vazias e Saida moravam
    dentro de um `display:none !important` desde que o formulario antigo saiu da
    tela -- o `updatePedSummary` escrevia neles e ninguem via. Foram para o
    cabecalho da janela, com os mesmos ids.
    """
    html = _ler("frontend/index.html")
    janela = html[html.index('id="ped-preview-card-container"'):html.index("</div><!-- /ped-preview-home -->")]
    for campo in ("ped-sum-formato", "ped-sum-grade", "ped-sum-folhas",
                  "ped-sum-vazias", "ped-sum-saida"):
        assert 'id="' + campo + '"' in janela, campo + " nao esta na janela"
    assert html.count('id="ped-summary"') == 1, (
        "sobrou mais de um #ped-summary: o getElementById pegaria o errado"
    )


def test_o_cancelar_impressao_saiu_do_bloco_escondido():
    """Ele existia no codigo e nunca aparecia.

    Morava dentro do bloco `display:none !important` do formulario antigo, entao
    cancelar um envio em andamento nao era possivel por esta tela.
    """
    html = _ler("frontend/index.html")
    janela = html[html.index('id="ped-preview-card-container"'):html.index("</div><!-- /ped-preview-home -->")]
    assert 'id="ped-btn-cancel-print"' in janela, (
        "o Cancelar Impressao nao esta na janela"
    )
    assert html.count('id="ped-btn-cancel-print"') == 1
