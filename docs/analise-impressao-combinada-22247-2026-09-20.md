# Análise da impressão combinada no Painel de Produção

Análise local de 20/09/2026, revisão `21c4b722`. Pedido de referência: 22247,
modelos 96, 97 e 98. Nenhuma correção, publicação, consulta ao banco ou impressão
física foi executada.

## Alcance e método

Os dados reais do pedido não estão nos arquivos locais inspecionados. Os números
96/97/98 identificam modelos **sintéticos**, não reproduzem quantidades, formato,
arte ou configuração confirmados do pedido real.

Foram executados oito cenários com a função inteira `drawPedPreview`, extraída
diretamente de `frontend/pedido.js`. DOM, canvas e PDFs em cache foram simulados;
os registros capturam as artes e textos que a função manda desenhar. Isto não é
um teste visual no navegador publicado.

As funções reais `arteDoModeloParaFolha` e `arteParaOMotor` produziram os objetos
de cada modelo. Esses objetos alimentaram diretamente `ImpositionConfig` e
`ImpositionEngine`, substituindo apenas o endereço da arte por PDFs sintéticos
locais. Não foi chamado o endpoint HTTP nem o agente instalado. Os trechos de
preparação em `app.py` foram inspecionados, sem importar esse módulo.

Cinco cenários do motor produziram nove PDFs, totalizando 23 páginas. As saídas
foram lidas com PyMuPDF para conferir modelos e números. Acesso de rede foi
bloqueado no script de diagnóstico. Não foram usados QR Ideal, bancos reais,
credenciais, hot folders ou impressoras.

Artefatos locais ignorados pelo Git em `tmp-analise-22247/`:

- `preview.cjs`, `preview-results.json`: prévia, payload por arte e seleções.
- `motor.py`, `motor-results.json`: geração e conteúdo das páginas.
- `verify.cjs`: 18 asserções que confirmam as divergências; não são aprovação do fluxo.
- PDFs `sequential.pdf`, `multi.pdf`, `duplex.pdf` e conjuntos `strict-*`.

Reprodução, nesta máquina, sem instalar dependências:

```powershell
node tmp-analise-22247/preview.cjs
py tmp-analise-22247/motor.py
node tmp-analise-22247/verify.cjs
```

O Python chamado por `py` tem as dependências do motor. Não possui `pytest` e o
`venv` previsto no projeto está ausente; a suíte pytest não foi executada.

## Comportamento esperado

Uma seleção múltipla define um trabalho. Cada célula desse trabalho precisa ter
um modelo, índice local, arte, face, numeração e escala bem definidos. Prévia,
PDF, refazer e confirmação devem consumir a mesma definição.

Sequencial preenche folha a folha; não é obrigatório mostrar os três modelos na
primeira folha. Aproveitamento empilhado distribui uma sequência global pelas
pilhas. Na montagem estrita, blocos completos podem compartilhar folhas, enquanto
sobras são organizadas por modelo. Portanto, o rótulo “cada modelo em folha
própria” não descreve integralmente o algoritmo de blocos completos.

## Defeitos reproduzidos

### 1. Prévia descarta os modelos em sequencial e montagem estrita

Em `pedido.js:1131`, `artesMultiAtivas` só recebe a seleção se o esquema for
`multi_artes`. A seleção também pode determinar `sequential` ou `cut_stack`, mas
nesses casos a lista fica vazia. O comentário de que seleção múltipla sempre
força `multi_artes` não corresponde à decisão em `pedido.js:931`.

Com quatro peças de cada modelo e quatro poses, a folha 2 sequencial mostrou
quatro artes do 96 e sua numeração; o PDF da folha 2 contém quatro peças do 97.
Não é apenas o cabeçalho: a função manda desenhar a arte errada.

### 2. Quantidade de folhas e conjuntos também diverge

Com duas peças de cada modelo, quatro poses e bloco de quatro, a prévia estrita
calculou **um conjunto com duas folhas**. O motor produziu **três conjuntos de
uma folha**, com 96, 97 e 98 separados.

`buildStrictAssemblySets` recebe lista vazia e trata as seis peças como um único
modelo. O erro alcança os limites de refazer, que são derivados da prévia em
`pedido.js:1243`. Não foi executada reimpressão física.

### 3. Numeração na prévia usa índice global onde precisa do local

Em `pedido.js:2110`, `val_index` começa como `item_index`. Só é substituído por
`item_local_index` quando essa variável foi preenchida pela montagem estrita.
O caminho acumulado já calcula `multiArteLocalIndex`, mas não o usa nessa conta.

No aproveitamento, com quatro peças por modelo e inícios 960/970/980, a primeira
folha deve conter, na ordem percorrida pelo desenho:

| Modelo | Índice local | Número esperado | Número desenhado |
|---|---:|---:|---:|
| 96 | 0 | 960 | 960 |
| 97 | 2 | 972 | 976 |
| 96 | 3 | 963 | 963 |
| 98 | 1 | 981 | 989 |

A leitura CSV usa o índice local quando a arte está disponível. Não se deve
generalizar este defeito aritmético para todo conteúdo de banco. Já a perda da
arte nos outros esquemas também desvia a escolha da numeração por modelo.

### 4. Início enviado por modelo não é o início consumido pelo motor

O payload real produzido pelas funções do frontend contém `arte.start` igual a
960/970/980 e `arte.numeracao.start` igual a 1, vindo do cadastro sintético.
`engine.py:3022` lê `numeracao.start`, não `arte.start`.

Nos PDFs gerados, cada modelo começou em **1**. Este defeito não está restrito à
janela. Ele aparece quando o início do modelo difere do início do cadastro.
Os trechos inspecionados do endpoint não reconciliam esses dois campos.

Essa constatação é sobre o motor fonte local; não prova qual versão está
instalada nas estações, nem qual é o início dos modelos reais do pedido 22247.

### 5. Arte ainda não carregada vira a arte do modelo aberto

Simulando o PDF do 97 ainda em carregamento, o aproveitamento desenhou a arte do
96 na célula do 97, mantendo o texto variável do 97. Em `pedido.js:1645`, o PDF
ativo começa como o do modelo aberto; em `pedido.js:1659`, só é substituído se o
PDF específico já existe.

Falta uma representação explícita de carregamento/falha por modelo. Uma falha
persistente pode prolongar essa representação enganosa. O teste simulou cache
pendente; não acessou uma URL real com erro.

### 6. Escala individual se perde na prévia combinada

Com escalas horizontais de 90%, 100% e 110%, o payload preservou as três.
A prévia desenhou todas com 90%, a escala do modelo aberto.

O construtor de artes dentro de `drawPedPreview` não inclui `_escalaH/_escalaV`,
ao contrário de `arteDoModeloParaFolha`. A leitura em `pedido.js:1747` recua para
`escalaDaArteDoTrabalho`. Há duplicação de preparação de artes com contratos
diferentes.

### 7. Blocagem da tela e blocagem enviada têm fontes diferentes

No cenário com `bloco=4` e `cutstack_folhas=8`, a prévia escreveu 4 no controle,
enquanto `blocagemDaSelecao()` devolveu 8 para o payload.

A prévia ainda multiplica folhas por `block_depth`; o ramo estrito do motor usa
`cfg.sheets_per_block` como tamanho básico do bloco. Não basta consertar a lista
de artes para garantir paridade.

Outra diferença por inspeção: o motor ordena artes por quantidade decrescente
na montagem estrita (`engine.py:2864`); `buildStrictAssemblySets` percorre a ordem
recebida. Com quantidades 20/4/8, os PDFs de sobras saíram na ordem 96/98/97.
A correção precisa considerar essa ordem, inclusive no refazer.

### 8. Seleção de apenas um modelo não governa o trabalho

Com o modelo 96 aberto e somente o 97 marcado, a prévia continuou no 96.
`alvosDaImpressao(false)` também devolveu 96. O código só ativa seleção múltipla
quando existem pelo menos dois marcados (`pedido.js:6074`).

É especialmente relevante ao desmarcar dois de três modelos: o significado do
checkbox muda ao sobrar um. É necessário tornar explícito e consistente qual
modelo será impresso. Não foi enviado trabalho à impressora nesse cenário.

### 9. Compatibilidade não valida igualdade de blocos

`porQueNaoCombina` aceitou modelos com blocos 4 e 100. A regra do projeto proíbe
essa combinação. O comparador verifica cor, formato, saída, face, modo PDF e
modo de impressão, mas não igualdade de `bloco`/blocagem efetiva.

## Outros pontos da inspeção

- O cabeçalho da janela é preenchido com o modelo aberto, não com a seleção.
- A compatibilidade é conferida ao marcar; `problemaNaSelecao`, chamado antes
  de gerar, confere pedidos e existência dos itens, mas não repete todas as
  comparações. Mudanças de configuração posteriores merecem regressão própria.
- Na janela comum do Pedido, os alvos de confirmação são consultados depois da
  resposta assíncrona. A janela externa de produção por cor possui captura
  antecipada, mas rejeita seleção múltipla. Existe risco de o estado corrente
  não corresponder ao trabalho iniciado; não foi reproduzida uma interação
  real atravessando o bloqueio visual de geração.
- Gerar PDF não marca como impresso nos caminhos inspecionados. A impressão
  pede confirmação. Os principais caminhos de refazer excluem essa confirmação;
  o retorno de PDF simples em `pedido.js:7017` não aplica a mesma exclusão.
- PDFs especiais frente/verso possuem bloqueio explícito para multisseleção.
- No teste duplex com arte disponível, as três artes de verso foram escolhidas
  corretamente e o motor gerou seis páginas para três folhas. Isso não elimina
  os defeitos de numeração nem valida verso separado, capa ou todos os modos.
- O teste não cobriu banco CSV completo, fotos, camarote, pool QR Ideal,
  equipamentos, status remoto ou impressão física. Não há conclusão de
  funcionamento integral dessas integrações.

## Correção recomendada e critérios de aceite

1. Definir um único retrato do trabalho: alvos, modo, blocagem, quantidade,
   ordem dos modelos, arte/verso, escala e numeração resolvida.
2. Usá-lo na prévia, geração, refazer e confirmação. Seleção vazia pode seguir
   o modelo aberto; seleção não vazia precisa ter significado inequívoco.
3. Corrigir lista de artes, índice local e contrato de início. A solução para
   o início pode normalizar o payload no frontend; eventual mudança no motor
   exige escopo explícito e validação dos outros consumidores.
4. Validar blocos e demais compatibilidades também antes da geração.
5. Representar arte ausente/carregando sem substituí-la pela de outro modelo.
6. Identificar modelos e modo no cabeçalho e apresentar contagens consistentes
   com o plano efetivamente gerado.
7. Comparar todas as células de todas as folhas: modelo, índice local, número,
   frente/verso, escala, conjunto e quantidade. Incluir três modelos com
   quantidades/inícios diferentes, sobra, bloco completo, seleção reduzida a
   um, falha de arte, alteração durante geração e reimpressão de conjunto.

Para fechar o caso real 22247, ainda faltam os dados efetivos dos três modelos,
formato/poses, opções de impressão, numeração e versão servida/instalada. Os
defeitos acima foram demonstrados sem depender desses dados, mas não se deve
atribuir todos eles ao pedido real sem conferir suas condições.

## Complemento: cobertura de frente/verso e PDFs multipáginas

A primeira rodada não cobriu todos esses modos. Em resposta à pergunta seguinte,
foram acrescentados `tmp-analise-22247/modos.py` e `modos-preview.cjs`.

O motor fonte gerou corretamente as páginas/ faces esperadas em oito cenários
individuais: frente fixa, duplex embutido, duplex separado, PDF paginado frente,
PDF paginado duplex, paginado com verso único, ímpar/par e duplicar para verso.
Os casos paginados usaram três peças e duas poses, incluindo a sobra final.
Foram conferidos os textos identificadores de cada página, sem VDP nesses casos.

A função real `pdfDaFaceNaPreviaPedido` foi executada para conferir a escolha de
página/documento nos modos individuais. O harness existente de verso separado
também passou suas oito verificações. Esta etapa não foi uma inspeção visual
completa de cada modo no navegador.

| Configuração | Origem das faces da peça N |
|---|---|
| Frente fixa | Página 1 repetida |
| FxVerso fixo | Frente na página 1; verso na página 2 embutida ou página 1 do arquivo separado |
| PDF Paginado / Frente | Página N |
| PDF Paginado / FxVerso | Frente 2N-1; verso 2N |
| PDF Paginado / FxVersoUnico | Frente N; verso fixo do arquivo separado |
| PDF Ímpar Frente e Verso Par | Frente 2N-1; verso 2N; exige exatamente 2 × QTD páginas |
| Duplicar para Verso | Página N na frente e no verso; exige exatamente QTD páginas |

Para os dois modos especiais, o motor rejeitou quantidade de páginas incompatível
e presença de multi-artes. O frontend também possui bloqueio explícito de
multisseleção para eles em `pedido.js:6088`. Não se deve remover esses bloqueios
como efeito colateral de uma correção da seleção combinada.

### Novo defeito reproduzido: PDF Paginado comum combinado

Dois modelos comuns com `modo_pdf=true` passam em `porQueNaoCombina`.
A seleção sequencial retorna `sequential`, substituindo `pdf_multiple`.
No motor, fora de `pdf_multiple`, a página da frente é fixada em zero
(`engine.py:3535`, índice interno).

Em uma geração sintética com três modelos, cada um com PDF de três páginas e
quantidade três, o resultado teve **nove repetições da página 1**, sem páginas 2
ou 3. Não é apenas uma diferença de visualização. Os modos especiais possuem
travas; o PDF Paginado comum não possui proteção equivalente nesse caminho.

É necessário decidir explicitamente se PDFs paginados comuns serão impressos
individualmente ou se a combinação terá mapeamento de página local por modelo.
O segundo caminho exige preservar a página da frente e a do verso por célula,
além de modelo/índice/numeração. Suportar individualmente um modo não comprova
que ele possa ser combinado sem perder a paginação.

PDF e impressão usam a geração local, mas esta conferência não validou driver,
duplex físico, orientação de tombamento, seleção de bandejas, versão do NewProd
instalada ou os dados reais do pedido 22247. Os testes aprovados são de escolha
de páginas e geração sintética individual, não de todas as combinações entre
modos, numeração, blocos, refazer e equipamentos.
