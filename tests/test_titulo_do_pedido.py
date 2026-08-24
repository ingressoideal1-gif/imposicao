# -*- coding: utf-8 -*-
"""O titulo da tela de Pedido, em duas linhas (23/08/2026).

Pedido do usuario: *"no Painel de Arte, na edicao do Pedido, deixar o titulo
'numero + Evento' 20% menor e a segunda linha 'Cliente + Numero' 30% menor"*.

E a mesma forma que o cabecalho do Painel do Acabamento ganhou na manha do mesmo
dia — numero e evento em cima, cliente em amarelo embaixo. O que muda sao os
tamanhos, que ele deu aqui um a um.

## As duas coisas que este arquivo protege

1. **Os dois tamanhos saem da MESMA referencia.** "20% menor" e "30% menor" nao
   se empilham: se a segunda linha fosse 30% menor que a PRIMEIRA, ela sairia
   com 56% do titulo em vez de 70%. Por isso as duas sao medidas em `em` a
   partir do `TAMANHO_DO_TITULO_DO_PEDIDO`, e o harness em Chrome confere a
   proporcao no pixel.

2. **Um titulo so, para os dois caminhos.** Dois lugares chegam a este cabecalho
   — abrir um modelo pela tela de Pedido (`pedido.js`) e voltar a ela pelo
   historico do painel (`script.js`). Antes, cada um escrevia o titulo por conta
   propria; bastava mexer num para o titulo passar a depender de por onde a
   pessoa entrou.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_titulo_do_pedido_passa():
    """Desenhado num Chrome, com as pecas reais.

    O `<h1>` do cabecalho pinta o texto com o degrade de `.page-header-text h1`,
    por `-webkit-background-clip: text` e `-webkit-text-fill-color: transparent`.
    Esse transparente e herdado, e o degrade se recorta tambem no texto dos
    filhos — uma segunda linha so com `color: #fbbf24` sairia CINZA. O harness
    mede a cor no pixel e desenha ao lado o controle que prova a armadilha.
    """
    harness = os.path.join(RAIZ, "tests", "titulo_do_pedido_harness.js")
    assert os.path.exists(harness), "o harness do titulo do pedido sumiu"

    r = subprocess.run(
        ["node", harness], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_os_dois_caminhos_usam_a_mesma_funcao():
    """Nem `script.js` nem `pedido.js` escrevem o titulo por conta propria."""
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    assert "function pintarTituloDaTelaDePedido(" in script, (
        "a funcao do titulo sumiu do script.js"
    )
    assert "window.pintarTituloDaTelaDePedido" in script, (
        "sem exportar, o pedido.js nao a alcanca"
    )
    assert "pintarTituloDaTelaDePedido(pedViewTitle" in pedido, (
        "o pedido.js voltou a montar o titulo sozinho"
    )

    # Ninguem mais pode escrever direto no elemento: seria o titulo de novo
    # dependendo de por onde a pessoa entrou.
    for nome, fonte in (("script.js", script), ("pedido.js", pedido)):
        culpadas = [
            linha for linha in fonte.splitlines()
            if "pedViewTitle.textContent" in linha or "pedViewTitle.innerHTML" in linha
        ]
        assert not culpadas, nome + " escreve no titulo por fora: " + str(culpadas)


def test_os_dois_tamanhos_saem_da_mesma_referencia():
    """20% e 30% MENORES QUE O MESMO numero, e nao um em cima do outro."""
    script = _ler("frontend/script.js")
    assert "const TAMANHO_DO_TITULO_DO_PEDIDO = 'calc(2.2rem + 5pt)';" in script, (
        "o tamanho de referencia mudou de forma"
    )
    assert "font-size: 0.8em;" in script, "a primeira linha nao esta 20% menor"
    assert "font-size: 0.7em;" in script, "a segunda linha nao esta 30% menor"


def test_a_linha_do_cliente_devolve_o_proprio_text_fill():
    """Sem isso o amarelo e ignorado e a linha sai cinza, como a de cima."""
    script = _ler("frontend/script.js")
    i = script.index("const ESTILO_CLIENTE_DO_PEDIDO =")
    trecho = script[i:i + 400]
    assert "-webkit-text-fill-color: #fbbf24" in trecho, (
        "a linha do cliente precisa devolver o seu proprio text-fill"
    )
    assert "color: #fbbf24" in trecho, "e o color, para quem nao for WebKit"


def test_o_cliente_vem_do_rotulo_que_o_resto_do_painel_usa():
    """"NOME - NUMERO" e como o painel inteiro escreve o cliente.

    Montar o numero a parte aqui faria a mesma pessoa aparecer de dois jeitos em
    duas telas — foi a razao de o Acabamento usar o mesmo rotulo.
    """
    script = _ler("frontend/script.js")
    i = script.index("function pintarTituloDaTelaDePedido(")
    corpo = script[i:script.index("\n}", i)]
    assert "rotuloDoCliente(os)" in corpo, "o cliente tem de vir do rotuloDoCliente"
    assert "numero_cliente" not in corpo, (
        "o numero do cliente ja vem no rotulo; montar de novo aqui e que gera divergencia"
    )
