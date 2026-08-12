---
name: fotos-variaveis
description: Leia ANTES de mexer em foto como dado variável — o elemento FOTO, o Gerenciador de Fotos, frontend/foto-lib.js, frontend/gerenciador-fotos.js, a chave __fotos das linhas do CSV, ou o ramo FOTO do engine.py. Cobre as cinco armadilhas do caminho e por que o agente sai junto.
---

# Antes de mexer em foto variável

Leia **`docs/gerenciador_de_fotos.md`** por inteiro. Ele descreve o caminho todo,
do lote de arquivos ao PVC. Aqui ficam só as armadilhas.

## 1. A geometria existe duas vezes, e as duas têm de concordar

`encaixeFoto()` no `frontend/foto-lib.js` e `_foto_encaixe()` no `engine.py` são
**gêmeas**. Elas decidem qual pedaço da foto aparece na janela. Se divergirem, a
tela promete um enquadramento e o cartão sai com outro — e ninguém descobre até
o cliente reclamar.

Quem mexe numa mexe na outra, e prova nos dois lados:
`tests/test_engine_foto.py` (mede pixel da página rasterizada) e
`tests/foto_lib_harness.js` (mede a geometria em node).

## 2. O cache de imagem é por URL, nunca por elemento

O objeto do elemento é o **mesmo** para todos os modelos que dividem a numeração
— é a armadilha que o `preloadAmostraItemPdfElements` já documenta para PDF. Mas
a foto muda a cada **linha**. Guardar a imagem no elemento (`el._fotoImg`) faria
toda credencial do lote sair com o rosto da primeira pessoa.

## 3. Nos modos paginados, a foto sai da FATIA do modelo

O modo PDF e a amostra do item mostram uma página por linha. A linha é
`linhasDaAmostra(item, num)[pagina - 1]`, **não** `state.csvData[pagina - 1]`. Um
modelo cuja fatia começa na linha 601 estamparia o rosto da pessoa 1. O texto
variável já tinha levado essa correção; a foto nasceu com ela.

## 4. `__fotos` é chave de sistema — nunca vira coluna

Ela mora dentro da linha, como `__ativo` e `__id`, e está em `COLS_INTERNAS` do
`csv-editor.js`. Ficar dentro da linha é o que faz o enquadramento acompanhar a
pessoa quando a tabela é reordenada, dividida entre modelos ou tem uma célula
refeita. Qualquer lugar que derive cabeçalhos das chaves da linha precisa
filtrá-la — inclusive a reconstrução em `script.js` para CSVs antigos.

## 5. Normalizar antes de subir é requisito, não otimização

Uma foto de celular tem 4 MB; um lote de 500 seriam 2 GB subindo e descendo.
Reduzida no navegador para 300 dpi da janela com 30 % de folga, cada uma fica em
~150 KB. Remover essa etapa transforma a biblioteca de fotos exatamente no tempo
de rede que o agente local existe para não pagar.

Pelo mesmo motivo, o `engine.py` **baixa em paralelo antes do laço** e cacheia em
disco por hash. Não mova o download para dentro do laço.

## Duas regras de produto

- **Na dúvida, não escolher.** Disputa entre arquivos ou entre linhas vira
  pendência com os candidatos à vista. Nome parecido vira sugestão. Uma
  credencial com a foto trocada só é descoberta pelo cliente.
- **Sempre vai precisar de ajuste manual.** O usuário disse isso explicitamente.
  Um desenho que assuma "o automático resolve" está errado por premissa — a folha
  de contato não é enfeite.

## Publicação

`engine.py` é embutido no `NewProd.exe`: mexeu, o agente sai junto com o site,
com número de versão novo. E todo `.js` novo do painel precisa entrar em
`security_config.PAINEL_ARQUIVOS`, senão dá 404 em toda estação — o teste
`tests/test_painel_estacao.py` cobre isso.

Para conferir no navegador, use a skill `rodar-app`.
