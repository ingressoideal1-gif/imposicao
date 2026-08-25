# -*- coding: utf-8 -*-
"""A numeração fantasma: duas com o mesmo nome, e o modelo trocando sozinho.

Relatado pelo usuário em 25/08/2026: *"estamos tendo problemas com numerações
salvas com mesmo nome, não está avisando que já existe nem sobrescrevendo, está
ficando numeração fantasma, hora carrega uma hora carrega a outra"*.

## O que a investigação achou no banco naquele dia

`producao_numeracoes` **não tem UNIQUE em `name`** — as únicas restrições são a
chave primária, o `UNIQUE (id_gabarito)` e a FK do formato. Havia três nomes
repetidos em 86 registros:

| nome | quantas | distância entre as criações |
|---|---|---|
| `001 - Padrão Ideal` | 2 | 4 dias |
| `Personalizada` | 2 | 22 horas |
| `1000535` | 2 | **28 minutos** |

O `1000535` é o caso que dói: as duas são exclusivas do **mesmo modelo** — mesmo
`Cli_Num` (61567), mesmo `os_item_id` (1000535). Uma ficou com 678 bytes de
elementos e 77 kB de CSV; a outra, com 1.140 e 90 kB. O modelo aponta para a
segunda, e o trabalho feito na primeira virou órfão — invisível na tela, porque
registro com `Cli_Num` não aparece no catálogo.

## O mecanismo do "hora uma, hora outra"

Depois de salvar, o vínculo do modelo com a numeração exclusiva era feito **pelo
nome**:

    const newNum = state.numeracoes.find(n => n.name === newNumName);

Com dois registros homônimos, `.find()` devolve o **primeiro da lista**. E a
lista não tinha ordem: o `api('GET', '/numeracoes')` fazia `select('*')` sem
`order`, então o Postgres devolvia na ordem **física** do heap — e um UPDATE
grava uma versão nova da linha e a **move de lugar**. Conferido pelo `ctid`: as
duas `1000535` estavam em `(19,6)` e `(19,7)`, e editar uma trocaria as
posições.

Ou seja: o modelo era vinculado a uma numeração diferente conforme quem tinha
sido salvo por último. É literalmente "hora carrega uma, hora carrega a outra".

## O que estes testes prendem

O vínculo pelo **id** (que não é ambíguo) e a **ordem fixa** da consulta (a
segunda linha de defesa, para o próximo leitor). O aviso ao operador quando o
nome já existe é decisão à parte, e está registrada no CHANGELOG.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def _recortar(fonte, marcador, linhas=90):
    """O CÓDIGO a partir de um marcador, sem as linhas de comentário.

    Os comentários deste trecho citam o padrão antigo de propósito, para quem
    ler saber o que não fazer — e uma busca ingênua acha a citação e acusa o
    conserto de ser o defeito.
    """
    i = fonte.index(marcador)
    trecho = fonte[i:].splitlines()[:linhas]
    return "\n".join(l for l in trecho if not l.strip().startswith("//"))


def test_o_vinculo_do_modelo_usa_o_id_e_nunca_o_nome():
    """Nome de numeração não é único; id é."""
    fonte = _ler(SCRIPT)
    trecho = _recortar(fonte, "if (window.customNumeracaoEditState) {")

    assert "idDaNumeracaoGravada" in trecho, (
        "o vínculo precisa sair do id de quem acabou de ser gravado"
    )
    assert not re.search(r"\.find\(\s*n\s*=>\s*n\.name\s*===", trecho), (
        "voltou a procurar a numeração recém-salva PELO NOME — é daí que nasce a "
        "numeração fantasma"
    )
    assert re.search(
        r"String\(n\.id\)\s*===\s*String\(idDaNumeracaoGravada\)", trecho
    ), "a busca tem de casar pelo id"


def test_os_tres_caminhos_de_gravacao_devolvem_o_id():
    """Editar, substituir a homônima e criar — os três alimentam o vínculo.

    O de criar é o que engana: o id pode não ter sido cunhado por esta tela (sem
    `supabaseClient` quem o cunha é a própria `api`), então ele precisa vir do
    retorno do POST, que é a linha inserida.
    """
    fonte = _ler(SCRIPT)
    trecho = _recortar(fonte, "let idDaNumeracaoGravada = null;", 40)

    assert "idDaNumeracaoGravada = id;" in trecho, "o caminho de editar"
    assert "idDaNumeracaoGravada = homonima.id;" in trecho, "o caminho de substituir"
    assert re.search(r"const criada = await api\('POST'", trecho), (
        "o caminho de criar precisa guardar o retorno do POST"
    )
    assert re.search(r"criada && criada\.id", trecho), (
        "e tirar o id de lá — sem `supabaseClient`, quem cunha o id é a `api`"
    )


def test_o_catalogo_de_numeracoes_vem_em_ordem_fixa():
    """Sem `order`, o Postgres devolve na ordem física, que muda a cada UPDATE."""
    fonte = _ler(SCRIPT)
    i = fonte.index("const consulta = supabaseClient.from(col).select(colunas);")
    trecho = "\n".join(fonte[i:].splitlines()[:6])

    assert "col === 'producao_numeracoes'" in trecho and ".order('id')" in trecho, (
        "a lista de numerações precisa de ordem fixa; sem ela, qualquer leitura "
        "por nome devolve ora um registro, ora outro"
    )


def test_a_ordem_e_por_id_e_nao_por_nome():
    """Ordenar por nome deixaria justamente as homônimas indefinidas entre si."""
    fonte = _ler(SCRIPT)
    i = fonte.index("const consulta = supabaseClient.from(col).select(colunas);")
    trecho = "\n".join(fonte[i:].splitlines()[:6])

    assert ".order('name')" not in trecho, (
        "por nome, duas homônimas continuam empatadas — o desempate tem de ser "
        "uma coluna que nunca repete"
    )


def test_o_recado_de_falha_diz_o_que_aconteceu_com_o_modelo():
    """Quem lê o toast é o operador, no meio de um pedido.

    O texto antigo era 'Numeração "X" NÃO encontrada após salvar!' — que soa como
    se a numeração tivesse se perdido, quando ela foi gravada e o que falhou foi
    só o vínculo.
    """
    fonte = _ler(SCRIPT)
    trecho = _recortar(fonte, "if (window.customNumeracaoEditState) {")

    assert "NÃO encontrada após salvar" not in trecho, "o texto antigo saiu"
    assert "continua com a numeração anterior" in trecho, (
        "o operador precisa saber em que estado o modelo ficou"
    )
