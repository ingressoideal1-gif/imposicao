# Changelog — Ideal Imposition

Registro historico de todas as alteracoes, correcoes e melhorias aplicadas ao sistema.

---

## Versão atual: **v1.6.0 (v493)** — 2026-08-09 | Agente **1.2.23**

---

## [v493 — 2026-08-09] — Conferência de saúde, e o freio de segredo que travava a si mesmo

### Resumo
`ferramentas\conferir.ps1`: seis perguntas, sempre as mesmas, só consultando. Na primeira execução ele encontrou um defeito no freio de segredo criado na v491.

### O que o conferir pergunta
Há commits feitos que ainda não foram publicados? Há trabalho pendente na pasta? O agente está em sincronia entre repositório, manifesto publicado e esta máquina? Há branch ou rascunho acumulando? Há segredo em arquivo versionado? Os testes passam?

Não altera, não publica, não commita — pode rodar a qualquer momento, quantas vezes quiser. Existe para que a vigilância não dependa de alguém lembrar os comandos certos. Termina em **TUDO EM ORDEM** ou na lista do que precisa de atenção.

A checagem do agente consulta o manifesto com um cache-buster (`?t=<carimbo>`): o Storage fica atrás de CDN e, sem isso, responderia a versão anterior e faria a conferência acusar divergência onde não há.

### O defeito que ele achou
Três arquivos do próprio repositório disparavam o detector de `service_role` — o teste que exercita o freio e os dois documentos que explicam a regra, todos com chaves fabricadas. O `publicar.ps1` só varre arquivos **alterados**, então a trava nunca chegou a aparecer; mas qualquer edição nesses três travaria a publicação. Era exatamente o "alarme que sempre toca" que a regra original queria evitar.

A saída é uma declaração explícita: um arquivo que contenha a marca de chave falsa — a constante `MarcaSegredoFalso` em `ferramentas\Publicacao.psm1` — fica dispensado da checagem. É uma porta com placa, não um buraco: quem a usa declara por escrito que a chave é de mentira, e a declaração aparece no diff da revisão. Três testes novos cobrem os dois lados da regra, mais uma regressão que roda o detector contra os arquivos reais do repositório.

O texto exato da marca **não aparece aqui de propósito**. A comparação é por substring, então escrever a marca em qualquer arquivo isenta aquele arquivo — inclusive um changelog que só queria explicá-la. Use a marca apenas em arquivos que de fato precisem conter uma chave fabricada.

### Como foi verificado
578 arquivos versionados varridos, nenhum segredo. Pester 50/50. Agente em sincronia nos três lugares.

---

## [v492 — 2026-08-09] — O teto do agente: perguntado ao bucket, não gravado no script

### Resumo
O `NewProd.exe` passou a não caber no limite de upload do Storage, e a investigação achou tanto a causa do crescimento quanto um erro no jeito de tratar o limite. Junto saiu o agente **1.2.23**, o primeiro a se atualizar sozinho de ponta a ponta.

### O pacote cresceu de uma vez, não aos poucos
A documentação dizia "~47 MB, com 3 MB de folga"; o pacote compilado deu 51,63 MB. Tirar a pasta `ppds/` do executável — 5,19 MB de arquivos — economizou só **0,65 MB**, porque texto comprime quase todo. Foi o primeiro sinal de que a estimativa por tamanho de arquivo não serve: o que importa é o tamanho **comprimido dentro do exe**, medido com o `CArchiveReader` do PyInstaller.

Medindo assim e comparando com o executável publicado da 1.2.22: `lxml` foi de 0,00 para 3,32 MB e o total de 46,54 para 50,74. O culpado é identificável — foi a **imposição de SVG** da v489, que trouxe `svglib`, que traz `lxml`. Não houve crescimento gradual.

> **Não exclua `lxml` do pacote.** Nada no projeto o importa diretamente, então ele parece órfão em qualquer varredura. Ele vem por `svglib`, exigida em `engine.py:14` para impor SVG. Tirá-lo faz o SVG sumir do papel sem erro visível.

### Dois limites, e o menor vence
O bucket dizia 200 MB, mas um upload de 50,98 MB voltava `EntityTooLarge`. São dois limites independentes: o **global do projeto** e o **por bucket**, e o por bucket nunca ultrapassa o global. No plano Free o global era 50 MB, e era ele que barrava.

Com o global elevado para 300 MB, os testes passaram a aceitar 55 MB e 120 MB e a recusar 250 MB — ou seja, o teto efetivo virou os 200 MB do bucket. Com essa folga, a exclusão do `cryptography` (que dava 47,35 MB) foi **desfeita**: economizar 3,4 MB não paga um risco não verificado no TLS.

A lição virou código: o `publicar_agente.ps1` agora **pergunta o limite ao bucket** antes de subir, em vez de carregar um número gravado que envelhece em silêncio.

### O build que falhava deixava versão pela metade
Se a compilação quebrasse no meio, os três arquivos de versão já tinham sido reescritos — e a tentativa seguinte com o mesmo número era recusada. Agora o script guarda os arquivos **byte a byte** antes de tocá-los e um `trap` os devolve em qualquer falha, preservando a presença ou ausência de BOM (restaurar com BOM num `.py` ou `.wxs` que não tinha é um estrago silencioso).

### Achado de arrumação
O bucket `NewProd` não é usado por nada no projeto. O agente publica e lê de `agent-releases`.

---

## [v491 — 2026-08-09] — Publicação segura: freios, ponto de restauração e volta

### Resumo
Publicar era um `git push` seguido de um `vercel --prod`, sem rede de proteção e sem caminho de volta. Passou a ser um comando com quatro freios antes de qualquer escrita, um ponto de restauração por versão publicada e dois caminhos de volta.

### As três peças, e o que anda junto
**Site** (Vercel), **motor** (Render) e **agente** (`NewProd.exe` nas estações). Site e motor saem no mesmo `git push`, porque o Render escuta o mesmo repositório que a Vercel — não existe publicar só um dos dois, e é bom que seja assim, porque eles precisam combinar. O agente é separado, tem numeração própria e sai por outro comando.

### `publicar.ps1` — os quatro freios
Antes do commit, e portanto antes de qualquer coisa ir ao ar: a lista do que vai junto, com aviso em arquivo acima de 1 MB; recusa de rascunho (`scratch_*`, `temp_*`, `test<N>.js` e afins, só na raiz); recusa de segredo; e um teste de que o motor sobe — o freio que evita o pior caso, um erro de digitação derrubar o Render sem ninguém perceber. Se algum falha, o script **para antes do commit**: nada foi ao ar e nada precisa ser desfeito. Ao terminar, grava a tag `vNNN`.

### O freio de segredo procura `service_role`, não "qualquer coisa que pareça chave"
A chave **anônima** do Supabase também é um JWT e está legitimamente versionada em `frontend/supabase-config.js` — o navegador precisa dela, ela é pública por natureza. Um detector por formato barraria toda alteração naquele arquivo. Por isso o freio **decodifica o payload** do JWT e só barra quando o papel é `service_role`, a chave que dá controle total do banco.

### `voltar.ps1` — dois níveis
`-Agora` devolve **só o site** em cerca de 30 segundos, promovendo um deploy anterior na Vercel; é curativo, para quando o cliente está vendo erro neste minuto. Sem parâmetro, desfaz por `git revert` e republica site e motor juntos. Nada é apagado: a volta vira registro novo, então dá para voltar da volta.

**Atenção ao escolher na lista:** cada publicação cria **dois** deploys de produção — um pela integração Git da Vercel, outro pelo `vercel --prod` do script. O item 2 costuma ser o gêmeo do item 1, e a versão anterior de verdade costuma ser o item 3.

### `publicar_agente.ps1` — e a armadilha de voltar o agente
As estações só instalam versão **estritamente maior** que a delas. Republicar o número antigo não faz nada, e não dá erro — cada estação ignora em silêncio, com toda a aparência de ter funcionado. Para voltar o agente, o número precisa ser **novo** com o código antigo: `.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22`.

### Testes e faxina
`ferramentas\Publicacao.psm1` isola as decisões dos freios em funções puras — nenhuma toca git, rede ou disco —, o que permite exercitá-las com Pester sem publicar nada. A raiz do repositório perdeu os rascunhos versionados, e os testes e SQL foram para as suas pastas.

### Documentação
`docs/PUBLICAR.md` passou a ser o documento único de publicação. O `docs/DEPLOY.md`, que ainda ensinava a publicar no Firebase, foi removido; o `DEPLOY.md` da raiz virou um ponteiro.

---

## [v490 — 2026-08-09] — Box "Adicionar Pdf e Svg", arquivo por elemento, e o fim do fantasma

### Resumo
Três pedidos que, no código, eram o mesmo conserto. Os elementos PDF e SVG ganharam uma box própria onde o upload já cria o elemento; passou a ser possível ter vários, cada um com o seu arquivo; o elemento PDF ganhou controle de escala; e o PDF parou de aparecer como fantasma no lugar da Arte de Fundo.

### O que ligava os três
Até a v489 o arquivo era **da numeração**, não do elemento. `state.numPdfContent` e `state.numSvgContent` guardavam um arquivo cada, `addElement('PDF')` copiava desse estado global, e `saveNumeracao()` sobrescrevia o conteúdo de **todos** os elementos com esse arquivo único — a inconsistência E3 de `docs/fluxo_elementos_pdf_svg.md`. Um segundo PDF diferente era impossível de manter: sumia no primeiro save.

O fantasma era a mesma confusão vista de outro ângulo. `state.numPdfImage` servia a dois donos: era a arte do elemento **e** a arte de fundo de referência do canvas. Ao reabrir a numeração, `editNumeracao()` recuperava o `pdf_content` do primeiro elemento PDF, ele virava `numPdfImage`, e o canvas o pintava como fundo a 55% de opacidade.

### O arquivo passou a ser do elemento
Cada elemento PDF/SVG carrega o próprio conteúdo, o próprio nome (`pdf_filename`/`svg_filename`) e o próprio tamanho natural em mm (`natural_w_mm`/`natural_h_mm`, para o botão de 100% funcionar sem reabrir o arquivo). O save sobe o arquivo de cada elemento separadamente, pulando os que já são URL, e não achata mais tudo num arquivo só.

As colunas `svg_content` e `pdf_content` da **numeração** continuam sendo escritas, agora derivadas do primeiro elemento de cada tipo. Não é redundância: `svg_content` da numeração é um marcador de CAMAROTE load-bearing — `engine.py:222` faz `if "CAMAROTE" in str(numeracao.get("svg_content", ""))` para forçar `num_tipo = "CAMAROTE"`, e o mesmo teste aparece em mais três pontos do engine e dois do frontend. Parar de escrever a coluna quebraria a detecção em silêncio.

### A box "Adicionar Pdf e Svg"
Card novo no painel de elementos, com os botões `📄 + PDF` e `🎨 + SVG` — que abrem o seletor de arquivo e já criam o elemento, no tamanho natural — e a lista do que foi adicionado: ícone, nome, tamanho em mm, remover, e clique para selecionar no canvas. Saíram os botões SVG e PDF de "Adicionar Elementos" e os dois campos de upload do topo do editor.

### Escala do elemento PDF
O PDF ganhou o mesmo bloco que o SVG tem desde a v489: Largura e Altura em mm travadas na proporção, o botão `↺ Tamanho original (100%)`, e uma linha mostrando o arquivo e o tamanho original. Antes ele não tinha campo de tamanho nenhum. As funções `updateElDimensaoSvg`/`resetSvgTamanhoOriginal` viraram `updateElDimensaoArte`/`resetArteTamanhoOriginal` e atendem aos dois tipos.

### O fantasma
A arte de fundo passou a ser **só** `state.bgImage`, em três pontos: o canvas do editor, a face verso (que lia `state.numPdfImageVerso`, uma variável que nada no repositório atribuía — já era código morto) e o gerador do `preview_jpg`, onde o fantasma também ficava assado dentro da imagem salva.

Junto saiu a trava de `autoLoadCorBg` — a regra "arte própria vence" da v486 —, que impedia a cor do formato base de carregar quando a numeração tinha PDF ou SVG. Ela fazia sentido enquanto o PDF era o fundo; agora a cor carrega sempre. **Mudança visível:** numerações que usavam o PDF como fundo de referência passam a mostrar a cor do formato base no lugar dele.

### De quebra, o E1
O preview de imposição lia a imagem do SVG de `currentNum._svgImage`, campo que nada preenchia, e por isso **sempre** desenhava o placeholder "SVG" em vez da arte. Agora ele lê `el._svgImage` e carrega sob demanda, no mesmo molde do elemento PDF ao lado.

### Como foi verificado
Puppeteer na porta 9123, adicionando dois PDFs diferentes e um SVG pela box: os três elementos entram com conteúdos distintos e no tamanho real de cada arquivo; a lista da box mostra os três; a escala trava a proporção e o botão de 100% devolve o tamanho original nos dois tipos; o payload do save leva três conteúdos distintos, sem nenhum cache de render, e as colunas da numeração vêm do primeiro elemento de cada tipo; e reabrir reconstrói a arte elemento por elemento.

O teste do fantasma tem controle: além de conferir que o canvas novo não pinta **nenhum** pixel de arte fora do elemento, ele repinta do jeito antigo e confirma que o detector enxergaria o fantasma — 1.007.016 pixels na metade direita da folha. Um detector cego passaria no teste sem provar nada.

No engine, os três elementos foram impostos de verdade e medidos no PDF gerado: 40,13 × 20,15 mm, 30,14 × 30,31 mm e 24,89 × 9,99 mm, contra 40×20, 30×30 e 25×10 esperados.

### Compatibilidade
Numerações existentes abrem sem migração: os elementos já carregam a URL no próprio `pdf_content`/`svg_content` — hoje a mesma para todos, o que continua sendo estado válido. Faltam só `pdf_filename` e `natural_w_mm`; a box mostra o nome derivado da URL e o pré-carregador mede o tamanho natural ao rasterizar. A partir do primeiro save no modelo novo, cada elemento fica com os seus.

---

## [v489 — 2026-08-09] — Elementos PDF e SVG saem no papel, em tamanho original e sem distorção

### Resumo
Correção dos dois bloqueadores levantados na análise de fluxo dos elementos PDF/SVG (`docs/fluxo_elementos_pdf_svg.md`). Elementos SVG voltaram a existir no PDF impresso, e tela e papel passaram a desenhá-los do mesmo jeito: no tamanho natural do arquivo, escala 100%, sem esticar.

### B1 — o SVG aparecia na tela e não saía no papel
`svglib` e `reportlab` não estavam instalados nem constavam do `requirements.txt`, e o `import` delas ficava **dentro** do `try` do `_render_element`, cujo `except Exception` apenas imprimia no console do servidor. Resultado medido antes da correção: `Erro ao impor SVG: No module named 'svglib'` e uma página sem desenho nenhum. A imposição terminava com sucesso, sem aviso, e o operador só descobria imprimindo.

As duas bibliotecas entraram no `requirements.txt` e o import subiu para o topo do `engine.py`, guardando a falha em `_SVG_IMPORT_ERROR`. Um elemento SVG imposto sem elas agora levanta `RuntimeError` com a instrução de instalação, e a mensagem chega ao usuário pelo evento de erro de `app.py` em vez de morrer num `print()`.

Os `except` silenciosos dos elementos SVG e PDF passaram a re-levantar. Um PDF impresso sem a arte custa papel e tempo; falhar a geração é mais barato. Também entrou uma checagem para um caso que não levantava exceção nenhuma: o `svglib` aceita um SVG malformado e devolve um desenho de tamanho zero, que não pinta nada — agora isso é erro explícito.

### B2 — a tela esticava, o motor preservava a proporção
Os renderizadores do frontend desenhavam com `ctx.drawImage(img, x, y, w, h)`, que **estica** para preencher a caixa; o `engine.py` usa `keep_proportion=True`, que **encaixa** preservando a proporção e centraliza a sobra. Enquanto ninguém redimensionava, coincidiam. Ao mudar a proporção da caixa, a tela mostrava a arte preenchendo e o papel saía com ela encolhida e centralizada.

A regra escolhida foi **tamanho original, escala 100%, sem distorção**, e ela vale dos dois lados:

- `drawImageContain()` é o novo equivalente exato, no canvas, do `keep_proportion=True` do PyMuPDF — inclusive na centralização, verificada por medição. Os quatro renderizadores de elemento SVG/PDF passam por ela: editor, janela combinada de arte, preview de imposição e export de gabarito.
- Os campos Largura/Altura de um elemento SVG ficaram **travados na proporção**: mexer num ajusta o outro. Distorcer pela interface deixou de ser possível — e não adiantaria, já que o motor encaixaria de volta deixando margem vazia. Um botão **Tamanho original (100%)** devolve o elemento ao tamanho do arquivo. Elementos PDF nunca tiveram campos de tamanho, então já entravam em 100%.

### Tamanho natural do SVG
Para "escala 100%" significar alguma coisa, o tamanho natural precisava estar certo — e não estava. O cálculo era `(img.width / 96) * 25.4`, ou seja, a medida que o **navegador** dá ao SVG. Isso só acerta quando o arquivo declara um tamanho absoluto: sem `width`/`height`, ou com eles em `%`, o navegador substitui pelo default de 300×150 px, que não tem relação nenhuma com o desenho. Um SVG só com `viewBox="0 0 100 50"` entrava com 79,4 × 39,7 mm em vez de 26,46 × 13,23 mm.

`svgNaturalSizeMm()` passa a ler o tamanho do texto do próprio arquivo, reproduzindo a interpretação do `svglib` — que é quem manda, porque é ele que gera o papel. As oito convenções foram medidas nos dois lados e batem:

| SVG | frontend | svglib |
|---|---|---|
| `width="100" height="50"` | 26,46 × 13,23 mm | 26,46 × 13,23 mm |
| só `viewBox="0 0 100 50"` | 26,46 × 13,23 mm | 26,46 × 13,23 mm |
| `width="100mm"` | 100 × 50 mm | 100 × 50 mm |
| `width="72pt"` | 25,4 × 12,7 mm | 25,4 × 12,7 mm |
| `width="10cm"` | 100 × 50 mm | 100 × 50 mm |
| `width="1in"` | 25,4 × 12,7 mm | 25,4 × 12,7 mm |
| `width="50%"` (do viewBox) | 13,23 × 6,61 mm | 13,23 × 6,61 mm |
| sem `width`, sem `viewBox` | indeterminável → aviso | desenho 0×0 → erro |

O último caso é o único que continua sem resposta, e agora é honesto: o upload avisa que o tamanho foi estimado pelo navegador, e a imposição falha com mensagem em vez de gerar papel em branco.

### Como foi verificado
Medindo, não lendo. No motor, um SVG de 40×20 mm e um PDF de 30×15 mm impostos de verdade: em caixa de tamanho natural saíram 39,86 × 19,76 mm e 30,34 × 15,17 mm; numa caixa 60×60 mm saíram com razão 2,02 e 1,99, encaixados sem distorcer. No navegador, o `drawElement()` do editor com a mesma arte deu 39,50 × 19,50 mm na caixa natural e razão ~2,0 nas caixas fora de proporção. E o `svgNaturalSizeMm()` foi conferido contra o `svglib` nas oito convenções da tabela acima.

### Fica pendente
As inconsistências estruturais E1–E4 da análise continuam abertas — em especial o preview de imposição, que lê a imagem do SVG de `currentNum._svgImage`, um campo que nada preenche. O preview desenha o placeholder "SVG" em vez da arte; a correção de proporção já está lá e passa a valer assim que a fonte da imagem for unificada.

---

## [v488 — 2026-08-08] — Duplicar numeração perdia frente/verso e os ajustes de TICKET

### Resumo
`duplicateCatalogNumeracao()` monta a cópia a partir de uma lista **explícita** de campos, e três não estavam nela: `print_mode`, `ticket_qtd` e `ticket_logica`. Duplicar uma numeração **FxVerso** produzia uma cópia **Frente**, e duplicar uma **TICKET** produzia uma cópia com quantidade `1` e lógica `PILHA` — os defaults do `db.py` — em vez dos valores do original.

### Por que passava despercebido
A falha era silenciosa em três camadas ao mesmo tempo: a cópia era criada com sucesso, sem erro nem aviso; a lista do catálogo não mostra nenhuma dessas três propriedades, então a linha nova parecia idêntica; e o `METADATA` que também carregava o `print_mode` é removido dos `elements` na leitura, então nem havia de onde recuperar o valor perdido. Só abrindo a cópia no editor dava para notar que o FxVerso tinha virado Frente.

### O conserto
Os três campos passaram a ser copiados, com fallbacks que repetem exatamente como `editNumeracao()` interpreta um campo ausente — `'front'`, `1` e `'HORIZONTAL'` — para que a cópia abra no editor idêntica ao original. `print_mode` é lido da coluna, nunca dos `elements`.

`Cli_Num` e `preview_jpg` continuam deliberadamente fora da cópia: o primeiro porque a cópia deve nascer genérica em vez de presa ao cliente do original, o segundo porque copiar a URL faria dois registros apontarem para o mesmo arquivo no Storage, e salvar um mudaria o preview do outro.

### Documentação
A tela ganhou um documento de referência em `docs/lista_de_numeracoes.md`, com a skill `lista-de-numeracoes` que dispara a leitura antes de qualquer alteração. Ele registra as quatro armadilhas do catálogo — todas confirmadas no app rodando —, entre elas o fato de que numerações com `Cli_Num` são ocultadas da tabela enquanto o badge do menu conta todas, e que uma busca só com dígitos deixa de ser busca por nome e vira filtro por cliente.

---

## [v487 — 2026-08-08] — Preview da numeração sai da tabela e vai para o Storage

### Resumo
O preview de 100 DPI gerado ao salvar uma numeração era gravado como data URL base64 na coluna `preview_jpg` de `producao_numeracoes`. Agora é um arquivo `.jpg` no bucket `artes`, sob o prefixo `previews-numeracoes/`, e a coluna guarda só a URL pública.

### Por que
Não era só armazenamento. `loadAll()` carrega as numerações com `select *`, então os 454,6 KB de base64 espalhados por 42 linhas atravessavam a rede a cada carregamento de página — para um dado que nenhuma tela usa. Depois da mudança a mesma coluna, nas mesmas 42 linhas, soma 5,41 KB — 0 KB em base64, só URLs. Isso é o ganho isolado desta tarefa. O carregamento completo de `producao_numeracoes` continua pesado (por volta de 535 KB por chamada) porque a coluna `csv_data` (426 KB) domina o payload — pré-existente, fora do escopo desta tarefa, e não afetado por ela.

### Um preview por numeração
O arquivo é nomeado com o id do registro (`previews-numeracoes/<id>.jpg`) e sobe com upsert, então salvar a mesma numeração dez vezes sobrescreve o mesmo objeto em vez de deixar dez órfãos no bucket. Substituir uma numeração homônima ao salvar sem id já era o comportamento de antes desta tarefa — o que mudou agora é só *onde* esse id é resolvido: antes do upload, no início de `saveNumeracao`, para que o preview suba com o nome definitivo do registro em vez de um provisório.

### Migração
As 42 linhas que já estavam em base64 foram convertidas de uma vez, com backup local do estado anterior. A conferência não se contentou com o PATCH ter retornado sem erro: cada URL foi baixada exigindo status 200 e `content-type: image/jpeg`.

### Se o Storage falhar
`uploadToStorage` mantém o comportamento antigo de cair para base64 quando o upload não passa. A coluna continua funcionando em vez de ficar vazia — é degradação, não quebra.

O mesmo fallback também dispara se o navegador simplesmente não tiver `supabaseClient` — modo offline (`?offline=true`, `localStorage.offline_mode`) ou o CDN do supabase-js não carregando. Nesse caso não há upload a falhar: o preview já nasce em base64. Pelo backend, se `db.py` estiver com Supabase ativo (o caso normal na estação), esse base64 chega à mesma `producao_numeracoes` de produção — o navegador se declarar offline não implica que o backend esteja. Reexecutar `migrar_previews_para_storage.py` limpa o que voltar a acumular assim.

E agora esse fallback avisa: quando o valor volta em base64, o save emite um toast de alerta e um `console.error`. Antes ele era mudo — se alguém apertasse o RLS do bucket `artes`, todo save voltaria a gravar base64 e a coluna regrediria sem uma linha de log.

### Corrigido de quebra: todos os avisos do app mostravam "undefined"
`toast()` tinha ícones para `success`, `error` e `info`, mas não para `warning` — e o app já chamava `toast(..., 'warning')` em 43 lugares. O usuário lia literalmente `undefined Mensagem...`, e sem cor própria, porque o `style.css` também não tinha `.toast-warning`. Foram adicionados o ícone ⚠️, a regra de CSS em âmbar, e um fallback para o ícone de informação, de modo que um tipo novo que apareça no futuro nunca mais renderize `undefined`.

---

## [v486 — 2026-08-08] — Arte de Fundo carrega sozinha a cor do formato base

### Resumo
No editor de numeração, o botão **🖼️ Arte de Fundo** deixa de exigir upload manual: ao abrir uma numeração para editar — e ao escolher o Formato Base numa numeração nova — o PDF da cor mais antiga cadastrada para aquele formato entra sozinho no canvas.

### Como a cor é escolhida
Entre as cores cuja coluna `formato_id` aponta para o formato base da numeração, vence a de `created_at` mais antigo. Os formatos compatíveis (`formato_ids`) são ignorados de propósito — só o formato base decide. Formato sem cor, ou cor mais antiga sem PDF, abre a barra vazia, sem erro: a ausência de cor é situação normal.

A arte não é gravada na numeração; a cor é re-resolvida a cada abertura, então reeditar a cor no catálogo se reflete na próxima vez que a numeração for aberta. Ao salvar, o `preview_jpg` gerado para o card do pedido inclui a arte da cor que estiver no canvas — decisão consciente, já que o preview existe justamente para mostrar como a numeração fica sobre a arte.

A arte específica da numeração (o PDF ou SVG de referência dela, quando cadastrado) tem precedência sobre a arte da cor: se ela existir, a arte da cor não é carregada.

### O que continua igual
O rótulo com o nome do arquivo, o botão **✕ Remover** e o upload manual por cima. Subir um arquivo sobrescreve a frente e descarta o verso automático, porque o botão governa só a frente e manter o verso de uma cor sob a frente de outra arte mostraria duas artes diferentes no mesmo par de canvas.

Numa numeração nova, trocar o Formato Base com um fundo já carregado não troca a arte — só o primeiro `onchange` carrega. Remover o fundo e só então trocar o formato recarrega, porque a condição "não há fundo" volta a valer.

### Frente e verso
Cores cadastradas como frente e verso carregam também a arte do verso, no canvas duplex. O campo `state.bgImageVerso` já era lido por `drawCanvasFace` mas nunca era escrito — era um caminho morto, agora ligado. O **✕ Remover** passa a limpar as duas faces.

### Corrigido
A arte de fundo de uma numeração vazava para a numeração aberta em seguida: `editNumeracao()` nunca limpava `state.bgImage`, então quem editava a numeração A e abria a B via o canvas de B com a arte da A.

---

## [v485 — 2026-08-08] — Arte funde com a cor no editor, e o `style.css` estava truncado

### Resumo
Duas coisas na mesma publicação: a arte carregada no Criador de Arte passa a fundir com a cor do papel (multiply), como já fundia no card do pedido; e a correção de um erro de sintaxe que fazia o navegador **descartar em silêncio as últimas ~290 linhas do `style.css`**.

### 1. A arte não tinha multiply

`drawAmostraFace()` sempre compõe a arte sobre a cor com `globalCompositeOperation = 'multiply'` — ou seja, a arte do fluxo convencional **é** uma camada multiply. Ao ser carregada no editor ela entrava como `source-over`: o checkbox "Efeito Multiply (Fusão)" abria desmarcado e um Salvar gravaria a arte sem a fusão com que ela foi feita para imprimir.

A propriedade sozinha não bastava. `globalCompositeOperation` funde o objeto com o que está no **mesmo** canvas, e as três camadas do editor são elementos `<canvas>` irmãos — composite de canvas não atravessa o DOM. Uma arte de fundo branco continuava tapando a Camada 1 e o operador editava sem ver o papel em que ia imprimir.

A fusão real exige `mix-blend-mode` em CSS, e **no `.canvas-container`**, não no `.lower-canvas`: o container tem `position` + `z-index`, o que cria um stacking context, e stacking context isola blending. Medido no pixel central da prancha: no `.lower-canvas` dá `rgb(255,255,255)`; no container dá exatamente a cor da Camada 1.

Como o container funde inteiro, inclusive o `.upper-canvas` onde o Fabric desenha as alças de seleção, as alças passaram a ser definidas no `criador-arte.js` com cantos preenchidos e escuros — o padrão do Fabric (cantos vazados em azul claro) praticamente somia sobre cores fortes.

### 2. O `style.css` parava de ser lido na linha 2054

A regra `.btn-pdf-active` abria `{`, tinha uma declaração e **nunca fechava**: a linha seguinte emendava direto em `.prod-search-input`. Um bloco de CSS do Painel de Produção havia sido colado no meio da regra. Daí até o fim do arquivo tudo ficava preso num bloco aberto e o navegador descartava.

Havia um segundo dano do mesmo tipo na linha 1392: um `}` órfão de uma duplicata de `.font-picker-dropdown` que perdeu o seletor.

Nos dois casos a cópia íntegra existia em outro ponto do arquivo (linhas 1189-1203 e 2254-2265), então só os fragmentos quebrados foram removidos. O `style.css` foi de 71.460 para 65.499 bytes e as chaves fecham em 454/454.

**Efeito colateral relevante:** ~54 regras que nunca aplicaram entraram em vigor de uma vez, quase todas do Painel de Produção. O painel foi verificado no navegador e renderiza corretamente, mas essa é a mudança visual mais perceptível da publicação.

---

## [v484 — 2026-08-08] — Publicador só bumpava três arquivos

### Resumo
`publicar.ps1` / `publicar.bat` atualizavam a versão de `script.js`, `pedido.js` e `cliente.js` por uma lista fixa. Todo o resto ficava congelado e suas alterações **não chegavam ao navegador de quem tinha o arquivo em cache**.

| Asset | Estava em | Deveria acompanhar |
|---|---|---|
| `style.css` | v=9 / v=7 / v=5 conforme a página | sim |
| `mapas.js` | v=2 | sim |
| `criador-arte.js` | v=2 | sim |

### Correção
A lista fixa deu lugar a uma regra por padrão: bumpar qualquer `.js?v=` ou `.css?v=` em todas as páginas de `frontend/*.html`. Nenhum asset novo cai mais no mesmo buraco, sem precisar editar o publicador. Os CDNs não são afetados — eles fixam versão no caminho (`/3.11.174/pdf.min.js`), nunca em querystring.

Uma armadilha encontrada ao escrever isso, registrada em comentário no código: **`-Path` do `Set-Content` aceita `string[]`**. Na forma posicional o PowerShell engole caminho *e* conteúdo no mesmo array de `-Path`, deixa `-Value` sem ligar e falha com um erro enganoso sobre `'Encoding'`. O script original escapava porque o valor chegava pelo pipeline. `-Path` e `-Value` agora são nomeados.

---

## [v483 — 2026-08-08] — Criador de Arte ignorava a arte do "Upload de Arte"

### Resumo
Abrir o Criador de Arte num modelo que já tinha arte enviada pelo fluxo convencional reabria a **arte antiga** da última edição, ignorando o arquivo recém-enviado.

### O que acontecia

O editor prioriza `arte_json` (a estrutura vetorial) sobre `arte_url`, e `onItemArteUpload` nunca invalidava o `arte_json` da edição anterior — só o botão *Remover* fazia isso. Num modelo que já passara pelo editor, o JSON residual no `localStorage` vencia a arte nova.

### Correção

**1. Upload e colagem descartam o vetorial obsoleto** — `invalidarArteVetorial()` limpa memória e `localStorage`. O `arte_json` não existe no banco (`saveAmostraToDB` o remove do payload), então esses são os dois únicos lugares.

**2. Desambiguação por origem do arquivo** — o item 1 só resolve uploads futuros; modelos já nesse estado continuariam quebrados. O editor passa a olhar o nome do arquivo: o editor sobe `arte_criada_*`, o upload sobe `arte_*`. Se a URL atual não veio do editor, o JSON do `localStorage` é resíduo e é ignorado.

**3. `carregarArteBaseNoCanvas()`** substituiu o bloco inline, com três correções: a detecção de PDF passa a ignorar querystring (uma URL do Supabase com `?token=...` dava falso negativo e o PDF ia para um `<img>`, falhando em silêncio); usa `fetchPdfBytes()`, que já tem fallback via `/api/proxy` quando o CORS bloqueia; e enquadra em "contain" como o `drawAmostraFace()`, em vez de encaixar só pela altura e ancorar no topo.

**4. Carregamento aguardado** — o `img.onload` era um callback solto, então o passo 0 do histórico era gravado com a prancha vazia e um Ctrl+Z logo após abrir apagava a arte recém-carregada.

Também publicado junto: correção de um `ReferenceError` de temporal dead zone na checagem inicial do agente de impressão (`initPrinterModule` rodava durante a avaliação do `script.js` e lia um `let` declarado ~2000 linhas abaixo). O erro era engolido por um `catch`, e o efeito era o indicador dizer "Agente Local Inativo" em todo carregamento até alguém abrir a aba Impressoras.

---

## [v481 — 2026-08-08] — Amostra de verso some ao voltar para numeração só Frente

### Resumo
Na Lista de Arte, trocar a numeração de FxVerso para uma só Frente deixava a amostra do verso viva no banco, e o cliente continuava vendo o verso no link de aprovação.

### O que acontecia

`onItemNumSelect` já ajustava `item.verso = false` e `verso_tipo = 'Frente'`, mas o payload salvo só levava `amostra_num_id`, `gabarito_operacional`, `tipo_numeracao` e `verso_tipo`. A coluna `verso_amostra_arte_base64` de `pedidos_modelos` nunca era tocada.

O fluxo inverso (Frente → FxVerso, que abre a segunda janela combinada e grava a amostra do verso) está correto e **não foi alterado**.

### Correção

**1. Zerar a amostra ao trocar para numeração só Frente** — `onItemNumSelect` passa a enviar:

```js
dataToSave.verso_amostra_arte_base64 = null;
dataToSave._isExplicitRemove = true;
```

A flag é obrigatória: `saveAmostraToDB` tem um guard que **descarta em silêncio** um `verso_amostra_arte_base64: null` quando o item local ainda tem valor, a menos que a remoção seja explícita. Sem ela a alteração não teria efeito algum, e sem erro. O guard só afeta as chaves presentes no payload, então a flag não põe em risco `arte_url` / `amostra_arte_base64`.

Preserva de propósito `verso_arte_url` e `verso_arte_json` — a arte enviada pelo operador continua no banco e pode ser recomposta se a numeração voltar a ser FxVerso. Limpar o select (sem numeração escolhida) não apaga nada; a regra vale para a troca por outra numeração.

**2. `cliente.js` reconhecer `'Frente'`** — a decisão de exibir o bloco de verso testava apenas `!== 'SÓ FRENTE' && !== 'SO FRENTE'`, mas o valor gravado pelo operador é `'Frente'`. Como a montagem do item no cliente faz `verso_amostra_arte_base64 || verso_arte_url`, o cliente voltaria a ver o verso pela URL da arte mesmo com a amostra zerada. Alinhado com a convenção que o `script.js` já usa nos demais pontos.

---

## [v1.5.1 (v481) — 2026-08-08] — Matching de produto: aceitar `_vibe_id_produto`

### Resumo
Correção de um bug pré-existente na resolução do formato a partir do produto, e **retificação** do que a entrada v480 afirmava sobre ele.

### O que havia de errado

Os itens de uma OS existem em dois formatos diferentes:

| Origem | Quando | Campos de id de produto |
|---|---|---|
| `mapVibecodeProdutoToOSItem` (pré-carga, aplicada a todas as ordens ao abrir a lista) | sempre | **só** `_vibe_id_produto` |
| mapeamento de `pedidos_modelos` em `loadOSItens` | ao abrir uma OS | `id_produto` **e** `_vibe_id_produto`, com o mesmo valor |

Dois consumidores liam apenas `item.id_produto || item.produto_id`:

- `enviarParaImposicao` — resolve formato/saída ao carregar um modelo
- `renderAmostrasOSItens` — resolve o formato para filtrar as cores da tela de Amostras

Recebendo um item da pré-carga, `prodId` era `undefined`, a busca por ID era pulada **em silêncio** e sobrava o matching por nome/apelido. Falhando esse, `enviarParaImposicao` caía em `formatoId = state.formatos[0].id` — o primeiro formato do sistema — aplicava-o ao `ped-formato` e a cor do modelo se perdia junto.

### Retificação da entrada v480

A nota de v480 dizia que esse matching "provavelmente nunca acerta". **Está errado.** No fluxo normal (abrir um pedido dispara `loadOSItens` antes de `enviarParaImposicao`) os itens já são os de `pedidos_modelos`, que têm `id_produto` preenchido — ali o matching funciona. A falha ocorre só quando um item da pré-carga chega a esses consumidores: `loadOSItens` falhando, ou OS sem linhas em `pedidos_modelos`.

### Correção

Ordem tolerante nos dois pontos, a mesma que `_getActiveProductInfo` e `initPedPrintPanel` já usavam:

```js
const prodId = item._vibe_id_produto || item.id_produto || item.produto_id;
```

Continua mascarado no dia a dia pela correção de v480 (a fila desenha antes e preenche `item.formato_id`), mas o caminho deixa de depender disso.

---

## [v1.5.0 (v480) — 2026-08-07] — Painel de Produção: ordenação, filtros de prazo e confirmação de impressão

### Resumo
Quatro mudanças no Painel de Produção e no fluxo de impressão. A mais importante em termos de operação: **imprimir não marca mais o modelo como IMPRESSO sozinho** — passa por confirmação do operador. As demais são de navegação e leitura da fila.

### 1. Confirmação de impressão

Antes, o status virava `IMPRESSO` automaticamente assim que o job era despachado — em alguns caminhos, *antes* mesmo de imprimir. Agora aparece um popup ao fim do envio e o status só muda no "Sim".

| Caminho | Comportamento antigo |
|---|---|
| Botão Imprimir da linha (`pedQueueImprimir`) | marcava IMPRESSO **antes** de imprimir |
| `runPedImposition('print')` — 3 ramos | marcava assim que o agente aceitava o job |
| 🖨️ Imp. Sel. (`pedQueueGerarPDFMulti`) | marcava logo após gerar o PDF, antes do modal abrir |
| Imprimir da fila da view Imposição (`impQueueImprimir`) | marcava antes de imprimir |

Quando a impressão passa pelo modal de seleção de impressora, a confirmação fica pendente (`marcarConfirmacaoPendente`) e dispara após o envio bem-sucedido; `closePrintModal` descarta a pendência se o modal for fechado sem enviar.

**Ações de PDF não alteram status nem pedem confirmação.** Removida a marcação automática de `IMPRESSO` de todos os caminhos de gerar/salvar/baixar PDF, em `pedido.js` e `script.js`. A única escrita automática restante é a de `confirmarImpressaoModelos`, sempre atrás do popup.

### 2. Pedido abre com o primeiro modelo selecionado

`abrirImposicaoDoPedido` selecionava `itemId: null` de propósito. Agora escolhe o primeiro modelo e delega para `enviarParaPedido`.

O "primeiro" é calculado por `getPrimeiroModeloDaOS`, que repete o agrupamento por produto de `renderPedOSQueue` — pegar `itens[0]` daria outro modelo, porque o JavaScript reordena chaves numéricas de objeto.

**Armadilha encontrada no caminho:** `renderPedOSQueue` não é só desenho — ela grava o formato padrão do produto em `item.formato_id`. Chamando `enviarParaPedido` sem essa render antes, `enviarParaImposicao` encontrava o formato vazio, descia toda a cadeia de matching e caía no fallback do primeiro formato do sistema; o `ped-formato` recebia o formato errado e a **cor do modelo se perdia**. A fila passou a ser desenhada antes de carregar o modelo.

> Bug pré-existente relacionado — **corrigido em v481, ver abaixo**. A nota original desta entrada dizia que o matching por produto "provavelmente nunca acerta"; isso estava errado e foi retificado na entrada seguinte.

### 3. Ordenação por coluna na lista "Pedidos Liberados"

Os títulos viraram botões. O ativo fica destacado com seta do sentido.

| Coluna | 1º clique | 2º clique |
|---|---|---|
| Nº Pedido, Itens, Quantidade, Progresso | maior → menor | inverte |
| Frete | agrupa por tipo (A→Z) | inverte |
| Status | ordem do fluxo: Aguardando → Parcial → Impresso → Revisão | inverte |

Sem coluna escolhida, a lista mantém exatamente a ordem anterior. O botão **ATUALIZAR** do painel zera a ordenação; os demais chamadores de `loadOrdens()` ficaram intactos, para a escolha não sumir ao voltar de um pedido. `aplicarProdSort` usa `slice()` — reordenar o array de origem embaralharia o `state` para as outras telas.

### 4. Filtros por Prazo de Entrega

Três botões centralizados no topo do box, à esquerda de "Todos os Setores", sempre com um selecionado:

- **Para Hoje** — prazo no dia corrente, qualquer hora
- **Atrasados** — data **e hora** anteriores ao momento atual
- **Geral** — sem filtro (padrão; ATUALIZAR volta para ele)

Combinam com busca, setor e estágio sem interferir neles. Pedido sem prazo aparece só no Geral.

**Alerta:** com "Para Hoje" selecionado e havendo atrasado na fila, o botão "Atrasados" fica vermelho. Só nessa condição. O alerta olha `ordensImpressao` — a fila inteira, antes de qualquer filtro — de propósito: é sinal global, não muda com setor, estágio ou busca. Para isso o eixo de prazo saiu do mesmo `filter` dos demais; com a lista já recortada em "Para Hoje" não haveria como enxergar os atrasados.

### Nota técnica: estilos aplicados inline

Os botões de cabeçalho e os de prazo têm o estilo aplicado por JS em `element.style`, não pela folha de estilos. As regras equivalentes foram escritas no `style.css` e **não venciam a cascata** dentro do `<th>` sticky — verificado que o arquivo chegava íntegro ao navegador (chaves e comentários balanceados, servido com o conteúdo certo) sem que a causa fosse identificada. As regras seguem no `style.css` como rede de segurança.

### Ferramental

| Arquivo | O que mudou |
|---|---|
| `.gitignore` | `print_configs.json` — configuração de impressão da estação, gravada em runtime pelo `db.py`, nunca deve ir para o repositório |
| `publicar.ps1` | mensagem de commit virou parâmetro obrigatório, no lugar de um texto fixo sobre `amostra_cor_id` que se repetia em toda publicação. Cada etapa passou a checar `$LASTEXITCODE`: `$ErrorActionPreference` não interrompe comandos nativos, então um commit falho seguia para o push e para o deploy assim mesmo |

### ⚠️ Pendência conhecida: o Prazo de Entrega é sintético

Consultando o Supabase em 2026-08-07: a tabela `propostas` **não tem** coluna `prazo_entrega` nem `prazo`, e `prazo_operacional` está `null` em todos os registros amostrados. Por isso `loadOrdensFromVibecode` sempre cai em `getFallbackPrazo(created_at, numero)`, que devolve `created_at + (3 + numero % 5)` dias.

Consequência: a coluna Prazo Entrega e os filtros "Para Hoje" / "Atrasados" operam sobre uma fórmula derivada da data de criação, não sobre um prazo real. É por isso que praticamente todo pedido aparece como "(Atrasado)". **Definir o campo real ficou pendente com o usuário**; o ponto de mudança é a linha que monta `prazo_entrega` em `loadOrdensFromVibecode` — `pedidoPassaFiltroPrazo` e `formatPrazoDestaque` acompanham automaticamente.

### Commits

- `6e07d43` — ordenação por coluna, confirmação de impressão e abertura com o 1º modelo
- `7cfafa4` — filtros por prazo de entrega, `.gitignore` e `publicar.ps1`

---

## [v1.4.0 (v454) — 2026-08-04] — Correção Crítica: Fontes Web nas Numerações

### Resumo
Correção do bug onde fontes carregadas do catálogo web (Roboto, Open Sans, Montserrat, etc.) eram substituídas por **Helvetica** na geração de PDF pelo motor Python. Fontes web agora renderizam corretamente em numerações (TEXT, FIXED, CAMAROTE_*, TEATRO_*) tanto em modo simples quanto multi-artes.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | `engine.py` — Resolução de Fontes (`v454`) | **Bug principal**: Ao usar `_font_data` (Base64 do TTF embutido), o engine criava o arquivo temporário mas mantinha `font_name = "helv"` (fallback Base-14). O PyMuPDF registrava o buffer da fonte Roboto com alias de Helvetica. **Fix**: Adicionado `font_name = family` no Step 1, idêntico ao que já existia no Step 2 (download por URL). |
| 2 | `script.js` — Multi-Artes (`v454`) | A função `_injectFontUrls()` injetava `arquivo_url` (URL do TTF) para `payloadNumeracao` e `numeracao_2`, mas **não** para os itens dentro de `payloadMultiArtes`. **Fix**: Adicionado loop de injeção para cada item de multi-artes. |
| 3 | Restrição do Catálogo (v453) | Confirmada remoção dos botões "Fontes do PC" e "Digitar Nome" no Criador de Arte. `populateFontFamilySelect()` agora usa exclusivamente `state_fonts.catalogo` (fontes hospedadas). |

### Diagnóstico Detalhado

O bug foi rastreado através de 5 hipóteses documentadas em `fontes_numeracao_debug.md`. A causa raiz confirmada:

```
engine.py linha 546:
  font_name = font_map.get("Roboto", "helv")  → "helv" (Roboto não é Base-14)

engine.py linha 557 (ANTES):
  font_file = tmp_font.name   ← arquivo OK, mas font_name continua "helv"

engine.py linha 614:
  page.insert_font(fontname="helv", fontbuffer=<bytes_da_Roboto>)  ← ERRADO!
```

**Após a correção:**
```
engine.py linha 558 (AGORA):
  font_name = family           ← "Roboto"

engine.py linha 615:
  page.insert_font(fontname="Roboto", fontbuffer=<bytes_da_Roboto>)  ← CORRETO!
```

---

## [v455 — 2026-08-04] — Pipeline de Impressão Vetorial (PDF RAW)

### Resumo
Refatoração do pipeline de impressão para enviar o PDF **diretamente** ao spooler como dados RAW, preservando 100% das fontes embutidas. O método anterior rasterizava cada página como imagem PNG/JPEG, destruindo as fontes e perdendo qualidade vetorial.

### O que mudou

| Aspecto | Antes (GDI Raster) ❌ | Agora (PDF RAW) ✅ |
|---------|----------------------|-------------------|
| Texto | Pixels (imagem) | Vetorial (TrueType) |
| Fontes web | Perdidas na rasterização | Preservadas intactas |
| Qualidade | Limitada ao DPI | Infinita (vetor) |
| Tamanho spool | ~50-100 MB por job | ~2-5 MB (tamanho real do PDF) |
| Velocidade | Lenta (rasterização) | Instantânea (envio direto) |

### Modos de impressão disponíveis

O `print_service.py` agora suporta 4 modos selecionáveis via `options["print_mode"]`:

| Modo | Descrição |
|------|-----------|
| `pdf_raw` (padrão) | Envia PDF direto ao spooler — requer impressora com interpretador PDF |
| `ghostscript` | Converte PDF→PS vetorial via Ghostscript — qualquer impressora PostScript |
| `gdi` | Rasteriza para imagem via GDI/PIL — fallback universal |
| `auto` | Cascata: pdf_raw → ghostscript → gdi |

---


## [v1.3.0 (v408) — 2026-07-29] — Suporte aos Modos de Impressão Reversa e Folha a Folha, Cores e Ajustes de Fila do Pedido

### Resumo
Implementação completa dos novos modos de impressão física (**Impressão Reversa** e **Folha a Folha**), persistência de parametrização de impressão por produto no Supabase, adição do círculo indicador de cor de referência nos modelos, e ajustes visuais nas linhas da fila do pedido.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | Modos de Impressão (`v407`) | Adicionados checkboxes **🔄 Impressão reversa** e **📄 Folha a Folha** no painel de configuração de impressão e no motor de spooling em tempo real (`processPrintQueueOptions`). |
| 2 | Persistência de Impressão (`v406`) | Integração da tabela `producao_print_config` no Supabase com sincronização automática (`savePrintConfigForProduct` e `loadPrintConfigForProduct`). |
| 3 | Estilo de Status Aguardando (`v408`) | Atualizada a cor de fundo das linhas de modelo com status "Aguardando" para **`#65625e`** em `pedido.js` e `script.js`. |
| 4 | Círculo Indicador de Referência (`v404`/`v405`) | Inserido círculo (60% da altura da linha) antes do nome do modelo preenchido com o Hexadecimal da cor de referência. |
| 5 | Dropdown de Cor (`v404`) | Cor de fundo dinâmica com o Hexadecimal da cor selecionada e texto forçado em preto 100% legível (`color: #000000 !important;`). |
| 6 | Resiliência do Supabase (`v403`) | Interceptador gracioso na função `api()` para tratar ausência da coluna `cor_referencia` sem travar a interface. |
| 7 | Ajustes de Layout na Fila (`v396`) | Atualizada a cor das bordas e delimitadores para `#918f8c` e aplicado espaçamento vertical de `3pt` entre linhas de modelos. |
| 8 | Compilação do Executável | Recompilado `dist/IdealImpositionAgent.exe` com tratamento robusto para liberação de portas e processos em segundo plano. |

---

## [v1.2.0 — 2026-06-28] — Novo motor de Blocos Estritos e Interface de Navegação

### Resumo
Adição da funcionalidade Cut & Stack Estrito (Blocos) e Colunas Independentes, juntamente com controles de paginação avançados no Visualizador de Imposição para conferência da matemática do PDF gerado.

### Implementações Aplicadas

| # | Função | O que mudou |
|---|---|---|
| 1 | `engine.py` (Cut & Stack) | Criação da matemática robusta para as modalidades "Colunas Independentes" (Total de Folhas = Altura da Coluna) e "Blocos Estritos" (Agrupamento fixo por tamanho de bloco/profundidade). |
| 2 | `app.py` | Correção na passagem dos parâmetros `cut_stack_mode`, `sheets_per_block` e `block_depth` do frontend para a instância do `ImpositionConfig`. |
| 3 | Visualizador (`script.js`) | Refatoração da lógica do Visualizador para desenhar perfeitamente a matemática de qualquer folha, batendo com a lógica final da geração de PDF do `engine.py`. |
| 4 | Visualizador Numerado (`script.js`) | Correção da formatação de valores numerados para respeitar tickets múltiplos dentro da mesma célula em tempo de Preview. |
| 5 | Controles Paginados (`index.html`) | Adição de `input` de página direta e setas de avanço/recuo de Folhas direto na tela de pré-visualização. |

---

## [v1.1.0 — 2026-06-27] — Fluxo de Status de Arte e Link do Cliente

### Resumo
Refatoração completa do fluxo de status entre o painel interno (designer/atendente) e o link público do cliente. Corrigidos 4 bugs críticos que faziam o link abrir a tela errada.

### Fixes aplicados

| # | Função | O que mudou |
|---|---|---|
| 1 | `getOrCreateLinkCliente()` | Não sobrescreve mais status finais (APROVADO, REPROVADO, Em Arte, Pendente) ao clicar em "Copiar Link" |
| 2 | `initClientePage()` — OS locais | `producao_ordens_servico` só complementa o status se o link ainda estiver em estado inicial |
| 3 | `initClientePage()` — detecção de aprovado | `'ARTE_APROVADA'` (aprovação interna) não ativa mais a tela "Artes Aprovadas!" do cliente |
| 4 | `statusProntoParaLink` | Somente `'Enviar Arte'` destaca o botão de link em azul |

### Fluxo de status definido

```
[OS Criada] → "Em Arte"
    │
    ├─ Designer marca TODOS modelos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
    ├─ Designer marca PARCIALMENTE + clica "Voltar p/ Atendimento" → "Pendente Informação"
    └─ Atendente clica "Voltar para Arte" → "Em Arte"

[Status = "Enviar Arte"] → Link do cliente ATIVO
    ├─ Cliente APROVA TODOS → "APROVADO"
    └─ Cliente marca UM como "Alterar" → "REPROVADO"

[Status = "REPROVADO"] → Designer corrige → marca todos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
```

### O que o cliente vê por status

| Status | Cliente vê |
|---|---|
| `Enviar Arte` | 🎨 Janelas de aprovação dos modelos |
| `APROVADO` | ✅ "Artes Aprovadas! Em breve seu pedido entra em produção." |
| `REPROVADO` | ❌ "Artes Reprovadas. Nossa equipe está realizando as correções." |
| `Em Arte` / `Pendente Informação` / outros | 🕐 "Artes em Preparação. Aguarde." |

### Commit
`ed6e17c` — `fix(arte): fluxo correto de status - Em Arte > Enviar Arte (auto) > APROVADO/REPROVADO`

---



### 1. fix: Menus do sistema pararam de funcionar (CRITICO)

**Commits:** `8fbcc2b`, `f9a3d4c`

**Causa raiz:** O `script.js` havia acumulado um erro de sintaxe fatal. Edicoes sucessivas no bloco `renderElementsList` desbalancaram as chaves `{` e `}` do arquivo. O Node.js detectou `SyntaxError: Unexpected token '}'` na linha 12767, impedindo que o **JavaScript inteiro carregasse**. Com o JS quebrado, nenhum botao do menu funcionava pois os event listeners nunca eram registrados.

**Solucao:**
1. `script.js` restaurado a partir do `script_backup.js` (backup valido e sintaticamente correto)
2. As melhorias de layout foram reaplicadas de forma segura e cirurgica
3. Sintaxe verificada com `node --check` apos cada edicao

---

### 2. feat: Ordenacao automatica de elementos no Editor de Numeracao

**Commits:** `8fbcc2b`, `5a7f1f0`
**Arquivo:** `frontend/script.js` -> funcao `renderElementsList()`

Os elementos no painel esquerdo do Editor de Numeracao agora sao exibidos sempre na mesma ordem logica, independente da ordem de criacao.

**Ordem aplicada:**

| Prioridade | Tipo    | Rotulo               |
|-----------|---------|----------------------|
| 1         | TEXT    | Numeracao sequencial |
| 2         | FIXED   | Texto Fixo           |
| 3         | QR      | QR Code              |
| 4         | BARCODE | Barcode              |
| 5         | SVG     | SVG                  |
| 6         | PDF     | PDF                  |
| 7         | PICOTE  | Picote (sempre ultimo) |

**Implementacao (2 linhas adicionadas):**
```js
const typeOrder = { TEXT: 0, FIXED: 1, QR: 2, BARCODE: 3, SVG: 4, PDF: 5, PICOTE: 6 };
const sortedElements = [...state.numElements].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));
```

---

### 3. style: Layout em Grid Responsivo nos Cards de Elemento

**Commits:** `f9a3d4c`
**Arquivo:** `frontend/style.css`

Os cards de elementos no Editor de Numeracao foram reformulados de `flex nowrap` (causava rolagem horizontal e campos acavalados) para CSS Grid responsivo.

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))`
- Campos se distribuem automaticamente em multiplas linhas
- Sem rolagem horizontal, usa toda a area disponivel
- `input[type="color"]` com altura padronizada (30px)
- Classe `.el-full` para campos que ocupam a linha inteira

---

### 4. fix: Restauracao completa do painel de producao (CRITICO)

**Commits:** `5a7f1f0`

**Problema:** Ao restaurar o `script.js` do `script_backup.js`, foram perdidas funcionalidades criticas que estavam em commits posteriores do git mas anteriores ao backup. O backup estava DESATUALIZADO em relacao ao repositorio.

**Funcionalidades recuperadas:**

| Funcao | Descricao |
|---|---|
| `filtroSetor` (8x) | Filtro por setor no painel de producao |
| `filtroStatus` (8x) | Filtro por status das OSs |
| `clienteFinalizarFluxo` (6x) | Fluxo de aprovacao/rejeicao pelo cliente |
| `atualizarBarraFinalCliente` (2x) | Barra dinamica no link publico do cliente |
| Funcoes `renderOrdens` | Renderizacao completa das ordens de servico |
| Funcoes de amostras | Amostras por item, combinadas, individuais |

**Solucao:** Restauracao direta do commit `fc2688d` (14.477 linhas, UTF-8, sintaxe valida) que era o estado correto do `main` antes da nossa feature branch.

---

### 5. fix: Caracteres estranhos no browser (ÔÇö, â€", etc.)

**Commits:** `d534be5`
**Arquivo:** `frontend/script.js`

**Causa:** O `script.js` original (commitado no git) continha 2.236 caracteres Unicode especiais nos comentarios de secao (box-drawing, aspas tipograficas, em dashes). Dependendo do contexto do browser ou do encoding intermediario, esses bytes causavam exibicao de "ÔÇö", "â€"" e similares.

**Caracteres substituidos:**

| Caractere | Unicode | Aparecia como | Substituido por |
|---|---|---|---|
| `─` (box drawing) | U+2500-U+257F | `ÔÇö` | `-` |
| `—` (em dash) | U+2014 | `â€"` | `--` |
| `'` `'` (aspas curvas) | U+2018/2019 | `â€˜` | `'` |
| `"` `"` (aspas duplas) | U+201C/201D | `â€œ` | `"` |

**Resultado:** 1.602 caracteres substituidos, 0 box-drawing restantes, sintaxe JS validada.

---

### 6. docs: CHANGELOG.md criado

**Arquivo:** `CHANGELOG.md` (raiz do projeto)

Criado registro historico completo das alteracoes do projeto.

---

### 7. fix: Problema de DNS local resolvido para publicacao

**Situacao:** O DNS local do sistema nao resolvia `github.com` nem `vercel.com`, impedindo o `git push`.

**Solucao aplicada:**
- Resolucao dos IPs via DNS externo (8.8.8.8)
- Adicao de entradas fixas ao `C:\Windows\System32\drivers\etc\hosts` via PowerShell elevado:
  ```
  4.228.31.150  github.com
  4.228.31.150  api.github.com
  198.169.1.129 vercel.com
  216.198.79.130 imposicao.vercel.app
  216.24.57.9   imposicao.onrender.com
  ```

> **ATENCAO:** Essas entradas sao temporarias. Se o DNS local for corrigido, remova-as do arquivo hosts para evitar conflitos com mudancas de IP do GitHub/Vercel.

---

## Arquitetura do Sistema

```
ideal-imposition/
|-- frontend/                  <- SPA estatica (HTML + CSS + JS puro)
|   |-- index.html             <- Estrutura e views (Single Page App de secoes)
|   |-- script.js              <- Toda a logica frontend (~14.500 linhas)
|   |-- style.css              <- Design system + componentes (~1.800 linhas)
|   |-- supabase-config.js     <- Credenciais Supabase e API_BASE_URL
|   `-- vercel.json            <- Rewrites SPA + headers no-cache
|
|-- app.py                     <- FastAPI - endpoints REST do motor
|-- engine.py                  <- Motor Python de geracao de PDFs impostos (PyMuPDF)
|-- db.py                      <- Camada de acesso ao Supabase (servidor)
|-- requirements.txt           <- Dependencias Python (FastAPI, PyMuPDF, etc.)
|-- render.yaml                <- Configuracao de deploy no Render
|
|-- schema_unificado.sql       <- Schema completo do banco de dados
|-- DEPLOY.md                  <- Guia de deploy detalhado (Supabase + Vercel + Render)
`-- CHANGELOG.md               <- Este arquivo
```

### Fluxo de Dados

```
Browser (hospedado na Vercel)
    |
    |--[Supabase JS SDK]------> Supabase PostgreSQL
    |                           (formatos, numeracoes, cores, OSs, artes)
    |
    `--[fetch REST / JSON]----> Backend FastAPI (hospedado no Render)
                                    `-> engine.py (PyMuPDF - geracao de PDF)
                                            `-> Supabase Storage (upload PDF)
```

### Tabelas do Banco de Dados (prefixo `producao_`)

| Tabela                          | Descricao                                       |
|---------------------------------|-------------------------------------------------|
| `producao_formatos`             | Formatos do item (tamanho, grade, gaps)          |
| `producao_numeracoes`           | Conjuntos de elementos variaveis (VDP)           |
| `producao_saidas`               | Formatos de papel de saida                      |
| `producao_cores`                | Cores de referencia por formato                 |
| `producao_modelos_imposicao`    | Modelos salvos de imposicao                     |
| `producao_ordens_servico`       | Ordens de servico (pedidos)                     |
| `producao_os_itens`             | Itens de cada OS (produto, setor, cor, num.)    |
| `producao_links_aprovacao`      | Links publicos de aprovacao para o cliente      |

---

## Guia de Publicacao Rapida

```bash
# Commitar e publicar (Vercel detecta automaticamente e faz deploy em ~2min)
git add .
git commit -m "descricao da mudanca"
git push origin main
```

> Se o `git push` falhar com "Could not resolve host: github.com":
> Execute como Administrador e adicione ao `C:\Windows\System32\drivers\etc\hosts`:
> `4.228.31.150 github.com`

---

*Ultima atualizacao: 2026-06-16*
