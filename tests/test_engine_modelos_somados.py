# -*- coding: utf-8 -*-
"""Modelos somados numa folha so: a conta das folhas, a ordem das celulas e,
sobretudo, a linha do banco de dados que cada item recebe.

O pedido 20495 (caderno de credenciais de oito paises) motivou isto. Impressos
um a um, os modelos gastavam 66 folhas e deixavam 14 celulas vazias. Somados,
cabem em 63 — a regra do usuario e "total de celulas dividido pelo numero de
celulas do formato, empilhado, preenchendo na ordem".

O que este arquivo protege de verdade e o item 2 da lista: ate a v630 o motor
lia a linha do CSV de `cfg.csv_data[item_index]`, um banco unico, e o `csv_data`
que viaja dentro de cada arte nunca era lido. Somar oito modelos com banco de
dados estourava IndexError no meio da tiragem, ou pior: no caminho de montagem,
que confere o limite, os itens alem da primeira fatia saiam com o **nome em
branco** na credencial, em silencio.
"""
import os
import re
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import ImpositionConfig, ImpositionEngine, _linha_do_banco

FORMATO = {
    "name": "Credencial 90x140",
    "width_mm": 105,
    "height_mm": 148,
    "cols": 2,
    "rows": 2,          # 4 celulas por folha, como o formato real do 20495
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}

SAIDA = {"name": "A4", "width_mm": 210, "height_mm": 296}

ELEMENTO_NOME = {
    "id": "e1",
    "type": "TEXT",
    "source": "database",
    "csv_column": "Nome",
    "x_mm": 10,
    "y_mm": 40,
    "size_mm": 6,
    "font_size": 14,
    "font_name": "helv",
    "color": "#000000",
    "rotation": 0,
}


def _linhas(prefixo, qtd):
    return [{"Nome": f"{prefixo}{i + 1}"} for i in range(qtd)]


def _arte(prefixo, qtd, com_banco=True, modelo=None):
    """Uma arte = um modelo do pedido, com a fatia dele do banco."""
    numeracao = {"tipo": "SEQUENCIAL", "start": 1, "elements": [ELEMENTO_NOME]}
    if com_banco:
        numeracao["csv_data"] = _linhas(prefixo, qtd)
    return {
        "qtd": qtd,
        "nome": "",
        "numeracao": numeracao,
        "numeracao_2": None,
        "pdf_url": None,
        "pdf_verso_url": None,
        "local_path": None,
        "modelo": modelo,
    }


def _impor(tmp_path, artes, **extra):
    out = tmp_path / "somados.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO,
        numeracao={"tipo": "SEQUENCIAL", "elements": [ELEMENTO_NOME]},
        saida=SAIDA,
        layout_schema="multi_artes",
        multi_artes=artes,
        **extra,
    )
    ImpositionEngine(cfg).process()
    return cfg, str(out)


# A folha carrega mais texto que os campos: marcas de corte, rotulos de lado.
# So os nomes do banco interessam, e eles tem forma fixa (A1, B7, C12).
_NOME = re.compile(r"^[A-Z]\d+$")


def _nomes_por_folha(caminho):
    doc = fitz.open(caminho)
    try:
        return [sorted(t for t in p.get_text().split() if _NOME.match(t)) for p in doc]
    finally:
        doc.close()


# ── A conta das folhas ───────────────────────────────────────────────────────

def test_o_total_e_a_soma_dos_modelos(tmp_path):
    """238 itens em celulas de 4 sao 60 folhas, e nao a soma das folhas de cada
    modelo. E a regra que o usuario ditou, palavra por palavra."""
    cfg, caminho = _impor(tmp_path, [_arte("A", 4), _arte("B", 7), _arte("C", 5)])
    assert cfg.total_items == 16
    assert len(_nomes_por_folha(caminho)) == 4      # ceil(16 / 4)


def test_so_sobram_as_celulas_que_a_conta_deixa(tmp_path):
    """14 itens em folhas de 4 gastam 4 folhas e deixam 2 celulas vazias — o
    minimo possivel, que e o que a regra pede.

    As duas vazias **nao** ficam juntas na ultima folha, e isso esta certo: no
    empilhado a pose leva uma faixa continua da tiragem, entao o buraco cai no
    fim da ULTIMA PILHA. Com 14 itens as folhas saem 4, 4, 3, 3 — cortadas e
    empilhadas na ordem das poses, devolvem os 14 em sequencia.
    """
    _, caminho = _impor(tmp_path, [_arte("A", 5), _arte("B", 5), _arte("C", 4)])
    folhas = _nomes_por_folha(caminho)
    assert len(folhas) == 4
    assert sum(len(f) for f in folhas) == 14
    assert (len(folhas) * 4) - 14 == 2
    assert [len(f) for f in folhas] == [4, 4, 3, 3]


# ── A ordem: empilhado, preenchendo na ordem ─────────────────────────────────

def test_as_celulas_seguem_a_ordem_do_pedido(tmp_path):
    """
    Empilhado com 16 itens em 4 folhas: a pose P leva a faixa
    [P*4, P*4+4), entao a folha S recebe os itens P*4+S.

    A sequencia global e a ordem do PEDIDO — A(4), B(7), C(5) —, e nao a ordem
    por tamanho. Ate a v630 o motor ordenava as artes por quantidade
    decrescente, o que embaralhava a tiragem sem ganho nenhum no modo somado.
    """
    _, caminho = _impor(tmp_path, [_arte("A", 4), _arte("B", 7), _arte("C", 5)])
    folhas = _nomes_por_folha(caminho)
    #              itens 0,4,8,12      1,5,9,13         2,6,10,14        3,7,11,15
    assert folhas[0] == sorted(["A1", "B1", "B5", "C2"])
    assert folhas[1] == sorted(["A2", "B2", "B6", "C3"])
    assert folhas[2] == sorted(["A3", "B3", "B7", "C4"])
    assert folhas[3] == sorted(["A4", "B4", "C1", "C5"])


def test_ninguem_sai_duas_vezes_nem_fica_de_fora(tmp_path):
    _, caminho = _impor(tmp_path, [_arte("A", 4), _arte("B", 7), _arte("C", 5)])
    todos = [n for folha in _nomes_por_folha(caminho) for n in folha]
    esperado = [f"A{i}" for i in range(1, 5)] + \
               [f"B{i}" for i in range(1, 8)] + \
               [f"C{i}" for i in range(1, 6)]
    assert sorted(todos) == sorted(esperado)


# ── A linha do banco de cada arte ────────────────────────────────────────────

def test_cada_item_recebe_a_linha_da_sua_propria_arte(tmp_path):
    """O defeito que este arquivo existe para impedir: os itens da segunda arte
    em diante recebiam a linha do banco da primeira, ou nenhuma."""
    _, caminho = _impor(tmp_path, [_arte("A", 4), _arte("B", 7), _arte("C", 5)])
    todos = {n for folha in _nomes_por_folha(caminho) for n in folha}
    assert "B7" in todos and "C5" in todos, "as artes de tras nao receberam o banco delas"
    assert len(todos) == 16, "algum item repetiu o nome de outro"


def test_arte_sem_banco_convive_com_artes_com_banco(tmp_path):
    """Um modelo sem CSV no meio do pedido nao pode derrubar o trabalho nem
    puxar a linha do vizinho."""
    artes = [_arte("A", 4), _arte("X", 3, com_banco=False), _arte("C", 5)]
    _, caminho = _impor(tmp_path, artes)
    todos = [n for folha in _nomes_por_folha(caminho) for n in folha]
    assert sorted(todos) == sorted(
        [f"A{i}" for i in range(1, 5)] + [f"C{i}" for i in range(1, 6)]
    ), "a arte sem banco deveria sair com o campo vazio, nao com o nome de outro"


def test_linha_desmarcada_da_arte_nao_entra(tmp_path):
    arte = _arte("A", 4)
    arte["numeracao"]["csv_data"][1]["__ativo"] = False   # some o A2
    arte["qtd"] = 3
    _, caminho = _impor(tmp_path, [arte, _arte("C", 5)])
    todos = {n for folha in _nomes_por_folha(caminho) for n in folha}
    assert "A2" not in todos
    assert {"A1", "A3", "A4"} <= todos


# ── A funcao pura, nos limites ───────────────────────────────────────────────

BANCO_DO_TRABALHO = [{"Nome": "G1"}, {"Nome": "G2"}, {"Nome": "G3"}]


def test_a_linha_da_arte_vence_o_banco_do_trabalho():
    item = {"csv_proprio": True, "csv_row": {"Nome": "B3"}}
    assert _linha_do_banco(item, 0, BANCO_DO_TRABALHO)["Nome"] == "B3"


def test_arte_com_banco_proprio_nunca_cai_no_banco_do_trabalho():
    """Se o item passou do fim da fatia dele, a resposta e "nao ha linha" — e
    nao a linha de outro modelo. Sem isto, a credencial da Bulgaria sairia com
    o nome de alguem do Chile."""
    item = {"csv_proprio": True, "csv_row": None}
    assert _linha_do_banco(item, 0, BANCO_DO_TRABALHO) is None


def test_sem_arte_vale_o_banco_do_trabalho():
    assert _linha_do_banco({}, 1, BANCO_DO_TRABALHO)["Nome"] == "G2"
    assert _linha_do_banco(None, 2, BANCO_DO_TRABALHO)["Nome"] == "G3"


def test_indice_fora_do_banco_devolve_nada_em_vez_de_estourar():
    """Ate a v630 os tres pontos do laco principal faziam
    `cfg.csv_data[item_index]` sem limite, e a tiragem morria com IndexError
    com o operador na frente da impressora."""
    assert _linha_do_banco({}, 99, BANCO_DO_TRABALHO) is None
    assert _linha_do_banco({}, -1, BANCO_DO_TRABALHO) is None
    assert _linha_do_banco({}, 0, None) is None


# ── QR Ideal: o modelo de cada item ──────────────────────────────────────────

def test_folha_somada_com_qr_ideal_e_item_sem_modelo_falha_alto(tmp_path):
    """Ate a v630 o motor procurava o modelo indexando a lista de ARTES pelo
    indice do ITEM. O item 40 de uma folha de oito artes nao existia ali e
    recebia o modelo do trabalho; o caminho de montagem, que chama sem indice,
    dava a TODOS os itens o modelo da primeira arte. Os codigos saiam da coluna
    errada do pool — e isso so aparece na portaria."""
    qr = {
        "id": "q1", "type": "QR_IDEAL",
        "x_mm": 50, "y_mm": 25, "size_mm": 15,
        "color": "#000000", "rotation": 0,
    }
    artes = [_arte("A", 4, modelo=1000270), _arte("B", 4, modelo=None)]
    for a in artes:
        a["numeracao"]["elements"] = [ELEMENTO_NOME, qr]

    with pytest.raises(ValueError, match="QR Ideal"):
        _impor(tmp_path, artes, pedido=20495)


# ── Pose girada no caminho de montagem ───────────────────────────────────────
#
# `Credencial 90x140`, o formato do pedido 20495, gira as poses 2 e 3 em 180
# graus (`rotations = {"2": 180, "3": 180}`). Imprimir um modelo sozinho nunca
# passa por aqui: a rotacao da celula so cai em `_render_item_front` /
# `_render_item_back`, que sao o caminho de MONTAGEM — o de combinar modelos.

FORMATO_GIRADO = dict(FORMATO, rotations={"2": 180, "3": 180, "page_rotate": 0})


def _saidas_da_montagem(tmp_path):
    """A montagem grava um PDF por set (`..._setN_02_miolo.pdf`), e nao o
    `out_pdf` cru. Ler o nome pedido daria "arquivo nao existe" mesmo com a
    geracao inteira correta."""
    return sorted(str(f) for f in tmp_path.glob("*.pdf"))


def _impor_montagem(tmp_path, artes):
    """O caminho `strict_assembly`: cada modelo com folhas proprias."""
    out = tmp_path / "montagem.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO_GIRADO,
        numeracao={"tipo": "SEQUENCIAL", "elements": [ELEMENTO_NOME]},
        saida=SAIDA,
        layout_schema="cut_stack",
        cut_stack_mode="strict_assembly",
        multi_artes=artes,
    )
    ImpositionEngine(cfg).process()
    return _saidas_da_montagem(tmp_path)


def test_pose_girada_nao_derruba_a_montagem(tmp_path):
    """Combinar dois modelos num formato com pose girada morria com
    `name 'rotate_element_coords' is not defined`.

    A funcao nao existe em lugar nenhum do repositorio: as duas chamadas eram
    sobra de um desenho antigo. Quem gira a celula e o `show_pdf_page(rotate=...)`
    que poe a pagina temporaria na folha — exatamente como o laco principal ja
    fazia no ponto gemeo, onde a linha e so `rotated_el = dict(el)`.
    """
    saidas = _impor_montagem(tmp_path, [_arte("A", 5), _arte("B", 5)])
    assert saidas, "a montagem nao gravou PDF nenhum"
    todos = {n for c in saidas for folha in _nomes_por_folha(c) for n in folha}
    assert {"A1", "A5", "B1", "B5"} <= todos, todos


def test_pose_girada_com_verso_tambem_sai(tmp_path):
    """O gemeo em `_render_item_back` tinha a mesma chamada fantasma."""
    artes = [_arte("A", 5), _arte("B", 5)]
    for a in artes:
        a["pdf_verso_url"] = None
        a["numeracao"]["print_mode"] = "duplex"
    out = tmp_path / "montagem_verso.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO_GIRADO,
        numeracao={"tipo": "SEQUENCIAL", "elements": [ELEMENTO_NOME]},
        saida=SAIDA,
        layout_schema="cut_stack",
        cut_stack_mode="strict_assembly",
        multi_artes=artes,
        print_mode="duplex",
    )
    ImpositionEngine(cfg).process()
    saidas = _saidas_da_montagem(tmp_path)
    assert saidas, "a montagem com verso nao gravou PDF nenhum"
    todos = {n for c in saidas for folha in _nomes_por_folha(c) for n in folha}
    assert {"A1", "B5"} <= todos, todos
