# -*- coding: utf-8 -*-
"""Uma fonte só para o desenho de QR — todas as janelas recebem o mesmo pixel.

Este projeto tem várias janelas que desenham o mesmo ingresso: o editor de
numeração, o card do pedido, a janela de amostra, o link do cliente e a prévia
de imposição do Painel de Produção. Elas moram em `script.js`, `pedido.js`,
`cliente.js` e `criador-arte.js`.

Essa divisão custou dois defeitos de produção na mesma semana, sempre pelo mesmo
motivo — alguém acrescenta um elemento e esquece um dos desenhadores:

- o QR Ideal nasceu na parte 1 e o `pedido.js` nunca soube dele: o papel saía
  com o elemento e a prévia do Painel não mostrava nada;
- antes disso o `fonte-canvas.js` ficou fora da lista que as estações baixam, e
  o painel de todas elas congelou.

Por isso o desenho passou a viver em `frontend/qr-canvas.js`. Estes testes
cobram que ele continue sendo o único.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULO = os.path.join(RAIZ, "frontend", "qr-canvas.js")

# A biblioteca VERSIONADA, que e a que o navegador carrega. Antes daqui este
# arquivo pedia `require('qrcode-generator')` do npm, que nao esta instalado —
# entao o teste mais importante dele, o que confere se o QR desenhado e legivel,
# pulava em silencio desde que foi escrito. Teste que so pula nao prende nada.
BIBLIOTECA = os.path.join(RAIZ, "frontend", "qrcode-generator.min.js")


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_existe_uma_definicao_so_de_renderQRCodeOnCtx():
    """Duas copias divergem, e divergencia entre desenhadores e o defeito."""
    donos = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if not nome.endswith(".js"):
            continue
        if "function renderQRCodeOnCtx" in _ler(f"frontend/{nome}"):
            donos.append(nome)
    assert donos == ["qr-canvas.js"], f"mais de um dono do desenho de QR: {donos}"


def test_o_desenho_do_qr_ideal_tambem_tem_um_dono_so():
    donos = []
    for nome in os.listdir(os.path.join(RAIZ, "frontend")):
        if nome.endswith(".js") and "function desenharQRIdeal" in _ler(f"frontend/{nome}"):
            donos.append(nome)
    assert donos == ["qr-canvas.js"], f"mais de um dono do QR Ideal: {donos}"


def test_o_modulo_so_depende_da_biblioteca_de_qr():
    texto = _ler("frontend/qr-canvas.js")
    assert "import " not in texto
    assert "require(" not in texto
    assert "qrcode(" in texto


@pytest.mark.parametrize("pagina", ["frontend/index.html", "frontend/producao.html",
                                   "frontend/cliente.html"])
def test_o_modulo_carrega_ANTES_de_quem_desenha(pagina):
    """Ordem importa: `script.js` e `pedido.js` chamam o desenho no arranque."""
    texto = _ler(pagina)
    assert "qr-canvas.js" in texto, f"{pagina} nao carrega o modulo"
    pos_modulo = texto.index("qr-canvas.js")
    for consumidor in ("script.js?v=", "pedido.js?v=", "cliente.js?v="):
        if consumidor in texto:
            assert pos_modulo < texto.index(consumidor), (
                f"{pagina} carrega {consumidor} antes do qr-canvas.js"
            )


def test_o_modulo_esta_na_lista_que_as_estacoes_baixam():
    """Fora dela a estacao da 404 e o painel congela — o defeito da v559."""
    import security_config
    assert "qr-canvas.js" in security_config.PAINEL_ARQUIVOS


def test_o_script_sobrevive_sem_o_modulo():
    """Janela de sincronizacao: agente antigo baixa o HTML novo sem o modulo.

    Sem guarda, TODA janela que desenha um ingresso lancaria ReferenceError e o
    editor inteiro pararia de pintar.
    """
    texto = _ler("frontend/script.js")
    assert "typeof window.renderQRCodeOnCtx !== 'function'" in texto


def test_a_previa_do_painel_desenha_QR_de_verdade():
    """Ate 14/08 ela desenhava tres marcas de canto no lugar do QR."""
    texto = _ler("frontend/pedido.js")
    assert "window.renderQRCodeOnCtx(ctx, val_str" in texto
    assert "window.desenharQRIdeal(" in texto


def test_o_QR_desenhado_e_legivel_de_verdade():
    """Nao basta pintar: o codigo tem de voltar a sair na leitura.

    Roda o modulo num Node com um canvas de mentira que grava a matriz, e
    confere contra a propria biblioteca. Se o desenho perder um modulo, o
    ingresso e recusado na portaria — e so ali alguem descobre.
    """
    script = r"""
      globalThis.window = globalThis;
      const qrlib = require(%s);
      globalThis.qrcode = qrlib.qrcode || qrlib;
      globalThis.Image = function () { return { complete: false, naturalWidth: 0 }; };
      require(%s);

      const N = 200;
      const grade = Array.from({length: N}, () => new Array(N).fill(0));
      const ctx = {
        fillStyle: '', strokeStyle: '', lineWidth: 0,
        fillRect(x, y, w, h) {
          const escuro = this.fillStyle !== '#ffffff';
          for (let i = Math.max(0, Math.round(y)); i < Math.min(N, Math.round(y + h)); i++)
            for (let j = Math.max(0, Math.round(x)); j < Math.min(N, Math.round(x + w)); j++)
              grade[i][j] = escuro ? 1 : 0;
        },
        strokeRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, fill() {},
        drawImage() {}, translate() {}, rotate() {},
      };

      const TEXTO = '06581TZHH1ZG3';
      renderQRCodeOnCtx(ctx, TEXTO, 100, 100, 180, '#000000');

      // A matriz que a biblioteca produz para o mesmo texto
      const qr = qrcode(0, 'L'); qr.addData(TEXTO); qr.make();
      const n = qr.getModuleCount();
      // Margem ZERO desde 17/08/2026: o papel nunca teve quiet zone dentro da
      // caixa, e a tela punha 2 modulos — o QR aparecia menor do que o impresso.
      // Ver tests/test_qr_do_tamanho_do_papel.py.
      const margem = 0, total = n + margem * 2, cell = 180 / total;

      let iguais = 0, diferentes = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const px = Math.round(10 + (c + margem) * cell + cell / 2);
        const py = Math.round(10 + (r + margem) * cell + cell / 2);
        const pintado = grade[py][px] === 1;
        if (pintado === qr.isDark(r, c)) iguais++; else diferentes++;
      }
      console.log(JSON.stringify({ modulos: n * n, iguais, diferentes }));
    """ % (json.dumps(BIBLIOTECA), json.dumps(MODULO))

    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, cwd=RAIZ)
    assert r.returncode == 0, r.stderr[:400]
    d = json.loads(r.stdout.strip())
    assert d["diferentes"] == 0, f"o desenho divergiu da biblioteca: {d}"
    assert d["modulos"] > 100


@pytest.mark.parametrize("pagina", ["frontend/index.html", "frontend/producao.html",
                                    "frontend/cliente.html"])
def test_a_pagina_carrega_a_biblioteca_QUE_O_DESENHO_USA(pagina):
    """Duas bibliotecas de QR circulam neste projeto, e elas nao sao a mesma.

    - `qrcodejs` (davidshimjs) expoe `QRCode` maiusculo e monta um <div>;
    - `qrcode-generator` expoe `qrcode(0, 'L')` e da a matriz de modulos.

    O desenho no canvas usa a SEGUNDA. Em 14/08/2026 o `producao.html` so tinha
    a primeira: `renderQRCodeOnCtx` caia no catch e pintava o quadrado vermelho
    de erro no lugar do QR. Nenhum teste de arquivo pegaria isso — so abrir a
    pagina num navegador, que foi como apareceu.
    """
    assert "qrcode-generator" in _ler(pagina), (
        f"{pagina} nao carrega a qrcode-generator; o QR sairia como erro"
    )
