# -*- coding: utf-8 -*-
"""Quando o navegador bloqueia a estação, o operador tem de ler a saída.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 o Chrome 151 passou a recusar que uma página `https://` da internet converse
com `http://127.0.0.1:9000`:

    blocked by CORS policy: Permission was denied for this request
    to access the `loopback` address space

O cabeçalho `Access-Control-Allow-Private-Network`, que o agente já envia, deixou de
bastar. Da noite para o dia a estação virou inalcançável a partir do painel publicado na
Vercel — e o painel caía para a nuvem **em silêncio**, com um selo "NUVEM" discreto que
ninguém olha no meio de uma tiragem.

O estrago era o de sempre neste projeto: a tela dizia uma coisa e o papel era outra.

- Na nuvem não existe o `qr_ideal_pool.bin`, então o QR Ideal ficava impossível — e o
  operador lia "falta a lista de codigos desta estacao" **estando na frente de uma estação
  que tem a lista**. Foi exatamente essa frase que fez a investigação do pedido 20508
  durar dois dias.
- A imposição saía da máquina do operador para a rede, contra a razão de o agente existir.

## O que mudou em 16/08/2026

O caminho para a nuvem **deixou de existir**, por decisão do usuário: *"até por questão de
segurança, impressão só pode acontecer pela estação da gráfica"*. Sem estação, o trabalho
para e o operador lê por quê.

Isso não aposenta este arquivo — **aposenta metade dele**. O Chrome 151 continua
bloqueando a estação exatamente como antes; o que mudou é o que acontece depois do
bloqueio. A explicação continua sendo a peça que salva o operador, e ela continua tendo de
dizer o endereço que funciona em qualquer navegador.

O que este arquivo cobra hoje:

1. existe uma explicação, ela diz o endereço a abrir, ela nomeia o navegador como culpado
   provável, e ela se cala quando a página já vem da própria máquina;
2. **nenhuma tela conhece um motor de imposição na nuvem** — a sondagem está duplicada
   entre `script.js` e `pedido.js`, e este projeto já perdeu uma madrugada com cópias
   divergentes da mesma regra.

A recusa em si — o `throw` que para o trabalho — é cobrada em
`tests/test_imposicao_so_na_estacao.py`, junto da barreira do servidor.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"

# As telas que impõem. Ambas carregam script.js antes de pedido.js.
TELAS = ["script.js", "pedido.js"]


def _texto(nome):
    return (FRONT / nome).read_text(encoding="utf-8")


def _codigo(nome):
    """O arquivo SEM os comentários de bloco.

    O registro de que a nuvem não existe mais precisa citar os nomes que foram
    apagados — é o que impede alguém de recriá-los sem saber a história. Uma
    busca textual crua leria essa prosa como se fosse o código de volta, e o
    teste passaria a acusar justamente a documentação da própria remoção.

    Só `/* ... */`, e não `//`: comentário de linha é onde moram URLs, e cortar
    a linha num `https://` esconderia código de verdade escrito depois dele.
    """
    return re.sub(r"/\*.*?\*/", "", _texto(nome), flags=re.S)


def test_a_explicacao_existe_e_diz_o_que_fazer():
    """Não basta dizer que não deu: o operador precisa da saída, e a saída é um
    endereço que ele digita."""
    corpo = _texto("script.js")
    m = re.search(r"function explicarEstacaoNaoEncontrada\(.*?\n\}", corpo, re.S)
    assert m, "nao existe explicacao para a estacao nao encontrada"
    frase = m.group(0)
    assert "localhost:9000" in frase, (
        "o aviso nao diz o endereco pelo qual o painel funciona em qualquer navegador"
    )
    # "estacao" porque é onde o trabalho acontece; "navegador" porque é o culpado
    # provável, e sem nomeá-lo o operador procura defeito no NewProd.
    for palavra in ("estacao", "navegador"):
        assert palavra in frase.lower(), f"o aviso nao menciona {palavra!r}"


def test_a_explicacao_se_cala_quando_a_pagina_ja_vem_da_propria_maquina():
    """Servido pelo `localhost:9000`, o painel alcança a estação sem obstáculo
    nenhum. Avisar ali seria alarme falso, e alarme falso ensina a ignorar."""
    corpo = _texto("script.js")
    m = re.search(r"function explicarEstacaoNaoEncontrada\(.*?\n\}", corpo, re.S)
    assert re.search(r"ehEnderecoDaPropriaMaquina\(.*?\)\)\s*return\s*''", m.group(0)), (
        "o aviso nao se cala quando a pagina ja vem da propria maquina"
    )


def test_NENHUMA_tela_conhece_um_motor_de_imposicao_na_nuvem():
    """A regra lida dos próprios arquivos, e não de uma lista que alguém precise
    lembrar de atualizar: nenhuma tela pode ter endereço de nuvem para onde
    mandar imposição, nem o selo que anunciava esse caminho.

    Substitui os dois testes que cobravam "se mostrar o selo NUVEM, explique o
    motivo". Eles protegiam um caminho que deixou de existir — e um teste que
    guarda um caminho morto passa por vácuo para sempre, sem avisar ninguém.
    """
    culpados = []
    for nome in TELAS:
        corpo = _codigo(nome)
        if "MOTOR_NUVEM" in corpo or "baseParaImposicao" in corpo:
            culpados.append(f"{nome}: ainda conhece um motor de imposicao na nuvem")
        if "NUVEM</span>" in corpo:
            culpados.append(f"{nome}: ainda mostra o selo NUVEM")
    assert not culpados, "\n  ".join(["tela com caminho para a nuvem:"] + culpados)

    # NÃO se cobra aqui a ausência de `imposicao.onrender.com` no arquivo. O
    # Render continua servindo controle de acesso e catálogo até as Fases 2 a 4
    # da migração para o Supabase, e o `script.js` ainda tem um `fetch` de
    # pré-aquecimento para acordá-lo. O que esta regra proíbe é mandar
    # IMPOSIÇÃO para lá — não mencionar o endereço.


def test_o_registro_da_remocao_continua_no_arquivo():
    """O comentário que conta por que a nuvem sumiu é parte da correção.

    Sem ele, a próxima pessoa que topar com um `FUNCTION_PAYLOAD_TOO_LARGE`
    recria o desvio — que era exatamente a razão original daquela função — sem
    saber que ele foi removido por decisão de segurança.
    """
    corpo = _texto("script.js")
    assert "NAO EXISTE motor de imposicao na nuvem" in corpo, (
        "o registro de por que a nuvem foi removida saiu do arquivo"
    )
