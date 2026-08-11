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


def test_refazer_celulas_compacta_os_itens_na_folha(tmp_path):
    """
    Celulas 1 e 3 das tres folhas = seis itens. Eles NAO saem espalhados em tres
    folhas com dois tickets cada: sao recolhidos e reimpostos preenchendo a folha
    celula a celula. Numa folha de quatro celulas, seis itens viram uma folha
    cheia mais duas celulas na seguinte.

    A ordem e a de leitura: folha, depois celula. Por isso 1,3 (folha 1), 5,7
    (folha 2), 9,11 (folha 3).
    """
    assert impor(tmp_path, refazer_celulas=[1, 3]) == [[1, 3, 5, 7], [9, 11]]


def test_a_numeracao_nao_se_move_com_a_compactacao(tmp_path):
    """
    O item muda de lugar na folha, nunca de numero. A celula 3 da folha 2 carrega
    o N7 para onde for — aqui ela cai na primeira celula da folha de saida.
    """
    assert impor(tmp_path, refazer_de=2, refazer_ate=3, refazer_celulas=[3]) == [[7, 11]]


def test_celulas_fora_de_ordem_e_repetidas(tmp_path):
    """O campo e digitado as pressas, na frente da impressora."""
    assert impor(tmp_path, refazer_celulas=[3, 1, 3]) == [[1, 3, 5, 7], [9, 11]]


def test_folha_e_celula_combinadas(tmp_path):
    """Folha 2, celula 2 -> um unico item, o N6, sozinho na folha."""
    assert impor(tmp_path, refazer_de=2, refazer_ate=2, refazer_celulas=[2]) == [[6]]


def test_todas_as_celulas_de_uma_folha_saem_iguais_a_folha(tmp_path):
    """
    Pedir as quatro celulas da folha 2 tem de devolver a folha 2 inteira: a
    compactacao nao pode reordenar quem ja estava cheio.
    """
    assert impor(tmp_path, refazer_de=2, refazer_ate=2, refazer_celulas=[1, 2, 3, 4]) \
        == impor(tmp_path, refazer_de=2, refazer_ate=2)


def test_celula_da_ultima_folha_incompleta_nao_ocupa_espaco(tmp_path):
    """
    Com 10 itens em folhas de 4, a folha 3 so tem as celulas 1 e 2 preenchidas.
    Pedir a celula 4 das tres folhas devolve dois itens, nao tres com um vazio.
    """
    out = tmp_path / "refazer.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf", out_pdf=str(out), formato=FORMATO,
        numeracao=NUMERACAO, saida=SAIDA, seq_start=1, seq_end=10,
        seq_increment=1, layout_schema="sequential", refazer_celulas=[4],
    )
    ImpositionEngine(cfg).process()
    doc = fitz.open(str(out))
    try:
        paginas = [sorted(int(n) for n in re.findall(r"N(\d+)", p.get_text())) for p in doc]
    finally:
        doc.close()
    assert paginas == [[4, 8]]


def test_celula_inexistente_e_erro(tmp_path):
    """
    Sem esta guarda o motor gerava as tres folhas e todas saiam em branco: a
    celula 9 nao existe numa folha de quatro, entao nenhuma pose casava.
    """
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_celulas=[9])
    assert "nao existem" in str(erro.value)


def _impor_cut_stack(tmp_path, **refazer):
    out = tmp_path / "cutstack.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf", out_pdf=str(out), formato=FORMATO,
        numeracao=NUMERACAO, saida=SAIDA, seq_start=SEQ_INICIO, seq_end=SEQ_FIM,
        seq_increment=1, layout_schema="cut_stack", cut_stack_mode="independent",
        **refazer,
    )
    ImpositionEngine(cfg).process()
    doc = fitz.open(str(out))
    try:
        return [sorted(int(n) for n in re.findall(r"N(\d+)", p.get_text())) for p in doc]
    finally:
        doc.close()


def test_cut_stack_a_tiragem_inteira_e_a_referencia(tmp_path):
    """Em cut_stack a coluna e que anda: a folha 1 leva 1, 4, 7 e 10."""
    assert _impor_cut_stack(tmp_path) == [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]


def test_cut_stack_refazer_folha_repete_a_folha(tmp_path):
    assert _impor_cut_stack(tmp_path, refazer_de=2, refazer_ate=2) == [[2, 5, 8, 11]]


def test_cut_stack_refazer_celula_compacta_a_coluna(tmp_path):
    """
    A conta de indice de cut_stack vive em dois lugares: no laco principal e em
    `_indice_de_origem`, que monta a lista da compactacao. Se os dois discordarem,
    o refazer repoe o ticket errado — e este teste e quem denuncia. A celula 2
    das tres folhas guarda N4, N5 e N6; compactada, e uma folha so.
    """
    assert _impor_cut_stack(tmp_path, refazer_celulas=[2]) == [[4, 5, 6]]


def test_cut_stack_celula_e_folha_juntas(tmp_path):
    assert _impor_cut_stack(tmp_path, refazer_de=1, refazer_ate=2, refazer_celulas=[3, 4]) \
        == [[7, 8, 10, 11]]


def _numeros_em_ordem_de_leitura(caminho):
    """Numeros de cada pagina na ordem em que aparecem na folha.

    As asercoes acima ordenam os numeros e por isso provam so QUAIS itens caem em
    cada folha. Aqui a posicao importa: e ela que diz se o item foi mesmo para a
    proxima celula vaga. A linha sai do y do texto (as celulas ocupam faixas bem
    separadas) e a coluna do x.
    """
    doc = fitz.open(str(caminho))
    try:
        paginas = []
        for pagina in doc:
            marcas = []
            for x0, y0, _x1, _y1, palavra, *_ in pagina.get_text("words"):
                achado = re.fullmatch(r"N(\d+)", palavra)
                if achado:
                    marcas.append((round(y0 / 10), x0, int(achado.group(1))))
            paginas.append([n for _, _, n in sorted(marcas)])
        return paginas
    finally:
        doc.close()


def test_o_item_vai_para_a_proxima_celula_vaga(tmp_path):
    """
    O coracao do "refazer celula". Celulas 2 e 4 das tres folhas sao seis itens
    (N2, N4, N6, N8, N10, N12) que na tiragem original moravam na coluna da
    direita. Compactados, eles preenchem a folha na ordem de leitura: as quatro
    celulas da primeira folha e as duas primeiras da segunda — nenhuma celula
    vaga no meio.
    """
    out = tmp_path / "refazer.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf", out_pdf=str(out), formato=FORMATO,
        numeracao=NUMERACAO, saida=SAIDA, seq_start=SEQ_INICIO, seq_end=SEQ_FIM,
        seq_increment=1, layout_schema="sequential", refazer_celulas=[2, 4],
    )
    ImpositionEngine(cfg).process()
    assert _numeros_em_ordem_de_leitura(out) == [[2, 4, 6, 8], [10, 12]]


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
