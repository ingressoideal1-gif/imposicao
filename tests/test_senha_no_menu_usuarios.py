# -*- coding: utf-8 -*-
"""A senha de liberacao de peso no Menu Usuarios (21/08/2026).

No Painel do Acabamento, o peso real de um setor que foge mais de 5 % do
estimado so grava com uma senha semanal: 1 letra + 2 numeros, gerada no
servidor e trocada toda segunda-feira. A unica tela que a MOSTRA e o Menu
Usuarios — a tela do operador manda o que foi digitado e recebe sim ou nao.

Estes testes protegem a ligacao desse card:

1. O card existe no `index.html`, com os ids que o script preenche, e vem
   ANTES do "Acesso Local — NewProd".
2. O `script.js` define `window.loadSenhaLiberacao`, busca a rota
   `/api/senha-liberacao` sobre `API_PAINEL` (o `window.fetch` do
   `supabase-config.js` acrescenta a sessao sozinho) e o clique em Usuarios a
   chama junto dos outros carregadores.
3. A interface NAO explica o mecanismo: nada de "HMAC" nem "segredo" no card.
   Como a senha e calculada e segredo de Estado — a tela diz so o que ela faz.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def _card(html):
    """O trecho do index.html que e o card da senha (ate o card vizinho)."""
    ini = html.index('id="card-senha-liberacao"')
    fim = html.index("Acesso Local — NewProd", ini)
    return html[ini:fim]


def test_o_card_existe_no_menu_usuarios_e_vem_antes_do_acesso_local():
    html = _ler("frontend/index.html")

    assert 'id="card-senha-liberacao"' in html, "o card da senha nao esta no index.html"
    assert 'id="view-admin"' in html, "a tela do Menu Usuarios sumiu"

    view = html.index('id="view-admin"')
    card = html.index('id="card-senha-liberacao"')
    acesso = html.index("Acesso Local — NewProd")
    assert view < card, "o card da senha precisa estar dentro da view-admin"
    assert card < acesso, "o card da senha tem de vir ANTES do card Acesso Local — NewProd"


def test_o_card_tem_os_ids_que_o_script_preenche():
    card = _card(_ler("frontend/index.html"))

    assert 'id="senha-liberacao-valor"' in card, "falta o lugar onde a senha aparece"
    assert 'id="senha-liberacao-semana"' in card, "falta o lugar onde a semana aparece"
    assert "Senha de liberação de peso" in card, "o titulo do card mudou"
    assert 'onclick="loadSenhaLiberacao()"' in card, "o botao Atualizar nao chama loadSenhaLiberacao()"
    # O que o card diz ao usuario: o que a senha libera e que ela muda sozinha.
    assert "5 %" in card, "o card precisa dizer que a senha e para divergencia acima de 5 %"
    assert "segunda-feira" in card, "o card precisa dizer que a senha muda toda segunda-feira"


def test_o_script_define_o_carregador_e_busca_a_rota_do_painel():
    js = _ler("frontend/script.js")

    assert "window.loadSenhaLiberacao = async function" in js, \
        "o script.js nao define window.loadSenhaLiberacao"
    assert "`${API_PAINEL}/api/senha-liberacao`" in js, \
        "loadSenhaLiberacao precisa buscar /api/senha-liberacao sobre API_PAINEL (o fetch ja poe a sessao)"
    # A tela nao calcula a senha: ela so mostra o que a rota devolve, e trata
    # quem nao pode ver (403) com uma frase em vez de um toast.
    assert "Só quem pode ver o Menu Usuários vê a senha." in js, \
        "falta a frase para o 403 (quem nao pode ver o Menu Usuarios)"
    assert "Não deu para buscar a senha agora. Tente Atualizar." in js, \
        "falta a frase para erro de rede/servidor"


def test_o_clique_em_usuarios_carrega_a_senha():
    js = _ler("frontend/script.js")

    m = re.search(
        r"getElementById\('nav-admin'\)\?\.addEventListener\('click',\s*\(\)\s*=>\s*\{(.*?)\}\);",
        js, re.S,
    )
    assert m, "o clique de nav-admin nao foi encontrado no script.js"
    bloco = m.group(1)
    assert "loadSenhaLiberacao()" in bloco, "o clique em Usuarios precisa chamar loadSenhaLiberacao()"
    assert "loadAdminUsers()" in bloco and "loadAcessosLocais()" in bloco, \
        "os carregadores que ja existiam no clique de nav-admin sumiram"


def test_a_interface_nao_explica_como_a_senha_e_feita():
    card = _card(_ler("frontend/index.html")).lower()

    assert "hmac" not in card, "o card nao pode explicar o mecanismo (HMAC)"
    assert "segredo" not in card, "o card nao pode falar em segredo"
