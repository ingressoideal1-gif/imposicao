# -*- coding: utf-8 -*-
"""O schema do controle de acesso: o que nasce fechado tem de continuar fechado.

Estas tabelas guardam quem entrou no evento do cliente e o hash de todo ingresso
impresso. Nenhuma tela fala com elas: quem fala e o backend no Render, com a
service_role. E por isso que elas podem nascer com RLS ligado e ZERO politicas —
com a chave anonima ninguem le nem escreve uma linha.

O modo de falhar que esta suite previne e silencioso. Uma tabela nova sem
`ENABLE ROW LEVEL SECURITY` fica legivel e gravavel por qualquer um que abra o
painel no navegador, e nada quebra nem avisa. Foi exatamente esse o estado do
Ideal Control antigo, que rodava com RLS desligado de proposito.

A outra armadilha coberta aqui e a do `empresa_id`, explicada por extenso no
proprio sql/schema_acesso.sql: ele e nulo em 100% das linhas producao_* deste
banco, e em Postgres nulo e distinto de nulo dentro de indice unico. Uma chave
escrita como UNIQUE (empresa_id, coluna) nao garante nada.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(RAIZ, "sql", "schema_acesso.sql")


def _sql():
    with open(SCHEMA, encoding="utf-8") as f:
        return f.read()


def _sem_comentarios():
    """O SQL de verdade, sem as linhas `--`.

    O arquivo explica as armadilhas citando o codigo errado de proposito. Sem
    tirar os comentarios, o teste acusaria a explicacao como se fosse o defeito.
    """
    return "\n".join(
        linha for linha in _sql().splitlines()
        if not linha.lstrip().startswith("--")
    )


def _tabelas():
    return re.findall(
        r"CREATE TABLE IF NOT EXISTS (producao_acesso_[a-z_]+)", _sem_comentarios()
    )


def test_o_arquivo_cria_as_sete_tabelas_aprovadas():
    """Se aparecer tabela nova, ela passa por todos os testes abaixo tambem."""
    assert sorted(_tabelas()) == sorted([
        "producao_acesso_eventos",
        "producao_acesso_pedidos",
        "producao_acesso_setores",
        "producao_acesso_credenciais",
        "producao_acesso_dispositivos",
        "producao_acesso_dispositivo_setores",
        "producao_acesso_leituras",
    ])


def test_toda_tabela_nasce_com_rls_ligado():
    """A protecao inteira destas tabelas mora nesta linha.

    Sem ela, a tabela e legivel e gravavel pela chave anonima, que e publica por
    natureza. Ninguem descobre isso testando o app: tudo continua funcionando.
    """
    sql = _sem_comentarios()
    faltando = [
        t for t in _tabelas()
        if not re.search(rf"ALTER TABLE\s+{t}\s+ENABLE ROW LEVEL SECURITY", sql)
    ]
    assert not faltando, (
        f"tabela(s) sem RLS: {faltando} — com a chave anonima publica, elas "
        "ficam legiveis e gravaveis por qualquer um, e nada avisa"
    )


def test_nenhuma_politica_rls_foi_criada():
    """O desenho e service_role e mais ninguem.

    Uma politica aqui abriria a tabela para a chave anonima ou para conta comum.
    Isso pode vir a ser desejado um dia, mas e mudanca de arquitetura: quem
    fizer, atualiza este teste de proposito, e nao por acidente.
    """
    politicas = re.findall(
        r"CREATE POLICY[^;]*ON\s+(producao_acesso_[a-z_]+)", _sem_comentarios()
    )
    assert not politicas, (
        f"politica RLS criada em {politicas} — nenhuma tela fala direto com "
        "estas tabelas; se passou a falar, a arquitetura escorregou"
    )


def test_toda_tabela_tem_o_gatilho_de_updated_at():
    """Convencao obrigatoria do REGRAS_BANCO.md, e o que faz o updated_at valer."""
    sql = _sem_comentarios()
    faltando = [
        t for t in _tabelas()
        if not re.search(rf"BEFORE UPDATE ON {t}\s", sql)
    ]
    assert not faltando, f"tabela(s) sem trigger de updated_at: {faltando}"


def test_nenhuma_chave_unica_confia_no_empresa_id_cru():
    """A armadilha que este schema ja evitou uma vez.

    `empresa_id` e nulo em 100% das 111 linhas producao_* deste banco. Em
    Postgres, nulo e distinto de nulo dentro de indice unico, entao
    UNIQUE (empresa_id, pedido_id_int) deixaria o mesmo pedido ser publicado
    duas vezes sem uma reclamacao sequer. As chaves tem de passar pela funcao
    producao_acesso_empresa(), que troca o nulo por um UUID zerado.
    """
    sql = _sem_comentarios()
    cruas = re.findall(r"UNIQUE\s*\(\s*empresa_id", sql)
    assert not cruas, (
        "chave unica usando empresa_id cru — com empresa_id nulo ela nao "
        "garante nada; use producao_acesso_empresa(empresa_id)"
    )
    assert re.search(r"CREATE OR REPLACE FUNCTION producao_acesso_empresa", sql)
    assert "IMMUTABLE" in sql, (
        "producao_acesso_empresa precisa ser IMMUTABLE, senao o Postgres recusa "
        "usa-la dentro de indice e o schema nem chega a ser criado"
    )


def test_a_chave_de_idempotencia_das_leituras_nao_aceita_nulo():
    """O que impede a fila offline de duplicar a lotacao do evento.

    A chave e (dispositivo_id, id_local). Se `dispositivo_id` aceitasse nulo, a
    chave se desligaria justamente nas linhas com nulo — e o celular que ficou
    tres horas sem rede gravaria a fila inteira duas vezes ao sincronizar.
    """
    sql = _sem_comentarios()
    corpo = sql[sql.index("CREATE TABLE IF NOT EXISTS producao_acesso_leituras"):]
    corpo = corpo[:corpo.index(");")]
    assert re.search(r"dispositivo_id UUID NOT NULL", corpo), (
        "producao_acesso_leituras.dispositivo_id precisa ser NOT NULL: ele faz "
        "parte da chave de idempotencia da fila offline"
    )
    assert re.search(r"UNIQUE\s*\(dispositivo_id,\s*id_local\)", sql)


def test_o_bloco_de_desfazer_cobre_todas_as_tabelas():
    """Rede de seguranca do usuario, e ela so serve se estiver completa."""
    sql = _sql()
    desfazer = sql[sql.index("COMO DESFAZER"):]
    faltando = [t for t in _tabelas() if f"DROP TABLE IF EXISTS {t}" not in desfazer]
    assert not faltando, f"tabela(s) fora do bloco de desfazer: {faltando}"


def test_o_desfazer_nao_apaga_a_funcao_compartilhada():
    """producao_update_updated_at() e das tabelas de catalogo tambem.

    Um DROP nela aqui quebraria os gatilhos de seis tabelas que nao tem nada a
    ver com controle de acesso.
    """
    sql = _sql()
    desfazer = sql[sql.index("COMO DESFAZER"):]
    assert "DROP FUNCTION IF EXISTS producao_update_updated_at" not in desfazer
