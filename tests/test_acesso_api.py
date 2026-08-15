# -*- coding: utf-8 -*-
"""O backend é o único caminho até as tabelas do controle de acesso.

As sete tabelas `producao_acesso_*` nasceram com RLS ligado e **zero políticas**:
com a chave anônima não se lê nem se escreve uma linha delas. Só a `service_role`
passa — e ela é a chave-mestra do banco inteiro, incluindo os dados do parceiro
Vibecode. Por isso ela vive em variável de ambiente no servidor, e em lugar
nenhum mais.

Em particular, ela NÃO vai para as estações. O agente não tem autenticação de
verdade hoje (o `AGENT_ID` do `agent_worker.py` é um UUID em arquivo local, que
qualquer um forjaria), e distribuir a chave-mestra em cada `NewProd.exe` seria
muito pior do que a chave anônima que já circula. O agente publica a faixa
falando com o Render por HTTPS; a chave fica lá.

A consequência prática, e o que o último teste deste arquivo cobra: onde não há
chave, o router nem existe. A estação simplesmente não serve `/api/acesso/*`.
"""

import os

import acesso_api

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_a_chave_usada_e_a_de_servico_e_nao_a_anonima():
    """A anônima não escreve nestas tabelas — a tentativa falharia em produção.

    E falharia tarde: no meio da publicação de uma faixa, com o papel já
    impresso e o operador achando que terminou.
    """
    assert acesso_api.CHAVE_ENV == "SUPABASE_SERVICE_KEY"


def test_sem_a_chave_o_modulo_recusa_falar_com_o_banco(monkeypatch):
    """Falhar alto, e com o nome da variável que falta na mensagem."""
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", None)
    try:
        acesso_api.supabase("GET", "producao_acesso_eventos?select=id")
    except RuntimeError as e:
        assert "SUPABASE_SERVICE_KEY" in str(e)
    else:
        raise AssertionError("deveria ter recusado sem a chave")


def test_a_chave_de_servico_nunca_aparece_no_frontend():
    """A varredura que impede o vazamento mais caro possível deste projeto.

    O frontend é servido pela Vercel e pelas estações, e qualquer um abre o
    código-fonte no navegador. A `service_role` ali dentro entregaria o banco
    inteiro, incluindo cliente, proposta e financeiro do parceiro.
    """
    frontend = os.path.join(RAIZ, "frontend")
    achados = []
    for pasta, _dirs, arquivos in os.walk(frontend):
        for nome in arquivos:
            if not nome.endswith((".js", ".html")):
                continue
            caminho = os.path.join(pasta, nome)
            with open(caminho, encoding="utf-8", errors="replace") as f:
                texto = f.read()
            if "SUPABASE_SERVICE_KEY" in texto or "service_role" in texto:
                achados.append(nome)
    assert not achados, f"arquivo(s) do frontend citando a chave de servico: {achados}"


def test_a_conversa_com_as_TABELAS_nunca_usa_a_chave_anonima():
    """Escrever com a anônima daria erro de permissão, não erro claro.

    Com RLS ligado e sem política, o Supabase responde 200 e zero linhas em
    leitura, e recusa a escrita. O diagnóstico seria caro justamente por não
    parecer um problema de chave.

    A regra é da função `supabase()`, e não do arquivo inteiro: a conferência
    de sessão (`_usuario_logado`) usa a chave anônima de propósito e
    corretamente — a API de autenticação do Supabase EXIGE o `apikey` anônimo
    no cabeçalho, e ali não se toca em tabela nenhuma. A primeira versão deste
    teste varria o arquivo todo e reprovava esse uso legítimo.
    """
    import inspect
    corpo = inspect.getsource(acesso_api.supabase)
    assert "SUPABASE_KEY" not in corpo, (
        "supabase() nao pode usar db.SUPABASE_KEY: a chave anonima nao le nem "
        "escreve nas tabelas producao_acesso_*"
    )
    assert "SERVICE_KEY" in corpo


def test_onde_nao_ha_chave_o_router_nem_existe():
    """A estação não serve `/api/acesso/*`, e é assim que tem de ser.

    O `NewProd.exe` embute todo o Python do projeto, `acesso_api.py` incluído —
    mas não a chave. Montar o router lá deixaria endpoints que respondem 503 a
    qualquer chamada, o que só confunde quem for diagnosticar. Melhor não
    existirem.
    """
    import app

    # A barra no fim importa: já existem rotas `/api/acessos-locais`, de outra
    # funcionalidade, que casam com `/api/acesso` sem ela. A primeira versão
    # deste teste passava por causa delas, mesmo sem router montado nenhum.
    tem_rota = any(
        getattr(r, "path", "").startswith("/api/acesso/")
        for r in app.app.routes
    )
    assert tem_rota == acesso_api.disponivel(), (
        f"router montado={tem_rota} mas chave presente={acesso_api.disponivel()}"
    )


# ─── A publicação da faixa de códigos ─────────────────────────────────────────
#
# Três endpoints, chamados em sequência pelo agente depois que o papel saiu:
# abrir (pega o sal), credenciais (envia em lotes), fechar (carimba o total).
#
# Eles ESCREVEM, e vivem num backend público. Sem segredo, qualquer um publicaria
# credencial para qualquer pedido — e como o sal sai no `abrir`, quem tivesse
# acesso poderia calcular o hash de um conteúdo escolhido por ele e inserir um
# ingresso que a portaria aceitaria. É a única forma de forjar sem ter o pool.

import json

import pytest
from fastapi import HTTPException


class FakeBanco:
    """Um Supabase de mentira, que guarda em dicionário o que foi gravado."""

    def __init__(self, pedidos=None, modelos=None):
        self.pedidos = pedidos or []
        self.modelos = modelos or [{"id": 1000022, "quantidade": 3}]
        self.credenciais = []
        self.chamadas = []

    def __call__(self, method, path, body=None, prefer=None):
        self.chamadas.append((method, path))
        if path.startswith("pedidos_modelos"):
            return self.modelos
        if path.startswith("producao_acesso_pedidos"):
            if method == "GET":
                return list(self.pedidos)
            if method == "POST":
                linha = dict(body)
                linha.setdefault("publicado_em", None)
                self.pedidos.append(linha)
                return [linha]
            if method == "PATCH":
                for p in self.pedidos:
                    p.update(body)
                return self.pedidos
        if path.startswith("producao_acesso_credenciais"):
            if method == "GET":
                return list(self.credenciais)
            if method == "POST":
                # A `chave_dedup` do banco, calculada aqui do mesmo jeito. Ela e
                # GENERATED ALWAYS no Postgres, entao o backend nunca a envia --
                # e o fake tem de calcula-la, senao deduplicaria por um campo
                # que nao chega e deixaria passar tudo.
                #
                # Ate 15/08/2026 este fake deduplicava so por `codigo_hash`,
                # espelhando a chave antiga. Era ela que descartava PISTA e
                # CAMAROTE do pedido 20508 por terem o mesmo `000001` da
                # IMPRENSA -- 31 ingressos impressos e sem linha na nuvem.
                # Obedece ao `on_conflict=` que o BACKEND mandou, em vez de
                # decidir por conta. Um fake que deduplica sempre pela chave
                # certa, ignorando o que o codigo de producao pediu, nunca
                # reprova nada -- foi assim que este arquivo passou verde
                # enquanto o backend pedia a chave errada.
                coluna = None
                if "on_conflict=" in path:
                    coluna = path.split("on_conflict=", 1)[1].split("&", 1)[0]

                def chave(c):
                    if coluna != "chave_dedup":
                        return c.get(coluna)
                    return "{}/{}/{}/{}".format(
                        c.get("pedido_id_int") or 0,
                        c.get("modelo_id") or 0,
                        c.get("numero") or 0,
                        c["codigo_hash"],
                    )
                vistos = {chave(c) for c in self.credenciais}
                for linha in body:
                    if chave(linha) not in vistos:
                        self.credenciais.append(linha)
                        vistos.add(chave(linha))
                return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(acesso_api, "supabase", b)
    return b


def test_reabrir_um_pedido_devolve_o_MESMO_sal(banco):
    """Sal novo invalidaria todo hash já publicado.

    O cliente reimprime 500 ingressos de um pedido de 5.000. Se a reabertura
    sorteasse outro sal, os 4.500 que já estão na mão das pessoas parariam de
    validar — e ninguém descobriria antes da portaria.
    """
    a = acesso_api._abrir_pedido(20272)
    b = acesso_api._abrir_pedido(20272)
    assert len(a["sal"]) == 64
    assert a["sal"] == b["sal"]


def test_reabrir_destrava_a_publicacao_que_ja_tinha_fechado(banco):
    acesso_api._abrir_pedido(20272)
    banco.pedidos[0]["publicado_em"] = "2026-08-13T00:00:00Z"
    assert acesso_api._abrir_pedido(20272)["reaberto"] is True
    assert banco.pedidos[0]["publicado_em"] is None


def test_enviar_o_mesmo_lote_tres_vezes_nao_duplica(banco):
    """A rede cai no meio e o agente reenvia. Conferido contra o banco real
    em 13/08/2026: três envios do mesmo lote deixam uma linha só."""
    acesso_api._abrir_pedido(20272)
    itens = [{"modelo_id": 1000022, "numero": 1, "hash": "a" * 64}]
    for _ in range(3):
        acesso_api._gravar_lote(20272, itens)
    assert len(banco.credenciais) == 1


def test_modelos_diferentes_com_o_MESMO_codigo_entram_os_dois(banco):
    """O defeito que custou 31 ingressos do pedido 20508, em 15/08/2026.

    Tres modelos daquele pedido usavam a mesma numeracao ("Triband"), entao o
    item 1 dos tres saiu impresso com o mesmo texto: `000001`. Texto igual e sal
    igual -- o sal e por pedido -- dao hash igual, e a chave unica de entao, que
    era so `codigo_hash`, aceitou a IMPRENSA e DESCARTOU EM SILENCIO a PISTA e o
    CAMAROTE. Trinta e um ingressos impressos, entregues, e sem linha nenhuma na
    nuvem: recusados na portaria, sem como descobrir antes.

    O papel NAO muda para consertar isso, por decisao do usuario -- o texto
    impresso e o que o cliente contratou. Quem passou a distinguir foi a chave:
    um codigo por MODELO, e nao um codigo no sistema inteiro.

    Quem separa os dois na leitura e o setor do aparelho, que e a decisao ja
    registrada em docs/controle_acesso.md.
    """
    banco.modelos = [{"id": 1000280, "quantidade": 20},   # IMPRENSA
                     {"id": 1000281, "quantidade": 30},   # PISTA
                     {"id": 1000284, "quantidade": 1}]    # CAMAROTE
    acesso_api._abrir_pedido(20508)

    mesmo_hash = "e" * 64          # o `000001` que os tres imprimem
    acesso_api._gravar_lote(20508, [
        {"modelo_id": 1000280, "numero": 1, "hash": mesmo_hash},
        {"modelo_id": 1000281, "numero": 1, "hash": mesmo_hash},
        {"modelo_id": 1000284, "numero": 1, "hash": mesmo_hash},
    ])

    assert len(banco.credenciais) == 3
    assert sorted(c["modelo_id"] for c in banco.credenciais) == [1000280, 1000281, 1000284]

    # E a protecao contra duplicata continua de pe para o que E duplicata:
    # reenviar o lote inteiro nao grava nada de novo.
    acesso_api._gravar_lote(20508, [
        {"modelo_id": 1000280, "numero": 1, "hash": mesmo_hash},
        {"modelo_id": 1000281, "numero": 1, "hash": mesmo_hash},
    ])
    assert len(banco.credenciais) == 3


def test_o_mesmo_codigo_em_numeros_diferentes_do_mesmo_modelo_entra(banco):
    """Caso raro mas real: uma numeracao alimentada por coluna de CSV pode
    repetir o mesmo texto em itens diferentes. Cada item e um ingresso, e cada
    ingresso precisa da sua linha -- senao o segundo e recusado na porta."""
    acesso_api._abrir_pedido(20272)
    acesso_api._gravar_lote(20272, [
        {"modelo_id": 1000022, "numero": 1, "hash": "f" * 64},
        {"modelo_id": 1000022, "numero": 2, "hash": "f" * 64},
    ])
    assert len(banco.credenciais) == 2


def test_numero_acima_da_tiragem_e_recusado(banco):
    """Trava contra ingresso inventado.

    A quantidade vem do ERP. Mesmo quem tivesse o segredo do agente não
    conseguiria criar o ingresso 99.999 de uma tiragem de 3.
    """
    acesso_api._abrir_pedido(20272)
    with pytest.raises(HTTPException) as e:
        acesso_api._gravar_lote(20272, [{"modelo_id": 1000022, "numero": 99999, "hash": "b" * 64}])
    assert e.value.status_code == 422


def test_modelo_que_nao_e_do_pedido_e_recusado(banco):
    acesso_api._abrir_pedido(20272)
    with pytest.raises(HTTPException) as e:
        acesso_api._gravar_lote(20272, [{"modelo_id": 7777777, "numero": 1, "hash": "c" * 64}])
    assert e.value.status_code == 422


def test_publicacao_fechada_nao_aceita_mais_lote(banco):
    """Fecha a janela em que uma credencial forjada poderia entrar."""
    acesso_api._abrir_pedido(20272)
    banco.pedidos[0]["publicado_em"] = "2026-08-13T00:00:00Z"
    with pytest.raises(HTTPException) as e:
        acesso_api._gravar_lote(20272, [{"modelo_id": 1000022, "numero": 1, "hash": "d" * 64}])
    assert e.value.status_code == 409


def test_sem_segredo_configurado_o_endpoint_recusa(monkeypatch):
    """Falha FECHADA. Servidor sem segredo não vira porta aberta."""
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", None)
    with pytest.raises(HTTPException) as e:
        acesso_api._conferir_agente("qualquer coisa")
    assert e.value.status_code == 503


def test_segredo_errado_e_recusado(monkeypatch):
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "certo")
    for tentativa in (None, "", "errado", "cert"):
        with pytest.raises(HTTPException) as e:
            acesso_api._conferir_agente(tentativa)
        assert e.value.status_code == 401
    acesso_api._conferir_agente("certo")  # não levanta


# ─── O QR do Pedido ───────────────────────────────────────────────────────────
#
# Este endpoint minta acesso: o token que ele devolve é o que permite reivindicar
# o evento. Aberto, ele desfaria tudo que as travas anteriores construíram.


def test_gerar_qr_sem_login_e_recusado():
    """O `get_current_user` do app.py não serve de proteção aqui.

    Ele devolve admin para todo mundo sem conferir nada — "sem auth por
    enquanto", diz o comentário. Um endpoint que minta acesso não pode se apoiar
    nisso.
    """
    for cabecalho in (None, "", "Basic abc", "Bearer", "bearer "):
        with pytest.raises(HTTPException) as e:
            acesso_api._usuario_logado(cabecalho)
        assert e.value.status_code == 401


def test_token_de_sessao_invalido_e_recusado(monkeypatch):
    """Conferimos com o Supabase de verdade, não confiamos no que chega."""
    import urllib.error

    def recusa(*a, **k):
        raise urllib.error.HTTPError("u", 401, "no", None, None)

    monkeypatch.setattr(acesso_api.urllib.request, "urlopen", recusa)
    with pytest.raises(HTTPException) as e:
        acesso_api._usuario_logado("Bearer token-inventado")
    assert e.value.status_code == 401
    assert "sessao" in e.value.detail


def test_rede_fora_nao_vira_credencial_invalida(monkeypatch):
    """Confundir os dois manda o atendente procurar a senha à toa."""
    def cai(*a, **k):
        raise ConnectionError("rede fora")

    monkeypatch.setattr(acesso_api.urllib.request, "urlopen", cai)
    with pytest.raises(HTTPException) as e:
        acesso_api._usuario_logado("Bearer qualquer")
    assert e.value.status_code == 503


# ─── contar() ──────────────────────────────────────────────────────────────
#
# O número que `contar()` devolve é o que a tela do dono compara com a
# quantidade encomendada — a única pista visível de que uma tiragem não
# terminou de publicar. Todo ponto de chamada da Tarefa 3 passa por um
# `contar` monkeypatchado, então sem estes testes o caminho real (a junção
# `?`/`&`, o `Prefer: count=exact`, a leitura do `Content-Range`) não era
# exercitado por teste nenhum.


class _RespostaFake:
    """Um `http.client.HTTPResponse` de mentira, só o que `contar()` usa."""

    def __init__(self, content_range):
        self._content_range = content_range

    @property
    def headers(self):
        class _Headers:
            def __init__(self, valor):
                self._valor = valor

            def get(self, chave, default=None):
                if chave == "Content-Range" and self._valor is not None:
                    return self._valor
                return default

        return _Headers(self._content_range)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _grava_requisicao(monkeypatch, content_range):
    """Substitui urlopen por um espião que guarda a `Request` recebida.

    Fixa `SERVICE_KEY` para o teste não depender de haver (ou não) um
    `.env.local` na máquina que roda a suíte — em CI ela normalmente falta.
    """
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave-de-teste")
    capturado = {}

    def fake_urlopen(req, timeout=None):
        capturado["req"] = req
        return _RespostaFake(content_range)

    monkeypatch.setattr(acesso_api.urllib.request, "urlopen", fake_urlopen)
    return capturado


def test_contar_junta_com_interrogacao_quando_o_caminho_nao_tem_filtro(monkeypatch):
    capturado = _grava_requisicao(monkeypatch, "0-0/1")
    acesso_api.contar("producao_acesso_credenciais")
    assert capturado["req"].full_url == (
        f"{acesso_api.db.SUPABASE_URL}/rest/v1/producao_acesso_credenciais?select=id&limit=1"
    )


def test_contar_junta_com_e_comercial_quando_o_caminho_ja_tem_filtro(monkeypatch):
    capturado = _grava_requisicao(monkeypatch, "0-0/1")
    acesso_api.contar("producao_acesso_credenciais?setor_id=eq.abc")
    assert capturado["req"].full_url == (
        f"{acesso_api.db.SUPABASE_URL}/rest/v1/"
        "producao_acesso_credenciais?setor_id=eq.abc&select=id&limit=1"
    )


def test_contar_manda_o_prefer_count_exact(monkeypatch):
    capturado = _grava_requisicao(monkeypatch, "0-0/1")
    acesso_api.contar("producao_acesso_credenciais")
    assert capturado["req"].get_header("Prefer") == "count=exact"


def test_contar_le_o_total_do_content_range(monkeypatch):
    _grava_requisicao(monkeypatch, "0-0/1234")
    assert acesso_api.contar("producao_acesso_credenciais") == 1234


def test_contar_zero_linhas_e_asterisco_barra_zero(monkeypatch):
    _grava_requisicao(monkeypatch, "*/0")
    assert acesso_api.contar("producao_acesso_credenciais") == 0


def test_contar_sem_cabecalho_ou_irreconhecivel_e_zero_sem_levantar(monkeypatch):
    _grava_requisicao(monkeypatch, None)
    assert acesso_api.contar("producao_acesso_credenciais") == 0

    _grava_requisicao(monkeypatch, "isso-nao-e-um-content-range")
    assert acesso_api.contar("producao_acesso_credenciais") == 0


def test_contar_erro_do_postgrest_vira_runtimeerror_diagnosticavel(monkeypatch):
    """Mesmo padrão do `supabase()`: sem isso, o erro sobe cru e vira 500 pelado.

    O corpo da resposta do PostgREST diz o que houve — sem ele, quem for
    investigar por que a tela mostra a contagem errada não tem por onde
    começar.
    """
    import io
    import urllib.error

    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave-de-teste")

    def fake_urlopen(req, timeout=None):
        raise urllib.error.HTTPError(
            req.full_url, 500, "erro interno", None, io.BytesIO(b'{"message":"tabela travada"}')
        )

    monkeypatch.setattr(acesso_api.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError) as e:
        acesso_api.contar("producao_acesso_credenciais")
    assert "500" in str(e.value)
    assert "tabela travada" in str(e.value)


def test_a_url_do_qr_aponta_para_a_origem_do_painel():
    """Tem de ser o domínio que a estação e a Vercel servem de verdade."""
    import security_config
    url = acesso_api._url_do_evento("20272.123.abc")
    assert url.startswith(security_config.PAINEL_BASE_URL)
    assert url.endswith("evento.html?t=20272.123.abc")


# ─── Trocar o token pelo esqueleto do evento ──────────────────────────────────
#
# Este endpoint é PÚBLICO: o cliente ainda não tem conta quando lê o QR, então o
# token é a credencial. Tudo que protege o evento está aqui dentro.

import hashlib as _hashlib

import qr_pedido


class BancoComPedido(FakeBanco):
    """FakeBanco com um pedido já registrado, como fica depois de gerar o QR."""

    def __init__(self, token=None, revogado=None, evento_id=None):
        super().__init__(modelos=[
            {"id": 1000287, "nome_modelo": "PISTA", "quantidade": 88},
            {"id": 1000288, "nome_modelo": "CAMAROTE", "quantidade": 12},
        ])
        self.pedidos = [{
            "pedido_id_int": 20272,
            "sal": "00" * 32,
            "publicado_em": None,
            "evento_id": evento_id,
            "qr_revogado_em": revogado,
            "qr_token_hash": _hashlib.sha256((token or "").encode()).hexdigest(),
        }]
        self.propostas = [{"id_int": 20272, "id_cliente": 6}]

    def __call__(self, method, path, body=None, prefer=None):
        if path.startswith("propostas"):
            return self.propostas
        return super().__call__(method, path, body, prefer)


def test_o_esqueleto_vem_do_ERP_e_nao_do_token(monkeypatch):
    """O QR não carrega os dados do evento, e é por isso que ele nunca envelhece.

    Se a lista de setores viajasse dentro do token, ela continuaria afirmando a
    quantidade velha depois que o pedido mudasse no ERP.
    """
    token = qr_pedido.gerar(20272)
    banco = BancoComPedido(token=token)
    monkeypatch.setattr(acesso_api, "supabase", banco)

    esqueleto = acesso_api._esqueleto(token)
    assert esqueleto["pedido"] == 20272
    assert esqueleto["id_cliente"] == 6
    assert esqueleto["ja_reivindicado"] is False
    assert [(s["modelo_id"], s["nome"], s["quantidade"]) for s in esqueleto["setores"]] == [
        (1000287, "PISTA", 88), (1000288, "CAMAROTE", 12),
    ]
    assert esqueleto["total"] == 100
    assert any("pedidos_modelos" in p for _m, p in banco.chamadas)


def test_token_de_outro_QR_e_recusado(monkeypatch):
    """Gerar um QR novo mata o anterior — e o anterior continua assinado.

    Este é o caso que a revogação existe para cobrir: o QR foi para a pessoa
    errada, o atendente gerou outro, e o primeiro tem de parar de funcionar
    mesmo sendo criptograficamente válido.
    """
    antigo = qr_pedido.gerar(20272)
    novo = qr_pedido.gerar(20272, dias=179)  # assinatura diferente
    assert antigo != novo
    monkeypatch.setattr(acesso_api, "supabase", BancoComPedido(token=novo))

    with pytest.raises(HTTPException) as e:
        acesso_api._esqueleto(antigo)
    assert e.value.status_code == 403


def test_qr_revogado_e_recusado(monkeypatch):
    token = qr_pedido.gerar(20272)
    monkeypatch.setattr(acesso_api, "supabase",
                        BancoComPedido(token=token, revogado="2026-08-13T00:00:00Z"))
    with pytest.raises(HTTPException) as e:
        acesso_api._esqueleto(token)
    assert e.value.status_code == 403


def test_token_adulterado_ou_vencido_e_recusado(monkeypatch):
    monkeypatch.setattr(acesso_api, "supabase", BancoComPedido(token="x"))
    for ruim in (qr_pedido.gerar(20272, dias=-1), "20272.999.assinaturafalsa", "lixo"):
        with pytest.raises(HTTPException) as e:
            acesso_api._esqueleto(ruim)
        assert e.value.status_code == 401


def test_pedido_sem_QR_gerado_e_recusado(monkeypatch):
    """Token válido para um pedido que nunca teve QR: não existe linha."""
    banco = BancoComPedido(token="x")
    banco.pedidos = []
    monkeypatch.setattr(acesso_api, "supabase", banco)
    with pytest.raises(HTTPException) as e:
        acesso_api._esqueleto(qr_pedido.gerar(20272))
    assert e.value.status_code == 404


def test_pedido_ja_reivindicado_se_anuncia(monkeypatch):
    """O app precisa saber, para oferecer 'anexar' em vez de 'criar'."""
    token = qr_pedido.gerar(20272)
    monkeypatch.setattr(acesso_api, "supabase",
                        BancoComPedido(token=token, evento_id="evt-1"))
    esqueleto = acesso_api._esqueleto(token)
    assert esqueleto["ja_reivindicado"] is True
    assert esqueleto["evento_id"] == "evt-1"


# ─── Reivindicar o pedido ─────────────────────────────────────────────────────


class BancoParaReivindicar(BancoComPedido):
    def __init__(self, token, evento_id=None, dono_do_evento=None):
        super().__init__(token=token, evento_id=evento_id)
        self.eventos = ([{"id": evento_id, "dono_auth_id": dono_do_evento,
                          "nome_evento": "Festa"}] if evento_id else [])
        self.setores = []
        self.carimbos = []

    def __call__(self, method, path, body=None, prefer=None):
        if path.startswith("producao_acesso_eventos"):
            if method == "GET":
                return list(self.eventos)
            if method == "POST":
                linha = dict(body, id=f"evt-{len(self.eventos) + 1}")
                self.eventos.append(linha)
                return [linha]
        if path.startswith("producao_acesso_setores"):
            if method == "POST":
                linha = dict(body, id=f"set-{len(self.setores) + 1}")
                self.setores.append(linha)
                return [linha]
            return list(self.setores)
        if path.startswith("producao_acesso_credenciais") and method == "PATCH":
            self.carimbos.append(path)
            return []
        return super().__call__(method, path, body, prefer)


USUARIO = {"id": "conta-1", "email": "cliente@exemplo.com"}
OUTRO = {"id": "conta-2", "email": "outro@exemplo.com"}


def test_reivindicar_cria_o_evento_e_um_setor_por_modelo(monkeypatch):
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token)
    monkeypatch.setattr(acesso_api, "supabase", banco)

    r = acesso_api._reivindicar(token, USUARIO, nome_evento="Réveillon")
    assert r["novo"] is True
    assert banco.eventos[0]["nome_evento"] == "Réveillon"
    assert banco.eventos[0]["dono_auth_id"] == "conta-1"
    assert [(s["modelo_id"], s["nome"], s["quantidade"]) for s in banco.setores] == [
        (1000287, "PISTA", 88), (1000288, "CAMAROTE", 12),
    ]
    # As credenciais que o agente já publicou têm de receber evento e setor.
    assert len(banco.carimbos) == 2


def test_o_evento_nasce_com_sal_proprio(monkeypatch):
    """O sal do evento serve aos códigos que o próprio cliente carregar."""
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token)
    monkeypatch.setattr(acesso_api, "supabase", banco)
    acesso_api._reivindicar(token, USUARIO)
    assert len(banco.eventos[0]["sal"]) == 64


def test_sem_nome_o_evento_ganha_um_que_identifica(monkeypatch):
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token)
    monkeypatch.setattr(acesso_api, "supabase", banco)
    acesso_api._reivindicar(token, USUARIO, nome_evento="   ")
    assert "20272" in banco.eventos[0]["nome_evento"]


def test_segunda_conta_e_recusada(monkeypatch):
    """O QR anda por WhatsApp: quem receber a imagem cadastra — UMA vez."""
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token, evento_id="evt-1", dono_do_evento="conta-1")
    monkeypatch.setattr(acesso_api, "supabase", banco)
    with pytest.raises(HTTPException) as e:
        acesso_api._reivindicar(token, OUTRO)
    assert e.value.status_code == 409
    assert "outra conta" in e.value.detail


def test_o_proprio_dono_relendo_o_QR_nao_e_erro(monkeypatch):
    """Ele já cadastrou e leu de novo. Mostrar erro seria mentira."""
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token, evento_id="evt-1", dono_do_evento="conta-1")
    monkeypatch.setattr(acesso_api, "supabase", banco)
    r = acesso_api._reivindicar(token, USUARIO)
    assert r == {"evento_id": "evt-1", "nome_evento": "Festa", "novo": False}


def test_anexar_a_evento_de_outra_conta_e_recusado(monkeypatch):
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token)
    banco.eventos = [{"id": "evt-9", "dono_auth_id": "conta-2", "nome_evento": "Alheio"}]
    monkeypatch.setattr(acesso_api, "supabase", banco)
    with pytest.raises(HTTPException) as e:
        acesso_api._reivindicar(token, USUARIO, evento_id="evt-9")
    assert e.value.status_code == 403


def test_anexar_um_segundo_pedido_reusa_o_evento(monkeypatch):
    """A pista veio num pedido, o camarote noutro: um evento só."""
    token = qr_pedido.gerar(20272)
    banco = BancoParaReivindicar(token)
    banco.eventos = [{"id": "evt-1", "dono_auth_id": "conta-1", "nome_evento": "Festa"}]
    monkeypatch.setattr(acesso_api, "supabase", banco)
    r = acesso_api._reivindicar(token, USUARIO, evento_id="evt-1")
    assert r["novo"] is False
    assert len(banco.eventos) == 1, "nao pode criar evento novo ao anexar"
    assert all(s["evento_id"] == "evt-1" for s in banco.setores)


def test_a_mensagem_de_QR_invalido_e_para_gente(monkeypatch):
    """Quem lê esta resposta é o cliente, no celular dele.

    O `qr_pedido` fala técnico de propósito — as mensagens dele vão para log e
    para teste. A tradução para português de gente mora no endpoint, e é por
    isso que "token malformado" não pode chegar à tela.
    """
    monkeypatch.setattr(acesso_api, "supabase", BancoComPedido(token="x"))
    esperado = {
        "": "nao parece um QR",
        "20272.999.assinaturafalsa": "nao e valido",
        qr_pedido.gerar(20272, dias=-1): "venceu",
    }
    for ruim, trecho in esperado.items():
        with pytest.raises(HTTPException) as e:
            acesso_api._esqueleto(ruim)
        assert trecho in e.value.detail, e.value.detail
        assert "token" not in e.value.detail.lower()


# --- /saude: a tela de diagnóstico das quatro variáveis --------------------
#
# Ela existe para o momento em que alguém acabou de configurar o Render e quer
# saber se acertou. Se ela responder "ok" com dois segredos faltando, manda a
# pessoa embora achando que terminou — e o erro só aparece depois, na hora de
# gerar um QR ou de publicar uma faixa, longe daqui.

import acesso_elevacao


def _saude_com_banco_bom(monkeypatch):
    monkeypatch.setattr(acesso_api, "supabase", lambda *a, **k: [])


def _saude_com_elevacao_presente(monkeypatch):
    # A elevação é a quarta variável: sem mocá-la, este teste dependeria do
    # que estiver de verdade no .env.local da máquina que roda o teste.
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-elevacao-teste")


def test_saude_relata_as_quatro_variaveis(monkeypatch):
    _saude_com_banco_bom(monkeypatch)
    _saude_com_elevacao_presente(monkeypatch)
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "segredo")
    monkeypatch.setenv(qr_pedido.SEGREDO_ENV, "segredo-qr")
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", None)

    r = acesso_api.saude()

    assert r["ok"] is True
    assert set(r["variaveis"]) == {
        "SUPABASE_SERVICE_KEY",
        "ACESSO_AGENTE_SEGREDO",
        "QR_PEDIDO_SEGREDO",
        "ACESSO_ELEVACAO_SEGREDO",
    }
    assert all(r["variaveis"].values())


def test_saude_aponta_o_segredo_do_agente_que_falta(monkeypatch):
    """Sem ele a faixa nunca é publicada, e nada avisa."""
    _saude_com_banco_bom(monkeypatch)
    _saude_com_elevacao_presente(monkeypatch)
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", None)
    monkeypatch.setenv(qr_pedido.SEGREDO_ENV, "segredo-qr")
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", None)

    with pytest.raises(HTTPException) as e:
        acesso_api.saude()
    assert e.value.status_code == 503
    assert e.value.detail["faltando"] == ["ACESSO_AGENTE_SEGREDO"]


def test_saude_aponta_o_segredo_do_qr_que_falta(monkeypatch):
    _saude_com_banco_bom(monkeypatch)
    _saude_com_elevacao_presente(monkeypatch)
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "segredo")
    monkeypatch.setattr(qr_pedido, "configurado", lambda: False)

    with pytest.raises(HTTPException) as e:
        acesso_api.saude()
    assert e.value.detail["faltando"] == ["QR_PEDIDO_SEGREDO"]


def test_saude_nao_toca_no_banco_se_falta_variavel(monkeypatch):
    """Diagnóstico primeiro, rede depois: o erro de rede esconderia o de config."""
    def explodir(*a, **k):
        raise AssertionError("nao devia consultar o banco sem as variaveis")

    monkeypatch.setattr(acesso_api, "supabase", explodir)
    _saude_com_elevacao_presente(monkeypatch)
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", None)
    monkeypatch.setattr(qr_pedido, "configurado", lambda: False)

    with pytest.raises(HTTPException) as e:
        acesso_api.saude()
    assert e.value.detail["faltando"] == ["ACESSO_AGENTE_SEGREDO", "QR_PEDIDO_SEGREDO"]


def test_saude_nunca_devolve_o_valor_de_um_segredo(monkeypatch):
    """Ela é pública: `/api/acesso/saude` não pede login.

    Dizer *se* a variável existe é diagnóstico; dizer *o que* ela vale entregaria
    o servidor a quem abriu a URL por curiosidade.
    """
    _saude_com_banco_bom(monkeypatch)
    monkeypatch.setattr(acesso_api, "SERVICE_KEY", "chave-secreta-do-banco")
    monkeypatch.setattr(acesso_api, "AGENTE_SEGREDO", "segredo-do-agente")
    monkeypatch.setenv(qr_pedido.SEGREDO_ENV, "segredo-do-qr")
    monkeypatch.setattr(qr_pedido, "_SEGREDO_CACHE", None)
    monkeypatch.setattr(acesso_elevacao, "_SEGREDO_CACHE", "segredo-da-elevacao")

    texto = json.dumps(acesso_api.saude())
    for valor in (
        "chave-secreta-do-banco", "segredo-do-agente", "segredo-do-qr",
        "segredo-da-elevacao",
    ):
        assert valor not in texto
