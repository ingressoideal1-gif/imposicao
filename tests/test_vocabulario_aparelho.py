# -*- coding: utf-8 -*-
"""'Portao' virou 'Aparelho' em 17/08/2026, por decisao do usuario: "todo
aparelho e portao". O termo antigo esta espalhado por dezenas de frases e volta
sozinho quando alguem copia um texto vizinho -- por isso um teste, e nao so
uma passada de busca.

So texto de TELA conta. Nomes internos (`virar-portao.js`, `nome_portao`,
`ideal_control_portoes`, comentarios) ficam: trocar chave de localStorage em uso
exige migracao e nao vale o risco por vocabulario.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")

# Onde a tela do aplicativo e escrita.
ARQUIVOS = [
    "controle.html", "portaria.html",
    "lista-eventos.js", "virar-portao.js", "controle.js", "fila-presa.js",
    "ao-vivo.js",
    "portaria.js", "parede-pwa.js", "menu-geral.js", "aparelho.js",
    "app.webmanifest",
]

PORTAO = re.compile(r"port[aã]o|port[oõ]es", re.I)


def _linhas_de_texto(nome):
    """As linhas que chegam a tela: strings JS e texto de HTML. Comentario nao conta."""
    with open(os.path.join(FRONTEND, nome), encoding="utf-8") as f:
        texto = f.read()
    # tira comentarios de bloco e de linha
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.S)
    texto = re.sub(r"<!--.*?-->", "", texto, flags=re.S)
    linhas = []
    for n, linha in enumerate(texto.splitlines(), 1):
        sem_comentario = re.sub(r"//.*$", "", linha)
        if PORTAO.search(sem_comentario):
            linhas.append((n, sem_comentario.strip()))
    return linhas


def test_nenhum_portao_em_texto_de_tela():
    culpados = []
    for nome in ARQUIVOS:
        for n, linha in _linhas_de_texto(nome):
            # nomes internos que ficam de proposito
            interno = ("nome_portao" in linha or "ideal_control_portoes" in linha
                       or "virar-portao" in linha or "virarPortao" in linha
                       or "aparelhoAqui" in linha)
            if not interno:
                culpados.append(f"{nome}:{n}: {linha}")
    assert not culpados, "\n".join(culpados)


def test_o_nome_automatico_e_Aparelho_N():
    with open(os.path.join(FRONTEND, "virar-portao.js"), encoding="utf-8") as f:
        js = f.read()
    assert "'Aparelho ' + (" in js
    assert "'Portão ' + (" not in js
