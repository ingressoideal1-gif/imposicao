# -*- coding: utf-8 -*-
"""O QR ocupa na tela os mesmos milimetros que ocupa no papel.

## O defeito, relatado em 17/08/2026

Um elemento QR de 15 mm aparecia na tela com um contorno branco em volta, e o
codigo desenhado menor do que os 15 mm. No papel saia com os 15 mm exatos.

## A conta

O desenho da tela punha uma "quiet zone" de 2 modulos DENTRO da caixa do
elemento. Num QR de 21 modulos, sobrava para o codigo:

    21 / (21 + 2 + 2) = 84 %   ->   12,6 mm dentro de uma caixa de 15 mm

O motor nao poe faixa nenhuma (`border=0` no `_generate_qr`), e conferido no PNG
que ele gera: ha modulo escuro encostando na borda de cima e na da esquerda. Ou
seja, o papel usa a caixa inteira.

Duas reguas de novo, como nas fontes: a tela mostrava uma coisa, o papel fazia
outra. Quem decide e o papel.

## Por que tirar da tela, e nao acrescentar ao papel

Porque acrescentar mudaria o que ja sai impresso e esta aprovado — o QR encolheria
para 12,6 mm numa caixa de 15. A margem que o leitor precisa continua existindo:
e o proprio ingresso em volta do elemento, branco, que ja cumpre esse papel hoje
em toda tiragem impressa ate agora.

## Os DOIS tipos

Sao dois elementos, `QR` e `QR_IDEAL`, e os dois passam pelo mesmo desenho:
`desenharQRIdeal` chama `renderQRCodeOnCtx`, e no motor os dois ramos chamam
`_generate_qr`. Estes testes cobram os dois, porque um conserto que so pegasse um
deixaria a divergencia viva na metade das telas.
"""
import io
import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULO = os.path.join(RAIZ, "frontend", "qr-canvas.js")

# A biblioteca que o NAVEGADOR carrega, e nao a do npm. O `tests/test_qr_canvas.py`
# pedia `require('qrcode-generator')`, que nao esta instalado aqui — entao o teste
# mais importante daquele arquivo pulava em silencio desde que foi escrito. Usar o
# arquivo versionado resolve as duas coisas: o teste roda, e roda contra o mesmo
# codigo que desenha na tela do operador.
BIBLIOTECA = os.path.join(RAIZ, "frontend", "qrcode-generator.min.js")


# ─── O papel ────────────────────────────────────────────────────────────────

def test_o_motor_nao_poe_faixa_branca_em_volta_do_qr():
    """O lado que manda. Se um dia isto mudar, a tela tem de mudar junto."""
    import sys
    sys.path.insert(0, RAIZ)
    import engine
    from PIL import Image

    img = Image.open(io.BytesIO(engine._generate_qr("06581TZHH1ZG3", "#000000"))).convert("L")
    largura, altura = img.size
    px = img.load()
    assert any(px[x, 0] < 128 for x in range(largura)), "faixa branca no topo do PNG"
    assert any(px[0, y] < 128 for y in range(altura)), "faixa branca na esquerda do PNG"


# ─── A tela ─────────────────────────────────────────────────────────────────

_HARNESS = r"""
  globalThis.window = globalThis;
  const qrlib = require(%s);
  globalThis.qrcode = qrlib.qrcode || qrlib;
  globalThis.Image = function () { return { complete: false, naturalWidth: 0 }; };
  require(%s);

  const N = 220, X = 100, SZ = 180;      // caixa de 10 a 190
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect(x, y, w, h) {
      if (this.fillStyle === '#ffffff') return;   // o fundo da caixa nao conta
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + h);
    },
    strokeRect() {}, save() {}, restore() {}, beginPath() {}, rect() {},
    roundRect() {}, fill() {}, drawImage() {}, translate() {}, rotate() {},
  };

  %s

  console.log(JSON.stringify({
    esquerda: minX, direita: maxX, topo: minY, baixo: maxY,
    caixa_esq: X - SZ / 2, caixa_dir: X + SZ / 2,
  }));
"""


def _extremos(desenho):
    script = _HARNESS % (json.dumps(BIBLIOTECA), json.dumps(MODULO), desenho)
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=RAIZ)
    assert r.returncode == 0, r.stderr[:500]
    return json.loads(r.stdout.strip())


def _conferir_ocupa_a_caixa(d):
    """Um modulo de folga: o desenho soma 0,35 px para fechar a fresta entre
    modulos vizinhos, e o arredondamento do canvas anda um pixel."""
    assert d["esquerda"] == pytest.approx(d["caixa_esq"], abs=1.0), d
    assert d["topo"] == pytest.approx(d["caixa_esq"], abs=1.0), d
    assert d["direita"] == pytest.approx(d["caixa_dir"], abs=1.0), d
    assert d["baixo"] == pytest.approx(d["caixa_dir"], abs=1.0), d


def test_o_elemento_QR_ocupa_a_caixa_inteira():
    _conferir_ocupa_a_caixa(_extremos(
        "renderQRCodeOnCtx(ctx, '06581TZHH1ZG3', X, X, SZ, '#000000');"))


def test_o_elemento_QR_IDEAL_ocupa_a_caixa_inteira():
    """O irmao. Ele desenha pelo mesmo caminho, e o teste existe para o dia em
    que alguem der a um deles um desenho proprio."""
    _conferir_ocupa_a_caixa(_extremos(
        "desenharQRIdeal(ctx, {}, SZ, '#000000', null, null, 1, { logo: false });\n"
        # Ele desenha centrado na ORIGEM do contexto: quem chama ja transladou
        # ate o centro do elemento. Somar X poe os dois na mesma referencia.
        "  minX += X; maxX += X; minY += X; maxY += X;"))


def test_a_tela_e_o_papel_usam_a_mesma_margem():
    """O guarda contra a volta do defeito: hoje as duas margens sao ZERO, e o
    que nao pode e uma mudar sem a outra."""
    import sys
    sys.path.insert(0, RAIZ)
    import engine
    import inspect

    assert "border=0" in inspect.getsource(engine._generate_qr)

    with open(MODULO, encoding="utf-8") as f:
        tela = f.read()
    assert "var margin = 0;" in tela, "a tela voltou a por quiet zone dentro da caixa"
