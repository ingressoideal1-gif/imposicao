# -*- coding: utf-8 -*-
"""O cache dos arquivos do painel na Vercel (26/08/2026).

Pergunta do usuario: *"qual a participacao da vercel nos redesenhos e agilidade
da aplicacao?"*.

Quase nenhuma -- ela entrega os arquivos e nada mais; os redesenhos rodam no
navegador, os dados vem do Supabase, e na estacao quem serve o painel e o
proprio agente (32 ms contra 972 ms da nuvem, medidos naquele dia). Mas a parte
que era dela estava errada:

    style.css?v=731   ->  no-cache, no-store, must-revalidate
    script.js?v=731   ->  no-cache, no-store, must-revalidate

O `vercel.json` MANDAVA cachear JS e CSS por uma hora, e a regra generica
`/(.*)` vinha DEPOIS e sobrescrevia as duas -- quando duas regras casam, a de
baixo manda. Resultado: 1,9 MB baixados de novo a cada abertura do painel e a
cada F5, cerca de 1,4 segundo antes da primeira tela.

E era desperdicio puro, porque o cache ja e resolvido pelo `?v=NNN` que o
`publicar.ps1` bumpa em toda publicacao: versao nova, endereco novo, o navegador
busca. O `no-store` continua valendo para o HTML -- e ele que impede a estacao
de segurar um painel velho.
"""
import io
import json
import os
import re
import glob

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _regras():
    return json.loads(_ler("vercel.json"))["headers"]


def test_as_regras_de_js_e_css_vem_DEPOIS_da_generica():
    """A ordem E a regra: a de baixo manda."""
    fontes = [r["source"] for r in _regras()]
    generica = fontes.index("/(.*)")
    assert fontes.index("/(.*).js") > generica, (
        "a regra do JS voltou para antes da generica — ela seria sobrescrita, e "
        "o painel volta a baixar 1,6 MB a cada F5"
    )
    assert fontes.index("/(.*).css") > generica


def test_o_html_continua_sem_cache():
    """O `no-store` do HTML e o que impede a estacao de servir painel velho."""
    generica = next(r for r in _regras() if r["source"] == "/(.*)")
    valor = generica["headers"][-1]["value"]
    assert "no-store" in valor, (
        "o HTML passou a ser cacheado — a estacao pode segurar um painel antigo"
    )


def test_todo_asset_local_das_paginas_leva_o_carimbo_de_versao():
    """Sem `?v=NNN`, o cache de uma hora seguraria o arquivo depois de publicar.

    Com ele, o `publicar.ps1` bumpa junto e o endereco muda a cada versao. Foi
    o caso do `supabase-config.js` e do `pdf-lib.min.js`, que estavam sem.
    """
    faltando = {}
    for caminho in sorted(glob.glob(os.path.join(RAIZ, "frontend", "*.html"))):
        html = io.open(caminho, encoding="utf-8").read()
        refs = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', html)
        sem = [a for a in refs
               if (a.endswith(".js") or a.endswith(".css"))
               and not a.startswith("http")
               and "?v=" not in a]
        if sem:
            faltando[os.path.basename(caminho)] = sem

    assert not faltando, (
        "arquivo local sem ?v=NNN: " + json.dumps(faltando, ensure_ascii=False)
        + " — com o cache ligado, uma publicacao nao chega a quem ja abriu a pagina"
    )
