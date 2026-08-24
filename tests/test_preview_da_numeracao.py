# -*- coding: utf-8 -*-
"""A coluna Preview da Lista de Numeracoes, pedida em 24/08/2026.

Entre **Nome** e **Tipo** entrou a miniatura da numeracao, e clicar nela abre a
imagem em tamanho grande. A imagem sai de `producao_numeracoes.preview_jpg` --
uma coluna que existia desde a v487, gravada a cada save da numeracao, e que ate
entao **ninguem lia**. O custo foi zero: o GET da lista e `select('*')`, entao a
URL ja vinha em `state.numeracoes`, e o arquivo ja estava no bucket.

O que este harness trava, e por que cada coisa importa:

1. **As duas formas do valor desenham.** Normalmente `preview_jpg` e a URL
   publica de `artes/previews-numeracoes/`, mas volta a ser data URL base64
   quando o upload ao Storage falha. Filtrar por `startsWith('http')` apagaria a
   miniatura justamente de quem ja teve um problema.

2. **A caixa tem a forma do papel.** A escala e `min(200/larg, 60/alt)` e as
   duas medidas saem dela. A primeira versao travava a altura em 54 px e so
   calculava a largura: num bracelete de 245x20 mm a arte virava uma tira fina no
   meio de uma chapa branca alta.

3. **Miniatura que falta ou que nao carrega vira uma marca, nao o icone de
   imagem partida.** O caso real existe: `deleteNumeracao()` nao apaga o `.jpg`
   do bucket, entao uma faxina em `artes/previews-numeracoes/` pode tirar o
   preview de baixo de um registro vivo.

4. **O clique amplia de verdade.** Nao basta haver um `onclick`: a funcao
   chamada tem de morar no `script.js`. A miniatura da prevía do Painel de
   Producao chamava `openClienteLightbox`, que so existe no `cliente.js` -- e o
   `index.html` nao carrega o `cliente.js`. O clique nao fazia nada desde sempre,
   e nenhum teste percebia, porque o que se verificava era o nome no HTML.

5. **As armadilhas velhas da tela continuam de pe** -- em especial que numeracao
   com `Cli_Num` some da lista com a busca vazia e volta ao digitar o numero do
   cliente. Ver `docs/lista_de_numeracoes.md`.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "preview_da_numeracao_harness.js")


def test_o_harness_da_coluna_preview_passa():
    assert os.path.exists(HARNESS), "o harness da coluna Preview sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")
