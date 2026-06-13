# Revisão Complementar: Arquitetura Operacional e Políticas de Segurança (RLS)
## Módulo de Imposição Gráfica & VDP

Este documento apresenta a revisão complementar de arquitetura operacional e segurança exigida para a homologação e aprovação conceitual do módulo de imposição no Supabase de Produção, respondendo às ressalvas apontadas e em conformidade com as regras de **UUID como PK** e **empresa_id**.

---

### 1. Entidade Operacional Principal: `producao_lotes_impressao`

Para representar a execução real (runtime) do motor de imposição, a entidade operacional principal será chamada de **`producao_lotes_impressao`**. 

Um **Lote de Impressão** representa a materialização física de uma ou mais ordens na folha de papel de saída. Cada vez que o operador executa a imposição e gera o PDF final, um novo lote é registrado.

#### Estrutura da Entidade `producao_lotes_impressao`:
*   `id` (UUID PK): Identificador único do lote (gerado via `gen_random_uuid()`).
*   `empresa_id` (UUID): Tenant ID para separação multi-empresa.
*   `modelo_imposicao_id` (UUID FK → `producao_modelos_imposicao`): Receita de configuração usada para a imposição.
*   `pdf_saida_url` (TEXT): Link do arquivo PDF gerado e armazenado no Storage.
*   `total_folhas` (INTEGER): Quantidade de folhas físicas a serem impressas (calculado pelo motor).
*   `quantidade_total_itens` (INTEGER): Soma de todas as poses personalizadas no lote.
*   `status` (TEXT): Estado do lote no fluxo produtivo (ver seção 3).
*   `operador_id` (UUID FK → `producao_usuarios`): Usuário que realizou a imposição.
*   `created_at` (TIMESTAMPTZ): Data/hora de geração.
*   `updated_at` (TIMESTAMPTZ): Data/hora de última alteração de status.

---

### 2. Entrada de Propostas/Produtos no Fluxo de Imposição

O acoplamento entre o ERP e o Imposition ocorre na transição do fechamento comercial para a pré-impressão:

```mermaid
sequenceDiagram
    participant ERP as ERP (Vibecode)
    participant DB as Supabase (Tabelas ERP)
    participant IMP as Fila de Imposição (Frontend)
    participant ENG as Motor Imposição (Python API)
    participant LOT as Tabela producao_lotes_impressao

    ERP->>DB: 1. Proposta comercial vira Pedido/OS (produtos_proposta com qtd)
    ERP->>DB: 2. Upload da arte aprovada e associação do arquivo de VDP (se houver)
    IMP->>DB: 3. Consulta periódica de itens de produtos_proposta com status 'APROVADA'
    IMP->>IMP: 4. Exibe na fila de pendentes agrupado por Proposta (id_int)
    Note over IMP: Operador clica em "🖨️ Impor"
    IMP->>ENG: 5. Dispara POST /api/impose (PDF base + metadados de layout + VDP)
    ENG->>ENG: 6. Gera o PDF imposto e envia para o Storage
    ENG->>LOT: 7. Registra novo registro em producao_lotes_impressao (status 'PDF_GERADO')
```

---

### 3. Rastreamento e Status (Máquina de Estados)

O rastreamento de cada item de produto/OS dentro do fluxo operacional do Imposition será controlado rigorosamente por meio de uma máquina de estados na tabela de junção `producao_lote_itens`.

```mermaid
stateDiagram-v2
    [*] --> AGUARDANDO_IMPOSICAO : OS Aprovada no ERP
    AGUARDANDO_IMPOSICAO --> EM_IMPOSICAO : Operador carrega item no Canvas
    EM_IMPOSICAO --> AGUARDANDO_IMPOSICAO : Operador cancela setup
    EM_IMPOSICAO --> PDF_GERADO : Imposição executada / PDF salvo no Storage
    PDF_GERADO --> ENVIADO_IMPRESSAO : Despachado para o Print Agent local
    ENVIADO_IMPRESSAO --> IMPRESSO : Impressor confirma rodagem física
    IMPRESSO --> CONCLUIDO : Passou pelo acabamento (corte/conferência)
    
    PDF_GERADO --> AGUARDANDO_IMPOSICAO : Rejeitado/Ajuste de layout
    ENVIADO_IMPRESSAO --> ERRO : Falha de hardware/agente local
    ERRO --> ENVIADO_IMPRESSAO : Reenvio de job
```

*   **Rastreabilidade:** Cada transição escreve automaticamente um log na tabela `producao_os_log` para auditoria, registrando o carimbo de data, operador e o status anterior/atual.

---

### 4. Modelo Conceitual da Execução Operacional (UUID e empresa_id)

A arquitetura separa claramente o **Catálogo de Configuração** (gabaritos estáticos) da **Execução em Tempo de Execução** (runtime/lotes operacionais) utilizando o tipo `UUID` em todas as conexões relacionais:

```mermaid
classDiagram
    %% Tabelas do ERP (Somente Leitura)
    class produtos_proposta {
        +id int
        +id_int int
        +nome_produto text
        +qtd int
    }

    %% Tabelas de Catálogo (Configuração)
    class producao_formatos {
        +id uuid PK
        +empresa_id uuid
        +name text
        +width_mm real
        +height_mm real
    }
    class producao_numeracoes {
        +id uuid PK
        +empresa_id uuid
        +name text
        +elements jsonb
    }
    class producao_saidas {
        +id uuid PK
        +empresa_id uuid
        +name text
    }
    class producao_cores {
        +id uuid PK
        +empresa_id uuid
        +name text
        +pdf_url text
    }
    class producao_modelos_imposicao {
        +id uuid PK
        +empresa_id uuid
        +formato_id uuid FK
        +saida_id uuid FK
        +numeracao_id uuid FK
    }

    %% Tabelas de Execução (Operacional)
    class producao_lotes_impressao {
        +id uuid PK
        +empresa_id uuid
        +modelo_imposicao_id uuid FK
        +pdf_saida_url text
        +total_folhas int
        +status text
        +operador_id uuid
    }
    class producao_lote_itens {
        +id uuid PK
        +empresa_id uuid
        +lote_id uuid FK
        +vibe_produto_proposta_id int FK
        +status_item text
    }

    producao_modelos_imposicao --> producao_formatos
    producao_modelos_imposicao --> producao_saidas
    producao_modelos_imposicao --> producao_numeracoes
    producao_modelos_imposicao --> producao_cores

    producao_lotes_impressao --> producao_modelos_imposicao
    producao_lote_itens --> producao_lotes_impressao
    producao_lote_itens --> produtos_proposta : "vincula com ERP"
```

*   **Suporte a Multi-Artes:** A tabela de junção `producao_lote_itens` permite que um único Lote de Impressão (`producao_lotes_impressao`) contenha múltiplos itens de propostas diferentes (`produtos_proposta`), otimizando o aproveitamento do papel de saída (ex: agrupar 3 pedidos de pulseiras vermelhas de clientes diferentes na mesma folha SRA3).

---

### 5. Políticas RLS Planejadas (Segurança Supabase)

Para proteger a integridade dos dados compartilhados, o RLS será ativado por padrão em todas as tabelas `producao_*`. As políticas são baseadas na role JWT e no `empresa_id`:

#### A. Tabelas de Catálogo/Configuração
(`producao_formatos`, `producao_saidas`, `producao_cores`, `producao_numeracoes`, `producao_modelos_imposicao`)
*   **`SELECT`**: Permitido para qualquer usuário autenticado que pertença à respectiva empresa.
    *   *Regra SQL:* `CREATE POLICY select_catalogo ON producao_formatos FOR SELECT TO authenticated USING (empresa_id = auth.jwt() ->> 'empresa_id');`
*   **`INSERT / UPDATE / DELETE`**: Restrito a administradores e gerentes da mesma empresa.
    *   *Regra SQL:* `CREATE POLICY write_catalogo ON producao_formatos FOR ALL TO authenticated USING (empresa_id = auth.jwt() ->> 'empresa_id' AND auth.jwt() ->> 'role' IN ('admin', 'gerente'));`

#### B. Tabelas Operacionais/Execução
(`producao_lotes_impressao`, `producao_lote_itens`)
*   **`SELECT`**: Permitido para qualquer usuário autenticado da empresa.
*   **`INSERT / UPDATE`**: Permitido para qualquer operador ativo da pré-impressão/produção.
    *   *Regra SQL:* `CREATE POLICY write_operacional ON producao_lotes_impressao FOR INSERT OR UPDATE TO authenticated USING (empresa_id = auth.jwt() ->> 'empresa_id' AND auth.jwt() ->> 'role' IN ('admin', 'gerente', 'operador'));`
*   **`DELETE`**: Bloqueado por completo (Apenas soft delete via alteração de status para `CANCELADO` ou `INATIVO`).

#### C. Tabela de Logs e Auditoria
(`producao_os_log`)
*   **`SELECT`**: Restrito a gerentes e administradores da empresa.
*   **`INSERT`**: Permitido (escrita automática pelo sistema pós-ações).
*   **`UPDATE / DELETE`**: Bloqueado para todos (garante que os logs de auditoria nunca sejam apagados ou modificados).
