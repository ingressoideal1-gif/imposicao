# -*- coding: utf-8 -*-
"""O Ideal Control visto de dentro da grafica.

O que estes testes protegem, em ordem de gravidade:

1. **A porta.** "Sem senha" foi decisao do usuario; "sem porta" nao. Cada rota
   confere o JWT e o papel, e um papel que nao configura leva 403 mesmo tendo
   sessao valida.
2. **O segredo.** O codigo do QR Ideal nao existe em claro em lugar nenhum, e
   esta tela lista ingresso por ingresso -- e o lugar mais obvio para ele
   vazar por descuido.
3. **O teto de 1.000 do PostgREST**, que ja mordeu este projeto tres vezes.
"""

import pytest
from fastapi import HTTPException

import acesso_interno as interno

EVENTO = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
SETOR = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
SETOR2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
APARELHO = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
BLOQUEIO_ALHEIO = "6ba7b812-9dad-11d1-80b4-00c04fd430c8"
PEDIDO = 18560

ADM = {"id": "u-adm", "email": "adm@grafica.com"}
ATENDIMENTO = {"id": "u-atend", "email": "atend@grafica.com"}
DESIGNER = {"id": "u-design", "email": "design@grafica.com"}
SEM_LINHA = {"id": "u-novo", "email": "novo@grafica.com"}

PAPEIS = {
    "u-adm": "admin",
    "u-atend": "atendimento",
    "u-design": "designer",
}


class FakeBanco:
    """Um Supabase de mentira, no mesmo espirito do tests/test_acesso_config.py.

    Ele e DELIBERADAMENTE chato em dois pontos, porque foi assim que dois
    defeitos reais escaparam antes:

    - honra `offset`/`limit` de verdade, e corta em 1.000 como o PostgREST
      corta. Um dube generoso deixaria passar exatamente a classe de bug que
      ja apareceu tres vezes aqui.
    - devolve so as colunas do `select=`. Sem isso, o teste do vazamento do
      `codigo_hash` nunca pegaria uma regressao: a fake entregaria a linha
      inteira e o codigo passaria a viajar sem ninguem notar.
    """

    TETO_POSTGREST = 1000

    def __init__(self):
        self.eventos = [{
            "id": EVENTO, "nome_evento": "Baile do Hawaii", "data_evento": None,
            "local_evento": "Clube", "status": "ativo", "dono_auth_id": "cliente-1",
            "sal": "ab" * 32, "created_at": "2026-08-14T10:00:00Z",
        }]
        self.setores = [
            {"id": SETOR, "evento_id": EVENTO, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None,
             "pedido_id_int": PEDIDO, "modelo_id": 1000109, "status": "ativo"},
            {"id": SETOR2, "evento_id": EVENTO, "nome": "CAMAROTE", "quantidade": 400,
             "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None,
             "pedido_id_int": PEDIDO, "modelo_id": 1000110, "status": "ativo"},
        ]
        self.dispositivos = [{
            "id": APARELHO, "evento_id": EVENTO, "nome": "Portao A", "status": "ativo",
            "ultimo_visto": None, "token_hash": "segredo-que-nao-pode-sair",
            "codigo_hash": "outro-segredo", "created_at": "2026-08-15T00:00:00Z",
        }]
        self.dispositivo_setores = [{"id": "ds1", "dispositivo_id": APARELHO,
                                     "setor_id": SETOR}]
        self.credenciais = []
        self.bloqueios = []
        self.leituras = []
        self.pedidos = [{
            "id": "p1", "pedido_id_int": PEDIDO, "evento_id": EVENTO,
            "publicado_em": None, "total_credenciais": 1000,
            "qr_gerado_em": "2026-08-15T00:00:00Z", "qr_revogado_em": None,
            "status": "ativo", "created_at": "2026-08-14T09:00:00Z",
            "sal": "ab" * 32,
        }]
        self.modelos = [
            {"id": 1000109, "id_int": PEDIDO, "nome_modelo": "PISTA", "quantidade": 600,
             "numeracao_inicio": 1, "numeracao_fim": 600, "tipo_numeracao": "SEQUENCIAL",
             "ordem": 1, "amostra_num_id": "num-com-codigo"},
            {"id": 1000110, "id_int": PEDIDO, "nome_modelo": "CAMAROTE", "quantidade": 400,
             "numeracao_inicio": 1, "numeracao_fim": 400, "tipo_numeracao": "SEQUENCIAL",
             "ordem": 2, "amostra_num_id": "num-com-codigo"},
            # O modelo sem codigo: existe no ERP, NAO sobe ao Ideal Control.
            {"id": 1000283, "id_int": PEDIDO, "nome_modelo": "VIP", "quantidade": 50,
             "numeracao_inicio": 1, "numeracao_fim": 50, "tipo_numeracao": "SEQUENCIAL",
             "ordem": 3, "amostra_num_id": "num-sem-codigo"},
        ]
        self.permissoes = [{"user_id": uid, "role": papel}
                           for uid, papel in PAPEIS.items()]
        self.chamadas = []
        # As contagens nao passam por `__call__` -- `contar()` e outra
        # funcao. Registradas a parte para o teste que guarda o CUSTO da
        # tela: um evento sem cortesia nem leitura nao pode pagar tres
        # idas ao banco por setor para receber zero em duas delas.
        self.contagens = []

    def _tabela(self, path):
        return {
            "producao_acesso_eventos": self.eventos,
            "producao_acesso_setores": self.setores,
            "producao_acesso_dispositivos": self.dispositivos,
            "producao_acesso_dispositivo_setores": self.dispositivo_setores,
            "producao_acesso_credenciais": self.credenciais,
            "producao_acesso_bloqueios": self.bloqueios,
            "producao_acesso_leituras": self.leituras,
            "producao_acesso_pedidos": self.pedidos,
            "pedidos_modelos": self.modelos,
            "imposition_user_permissions": self.permissoes,
        }[path.split("?")[0]]

    @staticmethod
    def _partes(path):
        if "?" not in path:
            return {}
        fora = {}
        for par in path.split("?", 1)[1].split("&"):
            if "=" in par:
                chave, valor = par.split("=", 1)
                fora.setdefault(chave, []).append(valor)
        return fora

    def _filtrar(self, linhas, partes):
        for chave, valores in partes.items():
            if chave in ("select", "order", "offset", "limit", "on_conflict"):
                continue
            for valor in valores:
                if valor.startswith("eq."):
                    alvo = valor[3:]
                    linhas = [l for l in linhas if str(l.get(chave)) == alvo]
                elif valor.startswith("in.("):
                    dentro = {v.strip('"') for v in valor[4:].rstrip(")").split(",") if v}
                    linhas = [l for l in linhas if str(l.get(chave)) in dentro]
                elif valor.startswith("is.null"):
                    linhas = [l for l in linhas if l.get(chave) is None]
                elif valor.startswith("ilike."):
                    termo = valor[len("ilike."):].strip("*").lower()
                    linhas = [l for l in linhas
                              if termo in str(l.get(chave) or "").lower()]
        return linhas

    def __call__(self, method, path, body=None, prefer=None):
        self.chamadas.append((method, path))
        alvo = self._tabela(path)
        partes = self._partes(path)

        if method == "GET":
            linhas = [dict(l) for l in self._filtrar(alvo, partes)]
            for campo in reversed((partes.get("order") or [""])[0].split(",")):
                campo = campo.strip()
                if not campo:
                    continue
                nome = campo.split(".")[0]
                linhas.sort(key=lambda l: (l.get(nome) is None, l.get(nome)),
                            reverse=campo.endswith(".desc"))
            deslocamento = int((partes.get("offset") or [0])[0])
            pedido = int((partes.get("limit") or [10 ** 9])[0])
            # O TETO. O PostgREST corta aqui, em silencio, por mais que se peca.
            linhas = linhas[deslocamento:deslocamento + min(pedido, self.TETO_POSTGREST)]
            campos = (partes.get("select") or [None])[0]
            if campos:
                quer = set(campos.split(","))
                linhas = [{k: v for k, v in l.items() if k in quer} for l in linhas]
            return linhas

        if method == "POST":
            novas = body if isinstance(body, list) else [body]
            criadas = []
            for l in novas:
                linha = dict(l)
                # UUID de verdade, como `gen_random_uuid()` do schema: os
                # ids desta API viram filtro do PostgREST e a guarda de
                # formato os recusa se nao forem. Um fake que inventasse
                # "novo-3" esconderia essa guarda.
                linha.setdefault(
                    "id", "00000000-0000-4000-8000-{:012d}".format(len(alvo)))
                alvo.append(linha)
                criadas.append(linha)
            return [] if (prefer and "return=minimal" in prefer) else criadas

        if method == "PATCH":
            atingidas = self._filtrar(alvo, partes)
            for linha in atingidas:
                linha.update(body)
            return atingidas

        if method == "DELETE":
            sobrando = [l for l in alvo if l not in self._filtrar(alvo, partes)]
            alvo.clear()
            alvo.extend(sobrando)
            return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(interno, "supabase", b)
    monkeypatch.setattr(interno.cfg, "supabase", b)

    import acesso_api
    monkeypatch.setattr(acesso_api, "supabase", b)

    def _contar(path):
        b.contagens.append(path)
        alvo = b._tabela(path)
        return len(b._filtrar(alvo, b._partes(path)))
    monkeypatch.setattr(interno, "contar", _contar)
    monkeypatch.setattr(acesso_api, "contar", _contar)

    # `numeracao_do_modelo` decide o que a portaria tem como ler. Aqui a
    # decisao vem do id da numeracao, para a fixture poder ter um modelo
    # legivel e um ilegivel sem montar um `elements` de verdade.
    import acesso_publicacao
    monkeypatch.setattr(acesso_publicacao, "numeracao_do_modelo",
                        lambda elementos: elementos)

    def _numeracoes(method, path, *a, **k):
        return [{"id": "num-com-codigo", "elements": [{"type": "qr_ideal"}]},
                {"id": "num-sem-codigo", "elements": None}]

    original = b.__call__

    def roteador(method, path, body=None, prefer=None):
        if path.startswith("producao_numeracoes"):
            b.chamadas.append((method, path))
            return _numeracoes(method, path)
        return original(method, path, body, prefer)

    monkeypatch.setattr(interno, "supabase", roteador)
    monkeypatch.setattr(interno.cfg, "supabase", roteador)
    monkeypatch.setattr(acesso_api, "supabase", roteador)
    b.roteador = roteador
    return b


@pytest.fixture
def equipe(monkeypatch):
    """Troca so a conferencia do JWT. O papel continua vindo do banco -- que e
    justamente a metade que estes testes precisam exercitar."""
    atual = {"usuario": ADM}

    def _logado(authorization):
        if authorization == "sem-sessao":
            raise HTTPException(status_code=401, detail="sessao expirada")
        return atual["usuario"]

    monkeypatch.setattr(interno, "_usuario_logado", _logado)
    return atual


# ── A porta ─────────────────────────────────────────────────────────────────

def test_adm_e_atendimento_entram(banco, equipe):
    for usuario in (ADM, ATENDIMENTO):
        equipe["usuario"] = usuario
        quem = interno._equipe("Bearer x")
        assert quem["id"] == usuario["id"]
        assert quem["papel"] in interno.PAPEIS_QUE_CONFIGURAM


def test_designer_com_sessao_valida_e_recusado(banco, equipe):
    """A sessao e boa; o papel e que nao configura evento. Esconder o botao no
    menu nunca impediu ninguem de chamar a rota."""
    equipe["usuario"] = DESIGNER
    with pytest.raises(HTTPException) as e:
        interno._equipe("Bearer x")
    assert e.value.status_code == 403


def test_usuario_sem_linha_de_permissao_e_recusado(banco, equipe):
    """Sem linha nao e "ainda nao configurado" -- e "nao pode". O contrario
    daria acesso total a toda conta recem-criada."""
    equipe["usuario"] = SEM_LINHA
    with pytest.raises(HTTPException) as e:
        interno._equipe("Bearer x")
    assert e.value.status_code == 403


def test_papel_vazio_ou_nulo_nao_passa(banco, equipe):
    banco.permissoes.append({"user_id": "u-vazio", "role": None})
    equipe["usuario"] = {"id": "u-vazio", "email": "x@y.com"}
    with pytest.raises(HTTPException) as e:
        interno._equipe("Bearer x")
    assert e.value.status_code == 403


def test_sem_sessao_e_401_e_nao_403(banco, equipe):
    """Os dois consertos sao diferentes: 401 e entrar de novo, 403 e pedir
    permissao ao administrador. Confundi-los manda a pessoa para o lugar
    errado."""
    with pytest.raises(HTTPException) as e:
        interno._equipe("sem-sessao")
    assert e.value.status_code == 401


def test_TODA_rota_de_escrita_passa_pela_porta(banco, equipe, monkeypatch):
    """A guarda tem de estar em CADA rota, e nao so nas que alguem lembrou.

    Percorre as rotas registradas e confere que nenhuma escreve sem chamar
    `_equipe`. Um endpoint novo colado sem a guarda reprova aqui.
    """
    passou = []
    monkeypatch.setattr(interno, "_equipe",
                        lambda auth: (passou.append(auth) or {"id": "u-adm"}))

    escritas = [r for r in interno.router.routes
                if r.methods & {"POST", "PATCH", "DELETE"}]
    assert escritas, "esperava rotas de escrita"

    for rota in escritas:
        passou.clear()
        argumentos = {"authorization": "Bearer x"}
        if "corpo" in rota.endpoint.__code__.co_varnames:
            argumentos["corpo"] = {}
        for nome in ("evento_id", "setor_id", "aparelho_id", "bloqueio_id"):
            if nome in rota.endpoint.__code__.co_varnames:
                argumentos[nome] = {"evento_id": EVENTO, "setor_id": SETOR,
                                    "aparelho_id": APARELHO, "bloqueio_id": "b1"}[nome]
        try:
            rota.endpoint(**argumentos)
        except HTTPException:
            pass          # 404/422 depois da porta ja prova que a porta rodou
        assert passou, f"{rota.path} escreve sem passar por _equipe"


# ── O segredo ───────────────────────────────────────────────────────────────

def test_a_lista_de_ingressos_nunca_PEDE_o_hash_ao_banco(banco, equipe):
    """Regra do usuario: e segredo de Estado.

    A primeira barreira e a consulta: o que nao e pedido nao pode vazar. Este
    teste olha o `select=` que saiu de verdade, e nao o que voltou -- olhar so
    a resposta passaria por engano no dia em que a fixture nao tivesse hash
    nenhum para vazar.
    """
    banco.credenciais = [{"id": "c1", "setor_id": SETOR, "numero": 1,
                          "codigo_hash": "hash-secreto", "codigo_visivel": None,
                          "origem": "qr_ideal", "status": "ativo",
                          "created_at": "2026-08-15T00:00:00Z"}]
    banco.chamadas.clear()
    interno._ingressos_do_setor(SETOR, 1, 50)

    consultas = [p for m, p in banco.chamadas
                 if m == "GET" and p.startswith("producao_acesso_credenciais")]
    assert consultas, "esperava consulta as credenciais"
    for c in consultas:
        assert "codigo_hash" not in c, f"o hash foi PEDIDO ao banco: {c}"


def test_o_codigo_do_QR_IDEAL_e_omitido_mesmo_se_a_coluna_vier_preenchida(banco, equipe):
    """A segunda barreira, e a que importa quando a primeira falha.

    Em producao `codigo_visivel` e nulo para o QR Ideal, entao um teste com a
    fixture "realista" nao consegue distinguir "a regra filtrou" de "nao havia
    nada para vazar" -- e passa com a regra REMOVIDA. Por isso a credencial
    aqui vem com a coluna preenchida de proposito: e a unica forma de a
    ausencia do codigo na saida provar alguma coisa.
    """
    banco.credenciais = [{"id": "c1", "setor_id": SETOR, "numero": 1,
                          "codigo_hash": "h",
                          "codigo_visivel": "NAO-PODE-SAIR",
                          "origem": "qr_ideal", "status": "ativo",
                          "created_at": "2026-08-15T00:00:00Z"}]
    import json
    saida = json.dumps(interno._ingressos_do_setor(SETOR, 1, 50))
    assert "NAO-PODE-SAIR" not in saida
    assert json.loads(saida)["ingressos"][0]["codigo"] is None


def test_o_codigo_do_CLIENTE_aparece_porque_e_dele(banco, equipe):
    """Staff e cortesia sao a lista do proprio cliente, e sem ve-la ele nao tem
    como administra-la. E o unico codigo em claro que existe no sistema."""
    banco.credenciais = [{"id": "c1", "setor_id": SETOR, "numero": None,
                          "codigo_hash": "h", "codigo_visivel": "STAFF-01",
                          "origem": "cliente", "status": "ativo",
                          "created_at": "2026-08-15T00:00:00Z"}]
    r = interno._ingressos_do_setor(SETOR, 1, 50)
    assert r["ingressos"][0]["codigo"] == "STAFF-01"


def test_o_painel_nunca_devolve_o_sal_nem_o_token_do_aparelho(banco, equipe):
    """O sal transforma codigo em hash; o token mantem um aparelho conectado.
    Nenhum dos dois tem uso nesta tela, e mandar o que nao se usa e como um
    vazamento nasce."""
    import json
    saida = json.dumps(interno._painel_do_pedido(PEDIDO))
    assert "ababab" not in saida                      # o sal da fixture
    assert "segredo-que-nao-pode-sair" not in saida   # o token_hash
    assert "token_hash" not in saida
    assert "codigo_hash" not in saida


def test_o_aparelho_diz_SE_foi_pareado_sem_entregar_o_token(banco, equipe):
    painel = interno._painel_do_pedido(PEDIDO)
    aparelho = painel["aparelhos"][0]
    assert aparelho["pareado"] is True
    assert "token_hash" not in aparelho

    banco.dispositivos[0]["token_hash"] = None
    assert interno._painel_do_pedido(PEDIDO)["aparelhos"][0]["pareado"] is False


# ── O teto de 1.000 ─────────────────────────────────────────────────────────

def test_a_pagina_de_ingressos_nunca_pede_mais_que_o_teto(banco, equipe):
    """`POR_PAGINA_MAXIMO` + o `+1` do "ha mais" tem de caber abaixo de 1.000.

    O PostgREST corta em 1.000 em silencio: uma pagina de 2.000 viria com 1.000
    e a tela diria "sem mais paginas" no meio da lista.
    """
    assert interno.POR_PAGINA_MAXIMO + 1 < 1000


def test_pedir_uma_pagina_gigante_e_aparado_e_nao_obedecido(banco, equipe):
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR, "numero": i,
                          "codigo_visivel": None, "origem": "qr_ideal",
                          "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}
                         for i in range(1, 1400)]
    r = interno._ingressos_do_setor(SETOR, 1, 5000)
    assert r["por_pagina"] == interno.POR_PAGINA_MAXIMO
    assert len(r["ingressos"]) == interno.POR_PAGINA_MAXIMO
    assert r["ha_mais"] is True


def test_as_paginas_nao_repetem_nem_pulam_ingresso(banco, equipe):
    """A prova de que a paginacao percorre a lista inteira UMA vez.

    Sem `order` explicito o PostgREST nao garante ordem entre paginas, e o
    sintoma e este: a soma das paginas bate, mas ha repetido dentro e ingresso
    que nunca aparece.
    """
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR, "numero": i,
                          "codigo_visivel": None, "origem": "qr_ideal",
                          "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}
                         for i in range(1, 1301)]
    vistos, pagina = [], 1
    while True:
        r = interno._ingressos_do_setor(SETOR, pagina, 500)
        vistos += [i["numero"] for i in r["ingressos"]]
        if not r["ha_mais"]:
            break
        pagina += 1
        assert pagina < 20, "paginacao nao termina"

    assert len(vistos) == 1300
    assert len(set(vistos)) == 1300, "ha ingresso repetido entre paginas"
    assert sorted(vistos) == list(range(1, 1301))


def test_o_grafico_avisa_quando_trunca(banco, equipe, monkeypatch):
    """Regra deste projeto: nenhum corte silencioso. Um grafico cortado que
    nao diz que foi cortado se le como o evento inteiro."""
    monkeypatch.setattr(interno, "LEITURAS_PARA_O_GRAFICO", 1000)
    banco.leituras = [{"id": f"l{i}", "evento_id": EVENTO, "setor_id": SETOR,
                       "resultado": "permitido", "tipo": "entrada",
                       "motivo": None, "dispositivo_id": APARELHO,
                       "momento": "2026-08-15T22:30:00+00:00"}
                      for i in range(1500)]
    painel = interno._painel_do_pedido(PEDIDO)
    assert painel["dashboard"]["grafico_truncado"] is True
    # ...e o TOTAL continua exato, porque nao passa pelo teto.
    assert painel["dashboard"]["publico"]["entraram"] == 1500


# ── O painel do pedido ──────────────────────────────────────────────────────

def test_o_painel_mostra_o_modelo_que_NAO_sobe_ao_controle(banco, equipe):
    """Regra do usuario sobre o 1000283: modelo sem QR nem barras nao sobe.

    Mas ele tem de APARECER na tela da grafica, marcado. Escondido, o atendente
    conta os setores, acha que falta um, e abre chamado sobre um ingresso que
    simplesmente nao tem codigo impresso.
    """
    painel = interno._painel_do_pedido(PEDIDO)
    por_id = {m["modelo_id"]: m for m in painel["modelos"]}
    assert len(painel["modelos"]) == 3
    assert por_id[1000109]["sobe_ao_controle"] is True
    assert por_id[1000283]["sobe_ao_controle"] is False
    assert por_id[1000283]["nome"] == "VIP"


def test_o_contratado_do_dashboard_ignora_o_modelo_sem_codigo(banco, equipe):
    """Somar os 50 do VIP daria um evento eternamente incompleto -- 1.050
    contratados para 1.000 que a portaria tem como ler."""
    painel = interno._painel_do_pedido(PEDIDO)
    assert painel["dashboard"]["publico"]["contratado"] == 1000


def test_pedido_sem_evento_ainda_mostra_os_modelos(banco, equipe):
    """O pedido impresso e ainda nao reivindicado e o caso mais comum na
    grafica: a tela precisa dizer o que ele TEM, e nao so "sem evento"."""
    banco.pedidos[0]["evento_id"] = None
    painel = interno._painel_do_pedido(PEDIDO)
    assert painel["evento"] is None
    assert painel["setores"] == []
    assert painel["dashboard"] is None
    assert len(painel["modelos"]) == 3


def test_pedido_que_nao_existe_no_ERP_e_404(banco, equipe):
    with pytest.raises(HTTPException) as e:
        interno._painel_do_pedido(99999)
    assert e.value.status_code == 404


def test_publicacao_aberta_quer_dizer_que_o_agente_ainda_pode_mandar(banco, equipe):
    """`publicado_em` e uma TRAVA, nao um selo: cheia, o agente e recusado ate
    alguem reabrir. A tela precisa dizer isso do jeito certo."""
    assert interno._painel_do_pedido(PEDIDO)["publicacao"]["aberta"] is True
    banco.pedidos[0]["publicado_em"] = "2026-08-15T12:00:00Z"
    assert interno._painel_do_pedido(PEDIDO)["publicacao"]["aberta"] is False


def test_o_painel_so_traz_os_setores_DESTE_pedido(banco, equipe):
    """Um evento pode reunir varios pedidos. A tela abre por pedido, e mostrar
    o setor de outro pedido no meio faria o atendente configurar o alheio."""
    banco.setores.append({
        "id": "setor-de-outro", "evento_id": EVENTO, "nome": "OUTRO PEDIDO",
        "quantidade": 10, "tipo_uso": "unico", "abre_em": None, "fecha_em": None,
        "pedido_id_int": 99999, "modelo_id": 1000999, "status": "ativo",
    })
    nomes = [s["nome"] for s in interno._painel_do_pedido(PEDIDO)["setores"]]
    assert "OUTRO PEDIDO" not in nomes
    assert sorted(nomes) == ["CAMAROTE", "PISTA"]


# ── O dashboard ─────────────────────────────────────────────────────────────

def _semear_leituras(banco):
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR, "numero": i,
                          "codigo_visivel": None, "origem": "qr_ideal",
                          "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}
                         for i in range(1, 101)]
    banco.leituras = [
        {"id": "l1", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": "c1",
         "resultado": "permitido", "tipo": "entrada", "motivo": None,
         "dispositivo_id": APARELHO, "momento": "2026-08-15T22:10:00+00:00"},
        {"id": "l2", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": "c2",
         "resultado": "permitido", "tipo": "entrada", "motivo": None,
         "dispositivo_id": APARELHO, "momento": "2026-08-15T22:50:00+00:00"},
        {"id": "l3", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": "c3",
         "resultado": "permitido", "tipo": "entrada", "motivo": None,
         "dispositivo_id": APARELHO, "momento": "2026-08-15T23:20:00+00:00"},
        {"id": "l4", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": "c1",
         "resultado": "negado", "tipo": "entrada", "motivo": "ja_entrou",
         "dispositivo_id": APARELHO, "momento": "2026-08-15T23:30:00+00:00"},
        {"id": "l5", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": None,
         "resultado": "negado", "tipo": "entrada", "motivo": "desconhecido",
         "dispositivo_id": APARELHO, "momento": "2026-08-15T23:40:00+00:00"},
        {"id": "l6", "evento_id": EVENTO, "setor_id": SETOR, "credencial_id": "c2",
         "resultado": "permitido", "tipo": "saida", "motivo": None,
         "dispositivo_id": APARELHO, "momento": "2026-08-15T23:50:00+00:00"},
    ]


def test_o_dashboard_conta_publico_entradas_saidas_e_presentes(banco, equipe):
    _semear_leituras(banco)
    p = interno._painel_do_pedido(PEDIDO)["dashboard"]["publico"]
    assert p["publicado"] == 100
    assert p["entraram"] == 3
    assert p["sairam"] == 1
    assert p["presentes"] == 2          # tres entraram, um saiu
    assert p["recusadas"] == 2


def test_o_comparecimento_e_nulo_sem_ninguem_publicado(banco, equipe):
    """Zero por cento e uma afirmacao; "ainda nao da para saber" e outra. Um
    evento sem nada publicado nao tem denominador."""
    p = interno._painel_do_pedido(PEDIDO)["dashboard"]["publico"]
    assert p["publicado"] == 0
    assert p["comparecimento_pct"] is None


def test_o_dashboard_agrupa_as_recusas_por_motivo_com_rotulo_legivel(banco, equipe):
    _semear_leituras(banco)
    recusas = interno._painel_do_pedido(PEDIDO)["dashboard"]["recusas"]
    por_motivo = {r["motivo"]: r for r in recusas}
    assert por_motivo["ja_entrou"]["quantas"] == 1
    assert por_motivo["ja_entrou"]["rotulo"] == "Ingresso já usado"
    assert por_motivo["desconhecido"]["rotulo"] == "Código não existe neste evento"


def test_o_dashboard_agrupa_por_hora_cheia_e_acha_o_pico(banco, equipe):
    _semear_leituras(banco)
    d = interno._painel_do_pedido(PEDIDO)["dashboard"]
    por_hora = {h["hora"]: h for h in d["por_hora"]}
    assert por_hora["2026-08-15T22:00"]["entradas"] == 2
    assert por_hora["2026-08-15T23:00"]["entradas"] == 1
    assert por_hora["2026-08-15T23:00"]["recusas"] == 2
    assert por_hora["2026-08-15T23:00"]["saidas"] == 1
    assert d["pico"] == "2026-08-15T22:00"


def test_o_dashboard_conta_os_ingressos_bloqueados(banco, equipe):
    banco.bloqueios = [{"id": "b1", "evento_id": EVENTO, "setor_id": SETOR,
                        "de": 100, "ate": 150, "motivo": "PDV nao pagou",
                        "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}]
    d = interno._painel_do_pedido(PEDIDO)["dashboard"]
    assert d["publico"]["bloqueados"] == 51      # de 100 a 150, inclusive


# ── A lista de ingressos ────────────────────────────────────────────────────

def test_o_ingresso_que_entrou_mostra_a_hora(banco, equipe):
    _semear_leituras(banco)
    r = interno._ingressos_do_setor(SETOR, 1, 10)
    por_numero = {i["numero"]: i for i in r["ingressos"]}
    assert por_numero[1]["situacao"] == "entrou"
    assert por_numero[1]["entrou_em"] == "2026-08-15T22:10:00+00:00"
    assert por_numero[4]["situacao"] == "disponivel"
    assert por_numero[4]["entrou_em"] is None


def test_o_ingresso_dentro_de_faixa_bloqueada_aparece_bloqueado_com_o_motivo(banco, equipe):
    """A portaria vai recusar este ingresso. Se a tela da grafica nao disser
    por que, o atendente nao tem o que responder ao cliente no telefone."""
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR, "numero": i,
                          "codigo_visivel": None, "origem": "qr_ideal",
                          "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}
                         for i in (99, 100, 150, 151)]
    banco.bloqueios = [{"id": "b1", "evento_id": EVENTO, "setor_id": SETOR,
                        "de": 100, "ate": 150, "motivo": "PDV Centro nao pagou",
                        "status": "ativo"}]
    r = interno._ingressos_do_setor(SETOR, 1, 10)
    por_numero = {i["numero"]: i for i in r["ingressos"]}
    assert por_numero[99]["situacao"] == "disponivel"
    assert por_numero[100]["situacao"] == "bloqueado"
    assert por_numero[100]["motivo_bloqueio"] == "PDV Centro nao pagou"
    assert por_numero[150]["situacao"] == "bloqueado"
    assert por_numero[151]["situacao"] == "disponivel"


def test_procurar_por_numero_acha_o_ingresso(banco, equipe):
    banco.credenciais = [{"id": f"c{i}", "setor_id": SETOR, "numero": i,
                          "codigo_visivel": None, "origem": "qr_ideal",
                          "status": "ativo", "created_at": "2026-08-15T00:00:00Z"}
                         for i in range(1, 51)]
    r = interno._ingressos_do_setor(SETOR, 1, 10, busca="42")
    assert [i["numero"] for i in r["ingressos"]] == [42]


def test_setor_que_nao_existe_e_404(banco, equipe):
    with pytest.raises(HTTPException) as e:
        interno._ingressos_do_setor("nao-existe", 1, 10)
    assert e.value.status_code == 404


# ── A escrita, sem senha ────────────────────────────────────────────────────

def test_a_grafica_configura_o_setor_sem_elevacao_nenhuma(banco, equipe):
    """A decisao do usuario. O cliente precisa da senha dele; a grafica, nao --
    ela ja se identificou ao entrar no painel."""
    interno.gravar_setor(SETOR, {"nome": "PISTA PREMIUM", "tipo_uso": "reentrada"},
                         authorization="Bearer x")
    gravado = [s for s in banco.setores if s["id"] == SETOR][0]
    assert gravado["nome"] == "PISTA PREMIUM"
    assert gravado["tipo_uso"] == "reentrada"


def test_a_grafica_usa_a_MESMA_regra_de_validacao_do_cliente(banco, equipe):
    """A razao de as duas telas compartilharem `_aplicar_setor`. Se a grafica
    pudesse gravar uma janela invertida que a tela do cliente recusa, ela
    entregaria um evento que o cliente nao consegue nem reproduzir."""
    with pytest.raises(HTTPException) as e:
        interno.gravar_setor(SETOR, {"abre_em": "2026-08-20T23:00:00Z",
                                     "fecha_em": "2026-08-20T21:00:00Z"},
                             authorization="Bearer x")
    assert e.value.status_code == 422

    with pytest.raises(HTTPException) as e:
        interno.gravar_setor(SETOR, {"tipo_uso": "qualquer coisa"},
                             authorization="Bearer x")
    assert e.value.status_code == 422


def test_a_grafica_cria_aparelho_e_o_codigo_volta_uma_vez(banco, equipe):
    r = interno.criar_aparelho(EVENTO, {"nome": "Portao B", "setores": [SETOR2]},
                               authorization="Bearer x")
    assert len(r["codigo"]) == 6
    criado = [d for d in banco.dispositivos if d["nome"] == "Portao B"][0]
    # O que fica guardado e o hash, nunca o codigo.
    assert r["codigo"] not in str(criado)
    vinculos = [v for v in banco.dispositivo_setores
                if v["dispositivo_id"] == criado["id"]]
    assert [v["setor_id"] for v in vinculos] == [SETOR2]


def test_a_grafica_nao_cria_aparelho_com_setor_de_outro_evento(banco, equipe):
    with pytest.raises(HTTPException) as e:
        interno.criar_aparelho(EVENTO, {"nome": "X", "setores": ["setor-alheio"]},
                               authorization="Bearer x")
    assert e.value.status_code == 422


def test_os_codigos_de_staff_caem_no_setor_da_URL_e_nao_no_do_corpo(banco, equipe):
    """A tela ja esta dentro de um setor. Aceitar um segundo pelo corpo
    deixaria os codigos irem para outro portao sem ninguem perceber."""
    interno.importar_codigos(SETOR, {"codigos": ["STAFF-1", "STAFF-2"],
                                     "setor_id": SETOR2},
                             authorization="Bearer x")
    gravados = [c for c in banco.credenciais if c.get("origem") == "cliente"]
    assert len(gravados) == 2
    assert {c["setor_id"] for c in gravados} == {SETOR}


def test_bloquear_e_liberar_uma_faixa(banco, equipe):
    interno.bloquear(SETOR, {"de": 10, "ate": 20, "motivo": "lote roubado"},
                     authorization="Bearer x")
    ativo = [b for b in banco.bloqueios if b["status"] == "ativo"]
    assert len(ativo) == 1
    assert ativo[0]["criado_por"] == "u-adm"

    interno.liberar(SETOR, ativo[0]["id"], authorization="Bearer x")
    # `status='removido'`, nunca DELETE: "liberamos as 22h40" e historico.
    assert banco.bloqueios[0]["status"] == "removido"


def test_nao_libera_bloqueio_de_outro_setor(banco, equipe):
    banco.bloqueios = [{"id": BLOQUEIO_ALHEIO, "evento_id": EVENTO, "setor_id": SETOR2,
                        "de": 1, "ate": 5, "motivo": "x", "status": "ativo"}]
    with pytest.raises(HTTPException) as e:
        interno.liberar(SETOR, BLOQUEIO_ALHEIO, authorization="Bearer x")
    assert e.value.status_code == 403
    assert banco.bloqueios[0]["status"] == "ativo"


def test_evento_sem_cortesia_nem_leitura_nao_conta_setor_por_setor(banco, equipe):
    """A guarda de custo, medida contra producao: o pedido 18560, com cinco
    setores, levava 4,4s para abrir -- quinze idas ao banco so de contagem, dez
    delas voltando zero.

    Um evento que nunca carregou cortesia e ainda nao teve leitura nenhuma e o
    estado de TODO evento antes de a porta abrir. Duas perguntas ao evento
    inteiro respondem por todos os setores.
    """
    antes = len(banco.contagens)
    painel = interno._painel_do_pedido(PEDIDO)
    assert all(s["codigos_cliente"] == 0 for s in painel["setores"])
    assert all(s["entradas"] == 0 for s in painel["setores"])

    feitas = banco.contagens[antes:]
    por_setor = [c for c in feitas if "setor_id=eq." in c]
    # Uma por setor, e so a de publicadas: as outras duas foram dispensadas.
    assert len(por_setor) == len(painel["setores"]), por_setor
    assert all("origem=eq.qr_ideal" in c for c in por_setor), por_setor


def test_com_cortesia_ou_leitura_a_contagem_por_setor_volta(banco, equipe):
    """A guarda nao pode virar "nunca conta": quando ha o que contar, o numero
    por setor tem de aparecer."""
    banco.credenciais = [{"id": "s1", "setor_id": SETOR, "origem": "cliente",
                          "evento_id": EVENTO}]
    banco.leituras = [{"id": "l1", "evento_id": EVENTO, "setor_id": SETOR,
                       "resultado": "permitido", "tipo": "entrada", "motivo": None,
                       "credencial_id": "s1", "dispositivo_id": APARELHO,
                       "momento": "2026-08-15T22:00:00+00:00"}]
    painel = interno._painel_do_pedido(PEDIDO)
    por_nome = {s["nome"]: s for s in painel["setores"]}
    assert por_nome["PISTA"]["codigos_cliente"] == 1
    assert por_nome["PISTA"]["entradas"] == 1
    assert por_nome["CAMAROTE"]["codigos_cliente"] == 0


def test_id_que_nao_e_uuid_nao_vira_filtro_do_postgrest(banco, equipe):
    """Todo id desta API vai para a URL da consulta -- `?id=eq.{valor}` -- e o
    `&` e o separador de filtros do PostgREST.

    Um id com `%26select=*` dentro chega ao FastAPI JA DECODIFICADO e emendaria
    um filtro que ninguem escreveu. Nenhum id legitimo deste sistema e outra
    coisa senao um UUID, entao a conferencia fecha a porta inteira -- e de
    quebra impede o `22P02` do banco de virar 500, que foi como a portaria
    respondeu num portao em 15/08/2026.
    """
    venenos = ["x&select=*", "1 or 1=1", "../outro", "", "nao-e-uuid"]
    for veneno in venenos:
        banco.chamadas.clear()
        for chamada in (lambda: interno.gravar_setor(veneno, {"nome": "X"},
                                                     authorization="Bearer x"),
                        lambda: interno.gravar_aparelho(veneno, {"nome": "X"},
                                                        authorization="Bearer x"),
                        lambda: interno.gravar_evento(veneno, {"nome_evento": "X"},
                                                      authorization="Bearer x"),
                        lambda: interno.listar_ingressos(veneno,
                                                         authorization="Bearer x")):
            with pytest.raises(HTTPException) as e:
                chamada()
            assert e.value.status_code == 404, f"{veneno!r} nao foi recusado"
        # E nada do veneno chegou a virar consulta.
        assert not [p for m, p in banco.chamadas if veneno and veneno in p]


def test_id_uuid_valido_mas_inexistente_tambem_e_404(banco, equipe):
    """A mesma resposta para "formato errado" e para "nao existe": distinguir
    contaria a quem tentou em que ponto ele parou."""
    sumido = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(HTTPException) as e:
        interno.gravar_setor(sumido, {"nome": "X"}, authorization="Bearer x")
    assert e.value.status_code == 404


def test_a_lista_de_pedidos_traz_o_nome_do_evento(banco, equipe):
    r = interno.listar_pedidos(authorization="Bearer x")
    assert r["pedidos"][0]["pedido_id_int"] == PEDIDO
    assert r["pedidos"][0]["nome_evento"] == "Baile do Hawaii"
