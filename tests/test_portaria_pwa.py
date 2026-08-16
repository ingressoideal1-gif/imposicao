# -*- coding: utf-8 -*-
"""A portaria como aplicativo instalado no celular do porteiro.

O que estes testes protegem: que o aparelho INSTALE (manifesto e icones
validos), que ele ABRA SEM REDE depois de instalado, e que uma publicacao nova
chegue ao aparelho em vez de ficar presa na versao do dia da instalacao.
"""

import json
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Icones ──────────────────────────────────────────────────────────────────

ICONES_ESPERADOS = [
    ("frontend/icones/portaria-192.png", 192),
    ("frontend/icones/portaria-512.png", 512),
    ("frontend/icones/portaria-192-maskable.png", 192),
    ("frontend/icones/portaria-512-maskable.png", 512),
    ("frontend/apple-touch-icon.png", 180),
]


@pytest.mark.parametrize("caminho,lado", ICONES_ESPERADOS)
def test_o_icone_existe_e_e_quadrado(caminho, lado):
    from PIL import Image

    completo = os.path.join(RAIZ, caminho)
    assert os.path.exists(completo), (
        caminho + " nao existe. Rode: .\\venv\\Scripts\\python.exe "
        "ferramentas\\gerar_icones_pwa.py"
    )
    with Image.open(completo) as im:
        assert im.size == (lado, lado), f"{caminho} deveria ser {lado}x{lado}"


@pytest.mark.parametrize("caminho,_lado", ICONES_ESPERADOS)
def test_o_icone_e_opaco(caminho, _lado):
    """Sem canal alfa, de proposito.

    Um "maskable" com fundo transparente aparece como marca solta e cortada
    dentro da mascara do Android; o icone do iPhone com transparencia e
    composto sobre PRETO, e a marca escura some.
    """
    from PIL import Image

    with Image.open(os.path.join(RAIZ, caminho)) as im:
        assert im.mode == "RGB", f"{caminho} deveria ser opaco (RGB), veio {im.mode}"


# ── Manifesto ───────────────────────────────────────────────────────────────

def _manifesto():
    return json.loads(_ler("frontend/portaria.webmanifest"))


def test_o_manifesto_e_json_valido_com_os_campos_que_o_chrome_exige():
    m = _manifesto()
    assert m["name"]
    assert m["short_name"]
    assert m["start_url"] == "/portaria.html"
    assert m["display"] == "standalone"
    assert m["icons"]


def test_o_escopo_e_so_a_portaria():
    """Escopo largo capturaria producao.html, controle.html e evento.html.

    O service worker ja e registrado com `scope: '/portaria.html'` pelo mesmo
    motivo. Um manifesto com escopo '/' faria o aplicativo instalado abrir a
    tela da GRAFICA quando o porteiro tocasse num link do painel.
    """
    m = _manifesto()
    assert m["scope"] == "/portaria.html"
    assert m["start_url"].startswith(m["scope"])


def test_o_manifesto_aponta_para_icones_que_existem():
    for icone in _manifesto()["icons"]:
        caminho = os.path.join(RAIZ, "frontend", icone["src"].lstrip("/"))
        assert os.path.exists(caminho), icone["src"] + " nao existe"


def test_ha_icone_maskable_nos_dois_tamanhos():
    """Sem `purpose: maskable` o Android desenha o icone dentro de um quadrado
    branco com sombra -- feio e, pior, sem a marca ocupando o espaco."""
    mascaraveis = [i for i in _manifesto()["icons"] if "maskable" in i.get("purpose", "")]
    assert {i["sizes"] for i in mascaraveis} == {"192x192", "512x512"}


def test_as_tres_cores_sao_a_mesma():
    """theme_color, background_color e o --bg da pagina.

    Diferentes, a tela de abertura pisca de uma cor para outra na frente do
    porteiro toda vez que o aplicativo abre.
    """
    m = _manifesto()
    assert m["theme_color"] == "#0a0f1e"
    assert m["background_color"] == "#0a0f1e"
    assert 'content="#0a0f1e"' in _ler("frontend/portaria.html")


# ── Cabeca da pagina ────────────────────────────────────────────────────────

def test_a_pagina_declara_o_manifesto():
    texto = _ler("frontend/portaria.html")
    assert 'rel="manifest"' in texto
    assert "portaria.webmanifest" in texto


def test_o_manifesto_nao_leva_versao_na_url():
    """O publicar.ps1 so renumera `.js?v=` e `.css?v=`.

    Um `portaria.webmanifest?v=605` ficaria congelado no 605 para sempre, e o
    aparelho instalado nunca veria icone novo.
    """
    assert "portaria.webmanifest?v=" not in _ler("frontend/portaria.html")


def test_a_pagina_tem_as_metas_do_iphone():
    """O iOS ignora o manifesto: ele so obedece a estas tres metas."""
    texto = _ler("frontend/portaria.html")
    assert 'rel="apple-touch-icon"' in texto
    assert 'name="apple-mobile-web-app-capable"' in texto
    assert 'name="apple-mobile-web-app-title"' in texto


def test_a_vercel_serve_o_manifesto_com_o_tipo_certo():
    """Servido como text/plain, o Chrome ignora o manifesto em silencio."""
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        regras = [h for h in conf["headers"] if "webmanifest" in h["source"]]
        assert regras, arquivo + " nao declara o tipo do manifesto"
        tipos = [c["value"] for r in regras for c in r["headers"]
                 if c["key"].lower() == "content-type"]
        assert tipos == ["application/manifest+json"], arquivo


# ── O evento sobrevive ao start_url sem querystring ─────────────────────────

def test_o_evento_e_lembrado_fora_da_url():
    """O `start_url` do manifesto nao leva `?e=`.

    Quem instalar o aplicativo ANTES de parear abriria o icone e mandaria
    `evento_id: ''` ao servidor.
    """
    js = _ler("frontend/portaria.js")
    assert "ideal_portaria_evento" in js
    assert "CHAVE_EVENTO" in js


# ── Service worker ──────────────────────────────────────────────────────────

def test_o_pre_cache_inclui_o_manifesto_e_os_icones():
    sw = _ler("frontend/sw.js")
    assert "/portaria.webmanifest" in sw
    assert "/icones/portaria-192.png" in sw
    assert "/icones/portaria-512.png" in sw
    assert "/apple-touch-icon.png" in sw


def test_o_service_worker_ignora_outra_origem():
    """A API vive em outro dominio (Edge Function do Supabase).

    Sem esta saida, cada leitura de ingresso passa por uma consulta ao cache
    antes de ir a rede -- e um nome que colida um dia devolveria resposta velha
    a uma pergunta de controle de acesso.
    """
    assert "self.location.origin" in _ler("frontend/sw.js")


def test_o_ignoreSearch_so_vale_para_a_navegacao():
    """Com ignoreSearch nos subrecursos, um pedido de `portaria.js?v=608` casa
    com o `?v=607` guardado, e o aparelho instalado fica preso no codigo do dia
    em que instalou."""
    assert _ler("frontend/sw.js").count("ignoreSearch") == 1


def test_o_pre_cache_e_o_html_pedem_a_mesma_versao():
    """O `publicar.ps1` renumera os dois no mesmo passo; se um dia deixarem de
    combinar, a instalacao guarda um arquivo que a pagina nunca pede."""
    import re

    versoes = set(re.findall(r"\.js\?v=(\d+)", _ler("frontend/portaria.html")))
    assert len(versoes) == 1, f"portaria.html tem versoes misturadas: {sorted(versoes)}"


# ── Aviso de atualizacao ────────────────────────────────────────────────────

def test_a_tela_avisa_quando_ha_versao_nova():
    """Instalado, o aplicativo nao tem barra de endereco: sem este aviso o
    porteiro nao tem como recarregar."""
    html = _ler("frontend/portaria.html")
    assert 'id="faixa-atualizacao"' in html
    assert "updatefound" in html


def test_a_atualizacao_nunca_recarrega_sozinha():
    """Recarregar no meio de uma leitura assusta quem esta com a fila andando
    na frente -- e pode ser justo quando a camera acabou de abrir."""
    html = _ler("frontend/portaria.html")
    assert "location.reload" in html
    trecho = html[html.index("faixa-atualizacao"):]
    assert "addEventListener('click'" in trecho or "onclick" in trecho


def test_o_aviso_nao_aparece_na_primeira_instalacao():
    """`navigator.serviceWorker.controller` existir e o que separa ATUALIZACAO
    de PRIMEIRA instalacao. Sem esse teste, a faixa apareceria na estreia,
    oferecendo recarregar uma pagina que acabou de carregar."""
    assert "navigator.serviceWorker.controller" in _ler("frontend/portaria.html")
