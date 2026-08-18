# -*- coding: utf-8 -*-
"""O Render nao existe mais em lugar nenhum do aplicativo.

Em 17/08/2026 o usuario encerrou o assunto: *"Aplicacao nao tem mais nenhuma
ligacao com o Render, tudo pelo Supabase"*. O backend que morava em
`imposicao.onrender.com` virou Edge Function no Supabase; o `app.py` continua
vivo, mas so como motor da ESTACAO, em `http://localhost:9000`.

## Por que um teste, e nao so a limpeza

Porque o que sobra depois de uma migracao nao e codigo — e MENCAO. Um comentario
que diz "o Python continua no ar no endereco antigo" e uma instrucao errada para
a proxima pessoa: ela vai tentar voltar atras apontando para um servidor que nao
responde mais, e o sintoma vai aparecer longe dali. Uma constante esquecida e
pior ainda: `API_NUVEM` nao dava erro nenhum, so ficava la esperando alguem
achar que era o caminho certo.

Entao a regra e literal: nos arquivos que FORMAM o aplicativo, a palavra
`onrender` nao aparece. Nem em codigo, nem em comentario. Contar a historia
continua permitido — em `docs/`, e sem o nome do host: "o servidor Python que
ficava na nuvem" diz a mesma coisa e nao convida ninguem a tentar.

O `app.py` esta na lista mesmo continuando VIVO: ele e o motor da estacao, e o
que saiu foi a copia dele que rodava hospedada. Um comentario ali dizendo que o
mesmo arquivo "roda no Render, num endereco publico" descreveria uma segunda
instalacao que nao existe mais.
"""
import glob
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Os arquivos que o aplicativo carrega, publica ou usa para se publicar. Docs
# ficam de fora de proposito: `CHANGELOG.md` e `docs/superpowers/` sao registro
# historico, e reescrever registro e apagar a razao de o corte ter acontecido.
#
# As Edge Functions entram pelo mesmo motivo que o frontend: `cors.ts` guarda a
# GEMEA da lista `ALLOWED_ORIGINS` do `security_config.py`, e as duas divergiram
# na primeira limpeza -- o Python perdeu a origem do servidor antigo e o
# TypeScript ficou com ela. Uma lista de origens permitidas com um dominio que
# nao e mais nosso e a definicao de porta esquecida aberta.
ARQUIVOS = sorted(
    glob.glob(os.path.join(RAIZ, "frontend", "*.js"))
    + glob.glob(os.path.join(RAIZ, "frontend", "*.html"))
    + glob.glob(os.path.join(RAIZ, "supabase", "functions", "**", "*.ts"),
                recursive=True)
    + [
        os.path.join(RAIZ, "vercel.json"),
        os.path.join(RAIZ, "frontend", "vercel.json"),
        os.path.join(RAIZ, "security_config.py"),
        os.path.join(RAIZ, "agent_config.json"),
        os.path.join(RAIZ, "publicar.ps1"),
        os.path.join(RAIZ, "acesso_publicacao.py"),
        os.path.join(RAIZ, "agent_worker.py"),
        os.path.join(RAIZ, "app.py"),
    ]
)

# O que saiu junto com o servico: o descritor de deploy e as duas ferramentas
# que gravavam variavel de ambiente no painel do Render.
SUMIRAM = [
    "render.yaml",
    os.path.join("ferramentas", "copiar_para_render.ps1"),
    os.path.join("ferramentas", "variavel_no_render.ps1"),
    os.path.join("tests", "CopiarParaRender.Tests.ps1"),
    os.path.join("tests", "VariavelNoRender.Tests.ps1"),
]


def _relativo(caminho):
    return os.path.relpath(caminho, RAIZ).replace("\\", "/")


@pytest.mark.parametrize("caminho", ARQUIVOS, ids=_relativo)
def test_nenhum_arquivo_do_aplicativo_cita_o_render(caminho):
    if not os.path.exists(caminho):
        pytest.skip(f"{_relativo(caminho)} nao existe")
    with open(caminho, encoding="utf-8") as f:
        linhas = f.read().splitlines()
    culpadas = [
        f"  linha {n}: {l.strip()[:100]}"
        for n, l in enumerate(linhas, 1)
        if "onrender" in l.lower()
    ]
    assert not culpadas, "\n".join(
        [f"{_relativo(caminho)} ainda cita o Render:"] + culpadas
    )


@pytest.mark.parametrize("nome", SUMIRAM)
def test_o_que_so_servia_ao_render_nao_esta_mais_no_repositorio(nome):
    """Ferramenta de servico desligado e armadilha: ela roda, nao reclama, e
    grava a variavel num painel que ninguem le mais."""
    assert not os.path.exists(os.path.join(RAIZ, nome)), (
        f"{nome} continua no repositorio; ele so servia ao Render"
    )


def test_o_endereco_da_estacao_continua_sendo_o_da_propria_maquina():
    """O corte nao pode ter levado junto o motor LOCAL.

    `API_BASE_URL` continua existindo e continua vazio — e vazio e o valor
    certo: `${API_BASE_URL}/api/...` sai como caminho relativo, que na estacao
    (a pagina e servida pelo agente na 9000) chega ao proprio agente. Trocar
    isso por um endereco de nuvem qualquer poria a internet no caminho de quem
    espera na frente da impressora.
    """
    with open(os.path.join(RAIZ, "frontend", "supabase-config.js"),
              encoding="utf-8") as f:
        config = f.read()
    assert "const API_BASE_URL" in config, "API_BASE_URL sumiu"
    trecho = config[config.index("const API_BASE_URL"):]
    trecho = trecho[:trecho.index(";")]
    assert "http" not in trecho, (
        "API_BASE_URL voltou a apontar para um servidor de nuvem: " + trecho
    )


def test_a_vercel_nao_desvia_mais_a_api_para_lugar_nenhum():
    """O rewrite `/api/:path*` existia so para alcancar o Render.

    Sem servico do outro lado ele nao desvia para nada — e mantido, seria um
    convite a apontar `/api/` para o proximo servidor que aparecer, que e
    exatamente o caminho que a decisao de 16/08/2026 fechou: impressao so pela
    estacao da grafica.
    """
    import json

    for nome in ("vercel.json", "frontend/vercel.json"):
        with open(os.path.join(RAIZ, nome), encoding="utf-8") as f:
            conf = json.load(f)
        fontes = [r["source"] for r in conf.get("rewrites", [])]
        assert "/api/:path*" not in fontes, f"{nome} ainda desvia /api/"
