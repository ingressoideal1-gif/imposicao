# -*- coding: utf-8 -*-
"""O catálogo de fontes é local por decisão — e não fala com o Supabase.

## Por que este arquivo existe

A tabela `catalogo_fontes` nunca existiu no Supabase. O `sql/schema_catalogo_fontes.sql`
ficou escrito e não aplicado de 30/07/2026 a 14/08/2026. Nesse período o `db.py` pedia a
tabela, tomava 404 e caía no catálogo local — o resultado certo, pelo caminho errado, com
duas linhas vermelhas no log a cada partida do motor.

Isso não quebrava nada, e é exatamente o que o torna perigoso: **log vermelho de rotina
treina qualquer um a ignorar log vermelho**. No dia em que uma linha vermelha importasse,
ela estaria no meio do ruído.

Em 14/08/2026 o usuário decidiu apagar o SQL. O catálogo é local, mora no
`formats_db.json`, e o código não pode mais tentar a tabela — nem "só uma vez por
arranque", como fazia a trava anterior. Este arquivo cobra isso nas duas frentes: no
comportamento das três funções e no texto do módulo.

Vale a distinção: o que ficou local é a **lista** de fontes. Os binários continuam no
Storage do Supabase, com o próprio sincronismo, e nada aqui os toca.
"""

import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


@pytest.fixture
def banco_de_mentira(monkeypatch):
    """Um `formats_db.json` de brinquedo, para não escrever no do repositório."""
    estado = {"catalogo_fontes": [{"id": "f1", "nome": "Impact", "font_family": "Impact"}]}
    monkeypatch.setattr(db, "_get_db", lambda: estado)
    monkeypatch.setattr(db, "_save_db", lambda d: estado.update(d))
    return estado


@pytest.fixture
def rede_proibida(monkeypatch):
    """Qualquer ida ao Supabase durante o teste vira falha, com o caminho no erro."""
    def _explode(method, path, body=None):
        raise AssertionError(
            f"o catalogo de fontes voltou a falar com o Supabase: {method} {path}"
        )
    monkeypatch.setattr(db, "_supabase_request", _explode)
    # A decisao vale mesmo com o Supabase ligado — que e o caso do motor no Render,
    # justamente onde as duas linhas vermelhas apareciam.
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)


def test_listar_nao_consulta_o_supabase(banco_de_mentira, rede_proibida):
    assert [f["id"] for f in db.get_catalogo_fontes()] == ["f1"]


def test_salvar_nao_consulta_o_supabase(banco_de_mentira, rede_proibida):
    salva = db.save_catalogo_fonte({"nome": "Roboto", "font_family": "Roboto"})
    assert salva["id"], "toda fonte salva precisa de id"
    assert {f["nome"] for f in banco_de_mentira["catalogo_fontes"]} == {"Impact", "Roboto"}


def test_salvar_com_id_existente_substitui_em_vez_de_duplicar(banco_de_mentira, rede_proibida):
    db.save_catalogo_fonte({"id": "f1", "nome": "Impact", "font_family": "Impact Bold"})
    fontes = banco_de_mentira["catalogo_fontes"]
    assert len(fontes) == 1
    assert fontes[0]["font_family"] == "Impact Bold"


def test_apagar_nao_consulta_o_supabase(banco_de_mentira, rede_proibida):
    db.delete_catalogo_fonte("f1")
    assert banco_de_mentira["catalogo_fontes"] == []


def test_listar_devolve_copia_da_lista(banco_de_mentira, rede_proibida):
    """Quem chama a API nao pode mexer no banco em memoria sem passar por `_save_db`."""
    lista = db.get_catalogo_fontes()
    lista.append({"id": "intruso"})
    assert [f["id"] for f in banco_de_mentira["catalogo_fontes"]] == ["f1"]


def test_o_sql_que_nunca_foi_aplicado_foi_apagado():
    """Manter o arquivo era o convite para alguem 'consertar' aplicando a tabela.

    O problema nunca foi a falta da tabela: era o codigo consultar uma tabela que a
    decisao do projeto diz que nao existe.
    """
    assert not os.path.exists(os.path.join(RAIZ, "sql", "schema_catalogo_fontes.sql"))


def test_o_modulo_nao_pede_a_tabela_remota_em_lugar_nenhum():
    """Guarda de fonte, alem da guarda de comportamento.

    A chave do dicionario local tambem se chama `catalogo_fontes` (é o mesmo nome no
    `formats_db.json`), entao procurar so o nome acusaria as leituras legitimas. O que
    caracteriza a ida a rede e o `_supabase_request` na mesma linha.

    Comentario citando a tabela pode — e deve, porque a decisao precisa ficar explicada
    onde o proximo leitor vai procurar.
    """
    with open(os.path.join(RAIZ, "db.py"), encoding="utf-8") as f:
        linhas = f.read().splitlines()
    culpadas = [
        (n, linha.strip())
        for n, linha in enumerate(linhas, 1)
        if "_supabase_request" in linha and "catalogo_fontes" in linha
    ]
    assert not culpadas, f"db.py voltou a consultar a tabela remota: {culpadas}"
