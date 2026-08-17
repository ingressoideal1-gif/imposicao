# -*- coding: utf-8 -*-
"""A pagina do cliente fala com a funcao do banco, e nao com a tabela.

## O que foi medido em 16/08/2026

Com a chave anonima -- a que esta no codigo-fonte de toda pagina do painel:

    GET /rest/v1/pedidos_links_cliente?select=*  ->  200, 42 linhas, com TOKEN
    anon -> SELECT, INSERT, UPDATE, DELETE, TRUNCATE  (e RLS desligado)

O token e a unica coisa que separa a arte de um cliente do resto da internet.
Com a lista, abre-se a arte de qualquer cliente, marca-se qualquer pedido como
APROVADO -- que e autorizacao de imprimir -- e apaga-se a tabela inteira.

## O que estes testes prendem

O conserto so vale se a pagina do cliente PARAR de precisar da tabela: enquanto
uma consulta direta sobrar, revogar o privilegio da chave anonima (Tarefa 4 do
plano) quebra a tela do cliente em producao. Estes testes leem o codigo-fonte,
que e o mesmo estilo do `test_escrita_anonima_na_nuvem.py`, e existem para que a
Tarefa 4 possa ser feita sem medo -- e para que ninguem reabra a porta depois
sem perceber.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENTE_JS = os.path.join(RAIZ, "frontend", "cliente.js")
SQL = os.path.join(RAIZ, "sql", "link_cliente_funcoes.sql")


def _ler(caminho):
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def test_a_validacao_do_token_passa_pela_funcao():
    fonte = _ler(CLIENTE_JS)
    assert "rpc('link_cliente_abrir'" in fonte


def test_a_pagina_do_cliente_nao_le_mais_a_tabela():
    """`select` na tabela era o vazamento: sem filtro, ele listava tudo."""
    fonte = _ler(CLIENTE_JS)
    trechos = re.findall(r"from\('pedidos_links_cliente'\)\s*[\s\S]{0,120}", fonte)
    for t in trechos:
        assert ".select(" not in t, f"leitura direta da tabela voltou: {t[:120]}"


def test_so_sobra_a_copia_interna_do_auto_status():
    """O unico uso direto que resta e o bloco AUTO-STATUS, que so roda no
    contexto INTERNO (`isInternal`) -- e no `cliente.js` ele e copia morta, porque
    a pagina do cliente sempre define `amostrasContainerId` como o container
    dela. Ele pertence a Tarefa 3 (o painel), e nao a esta.

    O numero exato importa: se alguem acrescentar uma escrita direta nova, este
    teste cai antes de a porta ser fechada na Tarefa 4.
    """
    fonte = _ler(CLIENTE_JS)
    assert fonte.count("from('pedidos_links_cliente')") == 1


def test_aprovar_e_pedir_alteracao_passam_pela_funcao():
    fonte = _ler(CLIENTE_JS)
    assert "gravarStatusDoLink('APROVADO')" in fonte
    assert "gravarStatusDoLink('Em Alteração')" in fonte
    assert "rpc('link_cliente_status'" in fonte


def test_todo_status_que_a_tela_escreve_e_aceito_pela_funcao():
    """A lista fechada no SQL e o que impede o token de virar caneta livre sobre
    a coluna. O preco e este: um status novo na tela sem o par no SQL vira uma
    aprovacao que falha em silencio na frente do cliente."""
    fonte = _ler(CLIENTE_JS)
    sql = _ler(SQL)
    for status in re.findall(r"gravarStatusDoLink\('([^']+)'\)", fonte):
        assert f"'{status}'" in sql, (
            f"a tela escreve o status {status!r}, que a funcao do banco recusa"
        )


def _sem_comentarios(sql):
    """So o SQL que roda. Sem isto, a prosa que EXPLICA o cuidado contaria como
    o cuidado -- e um arquivo bem comentado passaria no teste sem ter nenhum."""
    return "\n".join(l for l in sql.splitlines() if not l.lstrip().startswith("--"))


def test_a_funcao_do_banco_nasce_com_os_cuidados_de_security_definer():
    sql = _sem_comentarios(_ler(SQL))
    assert sql.count("SECURITY DEFINER") == 2
    # Sem `search_path` fixado, quem controlasse o search_path da sessao faria a
    # funcao enxergar outra tabela com o mesmo nome.
    assert sql.count("SET search_path = public") == 2
    assert "GRANT EXECUTE ON FUNCTION public.link_cliente_abrir" in sql
    assert "GRANT EXECUTE ON FUNCTION public.link_cliente_status" in sql


def test_a_funcao_nao_devolve_o_token():
    """Devolver o token ao navegador entregaria de volta o que se esta
    protegendo. A pagina do cliente ja o tem na URL e nao precisa dele no corpo."""
    sql = _ler(SQL)
    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.link_cliente_abrir"):
                sql.index("COMMENT ON FUNCTION public.link_cliente_abrir")]
    declaracao = corpo[corpo.index("RETURNS TABLE"):corpo.index("LANGUAGE plpgsql")]
    assert "token" not in declaracao


def test_o_arquivo_sql_nao_fecha_nada():
    """Este arquivo e aditivo de proposito: rodar cedo demais nao pode derrubar a
    tela do cliente. Fechar e a Tarefa 4, depois que o painel tiver porta."""
    sql = _sem_comentarios(_ler(SQL)).upper()
    for perigoso in ("REVOKE", "DROP TABLE", "ALTER TABLE", "ENABLE ROW LEVEL SECURITY"):
        assert perigoso not in sql, perigoso
