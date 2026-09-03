# -*- coding: utf-8 -*-
"""
Refazer folhas e refazer celulas.

Refazer e o que o operador usa quando a tiragem ja saiu e uma parte dela se
perdeu. Sao dois modos, e eles nao se misturam:

 · POR FOLHA (`refazer_de`/`refazer_ate`, dentro de `refazer_set`) reimprime
   folhas inteiras, iguais as originais. O motor filtra com `continue` dentro do
   laco, sem recalcular indice nenhum.

 · POR CELULA (`refazer_celulas`) e uma lista de POSICOES DO ITEM NO MODELO,
   1-based: o 1o, o 6o, o 22o ticket do trabalho. Nao e a pose da folha — pedir
   "22" num formato de quatro celulas e legitimo. Os itens sao compactados numa
   folha nova, na ordem digitada.

A propriedade que estes testes travam nos dois modos e que refazer NAO desloca a
numeracao: o item leva o numero que sempre teve, e so a posicao na folha muda.

A segunda propriedade e o barulho: um pedido que nao casa com nada tem de virar
erro. Antes ele produzia zero paginas em silencio e a tela ainda dizia
"concluido e arquivos salvos" — na grafica, isso e uma pilha de papel que
ninguem reimprimiu.
"""
import re

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine

# 2 x 2 = 4 poses por folha. Note que o modelo tem 12 itens: e por isso que
# `refazer_celulas=[9]` e valido aqui — 9 e a nona POSICAO DO MODELO, nao a nona
# pose da folha, que nem existe.
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
    assert "nada corresponde" in str(erro.value)


def test_a_celula_e_a_posicao_do_item_no_modelo(tmp_path):
    """
    O numero digitado e a POSICAO DO ITEM NO MODELO, nao a pose da folha.

    Este formato tem quatro poses por folha, mas o modelo tem doze itens: pedir a
    posicao 9 e valido e devolve o nono ticket, o N9. Antes, o campo era validado
    contra as quatro poses e recusava 9, 22, 77 — que e justamente o que o
    operador tem em maos quando um ticket especifico se perdeu.
    """
    assert impor(tmp_path, refazer_celulas=[9]) == [[9]]
    assert impor(tmp_path, refazer_celulas=[1, 6, 12]) == [[1, 6, 12]]


def test_a_numeracao_nao_se_move_com_a_compactacao(tmp_path):
    """
    O item muda de lugar na folha, nunca de numero. O 7o item do modelo morava na
    terceira pose da folha 2; pedido sozinho, ele cai na primeira pose da folha de
    saida e continua sendo o N7.
    """
    assert impor(tmp_path, refazer_celulas=[7, 11]) == [[7, 11]]


def test_itens_repetidos_entram_uma_vez_so(tmp_path):
    """O campo e digitado as pressas, na frente da impressora."""
    assert impor(tmp_path, refazer_celulas=[3, 1, 3]) == [[1, 3]]


def test_mais_itens_do_que_cabe_numa_folha_transborda(tmp_path):
    """Seis itens numa folha de quatro poses: uma folha cheia e duas poses."""
    assert impor(tmp_path, refazer_celulas=[1, 2, 3, 4, 5, 6]) == [[1, 2, 3, 4], [5, 6]]


def test_a_faixa_de_folhas_nao_se_aplica_as_posicoes(tmp_path):
    """
    Os dois modos sao excludentes. O frontend impede a combinacao desmarcando um
    checkbox quando o outro e marcado; o motor, que tambem atende o agente local e
    a API, ignora a faixa quando ha posicoes — elas ja sao absolutas no modelo, e
    filtrar por folha so poderia contradize-las.
    """
    assert impor(tmp_path, refazer_de=3, refazer_ate=3, refazer_celulas=[1, 2]) == [[1, 2]]


def test_posicao_inexistente_e_erro(tmp_path):
    """
    Este modelo tem doze itens; nao existe um decimo terceiro. Sem esta guarda o
    pedido produziria uma folha vazia em silencio.
    """
    with pytest.raises(ValueError) as erro:
        impor(tmp_path, refazer_celulas=[13])
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


def test_cut_stack_a_posicao_independe_do_esquema(tmp_path):
    """
    A posicao e do MODELO, nao da folha — entao ela nao muda com o esquema. Em
    cut_stack os itens 4, 5 e 6 moram em folhas diferentes (folha 1 pose 2, folha
    2 pose 2, folha 3 pose 2), e pedir 4,5,6 devolve os mesmos tres tickets que
    devolveria em sequencial. E o que dispensa a compactacao de refazer a conta de
    indice do esquema: ela so precisa do indice do item.
    """
    assert _impor_cut_stack(tmp_path, refazer_celulas=[4, 5, 6]) == [[4, 5, 6]]
    assert _impor_cut_stack(tmp_path, refazer_celulas=[1]) == [[1]]


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


def _impor_para_ordem(tmp_path, **refazer):
    out = tmp_path / "refazer.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf", out_pdf=str(out), formato=FORMATO,
        numeracao=NUMERACAO, saida=SAIDA, seq_start=SEQ_INICIO, seq_end=SEQ_FIM,
        seq_increment=1, layout_schema="sequential", **refazer,
    )
    ImpositionEngine(cfg).process()
    return _numeros_em_ordem_de_leitura(out)


def test_o_item_vai_para_a_proxima_celula_vaga(tmp_path):
    """
    O coracao do "refazer celula". Seis itens dispersos pelo modelo preenchem a
    folha de saida na ordem pedida: as quatro poses da primeira folha e as duas
    primeiras da segunda — nenhuma pose vaga no meio.
    """
    assert _impor_para_ordem(tmp_path, refazer_celulas=[2, 4, 6, 8, 10, 12]) \
        == [[2, 4, 6, 8], [10, 12]]


def test_os_itens_entram_na_ordem_digitada(tmp_path):
    """
    A ordem da lista e a ordem em que os itens ocupam a folha. Digitar "4,1" poe
    o quarto item na primeira pose e o primeiro na segunda.

    Ordenar parecia inofensivo e nao era: com a previa desenhando enquanto se
    digita, acrescentar um numero menor fazia o anterior saltar de posicao diante
    do operador — "embaralha tudo", nas palavras dele.
    """
    assert _impor_para_ordem(tmp_path, refazer_celulas=[4, 1]) == [[4, 1]]
    assert _impor_para_ordem(tmp_path, refazer_celulas=[1, 4]) == [[1, 4]]
    assert _impor_para_ordem(tmp_path, refazer_celulas=[12, 1, 7]) == [[12, 1, 7]]


def test_a_montagem_pode_repetir_uma_celula(tmp_path):
    """
    A Montagem duplica uma celula de proposito: a mesma peca impressa duas
    vezes, lado a lado. Com `refazer_repetir` a lista entra como veio — "3,1,3"
    sao tres poses, e a terceira repete o N3. A ordem continua sendo a digitada.
    """
    paginas = _impor_para_ordem(tmp_path, refazer_celulas=[3, 1, 3], refazer_repetir=True)
    assert paginas == [[3, 1, 3]]


def test_a_repeticao_conta_para_o_transbordo(tmp_path):
    """
    Cinco copias do mesmo item num formato de quatro poses sao cinco poses, nao
    uma: a primeira folha enche e a quinta copia vai para a segunda.
    """
    paginas = impor(tmp_path, refazer_celulas=[1, 1, 1, 1, 1], refazer_repetir=True)
    assert paginas == [[1, 1, 1, 1], [1]]


def test_sem_pedir_repeticao_o_pedido_continua_deduplicando(tmp_path):
    """
    O padrao nao muda: o campo do Pedido e digitado as pressas, e um "3,1,3" la
    e engano. Desligado, o comportamento e o de sempre — uma vez so, e na ordem
    da primeira ocorrencia.
    """
    assert _impor_para_ordem(tmp_path, refazer_celulas=[3, 1, 3]) == [[3, 1]]
    paginas = _impor_para_ordem(tmp_path, refazer_celulas=[3, 1, 3], refazer_repetir=False)
    assert paginas == [[3, 1]]


def test_o_config_guarda_a_opcao_de_repetir():
    """
    Repetir nao afrouxa o filtro: o que nao e inteiro >= 1 continua caindo, e
    o que sobra fica na ordem recebida. Sem a chave, o padrao e desligado.
    """
    comum = dict(
        base_file="base_ticket.pdf", out_pdf="ignorado.pdf", formato=FORMATO,
        numeracao=NUMERACAO, saida=SAIDA, seq_start=1, seq_end=4,
    )
    cfg = ImpositionConfig(refazer_celulas=["3", "x", "1", 0, "3"], refazer_repetir=True, **comum)
    assert cfg.refazer_repetir is True
    assert cfg.refazer_celulas == [3, 1, 3]

    cfg = ImpositionConfig(refazer_celulas=["3", "x", "1", 0, "3"], **comum)
    assert cfg.refazer_repetir is False
    assert cfg.refazer_celulas == [3, 1]


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
