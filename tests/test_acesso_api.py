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
                vistos = {c["codigo_hash"] for c in self.credenciais}
                for linha in body:
                    if linha["codigo_hash"] not in vistos:
                        self.credenciais.append(linha)
                        vistos.add(linha["codigo_hash"])
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


def test_a_url_do_qr_aponta_para_a_origem_do_painel():
    """Tem de ser o domínio que a estação e a Vercel servem de verdade."""
    import security_config
    url = acesso_api._url_do_evento("20272.123.abc")
    assert url.startswith(security_config.PAINEL_BASE_URL)
    assert url.endswith("evento.html?t=20272.123.abc")
