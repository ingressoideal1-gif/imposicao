# FxVersoUnico — frente paginada, verso de uma página só

**Data:** 2026-08-31
**Estado:** desenho aprovado pelo usuário; implementação pendente.

## O pedido

Um terceiro Modo de Impressão na numeração, ao lado de **Frente** e **FxVerso**:
**FxVersoUnico**. Nele a frente é um PDF multipáginas — cada página é uma peça — e o
verso é um arquivo de **uma página só**, que se repete em todas as peças.

O exemplo do usuário: um PDF de 9 páginas mais um verso de uma página produz 9
ingressos; esse verso ocupa as 9 células de verso da folha.

## Por que isso não sai hoje

O `pdf_multiple` em duplex consome as páginas **aos pares**: a frente da peça *i* é a
página `i×2` e o verso é a página `i×2+1` (`engine.py:3664` e `engine.py:3837`; o
mesmo par no caminho principal, `engine.py:3095` e `engine.py:3347`). Um trabalho de 9
ingressos exige portanto um arquivo de **18 páginas intercaladas**, e
`engine.py:1104` divide o total de páginas por 2 para achar a quantidade.

O caminho do arquivo separado de verso **já existe**, mas está fechado dos dois lados:

- No card do pedido, a linha de upload "🖼️ Verso" some quando o modelo está em modo
  PDF (`frontend/script.js:32044`, `display: none`), justamente porque hoje o verso
  vem das páginas pares.
- No motor, o `pdf_verso_url` de uma arte só é anexado **quando a frente tem menos de
  duas páginas** (`engine.py:2677`). Com 9 páginas na frente, o verso é ignorado em
  silêncio.

A prévia, essa, já baixa o verso e guarda em `state.impArtVersoPdfDoc`
(`frontend/script.js:30057`) — ela é a parte que menos precisa mudar.

## Decisões do usuário (31/08/2026)

1. **A página do verso vem do campo Verso do modelo**, o mesmo botão 🖼️ Verso que já
   existe no card, e não da última página do arquivo da frente. Frente e verso ficam
   em arquivos separados, como no resto do sistema.
2. **A numeração continua variando no verso.** A arte do verso é a mesma nas 9
   células, mas número, QR e código de barras da face verso mudam peça a peça.
3. **O modo se escolhe só nas telas nossas** — a numeração e a janela de
   Imposição/Pedido. O card continua gravando `Frente`/`FxVerso` em
   `pedidos_modelos.verso_tipo`, que é coluna do ERP parceiro: não inventamos um texto
   novo dentro da tabela dele.

## O desenho

### O valor interno

`print_mode = 'duplex_unico'`, rótulo **FxVersoUnico** na tela. `front` e `duplex`
ficam exatamente como estão. A coluna `producao_numeracoes.print_mode` é TEXT com
`DEFAULT 'front'` e **sem CHECK** (`sql/alter_producao_numeracoes_print_mode.sql`),
então nenhuma migração é necessária.

### O risco central: uma pergunta que virou duas

Hoje o código pergunta `print_mode === 'duplex'` em pontos espalhados, e essa pergunta
misturava duas coisas que agora se separam:

| A pergunta | A resposta nova |
|---|---|
| "este trabalho tem verso?" | `print_mode !== 'front'` |
| "como o arquivo é paginado?" | só aqui `duplex` e `duplex_unico` diferem |

Se um único `=== 'duplex'` do primeiro tipo ficar para trás, a tela mostra uma coisa e
o papel sai outra. Por isso o **primeiro passo da implementação é inventariar todos
eles** e classificá-los, antes de mudar comportamento. Duas funções pequenas carregam
a distinção:

- No painel, `temVerso(printMode)` e `versoUnico(printMode)`, ao lado das já
  existentes `isNumeracaoDuplex()` (`frontend/script.js:4735`) e `numeracaoEhDuplex()`
  (`frontend/script.js:18212`).
- No motor, `is_duplex = cfg.print_mode in ("duplex", "duplex_unico")` e
  `verso_unico = cfg.print_mode == "duplex_unico"`.

### 1. Editor da numeração

- `#num-print-mode` (`frontend/index.html:509`) ganha a terceira opção.
- `onNumPrintModeChange` (`frontend/script.js:4643`) e o desenho do canvas
  (`frontend/script.js:4959`) abrem a face do verso em `!== 'front'`.
- A face que um elemento novo recebe (`frontend/script.js:7218`) idem.
- O rótulo da divergência (`frontend/script.js:18260`) passa a dizer `FxVersoUnico`.
- **Duplicar já copia `print_mode`** (`frontend/script.js:4219`) — nada a mudar, mas
  entra na conferência, porque essa lista explícita já engoliu o `print_mode` uma vez.

### 2. O botão Verso volta a aparecer no card

`frontend/script.js:32044` esconde a linha "🖼️ Verso" sempre que `item.modo_pdf`.
Passa a esconder só quando o modo **não** for FxVersoUnico. É por ali que o operador
envia o PDF de uma página.

Quem decide isso é o `print_mode` da numeração do modelo (`amostra_num_id`), que é
tabela nossa. O `verso_tipo` do parceiro continua recebendo `FxVerso`.

### 3. Janela de Imposição e do Pedido

- `#imp-print-mode` (`frontend/index.html:1245`) e `#ped-print-mode`
  (`frontend/index.html:1562`) ganham a terceira opção.
- `enviarParaPedido` (`frontend/script.js:29971`) hoje faz
  `printMode.value = item.verso ? 'duplex' : 'front'`. Passa a ler o `print_mode` da
  numeração — o mesmo que `frontend/script.js:11552` já faz ao trocar de numeração.

### 4. A conta de quantas peças

`updateImpSummary` / `updatePedSummary` (`frontend/script.js:11751`, `:11898`,
`:12755`) hoje fazem `duplex ? ceil(páginas/2) : páginas`. Em FxVersoUnico o total é
**o número de páginas da frente**: 9 páginas = 9 peças.

O aviso de divergência com a Qtd do pedido (`frontend/pedido.js:211`) continua como
está — a decisão de 10/08/2026 vale igual: **o arquivo manda, a tela avisa, não
bloqueia**.

### 5. A prévia

`frontend/script.js:10396` escolhe a página desenhada. Em FxVersoUnico:

- frente: página `item_index + 1` do documento da frente;
- verso: página **1** do `state.impArtVersoPdfDoc`, sempre.

O rótulo azul da célula deixa de ser `p. 11 / 12` e passa a `p. 6 / V` — o `V` diz que
aquele verso é o mesmo para todas. Sem arte de verso carregada, a célula de verso sai
vazia e o cabeçalho explica por quê, em vez de sair calada.

### 6. O motor

a. `ImpositionConfig` ganha `base_file_verso`.

b. `engine.py:1104` — em `pdf_multiple` com `duplex_unico`, `total_items` é o número
   de páginas inteiro, sem dividir por 2.

c. `_load_base_as_pdf` (`engine.py:1431`) — havendo `base_file_verso`, anexa a página
   do verso ao fim do documento e guarda `verso_page_idx = <páginas da frente>`. Se o
   arquivo de verso tiver mais de uma página, usa a primeira e registra no log.

d. Frente (`engine.py:3664` e `:3095`) — `duplex_unico` usa `page_idx = local_idx`,
   igual ao simplex.

e. Verso (`engine.py:3837` e `:3347`) — `duplex_unico` usa `page_idx = verso_page_idx`,
   fixo para todas as células.

f. Multi-artes (`engine.py:2677`) — o `if len(art_doc) < 2` passa a anexar também em
   `duplex_unico`. **Cuidado com o cache:** `_load_art_as_pdf` guarda o documento por
   URL e o `insert_pdf` muda o documento guardado; o índice do verso vai memorizado
   por arte para não anexar duas vezes quando dois modelos usarem o mesmo arquivo.

g. `is_duplex` (`engine.py:2472`) e os `print_mode == "duplex"` de `parse_elements`
   (`engine.py:1166`, `:1198`, `:2535`) passam a aceitar os dois valores — é o que
   mantém a numeração de face `back` variando peça a peça.

### 7. Como o arquivo do verso chega ao motor

Um modelo sozinho **não** passa por `multi_artes`: manda um `file` só
(`frontend/script.js:12699`). Passa a mandar também `file_verso` quando o modo for
FxVersoUnico, e o agente (`local_print_agent.py:270`) grava num temporário e o entrega
em `base_file_verso`.

A multi-seleção já manda `pdf_verso_url` por arte (`frontend/script.js:12229`) e não
muda nada no envio — só o consumo, no item (f) acima.

A imposição continua rodando **no agente local**, como sempre.

### 8. Fora do Pdf Paginado

FxVersoUnico continua válido em qualquer regra de paginação. Sem `pdf_multiple` a
frente já é sempre a página 0 e o verso a página anexada, de modo que o modo degenera
naturalmente em FxVerso — que é o resultado certo, e não um caso a proibir.

### 9. O que este trabalho não faz

Nada aqui rasteriza a arte do cliente. O verso entra por `show_pdf_page`, vetorial,
igual à frente.

## Como conferir

1. **Motor, teste novo** (`tests/test_pdf_duplex_unico.py`, irmão do
   `test_pdf_duplex.py`): 9 páginas de frente + 1 de verso, formato de 4 células.
   Conferir que as células de verso das duas folhas usam **a mesma** página de origem,
   que a numeração da face verso muda de célula para célula, e que `total_items` é 9.
2. **Motor, regressão:** `test_pdf_duplex.py` continua passando sem alteração — o
   FxVerso de hoje não pode mudar de comportamento.
3. **Painel, harness em node:** a conta de peças (9 páginas = 9) e o inventário de
   `temVerso` — um `=== 'duplex'` esquecido reprova.
4. **Na tela:** numeração nova em FxVersoUnico com número na frente e QR no verso;
   modelo em modo PDF com 9 páginas; conferir o botão 🖼️ Verso visível, o rótulo
   `p. n / V` na prévia, e o PDF gerado com 9 frentes distintas e 9 versos iguais mas
   numerados.
5. **Regra de bloqueio:** Qtd 9 continua pedindo 9 linhas do banco, como em Frente e
   FxVerso (`tests/test_regras_de_bloqueio.py`).

## Publicação

Mexe em `frontend/` e em `engine.py`/`local_print_agent.py`: site **e** agente saem na
mesma leva.
