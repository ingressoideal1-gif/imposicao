# -*- coding: utf-8 -*-
"""Endpoints de perfis ICC: upload valida, lista descreve, mapa persiste."""
import io
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp


@pytest.fixture
def client(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    import app as app_module
    return TestClient(app_module.app)


def test_upload_de_perfil_bom_e_listagem(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("meu_srgb.icm", io.BytesIO(cp.srgb_icc_bytes()))})
    assert r.status_code == 200
    assert r.json()["perfil"]["classe"] == "RGB"

    r = client.get("/api/icc")
    assert any(p["filename"] == "meu_srgb.icm" for p in r.json())


def test_upload_corrompido_e_recusado_e_nao_fica_na_pasta(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("lixo.icm", io.BytesIO(b"nao sou um perfil"))})
    assert r.status_code == 400
    assert not any(p["filename"] == "lixo.icm" for p in client.get("/api/icc").json())


def test_upload_de_extensao_errada_e_recusado(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("perfil.txt", io.BytesIO(b"x"))})
    assert r.status_code == 400


def test_mapa_persiste_ida_e_volta(client):
    novo = {"Xerox": {"perfil": "meu_srgb.icm", "intento": "relativo", "ativo": True}}
    r = client.post("/api/printers/icc-map", json=novo)
    assert r.status_code == 200
    assert client.get("/api/printers/icc-map").json() == novo
