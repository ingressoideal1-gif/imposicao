# -*- coding: utf-8 -*-
"""O Gerenciamento de Cores se esconde, mas o ESTADO dele nunca.

O perfil ICC e do EQUIPAMENTO -- escolhido uma vez, vale para todo pedido que va
para aquela impressora. O operador que imprime dezenas de trabalhos por dia nao
mexe nele nenhuma vez, e os controles ocupavam metade do painel do driver:
seletor de perfil, intento de renderizacao, tres deslizadores, editor de curvas
e duas previas.

O pedido original (28/08/2026) foi "adicionar botao para esconder o
gerenciamento de cores, so mostrar quando solicitado", e a primeira versao
resolveu com um botao "Mostrar" DENTRO da caixa. No mesmo dia a janela de
visualizacao foi reorganizada em quatro grupos que abrem e fecham, e o
Gerenciamento de Cores virou um deles -- entao o botao interno saiu: eram dois
interruptores para a mesma coisa.

A TRAVE E A MESMA DAS DUAS VEZES, e e por ela que este arquivo existe:
esconder os CONTROLES e economia de tela; esconder o ESTADO seria outra coisa.
O operador imprimiria com um perfil ICC ligado sem nada na tela dizendo que ha
um perfil ligado, e so descobriria olhando o papel. Com o grupo fechado, quem
diz isso e o selo no proprio botao do grupo.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _bloco(fonte, abertura):
    """O elemento inteiro que comeca em `abertura`, contando <div> aninhados."""
    i = fonte.index(abertura)
    profundidade, j = 0, i
    while True:
        abre = fonte.find("<div", j)
        fecha = fonte.find("</div>", j)
        assert fecha >= 0, "o bloco nao fecha: " + abertura
        if 0 <= abre < fecha:
            profundidade += 1
            j = abre + 4
        else:
            profundidade -= 1
            j = fecha + 6
            if profundidade == 0:
                return fonte[i:j]


def test_o_gerenciamento_de_cores_e_um_grupo_que_abre_e_fecha():
    grupo = _bloco(_ler("frontend/index.html"), '<div class="jg" id="jg-cores">')

    assert "alternarGrupoDaJanela('jg-cores')" in grupo, (
        "o grupo nao abre nem fecha mais -- os controles de cor voltariam a "
        "ocupar a tela o tempo todo"
    )
    assert 'id="jg-cores-corpo"' in grupo, "o corpo do grupo sumiu"
    corpo = grupo[grupo.index('id="jg-cores-corpo"'):]
    assert "display:none" in corpo[:200], (
        "o grupo nao nasce mais fechado -- o usuario pediu que estes controles "
        "so aparecessem quando solicitados"
    )
    assert 'id="ped-print-cor-perfil"' in grupo and 'id="ped-cor-curva-canvas"' in grupo, (
        "os controles de cor nao estao dentro do grupo"
    )


def test_o_botao_mostrar_de_dentro_da_caixa_nao_voltou():
    """Dois interruptores para a mesma coisa e o que a mudanca desfez."""
    html = _ler("frontend/index.html")
    assert 'id="ped-print-cor-btn"' not in html, (
        "voltou o botao Mostrar dentro da caixa de cores: com o grupo ja "
        "abrindo e fechando, sao dois interruptores para a mesma coisa"
    )
    script = _ler("frontend/script.js")
    assert "function alternarGerenciamentoDeCores(" not in script, (
        "a funcao do botao interno voltou ao script.js sem ninguem chamar"
    )


def test_o_que_diz_o_que_sai_no_papel_nao_se_esconde():
    """A trave desta mudanca.

    Com o grupo FECHADO, o operador ainda precisa ver que ha conversao de cor
    ligada. Quem diz isso e o selo no botao do grupo -- que fica FORA do corpo
    que colapsa -- escrito pelo `atualizarStatusCor`.
    """
    grupo = _bloco(_ler("frontend/index.html"), '<div class="jg" id="jg-cores">')

    i_selo = grupo.index('id="ped-cor-selo-ativo"')
    i_corpo = grupo.index('id="jg-cores-corpo"')
    assert i_selo < i_corpo, (
        "o selo de estado entrou no corpo que colapsa: com o grupo fechado o "
        "operador nao veria que o gerenciamento de cores esta ligado"
    )

    script = _ler("frontend/script.js")
    corpo_fn = script[script.index("function atualizarStatusCor()"):]
    corpo_fn = corpo_fn[:corpo_fn.index("\nasync function salvarCorImpressora")]
    assert "ped-cor-selo-ativo" in corpo_fn, (
        "o selo parou de ser escrito pela funcao que conhece o estado da cor"
    )
    assert "selo.title = st.textContent" in corpo_fn, (
        "o selo perdeu a frase inteira: quem passa o mouse tem de ler o mesmo "
        "que leria abrindo o grupo"
    )


def test_a_caixa_de_ativo_continua_fora_do_bloco_de_controles():
    """`Ativo` e a linha de status ficam fora do `#ped-print-cor-corpo`.

    Isto ja valia antes e continua valendo: dentro do grupo aberto, o operador
    ve o estado sem precisar rolar os controles todos.
    """
    caixa = _bloco(_ler("frontend/index.html"), '<div id="ped-print-cor-box"')

    i_corpo = caixa.index('id="ped-print-cor-corpo"')
    i_fecha = caixa.index("/ped-print-cor-corpo")

    assert caixa.index('id="ped-print-cor-ativo"') < i_corpo, (
        'a caixa "Ativo" entrou no bloco de controles'
    )
    assert caixa.index('id="ped-print-cor-status"') > i_fecha, (
        "a linha de status entrou no bloco de controles: e ela que diz, em uma "
        "frase, o que vai sair no papel"
    )
