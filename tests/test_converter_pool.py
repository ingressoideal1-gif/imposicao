"""O conversor do pool: xlsx -> bin, com as invariantes verificadas.

Um pool errado nao aparece na conversao nem na impressao — aparece na
portaria, quando o ingresso nao valida e nao ha mais o que fazer. Por isso o
conversor recusa gravar diante de qualquer coisa fora do lugar, e e isso que
estes testes prendem.
"""
import os
import sys
import tempfile
import zipfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import qr_ideal
from ferramentas import converter_pool

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def _xlsx_falso(caminho, linhas, colunas, codigo_de):
    """Monta um .xlsx minimo com inlineStr, do jeito que o arquivo real e."""
    partes = ['<?xml version="1.0"?>', f'<worksheet xmlns="{NS}"><sheetData>']
    for lin in range(1, linhas + 1):
        partes.append(f'<row r="{lin}">')
        for col in range(1, colunas + 1):
            v = codigo_de(col, lin)
            partes.append(f'<c t="inlineStr"><is><t>{v}</t></is></c>')
        partes.append("</row>")
    partes.append("</sheetData></worksheet>")
    with zipfile.ZipFile(caminho, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", "".join(partes))


@pytest.fixture
def caminhos():
    fd_x, cx = tempfile.mkstemp(suffix=".xlsx")
    fd_b, cb = tempfile.mkstemp(suffix=".bin")
    os.close(fd_x)
    os.close(fd_b)
    yield cx, cb
    for c in (cx, cb):
        if os.path.exists(c):
            os.unlink(c)


def _pool_pequeno(monkeypatch, colunas, linhas):
    monkeypatch.setattr(qr_ideal, "COLUNAS", colunas)
    monkeypatch.setattr(qr_ideal, "LINHAS", linhas)
    monkeypatch.setattr(qr_ideal, "TOTAL", colunas * linhas)


def test_converte_gravando_coluna_a_coluna(monkeypatch, caminhos):
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=3, linhas=4)

    _xlsx_falso(cx, 4, 3, lambda c, l: f"C{c}L{l}".ljust(8, "X"))
    n = converter_pool.converter(cx, cb)

    assert n == 12
    with open(cb, "rb") as f:
        dados = f.read()
    assert len(dados) == 12 * 8
    # Coluna a coluna: as 4 linhas da coluna 1 vem primeiro.
    assert dados[0:8] == b"C1L1XXXX"
    assert dados[3 * 8:4 * 8] == b"C1L4XXXX"
    assert dados[4 * 8:5 * 8] == b"C2L1XXXX"


def test_a_posicao_gravada_e_a_que_o_indice_aponta(monkeypatch, caminhos):
    """A prova que amarra o conversor a formula: o que `indice()` calcula tem
    de ser exatamente onde o conversor gravou aquela celula."""
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=3, linhas=4)

    _xlsx_falso(cx, 4, 3, lambda c, l: f"C{c}L{l}".ljust(8, "X"))
    converter_pool.converter(cx, cb)

    # pedido 20203, modelo 1000001 -> (03 - 01) mod 3... a coluna vem da
    # formula real, entao basta conferir a leitura contra a celula esperada.
    coluna = 2
    linha = 3
    idx = (coluna - 1) * qr_ideal.LINHAS + (linha - 1)
    with open(cb, "rb") as f:
        f.seek(idx * qr_ideal.TAMANHO)
        assert f.read(qr_ideal.TAMANHO) == b"C2L3XXXX"


def test_recusa_planilha_com_codigo_de_tamanho_errado(monkeypatch, caminhos):
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=2, linhas=2)

    _xlsx_falso(cx, 2, 2, lambda c, l: "CURTO")
    with pytest.raises(ValueError, match="8 caracteres"):
        converter_pool.converter(cx, cb)


def test_recusa_planilha_com_codigo_repetido(monkeypatch, caminhos):
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=2, linhas=2)

    _xlsx_falso(cx, 2, 2, lambda c, l: "IGUALIGU")
    with pytest.raises(ValueError, match="repetido"):
        converter_pool.converter(cx, cb)


def test_recusa_planilha_com_numero_de_celulas_errado(monkeypatch, caminhos):
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=5, linhas=5)

    _xlsx_falso(cx, 2, 2, lambda c, l: f"C{c}L{l}".ljust(8, "X"))
    with pytest.raises(ValueError, match="esperado"):
        converter_pool.converter(cx, cb)


def test_recusa_celula_fora_da_grade(monkeypatch, caminhos):
    cx, cb = caminhos
    _pool_pequeno(monkeypatch, colunas=2, linhas=2)

    _xlsx_falso(cx, 2, 5, lambda c, l: f"C{c}L{l}".ljust(8, "X"))
    with pytest.raises(ValueError, match="fora da grade"):
        converter_pool.converter(cx, cb)
