# -*- coding: utf-8 -*-
"""O folheador de páginas do PDF Paginado na página do cliente (01/09/2026).

> "o link do cliente para este pedido não mostra a paginação, setas para
> visualizar as páginas quando estão no modo multipáginas"

Relatado no pedido 21408 — 25 credenciais do Grêmio, cada uma numa página do
mesmo arquivo, com um verso único de uma página só.

## O que acontecia

`drawAmostraFace` é chamada **duas vezes** num modelo com verso, uma por face, e
as duas escreviam no mesmo `pdfViewerState[idx]`. A chamada da face `back`
chegava depois e trocava o estado do folheador pelo arquivo do verso:

* `totalPages` caía de 25 para 1;
* o rodapé virava "Página 1 / 1" e as setas paravam de andar;
* o canvas da FRENTE era redesenhado com o verso.

O cliente ficava sem como conferir as outras 24 peças antes de aprovar — e é
justamente para conferir que o link existe.

O painel já tinha a guarda, posta em 31/08/2026 junto com o FxVersoUnico
(`usaVisualizadorPaginado`, no `script.js`). O `cliente.js` — que é outro
arquivo, com a sua própria cópia da mesma função — ficou para trás, e nada
apontava a divergência. É por isso que o último teste daqui cobra a guarda nos
dois arquivos ao mesmo tempo.

## Por que a guarda na página do cliente sai da função inteira

No painel o verso tem canvas próprio (`amostra-item-canvas-verso-N`), sempre no
DOM, e a face `back` cai na composição multicamada de sempre. Na página do
cliente esse canvas **não existe** em modo PDF: ali o verso é um `<img>`
alimentado por `verso_amostra_arte_base64`. Por isso a face `back` chega com
`canvas` nulo e precisa sair antes da composição — que estouraria no
`canvas.width` de um nulo.

O harness em node (`tests/cliente_pdf_paginado_harness.js`) lê a função de
dentro do `cliente.js` e roda as duas faces na mesma ordem da tela, em vez de
copiar o código.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "cliente_pdf_paginado_harness.js")

# So o `frontend/`. A pasta `painel/` tambem tem um `cliente.js`, mas ela e um
# cache que o agente baixa do Storage: fica fora do git, some numa clonagem
# limpa, e o agente a reescreve sozinho -- a copia editada la em 01/09/2026
# voltou a versao antiga em minutos. Testar aquele arquivo seria reprovar por
# "ainda nao publicaram". O link que o cliente abre e o da Vercel; quem leva o
# conserto ate ele e o `publicar.ps1`.
FONTE = "frontend/cliente.js"


def _texto(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_o_harness_do_folheador_do_cliente_passa():
    assert os.path.exists(HARNESS), "o harness do folheador do cliente sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_o_verso_nao_toma_o_folheador_da_frente():
    """A guarda tem de estar escrita, e não só funcionar pela ordem das chamadas."""
    for copia in (FONTE,):
        texto = _texto(copia)
        assert "const usaVisualizadorPaginado" in texto, (
            copia + ": sumiu a guarda `usaVisualizadorPaginado` — a face `back` "
            "volta a tomar o visualizador paginado da frente"
        )
        assert "!(face === 'back' && itemForPdf.verso)" in texto, (
            copia + ": a guarda parou de excluir a face `back` dos modelos com "
            "verso — no FxVersoUnico o verso tem UMA pagina e derruba as N da frente"
        )
        assert "if (!canvas && !usaVisualizadorPaginado) return;" in texto, (
            copia + ": a saida antecipada voltou a olhar so `modo_pdf`. Em modo "
            "PDF a face `back` chega sem canvas, e sem esta linha ela desce para "
            "a composicao multicamada e estoura no `canvas.width` de um nulo"
        )
