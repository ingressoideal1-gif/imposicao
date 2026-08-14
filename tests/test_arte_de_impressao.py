# -*- coding: utf-8 -*-
"""A amostra de aprovação nunca pode virar a arte de impressão.

Regra do usuário, 14/08/2026: **"A cor jamais deve sair na impressão ou
imposição de pdf"**, e um modelo sem arte deve impor **só a numeração** — que é
como sempre funcionou.

## O que acontecia

`arte_url` do estado nasce como `p.arte_url || p.amostra_arte_base64`. Para a
tela isso é razoável: sem arte, mostre a amostra. Para a imposição é um desastre
silencioso, porque a amostra é o JPEG combinado que o cliente aprova, com tudo
achatado dentro:

- a camada da Cor, que o motor nunca desenha e que não pode sair impressa;
- os elementos de numeração, que o motor desenha de novo por cima;
- o **QR Ideal com a logo no meio** — marca de tela que, no papel, apaga módulos
  e faz o leitor recusar o ingresso na portaria;
- 150 dpi (medido no pedido 18560: 877x309 px para 148,5x52,25 mm).

Medição em 14/08/2026: dos 109 modelos, 42 têm arte de verdade, 52 não têm arte
nem amostra, e **15** tinham amostra sem arte — esses 15 imprimiam a amostra.

## Por que o filtro mora num arquivo próprio

`arte_url` é lido em ~28 lugares, quase todos de tela. Mudar o significado dela
consertaria a impressão e quebraria a interface. O filtro é um módulo sem
dependências para carregar cedo e não poder falhar por causa de outro arquivo.
"""

import json
import os
import re
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(RAIZ, "frontend")
MODULO = os.path.join(FRONTEND, "arte-de-impressao.js")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def _no_node(expressao):
    """Roda a expressao com o modulo carregado, num Node de verdade."""
    script = (
        "globalThis.window = globalThis;"
        f"require({json.dumps(MODULO)});"
        f"console.log(JSON.stringify({expressao}));"
    )
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=RAIZ)
    if r.returncode != 0:
        raise AssertionError(r.stderr[:400])
    return json.loads(r.stdout.strip())


AMOSTRA = ("https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/"
           "amostras_renderizadas/amostra_frente_vibe_18560_1000110_1786708309611.jpg")
ARTE = ("https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/"
        "artes/vibe_18560_1000110.pdf")


def test_a_amostra_de_aprovacao_nao_e_arte():
    """O caso real que gerou este arquivo: pedido 18560, modelo 1000110."""
    assert _no_node(f"arteDeImpressao({json.dumps(AMOSTRA)})") is None


def test_a_arte_de_verdade_passa():
    assert _no_node(f"arteDeImpressao({json.dumps(ARTE)})") == ARTE


def test_sem_arte_devolve_null_e_nao_levanta():
    """`null` nao e erro: e a instrucao de impor so a numeracao."""
    for vazio in ("null", "undefined", '""', "0", "false"):
        assert _no_node(f"arteDeImpressao({vazio})") is None


def test_reconhece_a_amostra_do_verso_tambem():
    verso = AMOSTRA.replace("amostra_frente", "amostra_verso")
    assert _no_node(f"arteDeImpressao({json.dumps(verso)})") is None


def test_nao_recusa_arte_cujo_nome_apenas_lembra_amostra():
    """A pasta e o sinal, nao o nome do arquivo.

    Uma arte chamada "amostra_final.pdf" e arte; o que a desqualifica e estar
    no balde das amostras renderizadas.
    """
    url = "https://exemplo.com/storage/artes/amostra_final_aprovada.pdf"
    assert _no_node(f"arteDeImpressao({json.dumps(url)})") == url


# ── Os dois pontos que escolhem a arte da imposicao ─────────────────────────

@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_a_imposicao_filtra_a_arte(arquivo):
    texto = _ler(arquivo)
    assert "arteDeImpressao(" in texto, (
        f"{arquivo} escolhe a arte da imposicao sem filtrar a amostra"
    )


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_a_cor_nao_serve_mais_de_arte(arquivo):
    """`corObj.pdf_url` virava arte quando o modelo nao tinha nenhuma.

    Regra do usuario: a Cor jamais sai na impressao. Medicao em 14/08: nenhuma
    das 24 cores do catalogo tem `pdf_url`, entao esse caminho nunca produzia
    nada — remove-lo cumpre a regra sem mudar um unico trabalho.
    """
    texto = _ler(arquivo)
    assert "arteViaCor" not in texto
    assert "arteVersoViaCor" not in texto


# ── As armadilhas de publicacao deste projeto ──────────────────────────────

def test_o_modulo_nao_depende_de_nada():
    """O producao.html nao carrega o script.js, e os dois precisam da resposta."""
    texto = _ler("frontend/arte-de-impressao.js")
    assert "import " not in texto
    assert "require(" not in texto


@pytest.mark.parametrize("pagina", ["frontend/index.html", "frontend/producao.html"])
def test_as_duas_paginas_carregam_o_modulo(pagina):
    assert "arte-de-impressao.js" in _ler(pagina)


def test_o_modulo_esta_na_lista_que_as_estacoes_baixam():
    """Sem isto a estacao da 404 e a sincronizacao do painel congela INTEIRA.

    Nao e hipotese: foi o defeito da v559, quando o `fonte-canvas.js` ficou de
    fora desta lista. A sincronizacao e tudo-ou-nada.
    """
    import security_config
    assert "arte-de-impressao.js" in security_config.PAINEL_ARQUIVOS


def test_a_versao_do_script_acompanha_as_outras():
    """Uma tag com ?v= velho serve arquivo velho do cache do navegador."""
    for pagina in ("frontend/index.html", "frontend/producao.html"):
        texto = _ler(pagina)
        versoes = set(re.findall(r'\.js\?v=(\d+)', texto))
        assert len(versoes) == 1, f"{pagina} tem versoes misturadas: {sorted(versoes)}"


# ── A janela de sincronizacao do painel ─────────────────────────────────────
#
# O `arte-de-impressao.js` e um arquivo NOVO, e a estacao baixa o painel usando
# a lista `PAINEL_ARQUIVOS` **embutida no agente instalado**. Um agente anterior
# a 1.2.64 nao conhece esse nome: ele sincroniza o index.html e o producao.html
# novos, que referenciam o script, mas nao busca o script.
#
# Nessa janela o arquivo da 404 e `arteDeImpressao` fica indefinida. Sem guarda,
# a montagem do trabalho lancaria ReferenceError e a imposicao PARARIA naquela
# estacao — trocariamos um defeito de arte por uma parada de producao.

@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_a_chamada_sobrevive_sem_o_modulo(arquivo):
    texto = _ler(arquivo)
    assert "function arteParaImpor(" in texto, (
        f"{arquivo} chama o filtro sem rede de seguranca para a janela de sync"
    )
    assert "typeof arteDeImpressao === 'function'" in texto


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_a_imposicao_usa_o_invólucro_e_nao_o_modulo_direto(arquivo):
    """Chamar `arteDeImpressao` direto reabre a janela de ReferenceError."""
    texto = _ler(arquivo)
    assert "arteDeImpressao(sItem" not in texto
    assert "arteParaImpor(sItem" in texto


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_o_plano_B_aplica_a_MESMA_regra(arquivo):
    """Cair para o comportamento antigo faria a estacao voltar a imprimir a
    amostra de aprovacao durante a janela. O plano B repete a regra."""
    texto = _ler(arquivo)
    trecho = texto[texto.index("function arteParaImpor("):]
    trecho = trecho[:trecho.index("\n}")]
    assert "amostras_renderizadas" in trecho


def test_o_plano_B_funciona_de_verdade():
    """Roda o invólucro num Node SEM o módulo carregado."""
    fonte = _ler("frontend/pedido.js")
    corpo = fonte[fonte.index("function arteParaImpor("):]
    corpo = corpo[:corpo.index("\n}") + 2]
    amostra = json.dumps(AMOSTRA)
    arte = json.dumps(ARTE)
    script = (
        corpo
        + f"console.log(JSON.stringify([arteParaImpor({amostra}), "
          f"arteParaImpor({arte}), arteParaImpor(null)]));"
    )
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=RAIZ)
    assert r.returncode == 0, r.stderr[:300]
    assert json.loads(r.stdout.strip()) == [None, ARTE, None]
