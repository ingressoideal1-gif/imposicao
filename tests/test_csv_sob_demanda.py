# -*- coding: utf-8 -*-
"""O catalogo de numeracoes sem o banco de dados de cada uma (26/08/2026).

O usuario relatou a tela travando e perguntou onde estava o gargalo. Medido
contra o banco real, `producao_numeracoes` tem 105 registros e 27 colunas:

    select('*')      29,17 MB   1.772 ms
    a lista enxuta    0,19 MB     273 ms

A diferenca inteira e UMA coluna. `csv_data` sozinho pesa 30,1 MB dos 30,3 MB da
tabela; as outras 26 somadas dao 209 KB. Abrir o painel baixava esses 29 MB antes
de qualquer tela e deixava 187.021 linhas de CSV vivas na memoria da aba -- de
bancos que a lista nao mostra e ninguem pediu. O sintoma que aparecia era outro:
um clique qualquer travando por 200 ms, porque quem paga a conta da memoria e
sempre o proximo clique, e nao quem a encheu.

## O perigo que a correcao cria, e as tres pecas que existem contra ele

Quase todo leitor do painel pergunta `if (!num.csv_data)` e conclui "esta
numeracao nao tem banco". Uma numeracao COM banco que ainda nao desceu responde
igual a uma SEM banco -- e o motor, sem linhas, ignora o banco e cai na
numeracao SEQUENCIAL: sai numero impresso no lugar do nome da pessoa, sem erro
em tela nenhuma, e quem descobre e o cliente olhando o papel.

1. A lista NAO traz a coluna, em vez de traze-la vazia: `csv_data` fica
   `undefined`, que e distinguivel do `null` de "ja procurei e nao tem".
2. `numeracaoTemBanco()` responde "tem banco?" por `csv_filename`/`csv_headers`,
   sem precisar das linhas.
3. `garantirCsvDoTrabalho()` abre as DUAS telas de imposicao: o banco de toda
   numeracao do trabalho esta em maos antes de o payload ser montado.

O grosso da regra e medido pelo harness em Node, que le as funcoes do
`script.js`. O que este arquivo cobre e o que o harness nao alcanca: a lista de
colunas, e a ligacao das pecas nos lugares certos.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "csv_sob_demanda_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _lista_de_colunas():
    """O valor da const, com as concatenacoes de string ja juntadas."""
    fonte = _ler("frontend/script.js")
    i = fonte.index("const COLUNAS_DA_NUMERACAO_NA_LISTA =")
    trecho = fonte[i:fonte.index(";", i)]
    return "".join(re.findall(r"'([^']*)'", trecho))


def test_o_harness_do_csv_sob_demanda_passa():
    assert os.path.exists(HARNESS), "o harness do csv sob demanda sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_lista_do_catalogo_nao_traz_o_csv_data():
    """A coluna que vale 30,1 MB dos 30,3 MB da tabela."""
    colunas = _lista_de_colunas().split(",")
    assert "csv_data" not in colunas, (
        "csv_data voltou para a lista do catalogo: sao 29 MB baixados a cada "
        "abertura do painel"
    )
    # E as duas que respondem "tem banco?" sem as linhas continuam vindo.
    assert "csv_filename" in colunas
    assert "csv_headers" in colunas


def test_a_lista_traz_toda_coluna_que_a_duplicacao_copia():
    """A lista explicita envelhece em silencio -- este teste e o alarme.

    Nao existe "select tudo menos uma" no PostgREST, entao a lista e escrita a
    mao: uma coluna nova na tabela chega como `undefined`, sem erro nenhum. A
    enumeracao mais completa que o codigo tem e o `duplicateCatalogNumeracao`,
    que copia campo a campo -- quem acrescentar coluna la e obrigado a passar
    por aqui.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("window.duplicateCatalogNumeracao")
    corpo = fonte[i:i + 4000]
    copiadas = set(re.findall(r"\bn\.([A-Za-z_][A-Za-z0-9_]*)\b", corpo))
    # `csv_data` desce sob demanda; `name` vira "(cópia)" e nao se compara.
    copiadas -= {"csv_data", "id"}

    colunas = set(_lista_de_colunas().split(","))
    faltando = sorted(c for c in copiadas if c not in colunas)
    assert not faltando, (
        "colunas que a duplicacao copia e a lista do catalogo nao traz: "
        + ", ".join(faltando)
        + " — elas chegariam como undefined, sem erro, e a copia nasceria sem elas"
    )


def test_a_consulta_da_lista_usa_a_lista_enxuta():
    fonte = _ler("frontend/script.js")
    assert "(col === 'producao_numeracoes') ? COLUNAS_DA_NUMERACAO_NA_LISTA" in fonte, (
        "o api() voltou a pedir '*' para o catalogo de numeracoes"
    )
    # A tabela de apoio da amostra tambem.
    assert "from('producao_numeracoes').select('*')" not in fonte, (
        "sobrou um select('*') de catalogo inteiro em producao_numeracoes"
    )


def test_a_releitura_do_pedido_tem_os_dois_modos():
    """Quem precisa das linhas na hora pede tudo; a tela de Amostras nao.

    Medido no pedido 21202 -- 52 modelos, 17 numeracoes, 115.846 linhas de CSV:

        select('*')          22,01 MB   2.015 ms
        sem o csv_data        0,03 MB      72 ms

    O padrao continua sendo trazer tudo, porque a Conferencia de dados e as duas
    telas de imposicao precisam das linhas antes de responder qualquer coisa. A
    tela de Amostras -- a que o operador abre o dia inteiro -- pede enxuto e
    deixa os bancos chegarem depois, um por um.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function recarregarNumeracoesDoPedido")
    corpo = fonte[i:i + 2500]
    assert "comBanco ? '*' : COLUNAS_DA_NUMERACAO_NA_LISTA" in corpo, (
        "recarregarNumeracoesDoPedido perdeu o modo enxuto"
    )
    assert ".in('id', ids)" in corpo, "e ela precisa continuar lendo so as do pedido"
    # O padrao e trazer tudo: so quem pedir explicitamente recebe enxuto.
    assert "const comBanco = !(opcoes && opcoes.comBanco === false);" in corpo, (
        "o modo enxuto tem de ser opt-in — o padrao traz as linhas"
    )
    assert "recarregarNumeracoesDoPedido(realOSId, { comBanco: false })" in fonte, (
        "a tela de Amostras voltou a esperar os 22 MB antes de abrir"
    )


def test_os_bancos_do_pedido_chegam_em_segundo_plano():
    """Mesmo desenho da cobertura de glifos, que ja resolvia isto ali dentro.

    Segurar o desenho dos cards pela rede deixa a tela em branco. Os cards saem
    com o que ha, e a tela se redesenha a cada banco que chega. A trava e por
    PEDIDO: quem abre o A e pula para o B nao pode ficar sem os bancos do B.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("function renderAmostrasOSItens(osId)")
    corpo = fonte[i:i + 4000]
    assert "state._bancosEmVoo" in corpo, "o render nao busca os bancos que faltam"
    assert "carregarBancosDoPedido(targetOSId)" in corpo
    assert "renderAmostrasOSItens(osId)" in corpo, "e nao redesenha quando eles chegam"


def test_o_card_diz_que_esta_baixando_em_vez_de_acusar_o_operador():
    """A frase errada aqui manda o operador mexer numa distribuicao que esta certa.

    Enquanto o banco desce, `csv_data` e `undefined` e a fatia da zero. Sem este
    estado, o botao ficava VERMELHO dizendo "este modelo esta SEM nenhuma linha".
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("function atualizarBotoesCsvDaAmostra")
    # A funcao inteira, e nao uma janela de N caracteres: ela cresceu em
    # 27/08/2026 (o seletor do banco do pedido) e as afirmacoes daqui ficaram
    # para fora da janela, quebrando o teste sem que nada tivesse regredido.
    corpo = fonte[i:fonte.index(chr(10) + "}", i)]
    assert "const baixando = !!(num && num.csv_data === undefined && numeracaoTemBanco(num));" in corpo
    assert "'carregando…'" in corpo, "o card precisa dizer que esta baixando"
    assert corpo.index("if (baixando)") < corpo.index("const minhas ="), (
        "o estado de espera tem de sair ANTES de a fatia ser contada"
    )


def test_o_card_do_modelo_nao_edita_mais_o_banco_da_numeracao():
    """O aviso que este arquivo guardava saiu junto com o botao (26/08/2026).

    Em 26/08 o "Ver / editar" do card ganhou uma caixa avisando que o banco era
    de N modelos. No mesmo dia o usuario decidiu melhor: *"vamos deixar o
    Ver/editar apenas na edicao da numeracao"* -- tirar a porta em vez de
    sinalizar o buraco. O aviso foi embora com ela, e nao ha o que testar num
    caminho que nao existe.

    O que ficou para guardar e o contrario: que ele nao volte. A cobertura da
    porta que sobrou esta em `test_colunas_so_quando_escolhidas.py`.
    """
    js = _ler("frontend/script.js")
    corpo = js.split("window.abrirCsvDoModelo")[1][:1800]

    assert "abrirDistribuicaoCsv" in corpo, "o botao do card tem de abrir a distribuicao"
    assert "caixaConfirmar" not in corpo, (
        "sobrou o aviso do banco compartilhado num caminho que nao existe mais"
    )
    assert "abrirEditorCsv({" not in corpo, (
        "o card voltou a abrir o editor do banco da numeracao"
    )


def test_a_faixa_de_conferencia_so_aparece_no_modo_distribuicao():
    """Pedido do usuario em 26/08/2026: *"ao clicar em Linhas as colunas que sao
    verificadas na conferencia de dados devem vir marcadas (checkbox); ao
    desmarcar devem ignorar a conferencia de repeticoes"*.

    No modo EDICAO nao ha o que escolher: aquele modal edita o banco, e a
    conferencia e uma leitura do pedido.
    """
    js = _ler("frontend/csv-editor.js")
    i = js.index("function renderFaixaConferencia(bars)")
    corpo = js[i:i + 1400]
    assert "if (!ehDistribuicao()" in corpo, "a faixa nao pode aparecer no modo edicao"
    assert "type = 'checkbox'" in corpo.replace('"', "'"), "as colunas vem como checkbox"
    assert "não altera a impressão" in js[i:i + 3000], (
        "a faixa tem de dizer, ali mesmo, que desmarcar nao muda o papel"
    )
    # Desenhada junto com as outras faixas.
    assert "renderFaixaConferencia(bars);" in js


def test_a_escolha_das_colunas_conferidas_e_gravada_e_lida():
    fonte = _ler("frontend/script.js")

    # Entra pela abertura da distribuicao...
    i = fonte.index("window.abrirDistribuicaoCsv")
    corpo = fonte[i:i + 2500]
    assert "conferencia: conferenciaDasColunasDaNumeracao(num)" in corpo, (
        "os checkboxes nao nascem com o estado da numeracao"
    )
    # ...e volta pelo aplicar, gravada nos ELEMENTOS.
    assert "aplicarConferenciaNasColunas(num, conferencia)" in corpo
    assert "salvarCamposDaNumeracao(num.id, { elements: num.elements })" in corpo, (
        "a escolha precisa ser gravada — ela mora nos elementos da numeracao"
    )


def test_aplicar_so_a_conferencia_nao_diz_que_nada_mudou():
    """Relato do usuario: *"faltou apenas sumir o aviso das linhas repetidas no
    modelo"*.

    A escolha ERA gravada -- o banco confirmava `Camarote` fora da conferencia
    nas oito numeracoes do 21202, e a funcao real sobre o dado real devolvia
    zero modelos com aviso. O que enganava era a frase: quem so desmarcava a
    coluna e clicava em Aplicar lia *"nada foi mudado"*, e concluia que o
    checkbox nao tinha pegado.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("if (!distribuicaoAtribuiuAlgo(distribuicao))")
    corpo = fonte[i:i + 1400]
    assert "conferenciaMudou" in corpo, (
        "a frase do Aplicar nao sabe se a conferencia mudou"
    )
    assert "Colunas da conferência salvas" in corpo, (
        "quem so mexeu nos checkboxes precisa ler que a escolha foi salva"
    )
    # E a frase antiga continua para quem realmente nao mudou nada.
    assert "então nada " in corpo and "foi mudado" in corpo


def test_a_lista_que_decide_a_IMPRESSAO_nao_foi_tocada():
    """A separacao que torna esta escolha segura.

    `colunasDoBancoDaNumeracao` decide quais linhas IMPRIMEM: uma linha entra na
    fatia se tiver dado em alguma coluna que a numeracao le. `colunasConferidas`
    decide outra coisa, e so ela: quais colunas contam na busca por repetido.
    Confundir as duas faria um checkbox de conferencia mudar o que sai no papel.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("function linhasComDadoDaNumeracao")
    corpo = fonte[i:i + 900]
    assert "colunasDoBancoDaNumeracao(num)" in corpo, (
        "o filtro de linhas impressas passou a usar a lista da conferencia"
    )
    assert "colunasConferidas" not in corpo


def test_o_aviso_de_repetidas_fica_calado_com_o_pedido_pela_metade():
    """Numero que muda sozinho na frente do operador nao vale nada."""
    fonte = _ler("frontend/script.js")
    i = fonte.index("function celulasRepetidasDoPedido")
    corpo = fonte[i:i + 900]
    assert "numeracoesSemBancoBaixado(osId).length) return {}" in corpo, (
        "o aviso pode sair com a conta pela metade enquanto os bancos descem"
    )


def test_as_DUAS_telas_de_imposicao_garantem_o_banco_antes_de_imprimir():
    """Sao duas telas de imposicao, e toda regra de impressao precisa das duas.

    `pedido.js` e um clone do `script.js` com os ids renomeados; a fatia por
    modelo nasceu so numa delas e a outra passou dois meses imprimindo o banco
    inteiro. Uma trava que existisse so num lado repetiria a historia.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    i = script.index("window.runImposition = async function")
    assert "garantirCsvDoTrabalho(idsDeNumeracaoDoTrabalho('imp-numeracao'))" \
        in script[i:i + 1500], "a aba Imposicao nao garante o banco antes de imprimir"

    j = pedido.index("window.runPedImposition = async function")
    assert "garantirCsvDoTrabalho(idsDeNumeracaoDoTrabalho('ped-numeracao'))" \
        in pedido[j:j + 1500], "a tela de Pedido nao garante o banco antes de imprimir"


def test_abrir_a_numeracao_no_editor_espera_o_banco():
    """`editNumeracao` virou async, e os TRES pontos de chamada esperam.

    Quem chama escreve no DOM logo depois (o `#num-name` do clone). Sem o
    `await` do lado de la, essas linhas correriam antes de a tela ser
    preenchida, e o clone nasceria com o nome errado.
    """
    script = _ler("frontend/script.js")
    pedido = _ler("frontend/pedido.js")

    assert "async function editNumeracao(id)" in script
    i = script.index("async function editNumeracao(id)")
    assert "await garantirCsvDaNumeracao(n);" in script[i:i + 900], (
        "editNumeracao abre sem o banco de dados: o 'Ver / Editar' viria vazio"
    )

    assert "await editNumeracao(baseNumId);" in script
    assert script.count("await editNumeracao(numId);") == 1, "falta o await no script.js"
    assert "await editNumeracao(numId);" in pedido, "falta o await no pedido.js"

    # Nenhuma chamada solta sobrou. O `onclick=` do HTML fica de fora: ali nao
    # ha nada depois dela para correr fora de ordem.
    for arquivo, texto in (("script.js", script), ("pedido.js", pedido)):
        soltas = []
        for ln in texto.split("\n"):
            corte = ln.strip()
            if corte[:1] in ("*", "") or corte.startswith("//") or corte.startswith("/*"):
                continue                      # comentario que so cita o nome
            if "onclick" in ln:
                continue                      # o botao da lista: nada corre depois
            if re.search(r"(?<!await )(?<!async function )\beditNumeracao\(", ln):
                soltas.append(corte)
        assert not soltas, arquivo + " tem chamada a editNumeracao sem await: " + str(soltas)


def test_desenhar_a_amostra_garante_o_banco_do_modelo():
    """Amostra desenhada sem as linhas nao sai vazia: sai com numero sequencial
    no lugar do nome -- uma arte errada que o cliente aprovaria sem desconfiar.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function regenerarAmostraDoModelo")
    assert "await garantirCsvDaNumeracao(" in fonte[i:i + 3000], (
        "regenerarAmostraDoModelo desenha sem garantir o banco da numeracao"
    )


def test_gravar_o_banco_esquece_o_que_foi_baixado():
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function salvarCamposDaNumeracao")
    corpo = fonte[i:i + 800]
    assert "esquecerCsvDaNumeracao(numId)" in corpo, (
        "gravar por cima do csv_data sem esquecer o baixado deixa a tela "
        "mostrando o banco antigo ate a proxima releitura do catalogo"
    )


def test_a_clonagem_da_numeracao_e_uma_so():
    """Duas listas de campos seriam duas verdades sobre o que e uma copia.

    A lista morava solta dentro do `duplicateCatalogNumeracao`. Quando o
    "Separar por dia" (26/08/2026) precisou clonar tambem, copia-la teria criado
    uma segunda versao que envelheceria em silencio no dia em que a tabela
    ganhasse uma coluna.
    """
    fonte = _ler("frontend/script.js")
    assert fonte.count("formato_ids: n.formato_ids || [n.formato_id]") == 1, (
        "a lista de campos da copia foi duplicada — ha duas verdades sobre o "
        "que uma numeracao clonada leva"
    )
    assert "async function clonarNumeracao(n, ajustes)" in fonte
    # E os dois caminhos usam a mesma.
    assert "clonarNumeracao(n, { name: n.name + ' (cópia)' })" in fonte
    assert "clonarNumeracao(num, { name: e.nomeNovo, csv_data: e.fatia })" in fonte


def test_a_separacao_por_dia_mora_no_painel_por_causa_da_arte_de_fundo():
    """A razao de esta operacao existir DENTRO do painel.

    Em 26/08/2026 a separacao do pedido 21202 foi feita por um script de fora, e
    o preco apareceu na hora: o Storage recusa a chave anonima, entao as copias
    tiveram de dividir o arquivo de arte de fundo do original -- o que amarra as
    duas para sempre e proibe apagar o original. Aqui dentro, com a sessao do
    operador, `duplicarFundoNoStorage` grava o arquivo da copia.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function clonarNumeracao")
    corpo = fonte[i:i + 3000]
    assert "duplicarFundoNoStorage(n.bg_url, idDaCopia, n.bg_filename)" in corpo, (
        "a copia deixou de reenviar a arte de fundo sob o id dela"
    )
    # E o id nasce ANTES, porque o arquivo vai para o nome dele.
    assert corpo.index("crypto.randomUUID") < corpo.index("duplicarFundoNoStorage")


def test_o_separar_por_dia_confirma_antes_de_criar_e_nao_apaga_o_original():
    fonte = _ler("frontend/script.js")
    i = fonte.index("window.separarNumeracaoPorDia")
    corpo = fonte[i:i + 2500]

    assert "caixaConfirmar" in corpo and "textoDoPlanoDeSeparacao(plano)" in corpo, (
        "criar numeracoes em lote sem mostrar o plano antes e o tipo de coisa "
        "que o operador descobre depois de feita"
    )
    assert "if (!seguir) return;" in corpo, "cancelar nao pode criar nada"
    # Reaponta o modelo pelos DOIS nomes do campo, e grava.
    assert "sincronizarNumeracaoDoItem(e.item, novoId)" in corpo
    assert "autoSaveOSItemField(e.item.id, osId, 'amostra_num_id', novoId)" in corpo
    # O original nao e tocado: e por ele que se desfaz.
    assert "delete" not in corpo.lower().split("for (const e of plano.entram)")[1][:600], (
        "a separacao nao pode apagar o banco original — e ele que permite desfazer"
    )


def test_o_botao_de_separar_so_aparece_quando_ha_o_que_separar():
    fonte = _ler("frontend/script.js")
    i = fonte.index("function atualizarBotoesCsvDaAmostra")
    corpo = fonte[i:fonte.index(chr(10) + "}", i)]
    assert "planoDeSeparacaoPorDia(osId, num)" in corpo
    assert "bDia.style.display = plano ? '' : 'none';" in corpo, (
        "o botao precisa sumir quando nao ha o que separar — banco de um dia so, "
        "ou nenhum modelo que feche com o dia dele"
    )


def test_trocar_de_modelo_le_ENXUTO_e_baixa_so_o_banco_do_modelo():
    """O clique num modelo da fila nao pode baixar o pedido inteiro (27/08/2026).

    O usuario relatou que no pedido 21202 nao dava para navegar entre os
    modelos. Medido contra o banco real: 52 modelos, 49 numeracoes, 96.910
    linhas de CSV, 17 MB. Todo clique num modelo da fila passa por
    `enviarParaPedido` -> `enviarParaImposicao`, e la havia um
    `await recarregarNumeracoesDoPedido(osId)` com `select('*')`: os 17 MB
    inteiros baixados e reprocessados a cada clique, com tudo o que preenche a
    tela vindo DEPOIS desse await. O operador clicava, nao via nada mudar,
    clicava de novo -- e disparava outra leva de 17 MB por cima.

    Enxuto sao 30 KB e 72 ms. O que o modelo aberto precisa de verdade e o
    banco DELE, e disso cuida o `garantirCsvDoTrabalho` logo em seguida: sem
    ele o `updatePedSummary` leria `csv_data === undefined`, concluiria "esta
    numeracao nao tem banco" e liberaria a faixa NI/NF.
    """
    script = _ler("frontend/script.js")

    i = script.index("async function enviarParaImposicao(")
    corpo = script[i:i + 3000]
    assert "recarregarNumeracoesDoPedido(osId, { comBanco: false })" in corpo, (
        "trocar de modelo voltou a baixar o banco de TODAS as numeracoes do pedido"
    )
    assert "garantirCsvDoTrabalho(idsDeNumeracaoDoTrabalho(null))" in corpo, (
        "o modelo abre sem o banco dele: a tela concluiria 'nao tem banco'"
    )
    assert corpo.index("recarregarNumeracoesDoPedido") < corpo.index("garantirCsvDoTrabalho"), (
        "o banco do modelo tem de ser garantido DEPOIS da releitura -- "
        "a mescla e que decide o que sobrou em memoria"
    )

    j = script.index("async function abrirImposicaoDoPedido(")
    assert "recarregarNumeracoesDoPedido(osId, { comBanco: false })" in script[j:j + 1200], (
        "abrir o pedido inteiro voltou a baixar todos os bancos de uma vez"
    )


def test_a_releitura_esquece_o_banco_da_numeracao_que_mudou():
    """A promessa guardada nao pode sobreviver a mudanca da linha.

    `_csvDaNumeracaoEmVoo` guarda a PROMESSA da consulta, ja resolvida, para
    que duas telas pedindo a mesma numeracao facam uma consulta so. Quando a
    mescla devolve `csv_data` a `undefined` por a linha ter mudado, o
    `garantirCsvDaNumeracao` vai buscar de novo -- e receberia da promessa
    velha exatamente as linhas que acabaram de ser descartadas.
    """
    script = _ler("frontend/script.js")
    i = script.index("async function recarregarNumeracoesDoPedido")
    corpo = script[i:script.index("window.recarregarNumeracoesDoPedido =", i)]
    assert "esquecerCsvDaNumeracao(nova.id)" in corpo, (
        "a releitura nao invalida o cache em voo da numeracao que mudou"
    )
    assert "bancoBaixadoContinuaValendo(velha, nova)" in corpo
