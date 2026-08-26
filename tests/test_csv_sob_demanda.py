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
    corpo = fonte[i:i + 3000]
    assert "const baixando = !!(num && num.csv_data === undefined && numeracaoTemBanco(num));" in corpo
    assert "'carregando…'" in corpo, "o card precisa dizer que esta baixando"
    assert corpo.index("if (baixando)") < corpo.index("const minhas ="), (
        "o estado de espera tem de sair ANTES de a fatia ser contada"
    )


def test_ver_editar_avisa_quando_o_banco_e_de_mais_de_um_modelo():
    """Relato do usuario em 26/08/2026: *"a selecao ver/editar no modelo nao
    esta funcionando, 2 modelos com a mesma numeracao ao selecionar A no modelo
    1 e B no modelo 2, o modelo 1 vira B"*.

    E o que TEM de acontecer: a marca de imprimir mora dentro da linha
    (`__ativo`), e a linha pertence a NUMERACAO, nao ao modelo. Dois modelos na
    mesma numeracao leem as mesmas linhas, e o segundo a marcar reescreve o
    primeiro -- o `onAplicar` grava `csv_data` na numeracao, uma vez so.

    Quem reparte por modelo e o outro botao do card ("Linhas"), que abre o modo
    distribuicao e grava em `pedidos_modelos.csv_selecao`.

    O defeito era a tela nao dizer nada disso. A trava tem saida: da para abrir
    assim mesmo, que e o certo quando a intencao E mexer no banco inteiro.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("window.abrirCsvDoModelo = async function")
    corpo = fonte[i:i + 4000]

    assert "const irmaos = (state.osItens[osId] || [])" in corpo, (
        "o Ver / editar nao conta quantos modelos usam este banco"
    )
    assert "irmaos.length > 1" in corpo
    assert "caixaConfirmar.perguntar" in corpo, (
        "o aviso precisa ser a caixa DOM do projeto — window.confirm nao responde "
        "no aplicativo instalado"
    )
    assert "if (!seguir) return;" in corpo, "cancelar tem de fechar sem abrir"
    # A saida, escrita na propria caixa.
    assert "Linhas" in corpo and "reparte o banco entre os modelos" in corpo, (
        "a trava precisa dizer, ali mesmo, qual e o botao que faz o que ele quer"
    )
    # E o caminho de distribuir continua saindo antes, sem aviso nenhum.
    assert corpo.index("if (modo === 'distribuir')") < corpo.index("const irmaos ="), (
        "quem ja clicou em Linhas nao pode levar o aviso do outro botao"
    )


def test_a_fatia_orfa_fala_antes_da_regra_de_qtd_e_a_cala():
    """As duas descrevem o mesmo sintoma; so uma diz a causa.

    No 21202, quatro modelos dividiam a "CAMAROTE CORPORATIVO" e alguem repartiu
    as linhas: o 05/set ficou com `1-3500` e os outros tres com lista VAZIA.
    Depois cada modelo ganhou um banco proprio, e as fatias passaram a apontar
    para `__id` de um banco que aquele modelo nao usa mais.

    A tela dizia *"O banco nao fecha com a quantidade do pedido... esperado 3500,
    gerado 0"* e mandava corrigir as linhas do banco -- que estava perfeito, com
    as 3500 linhas. A mensagem apontava para o lugar oposto ao do problema.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("const orfa = ehTelaDoCliente ? null : distribuicaoOrfaDoModelo(item, osId);")
    corpo = fonte[i:i + 700]
    assert "const divergenciaCelulas = (ehTelaDoCliente || orfa) ? null" in corpo, (
        "a regra de Qtd tem de ficar calada quando a fatia e orfa — senao o "
        "operador le as duas e vai consertar o banco, que esta certo"
    )
    # A faixa sai ANTES da de Qtd no card.
    assert fonte.index("${faixaDistribuicaoOrfa}") < fonte.index("${faixaDivergenciaCelulas}")


def test_o_aviso_da_fatia_orfa_traz_a_saida_no_proprio_aviso():
    """Trava sem saida nao pode: o botao que resolve fica no mesmo aviso."""
    fonte = _ler("frontend/script.js")
    i = fonte.index("const faixaDistribuicaoOrfa = travaDeOrfa")
    corpo = fonte[i:i + 1200]
    assert "removerDistribuicaoDoModelo(${idx}, '${osId}')" in corpo, (
        "o aviso da fatia orfa precisa do botao que a remove"
    )
    assert "Remover a distribuição" in corpo
    assert "o que está sobrando é a divisão" in corpo, (
        "o texto tem de dizer que o banco pode estar certo"
    )


def test_o_PRONTO_recusa_pela_fatia_orfa_antes_da_regra_de_qtd():
    fonte = _ler("frontend/script.js")
    i = fonte.index("const orfa = distribuicaoOrfaDoModelo(itemAlvo, osId);")
    corpo = fonte[i:i + 800]
    assert "return false;" in corpo, "a fatia orfa tem de recusar o PRONTO"
    assert corpo.index("const orfa =") < corpo.index("const divergencia ="), (
        "a fatia orfa e conferida antes da regra de Qtd tambem no clique"
    )


def test_remover_a_distribuicao_grava_null_e_redesenha():
    """`null` e nao lista vazia: ausente significa "leva o banco inteiro", e
    lista vazia significa "ficou sem nenhuma linha" -- que e o proprio defeito.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("window.removerDistribuicaoDoModelo")
    corpo = fonte[i:i + 1200]
    assert "csv_selecao: null" in corpo, "tem de gravar null, nunca lista vazia"
    assert "item.csv_selecao = null" in corpo, "e a memoria da tela acompanha"
    assert "redesenharCardsDoPedido(osId)" in corpo


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
