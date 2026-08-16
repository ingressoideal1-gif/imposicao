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


def test_a_estacao_sincroniza_tudo_o_que_as_telas_pedem():
    """Sem isto, a estacao serve uma tela que referencia arquivo que ela nao
    tem -- e a pagina abre quebrada SO na maquina da grafica, que e o pior
    lugar para descobrir.

    A lista sai da propria tela, e nao escrita a mao: assim, acrescentar um
    `<script>` ao `controle.html` e esquecer o `PAINEL_ARQUIVOS` quebra o teste
    em vez de quebrar a estacao.
    """
    import security_config

    for pagina in ("controle.html", "evento.html"):
        html = _ler("frontend/" + pagina)
        pedidos = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"?]+)', html)
        for pedido in pedidos:
            if pedido.endswith(".js") or pedido.endswith(".css"):
                assert pedido in security_config.PAINEL_ARQUIVOS, (
                    pagina + " pede " + pedido + ", que a estacao nao sincroniza"
                )


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


def test_a_camera_entrega_a_leitura_a_quem_a_ligou():
    """Duas telas leem QR agora: a portaria e a casa.

    Enquanto a camera chamasse a portaria pelo NOME, ler um QR na casa
    quebraria -- `window.portaria` nao existe la. E escrever um segundo leitor
    faria o novo herdar os defeitos que o primeiro ja corrigiu.
    """
    js = _ler("frontend/portaria-camera.js")
    assert "window.portaria.validarTexto" not in js, (
        "a camera ainda chama a portaria pelo nome"
    )
    assert "function ligar(aoLer" in js


def test_quem_liga_a_camera_diz_o_que_fazer_com_a_leitura():
    for arquivo in ("frontend/portaria.js", "frontend/ler-qr.js"):
        js = _ler(arquivo)
        assert re.search(r"portariaCamera\.ligar\(\s*\w|portariaCamera\.ligar\(function", js), (
            arquivo + " liga a camera sem dizer o que fazer com a leitura"
        )


# ── Instalar ────────────────────────────────────────────────────────────────

def test_o_manifesto_tem_o_escopo_do_prefixo():
    """Escopo `/` capturaria index.html e producao.html -- as telas da grafica
    -- dentro do aplicativo do cliente."""
    m = json.loads(_ler("frontend/app.webmanifest"))
    assert m["scope"] == "/ic/"
    assert m["start_url"] == "/ic/"
    assert m["display"] == "standalone"
    assert m["theme_color"] == "#0a0f1e"


def test_o_manifesto_aponta_para_icones_que_existem():
    """Os `src` do manifesto resolvem contra a URL DELE, que fica em
    `/ic/app.webmanifest` -- entao relativos caem em `/ic/icones/…`, dentro do
    escopo."""
    for icone in json.loads(_ler("frontend/app.webmanifest"))["icons"]:
        assert not icone["src"].startswith("/"), icone["src"] + " e absoluto"
        assert os.path.exists(os.path.join(FRENTE, icone["src"])), icone["src"]


def test_as_telas_declaram_o_manifesto_do_aplicativo():
    """Instalar so e oferecido de uma pagina DENTRO do escopo que declara o
    manifesto. Sem ele na tela do dono -- que e a casa -- nao ha de onde
    instalar."""
    for nome in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + nome)
        assert 'href="app.webmanifest"' in html, nome + " nao declara o manifesto"


def test_o_pre_cache_cobre_as_tres_telas():
    """A portaria abria sem rede porque o service worker guardava os arquivos
    DELA. Agora sao tres telas no mesmo aplicativo."""
    sw = _ler("frontend/sw.js")
    for arquivo in ("controle.html", "evento.html", "portaria.html",
                    "supabase-js.min.js", "ler-qr.js"):
        assert arquivo in sw, arquivo + " ficou fora do pre-cache"


def test_o_pre_cache_e_relativo():
    """O service worker e servido de `/ic/sw.js`. Caminho absoluto guardaria
    `/portaria.js`, que ninguem pede -- as paginas pedem `/ic/portaria.js`."""
    sw = _ler("frontend/sw.js")
    lista = sw[sw.index("const ARQUIVOS"):sw.index("];", sw.index("const ARQUIVOS"))]
    assert "'/" not in lista, "o pre-cache tem caminho absoluto"


def test_o_service_worker_continua_sem_guardar_api():
    sw = _ler("frontend/sw.js")
    assert "self.location.origin" in sw
    assert sw.count("ignoreSearch") == 1, (
        "casamento exato nos subrecursos; ignorar a query prende o aparelho no "
        "codigo da geracao em que instalou"
    )


def test_as_tres_telas_registram_o_service_worker():
    """O Chrome so oferece "Instalar aplicativo" numa pagina que TENHA service
    worker registrado.

    Enquanto so o portaria.html registrava, a casa -- que e o que `/ic/` abre --
    nunca ofereceria instalar, e o convite ficaria pendurado num evento que
    jamais dispararia.
    """
    for nome in PAGINAS_DO_APLICATIVO:
        assert "sw-registro.js" in _ler("frontend/" + nome), nome


def test_o_registro_do_service_worker_e_um_so():
    """Uma copia por pagina divergiria, e divergencia aqui e do tipo calado: a
    tela que ficasse para tras pararia de abrir sem rede, e ninguem descobre
    isso antes do portao."""
    donos = []
    for nome in os.listdir(FRENTE):
        if nome.endswith(".html") and "serviceWorker.register" in _ler("frontend/" + nome):
            donos.append(nome)
    assert donos == [], "ha registro de service worker escrito dentro de HTML: " + str(donos)


def test_o_convite_para_instalar_so_aparece_onde_cabe():
    """Botao morto e pior que botao nenhum -- e no iPhone nao existe evento de
    instalacao, so instrucao."""
    js = _ler("frontend/instalar.js")
    assert "beforeinstallprompt" in js
    assert "display-mode: standalone" in js, (
        "o convite continuaria aparecendo depois de instalado"
    )
    assert "Compartilhar" in js, "falta o caminho do iPhone"


def test_os_dois_construtores_apontam_para_o_prefixo():
    """`puro.ts`, e nao `index.ts`: a montagem da URL mora no modulo puro da
    Edge Function, que e o que tem teste proprio em Deno."""
    assert "/ic/evento.html?t=" in _ler("acesso_api.py")
    assert "/ic/evento.html?t=" in _ler("supabase/functions/acesso-pedido/puro.ts")
    assert "/ic/portaria.html?e=" in _ler("frontend/controle.js")
