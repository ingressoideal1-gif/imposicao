# -*- coding: utf-8 -*-
"""A senha semanal de liberacao de peso: o caminho da estacao e as rotas.

## O que e

No Painel do Acabamento, o peso real de um setor nao pode divergir mais de 5 %
do estimado do ERP sem alguem liberar. Quem libera digita uma senha de tres
caracteres (1 letra + 2 digitos) que muda sozinha toda segunda-feira, no fuso
de Sao Paulo: ela e DERIVADA -- HMAC do segredo `PESO_LIBERACAO_SEGREDO` com
a semana ISO -- e nao sorteada e guardada. A regra inteira mora em
`supabase/functions/_compartilhado/senha_liberacao.ts`.

## O que estes testes protegem

1. A estacao NUNCA calcula nem conhece a senha. O agente repassa o que o
   operador digitou a `acesso-estacao`, com o `ACESSO_AGENTE_SEGREDO`, e
   recebe `confere` sim ou nao. Sem o segredo do agente, falha alto.
2. O agente nao normaliza nada: `trim`, maiusculas e a comparacao em tempo
   constante moram na Edge Function, uma vez so -- duas copias da regra
   seriam duas verdades.
3. A rota da `acesso-estacao` confere o segredo do agente ANTES de ler o
   corpo; a de MOSTRAR a senha no `painel` exige o modulo Usuarios (e a
   senha e um segredo da semana); a de CONFERIR exige so sessao, porque quem
   digita e o operador do acabamento.
4. O modulo existe com o nome do segredo combinado e compara em tempo
   constante.

Os testes da derivacao em si (semana ISO em SP, formato, literais) sao Deno:
`supabase/functions/_compartilhado/senha_liberacao_test.ts`.
"""
import json
import os
import re
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


def _ler(*partes):
    with open(os.path.join(RAIZ, *partes), encoding="utf-8") as f:
        return f.read()


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

    vistas = []
    resposta = {"corpo": {"status": "success", "confere": False}}

    def urlopen(req, timeout=None):
        vistas.append({
            "url": req.full_url,
            "metodo": req.get_method(),
            "segredo": req.headers.get("X-agente-segredo"),
            "corpo": json.loads(req.data.decode()) if req.data else None,
        })
        return _Resposta(resposta["corpo"])

    monkeypatch.setattr(db.urllib.request, "urlopen", urlopen)
    return vistas, resposta


def _nunca_pelo_postgrest(monkeypatch):
    monkeypatch.setattr(db, "_supabase_call", lambda *a, **k: pytest.fail(
        "a estacao falou com o PostgREST: a senha e um segredo do servidor e "
        "nao mora em tabela nenhuma que a chave publica alcance"))


def _bloco_da_rota(ts, rota):
    """O `if (p[0] === "<rota>") { ... }` de um `index.ts`, ate o fecho dele."""
    i = ts.index('if (p[0] === "' + rota + '")')
    return ts[i:ts.index("\n  }", i)]


# ── O agente repassa, nao decide ─────────────────────────────────────────────


def test_conferir_sai_pela_funcao_com_o_segredo(funcao, monkeypatch):
    vistas, resposta = funcao
    _nunca_pelo_postgrest(monkeypatch)
    resposta["corpo"] = {"status": "success", "confere": True}

    r = db.conferir_senha_de_liberacao("K47")

    assert r == {"status": "success", "confere": True}
    assert len(vistas) == 1
    assert vistas[0]["metodo"] == "POST"
    assert vistas[0]["url"].endswith("/api/acesso/senha-liberacao/conferir")
    assert vistas[0]["segredo"] == "segredo-do-agente"
    assert vistas[0]["corpo"] == {"senha": "K47"}


def test_o_agente_nao_normaliza_a_senha_por_conta_propria(funcao, monkeypatch):
    """Espacos e minusculas vao como vieram: quem apara e sobe e o servidor.

    Se o agente aparasse aqui e o servidor tambem, nada quebraria hoje -- mas
    seriam duas copias da regra, e a segunda e a que alguem esquece de mudar.
    """
    vistas, _ = funcao
    _nunca_pelo_postgrest(monkeypatch)

    db.conferir_senha_de_liberacao(" k47 ")
    assert vistas[0]["corpo"] == {"senha": " k47 "}, (
        "o agente mexeu no texto da senha: essa conta e do servidor"
    )


def test_o_agente_repassa_o_nao_como_veio(funcao, monkeypatch):
    """`confere: false` e resposta, nao erro -- e chega intacta a tela."""
    vistas, resposta = funcao
    _nunca_pelo_postgrest(monkeypatch)
    resposta["corpo"] = {"status": "success", "confere": False}

    assert db.conferir_senha_de_liberacao("K48") == {"status": "success", "confere": False}
    assert vistas[0]["corpo"] == {"senha": "K48"}


def test_sem_segredo_do_agente_a_conferencia_falha_alto(monkeypatch):
    """Estacao sem `ACESSO_AGENTE_SEGREDO` nao pode "liberar" nem "recusar".

    As duas respostas seriam mentira: ela nao tem como saber. Erro ruidoso e o
    que diz ao operador que a estacao esta desconfigurada.
    """
    import acesso_publicacao

    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: None)
    _nunca_pelo_postgrest(monkeypatch)

    with pytest.raises(RuntimeError, match="ACESSO_AGENTE_SEGREDO"):
        db.conferir_senha_de_liberacao("K47")


def test_a_senha_nao_e_calculada_no_agente():
    """O agente nao tem o segredo nem a formula: so o texto digitado viaja.

    Se algum dia `db.py` ou `app.py` passarem a calcular HMAC com a semana,
    a senha estara numa maquina da grafica -- e dali sai com o .exe.
    """
    for arquivo in ("db.py", "app.py"):
        codigo = _ler(arquivo)
        assert "PESO_LIBERACAO_SEGREDO" not in codigo, (
            arquivo + " conhece o nome do segredo da senha: ele e so do servidor"
        )
        assert "senha-liberacao-peso:" not in codigo, (
            arquivo + " conhece a formula da senha: ela e so do servidor"
        )


# ── A rota do agente ─────────────────────────────────────────────────────────


def test_a_rota_local_do_agente_existe_atras_da_tranca():
    ap = _ler("app.py")
    assert '@app.post("/api/senha-liberacao/conferir")' in ap

    i = ap.index('@app.post("/api/senha-liberacao/conferir")')
    bloco = ap[i:ap.index("\n@app.", i + 1)] if "\n@app." in ap[i + 1:] else ap[i:]
    bloco = bloco.split("\n# ─── ")[0]
    assert "Depends(get_current_user)" in bloco, (
        "a rota da senha ficou sem a tranca do acesso local"
    )
    assert "db.conferir_senha_de_liberacao(" in bloco
    # E o motivo da recusa chega ao operador, em vez de virar 502 generico.
    assert "_repassar_recusa(" in bloco


# ── As rotas das Edge Functions ──────────────────────────────────────────────


def test_a_rota_da_estacao_exige_o_segredo_do_agente_antes_do_corpo():
    """Rota em endereco publico, sem `verify_jwt`: o que a protege e o segredo.

    E ele vem ANTES de qualquer leitura do corpo -- interpretar corpo de quem
    nao se identificou seria dar trabalho a quem nao tem direito a ele.
    """
    ts = _ler("supabase", "functions", "acesso-estacao", "index.ts")
    bloco = _bloco_da_rota(ts, "senha-liberacao")

    assert "await conferirAgente(req);" in bloco, "a rota da senha ficou sem segredo"
    assert bloco.index("conferirAgente") < bloco.index("req.json()"), (
        "o segredo tem de ser conferido antes de ler o corpo"
    )
    assert "conferirSenha(" in bloco
    assert '"conferir"' in bloco
    # So volta sim ou nao: a senha nunca viaja para a estacao.
    assert "senhaAtual" not in bloco, "a rota da estacao devolveria a senha"


def test_mostrar_a_senha_exige_o_modulo_usuarios_e_conferir_exige_so_sessao():
    """No `painel`, duas rotas com exigencias diferentes, de proposito.

    Ver a senha e ver um segredo da semana -- mesma regra da lista de codigos
    locais. Conferir e o operador do acabamento digitando: sessao, e nada mais.
    """
    ts = _ler("supabase", "functions", "painel", "index.ts")
    bloco = _bloco_da_rota(ts, "senha-liberacao")

    assert "await quemChama(req)" in bloco, "a rota da senha ficou sem sessao"

    # GET: modulo Usuarios (leitura) e a senha de agora.
    i_get = bloco.index('req.method === "GET"')
    i_post = bloco.index('"conferir"')
    assert i_get < i_post
    sub_get = bloco[i_get:i_post]
    assert "exigirModuloUsuarios(quem.permissoes, false)" in sub_get, (
        "mostrar a senha sem o modulo Usuarios entregaria o segredo a qualquer sessao"
    )
    assert "senhaAtual(" in sub_get

    # POST conferir: sessao (ja conferida pelo `quemChama` acima) e nada mais.
    sub_post = bloco[i_post:]
    assert "exigirModuloUsuarios" not in sub_post, (
        "conferir a senha nao pode exigir o modulo Usuarios: quem digita e o "
        "operador do acabamento"
    )
    assert "conferirSenha(" in sub_post
    assert "senhaAtual" not in sub_post, "conferir nao pode devolver a senha"


def test_o_modulo_existe_com_o_segredo_combinado_e_compara_em_tempo_constante():
    caminho = os.path.join(RAIZ, "supabase", "functions", "_compartilhado",
                           "senha_liberacao.ts")
    assert os.path.exists(caminho), "o modulo da senha sumiu"
    ts = _ler("supabase", "functions", "_compartilhado", "senha_liberacao.ts")

    assert 'export const SEGREDO_SENHA_LIBERACAO = "PESO_LIBERACAO_SEGREDO";' in ts
    assert 'export const FUSO = "America/Sao_Paulo";' in ts
    assert "iguaisEmTempoConstante" in ts, (
        "a comparacao da senha tem de ser em tempo constante, como a das assinaturas"
    )
    assert "precisaDoSegredo(SEGREDO_SENHA_LIBERACAO)" in ts, (
        "o segredo tem de vir pela `precisaDoSegredo` (ambiente, depois a tabela)"
    )
    assert '"senha-liberacao-peso:"' in ts
    # A semana e a de Sao Paulo, e nao a do UTC.
    assert "Intl.DateTimeFormat" in ts and "timeZone: FUSO" in ts

    # As quatro funcoes do contrato, com os nomes combinados com as outras duas
    # tarefas (a tela e o card do Menu Usuarios contam com elas).
    for assinatura in (
        "export function semanaDe(",
        "export async function senhaDaSemana(",
        "export async function senhaAtual(",
        "export async function conferirSenha(",
    ):
        assert assinatura in ts, "faltou " + assinatura


def test_a_rota_do_painel_e_a_que_a_tela_e_o_card_chamam():
    """`painel/api/senha-liberacao` e `.../conferir`: o endereco e contrato.

    A tela do acabamento (site) e o card do Menu Usuarios montam esse endereco
    por conta propria; se o `painel` renomear a rota, os dois quebram em
    silencio.
    """
    ts = _ler("supabase", "functions", "painel", "index.ts")
    assert 'p[0] === "senha-liberacao"' in ts
    assert re.search(r'p\[1\] === "conferir"', ts), "faltou a sub-rota conferir"
