# -*- coding: utf-8 -*-
"""A tabela que decide a corrida entre dois portoes.

Cinco minutos de sincronismo e tempo de sobra para a mesma pessoa tentar entrar
por duas portas. Com sinal, quem resolve isso e o BANCO: uma tabela com
`credencial_id` como chave primaria e um `ON CONFLICT DO NOTHING` gravam a
entrada numa operacao so. Perguntar antes ("ja existe?") e gravar depois sao
duas consultas que podem se cruzar -- e os dois portoes deixam entrar.

Por que tabela propria, e nao um indice unico na tabela de leituras: setor de
reentrada permite sair e voltar quantas vezes quiser, e a tabela de leituras
guarda as duas coisas. Um unico la impediria a reentrada de acontecer.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_entradas_unicas.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    """O SQL de verdade, sem as linhas `--`.

    O cabecalho explica de proposito o que NAO se deve fazer -- mexer na tabela
    de leituras, perguntar antes de gravar. Sem tirar os comentarios, o teste
    acusaria a propria explicacao como se fosse o defeito.
    """
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_a_chave_primaria_e_a_credencial():
    """E ela que faz o banco decidir a corrida.

    Duas consultas separadas -- "ja existe?" e depois "grava" -- podem se
    cruzar entre dois portoes lendo o mesmo ingresso no mesmo segundo, e os
    dois entram. Chave primaria e `ON CONFLICT DO NOTHING` resolvem isso numa
    operacao so.
    """
    texto = _sem_comentarios().lower()
    assert "credencial_id" in texto
    assert "primary key" in texto


def test_a_tabela_e_separada_da_de_leituras():
    """Setor de reentrada permite entrar varias vezes, e a tabela de leituras
    guarda as duas coisas. Um indice unico la impediria a reentrada."""
    texto = _sem_comentarios().lower()
    assert "producao_acesso_entradas_unicas" in texto
    assert "alter table producao_acesso_leituras" not in texto


def test_guarda_quem_ganhou_a_corrida():
    """Quem perde precisa ouvir QUANDO e em QUAL portao a pessoa entrou --
    senao a recusa vira "nao sei, o sistema nao deixou"."""
    texto = _sem_comentarios().lower()
    for coluna in ("dispositivo_id", "momento", "setor_id", "evento_id"):
        assert coluna in texto


def test_nasce_com_rls_ligado_e_sem_politica():
    """Como as sete tabelas do schema_acesso: quem fala com ela e o backend,
    com a service_role. Com a chave anonima ninguem le nem escreve."""
    texto = _sem_comentarios().lower()
    assert "enable row level security" in texto
    assert "create policy" not in texto


def test_e_repetivel():
    """Rodar duas vezes no editor do Supabase nao pode quebrar nada."""
    assert "if not exists" in _sem_comentarios().lower()


def test_diz_como_rodar():
    assert "como rodar" in _sql().lower()


def test_diz_como_desfazer():
    assert "desfazer" in _sql().lower()


def test_o_desfazer_fica_comentado():
    """`DROP TABLE` solto no fim de um arquivo que se cola inteiro no editor
    apagaria a tabela no mesmo Run que a criou."""
    assert "drop table" not in _sem_comentarios().lower()
    assert "drop table" in _sql().lower()
