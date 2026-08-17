# -*- coding: utf-8 -*-
"""Ajuste fino de X e Y na box "Adicionar Pdf e Svg".

## De onde veio

Pedido do usuario em 17/08/2026: mover o elemento PDF por coordenada, para
ajuste fino de posicionamento. Os campos X e Y ja existiam — no CARTAO do
elemento, na lista —, mas numa numeracao cheia o cartao fica no fim de uma lista
de dezenas, e o operador esta com o arquivo na mao na box. Entao os campos
passaram a existir tambem ali, com passo de 0,1 mm em vez de 0,5.

## O que estes testes prendem

O mesmo X e o mesmo Y agora aparecem em DUAS janelas. Dois campos para o mesmo
dado e a receita de um deles mentir: o perigo aqui nao e o campo sumir, e um
ficar parado enquanto o outro anda. Por isso o que se cobra e o SINCRONISMO —
que o arrasto e a digitacao passem os dois pela mesma funcao.

Conferido no navegador em 17/08/2026, com o app em pe e Puppeteer:

    campos presentes, passo 0,1, valor inicial 20,0 / 10,0 vindo do modelo
    digitar 12,34 -> modelo 12,3, campo da box 12,3, campo do cartao 12,3
    digitar  7,06 -> modelo  7,1, campo do cartao 7,1
    nenhum erro de pagina, e a regra de CSS chegou inteira ao CSSOM
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _box_arquivos():
    """So o corpo do `renderBoxArquivos` — o resto do script.js nao interessa."""
    texto = _ler("frontend/script.js")
    i = texto.index("window.renderBoxArquivos =")
    return texto[i:texto.index("\n};", i)]


def test_a_box_tem_os_campos_de_posicao():
    corpo = _box_arquivos()
    assert "arq-x" in corpo and "arq-y" in corpo
    assert "moverElemento(" in corpo


def test_o_passo_e_de_um_decimo_de_milimetro():
    """O pedido era ajuste FINO. Com o passo de 0,5 do cartao, as setas do
    teclado pulam justamente a casa que se quer acertar."""
    corpo = _box_arquivos()
    for campo in ("arq-x", "arq-y"):
        trecho = corpo[corpo.index(campo):corpo.index(campo) + 400]
        assert 'step="0.1"' in trecho, campo


def test_o_cartao_do_elemento_tambem_anda_de_um_decimo():
    """As duas janelas com o mesmo passo. Um campo de 0,5 e outro de 0,1 para a
    MESMA coordenada dariam resultados diferentes para a mesma seta do teclado."""
    texto = _ler("frontend/script.js")
    campos = re.findall(r'class="form-control el-[xy]"[^>]*', texto)
    assert len(campos) == 3, f"esperava 3 campos de posicao no cartao, achei {len(campos)}"
    for campo in campos:
        assert 'step="0.1"' in campo, campo
        assert "moverElemento(" in campo, (
            "o campo do cartao ficou fora do arredondamento: digitar 12,34 "
            "guardaria 12,34 e o campo exibiria 12,3 na reabertura"
        )


def test_os_campos_nao_selecionam_o_elemento_ao_serem_clicados():
    """A linha inteira e clicavel — ela seleciona o elemento no canvas. Sem parar
    a propagacao, clicar dentro do campo para posicionar o cursor dispararia a
    selecao e o clique se perderia."""
    corpo = _box_arquivos()
    assert "num-arquivo-pos" in corpo
    trecho = corpo[corpo.index("num-arquivo-pos"):]
    assert "event.stopPropagation()" in trecho[:400]


def test_o_valor_mostrado_vem_do_modelo():
    """Campo com valor fixo no HTML e campo que mente na primeira reabertura."""
    corpo = _box_arquivos()
    assert "el.x_mm" in corpo and "el.y_mm" in corpo


def test_arrastar_no_canvas_atualiza_as_DUAS_janelas():
    """O sincronismo e o ponto. Antes daqui o fim do arrasto escrevia direto nos
    inputs do cartao; agora chama a funcao que escreve nos dois — se um dia
    voltar a escrever direto, a box fica parada mostrando a posicao velha."""
    texto = _ler("frontend/script.js")
    assert texto.count("sincronizarCamposDePosicao(el);") >= 2

    corpo_sync = texto[texto.index("function sincronizarCamposDePosicao"):]
    corpo_sync = corpo_sync[:corpo_sync.index("\n}")]
    assert ".el-x" in corpo_sync and ".el-y" in corpo_sync, "esqueceu o cartao"
    assert ".arq-x" in corpo_sync and ".arq-y" in corpo_sync, "esqueceu a box"


def test_digitar_na_box_tambem_atualiza_o_cartao():
    texto = _ler("frontend/script.js")
    corpo = texto[texto.index("window.moverElemento ="):]
    corpo = corpo[:corpo.index("\n};")]
    assert "sincronizarCamposDePosicao(el)" in corpo
    assert "drawCanvas()" in corpo, "o canvas tem de mostrar o elemento no lugar novo"
    assert "saveNumHistory()" in corpo, "sem historico, o Ctrl+Z nao desfaz o ajuste"


def test_o_valor_e_arredondado_como_no_arrasto():
    """Uma casa decimal nos dois caminhos. Guardar 12,3456 faria o campo exibir
    12,3 e o papel usar outro numero — o tipo de divergencia que este projeto
    passou o dia inteiro consertando."""
    texto = _ler("frontend/script.js")
    corpo = texto[texto.index("window.moverElemento ="):]
    corpo = corpo[:corpo.index("\n};")]
    assert re.search(r"Math\.round\(\s*v\s*\*\s*10\s*\)\s*/\s*10", corpo)


def test_o_css_da_linha_de_posicao_existe():
    css = _ler("frontend/style.css")
    assert ".num-arquivo-pos" in css
    # Sem isto a segunda linha nao desce: o item e flex de uma linha so.
    bloco = css[css.index(".num-arquivo-item {"):]
    assert "flex-wrap: wrap;" in bloco[:bloco.index("}")]
