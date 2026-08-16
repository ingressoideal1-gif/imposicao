# -*- coding: utf-8 -*-
"""O aplicativo unico: as tres telas do cliente e do portao numa pagina so.

O que estes testes protegem: que a pagina ABRA SEM REDE (nenhum arquivo de
fora), que o roteador leve cada QR a tela certa, e que o endereco que ja circula
por WhatsApp continue valendo.
"""

import json
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")

# `app.html` entra aqui na Tarefa 3, quando nascer. A lista e explicita, e nao
# "todo html que existir", para que apagar uma tela por engano quebre o teste em
# vez de passar em silencio.
PAGINAS_DO_APLICATIVO = ("controle.html", "evento.html", "portaria.html")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_nenhuma_tela_do_aplicativo_carrega_arquivo_de_fora():
    """A regra que a portaria ja tinha, valendo para o aplicativo inteiro.

    Um `<script>` de outra origem que nao carrega derruba a pagina -- e cache
    nao salva, porque resposta de outra origem e opaca. Fora isso, buscar o
    codigo de autenticacao num terceiro significa que quem controlar aquele
    endereco controla o portao.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        externos = re.findall(
            r'<(?:script|link|img)[^>]+(?:src|href)=["\'](?:https?:)?//[^"\']+',
            html, flags=re.IGNORECASE)
        assert not externos, nome + " carrega arquivo de fora: " + str(externos)


def test_o_sdk_e_o_gerador_de_qr_sao_servidos_daqui():
    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        caminho = os.path.join(FRENTE, nome)
        assert os.path.exists(caminho), nome + " nao foi vendorizado"
        # Arquivo pequeno demais quase sempre e uma pagina de erro do CDN salva
        # com nome de script -- e ela "carrega" sem erro nenhum no navegador.
        assert os.path.getsize(caminho) > 3000, nome + " veio vazio ou truncado"


def test_a_estacao_sincroniza_os_arquivos_novos():
    """Sem isto, a estacao serve uma tela que referencia arquivo que ela nao
    tem -- e a pagina abre quebrada so na maquina da grafica."""
    import security_config

    for nome in ("supabase-js.min.js", "qrcode-generator.min.js"):
        assert nome in security_config.PAINEL_ARQUIVOS, nome


# ── O prefixo /ic/ ──────────────────────────────────────────────────────────

def test_nenhuma_pagina_pede_arquivo_por_caminho_absoluto():
    """Com barra na frente, o arquivo cai FORA do escopo /ic/ -- e portanto
    fora do alcance do service worker, sem o qual a portaria nao abre sem rede.

    Sem barra, o mesmo texto resolve certo nos dois lugares: /ic/ na Vercel e
    / na estacao, que serve os arquivos na raiz.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        absolutos = re.findall(
            r'<(?:script|link)[^>]+(?:src|href)="(/[^/][^"]*)"', html)
        assert not absolutos, nome + " pede por caminho absoluto: " + str(absolutos)


def test_a_vercel_serve_as_telas_sob_o_prefixo():
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        fontes = [r["source"] for r in conf.get("rewrites", [])]
        assert "/ic" in fontes, arquivo + " nao serve a casa em /ic"
        assert "/ic/:path*" in fontes, arquivo + " nao serve as telas sob /ic/"


def test_as_urls_antigas_continuam_valendo():
    """O QR do Pedido ja circula por WhatsApp, e o endereco do portao ja foi
    passado a porteiro. Nenhum dos dois volta atras."""
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        destino = {r["source"]: r["destination"] for r in conf.get("redirects", [])}
        for antiga in ("/evento.html", "/portaria.html", "/controle.html"):
            assert antiga in destino, arquivo + " perdeu " + antiga
            assert destino[antiga].startswith("/ic/"), arquivo + " " + antiga


def test_a_casa_do_aplicativo_e_a_lista_de_eventos():
    """`/ic/` abre o `controle.html`, que SEM `?evento=` ja e a lista "Seus
    eventos" e ja faz o login. Uma casa em pagina propria duplicaria os dois --
    e duplicata de login tranca o cliente para fora do evento dele.
    """
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        casa = [r["destination"] for r in conf["rewrites"] if r["source"] in ("/ic", "/ic/")]
        assert casa and all(c.endswith("controle.html") for c in casa), arquivo


def test_o_aparelho_de_portaria_vai_direto_para_o_portao():
    """O porteiro abre sem rede e sem conta.

    `controle.js` comeca perguntando a sessao ao Supabase, que e ida a rede. A
    pergunta do token de aparelho vem ANTES -- senao o portao passa a depender
    de rede, que e a unica coisa que ele nao pode fazer.
    """
    js = _ler("frontend/controle.js")
    assert "ideal_portaria_token" in js, "a casa nao olha se o aparelho e de portaria"

    # Dentro do `abrir()`, e nao no arquivo inteiro: `AcessoConta.sessao`
    # aparece tambem no tratamento do login, antes daqui, e comparar a primeira
    # ocorrencia de cada um mediria duas coisas sem relacao.
    corpo = js[js.index("function abrir()"):]
    corpo = corpo[:corpo.index("AcessoConta.sessao")]
    assert "ehAparelhoDePortaria" in corpo, (
        "o arranque pergunta a sessao (ida a rede) antes de olhar o token do "
        "aparelho -- assim o portao passa a depender de rede"
    )


def test_o_qr_de_fora_e_recusado():
    """Um QR qualquer de rua nao pode abrir fluxo nenhum com dado estranho
    dentro."""
    js = _ler("frontend/ler-qr.js")
    assert "location.origin" in js
    assert "não é do Ideal Control" in js


def test_ler_um_QR_nao_exige_conta():
    """Pedir login ao porteiro seria travar o portao numa credencial que
    ninguem lhe deu. O botao mora FORA do bloco de login."""
    html = _ler("frontend/controle.html")
    assert 'id="btn-ler-qr"' in html
    inicio_login = html.index('id="bloco-entrar"')
    fim_login = html.index('id="lista-eventos"')
    assert not (inicio_login < html.index('id="btn-ler-qr"') < fim_login), (
        "o botao de ler QR esta dentro do bloco de login"
    )


def test_os_dois_construtores_apontam_para_o_prefixo():
    """`puro.ts`, e nao `index.ts`: a montagem da URL mora no modulo puro da
    Edge Function, que e o que tem teste proprio em Deno."""
    assert "/ic/evento.html?t=" in _ler("acesso_api.py")
    assert "/ic/evento.html?t=" in _ler("supabase/functions/acesso-pedido/puro.ts")
    assert "/ic/portaria.html?e=" in _ler("frontend/controle.js")
