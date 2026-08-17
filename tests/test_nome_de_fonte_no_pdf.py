# -*- coding: utf-8 -*-
"""O nome com que a fonte entra no PDF nao e o nome da familia.

## O erro que trouxe este arquivo, em 17/08/2026

    Erro: bad fontname chars {' '}

Apareceu na impressao logo depois de a fonte do sistema passar a ser embutida de
verdade. Antes, `Comic Sans MS` nunca chegava aqui -- ficava pelo caminho e o
papel saia em Helvetica. Corrigido aquilo, ela chegou, e esbarrou na regra
seguinte: o `insert_font` do PyMuPDF **recusa espaco no nome**. `Arial` passava
por nao ter espaco nenhum; `Comic Sans MS` tem dois.

## O segundo motivo, que nao aparece como erro

O nome tambem e a CHAVE com que a pagina guarda o recurso. Dois arquivos
diferentes registrados com o mesmo nome na mesma pagina nao dao erro: o segundo
e ignorado, e o texto sai desenhado com a fonte do primeiro.

E esse caso e o desta gráfica, hoje: a numeracao do pedido 19775 tem
`Comic Sans MS` e `Comic Sans MS|bold` na MESMA pagina. Sanitizar o nome sem
distinguir os dois arquivos trocaria um erro visivel por um defeito calado --
que e a troca que este projeto menos quer fazer.
"""
import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine


# Bytes de fonte de verdade, sem rede e sem depender do que a maquina tem
# instalado: o proprio PyMuPDF carrega as Base-14.
BYTES_A = fitz.Font("helv").buffer
BYTES_B = fitz.Font("tiro").buffer


def _pagina():
    return fitz.open().new_page()


def test_o_pymupdf_recusa_mesmo_o_nome_da_familia():
    """A regra que originou tudo, presa aqui para ninguem "simplificar" depois."""
    with pytest.raises(Exception) as erro:
        _pagina().insert_font(fontname="Comic Sans MS", fontbuffer=BYTES_A)
    assert "fontname" in str(erro.value).lower()


def test_o_nome_gerado_e_aceito_pelo_pymupdf():
    nome = engine._nome_de_fonte_para_pdf("Comic Sans MS", BYTES_A)
    _pagina().insert_font(fontname=nome, fontbuffer=BYTES_A)   # nao levanta


def test_o_nome_gerado_nao_tem_espaco_nem_pontuacao():
    for familia in ("Comic Sans MS", "Alfa Slab One", "Times New Roman",
                    "Fonte/Com\\Barra", "Acentuação Ção"):
        nome = engine._nome_de_fonte_para_pdf(familia, BYTES_A)
        assert nome.isalnum(), (familia, nome)
        assert nome.isascii(), (familia, nome)


def test_a_mesma_familia_com_arquivos_diferentes_nao_colide():
    """`Comic Sans MS` e `Comic Sans MS|bold` viram dois arquivos, na mesma
    pagina. Com o mesmo nome, o negrito sairia desenhado com a regular."""
    regular = engine._nome_de_fonte_para_pdf("Comic Sans MS", BYTES_A)
    negrito = engine._nome_de_fonte_para_pdf("Comic Sans MS", BYTES_B)
    assert regular != negrito


def test_o_mesmo_arquivo_gera_sempre_o_mesmo_nome():
    """A deduplicacao depende disto: o mesmo texto repetido em cem celulas tem
    de reusar um recurso so, e nao inchar o PDF com cem copias da fonte."""
    assert engine._nome_de_fonte_para_pdf("Comic Sans MS", BYTES_A) == \
           engine._nome_de_fonte_para_pdf("Comic Sans MS", BYTES_A)


def test_familia_sem_nenhuma_letra_ainda_produz_nome_valido():
    nome = engine._nome_de_fonte_para_pdf("", BYTES_A)
    assert nome and nome.isalnum() and nome.isascii()
    _pagina().insert_font(fontname=nome, fontbuffer=BYTES_A)


def test_o_nome_nunca_comeca_com_digito():
    """Nome de recurso comecando com digito e pedir problema em leitor de PDF."""
    for familia in ("2Fast", "1000153", ""):
        assert not engine._nome_de_fonte_para_pdf(familia, BYTES_A)[0].isdigit()


def test_a_chave_unica_pode_ser_um_caminho_de_arquivo():
    """O ramo que BAIXA a fonte do catalogo identifica o arquivo pelo caminho,
    e nao pelos bytes -- ele ainda nao os leu."""
    a = engine._nome_de_fonte_para_pdf("Comic Sans MS", "C:/fontes/comic.ttf")
    b = engine._nome_de_fonte_para_pdf("Comic Sans MS", "C:/fontes/comicbd.ttf")
    assert a != b
    assert a.isalnum() and b.isalnum()
