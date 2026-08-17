# -*- coding: utf-8 -*-
"""O que permite rodar a suite em paralelo sem ela ficar instavel.

## Por que paralelo

A suite levava 6 minutos, e o motivo nao era a quantidade de testes: cerca de
300 deles sobem um Chrome de verdade, e so subir e fechar o navegador custa
~470 ms. Trezentos lancamentos em fila sao cinco minutos de espera antes de
qualquer coisa.

Em 17/08/2026 o usuario pediu o ciclo em torno de 1 minuto. Rodar menos testes
seria a saida preguicosa -- deixaria a lentidao de pe para a proxima pessoa e
tiraria cobertura justamente de quem publica direto para a producao de uma
grafica. Paralelizar resolve os dois lados: o ciclo encolhe E a execucao
completa antes de publicar continua completa.

## O que este arquivo resolve

`-n 8 --dist loadgroup` espalha teste a teste pelos processos. Isso e otimo para
os testes de navegador, que sao independentes, e PERIGOSO para um punhado de
testes de motor que gravam PDF com nome relativo na pasta do repositorio --
`out_pdf="output_rotation_test.pdf"` e parecidos. Dois testes do mesmo arquivo
rodando ao mesmo tempo escreveriam e apagariam o mesmo arquivo, e a falha
apareceria de vez em quando, em teste diferente a cada rodada. Instabilidade
assim e pior que lentidao: ensina a reexecutar ate passar.

A marca `xdist_group` por ARQUIVO devolve esses casos ao comportamento antigo --
todos os testes daquele arquivo no mesmo processo, um de cada vez -- sem prender
o resto da suite junto.

Quem quiser rodar em serie continua podendo: `-p no:xdist`.
"""
import os
import re

import pytest

# Arquivos cujos testes gravam com nome RELATIVO na pasta do repositorio.
#
# Manter esta lista a mao seria esquece-la. O `test_paralelismo.py` confere que
# ela bate com o que esta escrito nos testes de verdade, e reprova quando alguem
# escreve um arquivo novo desses sem passar por aqui.
GRAVAM_NA_PASTA_DO_REPO = {
    "test_engine_csv_ativo.py",
    "test_engine_dual_vdp.py",
    "test_engine_modelos_somados.py",
    "test_engine_qr_ideal.py",
    "test_engine_refazer.py",
    "test_engine_rotation.py",
    "test_multi_artes.py",
}

# O mesmo padrao que o teste de coerencia usa. Fica aqui para os dois lerem a
# MESMA regra -- duas copias divergiriam, e a divergencia so apareceria como
# teste instavel.
ESCRITA_RELATIVA = re.compile(
    r"""(save|open|remove)\(['"][A-Za-z0-9_-]+\.(pdf|json|png|txt)['"]\)"""
    r"""|(out_pdf|base_file)\s*=\s*['"][A-Za-z0-9_-]+\.pdf['"]"""
)


def pytest_collection_modifyitems(items):
    for item in items:
        nome = os.path.basename(str(getattr(item, "fspath", "")))
        if nome in GRAVAM_NA_PASTA_DO_REPO:
            item.add_marker(pytest.mark.xdist_group(nome))
