# -*- coding: utf-8 -*-
"""A barra de "o banco de dados nao esta respondendo" (26/08/2026).

Em 26/08/2026, das 15:46 as 15:54, o banco do projeto Supabase do parceiro ficou
fora do ar. A internet da grafica estava perfeita e o agente local continuou de
pe servindo o painel na porta 9000 -- o que parou foi o servico de banco, do
outro lado. O log do agente marcou os dois extremos: `Heartbeat OK` as 15:46:35,
`timed out` em tudo depois disso, `Heartbeat OK` de novo as 15:54:21.

Na tela do operador isso nao apareceu como erro nenhum. Apareceu como uma tela
PARADA, sem mensagem e sem nada para tocar -- nas palavras do usuario,
"aplicacao travou". O motivo: as chamadas ao banco espalhadas pelo painel nao
tem tempo limite, e promessa que nunca se resolve nao cai no `catch` de ninguem.

O grosso da regra e medido pelo harness em Node, que executa o
`frontend/banco-nao-responde.js` de verdade dentro de um DOM de mentira. O que
este arquivo cobre e o que o harness nao alcanca: a ligacao do arquivo nas
paginas, e a ordem em que ele entra.

## As tres decisoes que valem lembrar

1. **Nenhuma chamada e cancelada.** Uma gravacao abortada aos 15 segundos pode
   ja ter chegado ao banco; a tela diria "falhou", o operador refaria, e a
   grafica ficaria com o registro duplicado. O congelamento e um problema; um
   pedido gravado duas vezes e outro, bem maior. O que muda e a tela parar de
   mentir que esta trabalhando -- a chamada segue viva.

2. **O embrulho fica num lugar so.** Sao 71 pontos de chamada ao banco no
   painel; mexer em cada um seria 71 chances de errar num caminho que a grafica
   usa o dia inteiro. O `window.fetch` e o funil por onde todos passam.

3. **So `/rest/v1/` e `/auth/v1/` entram na conta.** O agente local fica de fora
   porque impor leva minutos por natureza; o Storage porque subir arquivo grande
   passa dos 15s sem problema; a Edge Function porque no dia da queda ela
   continuou respondendo em 110 ms.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "banco_nao_responde_harness.js")

# As quatro paginas que criam o cliente do Supabase e, por isso, falam com o
# banco. A `portaria.html` NAO esta aqui de proposito: o aparelho da portaria
# fala com as Edge Functions e nunca com `/rest/v1/`.
PAGINAS = ["index.html", "producao.html", "cliente.html", "controle.html"]


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_barra_passa():
    assert os.path.exists(HARNESS), "o harness da barra sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_toda_pagina_que_fala_com_o_banco_carrega_a_barra():
    for pagina in PAGINAS:
        html = _ler(os.path.join("frontend", pagina))
        assert "banco-nao-responde.js" in html, (
            pagina + " fala com o banco e nao carrega a barra: uma queda do "
            "banco volta a congelar essa tela sem dizer nada"
        )


def test_a_barra_carrega_ANTES_do_supabase_config():
    """A ordem e a garantia de que as duas contas convivem.

    O `supabase-config.js` poe o embrulho DELE no `window.fetch` para carimbar a
    sessao nas chamadas ao nosso motor. Quem chega depois embrulha quem chegou
    antes; carregando a barra primeiro, o carimbo de sessao fica por cima da
    conta de tempo, e nenhuma das duas se perde.
    """
    for pagina in PAGINAS:
        html = _ler(os.path.join("frontend", pagina))
        # A posicao das TAGS, e nao a de qualquer mencao ao nome: o comentario
        # que acompanha a linha cita os dois arquivos, e comentario nao carrega
        # script nenhum.
        barra = re.search(r"<script src=\"[^\"]*banco-nao-responde\.js", html)
        config = re.search(r"<script src=\"[^\"]*supabase-config\.js", html)
        assert barra and config, pagina + ": faltou uma das duas tags"
        assert barra.start() < config.start(), (
            pagina + ": a barra tem de carregar antes do supabase-config.js"
        )


def test_a_barra_entra_na_conta_de_versao_dos_assets():
    """O `publicar.ps1` bumpa `\\.(js|css)\\?v=\\d+` em todas as paginas.

    Sem o `?v=NNN`, o navegador do operador continuaria servindo a versao velha
    do arquivo do cache depois de uma publicacao -- e um conserto que ninguem
    recebe nao e conserto.
    """
    for pagina in PAGINAS:
        html = _ler(os.path.join("frontend", pagina))
        assert re.search(r"banco-nao-responde\.js\?v=\d+", html), (
            pagina + ": a barra precisa do ?v=NNN para o publicar.ps1 bumpar"
        )


def test_nenhuma_chamada_e_cancelada():
    """A regra que impede gravacao duplicada, lida na fonte.

    `AbortController`/`signal` neste arquivo significaria chamada cancelada aos
    15 segundos -- e uma gravacao cancelada pode ja ter chegado ao banco.
    """
    fonte = _ler(os.path.join("frontend", "banco-nao-responde.js"))
    assert "AbortController" not in fonte
    assert ".abort(" not in fonte
    assert "signal" not in fonte


def test_o_limite_tem_folga_larga_sobre_o_tempo_normal():
    """15 segundos contra os 60-200 ms medidos: folga de 75 a 250 vezes.

    Errar para baixo aqui custa caro. Barra piscando enquanto o banco esta bem e
    o tipo de aviso que o operador aprende a ignorar -- e ai ela nao serve para
    o dia em que o banco cair de verdade.
    """
    fonte = _ler(os.path.join("frontend", "banco-nao-responde.js"))
    m = re.search(r"LIMITE_MS\s*=\s*(\d+)", fonte)
    assert m, "o limite sumiu do arquivo"
    assert int(m.group(1)) >= 10000, "limite curto demais: vai avisar a toa"
