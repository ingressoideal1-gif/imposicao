# -*- coding: utf-8 -*-
"""Testes do modulo de gerenciamento de cores (perfis ICC por impressora).

Os perfis de teste sao gerados pelo proprio LittleCMS (sRGB), entao nao ha
binario de teste a versionar. A classe CMYK nao tem como ser sintetizada pelo
Pillow; os ramos CMYK sao cobertos passando um cfg montado a mao.
"""
import io
import os
import sys

import fitz
import pytest
from PIL import ImageCms

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp


@pytest.fixture
def icc_dir(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    return d


def _gravar_srgb(icc_dir, nome="teste_srgb.icm"):
    caminho = os.path.join(str(icc_dir), nome)
    with open(caminho, "wb") as f:
        f.write(cp.srgb_icc_bytes())
    return caminho


def test_srgb_icc_bytes_e_um_perfil_valido():
    dados = cp.srgb_icc_bytes()
    assert len(dados) > 100
    # O proprio LittleCMS precisa conseguir reler o que gerou
    prof = ImageCms.ImageCmsProfile(io.BytesIO(dados))
    assert "RGB" in (prof.profile.xcolor_space or "").upper()


def test_perfil_info_descreve_um_perfil_bom(icc_dir):
    caminho = _gravar_srgb(icc_dir)
    info = cp.perfil_info(caminho)
    assert info["filename"] == "teste_srgb.icm"
    assert info["classe"] == "RGB"
    assert info["nome"]  # nome interno legivel, nunca vazio


def test_perfil_corrompido_e_recusado_com_mensagem_clara(icc_dir):
    caminho = os.path.join(str(icc_dir), "lixo.icm")
    with open(caminho, "wb") as f:
        f.write(b"isto nao e um perfil ICC")
    with pytest.raises(ValueError, match="ICC"):
        cp.perfil_info(caminho)


def test_listar_perfis_ignora_extensoes_estranhas_e_marca_invalidos(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    with open(os.path.join(str(icc_dir), "quebrado.icm"), "wb") as f:
        f.write(b"x")
    with open(os.path.join(str(icc_dir), "leiame.txt"), "w") as f:
        f.write("nada a ver")
    perfis = cp.listar_perfis()
    nomes = {p["filename"] for p in perfis}
    assert nomes == {"bom.icc", "quebrado.icm"}
    quebrado = next(p for p in perfis if p["filename"] == "quebrado.icm")
    assert quebrado.get("erro")


def test_mapa_de_impressoras_grava_e_rele(icc_dir):
    cp.save_printer_icc_map({"Xerox": {"perfil": "bom.icc", "intento": "relativo", "ativo": True}})
    m = cp.load_printer_icc_map()
    assert m["Xerox"]["perfil"] == "bom.icc"


def test_resolver_config_sem_cadastro_devolve_none_sem_aviso(icc_dir):
    cfg, aviso = cp.resolver_config("Impressora Sem Cadastro")
    assert cfg is None and aviso is None


def test_resolver_config_desligado_devolve_none_sem_aviso(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    cp.save_printer_icc_map({"X": {"perfil": "bom.icc", "intento": "relativo", "ativo": False}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None and aviso is None


def test_resolver_config_ativo_devolve_config_completo(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    cp.save_printer_icc_map({"X": {"perfil": "bom.icc", "intento": "perceptual", "ativo": True}})
    cfg, aviso = cp.resolver_config("X")
    assert aviso is None
    assert cfg["classe"] == "RGB"
    assert cfg["intento"] == "perceptual"
    assert os.path.isfile(cfg["path"])


def test_resolver_config_perfil_sumido_avisa_e_nao_bloqueia(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "sumiu.icm", "intento": "relativo", "ativo": True}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None
    assert "SEM gerenciamento" in aviso


def test_embutir_output_intent_sobrevive_ao_save_com_garbage(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=200, height=200)
    page.draw_rect(fitz.Rect(10, 10, 100, 100), color=(1, 0, 0), fill=(1, 0, 0))
    cp.embutir_output_intent(doc, cp.srgb_icc_bytes(), "sRGB IEC61966-2.1", "RGB")
    out = str(tmp_path / "oi.pdf")
    doc.save(out, garbage=4, deflate=True)
    doc.close()

    relido = fitz.open(out)
    cat = relido.xref_object(relido.pdf_catalog())
    assert "OutputIntents" in cat


def test_pdf_com_output_intent_gera_temporario_com_intent(icc_dir, tmp_path):
    caminho = _gravar_srgb(icc_dir, "bom.icc")
    origem = str(tmp_path / "origem.pdf")
    d = fitz.open()
    d.new_page()
    d.save(origem)
    d.close()

    cfg = {"path": caminho, "intento": "relativo", "classe": "RGB", "nome": "sRGB"}
    novo = cp.pdf_com_output_intent(origem, cfg)
    try:
        assert novo != origem
        relido = fitz.open(novo)
        assert "OutputIntents" in relido.xref_object(relido.pdf_catalog())
        relido.close()
    finally:
        os.remove(novo)


def test_args_ghostscript_sem_config_e_vazio():
    assert cp.args_ghostscript(None) == []


def test_args_ghostscript_rgb_perceptual():
    cfg = {"path": "C:/x/p.icm", "intento": "perceptual", "classe": "RGB", "nome": "P"}
    args = cp.args_ghostscript(cfg)
    assert "-sOutputICCProfile=C:/x/p.icm" in args
    assert "-sColorConversionStrategy=RGB" in args
    assert "-dRenderIntent=0" in args
    assert not any("BlackPtComp" in a for a in args)


def test_args_ghostscript_cmyk_relativo_liga_compensacao_de_ponto_preto():
    cfg = {"path": "C:/x/p.icm", "intento": "relativo", "classe": "CMYK", "nome": "P"}
    args = cp.args_ghostscript(cfg)
    assert "-sColorConversionStrategy=CMYK" in args
    assert "-dRenderIntent=1" in args
    assert "-dBlackPtComp=1" in args


def test_transform_para_gdi_rgb_transforma_uma_imagem(icc_dir):
    from PIL import Image
    caminho = _gravar_srgb(icc_dir, "bom.icc")
    cfg = {"path": caminho, "intento": "relativo", "classe": "RGB", "nome": "sRGB"}
    t = cp.transform_para_gdi(cfg)
    img = Image.new("RGB", (8, 8), (200, 30, 30))
    resultado = ImageCms.applyTransform(img, t)
    assert resultado.size == (8, 8)
    assert resultado.mode == "RGB"
