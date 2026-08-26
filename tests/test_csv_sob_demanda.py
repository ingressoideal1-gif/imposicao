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


def test_as_numeracoes_do_pedido_aberto_continuam_vindo_inteiras():
    """`recarregarNumeracoesDoPedido` le por id, poucas de cada vez.

    E de proposito que ELA continue com `select('*')`: e o caminho que traz o
    banco das numeracoes do pedido que esta na tela, que sao justamente as que
    vao ser desenhadas e impressas. Trocar por lista enxuta aqui empurraria todo
    o trabalho para o `garantirCsvDaNumeracao`, uma consulta por modelo.
    """
    fonte = _ler("frontend/script.js")
    i = fonte.index("async function recarregarNumeracoesDoPedido")
    corpo = fonte[i:i + 1200]
    assert ".select('*')" in corpo, (
        "recarregarNumeracoesDoPedido deixou de trazer a linha inteira — as "
        "numeracoes do pedido aberto ficariam sem banco de dados"
    )
    assert ".in('id', ids)" in corpo, "e ela precisa continuar lendo so as do pedido"


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
