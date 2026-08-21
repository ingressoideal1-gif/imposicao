# -*- coding: utf-8 -*-
"""O peso por setor sai da estacao pela Edge Function, e nao pela chave publica.

## O que foi medido em 21/08/2026

Com a chave anonima -- a que esta no codigo-fonte de toda pagina do painel:

    GET propostas_os_setores?select=id_int,setor,peso_real_kg  ->  200, []

Duzentos e vinte, corpo vazio. A tabela e do PARCEIRO e tem RLS: as quatro
politicas (SELECT, INSERT, UPDATE, DELETE) sao de `authenticated`. Na estacao da
grafica o operador entra pelo codigo de acesso local, sem sessao do Supabase --
entao ele e `anon`, e para ele aquela tabela simplesmente nao existe.

Esse e o pior jeito de falhar que ha: nao ha erro para mostrar. O operador
digitaria o peso, veria o campo aceitar o numero, e nada teria sido gravado.

## Por que isto importa mais do que pareceria

No mesmo dia o usuario decidiu que a digitacao do peso e a escolha dos drops
seriam feitas **pelo acesso local no agente** -- ou seja, exatamente no lugar
onde o caminho direto nao funciona.

A saida e a mesma do catalogo de fontes: a estacao apresenta o
`ACESSO_AGENTE_SEGREDO` a Edge Function `acesso-estacao`, e a escrita acontece la
com a `service_role`, que nunca vai para as estacoes (decisao de `acesso_api.py`:
essa chave abre cliente, proposta e financeiro do parceiro).

## O que estes testes protegem

1. A estacao NUNCA fala com `propostas_os_setores` pelo PostgREST.
2. A escrita e ESTREITA: a regra de ouro do `docs/REGRAS_BANCO.md` continua
   valendo para todo o resto da linha do parceiro.
3. O motivo da recusa chega ao operador, em vez de virar "erro interno".
"""
import json
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


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
    resposta = {"corpo": {"status": "success", "setores": []}}

    def urlopen(req, timeout=None):
        vistas.append({
            "url": req.full_url,
            "metodo": req.get_method(),
            "segredo": req.headers.get("X-agente-segredo"),
            "corpo": json.loads(req.data.decode()) if req.data else None,
        })
        return _Resposta(resposta["corpo"])

    monkeypatch.setattr(db.urllib.request, "urlopen", urlopen)
    vistas_e_resposta = (vistas, resposta)
    return vistas_e_resposta


def _so_o_codigo(ts, funcao):
    """O corpo de uma funcao do `pesos.ts`, sem a prosa em volta.

    Entre uma funcao e a seguinte mora a documentacao dela, e a documentacao
    CITA as colunas do parceiro justamente para dizer o que cada escrita pode
    tocar. Medir sobre o texto cru faria o comentario reprovar o codigo.
    """
    import re

    corpo = ts[ts.index("export async function " + funcao + "("):]
    fim = corpo.find("\nexport ", 1)
    if fim > 0:
        corpo = corpo[:fim]
    return re.sub(r"/\*.*?\*/", "", corpo, flags=re.S)


def _nunca_pelo_postgrest(monkeypatch):
    monkeypatch.setattr(db, "_supabase_call", lambda *a, **k: pytest.fail(
        "a estacao falou com o PostgREST: para `anon` a tabela do parceiro "
        "volta vazia, e o peso se perderia em silencio"))


def test_ler_o_peso_sai_pela_funcao_com_o_segredo(funcao, monkeypatch):
    vistas, resposta = funcao
    _nunca_pelo_postgrest(monkeypatch)
    resposta["corpo"] = {"setores": [{"setor": "PVC", "peso_real_kg": 4.16}]}

    linhas = db.ler_peso_dos_setores(20975)

    assert linhas == [{"setor": "PVC", "peso_real_kg": 4.16}]
    assert len(vistas) == 1
    assert vistas[0]["metodo"] == "GET"
    assert vistas[0]["url"].endswith("/api/acesso/peso-setores/20975")
    assert vistas[0]["segredo"] == "segredo-do-agente"


def test_gravar_o_peso_sai_pela_funcao_com_o_segredo(funcao, monkeypatch):
    vistas, resposta = funcao
    _nunca_pelo_postgrest(monkeypatch)
    resposta["corpo"] = {"status": "success", "setor": "LASER", "peso_real_kg": 0.32}

    r = db.gravar_peso_do_setor(20975, "LASER", "0,32")

    assert r["status"] == "success"
    assert len(vistas) == 1
    assert vistas[0]["metodo"] == "POST"
    assert vistas[0]["url"].endswith("/api/acesso/peso-setores/20975")
    assert vistas[0]["segredo"] == "segredo-do-agente"
    assert vistas[0]["corpo"] == {"setor": "LASER", "peso_real_kg": "0,32"}


def test_o_agente_nao_valida_o_peso_por_conta_propria(funcao, monkeypatch):
    """A virgula e a lista de setores validos moram na Edge Function, uma vez so.

    Duas copias da regra criariam duas verdades, e a que vale e a do servidor --
    ele e quem fala com o banco e conhece o `CHECK` da tabela. O relay repassa o
    texto do jeito que veio.
    """
    vistas, _ = funcao
    _nunca_pelo_postgrest(monkeypatch)

    db.gravar_peso_do_setor(1, "PVC", "4,16")
    assert vistas[0]["corpo"]["peso_real_kg"] == "4,16", (
        "o agente converteu o peso: essa conta e do servidor"
    )


def test_sem_segredo_o_peso_nao_e_gravado_em_silencio(monkeypatch):
    """Estacao sem `ACESSO_AGENTE_SEGREDO` tem de FALHAR, e falhar alto.

    A alternativa seria voltar ao PostgREST com a chave anonima -- que responde
    200 e nao grava nada. Erro ruidoso e melhor do que peso que some.
    """
    import acesso_publicacao

    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: None)
    _nunca_pelo_postgrest(monkeypatch)

    with pytest.raises(RuntimeError, match="ACESSO_AGENTE_SEGREDO"):
        db.gravar_peso_do_setor(1, "PVC", "1")


def test_a_regra_do_peso_mora_num_lugar_so_na_edge_function():
    """`_compartilhado/pesos.ts` e o dono da regra, e ela e ESTREITA.

    Escrever em `propostas_os_setores` e a unica excecao a regra de ouro do
    REGRAS_BANCO. Ela so continua legitima enquanto tocar o peso e a data -- e
    mais `id_int`, `setor` e `id_os` ao criar a linha.
    """
    caminho = os.path.join(RAIZ, "supabase", "functions", "_compartilhado", "pesos.ts")
    assert os.path.exists(caminho), "o modulo do peso sumiu"
    with open(caminho, encoding="utf-8") as f:
        ts = f.read()

    assert 'const TABELA = "propostas_os_setores";' in ts
    assert '["FLEXO", "PVC", "TEXTIL", "LASER"]' in ts, (
        "a lista tem de ser a mesma do CHECK da tabela"
    )

    # Atualiza primeiro, insere so quando nao ha linha.
    assert ts.index('banco(\n    "PATCH"') < ts.index('banco("POST", TABELA, linha)'), (
        "o PATCH tem de vir antes do POST"
    )

    # E nenhuma coluna do parceiro entra na conversa DO PESO.
    #
    # `status_producao` saiu desta lista em 21/08/2026: ele passou a ser escrito,
    # mas pelo `concluirSetor`, e nao aqui. O recorte da funcao existe justamente
    # para o teste continuar cobrando cada escrita pelo que ELA toca.
    corpo = _so_o_codigo(ts, "gravarPeso")
    for coluna in ("status_producao", "prazo", "hora", "qtd_volumes",
                   "tipo_volume", "responsavel_conferencia"):
        assert coluna not in corpo, (
            "a gravacao do peso encostou em " + coluna + ", que e do parceiro"
        )


def test_a_rota_do_peso_exige_o_segredo_do_agente():
    """Rota que ESCREVE, em endereco publico, sem `verify_jwt`.

    O que a protege e o `conferirAgente`, e ele tem de vir ANTES de qualquer
    leitura do corpo -- interpretar corpo de quem nao se identificou seria dar
    trabalho a quem nao tem direito a ele.
    """
    caminho = os.path.join(RAIZ, "supabase", "functions", "acesso-estacao", "index.ts")
    with open(caminho, encoding="utf-8") as f:
        ts = f.read()

    i = ts.index('if (p[0] === "peso-setores")')
    bloco = ts[i:ts.index("\n  }", i)]

    assert "await conferirAgente(req);" in bloco, "a rota do peso ficou sem segredo"
    assert bloco.index("conferirAgente") < bloco.index("req.json()"), (
        "o segredo tem de ser conferido antes de ler o corpo"
    )
    assert "lerPesos" in bloco and "gravarPeso" in bloco


def test_a_estacao_serve_o_arquivo_da_tela():
    """O `acabamento.js` continua indo para a estacao.

    Sem ele no `PAINEL_ARQUIVOS`, a maquina do acabamento abriria o painel com a
    tela faltando -- e e justamente ali que o peso passou a ser digitado.
    """
    with open(os.path.join(RAIZ, "security_config.py"), encoding="utf-8") as f:
        cfg = f.read()
    assert '"acabamento.js"' in cfg


def test_as_duas_rotas_locais_existem_no_agente():
    with open(os.path.join(RAIZ, "app.py"), encoding="utf-8") as f:
        ap = f.read()

    assert '@app.get("/api/peso-setores/{pedido_id_int}")' in ap
    assert '@app.post("/api/peso-setores/{pedido_id_int}")' in ap

    # As duas atras da mesma tranca do resto do painel da estacao.
    i = ap.index('@app.get("/api/peso-setores')
    bloco = ap[i:]
    assert bloco.count("Depends(get_current_user)") >= 2, (
        "as rotas do peso ficaram sem a tranca do acesso local"
    )

    # E o motivo da recusa e repassado, em vez de virar 502 generico.
    assert "e.code if e.code in (400, 401, 422) else 502" in ap, (
        "a recusa do servidor tem de chegar ao operador com o motivo"
    )


def test_o_carimbo_e_a_expedicao_saem_pela_funcao(funcao, monkeypatch):
    """As duas escritas novas de 21/08/2026 tambem passam pela porta da estacao.

    `status_producao` mora na mesma tabela do peso, com a mesma RLS de
    `authenticated` -- sem a porta, o carimbo nao aconteceria e sem erro.

    Ja `propostas` e outra historia: hoje a politica `Enable read access for all`
    e ALL/public/true, entao a chave anonima ESCREVE ali. A rota existe assim
    mesmo, para que o caminho da estacao seja UM so e o dia em que aquela
    politica for fechada nao leve a expedicao junto.
    """
    vistas, resposta = funcao
    _nunca_pelo_postgrest(monkeypatch)

    resposta["corpo"] = {"status": "success", "setor": "PVC", "status_producao": "CONCLUIDO"}
    db.concluir_setor(20975, "PVC", True)

    resposta["corpo"] = {"status": "success", "id_int": 20975, "status_interno": "EXPEDICAO"}
    db.enviar_para_expedicao(20975)

    assert len(vistas) == 2
    assert vistas[0]["url"].endswith("/api/acesso/setor-concluido/20975")
    assert vistas[0]["corpo"] == {"setor": "PVC", "concluido": True}
    assert vistas[1]["url"].endswith("/api/acesso/expedicao/20975")
    assert all(v["metodo"] == "POST" for v in vistas)
    assert all(v["segredo"] == "segredo-do-agente" for v in vistas)


def test_o_descarimbo_nao_pisa_no_que_o_erp_escreveu():
    """`status_producao` e coluna do parceiro, e ele escreve nela pela tela dele.

    Por isso o descarimbo so acontece quando o valor atual e EXATAMENTE
    CONCLUIDO -- qualquer outra coisa ali foi o ERP quem pos. E o valor de volta
    e EM ACABAMENTO, que descreve a verdade (o material voltou para a mesa) em
    vez de apagar o campo.
    """
    caminho = os.path.join(RAIZ, "supabase", "functions", "_compartilhado", "pesos.ts")
    with open(caminho, encoding="utf-8") as f:
        ts = f.read()

    corpo = _so_o_codigo(ts, "concluirSetor")

    assert 'const CONCLUIDO = "CONCLUIDO";' in ts
    assert 'const DE_VOLTA_A_MESA = "EM ACABAMENTO";' in ts
    assert "if (antes !== CONCLUIDO) return" in corpo, (
        "sem esta guarda, o descarimbo apagaria o que o ERP escreveu"
    )

    # E o carimbo toca so as tres colunas dele.
    for coluna in ("prazo", "hora", "qtd_volumes", "tipo_volume",
                   "responsavel_conferencia"):
        assert coluna not in corpo, (
            "o carimbo encostou em " + coluna + ", que e do parceiro"
        )


def test_a_expedicao_escreve_so_o_status_interno():
    """`propostas` e a tabela PRINCIPAL do parceiro.

    A escrita tem de ser de uma coluna so, com um valor so: `EXPEDICAO`, que o
    ERP ja usa. Qualquer coisa alem disso e alargar a excecao sem pedir.
    """
    caminho = os.path.join(RAIZ, "supabase", "functions", "_compartilhado", "pesos.ts")
    with open(caminho, encoding="utf-8") as f:
        ts = f.read()

    corpo = ts[ts.index("export async function enviarParaExpedicao("):]
    assert '{ status_interno: "EXPEDICAO" }' in corpo, (
        "a expedicao tem de gravar so o status_interno"
    )
    assert "404" in corpo, "pedido inexistente precisa dizer que nao existe"

    # E o frontend faz igual no caminho da nuvem.
    with open(os.path.join(RAIZ, "frontend", "acabamento.js"), encoding="utf-8") as f:
        js = f.read()
    assert "update({ status_interno: 'EXPEDICAO' })" in js


def test_as_rotas_do_carimbo_e_da_expedicao_exigem_o_segredo():
    caminho = os.path.join(RAIZ, "supabase", "functions", "acesso-estacao", "index.ts")
    with open(caminho, encoding="utf-8") as f:
        ts = f.read()

    for rota in ("setor-concluido", "expedicao"):
        i = ts.index('if (p[0] === "' + rota + '")')
        bloco = ts[i:ts.index("\n  }", i)]
        assert "await conferirAgente(req);" in bloco, (
            "a rota " + rota + " ficou sem segredo"
        )


def test_as_rotas_locais_do_agente_existem():
    with open(os.path.join(RAIZ, "app.py"), encoding="utf-8") as f:
        ap = f.read()

    assert '@app.post("/api/setor-concluido/{pedido_id_int}")' in ap
    assert '@app.post("/api/expedicao/{pedido_id_int}")' in ap

    i = ap.index('@app.post("/api/setor-concluido')
    bloco = ap[i:]
    assert bloco.count("Depends(get_current_user)") >= 2, (
        "as rotas novas ficaram sem a tranca do acesso local"
    )
