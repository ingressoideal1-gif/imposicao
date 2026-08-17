# -*- coding: utf-8 -*-
"""A fonte que aparece na tela e a que sai no papel.

## O defeito, medido no pedido 19775 em 17/08/2026

Os dois modelos mostravam a fonte certa na janela e imprimiam outra. Rodando
`_embed_system_fonts` contra a numeracao real (`1000153`):

    TEXT   system:Arial|bold         -> embutiu arial.ttf   (a REGULAR, nao a bold)
    FIXED  system:Comic Sans MS      -> nao embutiu nada    -> Helvetica
    FIXED  system:Comic Sans MS|bold -> nao embutiu nada    -> Helvetica

## Por que a tela nao denuncia

Sao dois mundos diferentes resolvendo a mesma fonte. O navegador tem
`local('Comic Sans MS')` na cadeia do `@font-face`: se a fonte esta instalada no
Windows daquela maquina, a tela fica certa **sem tocar no catalogo**. O motor nao
tem esse recurso -- PyMuPDF so aceita BYTES -- e depende de achar a fonte no
catalogo pelo nome que o elemento carrega.

E os dois nomes nao sao o mesmo nome. O elemento guarda a FAMILIA, como o Windows
a chama: `Comic Sans MS`. O catalogo guarda as 222 fontes de sistema pelo nome do
ARQUIVO: `comic`, `comicbd`, `arial`, `arialbd`. Onde os dois coincidem (`arial`)
funcionava por sorte; onde nao coincidem, a fonte sumia calada.

O `|bold` era o segundo meio-caminho: ele era lido e descartado, entao
`Arial|bold` casava com `arial` e imprimia a regular, mesmo com `arialbd` no
catalogo ao lado.

## A ponte

O proprio Windows guarda a traducao familia -> arquivo no registro, e e essa a
mesma condicao que faz a tela funcionar: se a fonte esta instalada, a tela acerta
E a ponte existe. Se nao estiver, continua caindo em Helvetica com o alerta no
log, como antes -- este conserto nao piora nenhum caso.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app


# O que o registro do Windows devolve, ja normalizado: (familia, bold, italic).
INSTALADAS = {
    ("comic sans ms", False, False): "comic.ttf",
    ("comic sans ms", True, False): "comicbd.ttf",
    ("comic sans ms", False, True): "comici.ttf",
    ("comic sans ms", True, True): "comicz.ttf",
    ("arial", False, False): "arial.ttf",
    ("arial", True, False): "arialbd.ttf",
    ("arial", False, True): "ariali.ttf",
}


def test_o_nome_do_registro_vira_familia_e_estilo():
    assert app._familia_e_estilo_do_registro("Comic Sans MS (TrueType)") == ("comic sans ms", False, False)
    assert app._familia_e_estilo_do_registro("Comic Sans MS Bold (TrueType)") == ("comic sans ms", True, False)
    assert app._familia_e_estilo_do_registro("Arial Bold Italic (TrueType)") == ("arial", True, True)
    assert app._familia_e_estilo_do_registro("Arial Italic (TrueType)") == ("arial", False, True)


def test_familia_com_a_palavra_bold_no_nome_nao_e_confundida():
    """`Bold` so conta como estilo no FIM do nome. Ha familias que a tem no meio
    -- e trata-las como estilo apagaria a familia inteira."""
    assert app._familia_e_estilo_do_registro("Alfa Slab One (TrueType)") == ("alfa slab one", False, False)
    assert app._familia_e_estilo_do_registro("Bold Stencil (TrueType)") == ("bold stencil", False, False)


def test_comic_sans_ms_acha_o_arquivo_comic():
    """O caso que imprimiu errado no 19775."""
    assert app._chaves_de_fonte("Comic Sans MS", False, False, INSTALADAS)[:2] == \
        ["comic sans ms", "comic"]


def test_comic_sans_ms_bold_prefere_o_comicbd():
    chaves = app._chaves_de_fonte("Comic Sans MS", True, False, INSTALADAS)
    assert chaves[0] == "comicbd"


def test_arial_bold_prefere_o_arialbd_e_nao_a_regular():
    """O segundo defeito: `arial` existia no catalogo, entao o `|bold` era
    engolido e a numeracao saia na regular."""
    chaves = app._chaves_de_fonte("Arial", True, False, INSTALADAS)
    assert chaves[0] == "arialbd"
    assert "arial" in chaves, "a regular continua como reserva, e nao pode sumir"


def test_arial_sem_estilo_continua_como_era():
    assert app._chaves_de_fonte("Arial", False, False, INSTALADAS)[0] == "arial"


def test_negrito_e_italico_juntos_caem_para_uma_variacao_de_cada_vez():
    """Nem toda familia tem as quatro. Sem esta escada, `bold italic` numa
    familia que so tem bold voltaria para a regular -- perdendo os dois."""
    instaladas = dict(INSTALADAS)
    del instaladas[("comic sans ms", True, True)]
    chaves = app._chaves_de_fonte("Comic Sans MS", True, True, instaladas)
    assert chaves[0] == "comicbd"


def test_fonte_nao_instalada_nao_quebra_e_cai_no_que_ja_havia():
    """Sem a fonte no Windows daquela maquina nao ha ponte, e a resposta certa e
    a de antes: tenta o proprio nome no catalogo, e o log avisa."""
    assert app._chaves_de_fonte("Fonte Que Nao Existe", True, False, INSTALADAS) == \
        ["fonte que nao existe"]


def test_sem_registro_nenhum_o_comportamento_e_o_de_hoje():
    """Em maquina que nao e Windows -- o desenvolvimento, e o CI."""
    assert app._chaves_de_fonte("Arial", True, False, {}) == ["arial"]


def test_a_numeracao_real_do_19775_passa_a_embutir_as_tres():
    """O teste de ponta a ponta da funcao inteira, com o catalogo de verdade
    (nomes de arquivo) e os elementos como estao gravados no banco."""
    catalogo = [
        {"nome": "arial", "font_family": "arial",
         "arquivo_url": "https://exemplo/fontes/arial.ttf"},
        {"nome": "arialbd", "font_family": "arialbd",
         "arquivo_url": "https://exemplo/fontes/arialbd.ttf"},
        {"nome": "comic", "font_family": "comic",
         "arquivo_url": "https://exemplo/fontes/comic.ttf"},
        {"nome": "comicbd", "font_family": "comicbd",
         "arquivo_url": "https://exemplo/fontes/comicbd.ttf"},
    ]
    numeracao = {"elements": [
        {"type": "TEXT", "font_name": "system:Arial|bold"},
        {"type": "FIXED", "font_name": "system:Comic Sans MS"},
        {"type": "FIXED", "font_name": "system:Comic Sans MS|bold"},
    ]}

    baixados = []

    class _CacheFalso:
        @staticmethod
        def obter_bytes(url):
            baixados.append(url)
            return b"bytes-da-fonte"

    original_cache = app.font_cache_local
    original_catalogo = app.db.get_catalogo_fontes
    original_instaladas = app._fontes_instaladas
    try:
        app.font_cache_local = _CacheFalso
        app.db.get_catalogo_fontes = lambda: catalogo
        app._fontes_instaladas = lambda: INSTALADAS
        app._embed_system_fonts(numeracao)
    finally:
        app.font_cache_local = original_cache
        app.db.get_catalogo_fontes = original_catalogo
        app._fontes_instaladas = original_instaladas

    for el in numeracao["elements"]:
        assert el.get("_font_data"), f"{el['font_name']} ficou sem bytes -- sai Helvetica"

    assert baixados == [
        "https://exemplo/fontes/arialbd.ttf",
        "https://exemplo/fontes/comic.ttf",
        "https://exemplo/fontes/comicbd.ttf",
    ]
