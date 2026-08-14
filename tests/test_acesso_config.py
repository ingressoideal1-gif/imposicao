# -*- coding: utf-8 -*-
"""A tela do dono: quem lê, quem escreve, e a guarda que não pode ser esquecida.

O evento é do dono. Toda leitura confere isso, e a conferência mora num auxiliar
só — `_evento_do_dono` — porque espalhá-la por oito funções é como ela some de
uma delas.

A resposta para "não existe" e para "não é seu" é a MESMA. Dizer a diferença
contaria a um estranho quais eventos existem.
"""

import pytest
from fastapi import HTTPException

import acesso_config as cfg

EVENTO = "11111111-1111-1111-1111-111111111111"
DONO = {"id": "22222222-2222-2222-2222-222222222222", "email": "dono@cliente.com"}
ESTRANHO = {"id": "99999999-9999-9999-9999-999999999999", "email": "outro@x.com"}
SETOR = "33333333-3333-3333-3333-333333333333"
APARELHO = "44444444-4444-4444-4444-444444444444"


class FakeBanco:
    """Um Supabase de mentira, no mesmo espírito do tests/test_acesso_api.py."""

    def __init__(self):
        self.eventos = [{
            "id": EVENTO, "dono_auth_id": DONO["id"], "nome_evento": "Baile",
            "data_evento": None, "local_evento": None, "status": "ativo",
            "sal": "ab" * 32,
        }]
        self.setores = [{
            "id": SETOR, "evento_id": EVENTO, "nome": "PISTA", "quantidade": 5000,
            "lotacao": None, "tipo_uso": "unico", "pedido_id_int": 18560,
            "modelo_id": 1000110, "status": "ativo",
        }]
        self.dispositivos = []
        self.dispositivo_setores = []
        self.credenciais = []
        self.pedidos = [{"pedido_id_int": 18560, "evento_id": EVENTO,
                         "publicado_em": "2026-08-14T00:00:00Z", "total_credenciais": 5000}]
        # Registro das chamadas, para o teste que confere que um evento sem
        # aparelho nem chega a consultar `producao_acesso_dispositivo_setores`.
        self.chamadas = []

    def _tabela(self, path):
        nome = path.split("?")[0]
        return {
            "producao_acesso_eventos": self.eventos,
            "producao_acesso_setores": self.setores,
            "producao_acesso_dispositivos": self.dispositivos,
            "producao_acesso_dispositivo_setores": self.dispositivo_setores,
            "producao_acesso_credenciais": self.credenciais,
            "producao_acesso_pedidos": self.pedidos,
        }[nome]

    @staticmethod
    def _id_filtrado(path):
        """O valor de `id=eq.<...>` na URL, se a chamada trouxer um.

        Só este filtro é honrado aqui: os outros que o código de produção usa
        em PATCH (`pedido_id_int=eq.`, e futuramente `dispositivo_id=eq.` na
        Tarefa 6) não aparecem em nenhuma tabela com mais de uma linha nesta
        fixture hoje, e resolvê-los fica para quando isso mudar. Sem este
        filtro, um PATCH gravava a tabela inteira e nenhum teste conseguia
        distinguir "mirou o id certo" de "mirou todo mundo" — a tabela nunca
        tinha uma segunda linha para denunciar a diferença.
        """
        if "?" not in path:
            return None
        for par in path.split("?", 1)[1].split("&"):
            if par.startswith("id=eq."):
                return par[len("id=eq."):]
        return None

    @staticmethod
    def _campos_selecionados(path):
        """O `select=` do PostgREST devolve só as colunas pedidas.

        O `_painel()` conta com isso para nunca mandar o `sal` do evento: ele
        simplesmente não está na lista. Sem esta filtragem aqui, o fake
        devolveria a linha inteira e o teste do vazamento nunca pegaria uma
        regressão de verdade.
        """
        if "?" not in path:
            return None
        for par in path.split("?", 1)[1].split("&"):
            if par.startswith("select="):
                return set(par[len("select="):].split(","))
        return None

    def __call__(self, method, path, body=None, prefer=None):
        self.chamadas.append((method, path))
        alvo = self._tabela(path)
        if method == "GET":
            linhas = [dict(l) for l in alvo]
            campos = self._campos_selecionados(path)
            if campos:
                linhas = [{k: v for k, v in l.items() if k in campos} for l in linhas]
            return linhas
        if method == "POST":
            linhas = body if isinstance(body, list) else [body]
            criadas = []
            for l in linhas:
                linha = dict(l)
                linha.setdefault("id", f"novo-{len(alvo)}")
                alvo.append(linha)
                criadas.append(linha)
            return criadas
        if method == "PATCH":
            id_alvo = self._id_filtrado(path)
            # Sem filtro de `id`, mantém o comportamento antigo (grava a
            # tabela inteira) — nenhuma chamada de produção faz isso hoje,
            # mas não é este o filtro que esta correção resolve.
            alcancadas = [l for l in alvo if id_alvo is None or str(l.get("id")) == id_alvo]
            for linha in alcancadas:
                linha.update(body)
            return alcancadas
        if method == "DELETE":
            alvo.clear()
            return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(cfg, "supabase", b)

    def _contar(path):
        if "origem=eq.cliente" in path:
            return len([c for c in b.credenciais if c.get("origem") == "cliente"])
        return len(b.credenciais)
    monkeypatch.setattr(cfg, "contar", _contar)
    return b


# ── A guarda ────────────────────────────────────────────────────────────────

def test_o_dono_alcanca_o_proprio_evento(banco):
    assert cfg._evento_do_dono(EVENTO, DONO)["id"] == EVENTO


def test_conta_estranha_e_recusada(banco):
    with pytest.raises(HTTPException) as e:
        cfg._evento_do_dono(EVENTO, ESTRANHO)
    assert e.value.status_code == 403


def test_evento_inexistente_da_a_MESMA_resposta_de_evento_alheio(banco):
    """Respostas diferentes contariam quais eventos existem."""
    banco.eventos.clear()
    with pytest.raises(HTTPException) as inexistente:
        cfg._evento_do_dono(EVENTO, DONO)
    assert inexistente.value.status_code == 403


# ── O painel ────────────────────────────────────────────────────────────────

def test_o_painel_traz_setores_aparelhos_e_pedidos(banco):
    painel = cfg._painel(EVENTO)
    assert painel["evento"]["nome_evento"] == "Baile"
    assert painel["setores"][0]["nome"] == "PISTA"
    assert painel["setores"][0]["quantidade"] == 5000
    assert painel["aparelhos"] == []
    assert painel["pedidos"][0]["pedido_id_int"] == 18560


def test_o_painel_compara_o_encomendado_com_o_publicado(banco):
    """A conferencia que a parte 2 prometeu.

    Quem tivesse o segredo do agente conseguiria ocupar uma posicao da tiragem
    com um hash proprio. A divergencia entre o que o ERP encomendou e o que esta
    publicado e onde isso apareceria.
    """
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR} for i in range(4999)]
    painel = cfg._painel(EVENTO)
    assert painel["setores"][0]["publicadas"] == 4999
    assert painel["setores"][0]["quantidade"] == 5000


def test_o_painel_nunca_devolve_o_sal_do_evento(banco):
    """O sal nao e segredo, mas nao tem uso nenhum nesta tela.

    Ele serve ao celular da portaria, na parte 3b, e la ele vai por outro
    caminho. Mandar o que nao se usa e como um vazamento nasce.
    """
    import json
    assert "sal" not in json.dumps(cfg._painel(EVENTO))


def test_o_painel_conta_os_codigos_do_cliente(banco):
    banco.credenciais = [
        {"id": "c1", "setor_id": SETOR, "origem": "cliente"},
        {"id": "c2", "setor_id": SETOR, "origem": "qr_ideal"},
    ]
    assert cfg._painel(EVENTO)["codigos_cliente"] == 1


def test_evento_sem_aparelho_nao_consulta_vinculos(banco):
    """`in.()` vazio e URL malformada — a consulta tem de nem sair.

    Sem este cuidado, um evento sem catraca cadastrada mandaria
    `dispositivo_id=in.()` para o PostgREST a cada abertura do painel.
    """
    cfg._painel(EVENTO)
    consultou_vinculos = any(
        p.startswith("producao_acesso_dispositivo_setores") for _m, p in banco.chamadas
    )
    assert not consultou_vinculos


def test_vinculos_de_aparelho_sao_filtrados_por_ele_e_nao_pelo_sistema_inteiro(banco):
    """A consulta escopada ao(s) aparelho(s) do evento, nao a tabela inteira.

    Antes deste ajuste, `_painel` trazia os vinculos de TODOS os eventos do
    sistema a cada abertura da tela e filtrava em Python depois — correto no
    resultado, mas uma leitura de tabela inteira que piora sozinha conforme
    eventos se acumulam.
    """
    banco.dispositivos = [{"id": APARELHO, "evento_id": EVENTO, "nome": "Catraca 1",
                            "status": "ativo", "ultimo_visto": None}]
    banco.dispositivo_setores = [{"dispositivo_id": APARELHO, "setor_id": SETOR}]

    painel = cfg._painel(EVENTO)

    consultas = [p for _m, p in banco.chamadas
                 if p.startswith("producao_acesso_dispositivo_setores")]
    assert len(consultas) == 1
    assert f"dispositivo_id=in.({APARELHO})" in consultas[0]
    assert painel["aparelhos"][0]["setores"] == [SETOR]


# ── A montagem do router ────────────────────────────────────────────────────

def test_o_router_da_configuracao_acompanha_o_da_publicacao():
    """Onde nao ha chave, nenhum dos dois existe."""
    import acesso_api
    import app

    tem_rota = any(getattr(r, "path", "") == "/api/acesso/eventos/{evento_id}"
                   for r in app.app.routes)
    assert tem_rota == acesso_api.disponivel()


# ── A elevação ──────────────────────────────────────────────────────────────

NAV = "55555555-5555-5555-5555-555555555555"


@pytest.fixture
def segredo_da_elevacao(monkeypatch):
    import acesso_elevacao
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-de-teste-longo-o-bastante")


@pytest.fixture
def senha_certa(monkeypatch):
    monkeypatch.setattr(cfg, "_conferir_senha", lambda email, senha: senha == "boa")


def test_a_senha_certa_eleva_por_quinze_minutos(banco, segredo_da_elevacao, senha_certa):
    import time
    r = cfg._elevar(EVENTO, DONO, "boa", NAV)
    assert r["token"]
    assert 14 * 60 < r["expira_em"] - time.time() <= 15 * 60


def test_a_senha_errada_nao_eleva(banco, segredo_da_elevacao, senha_certa):
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, DONO, "ruim", NAV)
    assert e.value.status_code == 401


def test_nao_eleva_para_evento_alheio_nem_com_a_senha_certa(banco, segredo_da_elevacao, senha_certa):
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, ESTRANHO, "boa", NAV)
    assert e.value.status_code == 403


def test_a_elevacao_recem_emitida_e_aceita(banco, segredo_da_elevacao, senha_certa):
    token = cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]
    cfg._exigir_elevacao(EVENTO, DONO, token, NAV)   # não levanta


def test_escrita_sem_elevacao_e_recusada_com_codigo_proprio(banco, segredo_da_elevacao):
    """A tela precisa distinguir 'sessao caiu' de 'elevacao venceu'.

    Sao consertos diferentes: um manda entrar de novo, o outro so pede a senha
    do dono. Confundi-los faz a tela deslogar quem nao precisava.
    """
    with pytest.raises(HTTPException) as e:
        cfg._exigir_elevacao(EVENTO, DONO, None, NAV)
    assert e.value.status_code == 401
    assert e.value.detail["codigo"] == "elevacao_expirada"


def test_elevacao_de_outro_navegador_e_recusada(banco, segredo_da_elevacao, senha_certa):
    token = cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]
    with pytest.raises(HTTPException) as e:
        cfg._exigir_elevacao(EVENTO, DONO, token, "66666666-6666-6666-6666-666666666666")
    assert e.value.detail["codigo"] == "elevacao_expirada"


def test_servidor_sem_segredo_de_elevacao_recusa_elevar(banco, senha_certa, monkeypatch):
    """Falha FECHADA, e com o nome da variavel na mensagem."""
    import acesso_elevacao
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(acesso_elevacao.SEGREDO_ENV, raising=False)
    with pytest.raises(HTTPException) as e:
        cfg._elevar(EVENTO, DONO, "boa", NAV)
    assert e.value.status_code == 503
    assert "ACESSO_ELEVACAO_SEGREDO" in str(e.value.detail)


# ── Gravar evento e setor ───────────────────────────────────────────────────

@pytest.fixture
def elevado(banco, segredo_da_elevacao, senha_certa):
    return cfg._elevar(EVENTO, DONO, "boa", NAV)["token"]


def test_gravar_o_nome_do_evento(banco, elevado):
    cfg._gravar_evento(EVENTO, DONO, elevado, NAV,
                       {"nome_evento": "Baile do Hawaii", "local_evento": "Clube"})
    assert banco.eventos[0]["nome_evento"] == "Baile do Hawaii"
    assert banco.eventos[0]["local_evento"] == "Clube"


def test_nome_de_evento_vazio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_evento(EVENTO, DONO, elevado, NAV, {"nome_evento": "   "})
    assert e.value.status_code == 422


def test_gravar_lotacao_e_tipo_de_uso_do_setor(banco, elevado):
    cfg._gravar_setor(SETOR, DONO, elevado, NAV,
                      {"lotacao": 4800, "tipo_uso": "reentrada"})
    assert banco.setores[0]["lotacao"] == 4800
    assert banco.setores[0]["tipo_uso"] == "reentrada"


def test_lotacao_pode_ser_apagada(banco, elevado):
    """Nulo quer dizer sem limite, e o dono precisa poder voltar atras."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": 4800})
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": None})
    assert banco.setores[0]["lotacao"] is None


def test_lotacao_negativa_e_recusada(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": -1})
    assert e.value.status_code == 422


def test_tipo_de_uso_inventado_e_recusado(banco, elevado):
    """So `unico` e `reentrada` existem. Um terceiro valor passaria pelo banco,
    que aceita texto livre, e a portaria decidiria errado na hora da fila."""
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"tipo_uso": "as_vezes"})
    assert e.value.status_code == 422


def test_a_quantidade_do_setor_nao_e_editavel(banco, elevado):
    """Quem manda na tiragem e o ERP. Aceitar o campo aqui deixaria a tela
    'corrigir' um numero que nao e dela, e a divergencia com o publicado — que e
    justamente o alarme — passaria a ser silenciada pelo proprio alarme."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"quantidade": 1})
    assert banco.setores[0]["quantidade"] == 5000


def test_setor_de_evento_alheio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, ESTRANHO, elevado, NAV, {"lotacao": 10})
    assert e.value.status_code == 403


def test_gravar_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, None, NAV, {"lotacao": 10})
    assert e.value.status_code == 401


def test_gravar_um_setor_nao_atinge_o_outro(banco, elevado):
    """Regressao da fixture, nao so do codigo de producao.

    Com uma linha so em `banco.setores`, nenhum teste acima provava que o
    PATCH mirava o id certo — só provava que a tabela inteira tinha o valor
    esperado. Uma segunda linha aqui é o que faria um bug (trocar `setor_id`
    por outra coisa na URL, por exemplo) aparecer: ela vazaria a gravação
    para o setor errado, e este teste pegaria.
    """
    outro_setor = "77777777-7777-7777-7777-777777777777"
    banco.setores.append({
        "id": outro_setor, "evento_id": EVENTO, "nome": "VIP", "quantidade": 200,
        "lotacao": None, "tipo_uso": "unico", "pedido_id_int": 18560,
        "modelo_id": 1000110, "status": "ativo",
    })

    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": 4800, "tipo_uso": "reentrada"})

    assert banco.setores[0]["lotacao"] == 4800
    assert banco.setores[0]["tipo_uso"] == "reentrada"
    outro = next(s for s in banco.setores if s["id"] == outro_setor)
    assert outro["lotacao"] is None
    assert outro["tipo_uso"] == "unico"
