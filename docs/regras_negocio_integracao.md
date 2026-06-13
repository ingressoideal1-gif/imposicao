# Documento de Regras de Negócio e Integração: Ideal Imposition

## 1. Visão Geral do Sistema

O **Ideal Imposition** é um sistema satélite e de apoio à plataforma parceira **E-deal (Vibecode)**. Sua função principal é processar, estruturar e gerenciar as regras de imposição de páginas, esquemas de numeração e parâmetros de saída para arquivos PDF ou fluxos de impressão.

O sistema baseia-se em quatro pilares configuráveis:

* **Formatos:** Definição das dimensões da página e do seu respectivo esquema de imposição.
* **Numerações:** Regras e esquemas para inclusão de dados fixos e variáveis no layout da página.
* **Cores:** Definição da base cromática inicial onde as numerações serão aplicadas e visualizadas.
* **Saídas:** Determinação das dimensões do substrato/página final onde os PDFs serão posicionados ou direcionados para impressão.

---

## 2. Arquitetura de Telas e Funcionalidades (Módulos)

### 2.1. Fluxos de Trabalho (Workflows)

* **Lista de Impressão:** Exibe em formato de listagem todos os pedidos originados do E-deal que estão aptos para a produção (Filtro por `Status: Liberado`).
* **Lista de Artes:** Exibe em formato de listagem todos os pedidos do E-deal que estão na etapa de design/revisão de arquivos (Filtro por `Status: Em Arte`).

### 2.2. Cadastros e Configurações (CRUDs)

* **Formatos / Lista de Formatos:** Interface para criação, edição e gerenciamento de templates de imposição de páginas.
* **Numeração / Lista de Numeração:** Interface para parametrização e listagem de regras de dados variáveis e sequenciais.
* **Cores / Lista de Cores:** Interface para cadastro e gerenciamento das paletas e bases cromáticas do sistema.
* **Saídas:** Configuração e edição dos formatos de fechamento e arquivos de saída final.

### 2.3. Validação e Histórico

* **Amostras (Preview):** Ambiente de homologação visual onde ocorre a consolidação dos dados de *Formato*, *Numeração*, *Cores* e *Artes*. Fornece ao operador uma renderização fiel (WYSIWYG) do projeto finalizado antes da geração do arquivo de saída.
* **Lista de Imposição:** Repositório de imposições pré-salvas, permitindo o reaproveitamento de layouts homologados.

---

## 3. Arquitetura de Integração: Ideal Imposition <-> E-deal

A integração entre as plataformas ocorre de forma bidirecional via API, operando sob as seguintes premissas:

### 3.1. Outbound (Ideal Imposition -> E-deal)

O Ideal Imposition disponibiliza os payloads de configurações ativas para que o E-deal consuma e popule os campos correspondentes dentro dos Pedidos. Adicionalmente, o Imposition sincroniza e atualiza os seguintes estados:

* Mudanças de `Status` críticos.
* Atualizações nos fluxos de `Impressão` e `Arte`.

### 3.2. Inbound (E-deal -> Ideal Imposition)

O E-deal injeta no Ideal Imposition as payloads de metadados necessárias para alimentar as filas de *Lista de Impressão* e *Lista de Artes*. Os dados mínimos obrigatórios compreendem:

| Categoria | Parâmetros / Campos da API |
| --- | --- |
| **Identificação** | `Numero_Pedido`, `ID_Modelo`, `Produto`, `Setor` |
| **Atores** | `Dados_Cliente`, `Vendedor` |
| **Cronograma** | `Data_Liberacao`, `Prazo_Entrega` |
| **Especificações Técnicas** | `Formato`, `Quantidade`, `Numeracao`, `Cor`, `Verso` (Booleano), `Bloco` |

---

### 💡 Sugestões de Melhorias para o Desenvolvimento (Antigravity):

1. **Padronização de Status (Mapeamento):** É altamente recomendável criar uma tabela de *DE-PARA* para garantir que o `Status: Liberado` no E-deal corresponda exatamente ao mesmo ID/Enum dentro do Antigravity.
2. **Definição de Gatilhos (Webhooks):** Estabelecer se o envio de dados do E-deal para a *Lista de Impressão* ocorrerá via *Webhook* em tempo real (sempre que um pedido for liberado) ou via *Polling* (rotina de consulta programada de tempos em tempos).
