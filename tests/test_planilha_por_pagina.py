# -*- coding: utf-8 -*-
"""A planilha de varias paginas: linha enxuta, e uma numeracao por aba.

Pedido do usuario em 23/08/2026, depois de a planilha do Expointer (19 abas) nao
conseguir salvar. Medido naquele dia, com a planilha dele:

    linhas empilhadas    46.921
    colunas na tabela        39  (as 38 das abas + a coluna Pagina)
    campos por linha         39, dos quais 37 vazios
    pacote do save       45,4 MB  ->  4,9 MB depois da correcao
    dado real ali dentro  3,5 MB

O salvamento nao completava: a conexao caia no meio e o erro chegava como
"TypeError: Failed to fetch", junto com a falha do preview no Storage. Nem o
Supabase nem o navegador eram o gargalo -- medidos no mesmo dia, o banco aceita
16 MB em 4 s e o navegador monta 18 MB de JSON em 51 ms.

As regras estao no harness em Node, que le as funcoes do `script.js`. O que fica
aqui e a LIGACAO com a tela.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "planilha_por_pagina_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_planilha_por_pagina_passa():
    assert os.path.exists(HARNESS), "o harness da planilha por pagina sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "todas passaram" in (r.stdout or "")


def test_a_linha_nao_carrega_coluna_de_outra_pagina():
    """A correcao que ataca a causa: cada linha guarda so as colunas da sua aba."""
    js = _ler("frontend/script.js")

    i = js.index("function juntarPaginas(")
    corpo = js[i:js.index("\n}", i)]

    assert "const daPagina = (p.headers || []).filter(Boolean)" in corpo, (
        "o preenchimento voltou a percorrer a uniao das colunas"
    )
    assert "for (const c of colunas) nova[c]" not in corpo, (
        "isto era o que enchia cada linha com as colunas das outras abas"
    )


def test_o_cabecalho_continua_completo():
    """O `csv_headers` e a uniao -- e dele que o editor tira a grade, e e ele que
    todo consumidor prefere antes de olhar as chaves da primeira linha."""
    js = _ler("frontend/script.js")

    i = js.index("function juntarPaginas(")
    corpo = js[i:js.index("\n}", i)]
    assert "return { headers: [colunaPagina, ...colunas]" in corpo


def test_a_escolha_entre_juntar_e_separar_e_do_operador():
    js = _ler("frontend/script.js")

    assert "function abrirEscolhaDasPaginas(" in js
    assert "Uma numeração por página" in js
    assert "Tudo numa numeração só" in js, "o caminho de antes precisa continuar oferecido"

    # E so aparece quando ha o que escolher.
    i = js.index("if (Array.isArray(res.partes) && res.partes.length > 1)")
    assert "abrirEscolhaDasPaginas" in js[i:i + 200]


def test_cada_numeracao_criada_fica_ligada_a_sua_aba():
    """Sem o `gid` proprio, o "atualizar da planilha" de qualquer uma delas
    traria o caderno inteiro de volta -- desfazendo a separacao."""
    js = _ler("frontend/script.js")

    i = js.index("async function criarUmaNumeracaoPorPagina")
    corpo = js[i:i + 4000]
    assert "#gid=" in corpo
    assert "api('POST', '/numeracoes'" in corpo


def test_os_elementos_sao_reapontados_por_posicao():
    """Cada aba tem os seus nomes de coluna; o que se mantem entre elas e a ordem."""
    js = _ler("frontend/script.js")

    i = js.index("function elementosParaAPagina(")
    corpo = js[i:js.index("\n}", i)]

    assert "colunasDeReferencia.indexOf(col)" in corpo
    assert "semCorrespondente" in corpo, (
        "coluna sem correspondente precisa ser relatada, nao adivinhada"
    )
    assert "JSON.parse(JSON.stringify(" in corpo, (
        "os elementos precisam ser copiados: sem isso, criar 19 numeracoes "
        "reapontaria os da numeracao aberta 19 vezes"
    )
