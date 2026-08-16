# -*- coding: utf-8 -*-
"""O dono configura o aparelho NO PROPRIO APARELHO, com uma senha so.

O que estes testes protegem e a propriedade que o codigo de seis caracteres
comprava: a senha do dono nunca ficava no celular que ele entrega ao porteiro.
Trocar o codigo pela senha e deixar a sessao aberta seria pior que o desenho
antigo, nao melhor -- e o que impede isso e a ORDEM das operacoes ao salvar.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── O banco ─────────────────────────────────────────────────────────────────

def test_o_sql_libera_o_codigo_nulo_e_diz_por_que():
    """Aparelho configurado no proprio aparelho nao tem codigo -- e nao deve
    ter: codigo guardado no banco e codigo que pearia um SEGUNDO celular
    naquele portao."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql")
    assert "ALTER TABLE producao_acesso_dispositivos" in sql
    assert "DROP NOT NULL" in sql
    assert "codigo_hash" in sql


def test_o_sql_confere_o_que_fez():
    """Regra deste projeto: o script termina mostrando o resultado, senao nao
    ha como saber se deu certo -- foi assim que uma migracao anterior terminou
    com "Success. No rows returned" e ninguem soube dizer se rodara."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql")
    assert "information_schema.columns" in sql
    assert "is_nullable" in sql


def test_o_sql_nao_apaga_nada():
    """Os aparelhos que ja existem continuam com o codigo deles, e o caminho
    antigo continua funcionando: esta migracao permite a ausencia, nao a
    impoe."""
    sql = _ler("sql/acesso_aparelho_sem_codigo.sql").upper()
    for perigoso in ("DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE"):
        assert perigoso not in sql, "a migracao contem " + perigoso
