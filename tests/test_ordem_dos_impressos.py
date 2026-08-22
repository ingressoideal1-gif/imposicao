# -*- coding: utf-8 -*-
"""A lista do botao IMPRESSO, no Painel de Producao, do mais recente ao mais antigo.

Pedido do usuario em 22/08/2026: *"ao selecionar os pedidos 'Impressos' deve
mostrar a lista do mais recente ao mais antigo, pela data de status 'Impresso'.
Apenas ao selecionar botao 'IMPRESSO'"*.

O banco nao guardava essa data -- guardava so o status. `updated_at` nao servia:
ela muda em qualquer gravacao do modelo (cor, gabarito, observacao), e em
22/08/2026 estava nula em 57 dos 129 modelos impressos. Entao nasceu a coluna
`pedidos_modelos.status_impressao_em`, carimbada por um GATILHO -- e nao pela
tela, porque quem marca "Impresso" tambem pode ser o agente local ou o ERP do
parceiro, e um carimbo escrito no frontend deixaria a lista com buracos
exatamente nos pedidos que a grafica tocou pela estacao.

As duas funcoes puras (`quandoOPedidoFicouImpresso` e `ordenarImpressosPorData`)
sao exercitadas pelo harness em Node, que as LE do `script.js`. O que fica aqui
e a migracao: a coluna, o gatilho e as tres regras que ele precisa respeitar.
"""
import io
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "ordem_dos_impressos_harness.js")
MIGRACAO = "sql/data_do_status_impresso.sql"


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_ordem_dos_impressos_passa():
    assert os.path.exists(HARNESS), "o harness da ordem dos impressos sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "todas passaram" in (r.stdout or ""), (
        "o harness nao relatou sucesso:" + (r.stdout or "")
    )


def test_a_migracao_cria_a_coluna_e_o_gatilho():
    sql = _ler(MIGRACAO)

    assert "ADD COLUMN IF NOT EXISTS status_impressao_em timestamptz" in sql, (
        "a coluna da data saiu da migracao"
    )
    assert "CREATE OR REPLACE FUNCTION public.carimba_status_impressao_em()" in sql
    assert "BEFORE INSERT OR UPDATE OF status_impressao ON public.pedidos_modelos" in sql, (
        "o gatilho precisa ser BEFORE (para gravar junto, sem um segundo UPDATE) "
        "e escutar SO a coluna do status"
    )


def test_o_gatilho_so_age_quando_o_status_muda():
    """Regravar o mesmo "Impresso" -- o que acontece toda vez que alguem reabre o
    seletor e escolhe o que ja estava la -- nao pode empurrar o pedido de volta
    ao topo da lista. E o preenchimento do historico, no fim do arquivo, precisa
    passar sem o gatilho desfazer o que ele acabou de escrever."""
    sql = _ler(MIGRACAO)

    assert "NEW.status_impressao IS DISTINCT FROM OLD.status_impressao" in sql, (
        "sem essa guarda, uma regravacao do mesmo status renova o carimbo"
    )
    # E ao SAIR de Impresso a data some: senao o pedido reapareceria na lista dos
    # impressos com uma data velha.
    assert "NEW.status_impressao_em := NULL" in sql


def test_a_migracao_preenche_o_historico():
    """Sem o preenchimento, tudo o que ja estava impresso antes de 22/08/2026
    sairia empilhado no fim da lista, e a ordem nova pareceria nao funcionar."""
    sql = _ler(MIGRACAO)

    assert "COALESCE(updated_at, created_at)" in sql
    assert "AND status_impressao_em IS NULL" in sql, (
        "o preenchimento precisa poupar quem ja tem data, para poder rodar duas vezes"
    )


def test_a_migracao_nao_toca_em_tabela_do_parceiro():
    """`pedidos_modelos` e tabela DO Imposition (docs/REGRAS_BANCO.md) -- foi nela
    que entraram `status_impressao` e as tres colunas `acabamento_*`. A regra de
    ouro que proibe ALTER TABLE vale para as tabelas do Vibecode, e nenhuma delas
    pode aparecer aqui."""
    sql = _ler(MIGRACAO)

    do_parceiro = ["propostas", "produtos_proposta", "produtos", "clientes",
                   "pagamentos_v2", "boletos", "notas_fiscais", "notas_servico"]
    for tabela in do_parceiro:
        assert not re.search(r"(ALTER TABLE|UPDATE|INSERT INTO|DELETE FROM)\s+"
                             r"(public\.)?" + tabela + r"\b", sql, re.IGNORECASE), (
            "a migracao escreve em %s, que e do parceiro" % tabela
        )


def test_a_coluna_chega_ao_painel():
    """`carregarModelosGlobais` monta a lista com um select EXPLICITO. Sem a
    coluna nela, todos os pedidos ficariam sem data e a ordem cairia calada no
    desempate por numero."""
    js = _ler("frontend/script.js")

    i = js.index("'id, id_int, status_arte, status_impressao")
    assert "status_impressao_em" in js[i:i + 400], (
        "o select dos modelos globais nao traz a data"
    )


def test_a_ordem_nova_vale_so_no_botao_impresso_e_cede_ao_cabecalho():
    js = _ler("frontend/script.js")

    i_nova = js.index("filteredImpressao = ordenarImpressosPorData(filteredImpressao)")
    i_sort = js.index("filteredImpressao = aplicarProdSort(filteredImpressao)")

    assert "=== 'impressos'" in js[i_nova - 300:i_nova], (
        "a ordem nova precisa estar presa ao filtro do botao IMPRESSO"
    )
    assert i_sort > i_nova, (
        "clicar num cabecalho e uma escolha explicita do operador, e tem de vencer "
        "a ordem que a tela traz sozinha"
    )
