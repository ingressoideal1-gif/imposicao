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
            for linha in alvo:
                linha.update(body)
            return alvo
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
