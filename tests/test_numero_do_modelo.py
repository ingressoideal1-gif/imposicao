# -*- coding: utf-8 -*-
"""O numero do modelo na borda do item: corpo, borda e giro (03/09/2026).

Cada item de uma folha combinada leva, deitado na borda, o numero do modelo de
que ele veio. E' o que o operador usa para separar a pilha depois do corte: sem
ele, dois modelos parecidos na mesma folha viram uma pilha so'.

Ate 03/09/2026 so' a COR era configuravel (`nome_color`). Corpo, borda e giro
estavam escritos dentro do motor, em TRES copias identicas — o ramo de reserva
do laco principal, o `_render_item_front` e o `_render_item_back`. Copia e' o
que faz regra divergir: mexer numa e esquecer as outras faz o verso sair
diferente da frente. Agora ha uma funcao so', `_desenhar_numero_do_modelo`, e
tres campos novos no item: `nome_size`, `nome_pos` e `nome_rot`.

O teste que mais importa neste arquivo e' o primeiro. Ele desenha, lado a lado,
o codigo NOVO com os padroes e uma copia literal do codigo ANTIGO, e cobra que
as duas caixas de texto sejam iguais — nao parecidas, iguais. E' a prova de que
a grafica nao regride: o trabalho que ela imprime hoje sai amanha no mesmo
lugar.
"""
import io
import math
import os
import sys

import fitz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine
from engine import ImpositionConfig, ImpositionEngine

MM2PT = 2.834645669

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A celula do teste, em pontos. Larga e baixa de proposito: assim "encostado na
# esquerda" e "encostado no topo" caem em coordenadas bem diferentes, e uma
# troca de eixo nao passa despercebida.
ITEM_W = 300.0
ITEM_H = 150.0

# A folga de sangria e' um item inteiro para cada lado — ver `_folga_de_sangria`.
# A pagina temporaria do motor e' assim, e os testes desenham na mesma geometria.
FX = ITEM_W
FY = ITEM_H

NOME = "731"            # sai como "000731", com o zfill(6) de sempre
NUMERO = "000731"

_IMPACT_CANDIDATOS = [
    "C:/Windows/Fonts/impact.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
    "/usr/share/fonts/impact/impact.ttf",
]


class _Cfg:
    """So' o que `_desenhar_numero_do_modelo` le do config."""

    def __init__(self, item_w=ITEM_W, item_h=ITEM_H):
        self.item_w = item_w
        self.item_h = item_h


def _pagina():
    doc = fitz.open()
    return doc, doc.new_page(width=ITEM_W + 2 * FX, height=ITEM_H + 2 * FY)


def _caixa_do_nome(pagina, texto=NUMERO):
    """A caixa do numero na pagina, em pontos: (x0, y0, x1, y1)."""
    caixas = [(x0, y0, x1, y1) for x0, y0, x1, y1, palavra, *_
              in pagina.get_text("words") if palavra.strip() == texto]
    assert caixas, "o numero " + texto + " nao foi desenhado"
    return (min(c[0] for c in caixas), min(c[1] for c in caixas),
            max(c[2] for c in caixas), max(c[3] for c in caixas))


def _desenhar(item, cfg=None):
    """Desenha pelo motor e devolve a caixa do numero."""
    doc, pagina = _pagina()
    try:
        engine._desenhar_numero_do_modelo(pagina, item, FX, FY, cfg or _Cfg())
        return _caixa_do_nome(pagina)
    finally:
        doc.close()


def _largura_padrao(corpo=14.0):
    """A largura do numero na fonte que esta maquina tem — a mesma regua do
    motor. Nao da' para cravar um numero aqui: com a Impact instalada a medida
    e' uma, sem ela e' outra."""
    arquivo = next((p for p in _IMPACT_CANDIDATOS if os.path.exists(p)), None)
    return engine._largura_do_texto(NUMERO, arquivo,
                                    "Impact" if arquivo else "hebo", corpo)


# --------------------------------------------------------------------------
# O padrao nao mudou
# --------------------------------------------------------------------------

def _desenho_de_antes(pagina, item, _fx, _fy, cfg):
    """O codigo que o motor tinha nos tres pontos ate 03/09/2026, copiado.

    Copia literal de proposito: e' a testemunha. Se algum dia o desenho novo
    mudar de lugar, e' contra esta funcao que a diferenca aparece.
    """
    nome_str = str(item["nome"]).zfill(6)
    nome_rgb = engine._hex_to_rgb(item.get("nome_color", "#000000"))
    nome_font_size = 14
    nome_x = _fx + nome_font_size
    _impact_file = next((p for p in _IMPACT_CANDIDATOS if os.path.exists(p)), None)
    _font_name_calc = "Impact" if _impact_file else "hebo"
    text_width = engine._largura_do_texto(nome_str, _impact_file,
                                          _font_name_calc, nome_font_size)
    nome_y = _fy + (cfg.item_h + text_width) / 2
    pivot = fitz.Point(nome_x, nome_y)
    kwargs = dict(
        fontsize=nome_font_size,
        color=nome_rgb,
        morph=(pivot, fitz.Matrix(math.cos(math.radians(-90)), -math.sin(math.radians(-90)),
                                  math.sin(math.radians(-90)), math.cos(math.radians(-90)), 0, 0))
    )
    if _impact_file:
        kwargs["fontname"] = "Impact"
        kwargs["fontfile"] = _impact_file
    else:
        kwargs["fontname"] = "hebo"
    pagina.insert_text(pivot, nome_str, **kwargs)


def test_o_padrao_desenha_exatamente_onde_desenhava_antes():
    """O teste que segura a producao.

    Um item que so' traz `nome` — nenhum dos tres campos novos — tem de sair no
    MESMO ponto, no MESMO corpo e no MESMO giro de antes. A comparacao e' contra
    o codigo antigo copiado neste arquivo, e nao contra um numero que eu digitei:
    numero digitado envelhece calado, testemunha nao.

    A igualdade e' exata (nao `approx`) porque a conta nova foi escrita para
    recair, letra por letra, na expressao antiga `fy + (item_h + largura) / 2`.
    """
    item = {"nome": NOME}
    cfg = _Cfg()

    doc_novo, pagina_nova = _pagina()
    doc_velho, pagina_velha = _pagina()
    try:
        engine._desenhar_numero_do_modelo(pagina_nova, item, FX, FY, cfg)
        _desenho_de_antes(pagina_velha, item, FX, FY, cfg)
        assert _caixa_do_nome(pagina_nova) == _caixa_do_nome(pagina_velha)
    finally:
        doc_novo.close()
        doc_velho.close()


def test_o_padrao_e_a_borda_esquerda_com_o_numero_em_pe():
    """A mesma prova por outro lado, sem depender da testemunha: a linha de base
    fica a 14 pt da borda esquerda e o texto sobe a partir do ponto que centra
    ele na altura da celula."""
    x0, y0, x1, y1 = _desenhar({"nome": NOME})
    largura = _largura_padrao()

    assert y1 == pytest.approx(FY + (ITEM_H + largura) / 2, abs=0.5)
    assert y0 == pytest.approx(y1 - largura, abs=1.0)
    # Em pe: a caixa e' estreita e alta.
    assert (y1 - y0) > (x1 - x0) * 2
    # A linha de base esta em FX + 14; a caixa pega o ascendente, a esquerda dela.
    assert FX - 5 < x0 < FX + 14


def test_a_cor_continua_sendo_a_do_nome_color():
    """`nome_color` nao mudou de nome nem de padrao junto com o resto."""
    doc, pagina = _pagina()
    try:
        engine._desenhar_numero_do_modelo(
            pagina, {"nome": NOME, "nome_color": "#ff0000"}, FX, FY, _Cfg())
        vermelho = [span for bloco in pagina.get_text("dict")["blocks"]
                    for linha in bloco.get("lines", [])
                    for span in linha["spans"] if span["color"] == 0xFF0000]
        assert vermelho, "o numero nao saiu na cor pedida"
    finally:
        doc.close()


# --------------------------------------------------------------------------
# As quatro bordas
# --------------------------------------------------------------------------

def test_cada_posicao_encosta_na_sua_borda():
    """Cada borda puxa o numero para o seu lado, e o deixa DENTRO da celula.

    A celula ocupa (FX, FY) ate (FX + ITEM_W, FY + ITEM_H). A conferencia e' de
    proximidade: o recuo da borda e' o corpo da fonte (14 pt), medido ate a linha
    de base, entao a caixa do glifo fica a poucos pontos da borda — nunca do
    outro lado da celula.
    """
    esquerda, direita, topo, base = (
        _desenhar({"nome": NOME, "nome_pos": p})
        for p in ("esquerda", "direita", "topo", "base"))

    # Encostado: a distancia ate a SUA borda e' de poucos pontos.
    assert abs(esquerda[0] - FX) < 20
    assert abs(direita[2] - (FX + ITEM_W)) < 20
    assert abs(topo[1] - FY) < 20
    assert abs(base[3] - (FY + ITEM_H)) < 20

    # E do lado certo: esquerda fica a esquerda de direita, topo acima de base.
    assert esquerda[2] < direita[0]
    assert topo[3] < base[1]

    # Centralizado ao longo da borda: as duas verticais no meio da altura, as
    # duas horizontais no meio da largura.
    #
    # Nas verticais o texto CORRE ao longo da borda (giro padrao, 90 graus) e o
    # centro bate no fio. Nas horizontais ele corre PERPENDICULAR a ela, e o que
    # fica centrado e' a LINHA DE BASE — a caixa do glifo pende para o lado do
    # ascendente, uns 5 pt num corpo 14. E' a mesma escolha do recuo, que
    # tambem e' medido ate a linha de base; centrar a caixa em vez da base
    # exigiria adivinhar o ascendente da fonte a cada desenho.
    meio_y = FY + ITEM_H / 2
    meio_x = FX + ITEM_W / 2
    assert (esquerda[1] + esquerda[3]) / 2 == pytest.approx(meio_y, abs=1.0)
    assert (direita[1] + direita[3]) / 2 == pytest.approx(meio_y, abs=1.0)
    assert (topo[0] + topo[2]) / 2 == pytest.approx(meio_x, abs=7.0)
    assert (base[0] + base[2]) / 2 == pytest.approx(meio_x, abs=7.0)

    # E quando o texto corre ao longo da borda horizontal (giro 0), o centro
    # bate no fio como nas verticais.
    deitado_no_topo = _desenhar({"nome": NOME, "nome_pos": "topo", "nome_rot": 0})
    assert (deitado_no_topo[0] + deitado_no_topo[2]) / 2 == pytest.approx(meio_x, abs=1.0)


def test_o_numero_nao_sai_da_celula_em_nenhuma_combinacao():
    """Doze das dezesseis combinacoes sao novas; nenhuma pode jogar o numero
    para fora do papel.

    A folga aceita e' meio corpo de fonte: o recuo e' medido ate a LINHA DE BASE,
    entao o topo do glifo passa cerca de 1 pt da borda — e' assim desde sempre no
    caso `esquerda` + `90`, e apertar isso moveria o que ja esta aprovado.
    """
    folga = 8.0
    for posicao in ("esquerda", "direita", "topo", "base"):
        for giro in (0, 90, 180, 270):
            x0, y0, x1, y1 = _desenhar(
                {"nome": NOME, "nome_pos": posicao, "nome_rot": giro})
            assert x0 > FX - folga, (posicao, giro, "saiu pela esquerda")
            assert x1 < FX + ITEM_W + folga, (posicao, giro, "saiu pela direita")
            assert y0 > FY - folga, (posicao, giro, "saiu por cima")
            assert y1 < FY + ITEM_H + folga, (posicao, giro, "saiu por baixo")


def test_posicao_desconhecida_volta_para_a_esquerda():
    padrao = _desenhar({"nome": NOME})
    assert _desenhar({"nome": NOME, "nome_pos": "diagonal"}) == padrao
    assert _desenhar({"nome": NOME, "nome_pos": ""}) == padrao
    assert _desenhar({"nome": NOME, "nome_pos": None}) == padrao
    assert _desenhar({"nome": NOME, "nome_pos": 7}) == padrao
    # Maiuscula e espaco sobrando sao do operador, nao erro: valem.
    assert _desenhar({"nome": NOME, "nome_pos": " TOPO "}) \
        == _desenhar({"nome": NOME, "nome_pos": "topo"})


# --------------------------------------------------------------------------
# O corpo da fonte
# --------------------------------------------------------------------------

def test_o_nome_size_muda_o_corpo_da_fonte():
    """Com o giro padrao (90) o texto sobe: aumentar o corpo estica a caixa na
    vertical e a engorda na horizontal, nas duas na mesma proporcao."""
    pequeno = _desenhar({"nome": NOME, "nome_size": 8})
    padrao = _desenhar({"nome": NOME})
    grande = _desenhar({"nome": NOME, "nome_size": 24})

    comprimento = [c[3] - c[1] for c in (pequeno, padrao, grande)]
    espessura = [c[2] - c[0] for c in (pequeno, padrao, grande)]
    assert comprimento[0] < comprimento[1] < comprimento[2]
    assert espessura[0] < espessura[1] < espessura[2]

    # A escala e' proporcional ao corpo: 24 pt e' tres vezes 8 pt.
    assert comprimento[2] == pytest.approx(comprimento[0] * 3, rel=0.05)
    # E e' o corpo pedido que sai no PDF, nao um parecido.
    assert comprimento[2] == pytest.approx(_largura_padrao(24.0), abs=1.0)


@pytest.mark.parametrize("valor", [999, 5, 25, 0, -14, "abc", "", None, [14], True])
def test_corpo_fora_da_faixa_cai_no_padrao(valor):
    """6 a 24 pt e' a faixa. Fora dela — ou nao numerico — vale o 14 de sempre,
    calado: uma folha que nao sai custa mais a grafica do que um numero de
    conferencia no corpo de sempre."""
    assert _desenhar({"nome": NOME, "nome_size": valor}) == _desenhar({"nome": NOME})


def test_corpo_numerico_em_texto_vale():
    """A tela manda o valor do campo, e campo chega como texto."""
    assert _desenhar({"nome": NOME, "nome_size": "20"}) \
        == _desenhar({"nome": NOME, "nome_size": 20})


# --------------------------------------------------------------------------
# O giro
# --------------------------------------------------------------------------

def test_o_nome_rot_deita_e_levanta_o_numero():
    """O angulo se mede pela FORMA da caixa: o PyMuPDF devolve caixa alinhada
    aos eixos, entao texto deitado (0 e 180 graus) da' caixa larga e baixa, e
    texto em pe (90 e 270) da' caixa estreita e alta.
    """
    formas = {}
    for giro in (0, 90, 180, 270):
        x0, y0, x1, y1 = _desenhar({"nome": NOME, "nome_rot": giro})
        formas[giro] = (x1 - x0, y1 - y0)

    for giro in (0, 180):
        largura, altura = formas[giro]
        assert largura > altura * 2, str(giro) + " graus devia sair deitado"
    for giro in (90, 270):
        largura, altura = formas[giro]
        assert altura > largura * 2, str(giro) + " graus devia sair em pe"

    # 0 e 180 sao a mesma linha ao contrario; 90 e 270 idem. As caixas tem o
    # mesmo tamanho, e e' a posicao que muda.
    assert formas[0] == pytest.approx(formas[180], abs=0.01)
    assert formas[90] == pytest.approx(formas[270], abs=0.01)


def test_o_giro_180_corre_para_o_lado_contrario_do_0():
    """Prova que o giro nao e' so' a forma da caixa. Com `topo`, o numero de 0
    grau sobe da linha de base e o de 180 desce dela: as duas caixas ficam na
    mesma faixa horizontal e em faixas verticais distintas. Se o `morph` deixasse
    de girar, seriam identicas."""
    zero = _desenhar({"nome": NOME, "nome_pos": "topo", "nome_rot": 0})
    meia_volta = _desenhar({"nome": NOME, "nome_pos": "topo", "nome_rot": 180})
    assert zero[0] == pytest.approx(meia_volta[0], abs=1.0)
    assert zero[1] < meia_volta[1]


@pytest.mark.parametrize("valor", [45, 89, 360, -90, "abc", "", None, 91.5])
def test_giro_invalido_cai_nos_90_graus_de_sempre(valor):
    assert _desenhar({"nome": NOME, "nome_rot": valor}) == _desenhar({"nome": NOME})


def test_giro_em_texto_vale():
    assert _desenhar({"nome": NOME, "nome_rot": "180"}) \
        == _desenhar({"nome": NOME, "nome_rot": 180})


# --------------------------------------------------------------------------
# Os casos que nao desenham
# --------------------------------------------------------------------------

def test_item_sem_nome_nao_desenha_nada():
    """A folha de um modelo so' nao leva numero de conferencia: nao ha o que
    separar depois do corte."""
    for item in ({}, {"nome": ""}, {"nome": None},
                 {"nome": "", "nome_pos": "topo", "nome_size": 20}):
        doc, pagina = _pagina()
        try:
            engine._desenhar_numero_do_modelo(pagina, item, FX, FY, _Cfg())
            assert pagina.get_text().strip() == "", item
        finally:
            doc.close()


def test_payload_torto_nao_levanta_excecao():
    """O motor roda na estacao, sem ninguem olhando o terminal. Payload torto
    tem de virar padrao, nunca uma folha que nao sai."""
    doc, pagina = _pagina()
    try:
        engine._desenhar_numero_do_modelo(
            pagina,
            {"nome": NOME, "nome_size": "abc", "nome_pos": "diagonal", "nome_rot": 45},
            FX, FY, _Cfg())
        assert _caixa_do_nome(pagina) == _desenhar({"nome": NOME})
    finally:
        doc.close()


# --------------------------------------------------------------------------
# Um lugar so' no codigo
# --------------------------------------------------------------------------

def _ler(rel):
    with io.open(os.path.join(RAIZ, rel), encoding="utf-8") as f:
        return f.read()


def test_o_desenho_do_numero_existe_num_lugar_so():
    """A razao de a funcao existir.

    O bloco vivia copiado em tres pontos do motor. Enquanto for um so', a regra
    da frente e' a mesma do verso e a da folha combinada. Este teste cai no
    minuto em que alguem colar o desenho de volta em algum ramo.
    """
    fonte = _ler("engine.py")

    assert fonte.count("def _desenhar_numero_do_modelo(") == 1
    assert fonte.count("_desenhar_numero_do_modelo(temp_page") == 3, (
        "os tres pontos de desenho deixaram de chamar a funcao comum"
    )
    # As marcas do bloco antigo. Nenhuma pode voltar ao motor.
    for marca in ("str(arte_nome).zfill(6)", "nome_font_size = 14",
                  "_nome_insert_kwargs", "nome_x = _fx"):
        assert marca not in fonte, (
            "'" + marca + "' voltou ao motor: o desenho foi copiado de novo"
        )
    # O corpo do desenho aparece uma vez so'.
    assert fonte.count(".zfill(6)") == 1
    assert fonte.count("insert_text(pivo, texto") == 1


def test_o_multi_map_leva_os_tres_campos_novos():
    """Sem estas chaves a folha combinada ignoraria os controles da tela: o
    payload chega ao motor, mas cada item do `multi_map` e' montado a mao, chave
    por chave."""
    fonte = _ler("engine.py")
    for chave in ("nome_size", "nome_pos", "nome_rot"):
        assert '"' + chave + '": art.get("' + chave + '")' in fonte, (
            "o item do multi_map perdeu o " + chave
        )


def test_o_app_repassa_o_payload_inteiro():
    """Nada a mudar no `app.py`, e este teste diz por que: ele nunca listou os
    campos da arte um a um — repassa `multi_artes` inteiro ao config. Se algum
    dia passar a filtrar, os tres campos novos sumiriam no caminho e a tela
    pareceria quebrada sem nenhum erro."""
    app = _ler("app.py")
    assert "nome_color" not in app, (
        "o app.py comecou a mexer nos campos do nome — os tres campos novos "
        "precisam entrar la' tambem"
    )
    assert "multi_artes=multi_artes_list" in app


# --------------------------------------------------------------------------
# No papel, pelo motor inteiro
# --------------------------------------------------------------------------

FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 1,
    "rows": 1,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}
SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300, "file_format": "pdf"}

# A celula unica sai centrada na folha — e' o que `start_x`/`start_y` fazem.
CELL_X0 = (300 * MM2PT - 100 * MM2PT) / 2
CELL_Y0 = (300 * MM2PT - 50 * MM2PT) / 2
CELL_W = 100 * MM2PT
CELL_H = 50 * MM2PT


def _impor(tmp_path, arte_extra):
    """Roda o motor de verdade com uma arte so' e devolve a caixa do numero."""
    arte = tmp_path / "arte.pdf"
    doc = fitz.open()
    doc.new_page(width=CELL_W, height=CELL_H)
    doc.save(str(arte))
    doc.close()

    saida = str(tmp_path / "folha.pdf")
    arte_cfg = {"qtd": "1", "local_path": str(arte), "pdf_url": "local_file",
                "nome": NOME}
    arte_cfg.update(arte_extra)
    cfg = ImpositionConfig(
        base_file="", out_pdf=saida, formato=FORMATO, numeracao=None, saida=SAIDA,
        seq_start=1, seq_end=1, seq_increment=1, layout_schema="multi_artes",
        multi_artes=[arte_cfg],
    )
    ImpositionEngine(cfg).process()

    doc = fitz.open(saida)
    try:
        return _caixa_do_nome(doc[0])
    finally:
        doc.close()


def test_a_folha_impressa_traz_o_numero_no_lugar_de_sempre(tmp_path):
    """O caminho inteiro, do payload ao PDF, com os padroes.

    A celula unica fica no centro da folha, entao da' para dizer onde o numero
    tem de cair: a linha de base a 14 pt da borda esquerda da celula, e o texto
    subindo do ponto que o centra na altura. E' a mesma conta de antes de
    03/09/2026, agora conferida no arquivo que a impressora recebe.
    """
    x0, y0, x1, y1 = _impor(tmp_path, {})
    largura = _largura_padrao()

    assert y1 == pytest.approx(CELL_Y0 + (CELL_H + largura) / 2, abs=0.5)
    assert y0 == pytest.approx(y1 - largura, abs=1.0)
    assert CELL_X0 - 5 < x0 < CELL_X0 + 14


def test_a_folha_impressa_obedece_aos_tres_campos(tmp_path):
    """Os campos da tela chegam ao papel pelo `multi_map`. Sem as chaves novas
    la', esta folha sairia igual a de cima e ninguem notaria."""
    x0, y0, x1, y1 = _impor(
        tmp_path, {"nome_pos": "base", "nome_rot": 0, "nome_size": 20})

    # Deitado (giro 0): caixa larga e baixa.
    assert (x1 - x0) > (y1 - y0) * 2
    # No corpo pedido: a caixa mede o que 20 pt medem.
    assert (x1 - x0) == pytest.approx(_largura_padrao(20.0), abs=1.5)
    # Encostado na base (linha de base a 20 pt dela) e centrado na largura.
    assert y1 == pytest.approx(CELL_Y0 + CELL_H - 20, abs=8)
    assert (x0 + x1) / 2 == pytest.approx(CELL_X0 + CELL_W / 2, abs=1.5)
