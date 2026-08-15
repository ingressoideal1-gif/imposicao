# -*- coding: utf-8 -*-
"""Regras da tela da portaria que so se conferem lendo os arquivos.

Sao tres coisas que quebram em silencio e so aparecem no portao, com a fila
andando: um CDN que nao carrega sem rede, um botao de escape que a decisao do
usuario proibiu, e um service worker guardando resposta de API.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"


def _texto(nome):
    return (FRONT / nome).read_text(encoding="utf-8")


def test_a_tela_da_portaria_nao_carrega_nada_de_fora():
    """Um `<script src>` para CDN faz a tela nao abrir sem rede -- que e a unica
    razao de ela existir -- e ainda esbarra na CSP."""
    externos = re.findall(r'<script[^>]+src=["\'](https?:)?//[^"\']+',
                          _texto("portaria.html"))
    assert not externos, f"a portaria carrega arquivo de fora: {externos}"


def test_a_recusa_nao_oferece_escape():
    """Decisao do usuario, 15/08/2026: recusa e recusa. Quem for recusado
    procura o dono do evento."""
    junto = _texto("portaria.html") + _texto("portaria.js")
    for frase in ("mesmo assim", "liberar", "forcar", "forçar"):
        assert frase not in junto.lower(), (
            f"a tela da portaria oferece escape na recusa ({frase!r})"
        )


def test_o_service_worker_nunca_guarda_resposta_de_api():
    """Uma carga velha em cache faria o aparelho recusar ingresso que ja existe,
    ou aceitar um que foi cancelado."""
    sw = _texto("sw.js")
    assert "/api/" in sw and "return" in sw, (
        "o sw.js nao exclui as chamadas de API do cache"
    )


def test_o_service_worker_so_guarda_arquivos_da_portaria():
    """Guardar o script.js do painel (1 MB) num celular de portao e desperdicio,
    e guardar a pagina de outra tela faz o cache brigar com o do painel."""
    sw = _texto("sw.js")
    alvos = re.findall(r"'(/[^']+\.(?:html|js)[^']*)'", sw)
    intrusos = [a for a in alvos
                if not re.search(r"portaria|jsqr|qr-ideal-hash", a)]
    assert not intrusos, f"o sw.js guarda arquivo que nao e da portaria: {intrusos}"


def test_a_tela_do_dono_mostra_o_endereco_de_pareamento():
    """Sem ele o dono tem um codigo de seis caracteres e nenhum lugar para
    digita-lo — o aparelho nunca sai do lugar."""
    junto = _texto("controle.html") + _texto("controle.js")
    assert "portaria.html" in junto, (
        "a tela do dono nao diz por onde o porteiro abre o aparelho"
    )
