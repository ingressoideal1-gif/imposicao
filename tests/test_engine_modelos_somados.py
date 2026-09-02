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


def _arte(prefixo, qtd, com_banco=True, modelo=None, pedido=None):
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
        "pedido": pedido,
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


def test_arte_com_campo_de_banco_e_sem_banco_para_a_folha(tmp_path):
    """Campo que le do banco, num modelo sem banco, PARA o trabalho (02/09/2026).

    Este teste dizia o contrario ate hoje: que a arte sem banco "sai com o campo
    vazio, nao com o nome de outro". A metade sobre o vizinho estava certa e
    continua valendo. A outra metade nunca foi verdade — o que saia era o NUMERO
    DO ITEM no lugar do nome. Medido no PDF gerado por este mesmo cenario, com o
    motor de antes:

        folha 0 : ['A1', '3', 'A4', 'C3']
        folha 1 : ['A2', 'C1', '1', 'C4']
        folha 2 : ['A3', 'C2', '2', 'C5']

    O `3`, o `1` e o `2` sao as tres credenciais da arte X, com o contador
    sequencial impresso onde devia estar o nome da pessoa. A afirmacao passava
    porque o filtro `_NOME` (`^[A-Z]\\d+$`) so enxerga nomes do banco: os numeros
    soltos eram invisiveis para ele, e ninguem tinha olhado a folha.

    No pedido 21460 o mesmo ramo poe o contador dentro do QR de uma credencial de
    evento — 0001, 0002, 0003 no lugar do codigo de 12 digitos do cliente —, e o
    erro so aparece na portaria. Por isso o motor passou a recusar: preferir o
    trabalho parado ao trabalho errado. Ver
    `tests/test_engine_banco_nunca_vira_sequencial.py`.
    """
    artes = [_arte("A", 4), _arte("X", 3, com_banco=False), _arte("C", 5)]
    with pytest.raises(ValueError) as erro:
        _impor(tmp_path, artes)
    assert "e1" in str(erro.value), "a recusa precisa dizer qual campo parou a folha"


def test_arte_sem_campo_de_banco_convive_com_artes_com_banco(tmp_path):
    """A convivencia que importa de verdade: modelo puramente sequencial.

    Ele nao pede nada ao banco, entao nao ha o que faltar — e nao pode ser
    parado pela recusa acima nem puxar a linha do vizinho. E o trabalho de todo
    dia da grafica somado a um modelo com dados variaveis.
    """
    contador = dict(ELEMENTO_NOME)
    contador.pop("source")
    contador.pop("csv_column")
    contador["prefix"] = "X"

    sequencial = _arte("X", 3, com_banco=False)
    sequencial["numeracao"]["elements"] = [contador]

    artes = [_arte("A", 4), sequencial, _arte("C", 5)]
    _, caminho = _impor(tmp_path, artes)
    todos = [n for folha in _nomes_por_folha(caminho) for n in folha]
    assert sorted(todos) == sorted(
        [f"A{i}" for i in range(1, 5)]
        + [f"X{i}" for i in range(1, 4)]
        + [f"C{i}" for i in range(1, 6)]
    ), "o modelo sequencial tem de sair com o proprio contador, e ninguem com o nome de outro"


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
    artes = [_arte("A", 4, modelo=1000270), _arte("B", 4, modelo=None)]

    # A mensagem tem de ser a ESPECIFICA, da conferencia previa, e nao a
    # generica do meio da montagem das paginas: quem le precisa saber que falta
    # o modelo, e de qual arte.
    with pytest.raises(ValueError, match="o modelo de"):
        _impor_com_qr(tmp_path, artes, pedido=20495)


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


# ── O numero do modelo no papel: opcao, e desligada por padrao ────────────────
#
# O motor imprime `arte["nome"]` deitado na borda esquerda de cada item, e esse
# campo e o UNICO que decide se ele sai. Ate 18/08/2026 o painel o preenchia
# sempre com o numero do modelo, entao combinar modelos punha uma marca nova no
# papel sem ninguem ter pedido. O usuario mandou que virasse opcao, desmarcada
# por padrao; o painel passou a mandar vazio quando ela esta desmarcada.
#
# Os dois testes abaixo prendem as duas metades no motor. Se algum dia alguem
# voltar a imprimir o nome sem olhar para o campo, o primeiro falha.

_NUMERO_MODELO = re.compile(r"^\d{6,}$")


def _numeros_de_modelo(caminho):
    doc = fitz.open(caminho)
    try:
        return {t for p in doc for t in p.get_text().split() if _NUMERO_MODELO.match(t)}
    finally:
        doc.close()


def test_arte_sem_nome_nao_imprime_numero_de_modelo(tmp_path):
    """Opcao desmarcada: o painel manda `nome` vazio e nada extra vai ao papel."""
    _, caminho = _impor(tmp_path, [_arte("A", 4), _arte("B", 4)])
    assert _numeros_de_modelo(caminho) == set()


def test_arte_com_nome_imprime_o_numero_em_cada_item(tmp_path):
    """Opcao marcada: cada item leva o numero do SEU modelo, nao o do primeiro."""
    a, b = _arte("A", 4), _arte("B", 4)
    a["nome"], b["nome"] = "1000277", "1000278"
    _, caminho = _impor(tmp_path, [a, b])
    assert {"1000277", "1000278"} <= _numeros_de_modelo(caminho)


# ── Sequencial com modelos combinados ────────────────────────────────────────

def test_sequencial_combinado_enche_a_folha_na_ordem(tmp_path):
    """Modo Sequencial: a folha enche na ordem de leitura, folha a folha.

    E o que o par "Sequencial / Blocado" pede ao motor quando os modelos estao
    em Sequencial. O motor ja sabia fazer — o indice e `(folha x poses) + pose` e
    cada item continua puxando a arte e a linha do banco do PROPRIO modelo —, mas
    nenhum caminho do painel chegava aqui com `multi_artes` preenchido.

    Com A1..A5 e B1..B5 em folhas de 4, o resultado prova as duas coisas de uma
    vez: os modelos sao trechos contiguos da tiragem, e um comeca na folha onde o
    outro terminou (a folha 2 tem o fim de A e o comeco de B).
    """
    out = tmp_path / "sequencial.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO,
        numeracao={"tipo": "SEQUENCIAL", "elements": [ELEMENTO_NOME]},
        saida=SAIDA,
        layout_schema="sequential",
        multi_artes=[_arte("A", 5), _arte("B", 5)],
    )
    ImpositionEngine(cfg).process()

    assert cfg.total_items == 10
    folhas = _nomes_por_folha(str(out))
    assert [f for f in folhas] == [
        ["A1", "A2", "A3", "A4"],
        ["A5", "B1", "B2", "B3"],
        ["B4", "B5"],
    ], folhas


# ── QR Ideal: o pedido de cada item ──────────────────────────────────────────
#
# O conteudo do QR e `reverso(pedido) + codigo`, e a COLUNA do pool e
# `(ultimos2(pedido) - ultimos2(modelo)) mod 100`. As duas coisas dependem do
# pedido, que ate 18/08/2026 era um so por trabalho.
#
# Numa folha que junta modelos de PEDIDOS diferentes, o pedido do trabalho e o de
# um deles e serviria de resposta errada para os outros: coluna errada e prefixo
# errado. Um ingresso assim nao parece defeituoso — ele e entregue, e falha na
# portaria, com a fila na porta.

QR_IDEAL_EL = {
    "id": "q1", "type": "QR_IDEAL",
    "x_mm": 50, "y_mm": 25, "size_mm": 15,
    "color": "#000000", "rotation": 0,
}


def _numeracao(com_qr):
    """A numeracao do TRABALHO.

    O QR precisa estar aqui, e nao so dentro de cada arte: `cfg.elements` e
    montado a partir desta numeracao, e e ele que `_usa_qr_ideal()` varre para
    decidir se as travas previas rodam. Uma folha com QR so nas artes chega ao
    desenho sem passar por nenhuma delas — e ai a mensagem de erro e a generica,
    do meio da montagem.
    """
    els = [ELEMENTO_NOME] + ([QR_IDEAL_EL] if com_qr else [])
    return {"tipo": "SEQUENCIAL", "elements": els}


def _pool_ou_none():
    """O pool de 24 MB da estacao, quando ele existe nesta maquina."""
    try:
        import qr_ideal as _qi
        return _qi.PoolQR()
    except Exception:
        return None


def _impor_com_qr(tmp_path, artes, pedido=None):
    out = tmp_path / "com_qr.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO,
        numeracao=_numeracao(True),
        saida=SAIDA,
        layout_schema="multi_artes",
        multi_artes=artes,
        pedido=pedido,
        pool_qr=_pool_ou_none(),
    )
    ImpositionEngine(cfg).process()
    return cfg, str(out)


def _motor(artes, pedido=None, com_qr=False):
    """Um motor montado so para perguntar coisas, sem gerar papel."""
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf="nao_sera_gravado.pdf",
        formato=FORMATO,
        numeracao=_numeracao(com_qr),
        saida=SAIDA,
        layout_schema="multi_artes",
        multi_artes=artes,
        pedido=pedido,
        pool_qr=_pool_ou_none(),
    )
    return ImpositionEngine(cfg)


def test_o_pedido_do_item_vence_o_do_trabalho():
    """Cada item leva o pedido da SUA arte. O do trabalho e so o recuo."""
    artes = [_arte("A", 4, modelo=1000270, pedido=20495),
             _arte("B", 4, modelo=1000301, pedido=20508)]
    motor = _motor(artes, pedido=20495)

    assert motor._pedido_do_item({"pedido": 20508}) == "20508"
    assert motor._pedido_do_item({"pedido": "20495"}) == "20495"


def test_o_pedido_volta_como_texto_e_nunca_como_numero():
    """O pedido 20270 invertido e "07202". Tratado como inteiro viraria 7202,
    que invertido e 2027 — outro pedido, outro evento."""
    motor = _motor([_arte("A", 4, modelo=1000270, pedido="00123")], pedido="00123")
    assert motor._pedido_do_item({"pedido": "00123"}) == "00123"
    assert motor._pedido_do_item(None) == "00123"


def test_folha_de_um_pedido_so_continua_usando_o_do_trabalho():
    """Nenhuma arte declara pedido: e toda folha que existia antes desta
    mudanca, e ela nao pode mudar de comportamento."""
    motor = _motor([_arte("A", 4, modelo=1000270), _arte("B", 4, modelo=1000271)],
                   pedido=20495)
    assert motor._pedidos_da_folha() == []
    assert motor._pedido_do_item(None) == "20495"
    assert motor._pedido_do_item({}) == "20495"


def test_folha_que_mistura_pedidos_e_item_sem_pedido_falha_alto():
    """A regra do QR Ideal: sem o dado, o trabalho para. Nunca calcular com
    valor suposto — o erro so apareceria na portaria."""
    artes = [_arte("A", 4, modelo=1000270, pedido=20495),
             _arte("B", 4, modelo=1000301, pedido=20508)]
    motor = _motor(artes, pedido=20495)

    assert motor._pedidos_da_folha() == ["20495", "20508"]
    with pytest.raises(ValueError, match="pedidos diferentes"):
        motor._pedido_do_item({"modelo": 1000301})


def test_a_conferencia_previa_diz_qual_arte_esta_sem_pedido(tmp_path):
    """Recusar ANTES do papel, dizendo o que falta — e nao no meio da montagem
    das paginas."""
    artes = [_arte("A", 4, modelo=1000270, pedido=20495),
             _arte("B", 4, modelo=1000301, pedido=20508),
             _arte("C", 4, modelo=1000302, pedido=None)]

    with pytest.raises(ValueError, match="o pedido de"):
        _impor_com_qr(tmp_path, artes, pedido=20495)


def test_colunas_repetidas_so_recusam_dentro_do_mesmo_pedido(tmp_path):
    """1000270 e 1000370 terminam nos mesmos dois digitos, entao caem na mesma
    coluna do pool.

    No MESMO pedido isso produz QRs identicos no mesmo evento, e o trabalho e
    recusado. Em pedidos DIFERENTES o prefixo separa o conteudo do QR, a portaria
    distingue os dois, e recusar bloquearia uma combinacao legitima — o risco
    residual (codigo de 8 caracteres repetido entre eventos) ja esta conhecido e
    aceito em docs/qr_ideal.md.
    """
    mesmos = [_arte("A", 4, modelo=1000270, pedido=20495),
              _arte("B", 4, modelo=1000370, pedido=20495)]
    with pytest.raises(ValueError, match="mesma coluna"):
        _impor_com_qr(tmp_path, mesmos, pedido=20495)

    if _pool_ou_none() is None:
        pytest.skip("estacao sem qr_ideal_pool.bin")
    outros = [_arte("A", 4, modelo=1000270, pedido=20495),
              _arte("B", 4, modelo=1000370, pedido=20508)]
    _impor_com_qr(tmp_path, outros, pedido=20495)   # nao levanta


def test_o_qr_de_cada_item_sai_com_o_pedido_da_sua_arte(tmp_path):
    """A prova de ponta a ponta: dois pedidos na mesma folha, e o conteudo de
    cada QR comeca pelo pedido invertido do modelo a que ele pertence."""
    import qr_ideal as _qi

    if _pool_ou_none() is None:
        pytest.skip("estacao sem qr_ideal_pool.bin")
    artes = [_arte("A", 4, modelo=1000270, pedido=20495),
             _arte("B", 4, modelo=1000301, pedido=20508)]

    cfg, _ = _impor_com_qr(tmp_path, artes, pedido=20495)

    motor = ImpositionEngine(cfg)
    a1 = motor._conteudo_qr_ideal(1, item_data={"modelo": 1000270, "pedido": 20495})
    b1 = motor._conteudo_qr_ideal(1, item_data={"modelo": 1000301, "pedido": 20508})

    assert a1.startswith(_qi.prefixo("20495"))
    assert b1.startswith(_qi.prefixo("20508"))
    # E o do segundo NAO pode ser o que sairia com o pedido do trabalho.
    assert b1 != motor._conteudo_qr_ideal(1, item_data={"modelo": 1000301, "pedido": 20495})
