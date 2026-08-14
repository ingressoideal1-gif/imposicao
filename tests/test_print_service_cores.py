# -*- coding: utf-8 -*-
"""O print_service resolve a config de cor por impressora e nunca bloqueia.

O envio real ao spooler e win32/hardware e nao roda em CI; aqui se testa o
que da para testar sem impressora: a resolucao da config, o aviso quando o
perfil sumiu, e o mock path (HAS_WIN32=False) continuar funcionando com e
sem perfil.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp
import print_service


@pytest.fixture
def icc_dir(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    return d


def _gravar_srgb(icc_dir, nome="p.icm"):
    caminho = os.path.join(str(icc_dir), nome)
    with open(caminho, "wb") as f:
        f.write(cp.srgb_icc_bytes())
    return caminho


def _pdf_min(tmp_path):
    import fitz
    p = str(tmp_path / "min.pdf")
    d = fitz.open()
    d.new_page()
    d.save(p)
    d.close()
    return p


def test_sem_perfil_o_mock_imprime_como_sempre(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    ok, msg = print_service.send_print_job_windows(
        "Qualquer", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
    assert "SEM gerenciamento" not in msg


def test_perfil_sumido_avisa_na_mensagem_mas_imprime(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    cp.save_printer_icc_map({"X": {"perfil": "sumiu.icm", "intento": "relativo", "ativo": True}})
    ok, msg = print_service.send_print_job_windows(
        "X", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
    assert "SEM gerenciamento" in msg


def test_perfil_ativo_no_mock_nao_quebra(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    _gravar_srgb(icc_dir)
    cp.save_printer_icc_map({"X": {"perfil": "p.icm", "intento": "relativo", "ativo": True}})
    ok, msg = print_service.send_print_job_windows(
        "X", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
