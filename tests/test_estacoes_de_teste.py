# -*- coding: utf-8 -*-
"""Instalacao de teste nao vira alerta na conferencia diaria.

## Por que isto existe

O `ferramentas/estacoes.py` grita, com razao, quando uma estacao nao informa a
versao: quem nao informa roda agente anterior ao 1.2.7, logo anterior ao login
por codigo local, e o painel daquela maquina ABRE SEM PEDIR CODIGO.

So que duas das maquinas registradas — PRD-ACABAMENTO e CESAR-CPD — sao
instalacoes de teste, e nao postos de trabalho da grafica. Elas continuam
mandando heartbeat todo dia, entao o alerta reaparecia em toda conferencia, todo
dia, sem que ninguem fosse agir sobre ele.

Um alerta que se repete e que ninguem atende e pior do que alerta nenhum: ele
ensina a passar o olho pela lista inteira. O objetivo aqui e que sobre na lista
so o que merece acao.

## O que NAO pode acontecer

Sumir com elas. Elas continuam aparecendo na listagem, marcadas — a conferencia
que esconde maquina e a conferencia que mente. O que muda e so o ALERTA.
"""
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ferramentas"))

import estacoes


def test_as_duas_maquinas_de_teste_sao_reconhecidas():
    assert estacoes.e_instalacao_de_teste("PRD-ACABAMENTO")
    assert estacoes.e_instalacao_de_teste("CESAR-CPD")


def test_o_nome_e_comparado_sem_depender_de_caixa_ou_espaco():
    """O heartbeat manda o nome da maquina como o Windows o escreve, e o
    `apelido` e digitado por gente. Depender de caixa faria o alerta voltar por
    um detalhe que ninguem veria."""
    assert estacoes.e_instalacao_de_teste("  cesar-cpd  ")
    assert estacoes.e_instalacao_de_teste("Prd-Acabamento")


def test_estacao_de_verdade_continua_alertando():
    """O valor do alerta esta em quem ele NAO cobre.

    Se a lista de excecoes crescesse por descuido, a conferencia continuaria
    verde com uma estacao da grafica destrancada — que e exatamente o defeito
    que ela existe para pegar.
    """
    for nome in ("GUSTAVO-PROD", "PC-JR-HOME", "Agente Ideal", "", "DESKTOP-5N8AF7D"):
        assert not estacoes.e_instalacao_de_teste(nome), nome


def test_a_maquina_de_teste_nao_entra_na_lista_de_mudas():
    """O caminho inteiro, e nao so o predicado: uma linha sem versao, vinda de
    uma instalacao de teste, nao pode produzir alerta."""
    mudas, atrasadas = estacoes.classificar(
        [
            {"nome": "PRD-ACABAMENTO", "versao": ""},
            {"nome": "CESAR-CPD", "versao": ""},
        ],
        repo="1.2.108",
    )
    assert mudas == []
    assert atrasadas == []


def test_a_estacao_da_grafica_sem_versao_continua_produzindo_alerta():
    mudas, atrasadas = estacoes.classificar(
        [{"nome": "GUSTAVO-PROD", "versao": ""}], repo="1.2.108")
    assert mudas == ["GUSTAVO-PROD"]


def test_a_estacao_atrasada_continua_produzindo_alerta():
    mudas, atrasadas = estacoes.classificar(
        [{"nome": "PC-JR-HOME", "versao": "1.2.107"}], repo="1.2.108")
    assert mudas == []
    assert atrasadas == ["PC-JR-HOME em 1.2.107"]


def test_a_maquina_de_teste_atrasada_tambem_fica_de_fora():
    mudas, atrasadas = estacoes.classificar(
        [{"nome": "CESAR-CPD", "versao": "1.2.26"}], repo="1.2.108")
    assert atrasadas == []


def test_versao_em_dia_nao_alerta():
    mudas, atrasadas = estacoes.classificar(
        [{"nome": "Agente Ideal", "versao": "1.2.108"}], repo="1.2.108")
    assert mudas == [] and atrasadas == []
