# -*- coding: utf-8 -*-
"""O nome da arte, impresso na lateral, fica no meio do item.

## O defeito

O nome da arte sai girado 90 graus na lateral de cada item, e e centrado por

    nome_y = (altura_do_item + largura_do_texto) / 2

Como o texto sobe a partir dali, o centro dele cai exatamente em
`altura_do_item / 2` -- QUANDO a largura estiver certa. Metade do erro de
medicao vira deslocamento, igual ao caso da "Largura maxima".

E a medicao estava sempre errada, nos tres pontos que desenham esse nome:

    fitz.get_text_length(nome, fontname=..., fontsize=..., fontfile=...)

`get_text_length` NAO aceita `fontfile` -- levanta TypeError. Os tres pontos
tinham um `except` logo abaixo caindo para `len(texto) * corpo * 0.6`, entao a
medicao nunca acontecia: o `try` falhava sempre, com Impact instalada ou sem.

Medido com a Impact real, corpo 14:

    "000123"   real 42,30 pt   chute 50,40 pt   -> 4,05 pt fora do lugar
    "019775"   real 38,90 pt   chute 50,40 pt   -> 5,75 pt fora do lugar

O chute e fixo por caractere, entao dois nomes de mesmo tamanho recebiam a MESMA
largura mesmo tendo larguras diferentes no papel -- e e isso que o teste abaixo
pega, sem precisar saber a geometria da folha.
"""
import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import ImpositionConfig, ImpositionEngine


# Dois nomes de SEIS digitos com larguras bem diferentes na Impact: o "1" e
# estreito, o "0" e largo. O chute por caractere nao distingue os dois.
NOME_LARGO = "000000"
NOME_ESTREITO = "111111"

IMPACT = "C:/Windows/Fonts/impact.ttf"


def _centro_vertical_do_nome(tmp_path, nome):
    arte = tmp_path / f"arte_{nome}.pdf"
    doc = fitz.open()
    doc.new_page(width=100 * 2.8346, height=50 * 2.8346)
    doc.save(str(arte))
    doc.close()

    saida = str(tmp_path / f"saida_{nome}.pdf")
    cfg = ImpositionConfig(
        base_file="", out_pdf=saida,
        formato={"name": "T", "width_mm": 100, "height_mm": 50, "cols": 1, "rows": 1,
                 "gap_h_mm": 0, "gap_v_mm": 0, "offset_h_mm": 0, "offset_v_mm": 0,
                 "rotations": {}},
        numeracao=None,
        saida={"name": "S", "width_mm": 100, "height_mm": 50, "file_format": "pdf"},
        seq_start=1, seq_end=1, seq_increment=1,
        layout_schema="multi_artes",
        multi_artes=[{"qtd": "1", "local_path": str(arte), "pdf_url": "local_file",
                      "nome": nome}],
    )
    ImpositionEngine(cfg).process()

    doc = fitz.open(saida)
    caixas = [(y0, y1) for x0, y0, x1, y1, palavra, *_ in doc[0].get_text("words")
              if palavra.strip() == nome]
    doc.close()
    assert caixas, f"o nome {nome} nao foi desenhado no PDF"
    y0 = min(c[0] for c in caixas)
    y1 = max(c[1] for c in caixas)
    return (y0 + y1) / 2.0


@pytest.mark.skipif(not os.path.exists(IMPACT), reason="sem a Impact nesta maquina")
def test_o_get_text_length_recusa_fontfile():
    """A razao de os tres pontos nunca terem medido nada. Preso aqui para que a
    "simplificacao" de voltar a passar `fontfile` caia num teste, e nao na
    producao."""
    with pytest.raises(TypeError):
        fitz.get_text_length("000123", fontname="Impact", fontsize=14, fontfile=IMPACT)


def test_nenhuma_medicao_no_motor_passa_fontfile():
    """O guarda de fato: o `except` que existe em volta dessas chamadas
    esconderia o TypeError de novo, e o defeito voltaria calado."""
    with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "engine.py"), encoding="utf-8") as f:
        # So o codigo que roda: os comentarios EXPLICAM o erro antigo, e citam a
        # chamada errada de proposito. Sem este corte, quem documenta o defeito
        # derruba o teste que o prende.
        fonte = "\n".join(l for l in f.read().splitlines()
                          if not l.lstrip().startswith("#"))
    import re
    for trecho in re.findall(r"get_text_length\([^)]*\)", fonte, re.S):
        assert "fontfile" not in trecho, trecho


@pytest.mark.skipif(not os.path.exists(IMPACT), reason="sem a Impact nesta maquina")
def test_dois_nomes_da_mesma_largura_de_texto_saem_no_mesmo_lugar(tmp_path):
    """A prova no papel, e sem depender da geometria da folha: o nome e centrado
    na altura do item, entao dois nomes quaisquer tem de sair com o MESMO centro.

    Com o chute, os dois recebiam largura identica (mesmo numero de digitos) e o
    de digitos estreitos ficava ~2,5 pt fora do lugar.
    """
    largo = _centro_vertical_do_nome(tmp_path, NOME_LARGO)
    estreito = _centro_vertical_do_nome(tmp_path, NOME_ESTREITO)
    assert largo == pytest.approx(estreito, abs=0.5)
