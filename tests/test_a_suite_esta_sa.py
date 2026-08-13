# -*- coding: utf-8 -*-
"""A suíte olhando para si mesma: todo arquivo daqui é mesmo um teste?

Em 13/08/2026 a suíte tinha **oito** arquivos que não rodavam. Sete eram
scripts de depuração soltos na raiz do projeto que uma faxina varreu para cá em
09/08 — nenhum tinha uma única asserção, e cinco chamavam APIs do motor que já
não existiam. O oitavo era um teste de verdade, gravado em cp1252 declarando
utf-8 no cabeçalho, que o Python recusava compilar.

O estrago não é o arquivo quebrado em si: é que pytest reporta erro de coleta no
meio de muita saída, e a pessoa aprende a ignorar. Com oito erros permanentes na
tela, o nono — que seria uma regressão de verdade — passaria despercebido. Foi
o que aconteceu: durante meses a suíte mentiu sobre a própria cobertura.

Os três testes abaixo pegam exatamente as três formas de um arquivo entrar aqui
sem ser um teste. São baratos, rodam em milissegundos, e falham com o nome do
arquivo culpado.
"""

import ast
import os

TESTES = os.path.dirname(os.path.abspath(__file__))


def _arquivos_de_teste():
    return sorted(
        n for n in os.listdir(TESTES)
        if n.startswith("test_") and n.endswith(".py")
    )


def test_todo_arquivo_de_teste_e_utf8():
    """A corrupção que derrubou o test_multi_artes_capa.py por meses.

    Um `é` gravado em cp1252 dentro de um arquivo que declara utf-8 faz o Python
    recusar o módulo inteiro, com um erro que aponta a linha do acento e não a
    causa. O mesmo mojibake já tinha mordido o `pedido.js` antes.
    """
    quebrados = []
    for nome in _arquivos_de_teste():
        with open(os.path.join(TESTES, nome), "rb") as f:
            bruto = f.read()
        try:
            # utf-8-sig aceita o BOM, que e legal em fonte Python.
            bruto.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            quebrados.append(f"{nome} (byte {e.start}: {bruto[e.start]:#04x})")
    assert not quebrados, (
        "arquivo(s) de teste que não são utf-8: " + "; ".join(quebrados)
        + " — o Python recusa compilá-los e o pytest só mostra erro de coleta"
    )


def test_todo_arquivo_de_teste_compila():
    """Sintaxe quebrada aqui vira ruído permanente, não falha visível."""
    quebrados = []
    for nome in _arquivos_de_teste():
        caminho = os.path.join(TESTES, nome)
        # utf-8-sig, e nao utf-8: o BOM é legal em arquivo Python — o próprio
        # importador o descarta —, e ler sem descartá-lo deixa um ﻿ no
        # começo da string que faz o ast.parse acusar sintaxe inválida. Esta
        # primeira versão do teste reprovou um arquivo perfeitamente válido.
        with open(caminho, encoding="utf-8-sig", errors="replace") as f:
            fonte = f.read()
        try:
            ast.parse(fonte, filename=caminho)
        except SyntaxError as e:
            quebrados.append(f"{nome}:{e.lineno} ({e.msg})")
    assert not quebrados, "arquivo(s) de teste que não compilam: " + "; ".join(quebrados)


def test_todo_arquivo_de_teste_tem_ao_menos_um_teste():
    """Script não é teste, e a pasta tests/ não é depósito de script.

    Era o caso dos sete removidos em 13/08/2026: `test_capa.py`, `test_gen.py`,
    `test_fastapi.py`, `test_local.py`, `test_diag.py`, `test_mapa.py` e
    `test_impose.py`. Todos terminavam em `print`, nenhum afirmava nada, e todos
    apareciam como erro na saída do pytest para sempre.

    A regra segue a do próprio pytest, cujo padrão é `test*` — é por isso que o
    `test_hotfolder.py` conta, mesmo escrevendo `teste_sanitizar` em português.
    Exigir `test_` aqui reprovaria um arquivo que roda e passa.

    A única função que começa com `test` e ainda assim não vale é a chamada
    exatamente `test`: era o caso do `test_impose.py` e do `test_fastapi.py`, e
    nos dois o nome genérico denunciava o script. O pytest tentava coletar a do
    `test_impose.py` e falhava pedindo uma fixture `cfg` que nunca existiu.
    """
    sem_teste = []
    for nome in _arquivos_de_teste():
        if nome == os.path.basename(__file__):
            continue
        caminho = os.path.join(TESTES, nome)
        # utf-8-sig, e nao utf-8: o BOM é legal em arquivo Python — o próprio
        # importador o descarta —, e ler sem descartá-lo deixa um ﻿ no
        # começo da string que faz o ast.parse acusar sintaxe inválida. Esta
        # primeira versão do teste reprovou um arquivo perfeitamente válido.
        with open(caminho, encoding="utf-8-sig", errors="replace") as f:
            arvore = ast.parse(f.read(), filename=caminho)
        tem = any(
            isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef))
            and no.name.startswith("test")
            and no.name != "test"
            for no in arvore.body
        )
        # Classe de teste também vale, ainda que o projeto não use hoje.
        tem = tem or any(
            isinstance(no, ast.ClassDef) and no.name.startswith("Test")
            for no in arvore.body
        )
        if not tem:
            sem_teste.append(nome)
    assert not sem_teste, (
        "arquivo(s) em tests/ sem nenhuma função test_*: " + ", ".join(sem_teste)
        + " — se é script de apoio, ele não pertence a tests/"
    )
