# -*- coding: utf-8 -*-
"""A logo do centro do QR Ideal é marca de TELA. Ela não pode chegar ao papel.

O QR Ideal é gerado com correção de erro baixa. Uma logo impressa no meio dele
não é enfeite: ela apaga módulos de verdade, e o efeito só aparece na portaria
do evento, com a fila na porta e o ingresso já entregue ao cliente. Não há
conserto nessa hora — o lote inteiro já foi impresso.

Por isso a logo existe só no desenho do navegador, e há exatamente um canvas do
frontend que vira PDF de produção: o de `criarCanvasNumeracaoRasterizada`, que
o `exportarPdfGabarito` embute na página. Esse é obrigado a pedir
`{ logo: false }`. O caminho de impressão de verdade é o `engine.py`, que nem
sabe que a logo existe — e este arquivo cobra que continue sem saber.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_JS = os.path.join(RAIZ, "frontend", "script.js")
# O desenho do QR Ideal mudou de casa em 14/08/2026: saiu do `script.js` e foi
# para o `qr-canvas.js`, que e a fonte unica de todas as janelas. Este teste
# quase passou a olhar o lugar errado — o stub da rede de seguranca que ficou
# no `script.js` — e teria aprovado um desenho sem logo nenhuma.
QR_CANVAS_JS = os.path.join(RAIZ, "frontend", "qr-canvas.js")
ENGINE_PY = os.path.join(RAIZ, "engine.py")


def _fonte(caminho):
    with open(caminho, encoding="utf-8", errors="replace") as f:
        return f.read()


def _corpo_da_funcao(fonte, assinatura, fim):
    """Recorta o trecho entre a assinatura de uma função e um marcador de fim.

    Recorte grosseiro de propósito: o que importa é isolar a região certa do
    arquivo, não entender JavaScript.
    """
    ini = fonte.index(assinatura)
    return fonte[ini:fonte.index(fim, ini)]


def test_o_canvas_que_vira_pdf_de_producao_pede_o_qr_sem_logo():
    """O único canvas do frontend que vira PDF tem de desligar a logo.

    Se alguém apagar o `{ logo: false }`, o gabarito sai com a logo por cima
    dos módulos e ninguém percebe olhando a tela — na tela ela é para estar lá.
    """
    corpo = _corpo_da_funcao(
        _fonte(SCRIPT_JS),
        "async function criarCanvasNumeracaoRasterizada",
        "return numCanvas.toDataURL",
    )
    assert "desenharQRIdeal" in corpo, (
        "a rasterizacao do gabarito deixou de desenhar QR Ideal — se o desenho "
        "mudou de lugar, este teste precisa acompanhar"
    )
    assert re.search(r"logo\s*:\s*false", corpo), (
        "criarCanvasNumeracaoRasterizada gera PDF de producao e precisa chamar "
        "desenharQRIdeal com { logo: false } — a logo impressa apaga modulos do "
        "codigo e o ingresso e recusado na portaria"
    )


def test_o_desenho_padrao_do_qr_ideal_leva_a_logo():
    """O outro lado: na tela a logo tem de aparecer sem ninguém pedir.

    O padrão é desenhar; só quem gera PDF é que desliga. Invertido, a logo
    sumiria de todas as janelas e o operador perderia a marca que identifica o
    elemento.
    """
    corpo = _corpo_da_funcao(
        _fonte(QR_CANVAS_JS),
        "function desenharQRIdeal(",
        "\n    }",
    )
    assert "desenharLogoNoQrIdeal" in corpo
    assert re.search(r"opts\s*\.\s*logo\s*!==\s*false", corpo), (
        "a logo tem de ser o padrao: so quem passa { logo: false } fica sem ela"
    )


def test_o_desenho_do_qr_ideal_tem_um_dono_so():
    """A guarda que impede este arquivo de voltar a olhar o lugar errado.

    O `script.js` guarda um stub de `desenharQRIdeal` para a janela em que o
    modulo ainda nao chegou a estacao. Esse stub NAO desenha logo — e e certo
    que nao desenhe. Se um dia a funcao de verdade voltar para la, este teste
    quebra e obriga a decidir qual das duas manda.
    """
    fonte_script = _fonte(SCRIPT_JS)
    assert "function desenharQRIdeal(" not in fonte_script, (
        "o desenho do QR Ideal voltou ao script.js; o dono e o qr-canvas.js"
    )
    assert "function desenharQRIdeal(" in _fonte(QR_CANVAS_JS)


def test_o_qr_ideal_sai_na_cor_do_elemento_e_sem_transparencia():
    """Preto 100%, ou a cor escolhida — nunca desbotado.

    A primeira versao desenhava o exemplo a 30% de opacidade e escrevia
    "exemplo" embaixo dele. O usuario pediu o contrario: o desenho tem de sair
    igual ao que vai ao papel, para dar para conferir tamanho, posicao e cor. O
    aviso de que aquilo e um exemplo ficou no painel de propriedades, em texto.
    """
    corpo = _corpo_da_funcao(
        _fonte(SCRIPT_JS),
        "window.desenharQRIdeal = function",
        "\n};",
    )
    assert "globalAlpha" not in corpo, (
        "o QR Ideal nao pode ser desenhado com transparencia: a cor mostrada "
        "tem de ser a cor que sai impressa"
    )
    assert not re.search(r"fillText\(\s*['\"]exemplo", corpo, re.I), (
        "o rotulo 'exemplo' desenhado sobre o QR foi removido a pedido do "
        "usuario — quem avisa e o painel de propriedades"
    )
    assert re.search(r"renderQRCodeOnCtx\([^)]*color", corpo), (
        "o QR Ideal tem de ser pintado com a cor recebida do elemento"
    )


def test_o_motor_de_impressao_so_poe_o_proprio_qr_no_papel():
    """A garantia de fundo, e a que realmente importa.

    Todo trabalho impresso passa pelo engine.py — nao pelo canvas do navegador.
    Enquanto a unica imagem que o ramo do QR Ideal insere for o proprio codigo,
    nenhum ingresso sai com marca por cima, por mais que o frontend erre.
    """
    ramo = _corpo_da_funcao(
        _fonte(ENGINE_PY),
        'elif t == "QR_IDEAL":',
        'elif t == "BARCODE":',
    )
    inseridas = re.findall(r"insert_image\(([^)]*)\)", ramo)
    assert inseridas, "o ramo QR_IDEAL do engine.py deixou de inserir imagem"
    for chamada in inseridas:
        assert "qr_bytes" in chamada, (
            "o engine.py passou a inserir uma imagem que nao e o proprio QR "
            f"dentro do ramo QR_IDEAL: insert_image({chamada.strip()}) — nada "
            "pode ser impresso por cima dos modulos do codigo"
        )
