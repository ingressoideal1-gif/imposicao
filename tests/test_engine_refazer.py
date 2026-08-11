# -*- coding: utf-8 -*-
"""
Refazer folhas e refazer celulas.

Refazer e o que o operador usa quando a tiragem ja saiu e uma parte dela se
perdeu. A propriedade que importa, e que estes testes travam, e que refazer NAO
desloca a numeracao: a folha 2 refeita traz exatamente os numeros que a folha 2
trazia na tiragem inteira. O motor consegue isso filtrando com `continue` dentro
do laco, sem recalcular indice nenhum.

A segunda propriedade travada aqui e o barulho: uma faixa que nao casa com folha
nenhuma tem de virar erro. Antes ela produzia zero paginas em silencio e a tela
ainda dizia "concluido e arquivos salvos" — na grafica, isso e uma pilha de
papel que ninguem reimprimiu.
"""
import re

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine

# 2 x 2 = 4 celulas por folha. As celulas sao numeradas 1..4 na ordem de leitura
# (esquerda -> direita, cima -> baixo), o mesmo `P + 1` que a previa desenha.
FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}

SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}

# Prefixo "N" para o numero sair identificavel na extracao de texto
NUMERACAO = {
    "tipo": "SEQUENCIAL",
    "elements": [
        {
            "type": "TEXT",
            "x_mm": 10,
            "y_mm": 20,
            "font_size": 14,
            "color": "#000000",
            "prefix": "N",
        }
    ],
}

# 12 itens / 4 celulas = 3 folhas.
#   folha 1 -> N1 N2 N3 N4      folha 2 -> N5 N6 N7 N8      folha 3 -> N9 N10 N11 N12
# Na folha, a celula C recebe o item (folha - 1) * 4 + C.
SEQ_INICIO = 1
SEQ_FIM = 12


def impor(tmp_path, **refazer):
    """Roda o motor e devolve (paginas, numeros por pagina)."""
    out = tmp_path / "refazer.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",  # inexistente: o motor impoe so a numeracao
        out_pdf=str(out),
        formato=FORMATO,
        numeracao=NUMERACAO,
        saida=SAIDA,
        seq_start=SEQ_INICIO,
        seq_end=SEQ_FIM,
        seq_increment=1,
        layout_schema="sequential",
        **refazer,
    )
    ImpositionEngine(cfg).process()

    doc = fitz.open(str(out))
    try:
        paginas = [
            sorted(int(n) for n in re.findall(r"N(\d+)", pagina.get_text()))
            for pagina in doc
        ]
    finally:
        doc.close()
    return paginas


def test_tiragem_inteira_e_a_referencia(tmp_path):
    """Sem refazer: 3 folhas, e cada folha com os seus quatro numeros."""
    assert impor(tmp_path) == [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]


def test_refazer_uma_folha_repete_os_numeros_daquela_folha(tmp_path):
    """
    O coracao do recurso. A folha 2 refeita sozinha tem de sair com N5..N8 — os
    mesmos numeros que ela tinha na tiragem inteira. Se algum dia o filtro passar
    a recalcular indice em vez de pular, este teste cai com N1..N4.
    """
    assert impor(tmp_path, refazer_de=2, refazer_ate=2) == [[5, 6, 7, 8]]


def test_refazer_faixa_de_folhas(tmp_path):
    assert impor(tmp_path, refazer_de=2, refazer_ate=3) == [[5, 6, 7, 8], [9, 10, 11, 12]]


def test_ate_vazio_refaz_so_a_folha_do_de(tmp_path):
    assert impor(tmp_path, refazer_de=3, refazer_ate=0) == [[9, 10, 11, 12]]


def test_so_ate_preenchido_comeca_na_folha_1(tmp_path):
    """
    O frontend recusa antes de chegar aqui, mas o motor tambem atende o agente
    local e a API. Assumir a folha 1 e o unico palpite seguro: o contrario
    (`refazer_de = 0`) desligava o filtro e refazia a tiragem inteira sem avisar.
    """
    assert impor(tmp_path, refazer_de=0, refazer_ate=2) == [[1, 2, 3, 4], [5, 6, 7, 8]]


def test_faixa_invertida_e_erro(tmp_path):
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_de=3, refazer_ate=1)
    assert "invalida" in str(erro.value)


def test_faixa_fora_do_trabalho_e_erro(tmp_path):
    """Zero folhas geradas nao pode passar por sucesso."""
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_de=9, refazer_ate=9)
    assert "nenhuma folha" in str(erro.value)


def test_refazer_celulas_mantem_as_folhas_e_esvazia_o_resto(tmp_path):
    """
    Celulas 1 e 3, folhas todas: as tres folhas continuam saindo, cada uma so
    com os numeros dessas duas celulas. As demais celulas saem em branco, que e
    exatamente o que a previa mostra com o veu.
    """
    assert impor(tmp_path, refazer_celulas=[1, 3]) == [[1, 3], [5, 7], [9, 11]]


def test_celulas_fora_de_ordem_e_repetidas(tmp_path):
    """O campo e digitado as pressas, na frente da impressora."""
    assert impor(tmp_path, refazer_celulas=[3, 1, 3]) == [[1, 3], [5, 7], [9, 11]]


def test_folha_e_celula_combinadas(tmp_path):
    """Folha 2, celula 2 -> um unico item, o N6."""
    assert impor(tmp_path, refazer_de=2, refazer_ate=2, refazer_celulas=[2]) == [[6]]


def test_celula_inexistente_e_erro(tmp_path):
    """
    Sem esta guarda o motor gerava as tres folhas e todas saiam em branco: a
    celula 9 nao existe numa folha de quatro, entao nenhuma pose casava.
    """
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_celulas=[9])
    assert "nao existem" in str(erro.value)


def test_sem_refazer_a_lista_de_celulas_fica_vazia():
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf="ignorado.pdf",
        formato=FORMATO,
        numeracao=NUMERACAO,
        saida=SAIDA,
        seq_start=1,
        seq_end=4,
    )
    assert cfg.refazer_celulas == []
    assert cfg.refazer_de == 0
