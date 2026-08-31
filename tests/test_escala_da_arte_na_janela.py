# -*- coding: utf-8 -*-
"""A escala da arte na janela do modo PDF Multi-Pagina (31/08/2026).

O papel e medido em `test_escala_da_arte.py`, que impoe de verdade e le a tinta.
Este aqui cuida da TELA: o harness recorta `renderPdfViewerPage`,
`escalaDaArteDoModelo`, `formatoDoModelo` e `salvarEscalaDaArte` do proprio
script.js e as roda com um DOM de mentira — nada e copia da regra.

Ele existe porque tela e papel medem com a mesma regua neste projeto. A janela
passou a desenhar a CELULA, com a arte escalada e centralizada dentro dela; se
alguem devolver o canvas ao tamanho da pagina da arte, escalar volta a nao
aparecer na tela e o operador so descobre no papel impresso.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "escala_da_arte_harness.js")


def test_o_harness_da_escala_da_arte_passa():
    assert os.path.exists(HARNESS), "o harness da escala da arte sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
