# -*- coding: utf-8 -*-
"""Lista de acessos vazia não substitui lista cheia.

## O modo de falhar que este arquivo existe para impedir

`acesso_local.ha_lista()` é o que responde ao `app.py` se a estação deve pedir
código no login. Com a lista vazia ela responde **não** — e o painel abre para
quem sentar na máquina. É o contrário do que a lista existe para fazer.

Até 16/08/2026 uma resposta vazia da nuvem era gravada como se fosse verdade. E
uma resposta vazia quase nunca significa "ninguém tem acesso": significa que a
leitura foi recusada. Vai significar isso literalmente quando o RLS fechar a
leitura de `imposition_acessos_locais` para a chave anônima — o passo 3 de
`sql/rls_acessos_e_permissoes.sql`. Sem este freio, aquele passo **destrancaria
onze computadores** em vez de trancar um vazamento.

Esvaziar de verdade continua possível: desative os operadores um a um, ou apague
a cópia da estação. O que não se faz por acidente é destrancar tudo com uma
requisição que voltou vazia.
"""
import io
import json
import os
import sys
import urllib.error

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import acesso_local
import agent_worker


LISTA = [
    {"codigo": "M9KGJD", "nome": "Bernardo", "role": "impressor", "ativo": True},
    {"codigo": "Y6P4KN", "nome": "Eduardo", "role": "admin", "ativo": True},
]


@pytest.fixture
def estacao(tmp_path, monkeypatch):
    """Uma estação com arquivo de acessos próprio, longe do da máquina real."""
    arquivo = tmp_path / "acessos_locais.json"
    monkeypatch.setattr(acesso_local, "ARQUIVO", str(arquivo))
    monkeypatch.setattr(agent_worker, "_relay_ativo", lambda: True)
    return arquivo


def _responder(monkeypatch, corpo):
    """O que a nuvem devolveu, seja qual for o caminho que a trouxe.

    Costura em `_acessos_da_nuvem` de propósito: estes testes são sobre o que a
    estação FAZ com a lista, e não sobre de onde ela veio. A origem tem os seus,
    mais abaixo — e costurar mais fundo faria estes aqui saírem à rede de
    verdade na máquina de quem tem o segredo do agente configurado.
    """
    monkeypatch.setattr(agent_worker, "_acessos_da_nuvem", lambda: corpo)


def test_a_lista_boa_e_gravada(estacao, monkeypatch):
    _responder(monkeypatch, LISTA)
    assert agent_worker.sincronizar_acessos() is True
    assert len(acesso_local.carregar_lista()) == 2
    assert acesso_local.ha_lista()


def test_lista_vazia_nao_apaga_a_que_estava(estacao, monkeypatch):
    """O caso que destrancaria a estação."""
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()

    _responder(monkeypatch, [])
    assert agent_worker.sincronizar_acessos() is False, "não devia ter gravado"

    assert len(acesso_local.carregar_lista()) == 2, "a lista boa foi apagada"
    assert acesso_local.ha_lista(), "a estação parou de pedir código"


def test_a_estacao_continua_pedindo_o_codigo_certo(estacao, monkeypatch):
    """Não basta a lista sobreviver: o login tem de continuar funcionando."""
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()
    _responder(monkeypatch, [])
    agent_worker.sincronizar_acessos()

    assert acesso_local.validar("Y6P4KN"), "o código bom parou de entrar"
    assert not acesso_local.validar("XXXXXX")


def test_instalacao_nova_com_lista_vazia_continua_sem_lista(estacao, monkeypatch):
    """Numa estação que nunca recebeu lista, vazio é vazio mesmo.

    Ali a resposta certa é a de sempre: sem lista sincronizada, o painel entra
    como entrava antes. Parar a produção por falta de rede seria pior do que o
    problema que a tranca resolve — é o que o próprio `estado_login_local`
    documenta.
    """
    _responder(monkeypatch, [])
    agent_worker.sincronizar_acessos()
    assert acesso_local.carregar_lista() == []
    assert not acesso_local.ha_lista()


def test_erro_de_rede_nao_toca_na_copia(estacao, monkeypatch):
    _responder(monkeypatch, LISTA)
    agent_worker.sincronizar_acessos()

    _responder(monkeypatch, None)
    assert agent_worker.sincronizar_acessos() is False
    assert len(acesso_local.carregar_lista()) == 2


# ─── De onde a lista vem ──────────────────────────────────────────────────────


class _Resposta:
    def __init__(self, corpo):
        self.corpo = corpo

    def read(self):
        return json.dumps(self.corpo).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _edge(monkeypatch, corpo=None, falhar=False):
    """Finge a Edge Function e conta se ela foi mesmo chamada."""
    vistas = []

    def urlopen(req, timeout=None):
        vistas.append({"url": req.full_url,
                       "segredo": req.headers.get("X-agente-segredo")})
        if falhar:
            raise OSError("rede fora")
        return _Resposta(corpo if corpo is not None else LISTA)

    monkeypatch.setattr(agent_worker.urllib.request, "urlopen", urlopen)
    return vistas


def test_a_lista_vem_pelo_caminho_autenticado(monkeypatch):
    """O que fecha o vazamento: o código não viaja mais pela chave pública."""
    vistas = _edge(monkeypatch)
    monkeypatch.setattr(agent_worker, "_supabase_request",
                        lambda *a, **k: pytest.fail("caiu no caminho antigo"))

    assert agent_worker._acessos_da_nuvem() == LISTA
    assert vistas[0]["url"].endswith("/api/acesso/acessos-locais")
    assert vistas[0]["segredo"], "a chamada saiu sem o segredo do agente"


def test_falha_da_edge_function_cai_no_caminho_antigo(monkeypatch):
    """Enquanto a leitura direta existir, uma falha do caminho novo não pode
    deixar a estação sem lista — são onze máquinas atualizando cada uma no seu
    ritmo."""
    _edge(monkeypatch, falhar=True)
    monkeypatch.setattr(agent_worker, "_supabase_request", lambda *a, **k: LISTA)

    assert agent_worker._acessos_da_nuvem() == LISTA


def test_sem_segredo_do_agente_usa_o_caminho_antigo(monkeypatch):
    import acesso_publicacao
    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: None)
    monkeypatch.setattr(agent_worker, "_supabase_request", lambda *a, **k: LISTA)

    assert agent_worker._acessos_da_nuvem() == LISTA


def test_os_dois_caminhos_fora_nao_e_lista_vazia(monkeypatch):
    """`None` e não `[]`: a diferença entre 'não mexa na cópia' e 'não há mais
    ninguém com acesso'. Confundir as duas destranca a estação."""
    _edge(monkeypatch, falhar=True)
    monkeypatch.setattr(agent_worker, "_supabase_request", lambda *a, **k: None)

    assert agent_worker._acessos_da_nuvem() is None


# ─── O que o passo 3 do RLS devolve ───────────────────────────────────────────


def test_leitura_revogada_e_erro_e_nao_lista_vazia(estacao, monkeypatch):
    """O que torna `sql/rls_passo3_fechar_leitura.sql` seguro HOJE.

    Fechar a leitura tem duas formas, e elas não são equivalentes do lado de cá:

        RLS sem política de SELECT  ->  200 com corpo `[]`
        REVOKE SELECT               ->  401 `permission denied for table`

    O `_supabase_request` devolve `None` em erro de HTTP — e devolvia desde
    11/08/2026, quando o login local nasceu. Quer dizer que o 401 do REVOKE
    chega ao agente ANTIGO na única língua de recusa que ele já sabia ouvir, e
    a cópia da estação sobrevive sem depender do freio de 1.2.96.

    Este teste costura no `urlopen`, e não em `_acessos_da_nuvem`, justamente
    porque o que está sendo verificado é a tradução do 401 em `None`.
    """
    # A cópia é semeada direto, e não pelo `_responder`: ele substitui o próprio
    # `_acessos_da_nuvem`, que é justamente a função sob teste aqui.
    acesso_local.salvar_lista(LISTA)
    assert acesso_local.ha_lista()

    negado = urllib.error.HTTPError(
        "https://exemplo/rest/v1/imposition_acessos_locais", 401, "Unauthorized",
        {}, io.BytesIO(b'{"code":"42501","message":"permission denied for table"}'))

    def urlopen(req, timeout=None):
        raise negado

    monkeypatch.setattr(agent_worker.urllib.request, "urlopen", urlopen)

    assert agent_worker._acessos_da_nuvem() is None, "401 virou lista vazia"
    assert agent_worker.sincronizar_acessos() is False
    assert len(acesso_local.carregar_lista()) == 2, "a cópia foi apagada"
    assert acesso_local.ha_lista(), "a estação parou de pedir código"
    assert acesso_local.validar("Y6P4KN")
