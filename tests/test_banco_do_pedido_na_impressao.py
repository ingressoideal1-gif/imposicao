# -*- coding: utf-8 -*-
"""O banco do PEDIDO chega ao motor -- nas duas telas de imposicao (01/09/2026).

O usuario relatou, sobre o pedido 21460:

    "na imposicao, impressao e ao gerar pdf, nao esta saindo o banco de dados no
     QR, esta saindo numeracao sequencial"

Os bancos do pedido eram carregados por uma tela so, a de Amostras. Quem abrisse
a tela do Pedido e clicasse em Gerar PDF ou Imprimir mandava ao motor uma
numeracao sem linha nenhuma, e o ramo final do `_render_element` imprimia o
numero sequencial dentro do QR.

O grosso da regra e medido pelo harness em Node, que le as funcoes do
`script.js`. O que este arquivo cobre e o que o harness nao alcanca: que as DUAS
telas de imposicao chamam a garantia antes de montar o payload, e que a recusa
diz ao operador o que fazer.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "banco_do_pedido_na_impressao_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _corpo_da_imposicao(fonte, abertura):
    """O corpo da funcao de imposicao, ate o primeiro `let fmtId`/`if (window.isImposing)`."""
    i = fonte.index(abertura)
    return fonte[i:i + 6000]


def test_o_harness_do_banco_na_impressao_passa():
    assert os.path.exists(HARNESS), "o harness do banco na impressao sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_as_duas_telas_garantem_os_bancos_do_pedido():
    """Sao duas telas de imposicao, e toda regra de impressao precisa das duas.

    A gemea deste teste e `test_csv_sob_demanda`, que faz a mesma exigencia para
    o `garantirCsvDoTrabalho`. Uma tela so protegida deixa a outra imprimindo o
    numero sequencial no lugar do codigo -- que foi exatamente o caso do 21460:
    a tela do Pedido nao tinha a carga, e e dela que o operador imprime.
    """
    script = _corpo_da_imposicao(_ler("frontend/script.js"),
                                 "window.runImposition = async function")
    pedido = _corpo_da_imposicao(_ler("frontend/pedido.js"),
                                 "window.runPedImposition = async function")

    for rotulo, corpo in (("script.js", script), ("pedido.js", pedido)):
        assert "garantirBancosDoTrabalho" in corpo, (
            f"a imposicao do {rotulo} monta o payload sem garantir os bancos do "
            "pedido: modelo com vinculo sairia com numero sequencial no QR"
        )
        assert "modelosComBancoNaoConferido" in corpo, (
            f"a imposicao do {rotulo} nao recusa o trabalho quando nao conseguiu "
            "ler os vinculos -- 'nunca olhei' passaria por 'nao tem banco'"
        )


def test_a_garantia_vem_antes_das_travas():
    """Ordem importa: travar antes de carregar e travar sobre estado vazio.

    `modelosSemBancoDoTrabalho` e `modelosComElementoSemColuna` partem do
    `vinculoDeBancoDoModelo`. Rodando antes da carga, as duas devolvem lista
    vazia por ignorancia, e o trabalho passa.
    """
    for arquivo, abertura in (("frontend/script.js", "window.runImposition = async function"),
                              ("frontend/pedido.js", "window.runPedImposition = async function")):
        corpo = _corpo_da_imposicao(_ler(arquivo), abertura)
        assert corpo.index("garantirBancosDoTrabalho") < corpo.index("modelosSemBancoDoTrabalho"), (
            f"em {arquivo} a trava do banco roda ANTES da carga: ela conferiria "
            "um estado que ninguem preencheu, e deixaria passar"
        )


def test_a_recusa_diz_o_que_fazer():
    """Trava que impede de seguir tem de oferecer a saida na propria frase."""
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        fonte = _ler(arquivo)
        i = fonte.index("Não consegui ler os bancos de dados deste pedido")
        frase = fonte[i:i + 400]
        assert "sequencial" in frase, (
            f"a recusa em {arquivo} nao diz o que sairia errado"
        )
        assert "clique de novo" in frase, (
            f"a recusa em {arquivo} nao diz ao operador como sair dela"
        )


def test_uma_definicao_so_de_quais_pedidos_sao_do_trabalho():
    """A carga e as travas tem de olhar o MESMO conjunto de pedidos.

    Duas definicoes divergem no dia em que uma delas mudar, e o sintoma seria a
    trava conferindo um pedido enquanto a carga busca outro.
    """
    fonte = _ler("frontend/script.js")
    assert fonte.count("function osIdsDoTrabalho(") == 1
    for quem in ("modelosSemBancoDoTrabalho", "modelosComElementoSemColuna"):
        i = fonte.index("function " + quem + "(")
        corpo = fonte[i:fonte.index("\n}", i)]
        assert "osIdsDoTrabalho()" in corpo, (
            f"{quem} voltou a montar o conjunto de pedidos por conta propria"
        )
