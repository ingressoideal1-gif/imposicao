# -*- coding: utf-8 -*-
"""O catálogo de fontes é uma lista só — e a estação nunca vai à rede para lê-la.

## Por que este arquivo existe

Até 15/08/2026 a lista de fontes era um arquivo em disco na máquina que respondia ao
painel. Quando o operador abria o painel pelo **site publicado**, quem respondia era o
Render, cujo disco volta ao conteúdo versionado a cada publicação. Quatro fontes
cadastradas em 14/08 sumiram na publicação seguinte; a numeração 1000289 passou a
mostrar o nome da fonte no seletor e a desenhar com outra, porque o elemento guarda
apenas o NOME e nada mais resolvia aquele nome.

Guardar só na estação não resolveria: o link que o cliente abre para aprovar a arte lê
o catálogo da nuvem. Uma fonte que existisse apenas numa estação faria o cliente
aprovar arte com a fonte errada.

Este arquivo substitui o `test_catalogo_fontes_local.py`, que travava a decisão
anterior ("o catálogo é local, e ponto"). A decisão mudou; a garantia de desempenho que
vinha junto com ela, não — e é ela que os primeiros testes daqui protegem.

## A garantia que não pode cair

A imposição roda na estação por causa de tempo: o operador está de pé na frente da
impressora. Ler o catálogo é passo obrigatório de toda imposição, então **a estação lê
sempre do disco**, e quem atualiza o disco é o sincronismo em segundo plano. Se um dia
uma consulta ao Supabase entrar nesse caminho, os dois primeiros testes falham.
"""

import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


@pytest.fixture(autouse=True)
def sem_memoria_entre_testes():
    """A memória de 60s do catálogo não pode vazar de um teste para o outro."""
    def limpar():
        db._CATALOGO_MEMO.update(
            {"lista": None, "expira": 0.0, "tentar_depois_de": 0.0, "avisou": False})

    limpar()
    yield
    limpar()


@pytest.fixture
def banco_de_mentira(monkeypatch):
    """Um `formats_db.json` de brinquedo, para não escrever no do repositório."""
    estado = {"catalogo_fontes": [{"id": "f1", "nome": "Impact", "font_family": "Impact"}]}
    monkeypatch.setattr(db, "_get_db", lambda: estado)
    monkeypatch.setattr(db, "_save_db", lambda d: estado.update(d))
    return estado


@pytest.fixture
def estacao(monkeypatch):
    """A máquina da gráfica: lê do disco e qualquer ida à rede vira falha."""
    def _explode(method, path, body=None):
        raise AssertionError(
            f"a estacao foi a rede para ler o catalogo: {method} {path}")
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)
    monkeypatch.setattr(db, "_supabase_request", _explode)
    monkeypatch.setattr(db, "_supabase_call", _explode)
    monkeypatch.setattr(db, "_catalogo_remoto_ativo", lambda: False)


# ── A garantia de desempenho ────────────────────────────────────────────────────

def test_a_estacao_le_o_catalogo_do_disco_sem_tocar_na_rede(banco_de_mentira, estacao):
    assert [f["id"] for f in db.get_catalogo_fontes()] == ["f1"]


def test_a_estacao_le_do_disco_mesmo_repetindo_a_leitura(banco_de_mentira, estacao):
    """A imposição lê o catálogo uma vez por trabalho; nenhuma delas pode ir à rede."""
    for _ in range(5):
        assert len(db.get_catalogo_fontes()) == 1


def test_listar_devolve_copia_da_lista(banco_de_mentira, estacao):
    """Quem chama a API não pode mexer no banco em memória sem passar por `_save_db`."""
    lista = db.get_catalogo_fontes()
    lista.append({"id": "intruso"})
    assert [f["id"] for f in banco_de_mentira["catalogo_fontes"]] == ["f1"]


# ── A armadilha que já mordeu a fila de impressão ───────────────────────────────

def test_escrever_nao_depende_de_is_supabase_active(monkeypatch):
    """`IS_SUPABASE_ACTIVE` é False de propósito no executável, para a LEITURA ser
    local. Amarrar a ESCRITA à mesma flag faria a fonte cadastrada numa estação morrer
    ali mesmo, sem chegar às outras nem ao link do cliente.

    É o mesmo erro que já desligou a fila de impressão por acidente — ver
    `agent_worker._relay_ativo`.
    """
    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)
    monkeypatch.setattr(db, "SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setattr(db, "SUPABASE_KEY", "chave")
    assert db._catalogo_remoto_ativo() is True


def test_a_estacao_grava_a_fonte_nova_na_tabela_compartilhada(banco_de_mentira, monkeypatch):
    """Cadastrar na estação tem de chegar à tabela — senão a fonte não sai dali."""
    chamadas = []

    def _falso(method, path, body=None):
        chamadas.append((method, path))
        return [dict(body or {})]

    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)   # executável
    monkeypatch.setattr(db, "_catalogo_remoto_ativo", lambda: True)
    monkeypatch.setattr(db, "_supabase_call", _falso)

    db.save_catalogo_fonte({"nome": "Gotham Book", "font_family": "Gotham Book"})

    assert ("POST", "catalogo_fontes") in chamadas
    assert {f["nome"] for f in banco_de_mentira["catalogo_fontes"]} == {"Impact", "Gotham Book"}


# ── Nunca zerar o catálogo por causa de erro de rede ────────────────────────────

def test_lista_vazia_nao_apaga_a_copia_do_disco(banco_de_mentira):
    """Um erro que devolvesse `[]` deixaria a estação sem fonte nenhuma, e toda arte
    sairia em Helvetica sem ninguém entender por quê."""
    assert db.guardar_catalogo_local([]) is False
    assert [f["id"] for f in banco_de_mentira["catalogo_fontes"]] == ["f1"]


def test_tabela_indisponivel_cai_para_o_disco(banco_de_mentira, monkeypatch):
    """No Render, o link do cliente sem catálogo desenharia tudo com fonte genérica."""
    def _quebra(method, path, body=None):
        raise RuntimeError("404 tabela nao existe")

    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "_supabase_call", _quebra)

    assert [f["id"] for f in db.get_catalogo_fontes()] == ["f1"]


def test_tabela_indisponivel_nao_repete_a_consulta_a_cada_leitura(banco_de_mentira, monkeypatch):
    """Log vermelho de rotina treina qualquer um a ignorar log vermelho — foi metade do
    motivo de o catálogo ter virado local em 14/08. Enquanto a tabela não existir, a
    consulta é adiada, não repetida a cada elemento desenhado."""
    tentativas = []

    def _quebra(method, path, body=None, silencioso=False):
        tentativas.append(path)
        raise RuntimeError("404 tabela nao existe")

    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", True)
    monkeypatch.setattr(db, "_supabase_call", _quebra)

    for _ in range(10):
        assert len(db.get_catalogo_fontes()) == 1
    assert len(tentativas) == 1, f"consultou {len(tentativas)}x em vez de 1"


def test_guardar_catalogo_local_avisa_quando_nao_mudou(banco_de_mentira):
    """O sincronismo só rebaixa binário quando a lista muda de verdade."""
    igual = list(banco_de_mentira["catalogo_fontes"])
    assert db.guardar_catalogo_local(igual) is False
    assert db.guardar_catalogo_local([{"id": "f2", "nome": "Anton"}]) is True


# ── Duplicata ───────────────────────────────────────────────────────────────────

def test_duplicata_mantem_a_fonte_que_ja_estava(banco_de_mentira, monkeypatch):
    """Trocar o binário de uma fonte já usada em arte aprovada mudaria, em silêncio, o
    que sai impresso. O índice único da tabela recusa; aqui isso vira "fica a que
    estava"."""
    ja_existente = {"id": "f1", "nome": "Impact", "font_family": "Impact",
                    "arquivo_url": "https://exemplo/antiga.ttf"}

    def _falso(method, path, body=None):
        if method == "POST":
            raise RuntimeError('duplicate key value violates unique constraint (23505)')
        return [ja_existente]

    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)
    monkeypatch.setattr(db, "_catalogo_remoto_ativo", lambda: True)
    monkeypatch.setattr(db, "_supabase_call", _falso)

    devolvida = db.save_catalogo_fonte(
        {"nome": "Impact", "font_family": "Impact",
         "arquivo_url": "https://exemplo/nova.ttf"})

    assert devolvida["arquivo_url"] == "https://exemplo/antiga.ttf"
    assert len(banco_de_mentira["catalogo_fontes"]) == 1


def test_salvar_com_id_existente_substitui_em_vez_de_duplicar(banco_de_mentira, estacao):
    db.save_catalogo_fonte({"id": "f1", "nome": "Impact", "font_family": "Impact Bold"})
    fontes = banco_de_mentira["catalogo_fontes"]
    assert len(fontes) == 1
    assert fontes[0]["font_family"] == "Impact Bold"


# ── Apagar ──────────────────────────────────────────────────────────────────────

def test_apagar_tira_da_tabela_e_do_disco(banco_de_mentira, monkeypatch):
    chamadas = []

    def _falso(method, path, body=None):
        chamadas.append((method, path))
        return None

    monkeypatch.setattr(db, "IS_SUPABASE_ACTIVE", False)
    monkeypatch.setattr(db, "_catalogo_remoto_ativo", lambda: True)
    monkeypatch.setattr(db, "_supabase_call", _falso)

    db.delete_catalogo_fonte("f1")

    assert chamadas == [("DELETE", "catalogo_fontes?id=eq.f1")]
    assert banco_de_mentira["catalogo_fontes"] == []


def test_apagar_sem_rede_ainda_limpa_o_disco(banco_de_mentira, monkeypatch):
    """Rede fora não pode travar a tela do operador."""
    def _quebra(method, path, body=None):
        raise RuntimeError("sem rede")

    monkeypatch.setattr(db, "_catalogo_remoto_ativo", lambda: True)
    monkeypatch.setattr(db, "_supabase_call", _quebra)

    db.delete_catalogo_fonte("f1")
    assert banco_de_mentira["catalogo_fontes"] == []


# ── A ordem que o usuário pediu: a tabela antes do código ───────────────────────

def test_o_sql_da_tabela_existe_e_traz_as_fontes():
    """A decisão de 14/08 previu a própria reversão nestes termos: se um dia o catálogo
    precisasse ser compartilhado, voltaria "com a tabela criada antes do código que a
    consulta — não depois". O arquivo é o que torna essa ordem possível de cumprir.
    """
    caminho = os.path.join(RAIZ, "sql", "schema_catalogo_fontes.sql")
    assert os.path.exists(caminho), "o SQL da tabela precisa existir para ser aplicado"

    with open(caminho, encoding="utf-8") as f:
        sql = f.read()

    assert "create table if not exists public.catalogo_fontes" in sql
    assert "catalogo_fontes_nome_unico" in sql, "sem indice unico a duplicata volta"
    assert "Swiss 911 Extra Compressed" in sql, "as fontes recuperadas precisam entrar"
    linhas_de_fonte = sql.count("\n  ('")
    assert linhas_de_fonte >= 250, (
        f"a carga inicial das fontes tem de vir no arquivo; achei {linhas_de_fonte}")
