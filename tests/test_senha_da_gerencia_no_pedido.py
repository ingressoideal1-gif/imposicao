# -*- coding: utf-8 -*-
"""Os campos da linha do modelo so' mudam com a senha da gerencia (29/08/2026).

Pedido do usuario: *"os inputs, drops, cores, etc... da linha do modelo so podem
ser alteradas mediante apresentacao da senha da gerencia, mesma senha apresentada
na divergencia de peso no painel do acabamento"* -- e, logo depois: *"o status da
impressao continua livre"*.

Qtd, N. inicial, Bloco, Cor, Numeracao e Verso decidem o que sai no papel e o que
o cliente contratou. A tela do Pedido fica aberta no chao de fabrica, e ate esta
data qualquer um que passasse podia mudar a quantidade de uma tiragem com um
clique.

O comportamento na tela e medido pelo `fila_do_pedido_harness.js`, num Chrome de
verdade. O que este arquivo cobre e o que um teste de tela nao alcanca: que a
senha nunca seja conferida no navegador, e que a trava nao se abra sozinha
quando algo der errado.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _liberar():
    """O corpo da `liberarCamposDoModelo`."""
    pedido = _ler("frontend/pedido.js")
    i = pedido.index("async function liberarCamposDoModelo()")
    return pedido[i:pedido.index("\nwindow.liberarCamposDoModelo", i)]


def test_a_senha_e_a_mesma_do_acabamento_e_e_conferida_no_servidor():
    """Uma senha so' no produto, conferida num lugar so'.

    Ela nasceu no Painel do Acabamento, para liberar peso fora dos 5 %. A tela do
    Pedido pergunta a MESMA, pelo MESMO caminho: o servidor. Duas conferencias
    seriam duas politicas, e a que ficasse para tras viraria a porta destrancada.
    """
    acabamento = _ler("frontend/acabamento.js")
    assert "window.conferirSenhaDeLiberacao = conferirSenhaDeLiberacao" in acabamento, (
        "o acabamento parou de exportar a conferencia da senha -- a tela do "
        "Pedido ficaria sem quem perguntar"
    )

    corpo = _liberar()
    assert "window.conferirSenhaDeLiberacao(senha)" in corpo, (
        "a tela do Pedido parou de usar a conferencia compartilhada"
    )


def test_a_senha_nunca_e_comparada_no_navegador():
    """A trave desta funcionalidade.

    Qualquer comparacao no frontend seria a senha VIAJANDO ate o navegador --
    e quem tem a tela aberta a leria no depurador. Quem confere e o servidor.
    """
    corpo = _liberar()
    for suspeito in ("senha ===", "senha ==", "=== senha", "== senha", "senha.toUpperCase() ==="):
        assert suspeito not in corpo, (
            "a senha esta sendo comparada no navegador: " + suspeito
        )


def test_a_trava_nao_se_abre_sozinha_quando_algo_falha():
    """Senha errada, rede fora ou conferidor ausente: NADA e liberado.

    Uma trava que se abre quando a conferencia falha nao e trava. E a mesma
    postura do popup do Acabamento -- nada passa antes do sim do servidor.
    """
    corpo = _liberar()

    i_ok = corpo.index("state.modeloLiberado = caixa.dataset.item")
    i_confere = corpo.index("const confere = await window.conferirSenhaDeLiberacao")
    assert i_confere < i_ok, "a liberacao acontece antes de o servidor responder"

    assert "if (!confere)" in corpo and "return;" in corpo, (
        "senha recusada deixou de barrar a liberacao"
    )
    assert "typeof window.conferirSenhaDeLiberacao !== 'function'" in corpo, (
        "sem quem conferir, a tela precisa recusar -- e nao liberar por falta de porteiro"
    )
    # O `catch` nao pode liberar: o unico ponto que escreve em modeloLiberado
    # esta no caminho do sucesso.
    assert corpo.count("state.modeloLiberado =") == 1, (
        "ha mais de um ponto liberando os campos: um deles vai acabar liberando "
        "por engano"
    )


def test_o_status_da_impressao_continua_livre():
    """Decisao do usuario, e ela tem razao de producao.

    Marcar o que ja saiu e o trabalho normal do operador; pedir senha para isso
    pararia a producao. A caixinha de marcar para a folha combinada tambem fica
    de fora: ela escolhe o que imprimir, nao altera o modelo.
    """
    pedido = _ler("frontend/pedido.js")
    corpo = pedido[pedido.index("function renderPedOSQueue()"):]
    corpo = corpo[:corpo.index("\nfunction updatePedImprimirButtonsVisibility")]

    i_status = corpo.index("'status_impressao', this.value)")
    # a mesma celula, ate o fim do <select>
    celula = corpo[i_status:corpo.index("</select>", i_status)]
    assert "travaCampo" not in celula and "travaSelect" not in celula and "porteiro" not in celula, (
        "o Status da impressao entrou na trava -- marcar o que ja saiu e o "
        "trabalho normal do operador"
    )

    i_check = corpo.index('type="checkbox"')
    caixinha = corpo[i_check:i_check + 400]
    assert "travaDaGerencia" not in caixinha, (
        "a caixinha de marcar entrou na trava: ela escolhe o que imprimir, nao "
        "altera o modelo"
    )


def test_a_liberacao_nao_sobrevive_a_um_f5_nem_a_troca_de_modelo():
    """O alcance que o usuario definiu: o modelo, ate a janela dele fechar."""
    script = _ler("frontend/script.js")
    assert "if (!state.modeloLiberado) state.modeloLiberado = null;" in script, (
        "a liberacao deixou de nascer fechada a cada carga da pagina"
    )

    pedido = _ler("frontend/pedido.js")
    fechar = pedido[pedido.index("function fecharJanelaDoModelo()"):]
    fechar = fechar[:fechar.index("\nwindow.fecharJanelaDoModelo")]
    assert "state.modeloLiberado = null" in fechar, (
        "fechar a janela parou de trancar os campos de novo"
    )

    enviar = pedido[pedido.index("async function enviarParaPedido("):]
    enviar = enviar[:enviar.index("setTimeout(")]
    assert "if (trocouDeModelo) state.modeloLiberado = null;" in enviar, (
        "abrir outro modelo parou de trancar o anterior"
    )
