# -*- coding: utf-8 -*-
"""Ajustes de cor por impressora: saturacao, brilho, contraste e curvas.

A matematica daqui e ESPELHADA no JS da previa (frontend/script.js): ordem
saturacao -> brilho -> contraste -> curvas, interpolacao linear nas curvas.
Se um teste destes mudar, a previa na tela precisa mudar junto — senao a tela
mostra uma coisa e o papel sai outra.
"""
import os
import sys

import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp


NEUTRO = {
    "saturacao": 100, "brilho": 0, "contraste": 0,
    "curvas": {"master": [[0, 0], [255, 255]], "r": [[0, 0], [255, 255]],
               "g": [[0, 0], [255, 255]], "b": [[0, 0], [255, 255]]},
}


def _img_teste():
    img = Image.new("RGB", (4, 1))
    img.putdata([(200, 30, 30), (30, 200, 30), (30, 30, 200), (128, 128, 128)])
    return img


# ─── deteccao de neutro ──────────────────────────────────────────────────────

def test_ajustes_neutros_reconhece_o_neutro():
    assert cp.ajustes_neutros(NEUTRO)
    assert cp.ajustes_neutros(None)
    assert cp.ajustes_neutros({})


def test_ajustes_neutros_acusa_qualquer_desvio():
    assert not cp.ajustes_neutros({**NEUTRO, "saturacao": 90})
    assert not cp.ajustes_neutros({**NEUTRO, "brilho": 5})
    assert not cp.ajustes_neutros({**NEUTRO, "contraste": -5})
    curvas = {**NEUTRO["curvas"], "master": [[0, 10], [255, 255]]}
    assert not cp.ajustes_neutros({**NEUTRO, "curvas": curvas})


# ─── aplicar_ajustes ─────────────────────────────────────────────────────────

def test_neutro_devolve_bytes_identicos():
    img = _img_teste()
    out = cp.aplicar_ajustes(img, NEUTRO)
    assert out.tobytes() == img.tobytes()


def test_saturacao_zero_vira_cinza():
    out = cp.aplicar_ajustes(_img_teste(), {**NEUTRO, "saturacao": 0})
    for r, g, b in out.getdata():
        assert abs(r - g) <= 1 and abs(g - b) <= 1


def test_brilho_positivo_clareia():
    out = cp.aplicar_ajustes(_img_teste(), {**NEUTRO, "brilho": 50})
    orig = list(_img_teste().getdata())
    novo = list(out.getdata())
    assert sum(sum(p) for p in novo) > sum(sum(p) for p in orig)


def test_contraste_minimo_achata_em_128():
    out = cp.aplicar_ajustes(_img_teste(), {**NEUTRO, "contraste": -100})
    for r, g, b in out.getdata():
        assert r == g == b == 128


def test_curva_master_invertida_inverte():
    curvas = {**NEUTRO["curvas"], "master": [[0, 255], [255, 0]]}
    out = cp.aplicar_ajustes(_img_teste(), {**NEUTRO, "curvas": curvas})
    orig = list(_img_teste().getdata())
    novo = list(out.getdata())
    for (r0, g0, b0), (r1, g1, b1) in zip(orig, novo):
        assert (r1, g1, b1) == (255 - r0, 255 - g0, 255 - b0)


def test_curva_de_canal_zera_so_aquele_canal():
    curvas = {**NEUTRO["curvas"], "r": [[0, 0], [255, 0]]}
    out = cp.aplicar_ajustes(_img_teste(), {**NEUTRO, "curvas": curvas})
    orig = list(_img_teste().getdata())
    novo = list(out.getdata())
    for (r0, g0, b0), (r1, g1, b1) in zip(orig, novo):
        assert r1 == 0
        assert (g1, b1) == (g0, b0)


def test_curva_com_ponto_no_meio_interpola_linear():
    # ponto (128 -> 64): em x=64 a curva linear da 32
    curvas = {**NEUTRO["curvas"], "master": [[0, 0], [128, 64], [255, 255]]}
    img = Image.new("RGB", (1, 1), (64, 128, 192))
    out = cp.aplicar_ajustes(img, {**NEUTRO, "curvas": curvas})
    r, g, b = list(out.getdata())[0]
    assert r == 32          # metade do caminho ate (128,64)
    assert g == 64          # exatamente no ponto
    # 192 esta no segmento (128,64)-(255,255): 64 + (192-128)*(191/127)
    assert abs(b - (64 + round(64 * 191 / 127))) <= 1


# ─── resolver_config com ajustes ─────────────────────────────────────────────

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


def test_so_ajustes_sem_perfil_devolve_config(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "", "intento": "relativo", "ativo": True,
                                   "ajustes": {**NEUTRO, "saturacao": 80}}})
    cfg, aviso = cp.resolver_config("X")
    assert aviso is None
    assert cfg is not None
    assert cfg["path"] is None
    assert cfg["ajustes"]["saturacao"] == 80


def test_ajustes_neutros_sem_perfil_devolve_none(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "", "intento": "relativo", "ativo": True,
                                   "ajustes": dict(NEUTRO)}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None and aviso is None


def test_perfil_sumido_com_ajustes_avisa_mas_preserva_ajustes(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "sumiu.icm", "intento": "relativo", "ativo": True,
                                   "ajustes": {**NEUTRO, "brilho": 10}}})
    cfg, aviso = cp.resolver_config("X")
    assert aviso and "SEM gerenciamento" in aviso
    assert cfg is not None and cfg["path"] is None
    assert cfg["ajustes"]["brilho"] == 10


def test_perfil_e_ajustes_juntos(icc_dir):
    _gravar_srgb(icc_dir)
    cp.save_printer_icc_map({"X": {"perfil": "p.icm", "intento": "relativo", "ativo": True,
                                   "ajustes": {**NEUTRO, "contraste": 15}}})
    cfg, aviso = cp.resolver_config("X")
    assert aviso is None
    assert cfg["path"] and cfg["classe"] == "RGB"
    assert cfg["ajustes"]["contraste"] == 15


def test_desligado_ignora_ajustes(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "", "intento": "relativo", "ativo": False,
                                   "ajustes": {**NEUTRO, "saturacao": 0}}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None and aviso is None


def test_args_ghostscript_sem_path_e_vazio():
    cfg = {"path": None, "intento": "relativo", "classe": None, "nome": None,
           "ajustes": {**NEUTRO, "saturacao": 50}}
    assert cp.args_ghostscript(cfg) == []
