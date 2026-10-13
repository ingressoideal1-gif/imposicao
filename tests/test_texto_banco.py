"""Texto variável criado no navegador e renderizado no motor, sem serviços reais."""
import json
import re
from pathlib import Path
import subprocess

import fitz
import pytest

from engine import ImpositionEngine, MM2PT

RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def elemento(tmp_path_factory):
    payload = tmp_path_factory.mktemp("texto-banco") / "elemento.json"
    r = subprocess.run(["node", str(RAIZ / "tests/texto_banco_browser_harness.js"), str(payload)],
                       cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", timeout=90)
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(payload.read_text(encoding="utf-8"))


def desenhar(elemento, linha, **opcoes):
    el = dict(elemento, _x=200, _y=150, max_width_mm=0, prefix="ID: ", suffix=" VIP", pad=4)
    el.update(opcoes)
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    eng = object.__new__(ImpositionEngine)
    eng._font_buffer_cache = {}
    eng._render_element(page, el, 0, 0, 99, linha)
    return doc, page


@pytest.mark.parametrize("valor,esperado", [
    ("7", "ID: 0007 VIP"), (0, "ID: 0000 VIP"), ("00012", "ID: 00012 VIP"),
    ("MARIA DA SILVA", "ID: MARIA DA SILVA VIP"), ("AB7", "ID: AB7 VIP"),
    ("", ""), (None, ""),
])
def test_conteudo_do_pdf_igual_ao_canvas(elemento, valor, esperado):
    doc, page = desenhar(elemento, {"NOME": valor})
    assert page.get_text().strip() == esperado
    doc.close()


def test_sem_linha_recusa_impressao(elemento):
    with pytest.raises(ValueError, match="sem linha"):
        desenhar(elemento, None)


@pytest.mark.parametrize("modo", ["shrink", "wrap", "condense"])
@pytest.mark.parametrize("alinhamento", ["left", "center", "right"])
def test_texto_formatado_cabe_no_espaco_do_pdf(elemento, modo, alinhamento):
    doc, page = desenhar(elemento, {"NOME": "MARIA DA SILVA E COSTA"},
                         max_width_mm=35, overflow=modo, text_align=alinhamento)
    spans = [s for b in page.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]
    assert spans
    metade = 35 * MM2PT / 2
    for s in spans:
        assert s["bbox"][0] >= 200 - metade - 0.5
        assert s["bbox"][2] <= 200 + metade + 0.5
    if alinhamento == "left":
        assert min(s["bbox"][0] for s in spans) == pytest.approx(200 - metade, abs=0.5)
    if alinhamento == "right":
        assert max(s["bbox"][2] for s in spans) == pytest.approx(200 + metade, abs=0.5)
    doc.close()


def test_contrato_legado_e_texto_fixo_preservados(elemento):
    doc, page = desenhar(elemento, {"NOME": "7"}, database_text=False)
    assert page.get_text().strip() == "7"
    doc.close()
    doc, page = desenhar(elemento, {"NOME": "MARIA"}, database_text=False,
                         type="FIXED", fixed=True, fixed_value="FIXO")
    assert page.get_text().strip() == "FIXO"
    doc.close()


@pytest.mark.parametrize("modo", ["shrink", "wrap", "condense"])
@pytest.mark.parametrize("rotacao", [0, 37, 90])
def test_contorno_colorido_no_pdf_com_ajuste_e_rotacao(elemento, modo, rotacao):
    doc, page = desenhar(elemento, {"NOME": "MARIA DA SILVA E COSTA"},
                         text_stroke_mm=0.4, text_stroke_color="#ff0000",
                         color="#0000ff", font_size=24, max_width_mm=35,
                         overflow=modo, rotation=rotacao)
    # Verifica o PDF persistido, não só os argumentos enviados à biblioteca.
    salvo = fitz.open(stream=doc.tobytes(), filetype="pdf")
    try:
        page = salvo[0]
        stream = page.read_contents().decode("latin1")
        larguras = re.findall(r"([0-9.]+) w\b", stream)
        assert larguras
        assert all(float(w) == pytest.approx(0.4 * MM2PT, abs=0.0001) for w in larguras)
        traces = page.get_texttrace()
        assert any(t["type"] == 0 and t["color"] == pytest.approx((0, 0, 1)) for t in traces)
        assert any(t["type"] == 1 and t["color"] == pytest.approx((1, 0, 0)) for t in traces)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        pixels = zip(*[iter(pix.samples)] * 3)
        assert any(r > 180 and g < 80 and b < 80 for r, g, b in pixels)
    finally:
        salvo.close()
        doc.close()


@pytest.mark.parametrize("opcoes", [
    {"text_stroke_mm": 0}, {"text_stroke_mm": -1}, {"text_stroke_mm": "inválido"},
    {"text_stroke_mm": None}, {"text_stroke_mm": 0.4, "database_text": False},
    {"text_stroke_mm": 0.4, "type": "FIXED", "fixed": True, "fixed_value": "FIXO"},
])
def test_sem_contorno_e_tipos_antigos_preservados(elemento, opcoes):
    doc, page = desenhar(elemento, {"NOME": "MARIA"}, **opcoes)
    try:
        assert page.get_texttrace()
        assert all(t["type"] == 0 for t in page.get_texttrace())
    finally:
        doc.close()


def test_contorno_limita_espessura_e_cor_invalida(elemento):
    doc, page = desenhar(elemento, {"NOME": "MARIA"},
                         text_stroke_mm=20, text_stroke_color="inválida")
    try:
        stream = page.read_contents().decode("latin1")
        assert float(re.search(r"([0-9.]+) w\b", stream)[1]) == pytest.approx(10 * MM2PT)
        assert any(t["type"] == 1 and t["color"] == (0, 0, 0) for t in page.get_texttrace())
    finally:
        doc.close()
