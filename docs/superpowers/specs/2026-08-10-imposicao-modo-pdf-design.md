# Imposição de modelos em modo PDF (multipáginas) — design

**Data:** 2026-08-10
**Estado:** ✅ implementado e verificado na v498. Os números medidos estão no `CHANGELOG.md`.

## O problema

Um modelo marcado como **modo PDF** na aprovação de arte tem, como arte, um PDF de
várias páginas — cada página é um ingresso diferente. Esse arquivo precisa ser imposto e
impresso paginando: cada pose da folha consome uma página distinta.

Hoje isso só acontece se alguém, manualmente, trocar a **Regra de Paginação** da janela de
imposição para "Pdf Paginado". Nada liga uma coisa à outra, e a janela não avisa. O
resultado silencioso é uma folha com **a página 1 repetida em todas as poses** — descoberto
no papel.

São dois conceitos que ninguém conectou:

| Conceito | Onde vive | O que significa |
|---|---|---|
| `item.modo_pdf` | coluna do item, ligada no botão 📄 PDF da aprovação | "a arte deste modelo é um PDF multipáginas" |
| `schema = 'pdf_multiple'` | `#ped-schema` / `#imp-schema` e `default_schema` do formato | "cada pose consome uma página diferente" |

## O que foi medido

Levantamento feito lendo o caminho inteiro, da aprovação até o `engine.py`.

**A1. A prévia e a impressão leem a regra de lugares diferentes.**
`drawPedPreview()` sobrescreve a regra com `schema = fmt.default_schema`
(`frontend/pedido.js:471`), ignorando o select. Já `runPedImposition()` lê o select
`#ped-schema` (`frontend/pedido.js:3468`) e é esse valor que vai no payload, vira
`layout_schema` em `app.py:813` e comanda o engine. Quando os dois divergem, **a tela mostra
uma coisa e o papel sai outra**.

Isso não é hipotético e não depende do modo PDF: `enviarParaPedido()` força o select para
`cut_stack` quando o item tem blocos (`frontend/pedido.js:2508`) e a prévia continua
desenhando o `default_schema` do formato.

A view de Imposição tem a mesma falha, mais estreita: `drawPreview()` só sobrescreve quando
há OS ativa (`frontend/script.js:6665`) — que é justamente o caminho do painel de produção.

**A2. O `modo_pdf` não chega à imposição.**
`enviarParaPedido()` e `enviarParaImposicao()` preenchem formato, saída, numeração, faixa e
frente/verso, e têm exatamente uma regra automática de paginação — blocos → `cut_stack`
(`frontend/script.js:16932`). Nenhuma das duas olha `item.modo_pdf`.

**A3. Em Pdf Paginado a quantidade vem do arquivo, não do pedido.**
O engine calcula `total_items` a partir do número de páginas, metade disso em duplex
(`engine.py:234`). A quantidade da OS é ignorada. A prévia repete a mesma conta
(`frontend/pedido.js:600`). A trava dos campos início/fim existe (`frontend/pedido.js:202`)
mas só dispara se o select já estiver em Pdf Paginado no instante em que a arte carrega — e
na entrada pela OS a arte chega num `setTimeout(700)`, então normalmente não dispara.

**A4. Duplex consome as páginas aos pares.**
Página `2i` é a frente e `2i+1` o verso do mesmo ingresso (`engine.py:1371` e `engine.py:1600`).
A janela de aprovação, por outro lado, navega as páginas linearmente. O mesmo arquivo tem
dois significados em duas telas, e nada explica isso ao operador.

**A5. A numeração carimbada por cima está correta e não muda.**
O valor avança junto com a página, tanto na janela de aprovação (`seqStart + (pageNum - 1)`)
quanto na imposição (`start + item_index`).

## Decisões de produto

Tomadas pelo usuário em 10/08/2026:

1. **Quantidade divergente: avisar e deixar seguir.** O arquivo manda — impõe as páginas que
   existem. A janela mostra a comparação de forma visível. Não bloqueia, porque reimpressão
   parcial é um caso legítimo.
2. **A prévia é que cede.** A prévia passa a desenhar a regra escolhida no campo "Regra de
   Paginação", que é a que vai ao engine. O operador mantém o controle e a tela deixa de
   mentir.

## O design

### 1. A regra de paginação passa a ter uma fonte só

Nas duas prévias, a regra usada para desenhar passa a ser a do select, que é a que será
impressa:

- `frontend/pedido.js:471` — trocar `schema = fmt.default_schema` por leitura de
  `#ped-schema`. A validação de que o formato tem regras cadastradas
  (`frontend/pedido.js:442`) **permanece**: ela protege contra formato mal cadastrado e não
  tem a ver com a divergência.
- `frontend/pedido.js:322` — no ramo de OS ativa, a regra também vem do formato antes de
  chegar na linha 471. Passa a vir do select pelo mesmo motivo.
- `frontend/script.js:6666` — mesma troca na view de Imposição.

A saída (`saiId`) continua vindo do formato, como hoje. Ela não faz parte deste problema e
mexer nela ampliaria o risco sem necessidade.

Isso conserta, de quebra, a divergência que hoje afeta qualquer item com blocos.

### 2. Modo PDF liga a paginação sozinho

Em `enviarParaPedido()` e `enviarParaImposicao()`, ao carregar um item com `item.modo_pdf`,
o select vai para `pdf_multiple` e dispara o `change` — o mesmo mecanismo que já existe para
blocos.

**Precedência:** modo PDF vence blocos. Um PDF multipáginas não pode ser Cut & Stack da mesma
página; se o item tiver os dois, a paginação é Pdf Paginado e a janela diz por quê.

O select fica **travado** enquanto o modelo estiver em modo PDF, com o motivo escrito ao
lado — algo como "🔒 Modo PDF: cada página do arquivo é um ingresso". Para sair, o operador
desliga o modo PDF na tela de arte, que é onde essa decisão pertence.

### 3. A folha mostra qual página está em cada pose

Quando a regra é `pdf_multiple`, cada célula da prévia ganha um rótulo pequeno com o número
da página — `p. 12` — e, em duplex, o par: `p. 11 / 12`.

Sem isso, oito poses de páginas diferentes são visualmente indistinguíveis de oito cópias da
mesma, que é exatamente o erro que este trabalho existe para tornar visível.

O rótulo é **anotação de tela**: desenhado na folha depois de `fecharGrupo()`, fora do grupo
arte+numeração, para não multiplicar sobre a cor e para deixar claro que não é tinta. Cor
distinta da arte (azul), tamanho pequeno, dentro do clip da célula.

### 4. O cabeçalho explica de onde veio a conta

`#ped-preview-sheet-num` passa a dizer, em Pdf Paginado:

> Folha 1 de 63 · 500 páginas do PDF · 8 por folha

E, quando o número de páginas não bate com a quantidade do item da OS, uma linha de aviso
visível abaixo da prévia:

> ⚠️ O PDF tem 500 páginas e o pedido pede 5.000. Vai imprimir 500.

Aviso, não bloqueio — conforme a decisão 1.

### 5. Teto no cache de páginas

`activePdfDoc.pagesCache` guarda, sem limite, um canvas rasterizado por página distinta. Numa
folha de N poses são N páginas por folha; num PDF de centenas de páginas o navegador acumula
sem teto.

Passa a ter limite por documento (60 páginas, descartando a menos usada). O número é uma
folga confortável sobre o maior número de poses por folha que o sistema produz hoje.

## O que não muda

- **O `engine.py`.** A regra de paginação dele já está certa e é a referência: página
  `item_index` na simplex, par `2i`/`2i+1` na duplex, com recuo para a página 0 quando falta
  página. Todo o trabalho é fazer a tela contar a mesma história.
- **A numeração carimbada** sobre as páginas, que já avança corretamente.
- **A quantidade** continua vindo do arquivo em Pdf Paginado.
- **A saída** continua vindo do formato.

## Como verificar

Com o app rodando na porta 9123 e o navegador dirigido por Puppeteer, como nas verificações
das v496 e v497:

1. **Paginação de verdade:** PDF de 8 páginas, cada uma com um dígito grande diferente;
   formato de 8 poses. A folha da prévia tem de mostrar **oito dígitos diferentes**, não oito
   vezes o mesmo. Contagem de pixels por página distinta.
2. **Prévia e impressão concordam:** com o select em `pdf_multiple` e o formato em
   `sequential`, a prévia tem de paginar — hoje ela repete a página 1.
3. **Modo PDF liga sozinho:** carregar pela OS um item com `modo_pdf = true` e conferir que o
   select foi para `pdf_multiple` e ficou travado.
4. **Precedência:** item com `modo_pdf` **e** `blocos` termina em `pdf_multiple`.
5. **Duplex:** PDF de 8 páginas em duplex resulta em 4 ingressos, e o rótulo mostra os pares.
6. **Aviso de quantidade:** páginas ≠ quantidade da OS mostra o aviso e **não** bloqueia.
7. **Regressão:** as seis verificações das v496 e v497 (fusão em cinco pontos, `drawImageContain`,
   elementos SVG/PDF no modo PDF) continuam passando.

## Riscos

- **A mudança da fonte da regra altera o que é desenhado hoje** para itens com blocos cujo
  formato não é `cut_stack`. É a correção de uma mentira, mas muda a tela de casos que o
  operador já conhece. Merece nota no changelog.
- **Travar o select** tira uma liberdade que existe hoje. Mitigado por ser reversível na tela
  de arte, onde a decisão pertence, e pelo motivo escrito ao lado.
- **A view de Imposição** (`imp-*`) recebe só a correção da fonte da regra. Os itens 2 a 5
  são especificados para a janela do painel de produção (`ped-*`), que é a que o usuário
  usa. Se a outra view continuar em uso, ela vai precisar do mesmo tratamento depois — está
  registrado aqui para não virar a próxima descoberta acidental.
