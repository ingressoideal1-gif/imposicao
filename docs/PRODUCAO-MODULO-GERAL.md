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
- **Status de Item (Impressão)**: `AGUARD.` ➔ `PARCIAL` ➔ `IMPRESSO` ➔ `ERRO`
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
