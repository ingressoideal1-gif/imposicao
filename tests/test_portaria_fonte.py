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
    """Nao so `<script src>`: um `<link rel=stylesheet>`, um `@import` ou um
    `<img>` de CDN fazem a tela nao abrir sem rede -- que e a unica razao de
    ela existir -- e ainda esbarram na CSP. Achado em revisao de codigo,
    15/08/2026: a guarda so olhava `<script src>`."""
    html = _texto("portaria.html")
    externos = re.findall(
        r'<(?:script|link|img)[^>]+(?:src|href)=["\'](https?:)?//[^"\']+',
        html, flags=re.IGNORECASE)
    externos += re.findall(
        r'@import\s+(?:url\()?["\']?(https?:)?//[^"\';)]+',
        html, flags=re.IGNORECASE)
    assert not externos, f"a portaria carrega arquivo de fora: {externos}"


def test_a_recusa_nao_oferece_escape():
    """Decisao do usuario, 15/08/2026: recusa e recusa. Quem for recusado
    procura o dono do evento.

    Le tambem `portaria-validacao.js`: e la que a decisao de deixar entrar
    realmente mora (achado em revisao de codigo, 15/08/2026 -- a guarda
    original nao lia esse arquivo)."""
    junto = _texto("portaria.html") + _texto("portaria.js") + _texto("portaria-validacao.js")
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


def test_o_service_worker_e_network_first_so_para_a_navegacao():
    """Achado em revisao de codigo, 15/08/2026 (I3). O sw.js e byte-identico
    entre releases -- a versao vem de `self.location`, nunca do proprio
    texto do arquivo -- entao o navegador NUNCA detecta 'o sw.js mudou' e
    nunca reinstala este service worker sozinho. Sem network-first na
    navegacao, um aparelho pareado num release antigo fica preso na PAGINA
    antiga para sempre, mesmo com o servidor ja publicado. Os outros
    arquivos (JS) continuam cache-first -- isso quem confere e
    `test_o_service_worker_so_guarda_arquivos_da_portaria` continuando verde
    e o teste de deposito/validacao/tela que nao usam SW nenhum."""
    sw = _texto("sw.js")
    assert "e.request.mode === 'navigate'" in sw, (
        "o fetch do sw.js nao distingue navegacao do resto -- sem isso a "
        "pagina fica presa em cache para sempre, mesmo depois de publicar"
    )
    # Dentro do ramo de navegacao, a REDE decide primeiro -- o cache e so o
    # catch de quando ela falha. `.split` isola o trecho do addEventListener
    # que trata a navegacao para nao confundir com o `fetch(e.request)` do
    # ramo cache-first, mais abaixo no arquivo.
    navegacao = sw.split("e.request.mode === 'navigate'", 1)[1][:700]
    assert "fetch(e.request)" in navegacao and ".catch(" in navegacao, (
        "a navegacao nao esta tentando a rede antes do cache"
    )


def test_o_comentario_do_service_worker_nao_promete_auto_atualizacao_que_nao_existe():
    """O comentario antigo afirmava que publicar troca o service worker
    sozinho, o que e falso: bytes identicos entre releases nunca disparam
    reinstalacao. Um comentario que promete o oposto do que o codigo faz e
    pior que nenhum comentario."""
    sw = _texto("sw.js")
    assert "publicar troca o cache sozinho" not in sw.lower()
    assert "nao existe o" not in sw.lower() or "que assombra service worker" not in sw.lower()


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
