# -*- coding: utf-8 -*-
"""`EM ACABAMENTO` é trabalho da gráfica: o pedido aparece nos dois painéis.

## O caso, 03/09/2026

O usuário perguntou: **"o que aconteceu com o pedido 21594? sumiu dos painéis"**.

A auditoria do banco contou a história: às 10:05 a bancada marcou os quatro
modelos como Pronto e mandou o pedido para a expedição (`EXPEDICAO`); às 15:53
a expedição, na tela do ERP, usou a ação **Retorno** e devolveu o pedido para a
bancada — `status_interno` virou `EM ACABAMENTO`, tipo de transição `RETORNO`,
origem `EXPEDICAO_UI`. Era a sexta vez que o ERP fazia isso desde 25/08.

Não foi defeito nosso: os filtros das duas telas sempre aceitaram só
`EM PRODUCAO` e `EM IMPRESSAO`. `EM ACABAMENTO` estava apenas na porta de
entrada (`SINAIS_SAIU_DA_ARTE`), então o pedido entrava em `state.ordens` e
nenhuma lista o desenhava. Ficava visível só na Lista de Arte, em Concluídos.

Decisão do usuário: **"tratar"** — `EM ACABAMENTO` é chão de fábrica.

## O que estes testes travam

1. A regra mora UMA vez, em `SINAIS_NA_GRAFICA`/`pedidoNaGrafica` no
   `script.js`, ao lado da regra irmã de 27/08 (`SINAIS_DEPOIS_DA_GRAFICA`).
   Quatro cópias da lista foram exatamente o que deixou o harness dizendo
   "EM ACABAMENTO é trabalho daqui" enquanto as telas diziam o contrário.
2. A Fila de Produção e o Painel do Acabamento consultam essa regra, e não
   comparam mais a palavra à mão.
3. Os modelos ficam como a bancada os deixou: o retorno não apaga o Pronto de
   ninguém. O que muda é a marca "voltou da expedição" na linha, para o
   operador entender por que um pedido PRONTO reapareceu na lista.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")
ACABAMENTO = os.path.join(RAIZ, "frontend", "acabamento.js")
HARNESS = os.path.join(RAIZ, "tests", "na_grafica_harness.js")
HARNESS_ACABAMENTO = os.path.join(RAIZ, "tests", "acabamento_harness.js")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def _trecho(texto, inicio, fim):
    i = texto.index(inicio)
    return texto[i:texto.index(fim, i) + len(fim)]


def _lista(texto, nome):
    return _trecho(texto, f"const {nome} = [", "];")


def test_a_regra_executa_e_a_fila_de_producao_lista_o_devolvido():
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_em_acabamento_esta_na_lista_da_grafica():
    lista = _lista(_ler(SCRIPT), "SINAIS_NA_GRAFICA")
    for status in ("EM PRODUCAO", "EM PRODUÇÃO", "EM IMPRESSAO", "EM IMPRESSÃO", "EM ACABAMENTO"):
        assert f"'{status}'" in lista, (
            f"{status} saiu de SINAIS_NA_GRAFICA — o pedido sumiria dos dois paineis"
        )


def test_a_lista_da_grafica_nao_engole_o_que_vem_antes_nem_depois():
    lista = _lista(_ler(SCRIPT), "SINAIS_NA_GRAFICA")
    for status in ("EXPEDICAO", "EM TRANSITO", "ENTREGUE", "A RETIRAR", "RETIRADO",
                   "REVISAO PRODUCAO", "LIBERADO", "APROVADO", "NOVO", "AGUARDANDO", "CANCELADO"):
        assert f"'{status}'" not in lista, (
            f"{status} entrou em SINAIS_NA_GRAFICA: ou e estagio comercial, ou ja "
            "passou da grafica (regra de 27/08/2026)"
        )


def test_a_regra_le_status_interno_e_nao_status_pedido():
    texto = _ler(SCRIPT)
    corpo = _trecho(texto, "\nfunction pedidoNaGrafica(", "\n}")
    assert "status_interno" in corpo
    assert "status_pedido" not in corpo, "status_pedido e campo morto no ERP"
    assert "window.pedidoNaGrafica = pedidoNaGrafica;" in texto, (
        "o acabamento.js consulta a regra pelo window; sem a exposicao ela some de la"
    )


def test_a_fila_de_producao_consulta_a_regra_e_nao_compara_a_palavra():
    corpo = _trecho(_ler(SCRIPT), "let ordensImpressao = state.ordens.filter(", "\n    });")
    assert "pedidoNaGrafica(os)" in corpo, "a Fila de Producao parou de consultar a regra"
    assert "pedidoJaPassouDaGrafica(os)" in corpo, "a regra de 27/08 continua dita ali"
    assert "'EM PRODUCAO'" not in corpo, (
        "a Fila voltou a comparar a palavra a mao — e a copia que deixou o 21594 invisivel"
    )


def test_o_detalhe_do_pedido_abre_no_card_da_impressao_para_o_devolvido():
    """`toggleOSDetail` e `renderOSItens` escolhem entre o card da arte e o da
    impressao pela mesma pergunta. Se ficassem com a lista antiga, o pedido
    devolvido apareceria na Fila e abriria no card errado."""
    texto = _ler(SCRIPT)
    for marca in ("async function toggleOSDetail(", "function renderOSItens("):
        corpo = _trecho(texto, marca, "\n}")
        assert "pedidoNaGrafica(os)" in corpo, f"{marca} parou de consultar a regra"
        assert "'EM PRODUCAO'" not in corpo, f"{marca} voltou a comparar a palavra a mao"


def test_o_acabamento_consulta_a_regra_do_script_js():
    texto = _ler(ACABAMENTO)
    corpo = _trecho(texto, "function ehDeProducao(", "\n    }")
    assert "fn('pedidoNaGrafica')" in corpo, (
        "o ehDeProducao parou de consultar a regra do script.js pelo window"
    )
    assert "'EM PRODUCAO'" not in corpo and "'EM IMPRESSAO'" not in corpo, (
        "o acabamento.js voltou a ter a lista propria; ela mora no script.js"
    )
    assert "SINAIS_NA_GRAFICA = [" not in texto, (
        "o acabamento.js ganhou uma copia da lista; duas copias divergem no "
        "primeiro status novo do parceiro"
    )


def test_a_linha_do_devolvido_diz_que_voltou_da_expedicao():
    """O que o sistema faz sozinho precisa se anunciar: um pedido PRONTO que
    reaparece na lista sem explicacao e um operador procurando o que houve."""
    texto = _ler(ACABAMENTO)
    assert "VOLTOU DA EXPEDIÇÃO" in texto, "sumiu a marca do pedido devolvido"
    assert "function ehDeVoltaDaExpedicao(" in texto


def test_o_harness_do_acabamento_cobre_o_devolvido():
    harness = _ler(HARNESS_ACABAMENTO)
    assert "pedidoNaGraficaReal" in harness, (
        "o harness do acabamento parou de importar a regra do script.js"
    )
    assert "oPedidoDevolvidoPelaExpedicaoVoltaParaABancada" in harness, (
        "sumiu do harness o teste do pedido devolvido pela expedicao"
    )
