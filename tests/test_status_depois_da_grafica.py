# -*- coding: utf-8 -*-
"""Pedido com status posterior ao chão de fábrica sai da tela inicial dos painéis.

## A regra, dada pelo usuário em 27/08/2026

> "Quando um pedido constar com Status posterior aos status do painel de
> acabamento e do painel de produção (EXPEDICAO, EM TRANSITO, ENTREGUE) devem
> sair da tela inicial dos paineis."

É a mesma razão que rege o Painel do Acabamento desde 24/08/2026: o que fica na
frente do operador é o trabalho **daquela** mesa. Pedido despachado, em trânsito
ou entregue não é trabalho de ninguém aqui dentro — ele só ocuparia a lista e
faria o operador procurar entre pedidos que já saíram do prédio.

## O que estava certo e o que faltava

As duas telas já se guiavam por listas **positivas**: a Produção aceita
`EM PRODUCAO`/`EM IMPRESSAO`, e o Acabamento aceita esses mais o `EXPEDICAO` do
seu botão Expedição. Por consequência, os três status já ficavam de fora — mas
por dedução, não por regra escrita. Bastava alguém alargar uma daquelas listas
para o pedido entregue voltar à tela sem ninguém perceber.

Faltava, essa sim, a parte viva: `state.ordens` é montado **uma vez**, e o
`status_interno` de cada pedido ficava congelado nesse retrato. Quem move o
pedido para EXPEDICAO, EM TRANSITO ou ENTREGUE é o ERP do parceiro, em outra
tela e a qualquer hora — e o painel da gráfica continuava mostrando o pedido até
alguém recarregar a página. A regra valia no instante do carregamento e mais
nada.

## Onde a regra mora

Em `SINAIS_DEPOIS_DA_GRAFICA` e `pedidoJaPassouDaGrafica`, no `script.js`, uma
vez só. O `acabamento.js` a consulta pelo `window`, como já faz com as contas de
prazo — duas cópias divergiriam no primeiro status novo que o parceiro
inventasse.

A única exceção é o botão **Expedição** do Acabamento: ele não é a tela inicial,
é o comprovante do que a bancada acabou de despachar, e o `passaNoPrazo` já
cuida de mostrar o expedido só ali.
"""
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")
ACABAMENTO = os.path.join(RAIZ, "frontend", "acabamento.js")
HARNESS = os.path.join(RAIZ, "tests", "acabamento_harness.js")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def _corpo(texto, marca):
    i = texto.index(marca)
    return texto[i:texto.index("\n}", i) + 2]


def test_o_harness_do_acabamento_cobre_a_regra():
    """Ele passou a ler a regra do `script.js` de verdade, e não uma cópia."""
    harness = _ler(HARNESS)
    assert "pedidoJaPassouDaGraficaReal" in harness, (
        "o harness do acabamento parou de importar a regra do script.js"
    )
    assert "statusPosteriorSaiDaTela" in harness, (
        "sumiu do harness o teste dos status posteriores"
    )

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_os_tres_status_estao_na_regra():
    texto = _ler(SCRIPT)
    lista = texto[texto.index("const SINAIS_DEPOIS_DA_GRAFICA = ["):]
    lista = lista[:lista.index("];")]
    for status in ("EXPEDICAO", "EXPEDIÇÃO", "EM TRANSITO", "EM TRÂNSITO", "ENTREGUE"):
        assert f"'{status}'" in lista, (
            f"{status} saiu de SINAIS_DEPOIS_DA_GRAFICA — o pedido voltaria a "
            "aparecer na tela inicial dos paineis"
        )


def test_a_retirar_fica_de_fora_da_regra():
    """Material no balcão esperando o cliente ainda pode voltar para a bancada."""
    texto = _ler(SCRIPT)
    lista = texto[texto.index("const SINAIS_DEPOIS_DA_GRAFICA = ["):]
    lista = lista[:lista.index("];")]
    assert "'A RETIRAR'" not in lista and "'RETIRADO'" not in lista, (
        "A RETIRAR/RETIRADO entraram na regra sem o usuario pedir; ele nomeou "
        "EXPEDICAO, EM TRANSITO e ENTREGUE"
    )


def test_a_regra_le_status_interno_e_nao_status_pedido():
    """`status_pedido` está preso em NAO_INICIADO em 8.600 das 8.602 propostas."""
    corpo = _corpo(_ler(SCRIPT), "function pedidoJaPassouDaGrafica(")
    assert "status_interno" in corpo, "a regra parou de ler o status_interno"
    assert "status_pedido" not in corpo, (
        "a regra passou a olhar `status_pedido`, que e campo morto no ERP"
    )


def test_o_painel_de_producao_aplica_a_regra():
    corpo = _corpo(_ler(SCRIPT), "let ordensImpressao = state.ordens.filter(")
    assert "pedidoJaPassouDaGrafica(os)" in corpo, (
        "a Fila de Producao parou de aplicar a regra dos status posteriores"
    )


def test_o_acabamento_aplica_a_regra_e_preserva_o_botao_expedicao():
    corpo = _corpo(_ler(ACABAMENTO), "function pedidosDoPainel(")
    assert "jaPassouDaGrafica(os)" in corpo, (
        "o Painel do Acabamento parou de aplicar a regra"
    )
    assert "ehExpedido(os)" in corpo, (
        "o EXPEDICAO deixou de ser exceção — o botão Expedição, que é o "
        "comprovante do que a bancada despachou, ficaria vazio"
    )


def test_o_acabamento_nao_tem_copia_da_lista():
    """Duas listas divergiriam no primeiro status novo do parceiro."""
    texto = _ler(ACABAMENTO)
    assert "SINAIS_DEPOIS_DA_GRAFICA = [" not in texto, (
        "o acabamento.js ganhou uma copia da lista; ela mora no script.js"
    )
    assert "fn('pedidoJaPassouDaGrafica')" in texto, (
        "o acabamento.js parou de consultar a regra do script.js pelo window"
    )


def test_o_status_e_relido_enquanto_o_painel_esta_aberto():
    """Sem isto a regra só valeria no instante em que a página carrega."""
    texto = _ler(SCRIPT)
    assert "async function ressincronizarStatusInterno(" in texto, (
        "sumiu a releitura do status_interno; o pedido que foi para a expedicao "
        "ficaria na tela ate alguem recarregar a pagina"
    )
    corpo = _corpo(texto, "async function ressincronizarStatusInterno(")
    assert "'propostas'" in corpo and "'id_int, status_interno'" in corpo, (
        "a releitura deixou de buscar o status_interno na tabela propostas"
    )
    assert "view-lista-impressao" in corpo and "view-acabamento" in corpo, (
        "a releitura parou de se limitar aos dois paineis; ela nao pode rodar "
        "com nenhum deles na tela"
    )
    assert "if (!mudou) return;" in corpo, (
        "a releitura voltou a redesenhar a tela mesmo quando nada mudou"
    )
    assert re.search(r"setInterval\(ressincronizarStatusInterno, \d+\)", texto), (
        "a releitura existe mas ninguem a chama"
    )
