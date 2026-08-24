# -*- coding: utf-8 -*-
"""O fundo do PWA: a foto de evento que o ADM publica.

Pedido do usuario em 24/08/2026, com uma regra que governa o recurso inteiro:
**na foto se trabalha apenas enquadramento e contraste, para boa leitura.**

As guardas aqui sao as que quebram em SILENCIO -- as que so apareceriam no
celular do cliente, ou pior, no celular do porteiro no meio do evento.
"""
import json
import os
import re
import subprocess
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRENTE = os.path.join(RAIZ, "frontend")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── Onde o fundo entra, e onde ele NAO entra ───────────────────────────────

def test_a_casa_carrega_o_fundo_e_a_portaria_nao():
    """A portaria fica de fora por decisao de desenho, e nao por esquecimento.

    La a camera e o jsQR trabalham a cada quadro, e a tela inteira ja e
    significado: verde passou, vermelho nao entra, laranja e outra porta. Uma
    foto de fundo disputaria com a decisao que o porteiro le de longe -- e
    ainda custaria memoria no aparelho que menos pode gastar.
    """
    assert "fundo-do-app.js" in _ler("frontend/controle.html"), (
        "a casa do aplicativo nao carrega o fundo"
    )
    assert "fundo-do-app.js" not in _ler("frontend/portaria.html"), (
        "a portaria carrega o fundo: a foto vai disputar com a recusa na tela "
        "que o porteiro le de longe"
    )


def test_o_service_worker_guarda_o_arquivo():
    """Um arquivo que a casa pede e o cache nao guarda e uma tela quebrada sem
    rede -- que e a unica razao de este aplicativo existir instalado."""
    assert "fundo-do-app.js" in _ler("frontend/sw.js")


def test_a_estacao_recebe_o_arquivo():
    """Sem o nome no `PAINEL_ARQUIVOS`, a estacao serve o `controle.html` novo
    pedindo um script que ela nao tem: 404 so na maquina da grafica."""
    sys.path.insert(0, RAIZ)
    import security_config
    assert "fundo-do-app.js" in security_config.PAINEL_ARQUIVOS


def test_nenhum_endereco_do_supabase_no_css_nem_no_html():
    """A foto NAO pode entrar por `background-image` com URL de fora.

    Duas regras se cruzam: as telas do aplicativo nao carregam arquivo de outra
    origem (resposta opaca, cache nao salva), e o PWA precisa abrir sem rede.
    Por isso a imagem entra por script, como bytes guardados no aparelho -- e o
    CSS so recebe uma `url(blob:)` local.
    """
    for arquivo in ("frontend/controle.css", "frontend/controle.html"):
        texto = _ler(arquivo)
        assert "supabase.co" not in texto, (
            arquivo + " aponta para o Supabase: a tela nao abriria sem rede"
        )


# ── O contraste, que e a metade legivel do recurso ─────────────────────────

def test_o_veu_so_existe_com_foto():
    """Sem foto publicada, nada de escurecer a tela a toa.

    A regra do veu e presa a classe `com-fundo`, que o script so poe depois de
    a imagem estar no aparelho. Solta, ela escureceria a casa de todo mundo que
    ainda nao tem fundo nenhum.
    """
    css = _ler("frontend/controle.css")
    assert "html.com-fundo body::before" in css, (
        "o veu nao esta preso a classe: ele escureceria a tela sem foto"
    )
    # A trama de linhas diagonais saiu em 24/08/2026 -- o usuario olhou no ar e
    # ela nao ficou boa. Se voltar, este teste avisa.
    assert "fita-anda" not in css, "a trama de linhas do fundo voltou"


def test_a_conta_do_veu_e_a_mesma_no_css_e_na_previa():
    """A previa do ADM e o celular do cliente TEM de escurecer igual.

    A formula esta escrita em dois lugares -- no `controle.css`, que e quem
    pinta no celular, e no `script.js`, que e quem pinta na previa do ADM --
    porque a previa nao roda dentro do PWA. Divergindo, o ADM aprova um
    contraste e o cliente recebe outro, e ninguem descobre ate a foto estar no
    ar. Este teste e o que amarra as duas.
    """
    css = _ler("frontend/controle.css")
    js = _ler("frontend/script.js")

    trecho = css[css.index("html.com-fundo body::before"):]
    trecho = trecho[:trecho.index("}")]
    paradas_css = re.findall(r"var\(--fundo-veu, \.45\)\s*([+\-])\s*\.(\d+)\)\)\s*(\d+)%", trecho)
    assert len(paradas_css) == 3, "as tres paradas do degrade do veu mudaram de forma: " + trecho

    fn = js[js.index("function fundoVeuCss"):]
    fn = fn[:fn.index("\n}")]
    paradas_js = re.findall(r"veu\s*([+\-])\s*0\.(\d+)", fn)
    assert len(paradas_js) == 3, "a formula do veu na previa mudou de forma"

    # O sinal e o quanto de cada parada. A ALTURA de cada uma (0%, 46%, 100%) e
    # conferida logo abaixo, contra o proprio texto do degrade.
    assert [(sinal, valor) for sinal, valor, _ in paradas_css] == paradas_js, (
        "a previa do ADM e o celular escurecem diferente:\n"
        "  css: " + str(paradas_css) + "\n  js : " + str(paradas_js)
    )

    alturas_css = [pos for _, _, pos in paradas_css]
    alturas_js = re.findall(r"\)\s*(\d+)%", fn)
    assert alturas_css == alturas_js, (
        "as paradas do degrade estao em alturas diferentes -- o veu escureceria "
        "o topo da tela do cliente e o meio da previa:\n"
        "  css: " + str(alturas_css) + "\n  js : " + str(alturas_js)
    )


def test_o_veu_tem_piso_e_teto_no_banco():
    """Os dois extremos sao erro de operacao, e nao escolha: abaixo de 0,20 o
    texto claro some sobre foto de palco; acima de 0,85 a foto vira um retangulo
    preto e nao vale o peso que custa."""
    sql = _ler("sql/fundo_do_pwa.sql")
    assert "veu >= 0.20 and veu <= 0.85" in sql


# ── O que o ADM promete na tela ────────────────────────────────────────────

def test_a_aba_diz_os_tamanhos():
    """O usuario pediu "indicar tamanhos e resolucao adequada", e isso e uma
    promessa de INTERFACE: os numeros tem de estar na tela, nao num manual."""
    html = _ler("frontend/index.html")
    aba = html[html.index('id="adm-tab-fundo"'):]
    aba = aba[:aba.index('id="adm-tab-imagens"')]
    for numero in ("1080", "1920", "720", "1280", "220 KB"):
        assert numero in aba, "a aba nao diz " + numero

    js = _ler("frontend/script.js")
    # E os numeros da tela tem de ser os que o codigo usa de verdade.
    assert "FUNDO_LARGURA = 1080" in js
    assert "FUNDO_ALTURA = 1920" in js
    assert "FUNDO_MIN_LARGURA = 720" in js
    assert "FUNDO_MIN_ALTURA = 1280" in js
    assert "FUNDO_TETO_BYTES = 220 * 1024" in js


def test_a_aba_esta_no_menu_e_carrega_sozinha():
    html = _ler("frontend/index.html")
    assert "switchAdmTab('fundo')" in html, "o botao da aba nao existe"
    js = _ler("frontend/script.js")
    assert "if (tabId === 'fundo'" in js, (
        "abrir a aba nao carrega o fundo publicado: ela abriria vazia mesmo com "
        "foto no ar"
    )


def test_a_tela_ensina_a_sair_quando_a_tabela_falta():
    """Regra deste projeto: toda trava oferece, na propria tela, o que fazer
    para sair dela. Aqui a trava e a tabela que ainda nao foi criada."""
    js = _ler("frontend/script.js")
    assert "sql/fundo_do_pwa.sql" in js, (
        "a tela nao diz qual arquivo rodar quando a tabela nao existe"
    )


# ── O recorte, no navegador ────────────────────────────────────────────────

HARNESS = os.path.join(RAIZ, "tests", "fundo_do_pwa_harness.js")


@pytest.mark.skipif(not os.path.exists(HARNESS), reason="harness ausente")
def test_o_harness_do_fundo_passa():
    r = subprocess.run(["node", HARNESS], capture_output=True, text=True, cwd=RAIZ)
    assert r.returncode == 0, (r.stdout + r.stderr)[-2500:]
