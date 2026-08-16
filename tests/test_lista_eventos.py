# -*- coding: utf-8 -*-
"""A tela inicial: a lista de eventos da imagem que o usuario mandou.

A luz verde significa UMA coisa, decidida por ele em 16/08/2026: este aparelho
ja e portao daquele evento. Nao e "o evento esta ativo" -- essa informacao vai
em texto, ao lado do nome.
"""

import json
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "lista_eventos_harness.js")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def unir(do_chaveiro, da_conta):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": "unir", "argumentos": [do_chaveiro, da_conta]}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)["resultado"]


P = {"evento_id": "e-1", "nome_evento": "Click", "aparelho_id": "d-1",
     "nome_portao": "Portão 1", "token": "t-1"}
E1 = {"id": "e-1", "nome_evento": "Click", "status": "ativo"}
E2 = {"id": "e-2", "nome_evento": "Fenachamp", "status": "ativo"}


def test_evento_que_esta_nas_duas_fontes_aparece_uma_vez_e_verde():
    linhas = unir([P], [E1])
    assert len(linhas) == 1
    assert linhas[0]["ehPortao"] is True


def test_evento_so_da_conta_aparece_com_a_luz_apagada():
    linhas = unir([], [E2])
    assert linhas[0]["ehPortao"] is False


def test_evento_so_do_chaveiro_aparece_verde_SEM_a_conta():
    """O celular do porteiro: sem rede, sem sessao, e a lista tem de sair."""
    linhas = unir([P], [])
    assert len(linhas) == 1
    assert linhas[0]["ehPortao"] is True
    assert linhas[0]["nome"] == "Click"


def test_os_verdes_vem_primeiro():
    """Quem esta no portao procura o evento que ele le, nao os outros."""
    linhas = unir([P], [E2, E1])
    assert linhas[0]["id"] == "e-1"


def test_o_nome_da_conta_vence_o_do_chaveiro():
    """O chaveiro guarda uma copia; o servidor e a verdade.

    Regra deste projeto: dado do parceiro manda sempre. O dono renomeia o
    evento no ERP e a barra tem de mudar.
    """
    velho = dict(P, nome_evento="Nome antigo")
    linhas = unir([velho], [E1])
    assert linhas[0]["nome"] == "Click"


def test_evento_inativo_e_marcado_em_texto():
    linhas = unir([], [dict(E2, status="encerrado")])
    assert linhas[0]["ativo"] is False


# ── A tela ──────────────────────────────────────────────────────────────────

def test_a_barra_de_novo_evento_e_o_mais_fazem_a_mesma_coisa():
    texto = _ler("frontend/controle.html")
    assert 'id="btn-ler-qr"' in texto
    assert 'id="btn-ler-qr-mais"' in texto


def test_a_engrenagem_fica_FORA_da_barra_do_evento():
    """Como na imagem. Dentro, o toque no evento cairia na configuracao."""
    texto = _ler("frontend/lista-eventos.js")
    assert "linha-evento" in texto and "botao-engrenagem" in texto


def test_nao_sobrou_nenhuma_opcao_de_gerar_codigo():
    """Decisao do usuario: retirar TODAS as opcoes de gerar codigo."""
    for arquivo in ("frontend/controle.html", "frontend/controle.js",
                    "frontend/lista-eventos.js"):
        texto = _ler(arquivo)
        assert "Gerar outro código" not in texto
        assert "caixa-codigo" not in texto
        assert "Criar aparelho" not in texto


def test_todo_botao_da_lista_tem_rotulo_em_texto():
    """Regra do projeto: icone sozinho obriga a adivinhar."""
    texto = _ler("frontend/lista-eventos.js")
    assert "aria-label" in texto


def test_o_arquivo_entra_na_lista_que_as_estacoes_baixam():
    import security_config
    assert "lista-eventos.js" in security_config.PAINEL_ARQUIVOS


# ── A pagina carrega tudo o que o codigo dela chama ─────────────────────────
#
# Este teste nasceu de um defeito que a suite inteira deixou passar. O
# `virar-portao.js` chamava `window.portariaDeposito.contarFila()`, e o
# `controle.html` nao carregava o `portaria-deposito.js`. Resultado: tocar na
# barra do evento lancava e NAO FAZIA NADA -- sem erro na tela, sem uma palavra.
# So apareceu dirigindo a tela num Chrome de verdade.
#
# O modo de falhar e sempre o mesmo, e e silencioso: um arquivo passa a usar um
# `window.X` de outro, e a pagina que os junta nao e atualizada. Ninguem quebra;
# um botao simplesmente para de responder.

MODULOS_GLOBAIS = {
    "chaveiro": "chaveiro.js",
    "portariaDeposito": "portaria-deposito.js",
    "listaEventos": "lista-eventos.js",
    "virarPortao": "virar-portao.js",
    "aparelhoAqui": "aparelho.js",
    "AcessoConta": "acesso-conta.js",
    "lerQR": "ler-qr.js",
    "portariaCamera": "portaria-camera.js",
    "Controle": "controle.js",
    "paredePwa": "parede-pwa.js",
}


def _scripts_da_pagina(pagina):
    return set(re.findall(r'<script src="([^"?]+)', _ler("frontend/" + pagina)))


@pytest.mark.parametrize("pagina", ["controle.html", "portaria.html"])
def test_a_pagina_carrega_todo_modulo_que_os_scripts_dela_usam(pagina):
    scripts = _scripts_da_pagina(pagina)
    codigo = "".join(
        _ler("frontend/" + s) for s in sorted(scripts)
        if s.endswith(".js") and os.path.exists(os.path.join(RAIZ, "frontend", s))
    )
    faltando = []
    for global_, dono in MODULOS_GLOBAIS.items():
        if dono in scripts:
            continue                     # o dono esta carregado: nada a conferir
        if re.search(r"window\." + global_ + r"\b", codigo):
            faltando.append(global_ + " (mora em " + dono + ")")
    assert not faltando, (
        pagina + " usa modulo que ela nao carrega: " + ", ".join(faltando)
    )
