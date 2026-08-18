# -*- coding: utf-8 -*-
"""O aplicativo unico: as duas telas do cliente e do portao numa pagina so.

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
#
# `evento.html` saiu em 17/08/2026: era a tela do QR do Pedido, e o cliente
# passou a carregar o pedido pela conta dele, dentro do proprio controle.html.
PAGINAS_DO_APLICATIVO = ("controle.html", "portaria.html")


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

    for pagina in ("controle.html",):
        html = _ler("frontend/" + pagina)
        pedidos = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"?]+)', html)
        for pedido in pedidos:
            if pedido.endswith(".js") or pedido.endswith(".css"):
                assert pedido in security_config.PAINEL_ARQUIVOS, (
                    pagina + " pede " + pedido + ", que a estacao nao sincroniza"
                )


def test_o_service_worker_guarda_tudo_o_que_as_telas_pedem():
    """O mesmo defeito da estacao, com outra roupa -- e pior, porque so aparece
    SEM REDE.

    O `install` guarda uma lista escrita a mao. Arquivo que as telas pedem e
    que nao esta nela nunca entra no cache: com sinal ninguem percebe (a busca
    cai na rede), e no portao, no modo aviao, o script simplesmente nao carrega
    -- sem erro visivel, so um botao que nao faz nada.

    Foi assim que `aparelho.js` e `sw-registro.js` ficaram de fora ate
    16/08/2026. Por isso a lista sai da propria tela, e nao da leitura do sw.js.
    """
    sw = _ler("frontend/sw.js")
    guardados = set(re.findall(r"'([^']+?)(?:\?v=' \+ VERSAO|')", sw))
    for pagina in PAGINAS_DO_APLICATIVO:
        html = _ler("frontend/" + pagina)
        pedidos = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"?]+)', html)
        for pedido in pedidos:
            if not (pedido.endswith(".js") or pedido.endswith(".css")):
                continue
            assert pedido in guardados, (
                pagina + " pede " + pedido + ", que o service worker nao guarda"
                " -- a tela abre sem rede com esse arquivo faltando"
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
    """O endereco do portao ja foi passado a porteiro, e o da casa ja circula.
    Nenhum dos dois volta atras.

    `/evento.html` saiu desta lista em 17/08/2026 junto com a tela: o arquivo
    nao existe mais nem sob `/ic/`, entao manter o redirect so levaria a uma
    pagina que nao esta la.
    """
    for arquivo in ("vercel.json", "frontend/vercel.json"):
        conf = json.loads(_ler(arquivo))
        destino = {r["source"]: r["destination"] for r in conf.get("redirects", [])}
        for antiga in ("/portaria.html", "/controle.html"):
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


def test_o_aparelho_de_portaria_ve_o_portao_dele_sem_rede():
    """O porteiro abre sem rede e sem conta.

    Ate 16/08/2026 a casa DESVIAVA sozinha para a leitura quando achava um
    token de aparelho guardado. O desvio saiu de proposito: um celular so
    servia a um evento, e da leitura nao havia como voltar. A casa agora abre
    sempre na lista, e um toque na barra do evento e que leva ao portao.

    O que continua valendo, e e o que este teste guarda, e a ORDEM. Perguntar a
    sessao ao Supabase e ida a rede; a lista do chaveiro e sincrona e nao falha.
    Se a rede vier primeiro, o portao passa a depender dela -- a unica coisa que
    ele nao pode fazer.
    """
    js = _ler("frontend/lista-eventos.js")

    # Dentro do `arrancar()`, e nao no arquivo inteiro: `chaveiro.listar` e
    # `AcessoConta.sessao` aparecem tambem no `carregar()`, e comparar a
    # primeira ocorrencia de cada um no arquivo mediria duas coisas sem relacao.
    corpo = js[js.index("function arrancar()"):]
    corpo = corpo[:corpo.index("AcessoConta.sessao")]
    assert "chaveiro.migrar" in corpo, (
        "o arranque pergunta a sessao (ida a rede) antes de converter a "
        "instalacao antiga -- o portao que ja trabalha acordaria sem o evento"
    )

    # E a lista sai com o que houver, sem esperar o servidor: o `desenhar` do
    # chaveiro acontece ANTES de a resposta da conta chegar.
    carregar = js[js.index("function carregar("):]
    assert carregar.index("desenhar(") < carregar.index("AcessoConta.pedir"), (
        "a lista espera a rede para aparecer -- um 4G ruim deixaria o porteiro "
        "sem lista nenhuma"
    )


def test_a_barra_do_topo_nao_exige_conta_para_estar_na_tela():
    """Pedir login ao porteiro seria travar o portao numa credencial que
    ninguem lhe deu. A barra mora FORA do bloco de login, e ACIMA dele.

    Desde 16/08/2026 o wrapper da lista chama-se `#lista` (era
    `#lista-eventos`), e `#bloco-entrar` desceu para depois dela: quem abre o
    aplicativo ve primeiro os eventos que ESTE aparelho ja le, e o login e o
    ultimo recurso de quem nao tem nenhum. Por isso o teste compara posicoes em
    vez de procurar o botao dentro de uma faixa -- a faixa mudou de lugar, a
    regra nao.

    Em 17/08/2026 a barra deixou de ser "Novo Evento" (a camera do QR) e virou
    "Meus Pedidos". O que ela abre agora PEDE conta -- e por isso a tela de
    entrar aparece por cima quando nao ha sessao --, mas o LUGAR dela na pagina
    nao muda: a tela inicial inteira continua acima do login, porque o porteiro
    precisa chegar na lista dos eventos deste aparelho sem passar por ele.
    """
    html = _ler("frontend/controle.html")
    assert 'id="btn-meus-pedidos"' in html
    assert 'id="lista"' in html, "o wrapper da lista sumiu da tela"

    botao = html.index('id="btn-meus-pedidos"')
    login = html.index('id="bloco-entrar"')
    fim_login = html.index("</div>", login)
    assert not (login < botao < fim_login), (
        "a barra do topo esta dentro do bloco de login"
    )
    assert botao < login, (
        "a barra do topo esta abaixo do login -- o porteiro rolaria a tela "
        "passando por um formulario que nao e para ele"
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
    # So a portaria liga a camera desde 17/08/2026: a casa perdeu a dela junto
    # com o QR do Pedido, e o `ler-qr.js` que a lia saiu do disco na mesma
    # limpeza.
    for arquivo in ("frontend/portaria.js",):
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


def test_o_pre_cache_cobre_as_duas_telas():
    """A portaria abria sem rede porque o service worker guardava os arquivos
    DELA. Agora sao duas telas no mesmo aplicativo."""
    sw = _ler("frontend/sw.js")
    for arquivo in ("controle.html", "portaria.html",
                    "supabase-js.min.js", "meus-pedidos.js"):
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


def test_as_duas_telas_registram_o_service_worker():
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


# O convite de instalar do `instalar.js` saiu em 17/08/2026 junto com o
# `evento.html` -- era a unica tela que o carregava. O que cobre o convite de
# instalar hoje, nas duas telas que restam, e o `parede-pwa.js`; a cobertura
# dele mora em `tests/test_parede_pwa.py`.


def test_os_dois_construtores_apontam_para_o_prefixo():
    """`puro.ts`, e nao `index.ts`: a montagem da URL mora no modulo puro da
    Edge Function, que e o que tem teste proprio em Deno."""
    assert "/ic/evento.html?t=" in _ler("acesso_api.py")
    assert "/ic/evento.html?t=" in _ler("supabase/functions/acesso-pedido/puro.ts")
    # O terceiro construtor era o `enderecoDaPortaria()` do `controle.js`, que
    # montava o endereco de pareamento para o dono passar ao porteiro. Ele saiu
    # em 16/08/2026 junto com o codigo de seis caracteres: nao ha mais endereco
    # para passar, porque quem vira portao e o proprio celular que o dono tem na
    # mao. O `virar-portao.js` navega para `portaria.html` por caminho relativo,
    # que ja resolve dentro do `/ic/` sem construtor nenhum.


def test_o_qr_do_pedido_saiu_da_tela_e_o_servidor_ficou_um_release():
    """Decisao de 17/08/2026: tela e botao saem agora; as funcoes ficam um
    release sem chamador, como rede de volta."""
    assert not os.path.exists(os.path.join(RAIZ, "frontend", "evento.html"))
    assert not os.path.exists(os.path.join(RAIZ, "frontend", "ler-qr.js"))
    script = _ler("frontend/script.js")
    assert "gerarQrDoEvento" not in script
    assert "QR do Evento" not in script
    assert "acesso-pedido" not in script, "nenhuma tela chama mais o acesso-pedido"
    # o servidor fica: apagar e o release seguinte
    assert os.path.isdir(os.path.join(RAIZ, "supabase", "functions", "acesso-evento"))
    assert os.path.isdir(os.path.join(RAIZ, "supabase", "functions", "acesso-pedido"))
    vercel = _ler("vercel.json")
    assert '"/evento.html"' not in vercel


# ── A identidade visual (18/08/2026) ────────────────────────────────────────
#
# A fonte do aplicativo e LOCAL: um `@font-face` apontando para o Google Fonts
# passaria pela guarda de `<script|link|img>` acima e ainda assim derrubaria a
# letra sem rede -- e o `font-display: swap` esconderia a falha, com a tela
# abrindo na letra do sistema como se nada tivesse acontecido.

def test_a_fonte_do_aplicativo_e_local_e_vai_no_pre_cache():
    assert os.path.isfile(os.path.join(FRENTE, "ideal-control.woff2")), (
        "a fonte da identidade visual sumiu de frontend/"
    )
    css = _ler("frontend/controle.css")
    portaria = _ler("frontend/portaria.html")
    for texto, onde in ((css, "controle.css"), (portaria, "portaria.html")):
        assert "@font-face" in texto, f"{onde} nao declara a fonte"
        assert "url(ideal-control.woff2)" in texto, f"{onde} nao aponta para a fonte local"
        assert "googleapis" not in texto and "gstatic" not in texto, (
            f"{onde} busca fonte de fora: a tela nao abriria sem rede"
        )
    # Sem rede, o service worker e quem entrega a fonte.
    assert "'ideal-control.woff2'" in _ler("frontend/sw.js")
    # E a estacao da grafica a recebe junto com o resto do painel.
    import security_config
    assert "ideal-control.woff2" in security_config.PAINEL_ARQUIVOS
