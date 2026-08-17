# -*- coding: utf-8 -*-
"""A folha imposta sai do tamanho que foi imposta. Nunca reduzida para caber.

O modo GDI e o PADRAO da impressao (`options.get("print_mode", "gdi")` no
`send_print_job_windows`), e ate 17/08/2026 ele desenhava a pagina esticada
sobre a AREA IMPRIMIVEL do driver:

    ratio_img = img_w / img_h ; ratio_print = print_w / print_h
    if ratio_img > ratio_print: draw_w = print_w ; ...

`HORZRES`/`VERTRES` sao a area imprimivel, e ela e MENOR que o papel -- toda
impressora tem margem morta. Entao mesmo com o papel certo escolhido, a folha
saia encolhida pela razao da margem, tipicamente de 3% a 6%.

Numa grafica isso nao e detalhe de acabamento: a imposicao carrega marca de
corte, sangria e registro, e o corte e feito na guilhotina pela medida
nominal. Uma folha 4% menor faz o corte pegar arte, e a tiragem inteira vai
para o lixo. O dono relatou em 17/08/2026: "esta acontecendo e nao deveria".
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import print_service


# A4 em pontos, como o PyMuPDF devolve em `page.rect`.
A4_L, A4_A = 595.276, 841.890

# Uma impressora comum: 600 dpi, e margem morta de 1/4" em cada lado. A area
# imprimivel fica 300 px menor que o papel em cada eixo.
DPI = 600
PAPEL_L, PAPEL_A = 4961, 7016          # A4 inteiro, em pixels de 600 dpi
AREA_L, AREA_A = 4811, 6866            # o que o driver deixa imprimir
OFF_X, OFF_Y = 75, 75                  # de onde a area imprimivel comeca


def test_a_folha_sai_no_tamanho_fisico_e_nao_no_da_area_imprimivel():
    """O coracao do defeito: o tamanho vem do PDF e do DPI, nunca da area."""
    dx, dy, larg, alt, coube = print_service.retangulo_da_folha(
        A4_L, A4_A, DPI, DPI, AREA_L, AREA_A, PAPEL_L, PAPEL_A, OFF_X, OFF_Y)

    assert larg == round(A4_L / 72.0 * DPI)
    assert alt == round(A4_A / 72.0 * DPI)
    # E o ponto: NAO e o tamanho da area imprimivel.
    assert (larg, alt) != (AREA_L, AREA_A)


def test_cem_por_cento_significa_uma_polegada_por_polegada():
    """Uma folha de 10 x 20 polegadas a 300 dpi ocupa 3000 x 6000 pixels.
    Sem essa igualdade, "escala 100%" e so uma frase."""
    dx, dy, larg, alt, coube = print_service.retangulo_da_folha(
        10 * 72, 20 * 72, 300, 300, 9999, 9999)
    assert (larg, alt) == (3000, 6000)


def test_a_folha_e_centralizada_no_PAPEL_e_nao_na_area_imprimivel():
    """A origem do GDI e o canto da AREA imprimivel, nao o do papel. Centralizar
    sem descontar esse deslocamento joga a folha para um lado, e a imposicao
    sai fora de esquadro com o papel -- o corte na guilhotina e feito pela
    borda do papel."""
    dx, dy, larg, alt, coube = print_service.retangulo_da_folha(
        A4_L, A4_A, DPI, DPI, AREA_L, AREA_A, PAPEL_L, PAPEL_A, OFF_X, OFF_Y)

    # Distancia da borda do PAPEL ate a folha, nos dois lados: iguais.
    esquerda = dx + OFF_X
    direita = PAPEL_L - (dx + OFF_X + larg)
    assert abs(esquerda - direita) <= 1
    acima = dy + OFF_Y
    abaixo = PAPEL_A - (dy + OFF_Y + alt)
    assert abs(acima - abaixo) <= 1


def test_folha_maior_que_o_papel_NAO_encolhe_e_avisa():
    """Aqui estava a tentacao: encolher resolveria a tela e estragaria a
    tiragem em silencio. A folha sai 100% -- cortada pela impressora, o que o
    operador VE -- e `coube` falso e o que permite avisa-lo."""
    dx, dy, larg, alt, coube = print_service.retangulo_da_folha(
        A4_L * 2, A4_A * 2, DPI, DPI, AREA_L, AREA_A, PAPEL_L, PAPEL_A, OFF_X, OFF_Y)

    assert larg == round(A4_L * 2 / 72.0 * DPI)
    assert alt == round(A4_A * 2 / 72.0 * DPI)
    assert coube is False


def test_a_folha_do_tamanho_do_papel_NAO_dispara_aviso():
    """A comparacao e com o PAPEL, e nao com a area imprimivel.

    Uma folha imposta tem o tamanho da folha de papel, e area imprimivel
    nenhuma chega na borda: contra a area, NADA cabe, e o aviso apareceria em
    todo trabalho. Aviso que sempre aparece ninguem le -- e o dia em que ele
    fosse verdade, passaria batido junto com os outros.

    Perder a margem morta e o normal da grafica, que imprime em papel maior e
    refila depois. Passar do PAPEL e que e erro de bandeja."""
    _, _, larg, alt, coube = print_service.retangulo_da_folha(
        A4_L, A4_A, DPI, DPI, AREA_L, AREA_A, PAPEL_L, PAPEL_A, OFF_X, OFF_Y)
    assert larg > AREA_L, "o cenario perdeu a graca: a folha caberia na area"
    assert coube is True


def test_driver_que_nao_informa_o_papel_centraliza_na_area():
    """Driver antigo devolve 0 em `PHYSICALWIDTH`. Sem papel conhecido a folha
    e centralizada na area imprimivel -- ainda em 100%, que e o que importa."""
    dx, dy, larg, alt, _ = print_service.retangulo_da_folha(
        A4_L, A4_A, DPI, DPI, AREA_L, AREA_A, 0, 0, 0, 0)
    assert larg == round(A4_L / 72.0 * DPI)
    assert dx == (AREA_L - larg) // 2
    assert dy == (AREA_A - alt) // 2


def test_dpi_diferente_em_cada_eixo_nao_distorce_a_folha():
    """Impressora com resolucao assimetrica (600x300 e comum em jato). Cada
    eixo tem de usar o SEU dpi: usar um so para os dois deitaria a folha."""
    _, _, larg, alt, _ = print_service.retangulo_da_folha(
        10 * 72, 10 * 72, 600, 300, 99999, 99999)
    assert (larg, alt) == (6000, 3000)
