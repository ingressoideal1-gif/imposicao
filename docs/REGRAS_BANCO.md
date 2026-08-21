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

## 🖥️ Tabelas do Painel (prefixo `imposition_`)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `imposition_user_permissions` | Permissões por pessoa (uma coluna por permissão) | ✅ Criado |
| `imposition_acessos_locais` | Códigos de acesso local das estações da gráfica | ✅ Criado |
| `imposition_segredos` | Segredos do painel | ✅ Criado |
| `imposition_tempo_no_card` | Há quanto tempo cada pedido está no card da Lista de Arte | ✅ Criado 19/08/2026 |
| `imposition_operadores` | **View** — só os nomes dos acessos locais, para o seletor de responsável do Painel do Acabamento | ✅ Criado 20/08/2026 |

> [!IMPORTANT]
> `imposition_user_permissions` tem **uma coluna por permissão**. Enviar uma coluna
> que não existe faz o PostgREST recusar a escrita inteira com 400 — e o painel
> perde a gravação toda, não só a permissão desconhecida.

> [!CAUTION]
> `imposition_operadores` é uma **view**, e existe justamente para que a tabela
> `imposition_acessos_locais` continue fechada. Ela expõe `id`, `nome`, `role` e
> `ativo` — **nunca `codigo`, nunca `permissoes`**. O código de seis caracteres
> destranca uma estação da gráfica; quem precisa dele continua passando pela rota
> `/api/acessos-locais`, que exige o módulo Usuários. Ver
> [`painel_do_acabamento.md`](painel_do_acabamento.md).

`imposition_tempo_no_card` guarda só o **carimbo de hora** da última troca de card;
o card em si é calculado no painel por `classificarPedidoNaArte`. O SQL está em
[`sql/tempo_no_card.sql`](../sql/tempo_no_card.sql) e a tela que a usa está
documentada em [`lista_de_arte.md`](lista_de_arte.md).

## 📎 Tabelas presas a um pedido (prefixo `pedidos_`)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `pedidos_artes` | Arquivos e estado da arte de cada pedido | ✅ Criado |
| `pedidos_links_cliente` | Links públicos de aprovação do cliente | ✅ Criado |
| `pedidos_modelos` | Modelos de cada pedido (cor, numeração, opções de impressão, e desde 20/08/2026 `acabamento_status` / `acabamento_responsavel` / `acabamento_foto_url`) | ✅ Criado |

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

- **FKs para propostas**: usar `id_int`
- **FKs para clientes**: usar `id_cliente`
- **FKs para produtos**: usar `id_produto`
- **Soft delete**: usar campo de status, nunca DELETE físico
- **Fluxo**: Diagnóstico → Plano → Aprovação → Implementação → Validação

### Os três prefixos que existem hoje

A regra original dizia "prefixo `producao_` para tudo do Imposition". Na prática o
projeto passou a usar três, e este documento registra o que **é**, não o que se
planejou em junho:

| Prefixo | Para quê | Exemplos |
|---------|----------|----------|
| `producao_` | Catálogo e operação da gráfica | `producao_formatos`, `producao_cores`, `producao_acesso_*` |
| `imposition_` | Coisas do painel em si | `imposition_user_permissions`, `imposition_acessos_locais`, `imposition_segredos`, `imposition_tempo_no_card` |
| `pedidos_` | O que se prende a um pedido do parceiro | `pedidos_artes`, `pedidos_links_cliente`, `pedidos_modelos` |

**Continua valendo o essencial**: nenhuma delas é do Vibecode, e tabela nossa
nunca nasce sem prefixo. O que caiu foi a exigência de `producao_` para tudo.

Os requisitos de **UUID como PK** e de `created_at`/`updated_at` obrigatórios
também deixaram de ser universais. `imposition_tempo_no_card`, por exemplo, tem o
número do pedido (`id_int`) como chave primária, porque é uma linha por pedido e
qualquer outra chave exigiria uma busca a mais para achar a linha certa.

### Permissões: sempre REVOKE antes de GRANT

> [!CAUTION]
> O Supabase concede **`GRANT ALL` ao papel `authenticated`** em toda tabela nova,
> por privilégio padrão do esquema. Um `GRANT SELECT, INSERT, UPDATE` depois disso
> **não restringe nada** — os privilégios se somam.

Isso foi descoberto em 19/08/2026, na conferência que roda no fim do
`sql/tempo_no_card.sql`: a tabela recém-criada aparecia com `DELETE` e `TRUNCATE`
liberados para qualquer usuário logado. O conserto é uma linha:

```sql
ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.minha_tabela FROM anon;
REVOKE ALL ON public.minha_tabela FROM authenticated;   -- <-- sem isto, o GRANT abaixo é decorativo
GRANT SELECT, INSERT, UPDATE ON public.minha_tabela TO authenticated;
GRANT ALL ON public.minha_tabela TO service_role;
```

**Todo SQL de tabela nova deve terminar com a conferência**, que devolve o que
cada papel realmente ficou tendo — é ela que denuncia a folga:

```sql
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'minha_tabela'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY grantee ORDER BY grantee;
```

> [!NOTE]
> As tabelas criadas antes dessa descoberta provavelmente têm a mesma folga. Vale
> uma auditoria das 39 tabelas nossas — pendente.

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

