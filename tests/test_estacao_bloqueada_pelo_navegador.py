# -*- coding: utf-8 -*-
"""Cair na nuvem por a estação estar bloqueada não pode ser silencioso.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 o Chrome 151 passou a recusar que uma página `https://` da internet converse
com `http://127.0.0.1:9000`:

    blocked by CORS policy: Permission was denied for this request
    to access the `loopback` address space

O cabeçalho `Access-Control-Allow-Private-Network`, que o agente já envia, deixou de
bastar. Da noite para o dia a estação virou inalcançável a partir do painel publicado na
Vercel — e o painel caía para a nuvem **em silêncio**, com um selo "NUVEM" discreto que
ninguém olha no meio de uma tiragem.

O estrago é o de sempre neste projeto: a tela diz uma coisa e o papel é outra.

- Na nuvem não existe o `qr_ideal_pool.bin`, então o QR Ideal fica impossível — e o
  operador lê "falta a lista de codigos desta estacao" **estando na frente de uma estação
  que tem a lista**. Foi exatamente essa frase que fez a investigação do pedido 20508
  durar dois dias.
- A imposição sai da máquina do operador para a rede, contra a razão de o agente existir.

Isso vai acontecer em TODA estação conforme o navegador dela atualizar, e cada estação da
gráfica usa um navegador diferente — então a saída não pode ser permissão concedida site a
site. A saída é abrir o painel pelo endereço do próprio agente, e é isso que o aviso
manda fazer.

O que este arquivo cobra:

1. existe uma explicação, ela diz o endereço a abrir, e ela se cala quando a página já vem
   da própria máquina;
2. NENHUMA tela mostra o selo "NUVEM" sem mostrar também o motivo — a sondagem está
   duplicada entre `script.js` e `pedido.js`, e este projeto já perdeu uma madrugada com
   cópias divergentes da mesma regra;
3. a mensagem de erro carrega o motivo junto, porque a recusa do motor sabe o que faltou
   mas não sabe por que o trabalho foi parar na nuvem.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"

# As telas que impõem. Ambas carregam script.js antes de pedido.js.
TELAS = ["script.js", "pedido.js"]


def _texto(nome):
    return (FRONT / nome).read_text(encoding="utf-8")


def test_a_explicacao_existe_e_diz_o_que_fazer():
    """Não basta dizer que foi para a nuvem: o operador precisa da saída, e a
    saída é um endereço que ele digita."""
    corpo = _texto("script.js")
    m = re.search(r"function explicarEstacaoNaoEncontrada\(.*?\n\}", corpo, re.S)
    assert m, "nao existe explicacao para a estacao nao encontrada"
    frase = m.group(0)
    assert "localhost:9000" in frase, (
        "o aviso nao diz o endereco pelo qual o painel funciona em qualquer navegador"
    )
    for palavra in ("nuvem", "navegador"):
        assert palavra in frase.lower(), f"o aviso nao menciona {palavra!r}"


def test_a_explicacao_se_cala_quando_a_pagina_ja_vem_da_propria_maquina():
    """Servido pelo `localhost:9000`, o painel alcança a estação sem obstáculo
    nenhum. Avisar ali seria alarme falso, e alarme falso ensina a ignorar."""
    corpo = _texto("script.js")
    m = re.search(r"function explicarEstacaoNaoEncontrada\(.*?\n\}", corpo, re.S)
    assert re.search(r"ehEnderecoDaPropriaMaquina\(.*?\)\)\s*return\s*''", m.group(0)), (
        "o aviso nao se cala quando a pagina ja vem da propria maquina"
    )


def test_NENHUMA_tela_cai_na_nuvem_sem_dizer_o_motivo():
    """A regra lida dos próprios arquivos, e não de uma lista que alguém precise
    lembrar de atualizar: onde houver o selo "NUVEM", tem de haver o aviso."""
    culpados = []
    for nome in TELAS:
        corpo = _texto(nome)
        if "NUVEM</span>" not in corpo:
            continue
        if "explicarEstacaoNaoEncontrada" not in corpo:
            culpados.append(f"{nome}: mostra o selo NUVEM e nao explica o motivo")
    assert not culpados, "\n  ".join(["tela caindo na nuvem em silencio:"] + culpados)


def test_a_mensagem_de_erro_carrega_o_motivo():
    """"Falta a lista de codigos desta estacao", lido na frente de uma estação que
    tem a lista, manda o operador procurar no lugar errado. Foi assim que dois
    dias foram gastos atrás de um defeito de numeração que não existia."""
    culpados = []
    for nome in TELAS:
        corpo = _texto(nome)
        if "NUVEM</span>" not in corpo:
            continue
        if not re.search(r"toast\(`Erro: \$\{err\.message\}\$\{causa\}`", corpo):
            culpados.append(f"{nome}: a mensagem de erro nao diz por que caiu na nuvem")
    assert not culpados, "\n  ".join(["erro sem a causa:"] + culpados)
