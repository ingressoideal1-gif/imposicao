# -*- coding: utf-8 -*-
"""A tabela que liga a conta do cliente (auth.users) ao cliente do ERP.

Ate 17/08/2026 nao existia conta de cliente nenhuma: as 25 contas do projeto
eram a equipe do ERP. A grafica passa a liberar o acesso com senha provisoria,
e esta tabela e o unico lugar que sabe qual conta e de qual cliente.
"""
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, "sql", "schema_acesso_contas.sql")


def _sql():
    with open(SQL, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def test_o_arquivo_existe():
    assert os.path.exists(SQL)


def test_cria_a_tabela_com_as_colunas_da_spec():
    s = _sem_comentarios()
    assert re.search(r"CREATE TABLE IF NOT EXISTS producao_acesso_contas", s, re.I)
    for coluna in ("auth_user_id", "id_cliente", "email", "criada_aqui",
                   "senha_provisoria_em", "criado_por", "criado_em", "ativo"):
        assert coluna in s, f"falta a coluna {coluna}"
    assert re.search(r"PRIMARY KEY \(auth_user_id, id_cliente\)", s, re.I), (
        "a chave e o par conta+cliente: uma conta pode servir a mais de um cliente"
    )


def test_rls_ligado_e_nenhuma_politica():
    s = _sem_comentarios()
    assert re.search(r"ALTER TABLE producao_acesso_contas ENABLE ROW LEVEL SECURITY", s, re.I)
    assert "CREATE POLICY" not in s.upper(), (
        "zero politicas: so a service_role das Edge Functions le e escreve"
    )


def test_a_funcao_que_acha_a_conta_pelo_email_e_security_definer_e_so_da_service_role():
    s = _sem_comentarios()
    assert re.search(r"FUNCTION public\.acesso_usuario_por_email\(p_email text\)", s, re.I)
    assert "SECURITY DEFINER" in s.upper()
    assert re.search(r"REVOKE ALL ON FUNCTION public\.acesso_usuario_por_email", s, re.I)
    assert re.search(r"GRANT EXECUTE ON FUNCTION public\.acesso_usuario_por_email\(text\) TO service_role", s, re.I)


def test_pode_rodar_mais_de_uma_vez():
    s = _sem_comentarios()
    assert "IF NOT EXISTS" in s.upper()
    assert "CREATE OR REPLACE FUNCTION" in s.upper()


def test_tem_como_desfazer_no_fim():
    assert "COMO DESFAZER" in _sql()
    assert "DROP TABLE IF EXISTS producao_acesso_contas" in _sql()
