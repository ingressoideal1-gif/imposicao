"""Zeros mudam apenas a apresentação, inclusive na passagem para outro local."""
from types import SimpleNamespace
from pathlib import Path
import subprocess

import fitz
import pytest

from engine import ImpositionEngine


def test_controles_e_previas_no_navegador():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(["node", "tests/camarote_zeros_harness.js"], cwd=root,
                            capture_output=True, text=True, encoding="utf-8", timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("tipo,prefixo", [
    ("CAMAROTE_LOCAL", "Mesa "),
    ("CAMAROTE_PESSOA", "Cadeira "),
    ("CAMAROTE_PESSOA_TOTAL", "Cadeira "),
])
@pytest.mark.parametrize("pad", [None, 0, 2, 6])
@pytest.mark.parametrize("indice", [0, 4, 5])
def test_texto_no_pdf(tipo, prefixo, pad, indice):
    eng = object.__new__(ImpositionEngine)
    eng.cfg = SimpleNamespace(l_cam=5, c_ini=7)
    eng._font_buffer_cache = {}
    el = dict(type=tipo, prefix=prefixo, _x=150, _y=90,
              font_size=12, font_name="helv")
    if pad is not None:
        el["pad"] = pad
    valor = eng._resolve_camarote_val(el, indice, 1)
    esperado = 7 + indice // 5 if tipo == "CAMAROTE_LOCAL" else indice % 5 + 1
    assert valor == esperado
    texto = prefixo + str(esperado).zfill(pad or 0)
    if tipo == "CAMAROTE_PESSOA_TOTAL":
        texto += "/" + "5".zfill(pad or 0)
    with fitz.open() as doc:
        page = doc.new_page(width=600, height=300)
        eng._render_element(page, el, 0, 0, valor)
        assert page.get_text().strip() == texto


def test_pad_nao_trunca_numero_maior_que_largura():
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    el = dict(type="CAMAROTE_PESSOA_TOTAL", prefix="", pad=2, _l_cam=1000,
              _x=150, _y=90, font_size=12, font_name="helv")
    with fitz.open() as doc:
        page = doc.new_page(width=600, height=300)
        eng._render_element(page, el, 0, 0, 123)
        assert page.get_text().strip() == "123/1000"
