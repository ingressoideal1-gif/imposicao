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


def test_o_modulo_nao_usa_a_chave_anonima_por_engano():
    """Escrever com a anônima daria erro de permissão, não erro claro.

    Com RLS ligado e sem política, o Supabase responde 200 e zero linhas em
    leitura, e recusa a escrita. O diagnóstico seria caro justamente por não
    parecer um problema de chave.
    """
    import inspect
    fonte = inspect.getsource(acesso_api)
    assert "SUPABASE_KEY" not in fonte, (
        "acesso_api nao pode tocar em db.SUPABASE_KEY, que e a chave anonima"
    )


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
