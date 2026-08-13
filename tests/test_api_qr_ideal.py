# -*- coding: utf-8 -*-
"""O endpoint que alimenta a previa do editor.

Ele so existe onde o pool existe — quer dizer, na estacao, servido pelo
proprio agente. No servidor da nuvem responde 503, e e isso que faz a tela
mostrar um QR de exemplo AVISADO em vez de um QR falso mudo: um QR errado que
nao se anuncia e pior que nenhum, porque o operador acha que conferiu.
"""
import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import qr_ideal


def _base36(n: int) -> str:
    alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = alfabeto[r] + s
    return (s or "0").rjust(qr_ideal.TAMANHO, "0")


@pytest.fixture(scope="module")
def pool_sintetico():
    fd, caminho = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    with open(caminho, "wb") as f:
        for bloco in range(0, qr_ideal.TOTAL, 100_000):
            fim = min(bloco + 100_000, qr_ideal.TOTAL)
            f.write(b"".join(_base36(i).encode("ascii") for i in range(bloco, fim)))
    yield caminho
    os.unlink(caminho)


def test_devolve_o_codigo_e_o_conteudo(pool_sintetico, monkeypatch):
    import app as app_mod
    monkeypatch.setattr(app_mod, "_POOL_QR", qr_ideal.PoolQR(pool_sintetico))
    cliente = TestClient(app_mod.app)

    r = cliente.get("/api/qr-ideal", params={"pedido": "20272", "modelo": "1000022", "item": 7})

    assert r.status_code == 200
    corpo = r.json()
    assert corpo["coluna"] == 50
    assert corpo["linha"] == 7
    assert corpo["codigo"] == _base36(1_470_006)
    assert corpo["conteudo"] == "27202" + _base36(1_470_006)


def test_pedido_terminado_em_zero_mantem_o_zero(pool_sintetico, monkeypatch):
    import app as app_mod
    monkeypatch.setattr(app_mod, "_POOL_QR", qr_ideal.PoolQR(pool_sintetico))
    cliente = TestClient(app_mod.app)

    r = cliente.get("/api/qr-ideal", params={"pedido": "20270", "modelo": "1000022", "item": 1})

    assert r.status_code == 200
    assert r.json()["conteudo"].startswith("07202")


def test_sem_pool_na_maquina_responde_503(monkeypatch):
    import app as app_mod
    monkeypatch.setattr(app_mod, "_POOL_QR", False)
    cliente = TestClient(app_mod.app)

    r = cliente.get("/api/qr-ideal", params={"pedido": "20272", "modelo": "1000022", "item": 7})

    assert r.status_code == 503
