# -*- coding: utf-8 -*-
"""
Ajuste de texto variavel num espaco limitado (max_width_mm do elemento).

A funcao e um espelho exato de window.ajustarTextoNaLargura do frontend
(frontend/texto-ajuste.js). Sao tres modos:

- shrink   reduz o corpo na razao exata (largura de texto e linear no corpo);
- wrap     quebra por palavra, com fallback por caractere para palavra maior
           que o espaco;
- condense espreme as letras na horizontal e **mantem a altura** — o truque do
           cartao de embarque, para as linhas continuarem alinhadas de um
           ingresso para o outro. Abaixo do piso de 75% a fonte tambem reduz,
           senao o dado sairia ilegivel.

Folga de 0,5% para a mesma palavra nao quebrar diferente entre a regua do
canvas e a do fitz.
"""
import fitz

from engine import _ajustar_texto_na_largura, PISO_CONDENSA


def medir_helv(texto, corpo):
    return fitz.get_text_length(texto, fontname="helv", fontsize=corpo)


# ── Sem largura / shrink ────────────────────────────────────────────────────

def test_sem_largura_devolve_intacto():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "Nome Grande", 12, 0, "shrink")
    assert corpo == 12
    assert linhas == ["Nome Grande"]
    assert escala == 1.0


def test_shrink_reduz_ate_caber():
    alvo = 40.0
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "NOME COMPRIDO DEMAIS", 12, alvo, "shrink")
    assert linhas == ["NOME COMPRIDO DEMAIS"]
    assert corpo < 12
    assert escala == 1.0
    assert medir_helv(linhas[0], corpo) <= alvo


def test_shrink_nao_mexe_quando_cabe():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "AB", 12, 500, "shrink")
    assert corpo == 12
    assert escala == 1.0


def test_shrink_multilinha_usa_a_linha_mais_larga():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "A\nNOME COMPRIDO DEMAIS", 12, 40.0, "shrink")
    assert linhas == ["A", "NOME COMPRIDO DEMAIS"]
    assert medir_helv("NOME COMPRIDO DEMAIS", corpo) <= 40.0


# ── wrap ────────────────────────────────────────────────────────────────────

def test_wrap_quebra_por_palavra_e_todas_cabem():
    alvo = 80.0
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "Um nome bem comprido para caber", 12, alvo, "wrap")
    assert corpo == 12
    assert escala == 1.0
    assert len(linhas) > 1
    for linha in linhas:
        assert medir_helv(linha, corpo) <= alvo
    assert " ".join(linhas).split() == "Um nome bem comprido para caber".split()


def test_wrap_palavra_gigante_quebra_no_caractere():
    alvo = 40.0
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "WOLFESCHLEGELSTEINHAUSEN", 12, alvo, "wrap")
    assert len(linhas) > 1
    for linha in linhas:
        assert medir_helv(linha, corpo) <= alvo
    assert "".join(linhas) == "WOLFESCHLEGELSTEINHAUSEN"


def test_wrap_preserva_paragrafo_vazio():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "A\n\nB", 12, 500, "wrap")
    assert linhas == ["A", "", "B"]


def test_wrap_que_ja_cabe_nao_quebra():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "AB CD", 12, 500, "wrap")
    assert linhas == ["AB CD"]


# ── condense ────────────────────────────────────────────────────────────────

TEXTO = "NOME COMPRIDO DEMAIS"


def test_condense_nao_mexe_quando_cabe():
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "AB", 12, 500, "condense")
    assert corpo == 12
    assert escala == 1.0


def test_condense_espreme_sem_mudar_o_corpo():
    """
    Dentro do piso, a ALTURA e o que nao pode mudar: e ela que mantem as linhas
    alinhadas entre um ingresso e outro. So a largura cede.
    """
    natural = medir_helv(TEXTO, 12)
    alvo = natural * 0.85
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, TEXTO, 12, alvo, "condense")
    assert corpo == 12                       # altura preservada
    assert PISO_CONDENSA <= escala < 1
    assert medir_helv(linhas[0], corpo) * escala <= alvo


def test_condense_alem_do_piso_trava_e_reduz_o_corpo():
    """
    Espremer indefinidamente sairia ilegivel: no piso a compressao para e o
    resto vira reducao de corpo.
    """
    natural = medir_helv(TEXTO, 12)
    alvo = natural * 0.5
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, TEXTO, 12, alvo, "condense")
    assert escala == PISO_CONDENSA
    assert corpo < 12
    assert medir_helv(linhas[0], corpo) * escala <= alvo


def test_condense_multilinha_usa_a_linha_mais_larga():
    natural = medir_helv(TEXTO, 12)
    alvo = natural * 0.85
    corpo, linhas, escala = _ajustar_texto_na_largura(
        medir_helv, "A\n" + TEXTO, 12, alvo, "condense")
    assert linhas == ["A", TEXTO]
    assert corpo == 12
    assert medir_helv(TEXTO, corpo) * escala <= alvo
