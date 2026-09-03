# Documentação Técnica Geral - Módulo de Produção (Ideal Imposition)

> [!NOTE]
> Esta documentação reflete o estado atual do sistema **Ideal Imposition** que foi construído até o momento, operando com stack baseada em Frontend Vanilla (HTML/CSS/JS), Backend Python (FastAPI) e Banco de Dados Supabase compartilhado (Schema `producao_*`). A integração final com um ERP Next.js será mapeada como passo futuro.

## 1. Visão Geral do Módulo
- **Objetivo do módulo**: Gerenciar fluxos de PCP e impressão, permitindo o cadastro de formatos, criação de regras de numeração (VDP - Variável de Dados Pessoais) e configuração de saídas para imposição gráfica.
- **Fluxo Operacional Esperado**:
  1. Cadastro de insumos e gabaritos (Formatos, Cores, Saídas).
  2. Definição de regras de numeração e dados variáveis.
  3. Geração e validação de "Amostras" da imposição gráfica.
  4. Atendimento de itens de uma Ordem de Serviço (OS) gerando Lotes de Impressão (arquivos PDF finais).
- **Perfis/Usuários**: Operadores de pré-impressão/PCP, Gerentes de Produção e Administradores (conforme tabela `producao_usuarios`).

## 2. Mapa de Telas e Rotas (Single Page Application)
O módulo frontend atualmente funciona como uma **SPA** centralizada em `frontend/index.html` via manipulação de DOM pelo arquivo principal `frontend/script.js`.

As seções (views) implementadas são:
- **📐 Formatos** (`#view-formatos` e `#view-lista-formatos`): Criação da grade geométrica da imposição (colunas, linhas, gaps e offsets).
- **🔢 Numeração** (`#view-numeracao` e `#view-catalogo`): Editor de variáveis (códigos, textos, QR codes, código de barras) em cima do formato.
- **📄 Saídas** (`#view-saidas`): Definição de tamanhos de mídias de impressão (A3, A4, etc).
- **🎨 Cores** (`#view-cores` e `#view-lista-cores`): Gerenciamento de pantones ou paletas de marcação.
- **🖨️ Imposição e Amostras** (`#view-imposicao` e `#view-amostras`): Interface central para gerar arquivos unificados, rotacionar frentes e versos e aprovar testes antes da fila final.
- **📋 Listas Operacionais** (`#view-lista-impressao`, `#view-lista-arte`): Filas e relatórios de acompanhamento da produção (Kanban adaptado/Tabelas).

*Fonte de Dados Atual*: Comunicação via REST API com o motor Python (`engine.py`/`app.py`) e conexão direta/backend ao **Supabase**.

## 3. Fluxo de Dados Atual
O fluxo mapeado e implementado na base de dados (`schema_unificado.sql`) segue a trilha:
1. **Abertura de OS**: Entrada na tabela `producao_ordens_servico`.
2. **Itens da OS**: Registros em `producao_os_itens` (detalhando modelo, formato, cor, numeração, etc).
3. **Imposição Lógica**: O motor Python recebe os dados, lê a arte estática (`impArtImage`) e as coordenadas de numeração (do Supabase/Canvas).
4. **Geração PDF (Lotes)**: É criado um registro em `producao_lotes_impressao` contendo a URL de saída do PDF gerado no Storage.
5. **Produção/Impressão**: O status transita de `PDF_GERADO` para `IMPRESSO` até `CONCLUIDO`.

## 4. Tabelas Supabase Envolvidas
As tabelas focadas na Imposição gráfica usam o prefixo `producao_`.  A integração com as tabelas do ERP (`public.propostas`, `public.pedidos`, etc.) é referenciada via IDs externos.

- **`producao_formatos`**: Geometria base (LxA, Colunas, Linhas, Gaps).
- **`producao_numeracoes`**: Configuração do canvas (elementos JSON, posição de VDP, links para CSV).
- **`producao_saidas` e `producao_cores`**: Complementos de hardware de impressão e design.
- **`producao_modelos_imposicao`**: Agrupamento do Formato + Saída + Numeração.
- **`producao_ordens_servico`** e **`producao_os_itens`**: Ordens de produção reais (equivalente aos pedidos a serem fabricados).
- **`producao_lotes_impressao`**: Armazena os PDFs finais gerados.
- **`producao_lote_itens`**: Possui a coluna `vibe_produto_proposta_id` apontando diretamente para as tabelas do ERP Vibecode.

> [!TIP]
> Os logs de alteração e auditoria são armazenados em **`producao_os_log`**.

## 5. Status Operacionais (Mapeamento)
Os status controlam o andamento do item na fábrica:

- **Status de OS**: `PRODUÇÃO`
- **Status de Item (Impressão)**: `Aguardando` · `Impresso` · `Corrigir Arte`

  Eram quatro (`AGUARD.`, `PARCIAL`, `IMPRESSO`, `ERRO`) até 28/08/2026, quando
  *Parcial* e *Erro* saíram por decisão do usuário — nunca tinham sido usados
  (zero ocorrências no banco), e o meio-caminho de um pedido quem conta é a
  coluna Progresso. Valores legados ainda podem existir em linhas antigas e
  **leem como `Aguardando`**. *Corrigir Arte* entrou em 02/09/2026; ver a seção
  própria mais abaixo.
- **Status de Lote de Impressão**:
  - `AGUARDANDO_IMPOSICAO`
  - `EM_IMPOSICAO`
  - `PDF_GERADO`
  - `ENVIADO_IMPRESSAO`
  - `IMPRESSO`
  - `CONCLUIDO`

## 6. Pontos em Transição ou Mockados
- **Integração ERP Frontend**: Como a UI central ainda é o Vanilla JS do *Ideal Imposition*, os fluxos que viriam do painel principal (ERP) são iniciados de forma autônoma ou via rotas diretas (mockando o disparo da OS pelo sistema de Imposição).
- **Upload e Fetch de Artes**: Dependendo da rota, ainda simulamos as artes estáticas ou referenciamos mocks predefinidos antes do link persistente do bucket.

## 7. Escritas Reais Já Existentes
- **Operação de Gabaritos**: Criação/Atualização via `script.js` salvando o JSON de geometria e elementos de VDP na respectiva tabela (`producao_formatos` / `producao_numeracoes`).
- **Log de Ação**: Movimentações (aprovação, cancelamento de lote) gravam registros de eventos nas tabelas operacionais.
- **Payloads Reais**: O motor FastAPI processa JSONs complexos contendo arrays de artes (`impMultiArtes`), vetores de texto (`elements`), e dados em lote (`csv_data`), armazenando os resultados na tabela `producao_lotes_impressao`.

## 8. Segurança e RLS
> [!WARNING]
> No estágio atual de desenvolvimento, e para permitir comunicação irrestrita entre APIs internas locais e Supabase em desenvolvimento, o arquivo `schema_unificado.sql` contém `ALTER TABLE [nome_da_tabela] DISABLE ROW LEVEL SECURITY;`.
- **Policies Necessárias Futuras**: Será preciso restringir o `INSERT` de Lotes apenas aos usuários autenticados (com roles adequadas como `operador` ou `gerente`).

## 9. Pendências Técnicas e Tecnológicas
- [ ] **Migração da Interface (Opcional/Roadmap)**: Portar os painéis de Formato e Numeração do `script.js` (Vanilla) para componentes React (Next.js) se houver unificação total no ERP.
- [ ] **Integração Plena de Chaves Estrangeiras**: Assegurar que `vibe_produto_proposta_id` correlacione fielmente e retorne callbacks de finalização para a interface raiz.
- [ ] **Refinamento de Políticas de Segurança**: Ativar o RLS em todas as tabelas `producao_` após firmar o fluxo de autenticação via Supabase/JWT definitivo.

## 10. Roadmap Sugerido
- **Fase 1**: Refinamento da Imposição Matemática e Estabilização da API Python. (Concluído)
- **Fase 2**: Integração dos Lotes de Impressão e UI SPA de Configurações (Concluído/Ajustes finos).
- **Fase 3**: Integração do webhook de encerramento do Lote de Impressão com os itens de Pedido (ERP).
- **Fase 4**: Workflow consolidado com expedição final no módulo financeiro/estoque.

---

## A ordem da fila: prazo de entrega, do menor para o maior (02/09/2026)

Pedido do usuário: *"no painel de produção, a lista dos pedidos deve estar em
ordem de prazo de entrega, do menor para o maior"* — e, em seguida, *"assim como
no painel de acabamento"*.

Até aqui as duas listas saíam na ordem em que `state.ordens` nasce: **número do
pedido, do maior para o menor**. Isso põe o pedido mais NOVO na frente, que é o
contrário do que a gráfica precisa — quem vence antes tem de sair da impressora
antes. Numa fila de dezenas de pedidos, o que vencia hoje podia estar no fim da
tela.

A função é uma só, `ordenarPorPrazoDeEntrega` (no `script.js`), e o Painel do
Acabamento a **chama de lá** em vez de repetir a conta — como já fazia com o
atraso e o para-hoje. Duas cópias da regra de data divergiriam no primeiro
ajuste, e as duas telas passariam a mostrar filas diferentes do mesmo dia.

**O prazo é `propostas_os.data_termino`**, lido pelo mesmo `_prazoDoPedido` dos
botões "Para Hoje" e "Atrasados".

**Três regras que vêm junto:**

- **Pedido sem prazo vai para o fim.** `propostas_os` ainda está sendo
  preenchida pelo parceiro, e pedido sem data não pode encabeçar a fila como se
  vencesse hoje — que é onde um `null` tratado como zero o poria numa ordem
  crescente.
- **Empate no mesmo dia desempata pelo número MENOR**, o pedido que entrou
  antes; sem isso a lista "dança" entre desenhos.
- **Clicar num cabeçalho continua vencendo.** A ordem por prazo é aplicada antes
  do `aplicarProdSort`, como a dos impressos.

**Os históricos ficam de fora**, e cada um mantém a ordem que já tinha: o botão
IMPRESSO sai do mais recente ao mais antigo (seção abaixo) e o botão EXPEDIÇÃO
do Acabamento continua com o pedido mais novo no topo. Neles não há trabalho a
fazer, e o que interessa é o que acabou de sair.

Testes: `tests/ordem_por_prazo_de_entrega_harness.js` e
`tests/test_ordem_por_prazo_de_entrega.py`. Conferido também na tela real, com os
pedidos do dia: 9 linhas na Produção e 35 no Acabamento, todas em ordem
crescente e com os sem prazo no fim.

## O status "Corrigir Arte" (02/09/2026)

Pedido do usuário: *"no painel da produção, na edição do modelo, vamos adicionar
o status 'Corrigir Arte'. Ao selecionar esse status para um modelo, o pedido deve
listar no painel de arte, card Em Arte, para ser editado pelo designer"*.

### O buraco que ele fecha

Um pedido que já saiu para a produção conta **só** no card "Pedidos Concluídos" da
Lista de Arte — é a regra do `pedidoSaiuDaArte`, e ela está certa para o caso
normal: o designer não deve ter na frente dele pedido que já é trabalho da
impressora. O efeito colateral era que, quando a produção descobria um erro de
arte, não havia o que apertar. O recado ia por fora do sistema.

### O que a marca faz

É o terceiro valor do seletor **Status** da linha do modelo, e faz três coisas de
uma vez:

1. **trava a impressão daquele modelo** — e só daquele; os outros do mesmo pedido
   seguem imprimindo. O botão de imprimir some da linha e da prévia, e as duas
   telas de imposição recusam o `print`. **Gerar o PDF continua liberado**: é
   assim que se confere o erro sem gastar papel;
2. **traz o pedido de volta para o card "Em Arte"**, vencendo o `pedidoSaiuDaArte`.
   No card do modelo, uma faixa âmbar diz ao designer qual modelo a produção
   devolveu — o card mostra o pedido, não o modelo;
3. **sai sozinha** quando o designer marca aquele modelo 🎨 PRONTO: ele volta para
   *Aguardando* e a impressão libera.

### As quatro decisões do usuário

| pergunta | decisão |
|---|---|
| o que libera a impressão de volta | o PRONTO **daquele** modelo |
| o que a marca trava | **só aquele** modelo |
| para onde o modelo volta | **Aguardando**, nunca Impresso: a arte mudou |
| em que card o pedido aparece | **só** em "Em Arte" |

A terceira é a que dispensa coluna nova: como a volta é sempre para *Aguardando*,
não há status anterior a guardar. O valor mora em
`pedidos_modelos.status_impressao`, a mesma coluna dos outros dois — um modelo
está numa situação de cada vez.

### Onde a regra mora

`STATUS_CORRIGIR_ARTE`, `modeloEmCorrecaoDeArte` e `modelosEmCorrecaoDeArte`, no
`frontend/script.js`, uma vez só; o `pedido.js` os consulta pelo `window`. Os
**quatro** seletores de status oferecem a opção, e não só o da tela onde ela é
marcada: um `<select>` sem opção para o valor guardado mostra a primeira, e o
modelo apareceria como *Aguardando* nas outras telas.

Pedido cancelado não volta: a marca é conferida depois do `pedidoCancelado`.
Num modelo já aprovado pelo cliente o botão PRONTO nasce desabilitado, e a faixa
manda passar antes por **❌ EM ALTERAÇÃO**.

Guardado por `tests/corrigir_arte_harness.js` e `tests/test_corrigir_arte.py`.

---

## A ordem da lista no botão IMPRESSO

O Painel de Produção tem quatro filtros: **Geral**, **Para Hoje**, **Atrasados** e
**IMPRESSO**. Os três primeiros são fila de **trabalho a fazer** — quem vem na
frente é quem precisa sair primeiro. O quarto é um **histórico**, e por isso tem
ordem própria: **do mais recente ao mais antigo**, pela data em que o pedido
ficou impresso (pedido do usuário, 22/08/2026).

**De onde vem a data.** O banco carimba `pedidos_modelos.status_impressao_em`
quando `status_impressao` passa a "Impresso" — pelo gatilho
`trg_carimba_status_impressao_em`, criado em `sql/data_do_status_impresso.sql`.
A data do **pedido** é a MAIOR entre as dos modelos dele
(`quandoOPedidoFicouImpresso`): o pedido só fica impresso quando o último modelo
é marcado.

**Por que um gatilho, e não o código da tela.** Quem marca "Impresso" pode ser o
site, o agente local pela estacão ou o ERP do parceiro pela tela dele. Carimbar
no frontend deixaria de fora dois desses três, e a lista sairia com buracos
exatamente nos pedidos que a gráfica tocou pela estação.

**Por que não `updated_at`.** Ela muda em qualquer gravação do modelo — troca de
cor, de gabarito, de observação — e em 22/08/2026 estava nula em 57 dos 129
modelos impressos. Ordenar por ela poria no topo o pedido que alguém abriu por
último, e não o que saiu por último da impressora.

**Duas regras que vêm junto:**

- **Clicar num cabeçalho continua vencendo.** A ordem por data é aplicada antes
  do `aplicarProdSort`; escolher uma coluna é uma decisão explícita do operador,
  e ela manda mais que a ordem que a tela traz sozinha.
- **Pedido sem data vai para o fim**, e não para o topo — que é onde um `null`
  tratado como zero o poria numa ordem decrescente. O histórico anterior a
  22/08/2026 foi preenchido por aproximação (`updated_at`, ou `created_at` onde
  ela era nula), justamente para essa fila não existir.

Testes: `tests/ordem_dos_impressos_harness.js` e `tests/test_ordem_dos_impressos.py`.

## O botão IMPRESSO mostra TODOS os impressos, paginado (01/09/2026)

Pedido do usuário: *"no painel de produção no botão 'IMPRESSO' também devem
aparecer todos os pedidos já impressos, mostrar os últimos 30 mas deixar todos
disponíveis para pesquisa"*.

### O que estava errado

A lista dos quatro botões saía toda de `ordensImpressao`, que é a **fila**: ela
exige `status_interno` em produção e tira quem já passou da gráfica. Enquanto ela
foi a base do botão IMPRESSO, o pedido sumia do histórico de impressão assim que
o ERP o mandava para o acabamento, a expedição ou a entrega — ou seja, o registro
do que a impressora produziu se apagava exatamente quando o trabalho terminava.

### Como ficou

No botão IMPRESSO a base passa a ser `state.ordens` inteira, recortada pelo
único critério que importa ali: **todos os modelos impressos**
(`pedidoTotalmenteImpresso`). Geral, Para Hoje e Atrasados continuam saindo da
fila, porque são trabalho a fazer.

O que **não** mudou de base: as métricas do topo e o alerta vermelho de
"Atrasados" continuam olhando `ordensImpressao`. Pedido já impresso e entregue
não pode acender o alarme de atraso nem contar como fila.

### E pagina de 30 em 30

Como o card "Pedidos Concluídos" da Lista de Arte e o botão "Expedição" do
Acabamento — as três listas de arquivo do sistema, com o mesmo rodapé
("← Anteriores | Página N de M | Próximos →") e o mesmo número
(`HISTORICO_POR_PAGINA`, no `script.js`).

> [!IMPORTANT]
> **O recorte é o último passo: filtrar, ordenar, só então cortar.** Por isso o
> contador do topo continua dizendo quantos pedidos a busca achou no histórico
> inteiro, e por isso a pesquisa alcança o pedido que está na página 4. Subir o
> `slice` para antes do filtro faria a busca enxergar apenas a página aberta —
> o mesmo defeito de esconder histórico, entrando por outra porta.

O rodapé vive no `#paginacao-impressao`, que existe no `index.html` **e** na
`producao.html`: as duas desenham esta tela, e esquecer uma deixaria metade das
estações sem paginação.

Testes: `tests/historico_de_artes_harness.js` e `tests/test_historico_de_artes.py`.
