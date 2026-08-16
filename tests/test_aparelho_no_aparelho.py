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


# ── O servidor ──────────────────────────────────────────────────────────────

def test_o_hash_do_token_tem_uma_definicao_so():
    """O defeito mais caro possivel aqui seria silencioso.

    Quem CUNHA o token e a criacao do aparelho; quem o CONFERE, a cada
    requisicao, e a portaria. Duas definicoes do mesmo hash divergiriam algum
    dia, e o sintoma seria o aparelho recusado sem motivo aparente -- no
    portao, com fila.
    """
    compartilhado = _ler("supabase/functions/_compartilhado/hash.ts")
    assert "export async function hashDoToken" in compartilhado
    assert "export function tokenNovo" in compartilhado

    portaria = _ler("supabase/functions/portaria/index.ts")
    assert "async function hashDoToken" not in portaria, (
        "a portaria tem copia propria do hash do token"
    )
    assert "hashDoToken" in portaria, "a portaria deixou de conferir o token"


def test_o_aparelho_daqui_nasce_com_token_e_sem_codigo():
    ts = _ler("supabase/functions/_compartilhado/configuracao.ts")
    assert "aplicarAparelhoAqui" in ts
    corpo = ts[ts.index("export async function aplicarAparelhoAqui"):]
    corpo = corpo[:corpo.index("\n}")]
    assert "codigo_hash: null" in corpo, (
        "codigo guardado e codigo que pearia um segundo celular naquele portao"
    )
    assert "token_hash" in corpo


def test_uma_senha_serve_para_entrar_e_para_elevar():
    """Decisao do usuario: "apenas uma senha".

    Entrar e elevar sao duas chamadas, e continuam sendo -- o login e do
    Supabase, a elevacao e nossa, assinada e com prazo. O que a decisao proibe e
    a PESSOA digitar duas vezes, e no portao, com o dono de pe, isso pesa.
    """
    js = _ler("frontend/acesso-conta.js")
    assert "entrarEElevar" in js
    corpo = js[js.index("function entrarEElevar"):]
    corpo = corpo[:corpo.index("\n    }")]
    assert "entrar(" in corpo and "/elevar" in corpo


def test_a_senha_nao_e_guardada():
    """Ela vive no argumento da funcao e morre com ela."""
    js = _ler("frontend/acesso-conta.js")
    corpo = js[js.index("function entrarEElevar"):]
    corpo = corpo[:corpo.index("\n    }")]
    for guardar in ("localStorage", "sessionStorage", "indexedDB"):
        assert guardar not in corpo, "a senha encosta em " + guardar


def test_a_rota_do_aparelho_daqui_exige_elevacao():
    """Criar aparelho e escrita de configuracao. Sem elevacao, quem pegasse o
    celular do dono destrancado criaria portao."""
    ts = _ler("supabase/functions/acesso-conta/index.ts")
    corte = ts.index('p[3] === "aqui"')
    trecho = ts[corte:ts.index("return ok", corte)]
    assert "exigirElevacao" in trecho
