# -*- coding: utf-8 -*-
"""O painel que a estacao serve: o que sincroniza, o que o navegador cacheia e o
que a estacao reporta.

Toda esta suite nasceu de um incidente so. Em 12/08/2026 uma estacao da grafica
rodava o agente 1.2.36 — o mais novo — e mesmo assim o operador marcava "Refazer
Celula", a previa nao mudava e digitar as posicoes nao respondia. Esse e, nos
detalhes, o comportamento da v528 do painel: nove releases atras. O executavel
estava certo; velha estava a tela que ele servia.

Os tres buracos que permitiram isso estao cobertos aqui:

  1. arquivo que o HTML carrega mas a sincronizacao nao baixa (`amostra-modal.js`
     dava 404 em toda estacao, `csv-editor.js` estava tres releases atras);
  2. HTML servido sem `Cache-Control`, entao o navegador da estacao segurava o
     `index.html` antigo — e com ele o `?v=NNN` antigo — por tempo indefinido;
  3. nenhuma telemetria da versao do painel, entao a divergencia so aparecia
     quando o operador reclamava.
"""

import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import security_config


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")

# As tres paginas que a estacao serve ao operador.
PAGINAS = ["index.html", "producao.html", "cliente.html"]


def _assets_locais(caminho_html):
    """Todo .js e .css do proprio projeto que a pagina carrega.

    CDN e data: ficam de fora — quem os serve nao e a estacao.
    """
    with open(caminho_html, encoding="utf-8", errors="replace") as f:
        html = f.read()
    achados = set()
    for _attr, valor in re.findall(r'(src|href)="([^"]+)"', html):
        if valor.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
            continue
        limpo = valor.split("?")[0].lstrip("/")
        if limpo.endswith((".js", ".css")):
            achados.add(limpo)
    return achados


# ─── 1. O que a pagina carrega, a estacao tem de sincronizar ──────────────────

def test_todo_arquivo_que_o_painel_carrega_esta_na_lista_de_sincronismo():
    """A regra que faltava: HTML e lista de sincronismo andam juntos.

    Um arquivo fora da PAINEL_ARQUIVOS nunca se atualiza na estacao — o
    `_semear_painel` so o copia quando ele nao existe, e o `sincronizar_painel`
    nao o baixa. Se ele nasceu depois do build do agente, da 404; se mudou
    depois, fica congelado. Nos dois casos o operador ve uma tela que o
    desenvolvedor nunca viu.
    """
    faltando = {}
    for pagina in PAGINAS:
        for asset in _assets_locais(os.path.join(FRONTEND, pagina)):
            if asset not in security_config.PAINEL_ARQUIVOS:
                faltando.setdefault(asset, []).append(pagina)

    assert not faltando, (
        "arquivo(s) carregados pelo painel e ausentes de PAINEL_ARQUIVOS: "
        + "; ".join(f"{a} (em {', '.join(p)})" for a, p in sorted(faltando.items()))
        + " — na estacao eles dao 404 ou ficam congelados na versao do build"
    )


def test_a_lista_de_sincronismo_so_pede_arquivo_que_existe():
    """O download e tudo-ou-nada: um nome errado congela o painel inteiro.

    `sincronizar_painel` so troca a pasta depois de baixar a lista completa. Um
    arquivo que nao existe na origem faz cada rodada falhar em silencio, e a
    estacao fica na copia anterior para sempre.
    """
    ausentes = [n for n in security_config.PAINEL_ARQUIVOS
                if not os.path.isfile(os.path.join(FRONTEND, n))]
    assert not ausentes, f"nomes em PAINEL_ARQUIVOS sem arquivo em frontend/: {ausentes}"


# ─── 2. A copia embutida repoe o que envelheceu ───────────────────────────────

def test_semear_substitui_o_arquivo_mais_velho_que_o_embutido(tmp_path):
    """Instalar agente novo tem de renovar o que a sincronizacao nao cobre.

    Antes, `_semear_painel` pulava tudo que ja existisse: quem instalou o agente
    uma vez ficava com aquele `csv-editor.js` para sempre, mesmo depois de dez
    releases.
    """
    import app

    origem = tmp_path / "embutido"
    destino = tmp_path / "painel"
    origem.mkdir()
    destino.mkdir()
    (origem / "index.html").write_text("<html>novo</html>", encoding="utf-8")
    (destino / "index.html").write_text("<html>velho</html>", encoding="utf-8")

    antigo = time.time() - 86400
    os.utime(destino / "index.html", (antigo, antigo))

    assert app._semear_painel(str(destino), str(origem)) is True
    assert (destino / "index.html").read_text(encoding="utf-8") == "<html>novo</html>"


def test_semear_preserva_o_arquivo_recem_sincronizado(tmp_path):
    """O caminho inverso, que nao pode quebrar.

    O painel baixado da nuvem e sempre mais novo que o embutido no executavel.
    Se o semeador o sobrescrevesse, cada reinicio da estacao jogaria o painel de
    volta para a versao do build — o congelamento que este trabalho conserta.
    """
    import app

    origem = tmp_path / "embutido"
    destino = tmp_path / "painel"
    origem.mkdir()
    destino.mkdir()
    (origem / "index.html").write_text("<html>do build</html>", encoding="utf-8")
    (destino / "index.html").write_text("<html>sincronizado</html>", encoding="utf-8")

    antigo = time.time() - 86400
    os.utime(origem / "index.html", (antigo, antigo))

    assert app._semear_painel(str(destino), str(origem)) is True
    assert (destino / "index.html").read_text(encoding="utf-8") == "<html>sincronizado</html>"


# ─── 3. O navegador da estacao nao pode segurar o HTML ────────────────────────

def test_html_do_painel_vai_com_no_store():
    """Sem isto, atualizar o disco nao atualiza a tela.

    O `?v=NNN` protege os scripts, mas quem carrega o carimbo e o proprio
    `index.html`, que nao tem como se invalidar. Com cache heuristico do
    navegador, a estacao servia o HTML da v528 e, com ele, pedia `pedido.js?v=528`
    do proprio cache: painel novo no disco, painel velho na tela.
    """
    from fastapi.testclient import TestClient
    import app

    cliente = TestClient(app.app)
    resposta = cliente.get("/index.html")
    assert resposta.status_code == 200
    assert "no-store" in (resposta.headers.get("cache-control") or "")


def test_o_outro_servidor_da_estacao_tambem_manda_no_store():
    """`app.py` e `local_print_agent.py` servem o mesmo painel na 9000.

    O cabecalho de security_config.py ja avisa: os dois implementam os mesmos
    endpoints separadamente, e correcao aplicada em um so nao vale para o outro.
    Este teste e quem cobra isso para o cache do painel.
    """
    from fastapi.testclient import TestClient
    import local_print_agent

    cliente = TestClient(local_print_agent.app)
    resposta = cliente.get("/app/index.html")
    assert resposta.status_code == 200
    assert "no-store" in (resposta.headers.get("cache-control") or "")


def test_no_store_nao_vaza_para_o_resto_da_api():
    """A regra e do HTML. O resto continua cacheavel como sempre foi."""
    from fastapi.testclient import TestClient
    import app

    cliente = TestClient(app.app)
    resposta = cliente.get("/api/health")
    assert resposta.status_code == 200
    assert "no-store" not in (resposta.headers.get("cache-control") or "")


# ─── 4. A estacao reporta qual painel esta servindo ───────────────────────────

def test_versao_do_painel_le_o_carimbo_do_index(tmp_path):
    """O ponto cego que custou a investigacao inteira.

    O heartbeat dizia a versao do executavel, e so. Saber qual painel a estacao
    servia exigia ir ate ela. Agora o carimbo `?v=NNN` do proprio HTML vai junto.
    """
    import agent_worker

    (tmp_path / "index.html").write_text(
        '<html><head><link rel="stylesheet" href="/style.css?v=537">'
        '</head><body></body></html>',
        encoding="utf-8",
    )

    estado = agent_worker.versao_do_painel(str(tmp_path))
    assert estado["versao"] == "537"
    assert estado["quando"]


def test_versao_do_painel_nao_quebra_sem_painel(tmp_path):
    """Estacao recem-instalada, ou pasta perdida: reporta vazio, nao explode."""
    import agent_worker

    estado = agent_worker.versao_do_painel(str(tmp_path / "nao-existe"))
    assert estado["versao"] is None
