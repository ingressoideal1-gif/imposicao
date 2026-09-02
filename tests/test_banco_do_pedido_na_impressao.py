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


def test_as_duas_telas_conferem_o_payload_antes_de_mandar():
    """A ultima trava olha o que VAI, nao o que o state diz (02/09/2026).

    As travas anteriores partem do `state`: quais pedidos foram consultados,
    quais vinculos existem. Elas nao alcancam a aba Imposicao, onde o operador
    escolhe uma numeracao na lista e monta a folha sem modelo nenhum -- e uma
    peca cujo banco e do PEDIDO chega ali crua, com zero linhas.

    Foi o segundo relato do 21460, ja com as duas telas do pedido carregando os
    bancos. O motor recusava (certo), mas falando de `el_1` e de `csv_row`.
    """
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        fonte = _ler(arquivo)
        i = fonte.index("let payloadNumeracao =")
        trecho = fonte[i:i + 1200]
        assert "bancoVazioNoPayload" in trecho, (
            f"em {arquivo} o payload sai sem a conferencia final: numeracao que le "
            "banco e chega sem linha iria ao motor e voltaria com a recusa dele"
        )


def test_a_recusa_do_payload_diz_por_onde_imprimir():
    """Trava que impede de seguir tem de oferecer a saida na propria frase.

    E a saida aqui e' uma so: imprimir a partir do MODELO. Nao ha como a tela
    adivinhar a coluna — no 21460 sao cinco modelos na mesma peca, cada um lendo
    a sua —, e chutar imprimiria a credencial de um setor com o codigo de outro.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("function recadoDeBancoVazio(")
    corpo = fonte[i:fonte.index(chr(10) + "}", i)]
    assert "a partir do modelo" in corpo, "a recusa nao diz por onde imprimir"
    assert "sequencial" in corpo, "a recusa nao diz o que sairia errado"


def test_o_pedido_desiste_pela_funcao_que_devolve_a_tela():
    """No `pedido.js` a recusa vem ANTES do try/finally.

    Sair dali com um `return` cru deixa `isImposing = true` e os botoes
    escondidos para sempre — so um F5 destrava. O proprio arquivo registra esse
    defeito na definicao do `desistir`.
    """
    fonte = _ler("frontend/pedido.js")
    i = fonte.index("bancoVazioNoPayload(payloadNumeracao")
    trecho = fonte[i:i + 300]
    assert "desistir(" in trecho, (
        "a recusa do payload no pedido.js precisa sair por `desistir`, senao a "
        "tela fica travada com os botoes escondidos"
    )


def test_o_modelo_ativo_e_achado_pelo_itemId_e_nao_por_um_idx_que_nao_existe():
    """O terceiro relato do 21460 (02/09/2026): imprimir UM modelo.

    `enviarParaPedido` e `enviarParaImposicao` gravam o modelo ativo como
    `{ itemId, osId }` -- e nada mais. As duas telas de imposicao, no caminho de
    um modelo so, faziam `state.osItens[osId][state.activeOSItem.idx]`: `idx` e
    `undefined`, o item nao e achado, a resolucao pelo banco do pedido e pulada
    e a peca vai CRUA ao motor, com zero linhas. Marcar varios modelos
    funcionava (o multi_artes acha cada arte pelo `itemId`); abrir um modelo e
    mandar imprimir, nao.

    Medido na tela de verdade, com o 21460 carregado do banco e o modelo ativo
    na forma real: `itemAtivoPeloIdx = null`, `resolvida.linhas = 0`. O mesmo
    estado, achando o item pelo `itemId`: 3.000 linhas, coluna EXPOSITOR.

    O ajudante certo ja existia (`itemAtivoDoPedido`, que procura pelo
    `itemId`) e era usado em toda a tela -- menos aqui.
    """
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        fonte = _ler(arquivo)
        assert "activeOSItem.idx" not in fonte, (
            f"{arquivo} volta a procurar o modelo ativo por um `idx` que nenhuma "
            "tela grava: a impressao de um modelo iria ao motor com a peca crua"
        )
        i = fonte.index("let numeracao = numId ? state.numeracoes.find")
        trecho = fonte[i:i + 1600]
        assert "itemAtivoDoPedido()" in trecho, (
            f"em {arquivo} a resolucao do modelo unico nao usa `itemAtivoDoPedido()`"
        )


def test_as_duas_telas_levam_a_fatia_do_modelo_e_nao_o_banco_inteiro():
    """Um modelo com banco do PEDIDO leva ao motor a fatia dele (02/09/2026).

    O quarto relato do 21460, decodificado nos PDFs gerados: o modelo de 500
    saiu com 3.000 pecas, 2.500 delas com o QR em branco, porque o modelo
    sozinho levava o banco inteiro e o motor imprime uma peca por linha. Vale
    para o modelo unico E para cada arte do multi_artes sem distribuicao.
    """
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        fonte = _ler(arquivo)
        i = fonte.index("numeracao = resolverNumeracaoParaModelo(numeracao, itemAtivo);")
        assert "linhasDoModeloNoPayload(itemAtivo, numeracao)" in fonte[i:i + 900], (
            f"em {arquivo} o modelo unico ainda leva o banco inteiro ao motor"
        )
        j = fonte.index("qtdArte = numArte.csv_data.length;")
        assert "linhasDoModeloNoPayload(itArte, numArte)" in fonte[j:j + 900], (
            f"em {arquivo} a arte sem distribuicao ainda leva o banco inteiro ao motor"
        )


def test_as_duas_telas_recusam_linhas_de_menos_que_a_quantidade():
    """Banco com menos linhas que a quantidade do pedido nao imprime (02/09/2026).

    Sozinho, o modelo sairia curto, calado; combinado, o motor pararia no meio
    da geracao com a recusa dele. A trava fica ao lado da de fatia vazia, nas
    duas telas, e o recado diz por onde sair.
    """
    for arquivo in ("frontend/script.js", "frontend/pedido.js"):
        fonte = _ler(arquivo)
        i = fonte.index("recadoDeFatiaVazia(itensDaImposicao(isMultiSelected))")
        assert "recadoDeLinhasDeMenos(itensDaImposicao(isMultiSelected))" in fonte[i:i + 700], (
            f"em {arquivo} a imposicao nao recusa banco com linhas de menos"
        )
    corpo = _ler("frontend/script.js")
    k = corpo.index("function recadoDeLinhasDeMenos(")
    trecho = corpo[k:corpo.index(chr(10) + "}", k)]
    assert "Gerenciamento de Bancos" in trecho and "Linhas" in trecho, "o recado nao diz por onde sair"

