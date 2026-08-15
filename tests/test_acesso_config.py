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
            "abre_em": None, "fecha_em": None,
        }]
        self.dispositivos = []
        self.dispositivo_setores = []
        self.credenciais = []
        self.bloqueios = []
        self.pedidos = [{"pedido_id_int": 18560, "evento_id": EVENTO,
                         "publicado_em": "2026-08-14T00:00:00Z", "total_credenciais": 5000}]
        # A tabela do ERP de onde sai a faixa impressa do setor. A segunda
        # linha nao pertence a nenhum setor deste evento, de proposito: sem
        # ela, um `_painel` que pedisse a tabela inteira e casasse errado
        # passaria igual -- e a faixa de um pedido de outro cliente apareceria
        # no cartao deste.
        self.modelos = [
            {"id": 1000110, "numeracao_inicio": 201, "numeracao_fim": 5200,
             "quantidade": 5000},
            {"id": 1000999, "numeracao_inicio": 1, "numeracao_fim": 9,
             "quantidade": 9},
        ]
        # Registro das chamadas, para o teste que confere que um evento sem
        # aparelho nem chega a consultar `producao_acesso_dispositivo_setores`.
        self.chamadas = []
        # O mesmo, para as contagens: elas nao passam por `__call__`, porque
        # `contar()` e outra funcao do `acesso_api`.
        self.contagens = []

    def _tabela(self, path):
        nome = path.split("?")[0]
        return {
            "producao_acesso_eventos": self.eventos,
            "producao_acesso_setores": self.setores,
            "producao_acesso_dispositivos": self.dispositivos,
            "producao_acesso_dispositivo_setores": self.dispositivo_setores,
            "producao_acesso_credenciais": self.credenciais,
            "producao_acesso_pedidos": self.pedidos,
            "producao_acesso_bloqueios": self.bloqueios,
            "pedidos_modelos": self.modelos,
        }[nome]

    @staticmethod
    def _ids_em_lista(path):
        """Os valores de `id=in.(a,b,c)` na URL, se a chamada trouxer um.

        Honrado de verdade, e nao ignorado como um filtro qualquer, pela lição
        que a portaria deixou em 15/08/2026: um dublê mais generoso que o banco
        esconde justamente a classe de defeito em que a consulta pede a coisa
        errada. Sem isto, `_painel` podia pedir os modelos de qualquer pedido —
        ou nao filtrar nada — e a fixture devolveria a lista inteira do mesmo
        jeito, com o teste passando.
        """
        if "?" not in path:
            return None
        for par in path.split("?", 1)[1].split("&"):
            if par.startswith("id=in.("):
                dentro = par[len("id=in.("):].rstrip(")")
                return [v for v in dentro.split(",") if v]
        return None

    @staticmethod
    def _filtros_eq(path):
        """Todo `coluna=eq.valor` da URL, como dicionario.

        Honrar isso no GET importa a partir dos bloqueios: um bloqueio pertence
        a UM setor de UM evento, e sem filtro a fixture devolveria os bloqueios
        de todo mundo. O teste "nao traz bloqueio de outro evento" so consegue
        distinguir "filtrou certo" de "trouxe tudo" se o fake filtrar de
        verdade. `select`, `order` e `limit` nao sao filtro e ficam de fora
        naturalmente, porque nenhum deles usa `=eq.`.
        """
        filtros = {}
        if "?" not in path:
            return filtros
        for par in path.split("?", 1)[1].split("&"):
            if "=eq." in par:
                chave, valor = par.split("=eq.", 1)
                filtros[chave] = valor
        return filtros

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
            filtros = self._filtros_eq(path)
            linhas = [dict(l) for l in alvo
                      if all(str(l.get(k)) == v for k, v in filtros.items())]
            na_lista = self._ids_em_lista(path)
            if na_lista is not None:
                linhas = [l for l in linhas if str(l.get("id")) in na_lista]
            campos = self._campos_selecionados(path)
            if campos:
                linhas = [{k: v for k, v in l.items() if k in campos} for l in linhas]
            return linhas
        if method == "POST":
            linhas = body if isinstance(body, list) else [body]
            # `on_conflict=<coluna>` + `resolution=ignore-duplicates`, no
            # mesmo espirito da chave unica `uq_acesso_credencial_hash_simples`
            # de verdade: reenviar um valor ja presente naquela coluna nao
            # grava linha nova nenhuma. Sem isto o fake nao consegue provar
            # que `gravados` conta o que o Supabase REALMENTE escreveu, e nao
            # o que foi mandado -- o achado IMPORTANT da revisao final.
            coluna_conflito = None
            if "on_conflict=" in path:
                coluna_conflito = path.split("on_conflict=", 1)[1].split("&", 1)[0]
            ignora_duplicado = bool(prefer and "resolution=ignore-duplicates" in prefer)

            def chave(linha):
                """A `chave_dedup`, calculada aqui como o banco a calcula.

                Ela e uma coluna GENERATED ALWAYS no Postgres, entao o backend
                nunca a envia -- o banco preenche. O fake precisa fazer o mesmo,
                senao a deduplicacao aqui olharia um campo que nao chega e
                NENHUMA duplicata seria pega, o oposto do banco real.
                """
                if coluna_conflito != "chave_dedup":
                    return linha.get(coluna_conflito)
                return "{}/{}/{}/{}".format(
                    linha.get("pedido_id_int") or 0,
                    linha.get("modelo_id") or 0,
                    linha.get("numero") or 0,
                    linha.get("codigo_hash"),
                )

            ja_visto = ({chave(l) for l in alvo} if coluna_conflito else set())
            criadas = []
            for l in linhas:
                linha = dict(l)
                if (coluna_conflito and ignora_duplicado
                        and chave(linha) in ja_visto):
                    continue
                linha.setdefault("id", f"novo-{len(alvo)}")
                alvo.append(linha)
                if coluna_conflito:
                    ja_visto.add(chave(linha))
                criadas.append(linha)
            if prefer and "return=minimal" in prefer:
                return []
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
            # A Tarefa 6 troca a lista de setores de UM aparelho apagando e
            # regravando os vinculos dele — nunca a tabela inteira. Sem este
            # filtro, revogar os setores de um aparelho apagaria tambem os
            # vinculos de qualquer outro aparelho do mesmo evento.
            if "dispositivo_id=eq." in path:
                alvo_id = path.split("dispositivo_id=eq.")[1].split("&")[0]
                sobrando = [l for l in alvo if str(l["dispositivo_id"]) != alvo_id]
                alvo.clear()
                alvo.extend(sobrando)
            else:
                alvo.clear()
            return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(cfg, "supabase", b)

    def _contar(path):
        """Honra `setor_id`, `origem` e `status` -- os tres filtros que
        `_painel` usa para separar o QR Ideal publicado dos codigos que o
        cliente importou. A revisao final achou que a versao antiga desta
        fake ignorava os dois primeiros, o que escondia um bug real de
        producao: `publicadas` contava credencial de origem='cliente'
        junto com a do QR Ideal. Falta `evento_id` de proposito -- nenhum
        teste desta suite tem mais de um evento, e honra-lo exigiria marcar
        `evento_id` em toda credencial das fixtures so para um filtro que
        nunca discriminaria nada aqui.

        Os defaults ("qr_ideal", "ativo") espelham o DEFAULT de verdade do
        schema (`sql/schema_acesso.sql`), para que uma credencial de teste
        que nao seta `origem`/`status` continue se comportando como uma
        linha real recem-inserida.
        """
        # Registrado para o teste que guarda o CUSTO da contagem por setor: um
        # evento sem codigo de cliente nenhum nao pode pagar uma ida ao banco
        # por setor a cada abertura da tela. Sem contar as chamadas, esse teste
        # nao teria como distinguir "pulou" de "consultou e deu zero".
        b.contagens.append(path)
        filtros = {}
        if "?" in path:
            for par in path.split("?", 1)[1].split("&"):
                if "=eq." in par:
                    chave, valor = par.split("=eq.", 1)
                    filtros[chave] = valor
        linhas = b.credenciais
        if "setor_id" in filtros:
            linhas = [c for c in linhas if str(c.get("setor_id")) == filtros["setor_id"]]
        if "origem" in filtros:
            linhas = [c for c in linhas if c.get("origem", "qr_ideal") == filtros["origem"]]
        if "status" in filtros:
            linhas = [c for c in linhas if c.get("status", "ativo") == filtros["status"]]
        return len(linhas)
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


def test_o_painel_nao_conta_credencial_por_setor(banco):
    """Decisao do usuario, 14/08/2026: a comparacao "encomendado x publicado"
    saiu da tela do dono.

    Ela era o sinal do risco residual da parte 2 — quem tivesse o segredo do
    agente ocuparia uma posicao da tiragem com um hash proprio —, mas acendia
    sozinha pelo motivo mais banal: cada modelo publica quando e impresso,
    entao um pedido pela metade divergia legitimamente e o aviso gritava quase
    sempre.

    Sem leitor, a contagem seria uma consulta por setor a cada abertura do
    painel. Este teste guarda o custo, nao so o layout: se `publicadas`
    reaparecer sem alguem para mostra-lo, ele reprova.
    """
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR} for i in range(4999)]
    painel = cfg._painel(EVENTO)
    assert "publicadas" not in painel["setores"][0]
    assert painel["setores"][0]["quantidade"] == 5000


def test_o_painel_traz_a_faixa_impressa_do_setor(banco):
    """Pedido do usuario, 15/08/2026: "CAMAROTE / 400 ingressos contratados -
    de 0005 a 0500".

    A faixa vem do ERP (`pedidos_modelos.numeracao_inicio/fim`), e nao de um
    MIN/MAX sobre as credenciais ja publicadas: um pedido cujos modelos ainda
    nao foram todos impressos mostraria uma faixa que encolhe.
    """
    painel = cfg._painel(EVENTO)
    assert painel["setores"][0]["numero_de"] == 201
    assert painel["setores"][0]["numero_ate"] == 5200


def test_a_faixa_impressa_vem_do_modelo_DESTE_setor(banco):
    """A fixture tem um modelo 1000999 que nao pertence a nenhum setor deste
    evento. Uma consulta sem filtro devolveria os dois e o codigo poderia casar
    pelo indice — o cartao mostraria "de 0001 a 0009" num setor de 5.000."""
    cfg._painel(EVENTO)
    pedidos = [p for m, p in banco.chamadas if m == "GET" and p.startswith("pedidos_modelos")]
    assert len(pedidos) == 1, f"esperava uma consulta so aos modelos: {pedidos}"
    assert "id=in.(1000110)" in pedidos[0]


def test_setor_sem_modelo_cadastrado_nao_ganha_faixa_inventada(banco):
    """Setor cujo modelo nao esta em `pedidos_modelos` — ou que nem tem
    `modelo_id` — fica com a faixa em branco. Zero seria pior: "de 0000 a
    0000" e um numero que nao existe em ingresso nenhum."""
    banco.setores[0]["modelo_id"] = None
    painel = cfg._painel(EVENTO)
    assert painel["setores"][0]["numero_de"] is None
    assert painel["setores"][0]["numero_ate"] is None

    banco.setores[0]["modelo_id"] = 1000777          # existe, mas nao no ERP
    painel = cfg._painel(EVENTO)
    assert painel["setores"][0]["numero_de"] is None


def test_o_painel_conta_os_codigos_do_cliente_POR_SETOR(banco):
    """A caixa de carregar codigos passou para dentro do "Configurar" do setor
    em 15/08/2026, entao a contagem tambem e por setor: "42 codigos" num evento
    de tres portoes nao diz ao dono em qual deles eles valem."""
    banco.setores.append({
        "id": "setor-2", "evento_id": EVENTO, "nome": "VIP", "quantidade": 800,
        "tipo_uso": "unico", "pedido_id_int": 18560, "modelo_id": 1000999,
        "status": "ativo", "abre_em": None, "fecha_em": None,
    })
    banco.credenciais = (
        [{"id": f"s{i}", "setor_id": SETOR, "origem": "cliente"} for i in range(7)]
        + [{"id": f"v{i}", "setor_id": "setor-2", "origem": "cliente"} for i in range(3)]
        + [{"id": "qr", "setor_id": SETOR, "origem": "qr_ideal"}]
    )
    painel = cfg._painel(EVENTO)
    por_nome = {s["nome"]: s for s in painel["setores"]}
    assert por_nome["PISTA"]["codigos_cliente"] == 7
    assert por_nome["VIP"]["codigos_cliente"] == 3
    # O total do evento continua existindo, e continua ignorando o QR Ideal.
    assert painel["codigos_cliente"] == 10


def test_evento_sem_codigo_de_cliente_nao_consulta_setor_por_setor(banco):
    """A guarda de custo. O caso comum e o evento que nunca carregou codigo
    nenhum; sem ela, ele pagaria uma ida ao banco POR SETOR, a cada abertura da
    tela, para receber zero em todas."""
    banco.setores.append({
        "id": "setor-2", "evento_id": EVENTO, "nome": "VIP", "quantidade": 800,
        "tipo_uso": "unico", "pedido_id_int": 18560, "modelo_id": 1000999,
        "status": "ativo", "abre_em": None, "fecha_em": None,
    })
    banco.credenciais = [{"id": "qr", "setor_id": SETOR, "origem": "qr_ideal"}]
    antes = len(banco.contagens)
    painel = cfg._painel(EVENTO)
    assert all(s["codigos_cliente"] == 0 for s in painel["setores"])
    # Uma contagem so: a do evento inteiro, que e a propria guarda.
    assert len(banco.contagens) - antes == 1


def test_o_painel_nao_devolve_lotacao(banco):
    """A lotacao de um setor E a quantidade contratada. Devolver uma coluna
    `lotacao` a parte convidaria a tela a mostrar dois numeros que podem
    discordar — e o que o cliente contratou no ERP e o unico que vale."""
    assert "lotacao" not in cfg._painel(EVENTO)["setores"][0]


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


def test_o_total_de_codigos_do_cliente_ignora_o_que_o_qr_ideal_publicou(banco):
    """O unico numero de credencial que a tela ainda mostra.

    Ele conta so `origem='cliente'` — os codigos de staff e cortesia que o
    proprio dono importou. Sem esse filtro, o contador subiria com a tiragem
    inteira do QR Ideal e o dono leria "5042 codigos carregados" logo depois de
    colar 42 linhas.
    """
    banco.credenciais = (
        [{"id": f"c{i}", "setor_id": SETOR, "origem": "qr_ideal"} for i in range(5000)]
        + [{"id": f"staff{i}", "setor_id": SETOR, "origem": "cliente"} for i in range(42)]
    )
    assert cfg._painel(EVENTO)["codigos_cliente"] == 42


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


def test_exigir_elevacao_sem_segredo_devolve_401_e_nao_500(banco, monkeypatch):
    """Achado da revisao final: `_exigir_elevacao` so pegava `ValueError`.

    `acesso_elevacao.conferir` so levanta `RuntimeError` quando o segredo nao
    esta configurado -- e e exatamente o estado do servidor ate o dia em que
    `ACESSO_ELEVACAO_SEGREDO` for colado no Render. Um token BEM FORMADO
    chegando nessa janela furava o `except ValueError` e virava 500, quando a
    tela ja sabe tratar 401 (pede a senha de novo).
    """
    import time
    import acesso_elevacao
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao.db, "ler_env_local", lambda _n: None)
    monkeypatch.delenv(acesso_elevacao.SEGREDO_ENV, raising=False)

    expira = int(time.time()) + 900
    token = f"{EVENTO}.{DONO['id']}.{NAV}.{expira}.assinatura-que-nunca-sera-conferida"

    with pytest.raises(HTTPException) as e:
        cfg._exigir_elevacao(EVENTO, DONO, token, NAV)
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


# ── `_conferir_senha` contra o HTTPError de verdade ─────────────────────────
#
# `senha_certa` (acima) substitui `_conferir_senha` inteira, e nenhum teste
# antigo exercitava o corpo real da funcao. Achado da revisao final: o
# `except urllib.error.HTTPError: return False` original tratava QUALQUER
# HTTPError -- 429 de limite de taxa, 500 do provedor -- como senha errada.
# Toda elevacao sai do mesmo IP de saida do Render, entao um limite por IP e
# compartilhado por toda a base de clientes: um 429 do Supabase não é o dono
# errando a senha, é o provedor pedindo para esperar.

import urllib.error


def _http_error(codigo):
    return urllib.error.HTTPError("https://x.supabase.co/auth/v1/token", codigo,
                                  "erro de teste", {}, None)


def _urlopen_que_falha_com(codigo):
    def _urlopen(req, timeout=20):
        raise _http_error(codigo)
    return _urlopen


def test_senha_errada_401_do_supabase_e_recusada(monkeypatch):
    monkeypatch.setattr(cfg.urllib.request, "urlopen", _urlopen_que_falha_com(401))
    assert cfg._conferir_senha("dono@cliente.com", "errada") is False


def test_corpo_malformado_400_do_supabase_e_recusado(monkeypatch):
    monkeypatch.setattr(cfg.urllib.request, "urlopen", _urlopen_que_falha_com(400))
    assert cfg._conferir_senha("dono@cliente.com", "") is False


def test_limite_de_taxa_429_NAO_vira_senha_errada(monkeypatch):
    monkeypatch.setattr(cfg.urllib.request, "urlopen", _urlopen_que_falha_com(429))
    with pytest.raises(HTTPException) as e:
        cfg._conferir_senha("dono@cliente.com", "boa")
    assert e.value.status_code == 503


def test_erro_5xx_do_provedor_NAO_vira_senha_errada(monkeypatch):
    monkeypatch.setattr(cfg.urllib.request, "urlopen", _urlopen_que_falha_com(503))
    with pytest.raises(HTTPException) as e:
        cfg._conferir_senha("dono@cliente.com", "boa")
    assert e.value.status_code == 503


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


def test_gravar_tipo_de_uso_do_setor(banco, elevado):
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"tipo_uso": "reentrada"})
    assert banco.setores[0]["tipo_uso"] == "reentrada"


def test_a_lotacao_do_setor_nao_e_editavel(banco, elevado):
    """Regra do usuario, 14/08/2026: a lotacao de um setor E a quantidade
    contratada no ERP. Aceitar um numero digitado aqui criaria uma segunda
    fonte da verdade, que discorda do contrato no instante em que o cliente
    aumenta o pedido — e a tela nem oferece mais onde digitar."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"lotacao": 4800})
    assert banco.setores[0].get("lotacao") is None


def test_tipo_de_uso_inventado_e_recusado(banco, elevado):
    """So `unico` e `reentrada` existem. Um terceiro valor passaria pelo banco,
    que aceita texto livre, e a portaria decidiria errado na hora da fila."""
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"tipo_uso": "as_vezes"})
    assert e.value.status_code == 422


def test_a_quantidade_do_setor_nao_e_editavel(banco, elevado):
    """Quem manda na tiragem e o ERP. Aceitar o campo aqui deixaria a tela
    'corrigir' um numero que nao e dela — e como a lotacao do setor E essa
    tiragem, seria a lotacao inteira mudando por um caminho lateral."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"quantidade": 1})
    assert banco.setores[0]["quantidade"] == 5000


def test_setor_de_evento_alheio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, ESTRANHO, elevado, NAV, {"tipo_uso": "reentrada"})
    assert e.value.status_code == 403


def test_gravar_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, None, NAV, {"tipo_uso": "reentrada"})
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

    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"tipo_uso": "reentrada"})

    assert banco.setores[0]["tipo_uso"] == "reentrada"
    outro = next(s for s in banco.setores if s["id"] == outro_setor)
    assert outro["tipo_uso"] == "unico"


# ── A janela do setor ───────────────────────────────────────────────────────
#
# Quando aquele setor passa a valer, e quando deixa de valer. Nulo dos dois
# lados quer dizer sem limite -- e e assim que nasce todo setor que ja existia
# antes desta coluna.

ABRE = "2026-09-28T20:00:00Z"
FECHA = "2026-09-29T04:00:00Z"


def test_o_painel_traz_a_janela_do_setor(banco):
    banco.setores[0]["abre_em"] = ABRE
    banco.setores[0]["fecha_em"] = FECHA
    setor = cfg._painel(EVENTO)["setores"][0]
    assert setor["abre_em"] == ABRE
    assert setor["fecha_em"] == FECHA


def test_gravar_a_janela_do_setor(banco, elevado):
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"abre_em": ABRE, "fecha_em": FECHA})
    assert banco.setores[0]["abre_em"] == ABRE
    assert banco.setores[0]["fecha_em"] == FECHA


def test_a_janela_pode_ser_apagada(banco, elevado):
    """Nulo quer dizer sem limite, e o dono precisa poder voltar atras depois de
    ter posto um horario -- senao a unica saida seria inventar uma data
    absurda."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"abre_em": ABRE, "fecha_em": FECHA})
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"abre_em": None, "fecha_em": ""})
    assert banco.setores[0]["abre_em"] is None
    assert banco.setores[0]["fecha_em"] is None


def test_fechar_antes_de_abrir_e_recusado(banco, elevado):
    """Janela invertida nao recusa "as vezes": ela recusa SEMPRE, e o dono
    descobre com a fila na porta. Como o baile que vira a madrugada e o caso
    normal, a confusao natural aqui e trocar o dia -- por isso a mensagem tem de
    dizer o que esta errado, e nao so 'invalido'."""
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV,
                          {"abre_em": FECHA, "fecha_em": ABRE})
    assert e.value.status_code == 422
    assert "fecha" in str(e.value.detail).lower()


def test_janela_so_com_um_lado_e_aceita(banco, elevado):
    """"Abre as 20h e nao fecha" e configuracao legitima -- e a comparacao entre
    os dois lados nao pode estourar quando um deles e nulo."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"abre_em": ABRE})
    assert banco.setores[0]["abre_em"] == ABRE
    assert banco.setores[0]["fecha_em"] is None


def test_a_janela_e_comparada_contra_o_que_JA_ESTA_gravado(banco, elevado):
    """A tela manda so o que mudou. Se o dono mexer so no `fecha_em`, a checagem
    precisa comparar com o `abre_em` do BANCO -- senao uma janela invertida
    entra pela porta dos fundos, um campo de cada vez."""
    cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"abre_em": FECHA})
    with pytest.raises(HTTPException) as e:
        cfg._gravar_setor(SETOR, DONO, elevado, NAV, {"fecha_em": ABRE})
    assert e.value.status_code == 422


# ── Bloqueio de faixas de ingresso ──────────────────────────────────────────
#
# Um ponto de venda nao pagou, um lote foi roubado. A faixa e um intervalo de
# `numero` -- a posicao do ingresso na tiragem --, e o motivo e o que a portaria
# le em voz alta para a pessoa que esta na frente.

BLOQUEIO = "55555555-5555-5555-5555-555555555555"


def test_bloquear_uma_faixa(banco, elevado):
    cfg._bloquear(SETOR, DONO, elevado, NAV,
                  {"de": 1000, "ate": 1500, "motivo": "lote nao pago pelo PDV Centro"})
    assert len(banco.bloqueios) == 1
    b = banco.bloqueios[0]
    assert (b["de"], b["ate"]) == (1000, 1500)
    assert b["motivo"] == "lote nao pago pelo PDV Centro"
    assert b["status"] == "ativo"
    assert b["setor_id"] == SETOR
    assert b["evento_id"] == EVENTO      # a portaria baixa por evento, nao por setor


def test_o_motivo_e_obrigatorio(banco, elevado):
    """A razao de a tabela existir. Sem motivo, a portaria recusa e ninguem sabe
    o que dizer para a pessoa na frente."""
    for vazio in (None, "", "   "):
        with pytest.raises(HTTPException) as e:
            cfg._bloquear(SETOR, DONO, elevado, NAV,
                          {"de": 1, "ate": 2, "motivo": vazio})
        assert e.value.status_code == 422
        assert "motivo" in str(e.value.detail).lower()
    assert banco.bloqueios == []


def test_faixa_invertida_e_recusada(banco, elevado):
    """"De 1500 a 1000" nao bloqueia ingresso NENHUM -- o pior resultado
    possivel, porque o dono acha que bloqueou e so descobre na porta."""
    with pytest.raises(HTTPException) as e:
        cfg._bloquear(SETOR, DONO, elevado, NAV,
                      {"de": 1500, "ate": 1000, "motivo": "roubo"})
    assert e.value.status_code == 422
    assert banco.bloqueios == []


def test_faixa_comecando_antes_do_primeiro_ingresso_e_recusada(banco, elevado):
    """A tiragem comeca em 1. `de = 0` costuma ser o dono pensando em indice."""
    with pytest.raises(HTTPException) as e:
        cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 0, "ate": 10, "motivo": "x"})
    assert e.value.status_code == 422


def test_faixa_passando_da_tiragem_e_recusada(banco, elevado):
    """O setor tem 5000. Bloquear ate 6000 nao faz mal a ninguem, mas quase
    sempre e o dono confundindo o setor -- e o silencio o deixaria achando que
    protegeu ingresso que nem existe naquele setor."""
    with pytest.raises(HTTPException) as e:
        cfg._bloquear(SETOR, DONO, elevado, NAV,
                      {"de": 4900, "ate": 6000, "motivo": "roubo"})
    assert e.value.status_code == 422
    assert "5000" in str(e.value.detail)


def test_um_ingresso_so_pode_ser_bloqueado(banco, elevado):
    """A faixa e inclusiva nos dois extremos: de = ate = 7 bloqueia o 7."""
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 7, "ate": 7, "motivo": "perdido"})
    assert (banco.bloqueios[0]["de"], banco.bloqueios[0]["ate"]) == (7, 7)


def test_bloquear_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._bloquear(SETOR, DONO, None, NAV, {"de": 1, "ate": 2, "motivo": "x"})
    assert e.value.status_code == 401
    assert banco.bloqueios == []


def test_bloquear_setor_alheio_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._bloquear(SETOR, ESTRANHO, elevado, NAV, {"de": 1, "ate": 2, "motivo": "x"})
    assert e.value.status_code == 403
    assert banco.bloqueios == []


def test_o_painel_traz_os_bloqueios_do_setor(banco, elevado):
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    setor = cfg._painel(EVENTO)["setores"][0]
    assert len(setor["bloqueios"]) == 1
    assert setor["bloqueios"][0]["motivo"] == "roubo"


def test_o_painel_nao_traz_bloqueio_ja_liberado(banco, elevado):
    """Liberado e historico, nao configuracao. Mostra-lo na lista de bloqueios
    ativos faria o dono liberar duas vezes e nunca entender por que continua
    ali."""
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    banco.bloqueios[0]["status"] = "removido"
    assert cfg._painel(EVENTO)["setores"][0]["bloqueios"] == []


def test_o_painel_nao_traz_bloqueio_de_outro_evento(banco, elevado):
    outro_evento = "88888888-8888-8888-8888-888888888888"
    banco.bloqueios.append({
        "id": "b-alheio", "evento_id": outro_evento, "setor_id": "s-alheio",
        "de": 1, "ate": 9999, "motivo": "de outro cliente", "status": "ativo",
    })
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    setor = cfg._painel(EVENTO)["setores"][0]
    assert [b["motivo"] for b in setor["bloqueios"]] == ["roubo"]


def test_liberar_marca_removido_e_nao_apaga(banco, elevado):
    """"Liberamos o lote as 22h40" e informacao que a portaria vai querer ter
    depois. Um DELETE a jogaria fora."""
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    id_bloqueio = banco.bloqueios[0]["id"]
    cfg._liberar(SETOR, id_bloqueio, DONO, elevado, NAV)
    assert len(banco.bloqueios) == 1
    assert banco.bloqueios[0]["status"] == "removido"


def test_liberar_sem_elevacao_e_recusado(banco, elevado):
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    id_bloqueio = banco.bloqueios[0]["id"]
    with pytest.raises(HTTPException) as e:
        cfg._liberar(SETOR, id_bloqueio, DONO, None, NAV)
    assert e.value.status_code == 401
    assert banco.bloqueios[0]["status"] == "ativo"


def test_liberar_bloqueio_de_setor_alheio_e_recusado(banco, elevado):
    cfg._bloquear(SETOR, DONO, elevado, NAV, {"de": 10, "ate": 20, "motivo": "roubo"})
    id_bloqueio = banco.bloqueios[0]["id"]
    with pytest.raises(HTTPException) as e:
        cfg._liberar(SETOR, id_bloqueio, ESTRANHO, elevado, NAV)
    assert e.value.status_code == 403
    assert banco.bloqueios[0]["status"] == "ativo"


def test_liberar_bloqueio_de_OUTRO_setor_e_recusado(banco, elevado):
    """A rota passa pelo setor para achar o dono. Sem conferir que o bloqueio
    pertence AQUELE setor, o dono de um evento liberaria um bloqueio de outro
    cliente so mandando o id certo pela sua propria URL."""
    banco.bloqueios.append({
        "id": "b-alheio", "evento_id": "88888888-8888-8888-8888-888888888888",
        "setor_id": "s-alheio", "de": 1, "ate": 10, "motivo": "x", "status": "ativo",
    })
    with pytest.raises(HTTPException) as e:
        cfg._liberar(SETOR, "b-alheio", DONO, elevado, NAV)
    assert e.value.status_code == 403
    assert banco.bloqueios[0]["status"] == "ativo"


# ── Os aparelhos ────────────────────────────────────────────────────────────

def test_o_codigo_do_aparelho_nao_tem_caractere_ambiguo():
    """O porteiro le do papel. `0` e `O`, `1` e `I` e `L` sao erro garantido."""
    for _ in range(200):
        codigo = cfg._sortear_codigo()
        assert len(codigo) == 6
        assert not set(codigo) & set("01OIL")


def test_criar_aparelho_devolve_o_codigo_UMA_vez(banco, elevado):
    r = cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A",
                                                         "setores": [SETOR]})
    assert len(r["codigo"]) == 6
    assert banco.dispositivos[0]["nome"] == "Portao A"
    # O que fica guardado e o hash, nunca o codigo.
    assert r["codigo"] not in str(banco.dispositivos[0])
    assert len(banco.dispositivos[0]["codigo_hash"]) == 64


def test_o_codigo_nao_volta_em_leitura_nenhuma(banco, elevado):
    r = cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    import json
    painel = json.dumps(cfg._painel(EVENTO))
    assert "codigo_hash" not in painel
    # Não `"codigo" not in painel`: o painel já tem o campo legítimo
    # `codigos_cliente` (da leitura da tela, Tarefa 3), e essa string colide
    # como substring. O que importa de verdade é o valor SORTEADO nunca
    # aparecer numa leitura.
    assert r["codigo"] not in painel


def test_o_aparelho_nasce_com_a_lista_de_setores(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    assert cfg._painel(EVENTO)["aparelhos"][0]["setores"] == [SETOR]


def test_aparelho_com_setor_de_outro_evento_e_recusado(banco, elevado):
    """Seria a mesma tiragem valendo em duas portas."""
    with pytest.raises(HTTPException) as e:
        cfg._criar_aparelho(EVENTO, DONO, elevado, NAV,
                            {"nome": "Portao A", "setores": ["setor-de-outro-evento"]})
    assert e.value.status_code == 422


def test_trocar_a_lista_de_setores_substitui_a_anterior(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    aparelho = banco.dispositivos[0]["id"]
    cfg._gravar_aparelho(aparelho, DONO, elevado, NAV, {"setores": []})
    assert cfg._painel(EVENTO)["aparelhos"][0]["setores"] == []


def test_esvaziar_os_setores_de_um_aparelho_nao_atinge_o_outro(banco, elevado):
    """Regressao da fixture, nao so do codigo de producao.

    Com um aparelho so, `test_trocar_a_lista_de_setores_substitui_a_anterior`
    nao distingue um DELETE escopado por `dispositivo_id` de um bug que
    limpasse `producao_acesso_dispositivo_setores` inteira: nos dois casos a
    lista do unico aparelho fica vazia. Um segundo aparelho, com vinculo
    proprio, e o que faz essa regressao aparecer.
    """
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao B", "setores": [SETOR]})
    aparelho_a, aparelho_b = (d["id"] for d in banco.dispositivos)

    cfg._gravar_aparelho(aparelho_a, DONO, elevado, NAV, {"setores": []})

    setores_por_aparelho = {a["id"]: a["setores"] for a in cfg._painel(EVENTO)["aparelhos"]}
    assert setores_por_aparelho[aparelho_a] == []
    assert setores_por_aparelho[aparelho_b] == [SETOR]


def test_revogar_o_aparelho(banco, elevado):
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    aparelho = banco.dispositivos[0]["id"]
    cfg._gravar_aparelho(aparelho, DONO, elevado, NAV, {"status": "revogado"})
    assert banco.dispositivos[0]["status"] == "revogado"


def test_gerar_outro_codigo_NAO_desconecta_quem_ja_entrou(banco, elevado):
    """A frase que a tela promete tem de ser verdade no codigo.

    Quem mantem o aparelho conectado e o `token_hash`. Se gerar codigo novo o
    apagasse, o dono derrubaria a portaria no meio do evento tentando so lembrar
    um codigo — e a tela estaria mentindo.
    """
    cfg._criar_aparelho(EVENTO, DONO, elevado, NAV, {"nome": "Portao A", "setores": [SETOR]})
    banco.dispositivos[0]["token_hash"] = "token-de-um-aparelho-conectado"
    aparelho = banco.dispositivos[0]["id"]

    novo = cfg._novo_codigo(aparelho, DONO, elevado, NAV)
    assert len(novo["codigo"]) == 6
    assert banco.dispositivos[0]["token_hash"] == "token-de-um-aparelho-conectado"


def test_criar_aparelho_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._criar_aparelho(EVENTO, DONO, None, NAV, {"nome": "X", "setores": []})
    assert e.value.status_code == 401


# ── Os códigos do cliente ───────────────────────────────────────────────────

def test_importar_codigos_do_cliente(banco, elevado):
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["STAFF01", "STAFF02"], "setor_id": SETOR})
    assert r["gravados"] == 2
    assert {c["codigo_visivel"] for c in banco.credenciais} == {"STAFF01", "STAFF02"}
    assert all(c["origem"] == "cliente" for c in banco.credenciais)
    assert all(c["setor_id"] == SETOR for c in banco.credenciais)


def test_o_codigo_do_cliente_fica_legivel_e_o_nosso_nunca(banco, elevado):
    """`codigo_visivel` so existe com origem='cliente'. E a linha divisoria
    entre o que e do cliente e o que e nosso."""
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["CORTESIA1"], "setor_id": SETOR})
    for c in banco.credenciais:
        assert (c.get("codigo_visivel") is not None) == (c["origem"] == "cliente")


def test_o_hash_nao_e_o_codigo(banco, elevado):
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["STAFF01"], "setor_id": SETOR})
    assert len(banco.credenciais[0]["codigo_hash"]) == 64
    assert banco.credenciais[0]["codigo_hash"] != "STAFF01"


def test_repetidos_no_mesmo_envio_viram_um(banco, elevado):
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1", "a1", " A1 ", "B2"], "setor_id": SETOR})
    assert r["gravados"] == 2


def test_linha_vazia_e_ignorada(banco, elevado):
    """Colar de uma planilha traz linha em branco. Isso nao e erro do cliente."""
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1", "", "   ", "B2"], "setor_id": SETOR})
    assert r["gravados"] == 2


def test_lista_grande_demais_e_recusada(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": [f"C{i}" for i in range(5001)], "setor_id": SETOR})
    assert e.value.status_code == 413


def test_setor_de_outro_evento_e_recusado(banco, elevado):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["A1"], "setor_id": "setor-alheio"})
    assert e.value.status_code == 422


def test_reenviar_a_mesma_lista_nao_conta_como_gravado_de_novo(banco, elevado):
    """Achado IMPORTANT da revisao final.

    `gravados` devolvia `len(limpos)` -- o que foi ENVIADO, nao o que foi
    ESCRITO. Reenviar a mesma lista (o que um dono faz depois de escolher o
    setor errado) gravava zero linha nova, e a tela dizia "42 codigos
    entraram" nas duas vezes.
    """
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["STAFF01", "STAFF02"], "setor_id": SETOR})
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["STAFF01", "STAFF02"], "setor_id": SETOR})
    assert r["gravados"] == 0
    assert r["ja_existiam"] == 2
    assert len(banco.credenciais) == 2   # nenhuma linha nova de verdade


def test_uma_lista_parcialmente_repetida_conta_os_dois_grupos(banco, elevado):
    cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                          {"codigos": ["STAFF01"], "setor_id": SETOR})
    r = cfg._importar_codigos(EVENTO, DONO, elevado, NAV,
                              {"codigos": ["STAFF01", "STAFF02"], "setor_id": SETOR})
    assert r["gravados"] == 1
    assert r["ja_existiam"] == 1


def test_importar_sem_elevacao_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        cfg._importar_codigos(EVENTO, DONO, None, NAV,
                              {"codigos": ["A1"], "setor_id": SETOR})
    assert e.value.status_code == 401
