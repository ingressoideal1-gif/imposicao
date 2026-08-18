# -*- coding: utf-8 -*-
"""Nenhum arquivo do agente chama funcao que nao existe.

Em 18/08/2026 o usuario tentou imprimir dois modelos juntos e recebeu
`name 'rotate_element_coords' is not defined`. A funcao nao existia em lugar
nenhum do repositorio: era sobra de um desenho antigo, e as duas chamadas
viviam em `_render_item_front` e `_render_item_back` do `engine.py`.

O que torna esse defeito caro nao e o erro em si, e o **esconderijo**. Ele so
era alcancado quando a pose tinha rotacao E o caminho era o de montagem — ou
seja, ao combinar modelos num formato girado. `Credencial 90x140` gira as poses
2 e 3, entao o codigo passou meses verde: nenhum teste, nenhum import e nenhuma
tiragem de um modelo so chegava naquela linha. Python nao acusa nada ate a
execucao passar por ali, e quem descobre e o operador, na frente da impressora.

Este teste percorre a arvore sintatica e cobra, de toda chamada `nome(...)`,
que o nome exista como builtin, como global do modulo, ou no escopo da funcao
onde aparece. Nao substitui um verificador de tipos: cobre so este caso, que e
o que ja mordeu.
"""
import ast
import builtins
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Os arquivos que o `agent_tray.spec` embute no NewProd.exe. Um fantasma aqui
# viaja para as estacoes e so aparece na hora de imprimir.
DO_AGENTE = [
    "engine.py", "app.py", "agent_worker.py", "print_service.py",
    "hotfolder.py", "db.py", "qr_ideal.py", "agent_tray.py",
]

BUILTINS = set(dir(builtins))


def _globais(arvore):
    nomes = set()
    for no in ast.walk(arvore):
        if isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            nomes.add(no.name)
        elif isinstance(no, ast.Assign):
            for alvo in no.targets:
                for n in ast.walk(alvo):
                    if isinstance(n, ast.Name):
                        nomes.add(n.id)
        elif isinstance(no, (ast.Import, ast.ImportFrom)):
            for a in no.names:
                nomes.add((a.asname or a.name).split(".")[0])
    return nomes


def _ligados(no_funcao):
    """Tudo que a funcao ata ao proprio escopo: argumentos, atribuicoes,
    `except ... as`, imports locais e funcoes aninhadas."""
    nomes = {a.arg for a in no_funcao.args.args + no_funcao.args.kwonlyargs}
    nomes |= {a.arg for a in getattr(no_funcao.args, "posonlyargs", [])}
    if no_funcao.args.vararg:
        nomes.add(no_funcao.args.vararg.arg)
    if no_funcao.args.kwarg:
        nomes.add(no_funcao.args.kwarg.arg)
    for n in ast.walk(no_funcao):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            nomes.add(n.id)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n is not no_funcao:
            nomes.add(n.name)
        elif isinstance(n, ast.ExceptHandler) and n.name:
            nomes.add(n.name)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                nomes.add((a.asname or a.name).split(".")[0])
    return nomes


class _Caçador(ast.NodeVisitor):
    def __init__(self, globais):
        self.globais = globais
        self.escopos = [set()]
        self.achados = []

    def visit_FunctionDef(self, no):
        self.escopos.append(_ligados(no))
        self.generic_visit(no)
        self.escopos.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, no):
        if isinstance(no.func, ast.Name):
            nome = no.func.id
            visivel = (nome in BUILTINS or nome in self.globais
                       or any(nome in e for e in self.escopos))
            if not visivel:
                self.achados.append((no.lineno, nome))
        self.generic_visit(no)


@pytest.mark.parametrize("arquivo", DO_AGENTE)
def test_nenhuma_chamada_a_funcao_inexistente(arquivo):
    caminho = os.path.join(RAIZ, arquivo)
    if not os.path.exists(caminho):
        pytest.skip(f"{arquivo} nao existe neste checkout")

    caçador = _Caçador(_globais(ast.parse(io.open(caminho, encoding="utf-8").read())))
    caçador.visit(ast.parse(io.open(caminho, encoding="utf-8").read()))

    assert not caçador.achados, (
        f"{arquivo} chama funcao que nao existe: "
        + ", ".join(f"linha {l}: {n}(...)" for l, n in caçador.achados)
        + ". Se o nome vier de um import com `*` ou de um `globals()`, "
        "importe-o explicitamente — este teste existe porque uma chamada assim "
        "so estoura quando o ramo roda, e quem descobre e o operador."
    )
