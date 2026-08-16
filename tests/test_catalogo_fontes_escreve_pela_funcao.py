# -*- coding: utf-8 -*-
"""A escrita no catálogo de fontes sai pela Edge Function, e não pela chave pública.

## O que foi medido em 16/08/2026

Com a chave anônima — a que está no código-fonte de toda página do painel —, numa
linha de verdade:

    PATCH catalogo_fontes?id=eq.<uma fonte real>  ->  200, linha alterada

Qualquer pessoa editava ou apagava o catálogo de fontes da gráfica. Não vaza
segredo; estraga produção, e para todo mundo de uma vez: o catálogo é
compartilhado desde 15/08/2026, então desenha a página do cliente, o Criador de
Arte e as onze estações.

## O que estes testes protegem

Fechar aquela porta (`sql/fontes_so_escrevem_pelas_funcoes.sql`) só é seguro
porque quem escreve de verdade ganhou outro caminho. Aqui é a estação: a mesma
função `acesso-estacao` e o mesmo `ACESSO_AGENTE_SEGREDO` que ela já carrega
para publicar faixa de códigos.

O modo de falhar contra o qual estes testes existem é conhecido e já aconteceu
duas vezes neste projeto: a fonte cadastrada numa estação **morria ali**, sem
nunca chegar às outras nem ao link do cliente, e sem erro na tela. Foi por isso
que `_catalogo_remoto_ativo` não depende de `IS_SUPABASE_ACTIVE` — e é por isso
que estes testes fixam que a escrita continua saindo mesmo com o Supabase
"desligado" neste processo, que é o caso do executável.
"""
import json
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


@pytest.fixture(autouse=True)
def sem_memoria_entre_testes():
    db._CATALOGO_MEMO.update(
        {"lista": None, "expira": 0.0, "tentar_depois_de": 0.0, "avisou": False})
    yield


@pytest.fixture
def disco(monkeypatch):
    estado = {"catalogo_fontes": [{"id": "f1", "nome": "Impact"}]}
    monkeypatch.setattr(db, "_get_db", lambda: estado)
    monkeypatch.setattr(db, "_save_db", lambda d: estado.update(d))
    return estado


class _Resposta:
    def __init__(self, corpo):
        self.corpo = corpo

    def read(self):
        return json.dumps(self.corpo).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def funcao(monkeypatch):
    """Finge a Edge Function e guarda como a chamada saiu."""
    import acesso_publicacao

    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: "segredo-do-agente")
    monkeypatch.setattr(
        acesso_publicacao, "_base",
        lambda: "https://exemplo.supabase.co/functions/v1/acesso-estacao")
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "SUPABASE_KEY", "chave-anonima")

    vistas = []

    def urlopen(req, timeout=None):
        vistas.append({
            "url": req.full_url,
            "metodo": req.get_method(),
            "segredo": req.headers.get("X-agente-segredo"),
            "corpo": json.loads(req.data.decode()) if req.data else None,
        })
        return _Resposta({"status": "success",
                          "fonte": {"id": "nova", "nome": "Bebas Neue"}})

    monkeypatch.setattr(db.urllib.request, "urlopen", urlopen)
    return vistas


def _nunca_pelo_postgrest(monkeypatch):
    monkeypatch.setattr(db, "_supabase_call", lambda *a, **k: pytest.fail(
        "a escrita voltou a sair pela chave anônima, direto no PostgREST"))


# ─── Cadastrar ────────────────────────────────────────────────────────────────


def test_cadastrar_sai_pela_funcao_com_o_segredo(disco, funcao, monkeypatch):
    _nunca_pelo_postgrest(monkeypatch)

    db.save_catalogo_fonte({"nome": "Bebas Neue", "arquivo_url": "https://x/y.ttf"})

    assert len(funcao) == 1
    assert funcao[0]["metodo"] == "POST"
    assert funcao[0]["url"].endswith("/api/acesso/fontes")
    assert funcao[0]["segredo"] == "segredo-do-agente"
    assert funcao[0]["corpo"]["nome"] == "Bebas Neue"


def test_a_fonte_gravada_e_a_que_a_funcao_devolveu(disco, funcao, monkeypatch):
    """E não a que a tela mandou.

    A função resolve duplicata de nome devolvendo a fonte que JÁ estava — nunca
    trocar o binário de uma fonte usada em arte aprovada. Ignorar a resposta
    apagaria essa regra do lado de cá.
    """
    _nunca_pelo_postgrest(monkeypatch)

    gravada = db.save_catalogo_fonte({"nome": "Bebas Neue"})
    assert gravada["id"] == "nova"


def test_a_copia_em_disco_continua_sendo_atualizada(disco, funcao, monkeypatch):
    """A estação lê o catálogo do disco em toda imposição — é a garantia de
    tempo que fez o catálogo ser local em primeiro lugar."""
    _nunca_pelo_postgrest(monkeypatch)

    db.save_catalogo_fonte({"nome": "Bebas Neue"})
    nomes = [f.get("nome") for f in disco["catalogo_fontes"]]
    assert "Bebas Neue" in nomes
    assert "Impact" in nomes, "a fonte que já existia sumiu"


def test_a_estacao_escreve_mesmo_com_o_supabase_desligado(disco, funcao, monkeypatch):
    """`IS_SUPABASE_ACTIVE` é False no executável DE PROPÓSITO, para o catálogo
    ser lido do disco. Amarrar a escrita a essa flag já matou o cadastro de
    fonte duas vezes."""
    _nunca_pelo_postgrest(monkeypatch)
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)

    db.save_catalogo_fonte({"nome": "Bebas Neue"})
    assert len(funcao) == 1, "a estação parou de publicar a fonte"


# ─── Remover ──────────────────────────────────────────────────────────────────


def test_remover_sai_pela_funcao(disco, funcao, monkeypatch):
    _nunca_pelo_postgrest(monkeypatch)

    db.delete_catalogo_fonte("f1")

    assert funcao[0]["metodo"] == "DELETE"
    assert funcao[0]["url"].endswith("/api/acesso/fontes/f1")
    assert funcao[0]["segredo"] == "segredo-do-agente"
    assert disco["catalogo_fontes"] == []


# ─── Quando o caminho novo não está disponível ────────────────────────────────


def test_sem_segredo_a_falha_e_ruidosa_e_a_copia_local_fica(disco, monkeypatch, capsys):
    """Sem segredo não há como publicar, e o certo é dizer isso.

    A fonte continua salva nesta máquina — perder o cadastro por não poder
    compartilhá-lo seria pior. Mas a linha no log é o que permite descobrir que
    ela não chegou às outras estações.
    """
    import acesso_publicacao
    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: None)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "SUPABASE_KEY", "chave-anonima")
    _nunca_pelo_postgrest(monkeypatch)

    db.save_catalogo_fonte({"nome": "Bebas Neue"})

    assert "Bebas Neue" in [f.get("nome") for f in disco["catalogo_fontes"]]
    assert "ACESSO_AGENTE_SEGREDO" in capsys.readouterr().out


# ─── A leitura NÃO muda ───────────────────────────────────────────────────────


def test_a_leitura_continua_pela_chave_publica(disco, monkeypatch):
    """A política do passo 3 do RLS não vale aqui: `cliente.html` não tem login
    e precisa das fontes para desenhar a arte. Nome de fonte não é segredo."""
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.invalido")
    monkeypatch.setattr(db, "SUPABASE_KEY", "chave-anonima")
    chamadas = []
    monkeypatch.setattr(db, "_supabase_call",
                        lambda m, c, *a, **k: chamadas.append((m, c)) or [])

    db.get_catalogo_fontes()
    assert chamadas and chamadas[0][0] == "GET"
