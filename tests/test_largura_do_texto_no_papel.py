# -*- coding: utf-8 -*-
"""O motor MEDE o texto; ele nao chuta a largura.

## O defeito, relatado em 17/08/2026

Com o recurso "Largura maxima (mm)" ligado, a tela mostrava o texto centralizado
e o papel saia deslocado para a esquerda.

## A causa

O motor tinha duas reguas. Sem fonte embutida ele media de verdade, com
`fitz.get_text_length`. Com fonte embutida ele CHUTAVA:

    text_width = font_size * 0.55 * len(texto)

Meia letra por caractere. Medido contra a Comic Sans real, corpo 12:

    "12345"                          real  34,70 pt   chute  33,00 pt   -> 0,3 mm
    "CAMAROTE PREMIUM - SETOR A"      real 195,23 pt   chute 171,60 pt   -> 4,2 mm
    "Ingresso Inteira Pista Premium"  real 174,71 pt   chute 198,00 pt   -> 4,1 mm

Como a centralizacao e `x = cx - largura/2`, metade do erro vira deslocamento. Em
numero curto da 0,3 mm e ninguem ve; em texto longo da 4 mm e salta aos olhos. E
texto longo e justamente onde se usa "Largura maxima" -- dai o defeito parecer
exclusivo desse recurso.

O sinal do erro depende do texto: maiusculas largas passam do chute e o texto vai
para a direita, minusculas estreitas ficam abaixo e ele vai para a esquerda.

O mesmo chute decidia TAMBEM o corpo no modo "shrink", entao um texto que o motor
julgava caber podia estourar a largura maxima no papel.

## Por que so apareceu agora

Porque ate 17/08/2026 essas fontes nao chegavam ao motor -- caiam em Helvetica, e
Helvetica e Base-14, o ramo que media de verdade. Consertado aquilo, os elementos
passaram a ter fonte embutida e cairam no ramo do chute.
"""
import base64
import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import ImpositionConfig, ImpositionEngine


# Um texto que o chute SUPERESTIMA e outro que ele SUBESTIMA. Com a regua certa,
# os dois saem centrados no mesmo x; com o chute, cada um erra para um lado.
TEXTO_LARGO = "CAMAROTE PREMIUM - SETOR A"
TEXTO_ESTREITO = "Ingresso Inteira Pista Premium"


def _fonte_bytes():
    """Uma fonte de verdade, sem rede: o proprio PyMuPDF traz as Base-14."""
    return fitz.Font("tiro").buffer


# ─── A regua ────────────────────────────────────────────────────────────────

def test_com_fonte_embutida_a_largura_e_medida_e_nao_chutada(tmp_path):
    arquivo = tmp_path / "f.ttf"
    arquivo.write_bytes(_fonte_bytes())
    esperado = fitz.Font(fontbuffer=_fonte_bytes()).text_length(TEXTO_LARGO, fontsize=12)

    medido = engine._largura_do_texto(TEXTO_LARGO, str(arquivo), "qualquer", 12)

    assert medido == pytest.approx(esperado, abs=0.01)


def test_o_chute_antigo_estava_longe_o_bastante_para_deslocar_o_papel(tmp_path):
    """Guarda o motivo do conserto: se um dia a diferenca for irrelevante, este
    teste cai e alguem pode simplificar com seguranca."""
    arquivo = tmp_path / "f.ttf"
    arquivo.write_bytes(_fonte_bytes())
    chute = 12 * 0.55 * len(TEXTO_LARGO)
    medido = engine._largura_do_texto(TEXTO_LARGO, str(arquivo), "qualquer", 12)
    deslocamento_mm = abs(chute - medido) / 2.0 / 2.8346
    assert deslocamento_mm > 1.0


def test_sem_fonte_embutida_continua_pela_base14():
    esperado = fitz.get_text_length(TEXTO_LARGO, fontname="helv", fontsize=12)
    assert engine._largura_do_texto(TEXTO_LARGO, None, "helv", 12) == pytest.approx(esperado)


def test_arquivo_ilegivel_cai_na_estimativa_em_vez_de_quebrar():
    """A imposicao nao pode parar por causa de uma medicao: um texto fora do
    lugar e ruim, uma tiragem que nao sai e pior."""
    largura = engine._largura_do_texto("abc", "/caminho/que/nao/existe.ttf", "helv", 10)
    assert largura == pytest.approx(10 * 0.55 * 3)


def test_a_mesma_fonte_e_lida_do_disco_uma_vez_so(tmp_path):
    """Sao ~300 KB por fonte e a medicao roda por linha, em milhares de celulas."""
    arquivo = tmp_path / "f.ttf"
    arquivo.write_bytes(_fonte_bytes())
    engine._MEDIDORES.clear()
    engine._largura_do_texto("abc", str(arquivo), "helv", 10)
    engine._largura_do_texto("def", str(arquivo), "helv", 10)
    assert list(engine._MEDIDORES) == [str(arquivo)]


# ─── O papel ────────────────────────────────────────────────────────────────

def _impor_dois_textos(tmp_path):
    """Duas linhas fixas, mesmo x, mesma largura maxima, textos diferentes."""
    base = tmp_path / "base.pdf"
    doc = fitz.open()
    doc.new_page(width=100 * 2.8346, height=50 * 2.8346)
    doc.save(str(base))
    doc.close()

    dados = base64.b64encode(_fonte_bytes()).decode("ascii")
    elemento = lambda y, texto: {
        "type": "TEXT", "x_mm": 50, "y_mm": y, "font_size": 12,
        "color": "#000000", "fixed": True, "fixed_value": texto,
        "max_width_mm": 90, "_font_data": dados,
    }

    saida = str(tmp_path / "saida.pdf")
    cfg = ImpositionConfig(
        base_file=str(base), out_pdf=saida,
        formato={"name": "T", "width_mm": 100, "height_mm": 50, "cols": 1, "rows": 1,
                 "gap_h_mm": 0, "gap_v_mm": 0, "offset_h_mm": 0, "offset_v_mm": 0},
        numeracao={"elements": [elemento(15, TEXTO_LARGO), elemento(35, TEXTO_ESTREITO)]},
        saida={"name": "S", "width_mm": 100, "height_mm": 50, "file_format": "pdf"},
        seq_start=1, seq_end=1, seq_increment=1, layout_schema="sequential",
    )
    ImpositionEngine(cfg).process()

    doc = fitz.open(saida)
    linhas = {}
    for x0, y0, x1, y1, palavra, *_ in doc[0].get_text("words"):
        chave = round(y0)
        caixa = linhas.get(chave)
        linhas[chave] = (min(caixa[0], x0), max(caixa[1], x1)) if caixa else (x0, x1)
    doc.close()
    return [((a + b) / 2.0) for a, b in (linhas[k] for k in sorted(linhas))]


def test_dois_textos_diferentes_saem_centrados_no_mesmo_lugar(tmp_path):
    """A prova no papel. Centralizar e por o CENTRO do texto em cx -- e isso nao
    pode depender de quais letras o texto tem.

    Com o chute, um deles ia para a esquerda e o outro para a direita, e a
    diferenca entre os dois centros passava de 20 pt.
    """
    centros = _impor_dois_textos(tmp_path)
    assert len(centros) == 2, "as duas linhas tem de estar no PDF"
    assert centros[0] == pytest.approx(centros[1], abs=0.5)
