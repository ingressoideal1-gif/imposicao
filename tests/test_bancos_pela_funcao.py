import json
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

import db  # noqa: E402


class _Resposta:
    def read(self):
        return json.dumps({"bancos": [], "vinculos": []}).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_estacao_envia_segredo_e_operador_para_a_edge(monkeypatch):
    import acesso_publicacao

    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: "segredo-sintetico")
    monkeypatch.setattr(acesso_publicacao, "_base", lambda: "https://exemplo/functions/v1/acesso-estacao")
    vistos = []

    def abrir(req, timeout=None):
        vistos.append((req, timeout))
        return _Resposta()

    monkeypatch.setattr(db.urllib.request, "urlopen", abrir)
    db.operar_bancos_pedido("consultar", {"id_int": 21460}, "A1B2C3")

    req, timeout = vistos[0]
    assert req.full_url.endswith("/api/acesso/bancos-pedido/consultar")
    assert req.headers["X-agente-segredo"] == "segredo-sintetico"
    assert req.headers["X-operador-codigo"] == "A1B2C3"
    assert json.loads(req.data.decode()) == {"id_int": 21460}
    assert timeout == 60


def test_estacao_nao_volta_para_anon_sem_identidade(monkeypatch):
    import acesso_publicacao

    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: "segredo-sintetico")
    monkeypatch.setattr(db.urllib.request, "urlopen", lambda *_a, **_k: pytest.fail("nao deve chamar"))
    with pytest.raises(RuntimeError, match="codigo do operador"):
        db.operar_bancos_pedido("consultar", {"id_int": 1}, "")


def test_frontend_nao_acessa_as_duas_tabelas_diretamente():
    with open(os.path.join(RAIZ, "frontend", "script.js"), encoding="utf-8") as arquivo:
        codigo = arquivo.read()
    assert ".from('pedidos_bancos')" not in codigo
    assert ".from('pedidos_modelos_banco')" not in codigo
    assert "/api/bancos-pedido/" in codigo
