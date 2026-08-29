# -*- coding: utf-8 -*-
"""Todo link entre documentos deste projeto aponta para um arquivo que existe?

Em 29/08/2026, ao documentar a reforma da tela do Pedido, uma varredura achou
**onze** links quebrados espalhados pela pasta `docs/`. Dez eram a mesma coisa:
caminhos absolutos `file:///C:/Users/...` gravados por editores antigos, alguns
apontando para pastas que nem existem mais nesta máquina
(`c:/Antigravity Projetos/imposicao/...`). Nenhum deles poderia funcionar para
ninguém, em nenhum computador — e ficaram anos ali sem que nada acusasse.

O custo não é o clique perdido. É que a documentação deste projeto é a memória de
uma gráfica que roda de verdade: quando ela manda ler outro documento e o outro
documento não abre, quem está com o problema na mão desiste e resolve de cabeça.

Os dois testes abaixo custam milissegundos e falham dizendo o arquivo e o alvo.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RAIZ, "docs")

# [texto](alvo) ou [texto](alvo#ancora) — o alvo nunca tem espaco nem parentese.
LINK = re.compile(r"\]\(([^)#\s]+?)(#[^)]*)?\)")

# Links de rede nao sao conferidos aqui: dependeriam de internet para a suite
# passar, e uma suite que depende de rede vira uma suite que ninguem roda.
EXTERNO = re.compile(r"^(https?|mailto):", re.I)


def _markdowns():
    """Os .md da pasta docs/ e os da raiz. Subpastas de docs/ ficam de fora:
    `docs/superpowers/` guarda planos e specs de sessoes passadas, que citam
    arquivos que podem ter deixado de existir de proposito."""
    for pasta in (DOCS, RAIZ):
        if not os.path.isdir(pasta):
            continue
        for nome in sorted(os.listdir(pasta)):
            if nome.endswith(".md"):
                yield os.path.join(pasta, nome)


def _links_quebrados():
    quebrados = []
    for caminho in _markdowns():
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
        base = os.path.dirname(caminho)
        for alvo, _ancora in LINK.findall(texto):
            if EXTERNO.match(alvo):
                continue
            if not os.path.exists(os.path.join(base, alvo)):
                quebrados.append(
                    "%s -> %s" % (os.path.relpath(caminho, RAIZ), alvo)
                )
    return quebrados


def test_nenhum_link_entre_documentos_esta_quebrado():
    quebrados = _links_quebrados()
    assert not quebrados, "link(s) apontando para arquivo que nao existe:\n  " + \
        "\n  ".join(quebrados)


def test_nenhum_documento_usa_caminho_absoluto_do_windows():
    """A forma exata do estrago de 29/08: `file:///C:/Users/...`.

    Um caminho desses funciona na maquina de quem escreveu e em nenhuma outra —
    inclusive na mesma maquina depois de a pasta mudar de lugar. O teste acima
    ja pegaria o caso comum, mas nao pegaria um `file:///` que por acaso ainda
    resolve aqui. Este pega pela forma, e nao pela sorte.
    """
    culpados = []
    for caminho in _markdowns():
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
        for m in re.finditer(r"\]\((file:///[^)]*)\)", texto):
            culpados.append(
                "%s -> %s" % (os.path.relpath(caminho, RAIZ), m.group(1)[:70])
            )
    assert not culpados, "caminho absoluto em link de documento:\n  " + \
        "\n  ".join(culpados)
