# -*- coding: utf-8 -*-
"""A estacao nao pede ao banco o que ela nao tem direito de ler (01/09/2026).

O painel do Supabase mostrava 384 erros em 26 horas. A maioria era tranca
funcionando ou aplicacao do parceiro, mas ~190 eram nossos e vinham todos da
mesma origem.

O painel da estacao e servido pelo agente local na porta 9000 e roda o MESMO
`frontend/script.js` do site. La o operador entra pelo codigo local, sem sessao
do Supabase -- por projeto. Toda chamada dela sai como `anon`.

Das 29 tabelas que o painel usa, quatro nao liberam nada para o `anon`. O
`loadOrdens()` pedia duas delas em toda carga de lista:

    pedidos_links_cliente      143 recusas em 26h
    imposition_tempo_no_card    44 recusas em 26h

Nos `edge_logs`, 100% dessas recusas tinham `referer: http://127.0.0.1:9000/`.
Nenhuma vinha do site -- que faz as mesmas chamadas e recebe 200/204.

O `sql/link_cliente_fechar_a_chave_publica.sql` fechou `pedidos_links_cliente`
em 16/08/2026 de proposito: ela guarda o TOKEN do link de cada cliente, e com a
chave publica qualquer um listava todos. O arquivo registrou a suposicao que
autorizava fechar -- "a estacao nao consome esta tabela" -- e ela vale para a
TELA (a Fila de Arte nao aparece na estacao) mas nao valia para o CARREGADOR,
que roda para a Fila de Impressao e o Painel de Producao tambem.

Dois estragos. Ruido, que esconde problema de verdade no painel do Supabase. E,
pior, o `[AUTO-SYNC-DB]`: ele marcava o pedido como "Enviar Arte" no
`localStorage` da estacao ANTES de tentar gravar. Recusada a gravacao, aquela
maquina mostrava um status que o banco nao tinha, ate o site sincronizar.

O conserto e o mais estreito possivel: sem sessao, nao pede. Nada foi liberado
para o `anon` -- o token do cliente continua fechado. O que a estacao PODE fazer
(`producao_ordens_servico`, liberada de proposito) continua igual.

O harness recorta as funcoes do `script.js` e as roda contra um banco de
mentira, com e sem sessao -- nada aqui e copia da regra.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "estacao_sem_sessao_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")


def test_o_harness_da_estacao_sem_sessao_passa():
    assert os.path.exists(HARNESS), "o harness da estacao sem sessao sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_painel_nao_reabre_a_tabela_do_token_para_o_anon():
    """O conserto e no painel, nao no banco.

    Se algum dia alguem 'resolver' isto com um GRANT, este teste nao pega -- mas
    o comentario que ele guarda diz por que nao se deve. O que ele pega e a
    regressao mais provavel: alguem tirar o freio do carregador.
    """
    texto = open(SCRIPT, encoding="utf-8").read()

    assert "async function temSessaoDoSupabase()" in texto, \
        "o ajudante que confere a sessao sumiu do script.js"

    # As tres portas que a estacao batia. Cada uma tem de continuar freada.
    for funcao in ("carregarLinksExistentes", "carregarTemposNoCard"):
        i = texto.index("async function %s()" % funcao)
        corpo = texto[i:texto.index("\n}", i)]
        assert "temSessaoDoSupabase()" in corpo, \
            "%s voltou a pedir ao banco sem conferir a sessao" % funcao

    i = texto.index("async function sincronizarPedidosProntosParaEnvio()")
    corpo = texto[i:texto.index("\n}", i)]
    assert "ehDoVibe && !temSessao" in corpo, \
        "o AUTO-SYNC-DB voltou a gravar o pedido do Vibe sem sessao"
    assert corpo.index("if (ehDoVibe && !temSessao) continue;") \
        < corpo.index("gravarStatusOverride(os.id, 'Enviar Arte');"), \
        "o override local precisa ficar DEPOIS do freio, senao a estacao diverge do banco"
