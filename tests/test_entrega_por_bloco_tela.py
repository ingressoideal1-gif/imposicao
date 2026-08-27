# -*- coding: utf-8 -*-
"""A tela da entrega por bloco: a escolha salva e o aviso do cancelamento.

Duas pendencias que o usuario mandou executar em 27/08/2026, depois de a entrega
por bloco entrar no ar (v742 / agente 1.2.237).

## A escolha fica salva no modelo

Pela regra do projeto, escolha de impressao do operador fica salva no modelo, e
nao so na sessao. A coluna nova e `pedidos_modelos.entregar_por_bloco`, criada
por `sql/schema_entregar_por_bloco.sql`.

Ela aceita NULO de proposito, e o nulo significa "ninguem escolheu neste modelo"
-- vale o padrao da tela, que hoje e marcado. Nao ha `DEFAULT true` porque o dia
em que o padrao da tela mudar, os modelos ja gravados nao podem carregar um
`true` que ninguem digitou: o padrao mora num lugar so, a tela, e a coluna guarda
apenas a divergencia.

## O aviso do cancelamento

Cancelar NAO desfaz o que ja saiu: cada lote vai para o hotfolder ou para a
impressora assim que fica pronto, e papel entregue nao volta. Um aviso que diz
apenas "cancelado" deixa o operador sem saber se conferir a bandeja, nem de onde
remandar.
"""
import io
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "entrega_por_bloco_tela_harness.js")


def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_harness_da_tela_passa():
    assert os.path.exists(HARNESS), "o harness da tela sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=120,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_a_migracao_da_coluna_existe_e_aceita_nulo():
    """O SQL fica no repositorio, completo e pronto para colar.

    E ele que documenta por que a coluna nao tem `DEFAULT true` -- quem for
    mexer no padrao da tela amanha precisa achar essa nota antes.
    """
    sql = _ler("sql/schema_entregar_por_bloco.sql")
    assert "add column if not exists entregar_por_bloco boolean" in sql.lower(), (
        "a migracao da coluna sumiu ou mudou de forma"
    )
    # So o SQL de verdade: o comentario CITA o `DEFAULT` para explicar por que
    # ele nao existe, e citar nao e declarar. Sem tirar os comentarios, o
    # arquivo se acusa e a protecao nasce reprovada -- a mesma armadilha que o
    # `test_paralelismo.py` documenta.
    comandos = " ".join(
        linha for linha in sql.splitlines() if not linha.strip().startswith("--")
    ).lower()
    assert "default" not in comandos, (
        "a coluna ganhou um DEFAULT: o padrao tem de morar so na tela, para que "
        "mudar o padrao amanha nao deixe os modelos ja gravados carregando um "
        "valor que ninguem digitou"
    )


def test_a_conta_de_folhas_entregues_chega_ate_a_tela():
    """Os tres saltos: motor -> app.py -> navegador.

    A conta so serve se atravessar os tres. Um deles esquecido faz o aviso de
    cancelamento voltar a ser generico, sem ninguem perceber -- e o teste do
    motor sozinho continuaria passando.
    """
    engine = _ler("engine.py")
    assert '"folhas_entregues": self.folhas_entregues' in engine, (
        "o motor parou de mandar a conta junto do lote"
    )

    app = _ler("app.py")
    i = app.index('"type": "file",')
    assert '"folhas_entregues": file_info.get("folhas_entregues")' in app[i:i + 900], (
        "o app.py nao repassa a conta no evento do streaming"
    )

    pedido = _ler("frontend/pedido.js")
    assert "window._entregaEmCurso" in pedido, (
        "a tela nao guarda mais o que foi entregue"
    )

    script = _ler("frontend/script.js")
    i = script.index("function cancelarImpressaoOuGeracao()")
    assert "textoDoCancelamento()" in script[i:i + 1200], (
        "o cancelamento voltou ao aviso generico: o operador nao saberia que "
        "parte da tiragem ja foi para a impressora"
    )
