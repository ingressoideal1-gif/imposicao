# -*- coding: utf-8 -*-
"""O botão "← Voltar sem salvar" do editor de numeração.

Pedido do usuário em 25/08/2026: *"ao editar a numeração de um modelo, precisa
ter o botão Voltar para poder sair sem salvar"*.

## Por que ele é mais do que conveniência

Quem abre a numeração de um modelo (pelo ✏️ no card do pedido) cai no
`#view-numeracao` com `window.customNumeracaoEditState` armado. Esse estado diz
*"a numeração que for salva agora pertence ao modelo X do pedido Y"*.

Até aqui, o único caminho de volta era o menu lateral — que sai da tela e deixa
esse vínculo pendurado. Com ele vivo, a **próxima** numeração salva (qualquer
uma, inclusive uma do catálogo geral aberta pelo menu) nascia marcada como
exclusiva daquele modelo — `is_custom`, `os_item_id`, `Cli_Num` — e ainda era
amarrada a ele por `saveAmostraToDB`. Era mais um caminho para a numeração
fantasma investigada no mesmo dia, e nada na tela denunciava.

Por isso o botão não só navega: ele passa pelo `cancelNumEdit()`, que agora
apaga o vínculo junto com o formulário.

## A ordem que não pode inverter

`cancelNumEdit()` apagar o vínculo cria uma armadilha no caminho de SALVAR: ele
é chamado lá também, e o código que amarra a numeração ao modelo roda **depois**.
Se ele lesse `window.customNumeracaoEditState` nesse ponto, encontraria `null` e
o modelo ficaria sem numeração nova, calado. Por isso o `saveNumeracao` guarda o
estado numa variável **antes** de limpar.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")
INDEX = os.path.join(RAIZ, "frontend", "index.html")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def _funcao(fonte, nome):
    """O corpo de uma `function nome(...)`, sem as linhas de comentário."""
    i = fonte.index("\nfunction " + nome + "(")
    corpo = fonte[i:fonte.index("\n}", i) + 2]
    return "\n".join(
        l for l in corpo.splitlines() if not l.strip().startswith("//")
    )


def test_o_botao_existe_e_nasce_escondido():
    """No catálogo a saída é o menu; o botão é só para quem veio de um pedido."""
    html = _ler(INDEX)
    i = html.index('id="btn-num-voltar"')
    trecho = html[i - 200:i + 220]

    assert "display:none" in trecho, "nasce escondido"
    assert "voltarDaNumeracaoDoModelo()" in trecho, "chama a saída"


def test_o_rotulo_avisa_que_nao_salva():
    """Não há confirmação: a palavra no botão é o aviso."""
    html = _ler(INDEX)
    i = html.index('id="btn-num-voltar"')
    rotulo = html[i:html.index("</button>", i)]

    assert "sem salvar" in rotulo.lower(), (
        "o rótulo precisa dizer que nada é gravado — é o único aviso que existe"
    )


def test_sair_apaga_o_vinculo_com_o_modelo():
    """O vínculo pendurado é o que fazia a próxima numeração nascer do modelo errado."""
    fonte = _ler(SCRIPT)

    cancelar = _funcao(fonte, "cancelNumEdit")
    assert "window.customNumeracaoEditState = null" in cancelar, (
        "quem limpa o editor tem de limpar o vínculo junto"
    )
    assert "btn-num-voltar" in cancelar, "e esconder o botão"

    voltar = _funcao(fonte, "voltarDaNumeracaoDoModelo")
    assert "cancelNumEdit()" in voltar, (
        "o Voltar usa a limpeza que já existe, em vez de repeti-la"
    )


def test_o_salvar_guarda_o_vinculo_antes_de_limpar():
    """A armadilha da ordem: limpar antes de ler deixaria o modelo sem numeração."""
    fonte = _ler(SCRIPT)

    captura = fonte.index("const customState = window.customNumeracaoEditState;")
    limpeza = fonte.index("cancelNumEdit();", captura)
    uso = fonte.index("if (customState) {", captura)

    assert captura < limpeza < uso, (
        "o `saveNumeracao` precisa guardar o vínculo ANTES do `cancelNumEdit()`, "
        "que agora o apaga — e usá-lo depois"
    )


def test_os_dois_caminhos_de_entrada_acendem_o_botao():
    """São duas portas para o mesmo editor: o card do pedido e o clone da imposição."""
    fonte = _ler(SCRIPT)
    assert fonte.count("mostrarVoltarDaNumeracaoDoModelo();") == 2, (
        "as duas portas precisam acender o botão"
    )


def test_o_botao_e_aceso_depois_do_editNumeracao():
    """`editNumeracao` passa pelo `cancelNumEdit`, que esconde o botão de novo."""
    fonte = _ler(SCRIPT)
    for inicio in ("function editCustomNumeracao(", "Clonando base"):
        i = fonte.index(inicio)
        trecho = fonte[i:i + 2600] if inicio.startswith("function") else fonte[i - 900:i]
        carrega = trecho.rfind("editNumeracao(")
        acende = trecho.rfind("mostrarVoltarDaNumeracaoDoModelo()")
        assert carrega >= 0 and acende >= 0, inicio
        assert carrega < acende, (
            inicio + ": acender antes do editNumeracao não adianta — ele esconde de novo"
        )


def test_o_destino_depende_de_onde_se_veio():
    """Voltar para a tela errada é quase tão ruim quanto não voltar."""
    fonte = _ler(SCRIPT)
    voltar = _funcao(fonte, "voltarDaNumeracaoDoModelo")

    assert re.search(r"view === 'imposicao'", voltar), "o caminho da imposição"
    assert "showView('view-imposicao')" in voltar
    assert "showView('view-amostras')" in voltar, "e o do pedido"
    assert "renderAmostrasOSItens" in voltar, (
        "redesenhando o pedido, senão o card volta com o estado antigo na tela"
    )
    assert "showView('view-catalogo')" in voltar, (
        "sem estado nenhum (recarregou a página no meio), o catálogo é o destino "
        "honesto — é de lá que esta tela nasce"
    )
