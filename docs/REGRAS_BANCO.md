# Regras de Banco de Dados — Ideal Imposition + Vibecode

> **Data da decisão**: 2026-06-13
> **Aprovado por**: Junior (proprietário)
> **Status**: ✅ ATIVO — Consultar SEMPRE antes de modificar tabelas
> **Ref**: [Regras de Segurança Vibecode](file:///C:/Users/Junior/Projetos%20Ingresso%20ideal/Regras%20de%20Seguran%C3%A7a%20Vibecode.txt)

---

## 🏠 Banco Único: Supabase do Vibecode

**URL**: `https://vwbtitjlpelrcnsytzqw.supabase.co`

Todos os dados — tanto do ERP (Vibecode) quanto do Imposition — vivem no **mesmo banco Supabase**.

O banco antigo do Imposition (`atsxtuibeitloosckmlc.supabase.co`) será **descontinuado**.

---

## 🔒 Regra de Ouro: NUNCA alterar tabelas do parceiro

> [!CAUTION]
> As tabelas listadas abaixo são **propriedade do Vibecode**. O Imposition pode **LER** mas **JAMAIS** deve alterar a estrutura (schema), inserir, atualizar ou deletar dados nestas tabelas.

### Tabelas do Vibecode (SOMENTE LEITURA)

| Tabela | Descrição |
|--------|-----------|
| `propostas` | Propostas comerciais |
| `produtos_proposta` | Itens das propostas |
| `produtos` | Catálogo de produtos |
| `clientes` | Base de clientes |
| `pedidos` | Pedidos (futuros) |
| `pagamentos_v2` | Pagamentos |
| `boletos` | Boletos |
| `notas_fiscais` | NF-e |
| `notas_servico` | NFS-e |
| Qualquer tabela sem prefixo `producao_` | Propriedade do Vibecode |

### Regras:
1. ❌ **NÃO** fazer ALTER TABLE em tabelas do parceiro
2. ❌ **NÃO** fazer INSERT/UPDATE/DELETE em tabelas do parceiro
3. ❌ **NÃO** criar triggers ou views que modifiquem tabelas do parceiro
4. ❌ **NÃO** alterar RLS, triggers, RPCs ou Edge Functions existentes
5. ❌ **NÃO** usar `service_role` no frontend
6. ❌ **NÃO** usar DELETE físico (soft delete apenas)
7. ❌ **NÃO** renomear colunas existentes
8. ✅ **SIM** fazer SELECT/leitura nas tabelas do parceiro
9. ✅ **SIM** criar NOVAS tabelas com prefixo `producao_`
10. ✅ **SIM** referenciar tabelas do parceiro via FK (usar `id_int`, `id_cliente`, `id_produto`)

---

## 🆕 Tabelas de Catálogo do Imposition (Aprovadas & Criadas)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `producao_formatos` | Formatos de ingresso (largura, altura, grid) | ✅ Criado |
| `producao_numeracoes` | Templates de numeração (QR, barcode, texto) | ✅ Criado |
| `producao_saidas` | Formatos de folha de saída (A4, A3, SRA3) | ✅ Criado |
| `producao_cores` | Cores de fundo com PDF de referência | ✅ Criado |
| `producao_modelos_imposicao` | Modelos salvos de imposição | ✅ Criado |
| `producao_produtos_formatos` | Relacionamento de produtos do ERP aos formatos | ✅ Criado |

## ⏳ Tabelas Operacionais/Runtime (Postergadas para Próxima Fase)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `producao_usuarios` | Usuários da produção (integração pendente com ERP) | ⏳ Pendente |
| `producao_ordens_servico` | Cabeçalho de OS (verificar derivação de pedidos/propostas) | ⏳ Pendente |
| `producao_os_itens` | Itens de cada OS | ⏳ Pendente |
| `producao_lotes_impressao` | Lotes operacionais de impressão | ⏳ Pendente |
| `producao_lote_itens` | Itens vinculados aos lotes de impressão | ⏳ Pendente |
| `producao_os_log` | Logs operacionais de produção | ⏳ Pendente |

---

## 📋 Convenções (alinhadas com Vibecode)

- **Prefixo `producao_`**: Todas as tabelas do Imposition
- **Sem prefixo**: Tabelas do Vibecode (não tocar)
- **FKs para propostas**: usar `id_int`
- **FKs para clientes**: usar `id_cliente`
- **FKs para produtos**: usar `id_produto`
- **Campos obrigatórios**: `created_at` e `updated_at` em toda tabela nova
- **Status**: `TEXT` controlado por whitelist no código (não por CHECK constraint)
- **Soft delete**: usar campo de status, nunca DELETE físico
- **Fluxo**: Diagnóstico → Plano → Aprovação → Implementação → Validação

---

## 🔑 Credenciais

| Sistema | Supabase URL | Uso |
|---------|-------------|-----|
| **Vibecode (ERP)** | `vwbtitjlpelrcnsytzqw.supabase.co` | Banco único (leitura + escrita `producao_*`) |
| ~~Imposition (antigo)~~ | ~~`atsxtuibeitloosckmlc.supabase.co`~~ | ~~Descontinuado~~ |

---

## 🛡️ AUTORIZAÇÃO ESPECIAL — MÓDULO PRODUÇÃO

### Permissões autorizadas:
- Criar tabelas novas com prefixo `producao_`
- Criar índices
- Criar buckets (Storage)
- Criar views
- Criar triggers `updated_at`
- Criar políticas RLS do módulo Produção

### Requisitos Obrigatórios:
- Usar UUID como PK (Chave Primária)
- Usar `created_at` e `updated_at` (com triggers de sincronização)
- Usar `empresa_id` quando aplicável
- Documentar toda tabela antes da criação

### Ações Proibidas:
- Alterar qualquer tabela existente do ERP (Vibecode)
- Alterar fluxos de financeiro, fiscal, checkout ou cobranças
- Alterar RPCs, triggers ou políticas RLS existentes

> [!IMPORTANT]
> Toda e qualquer alteração de schema deve vir primeiro como plano técnico e DDL para aprovação formal antes da execução física.

