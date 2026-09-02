# -*- coding: utf-8 -*-
"""O status "Corrigir Arte": a produção devolve um modelo ao designer.

## O pedido, feito pelo usuário em 02/09/2026

> "No painel da produção, na edição do modelo, vamos adicionar o status
> 'Corrigir Arte'. Ao selecionar esse status para um modelo, o pedido deve
> listar no painel de arte, card Em Arte, para ser editado pelo designer."

E, logo em seguida:

> "Quando o designer marcar pronto e voltar o pedido para o atendimento, o
> pedido deve retornar para o status original, E liberar a impressão no painel
> da produção."

## O buraco que ele fecha

Um pedido que já saiu para a produção conta **só** no card "Pedidos Concluídos"
da Lista de Arte — é a regra do `pedidoSaiuDaArte`, e ela está certa para o caso
normal: o designer não deve ter na frente dele pedido que já é trabalho da
impressora. O efeito colateral era que, quando a produção descobria um erro de
arte, não havia o que apertar. O recado ia por fora do sistema, de boca, e o
designer não tinha como saber que havia trabalho novo naquele pedido.

## As quatro decisões do usuário

Perguntadas e respondidas no mesmo dia, antes de escrever qualquer linha:

1. **O que libera a impressão de volta**: o 🎨 MARCAR PRONTO *daquele modelo*.
   Cada modelo se resolve sozinho, sem esperar o pedido inteiro.
2. **O que a marca trava**: só aquele modelo. Um pedido de credenciais com dez
   modelos não para inteiro porque um tem a arte errada.
3. **Para onde o modelo volta**: para **Aguardando**, e não para o que era
   antes. Se estava Impresso, o que saiu era da arte velha e não serve — por
   isso não guardamos o status anterior em lugar nenhum.
4. **Em que card o pedido aparece**: só em "Em Arte". A conta dos cards não pode
   contar o mesmo pedido duas vezes.

## Onde a regra mora

Em `STATUS_CORRIGIR_ARTE`, `modeloEmCorrecaoDeArte` e `modelosEmCorrecaoDeArte`,
no `script.js`, uma vez só — o `pedido.js` os consulta pelo `window`, como já faz
com o resto. Duas definições de "este modelo está em correção?" divergiriam no
primeiro dia em que uma delas mudasse, e o sintoma seria a tela liberando o botão
que a trava recusa.

O valor mora em `pedidos_modelos.status_impressao`, a mesma coluna dos outros
dois status, porque é o mesmo seletor: um modelo está numa situação de cada vez.
Nenhuma coluna nova foi criada — a decisão 3 é justamente o que dispensa guardar
o status anterior.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "corrigir_arte_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_de_corrigir_arte_passa():
    assert os.path.exists(HARNESS), "o harness de Corrigir Arte sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_regra_mora_uma_vez_so():
    """`pedido.js` consulta, nao redefine.

    Se alguem copiar a leitura do status para o pedido.js, as duas copias
    divergem no primeiro ajuste -- e o sintoma seria a tela liberando o botao
    que a trava recusa, ou o contrario.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    assert "function modeloEmCorrecaoDeArte(" in script
    assert "function modelosEmCorrecaoDeArte(" in script
    assert "function modeloEmCorrecaoDeArte(" not in pedido, (
        "o pedido.js redefiniu a leitura do status em vez de consultar o script.js"
    )
    assert "function modelosEmCorrecaoDeArte(" not in pedido, (
        "o pedido.js redefiniu a lista de modelos em correcao"
    )


def test_nao_nasceu_coluna_nova_no_banco():
    """A decisao 3 dispensa guardar o status anterior.

    Se um dia aparecer um `status_impressao_anterior`, e' sinal de que a regra
    virou "volta ao que era" -- o oposto do que o usuario decidiu, e um risco
    real: devolveria "Impresso" a um modelo cuja arte mudou.
    """
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        assert "status_impressao_anterior" not in _ler(arquivo), (
            arquivo + " passou a guardar o status anterior; a regra e voltar "
            "sempre para Aguardando"
        )


def test_o_designer_ve_qual_modelo_corrigir():
    """O card "Em Arte" mostra o PEDIDO; o designer precisa achar o MODELO.

    Sem a faixa no card do modelo, ele abriria o pedido e teria de adivinhar
    qual dos modelos a producao devolveu.
    """
    script = _ler("frontend/script.js")
    i = script.index("const faixaCorrigirArte =")
    faixa = script[i:i + 900]

    assert "modeloEmCorrecaoDeArte(item)" in faixa, "a faixa nao pergunta pelo modelo"
    assert "corrigir a arte" in faixa, "a faixa nao diz o que aconteceu"
    assert "MARCAR PRONTO" in faixa, "a faixa nao diz como sair dela"
    assert "${faixaCorrigirArte}" in script, "a faixa foi criada e nunca desenhada"

    # Toda trava precisa de saida. Num modelo APROVADO pelo cliente o botao
    # PRONTO nasce desabilitado, entao "clique em MARCAR PRONTO" seria um
    # beco sem saida: ali a frase tem de mandar passar antes por EM ALTERACAO.
    assert "modeloTravado" in faixa, (
        "a faixa nao trata o modelo aprovado, onde o PRONTO esta desabilitado"
    )
    assert "EM ALTERA" in faixa, "a faixa nao diz o caminho de saida do modelo aprovado"


def test_o_aviso_ao_operador_existe_e_e_um_so():
    """Quem marca nao ve a Lista de Arte nem a impressora parar.

    O efeito da marca acontece em telas que o operador nao esta olhando, entao
    ele tem de ser dito. E dito de um lugar so: tres frases diferentes para o
    mesmo evento envelhecem em ritmos diferentes.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    assert "function avisarCorrecaoDeArte(" in script
    assert script.count("Modelo devolvido para o designer") == 1, (
        "a frase do aviso foi copiada: ela tem de sair de avisarCorrecaoDeArte"
    )
    assert "avisarCorrecaoDeArte(" in pedido, (
        "a fila do Pedido nao avisa quem marcou -- e e a tela onde ele marca"
    )
