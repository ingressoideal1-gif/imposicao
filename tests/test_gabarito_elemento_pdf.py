# -*- coding: utf-8 -*-
"""O PDF Gabarito com elemento PDF: a página é do modelo, o arquivo vai no lugar dele.

## O defeito, relatado pelo usuário em 25/08/2026

"Na lista de arte, ao editar um pedido, quando uma numeração possui um PDF como
elemento, ao tentar baixar o PDF gabarito, não está levando o gabarito correto.
Está levando somente o elemento PDF da numeração."

Estava certo. O `exportarPdfGabarito` fazia `copyPages(arquivoDoElemento, [0])` e
usava essa página COMO a página do modelo — o arquivo do elemento virava a
página inteira, e a posição e o tamanho dele na arte eram ignorados.

Medido com os arquivos que estão no banco:

    001 - Padrão Ideal (Triband)   formato 245,00 x 20,00 mm
                                   página que saía: 14,76 x 20,30 mm
    1000547 (pedido 21146)         formato 105,00 x 148,00 mm
                                   página que saía: 105,71 x 146,21 mm

O primeiro é o que mostra o tamanho do estrago: o elemento é a logo
`Logo_Tri.pdf`, de 10,18 x 14 mm, encostada na ponta direita da pulseira. O
gabarito de uma pulseira de 24,5 cm saía com 1,5 cm — só a logo. E a numeração
rasterizada era desenhada nessa página com 245 mm de largura, 16,6x maior que o
papel, então tudo transbordava.

O botão vizinho, PDF Arte, sempre acertou: ele faz `copiedPage.setSize(ptW, ptH)`
depois de copiar. Era uma linha de diferença entre os dois.

## Por que não bastou o `setSize`

O `setSize` conserta o tamanho da página, mas deixaria a logo da Triband no canto
de baixo à esquerda, no tamanho original — porque a página passa a ser outra, e o
conteúdo continua ancorado onde estava no arquivo. O certo é o que o motor de
impressão já faz: página em branco no tamanho do modelo e o arquivo colado no
retângulo do elemento, vetorial, sem distorção (`show_pdf_page` com
`keep_proportion=True`).

## O que estas conferências prendem

A geometria mora em `caixaDoElementoPdfNaPagina`, no `script.js`, e o harness a
exercita contra os dois casos reais acima. O resto prende as decisões que são
fáceis de desfazer sem perceber: a página nunca mais vir do arquivo, TODOS os
elementos PDF entrarem (e não só o primeiro), o marcado como Layout continuar
fora, e o raster não redesenhar por cima o que já entrou vetorial — que seria
rasterizar a arte do cliente, proibido neste projeto.
"""
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "gabarito_elemento_pdf_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")


def _corpo_do_export():
    with open(SCRIPT, encoding="utf-8") as f:
        texto = f.read()
    i = texto.index("async function exportarPdfGabarito(")
    return texto[i:texto.index("\n}", i) + 2]


def test_o_harness_do_gabarito_passa():
    assert os.path.exists(HARNESS), "o harness do gabarito sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_a_pagina_do_gabarito_nunca_vem_do_arquivo_do_elemento():
    """O defeito relatado, na sua forma mais curta: `copyPages` neste export."""
    corpo = _corpo_do_export()
    assert "copyPages(" not in corpo, (
        "o exportarPdfGabarito voltou a copiar a pagina do arquivo do elemento — "
        "e isso faz o gabarito de uma Triband de 245 mm sair com 14,76 mm"
    )
    assert "pdfDoc.addPage([ptW, ptH])" in corpo, (
        "a pagina do gabarito tem de nascer no tamanho do modelo"
    )


def test_o_elemento_pdf_entra_vetorial_e_no_lugar_dele():
    corpo = _corpo_do_export()
    assert "embedPage(" in corpo and "drawPage(" in corpo
    assert "caixaDoElementoPdfNaPagina(" in corpo, (
        "a posicao do elemento tem de vir da funcao testada, nao de uma conta solta"
    )


def test_a_geometria_existe_e_e_pura():
    """Pura para poder ser testada em node — sem window, sem canvas, sem rede."""
    with open(SCRIPT, encoding="utf-8") as f:
        texto = f.read()
    i = texto.index("\nfunction caixaDoElementoPdfNaPagina(")
    corpo = texto[i:texto.index("\n}", i) + 2]
    for proibido in ("document.", "window.", "await ", "fetch("):
        assert proibido not in corpo, (
            "caixaDoElementoPdfNaPagina precisa continuar pura (achei %r)" % proibido
        )


def test_todos_os_elementos_pdf_entram():
    """Uma numeracao com dois PDFs impressos perdia o segundo: o codigo antigo
    fazia `pdfEls.find(...)` e parava no primeiro."""
    corpo = _corpo_do_export()
    assert "for (const el of pdfEls)" in corpo
    assert ".find(e => !elementoSoLayout(e))" not in corpo


def test_o_elemento_de_layout_continua_fora_do_pdf_de_producao():
    corpo = _corpo_do_export()
    assert "!elementoSoLayout(e)" in corpo, (
        "o elemento marcado como Layout existe so para conferencia na tela"
    )


def test_o_raster_nao_redesenha_o_que_ja_entrou_vetorial():
    """Rasterizar a arte vetorial do cliente e proibido neste projeto. Deixar os
    elementos PDF no canvas os desenharia de novo, em imagem, por cima do vetor."""
    corpo = _corpo_do_export()
    assert "e.type !== 'PDF'" in corpo, (
        "a mascara rasterizada tem de sair sem os elementos PDF"
    )
    assert re.search(r"criarCanvasNumeracaoRasterizada\(numParaRaster,", corpo), (
        "o raster tem de receber a numeracao sem os PDFs, e nao a original"
    )


def test_a_opacidade_do_elemento_e_respeitada():
    """O engine usa `_opacidade_arte(el)` ao colar; a tela tem de combinar."""
    corpo = _corpo_do_export()
    assert "opacity: opacidadeDoElemento(el)" in corpo


def test_o_registro_legado_continua_saindo():
    """Numeracao antiga guarda a arte na coluna `pdf_content`, sem elemento. Ali
    ela sempre foi o fundo do modelo inteiro."""
    corpo = _corpo_do_export()
    assert "num.pdf_content" in corpo


def test_o_pdf_arte_continua_ajustando_a_pagina():
    """O botao vizinho ja acertava, e e a referencia deste conserto. Se um dia
    ele perder o `setSize`, cai no mesmo defeito por outro caminho."""
    with open(SCRIPT, encoding="utf-8") as f:
        texto = f.read()
    i = texto.index("async function exportarPdfSomenteArte(")
    corpo = texto[i:texto.index("\nasync function", i + 10)]
    assert "setSize(ptW, ptH)" in corpo


# ═════════════════════════════════════════════════════════════════════════════
# O gabarito tem de pousar o elemento ONDE O MOTOR o imprime.
#
# Estas conferências são as que valem: as de cima prendem o texto do código,
# estas medem o papel. O motor (`engine._render_element`) é a referência — é ele
# que gera o PDF que vai para a impressora. Se o gabarito discordar dele, o
# operador confere uma coisa e imprime outra, que é o defeito de origem.
#
# A arte de teste é um retângulo preenchido de ponta a ponta, então a mancha de
# tinta na página É o retângulo onde a arte foi colada. Medimos essa mancha nos
# dois caminhos e comparamos, em milímetros.
# ═════════════════════════════════════════════════════════════════════════════
import base64
import json

import fitz
import pytest

from engine import ImpositionEngine, MM2PT

PT_MM = 25.4 / 72


def _arte_b64(w_pt, h_pt):
    """Retângulo vermelho ocupando a página inteira da arte."""
    doc = fitz.open()
    pg = doc.new_page(width=w_pt, height=h_pt)
    pg.draw_rect(pg.rect, color=None, fill=(1, 0, 0))
    dados = doc.tobytes()
    doc.close()
    return base64.b64encode(dados).decode("ascii")


def _mancha_mm(page):
    """Caixa da tinta vermelha na página, em mm, medida do canto inferior
    esquerdo — o mesmo referencial que o pdf-lib usa."""
    pix = page.get_pixmap(dpi=300, colorspace=fitz.csRGB, alpha=False)
    esc = 25.4 / 300.0
    xs, ys = [], []
    for y in range(pix.height):
        for x in range(pix.width):
            r, g, b = pix.pixel(x, y)
            if r > 150 and g < 100 and b < 100:
                xs.append(x)
                ys.append(y)
    assert xs, "a arte nao apareceu na pagina do motor"
    alt_mm = pix.height * esc
    return (min(xs) * esc, alt_mm - (max(ys) + 1) * esc,
            (max(xs) + 1 - min(xs)) * esc, (max(ys) + 1 - min(ys)) * esc)


def _caixa_do_js(el, fmt, nat_w_pt, nat_h_pt, pt_w, pt_h):
    """Roda a função do `script.js` em node e devolve a caixa em mm."""
    codigo = r"""
const fs = require('fs');
const S = fs.readFileSync(process.argv[1], 'utf8');
const i = S.indexOf('\nfunction caixaDoElementoPdfNaPagina(');
const corpo = S.slice(i, S.indexOf('\n}', i) + 2);
const f = new Function(corpo + '\nreturn caixaDoElementoPdfNaPagina;')();
const a = JSON.parse(process.argv[2]);
console.log(JSON.stringify(f(a.el, a.fmt, a.natW, a.natH, a.ptW, a.ptH)));
"""
    entrada = json.dumps({"el": el, "fmt": fmt, "natW": nat_w_pt,
                          "natH": nat_h_pt, "ptW": pt_w, "ptH": pt_h})
    r = subprocess.run(["node", "-e", codigo, SCRIPT, entrada], cwd=RAIZ,
                       timeout=120, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    assert r.returncode == 0, (r.stdout or "") + (r.stderr or "")
    c = json.loads(r.stdout.strip())
    return (c["x"] * PT_MM, c["y"] * PT_MM,
            c["width"] * PT_MM, c["height"] * PT_MM)


CASOS = [
    # (nome, formato mm, elemento mm, arte pt)
    ("triband: logo na ponta direita",
     (245.0, 20.0), dict(x_mm=237.61, y_mm=10.0, width_mm=10.18, height_mm=14.0),
     (14.76 / PT_MM, 20.30 / PT_MM)),
    ("credencial: a arte inteira",
     (105.0, 148.0), dict(x_mm=52.5, y_mm=75.2, width_mm=105.71, height_mm=146.21),
     (105.71 / PT_MM, 146.21 / PT_MM)),
    ("arte mais larga que a caixa: encaixa pela largura",
     (100.0, 60.0), dict(x_mm=30.0, y_mm=20.0, width_mm=40.0, height_mm=40.0),
     (200.0, 50.0)),
    ("arte mais alta que a caixa: encaixa pela altura",
     (100.0, 60.0), dict(x_mm=70.0, y_mm=40.0, width_mm=40.0, height_mm=40.0),
     (50.0, 200.0)),
]


@pytest.mark.parametrize("nome,fmt_mm,el_mm,arte_pt", CASOS,
                         ids=[c[0] for c in CASOS])
def test_o_gabarito_poe_o_elemento_onde_o_motor_poe(nome, fmt_mm, el_mm, arte_pt):
    fmt_w, fmt_h = fmt_mm
    pt_w, pt_h = fmt_w * MM2PT, fmt_h * MM2PT
    b64 = _arte_b64(*arte_pt)

    # ── o motor, que é a referência ──
    doc = fitz.open()
    page = doc.new_page(width=pt_w, height=pt_h)
    el_engine = {
        "type": "PDF", "pdf_content": b64, "rotation": 0,
        "_x": el_mm["x_mm"] * MM2PT, "_y": el_mm["y_mm"] * MM2PT,
        "width_mm": el_mm["width_mm"], "height_mm": el_mm["height_mm"],
    }
    eng = object.__new__(ImpositionEngine)
    eng._url_cache = {}
    eng._render_element(page, el_engine, 0, 0, 1, {})
    motor = _mancha_mm(fitz.open(stream=doc.tobytes(), filetype="pdf")[0])
    doc.close()

    # ── o gabarito ──
    el_js = {"type": "PDF", "pdf_content": "x", "rotation": 0, **el_mm}
    gx, gy, gw, gh = _caixa_do_js(el_js, {"width_mm": fmt_w, "height_mm": fmt_h},
                                  arte_pt[0], arte_pt[1], pt_w, pt_h)

    # Recortado na página, porque é assim que se compara com tinta medida: um
    # elemento pode sangrar para fora de propósito — o da credencial 1000547 tem
    # 105,71 mm numa página de 105 e passa 0,35 mm de cada lado — e o que está
    # fora do papel não deixa pixel para ninguém medir. Sem o recorte o teste
    # acusaria o gabarito de errar justamente onde ele acerta.
    x0, y0 = max(0.0, gx), max(0.0, gy)
    x1, y1 = min(fmt_w, gx + gw), min(fmt_h, gy + gh)
    gabarito = (x0, y0, x1 - x0, y1 - y0)

    rotulos = ("x", "y", "largura", "altura")
    for r, m, g in zip(rotulos, motor, gabarito):
        assert abs(m - g) < 0.25, (
            "%s: o gabarito discorda do motor em %s — motor %.2f mm, gabarito %.2f mm"
            % (nome, r, m, g)
        )
