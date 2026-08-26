# -*- coding: utf-8 -*-
"""A numeração de um item da OS tem de ser resolvida do mesmo jeito em todo lugar.

O QUE ESTE TESTE PREVINE, E QUE JÁ ACONTECEU

Em 15/08/2026 os modelos 1000281 (PISTA) e 1000284 (CAMAROTE) do pedido 20508
saíram da impressora **sem número e sem QR**, enquanto a prévia na tela mostrava
os dois. Trinta e um ingressos de papel perdidos, e — pior — o agente não teve o
que publicar, então a portaria também não teria o que conferir.

A causa: a tabela `pedidos_modelos` do ERP **não tem** coluna `numeracao_id`. Ela
guarda `amostra_num_id`. O painel sabe disso e resolve os dois em quatro lugares
diferentes... só que um deles, o `runImposition` — justamente o que IMPRIME —
lia só `item.numeracao_id`. Sem ninguém ter tocado no seletor de numeração
naquela sessão, o campo vinha vazio, a numeração ia nula no payload, e o motor
compunha a folha sem elemento nenhum de numeração.

Por que ninguém viu antes: a prévia usa outro caminho, que faz o fallback certo.
A tela mostrava o QR e o papel saía sem. É exatamente a armadilha nº 3 da skill
do QR Ideal — "o elemento existe, o dado existe, e a tela mente".

POR QUE ESTE TESTE É DE TEXTO-FONTE

Ele lê o `script.js` em vez de dirigir o navegador, e isso é deliberado: o que
falhou não foi um comportamento, foi a **divergência entre quatro cópias da mesma
regra**. Um teste de comportamento cobriria o caminho que eu lembrasse de
exercitar; este cobre os quatro, e reprova no dia em que aparecer um quinto.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCRIPT = (RAIZ / "frontend" / "script.js").read_text(encoding="utf-8")


def test_todo_lugar_que_le_numeracao_id_do_item_cai_em_amostra_num_id():
    """`item.numeracao_id` sozinho é sempre um defeito.

    A coluna que existe no banco do parceiro é `amostra_num_id`; `numeracao_id`
    só aparece em memória, depois de o operador mexer no seletor. Ler uma sem a
    outra funciona na mesa de quem acabou de configurar e falha na produção.
    """
    culpadas = []
    for numero, linha in enumerate(SCRIPT.splitlines(), 1):
        # Só as LEITURAS. Duas coisas ficam de fora de propósito:
        #
        #  - o mapa de auto-save (`'numeracao_id': 'amostra_num_id'`), que é
        #    justamente a tradução entre o nome da tela e a coluna do banco;
        #  - a ESCRITA `item.numeracao_id = num.id`, que é o momento em que o
        #    campo em memória passa a existir. Cobrá-la aqui seria exigir um
        #    fallback de quem está preenchendo o valor.
        if not re.search(r"\b\w*[Ii]tem\w*\.numeracao_id\b", linha):
            continue
        if re.search(r"\.numeracao_id\s*=(?!=)", linha):
            continue                      # atribuição, não leitura
        if "amostra_num_id" in linha:
            continue                      # tem o fallback, está certo
        culpadas.append(f"linha {numero}: {linha.strip()[:110]}")

    assert not culpadas, (
        "leitura de numeracao_id sem cair em amostra_num_id — o item impresso "
        "sai SEM numeracao e sem QR, com a previa mostrando os dois:\n  "
        + "\n  ".join(culpadas)
    )


def test_a_coluna_do_banco_vem_sempre_primeiro():
    """A ordem importa, e em 26/08/2026 ela cobrou o preço pelo outro lado.

    Em 15/08 o defeito foi ler **só** `numeracao_id`, que não existe no banco: o
    papel saiu sem numeração. O conserto de então foi o fallback
    `numeracao_id || amostra_num_id` — que resolveu a impressão e deixou uma
    segunda armadilha de pé.

    Porque os dois nomes são a MESMA coluna, e nada os mantinha iguais em
    memória. `onItemNumSelect` e `saveAmostraToDB` escreviam só o
    `amostra_num_id`; quem lia pelo espelho continuava com o valor anterior.
    Medido no pedido 21202: trocar a numeração de um modelo — ou salvar uma cópia
    dela — atualizava o card, o rótulo do banco e o select, e o
    **📊 Ver / editar abria o banco da numeração anterior** até alguém recarregar
    a página. No **🧩 Linhas** era pior, porque ele grava: a distribuição
    escreveria `csv_selecao` com os `__id` do banco errado.

    Então a regra ficou mais forte que "tem fallback": a **coluna do banco vem
    primeiro**, em todo lugar. É a mesma ideia de `dados-do-parceiro-mandam-sempre`
    — nenhum valor derivado e guardado pelo painel pode continuar valendo depois
    que o dado de origem muda.
    """
    erradas = []
    for numero, linha in enumerate(SCRIPT.splitlines(), 1):
        if re.search(r"\.numeracao_id\s*\|\|\s*\w+\.amostra_num_id", linha):
            erradas.append(f"linha {numero}: {linha.strip()[:110]}")

    assert not erradas, (
        "o espelho em memoria nao pode ser lido antes da coluna do banco — "
        "a tela volta a abrir a numeracao anterior depois de troca-la:\n  "
        + "\n  ".join(erradas)
    )

    # E o fallback continua existindo: item legado, gravado antes de a coluna
    # ser preenchida, ainda precisa ser resolvido.
    assert SCRIPT.count("amostra_num_id || item.numeracao_id") >= 1, (
        "sumiu o fallback; item antigo sem amostra_num_id deixaria de resolver"
    )


def test_os_dois_nomes_sao_escritos_juntos():
    """Ler na ordem certa não basta: eles têm de ser gravados juntos.

    É o que impede a divergência de nascer. Sem isto, a ordem de leitura vira
    remendo em cima de dois valores que já discordam.
    """
    assert "function sincronizarNumeracaoDoItem(" in SCRIPT, (
        "o escritor único dos dois nomes precisa existir"
    )
    for quem, marca in [
        ("trocar a numeracao no card", "sincronizarNumeracaoDoItem(item, numId)"),
        ("salvar o modelo", "sincronizarNumeracaoDoItem(itemLocal, dataToUpdate.amostra_num_id)"),
        ("o auto-save de campo", "field === 'numeracao_id' || field === 'amostra_num_id'"),
    ]:
        assert marca in SCRIPT, quem + " precisa manter os dois nomes de pe"
