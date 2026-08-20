# -*- coding: utf-8 -*-
"""O PDF de referencia da cor deixou de vir no catalogo (20/08/2026).

A tabela `producao_cores` guarda o PDF inteiro de cada cor dentro da propria
linha, em base64. Sao 24 linhas e 17,8 MiB de JSON: 16,8 MiB de `pdf_base64` e
`pdf_verso_base64`, 1 MiB de `preview_base64` -- coluna que nenhum arquivo do
frontend le -- e 11,7 KiB de tudo o que a tela realmente mostra.

Enquanto a lista vinha com `select('*')`, abrir o painel baixava 18 MB (13,5
MiB comprimidos) antes de qualquer tela aparecer. Era isso que fazia o parceiro
Vibe esperar ao clicar no link direto do pedido, e o cliente esperar na pagina
de aprovacao: nao era a rede dele nem o tamanho do script.js, era uma consulta
so, medida em 7,6 s no carregamento.

Agora a lista traz so as colunas da tela, e quem vai desenhar a cor chama
`garantirPdfDaCor(cor)`, que busca uma cor por vez e guarda o resultado na
propria linha. O harness recorta essa funcao do script.js e a executa contra um
banco de mentira -- nada aqui e copia da regra.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "pdf_da_cor_harness.js")


def test_o_harness_do_pdf_da_cor_passa():
    assert os.path.exists(HARNESS), "o harness do PDF da cor sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
