# -*- coding: utf-8 -*-
"""A lista de arquivos que nao podem correr em paralelo tem de continuar certa.

A suite roda com `-n 8 --dist loadgroup`, que espalha teste a teste pelos
processos. Um punhado de testes de motor grava PDF com nome RELATIVO na pasta do
repositorio; dois deles ao mesmo tempo escrevem e apagam o mesmo arquivo.

O `conftest.py` protege esses arquivos com `xdist_group`. Este teste existe
porque a lista e escrita a mao: sem ele, alguem acrescenta amanha um
`out_pdf="saida_nova.pdf"` e a suite passa a falhar de vez em quando, em teste
diferente a cada rodada -- que e o pior defeito de suite que existe, porque
ensina a reexecutar ate passar em vez de investigar.
"""
import os

import conftest

RAIZ = os.path.dirname(os.path.abspath(__file__))


EU_MESMO = os.path.basename(__file__)


def _quem_grava_na_pasta():
    achados = set()
    for nome in os.listdir(RAIZ):
        if not (nome.startswith("test_") and nome.endswith(".py")):
            continue
        # Este arquivo CITA o padrao para explicar o que ele proibe; citar nao e
        # gravar. Sem esta linha ele se acusa e a protecao nasce reprovada.
        if nome == EU_MESMO:
            continue
        with open(os.path.join(RAIZ, nome), encoding="utf-8") as f:
            if conftest.ESCRITA_RELATIVA.search(f.read()):
                achados.add(nome)
    return achados


def test_todo_arquivo_que_grava_na_pasta_esta_protegido():
    faltando = _quem_grava_na_pasta() - conftest.GRAVAM_NA_PASTA_DO_REPO
    assert not faltando, (
        "estes arquivos gravam com nome relativo na pasta do repositorio e nao "
        "estao em GRAVAM_NA_PASTA_DO_REPO no conftest.py: " + ", ".join(sorted(faltando))
        + ". Sem a marca, os testes deles correm em paralelo e disputam o mesmo "
        "arquivo."
    )


def test_a_lista_nao_guarda_arquivo_que_nao_existe_mais():
    """Lista que so cresce vira lista que ninguem confia. Arquivo renomeado ou
    apagado sai daqui, senao a protecao passa a falar de fantasma."""
    existentes = {n for n in os.listdir(RAIZ) if n.endswith(".py")}
    sumidos = conftest.GRAVAM_NA_PASTA_DO_REPO - existentes
    assert not sumidos, "arquivos na lista que nao existem mais: " + ", ".join(sorted(sumidos))
