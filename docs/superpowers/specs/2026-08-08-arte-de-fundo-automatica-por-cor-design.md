# Arte de Fundo automática a partir da Cor do formato base

Data: 2026-08-08
Escopo: editor de numeração (view `view-numeracao`), somente `frontend/script.js`.

## Problema

No editor de numeração, o botão **🖼️ Arte de Fundo** é hoje apenas um seletor de
arquivo: para ver a numeração posicionada sobre a arte do ingresso, o operador
precisa localizar e subir o PDF manualmente toda vez que abre a numeração. A arte
correta já está cadastrada no sistema — cada registro de `producao_cores` guarda o
PDF de referência e aponta para um formato base via `formato_id` — mas o editor
nunca consulta esse catálogo.

Há ainda um defeito latente: `editNumeracao()` não limpa `state.bgImage`. Quem
edita a numeração A e em seguida a numeração B vê o canvas de B com a arte de A.

## Objetivo

Ao abrir uma numeração para edição, carregar automaticamente no Arte de Fundo o
PDF da cor correspondente ao formato base da numeração, preservando todo o
comportamento atual do botão: o rótulo com o nome do arquivo, o botão **✕
Remover** e a possibilidade de subir outro arquivo por cima.

## Não faz parte deste escopo

- Nenhum seletor de cores novo na barra de ferramentas. A troca continua sendo
  pelo upload de arquivo que já existe.
- Nada é persistido. A cor é re-resolvida a cada abertura da numeração; o fundo
  não vai para `producao_numeracoes`.
- Formatos compatíveis (`formato_ids` da numeração) são ignorados. Só o formato
  base (`formato_id`) determina a cor.

## Resolução da cor

Dado o `formato_id` da numeração:

1. Filtrar `state.cores` por `String(c.formato_id) === String(formatoId)`.
2. Ordenar por `created_at` crescente e pegar o primeiro — a cor mais antiga.
3. Empate em `created_at`, ou `created_at` ausente: preservar a ordem em que os
   registros chegaram da API. A ordenação é estável, então o critério permanece
   determinístico. Hoje a API entrega as cores por `name.asc` (`db.py:728`).

Se o formato não tiver nenhuma cor, ou se a cor mais antiga não tiver PDF
(`pdf_base64` e `pdf_url` ambos vazios), nada acontece: a barra fica exatamente
como está hoje, vazia. Nenhum toast de erro — a ausência de cor é uma situação
normal, não uma falha.

O PDF é obtido de `cor.pdf_base64 || cor.pdf_url` e lido por `fetchPdfBytes()`
(`frontend/script.js:147`), que já trata as duas formas.

## Gatilhos

**Ao abrir para editar** — `editNumeracao()` (`frontend/script.js:2767`):
o fundo atual é limpo primeiro e a cor é carregada em seguida. A limpeza corrige o
vazamento de arte entre numerações descrito acima. O carregamento entra depois da
chamada `onFormatoSelect(false)` da linha 2959, ponto em que `state.numFormato` já
está resolvido — `loadBgImage()` retorna cedo quando `state.numFormato` é nulo, e
o caminho novo depende do mesmo estado.

**Ao criar uma numeração nova** — `onFormatoSelect()` (`frontend/script.js:3166`),
no caminho disparado pelo `onchange` do select `#num-formato`: carrega apenas
quando as duas condições valem juntas:

- `#num-id` está vazio, isto é, é uma numeração nova e não uma edição; e
- não há fundo carregado no momento (`state.bgImage` é nulo).

A segunda condição é o que garante que trocas posteriores de formato não mexam num
fundo já carregado: o segundo `onchange` encontra `state.bgImage` preenchido e não
faz nada.

Consequência aceita conscientemente: se o operador remover o fundo automático e em
seguida trocar o formato base de uma numeração nova, o fundo volta a carregar,
porque a condição "não há fundo" passa a valer de novo. A alternativa seria
memorizar numa flag que a remoção foi deliberada; foi descartada por não valer o
estado extra.

## Depois de carregado

O fundo automático é um fundo comum, sem tratamento especial:

- **✕ Remover** (`clearBgImage()`, `frontend/script.js:4463`) limpa normalmente.
- Subir um arquivo pelo próprio botão sobrescreve a frente e descarta o verso
  automático. O botão governa só a frente, e manter o verso de uma cor sob a
  frente de outra arte mostraria duas artes diferentes no mesmo par de canvas.
- O rótulo `#bg-file-name` mostra `📎 ` seguido do `pdf_filename` da cor, o mesmo
  formato usado no upload manual. Quando a cor não tiver `pdf_filename`, cai para
  o `name` da cor, para nunca exibir um rótulo vazio.

## Renderização

O trecho de `loadBgImage()` que rasteriza PDF é extraído para um helper que recebe
os bytes do PDF e devolve um `HTMLImageElement`:

- renderiza a página 1 num canvas offscreen em escala 2, sobre fundo branco;
- define `originalPdfWidthPt` e `originalPdfHeightPt` a partir do viewport em
  escala 1.

Esses dois campos são obrigatórios: `drawCanvasFace` usa `originalPdfWidthPt` para
escalar o fundo (`frontend/script.js:3368`) e, sem eles, a arte entraria no canvas
com o tamanho do bitmap em escala 2, ou seja, ao dobro.

`loadBgImage()` passa a usar esse mesmo helper no seu ramo de PDF, de modo que
upload manual e carregamento automático compartilham um único caminho de
rasterização.

## Verso

Quando a cor tiver `pdf_verso_base64`, ele é carregado em `state.bgImageVerso`
**sempre**, sem consultar o `print_mode` da numeração. `drawCanvasFace` só desenha
a face `back` em modo duplex, e o canvas do verso fica escondido fora dele, então
carregar incondicionalmente elimina a dependência de ordem entre escolher o
formato e alternar Frente/FxVerso: se o operador mudar para FxVerso depois, o
verso já está pronto.

Duas correções acompanham:

- `bgImageVerso` passa a ser declarado no state inicial. Hoje ele é lido em
  `frontend/script.js:3351` e nunca escrito — um caminho morto que este trabalho
  liga.
- `clearBgImage()` passa a zerar `bgImage` e `bgImageVerso`. Sem isso o **✕
  Remover** limparia a frente e deixaria o verso órfão no canvas duplex.

Não há elemento de interface para o fundo do verso: a barra de ferramentas do
verso não existe, e o rótulo e o botão Remover continuam sendo os da frente,
governando as duas faces.

## Superfície de mudança

Somente `frontend/script.js`. Sem alteração de HTML — o rótulo do botão e o
`#bg-file-name` são reaproveitados como estão. Sem alteração de backend e sem
migração de banco: `producao_cores` já tem `formato_id`, `pdf_base64`, `pdf_url`,
`pdf_filename`, `pdf_verso_base64` e `created_at`.

## Decisões da revisão final

Duas decisões novas, tomadas na revisão que corrigiu as corridas de `state.bgLoadToken`:

- **A arte própria da numeração vence.** `window.autoLoadCorBg` desiste (devolve
  `false`) antes de resolver a cor quando `state.numPdfContent` ou
  `state.numSvgContent` já estiver preenchido. Sem isso, `drawCanvasFace` dava
  precedência a `state.bgImage` sobre a arte de referência da própria numeração,
  escondendo-a atrás da arte genérica da cor. A guarda vive dentro de
  `autoLoadCorBg` para cobrir os dois pontos de chamada (`editNumeracao` e
  `onFormatoSelect`) de uma vez.
- **O `preview_jpg` passa a incluir a arte da cor, conscientemente.** O trecho que
  gera o preview ao salvar já usava `refBg = state.bgImage || state.numPdfImage ||
  state.numSvgImage`; com o fundo automático, `state.bgImage` passa a estar
  preenchido com frequência bem maior. Isso não é mais tratado como "nada é
  persistido" — o preview existe para mostrar como a numeração fica sobre a arte,
  e persistir a composição com a arte da cor é o comportamento desejado. O que
  continua não sendo persistido é a arte em si: `producao_numeracoes` não passa a
  guardar `bgImage`, só o `preview_jpg` derivado dele.

## Verificação

O comportamento é visual e não há suíte de testes de frontend no projeto, então a
verificação é feita no app rodando, via skill `rodar-app`:

1. Abrir para editar uma numeração cujo formato base tem cor cadastrada: a arte
   aparece no canvas e o rótulo mostra o nome do PDF.
2. Abrir em seguida outra numeração de formato diferente: a arte troca, em vez de
   manter a anterior — o defeito latente descrito no Problema.
3. **✕ Remover**: limpa a frente e o verso.
4. Subir um arquivo pelo botão: sobrescreve o fundo automático.
5. Abrir uma numeração cujo formato base não tem cor: a barra abre vazia, sem erro
   nem toast.
6. Numeração nova: escolher o formato base carrega a arte; trocar o formato depois,
   com fundo já carregado, não mexe nele.
7. Numeração FxVerso com cor frente e verso: o canvas do verso mostra a arte do
   verso.
