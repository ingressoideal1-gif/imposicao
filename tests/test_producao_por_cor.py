# -*- coding: utf-8 -*-
"""Contratos de isolamento da página Produção por Cor."""
import io
import os
import subprocess


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as arquivo:
        return arquivo.read()


def test_pagina_nova_esta_no_menu_e_tem_recursos_proprios():
    html = _ler("frontend/index.html")
    assert 'id="nav-producao-cor"' in html
    assert 'id="view-producao-cor"' in html
    assert '/producao-por-cor.css?v=' in html
    assert '/producao-por-cor.js?v=' in html
    assert 'id="ppc-product-select"' in html
    assert '<option value="">Selecione um produto</option>' in html
    assert "Ordem de envio" not in html[html.index('id="view-producao-cor"'):html.index('id="view-pedido"')]


def test_css_da_pagina_e_escopado():
    css = _ler("frontend/producao-por-cor.css")
    regras = [linha.strip() for linha in css.splitlines() if linha.strip().endswith("{")]
    assert regras
    assert all(linha.startswith("#view-producao-cor") or linha.startswith("@media") for linha in regras)


def test_filtro_exige_produto_e_cor():
    resultado = subprocess.run(
        ["node", os.path.join(RAIZ, "tests", "producao_por_cor_harness.js")],
        cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    assert "OK:" in resultado.stdout


def test_a_lista_so_aceita_modelo_aguardando_e_abre_com_carga_completa():
    pagina = _ler("frontend/producao-por-cor.js")
    assert "&& modeloEstaAguardando(record)" in pagina
    assert ".filter(modeloEstaAguardando)" in pagina
    assert "typeof window.pedidoNaGrafica === 'function' && window.pedidoNaGrafica(order)" in pagina
    assert "return inFactory && !alreadyLeft" in pagina
    assert "item._dbLoaded === true" in pagina
    assert "fullItem = await loadFullItem(itemId, osId)" in pagina


def test_status_reutiliza_o_mesmo_caminho_do_painel_de_producao():
    pagina = _ler("frontend/producao-por-cor.js")
    principal = _ler("frontend/script.js")
    assert "window.updateItemImpressao(" in pagina
    assert "from('pedidos_modelos').update({ status_impressao: novoStatus })" in principal
    assert "pedidos-modelo-status-impressao" in pagina
    assert "pedidos-modelo-status-impressao" in principal
    assert ".insert(" not in pagina
    assert ".upsert(" not in pagina
    assert ".delete(" not in pagina


def test_janela_do_pedido_tem_adaptador_opcional_e_preserva_o_padrao():
    pedido = _ler("frontend/pedido.js")
    assert "window.PedidoJanelaExterna" in pedido
    assert "document.getElementById(`ped-queue-row-${itemId}`)" in pedido
    assert "window.showView('view-pedido')" in pedido
    assert "casa.appendChild(janela)" in pedido


def test_permissao_de_producao_protege_menu_e_view_novos():
    principal = _ler("frontend/script.js")
    assert "perm_producao_view:    ['nav-lista-impressao', 'nav-producao-cor', 'nav-montagem']" in principal
    assert "perm_producao_view:    ['view-lista-impressao', 'view-producao-cor', 'view-montagem']" in principal
