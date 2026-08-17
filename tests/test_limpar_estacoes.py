# -*- coding: utf-8 -*-
"""Quem e orfao na lista de estacoes -- e, sobretudo, quem NAO e.

Cada linha de `print_agents` e uma INSTALACAO, nao uma maquina: reinstalar o
NewProd cria linha nova e a antiga fica para sempre. Em 17/08/2026 a lista dizia
"11 estacoes" para 9 maquinas.

O risco deste arquivo nao e deixar fantasma na lista -- e apagar estacao de
verdade. Uma maquina desligada ha uma semana continua sendo uma estacao da
grafica, e some da conferencia se alguem apagar o registro dela.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "ferramentas"))
import limpar_estacoes


def linha(id_, nome, visto):
    return {"id": id_, "name": nome, "last_seen": visto}


def test_a_instalacao_substituida_e_orfa():
    linhas = [
        linha("novo", "DESKTOP-5N8AF7D", "2026-08-17T09:00:00Z"),
        linha("velho", "DESKTOP-5N8AF7D", "2026-08-08T09:00:00Z"),
    ]
    assert [l["id"] for l in limpar_estacoes.orfas(linhas)] == ["velho"]


def test_maquina_com_UM_registro_nunca_e_orfa_por_mais_velha_que_esteja():
    """O erro que este teste existe para impedir.

    `DESKTOP-8B5SDS4` estava sem sinal ha 6 dias e e uma maquina de verdade, so
    desligada. Apagar por idade a tiraria da lista -- e com ela o registro de
    que ela existe e esta atrasada. Ela volta na segunda-feira e ninguem sabe
    que ela ficou para tras."""
    linhas = [linha("sozinho", "DESKTOP-8B5SDS4", "2019-01-01T00:00:00Z")]
    assert limpar_estacoes.orfas(linhas) == []


def test_a_mais_recente_de_cada_nome_fica():
    linhas = [
        linha("a1", "PC-JR-HOME", "2026-08-17T10:00:00Z"),
        linha("a2", "PC-JR-HOME", "2026-08-07T10:00:00Z"),
        linha("b1", "GUSTAVO-PROD", "2026-08-17T10:00:00Z"),
    ]
    ficam = {l["id"] for l in linhas} - {l["id"] for l in limpar_estacoes.orfas(linhas)}
    assert ficam == {"a1", "b1"}


def test_tres_instalacoes_da_mesma_maquina_deixam_uma():
    linhas = [
        linha("v1", "X", "2026-01-01T00:00:00Z"),
        linha("v2", "X", "2026-05-01T00:00:00Z"),
        linha("v3", "X", "2026-08-01T00:00:00Z"),
    ]
    assert sorted(l["id"] for l in limpar_estacoes.orfas(linhas)) == ["v1", "v2"]


def test_empate_exato_de_last_seen_nao_apaga_as_duas():
    """Duas linhas do mesmo nome com o MESMO horario. Se a comparacao fosse por
    data em vez de por `id`, as duas perderiam para si mesmas e a maquina
    sumiria inteira da lista."""
    linhas = [
        linha("i1", "X", "2026-08-17T10:00:00Z"),
        linha("i2", "X", "2026-08-17T10:00:00Z"),
    ]
    fora = limpar_estacoes.orfas(linhas)
    assert len(fora) == 1, "a maquina inteira sumiria da lista"


def test_linha_sem_nome_e_ignorada_e_nao_derruba_a_conta():
    linhas = [
        linha("x", "", "2026-08-17T10:00:00Z"),
        linha("y", None, "2026-08-17T10:00:00Z"),
        linha("ok", "X", "2026-08-17T10:00:00Z"),
    ]
    assert limpar_estacoes.orfas(linhas) == []


def test_last_seen_ausente_nao_vence_um_horario_de_verdade():
    """Linha sem `last_seen` e a candidata natural a orfa; ela nao pode ser a
    escolhida para ficar no lugar da que esta viva."""
    linhas = [
        {"id": "sem", "name": "X", "last_seen": None},
        linha("com", "X", "2026-08-17T10:00:00Z"),
    ]
    assert [l["id"] for l in limpar_estacoes.orfas(linhas)] == ["sem"]
