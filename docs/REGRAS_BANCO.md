# Regras de Banco de Dados — Ideal Imposition + Vibecode

> **Data da decisão**: 2026-06-13
> **Aprovado por**: Junior (proprietário)
> **Status**: ✅ ATIVO — Consultar SEMPRE antes de modificar tabelas
> **Ref**: **Regras de Segurança Vibecode** (fora do repositório)

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

### As exceções abertas até hoje: a ficha de expedição

> [!IMPORTANT]
> Em **21/08/2026** o usuário mandou o Painel do Acabamento escrever na ficha de
> expedição do ERP: o **peso** de cada setor, o **CONCLUIDO** do setor quando ele
> termina, e o **envio do pedido para EXPEDICAO**. São as únicas escritas
> autorizadas em tabela do parceiro, e são **estreitas de propósito**.

**Por que ela não fere o espírito da regra.** Essa tabela é a ficha de conferência
de expedição que o ERP mantém *para a gráfica preencher* — as colunas dizem isso
sozinhas: `peso_real_kg`, `qtd_volumes`, `tipo_volume`, `responsavel_conferencia`.
O ERP já preenche parte dela pela tela dele. O que mudou é de onde o dado entra.

**O que exatamente é permitido**, e nada além:

| | |
|---|---|
| Colunas escritas em `propostas_os_setores` | `peso_real_kg`, `status_producao`, `status_producao_em` e `updated_at` — e, só ao criar a linha, `id_int`, `setor` e `id_os` |
| Colunas escritas em `propostas` | **só** `status_interno`, e **só** para o valor `EXPEDICAO` |
| Nunca tocado | `prazo`, `hora`, `qtd_volumes`, `tipo_volume`, `responsavel_conferencia` — e todo o resto de `propostas` |
| Quem escreve | [`supabase/functions/_compartilhado/pesos.ts`](../supabase/functions/_compartilhado/pesos.ts) (estação, via `acesso-estacao`) e [`frontend/acabamento.js`](../frontend/acabamento.js), função `gravarPeso` (site com sessão) |
| Como | `UPDATE` primeiro; só insere quando não há linha. Hoje 729 dos 758 pares (pedido, setor) ainda não existem, porque o ERP as cria na expedição |
| Travas do banco | `UNIQUE (id_int, setor)`, `CHECK` de setor (PVC/LASER/FLEXO/TEXTIL), FK `id_os → propostas_os(id)` |
| Teste | [`tests/acabamento_harness.js`](../tests/acabamento_harness.js), seção "O peso por setor" |

**A trava que vem junto, e a porta que ela exigiu.** A tabela tem RLS e as quatro
políticas são de `authenticated`. Na estação da gráfica o operador entra pelo
código local, sem sessão do Supabase, e ali a leitura volta **vazia, sem erro
nenhum** — conferido com a chave anônima em 21/08/2026.

Como a digitação do peso acontece justamente na estação (decisão do usuário no
mesmo dia), ela ganhou porta própria: `/api/peso-setores/<pedido>` no agente, que
repassa à Edge Function `acesso-estacao` com o `ACESSO_AGENTE_SEGREDO` e grava com
a `service_role` — o mesmo desenho do catálogo de fontes. No site com login, a
sessão já basta e a escrita sai direta. Sem nenhum dos dois, o box diz o que fazer
em vez de mostrar campos que não gravariam nada.

**O desfazer é mais estreito que o fazer.** O `CONCLUIDO` só é retirado quando o
valor atual é exatamente `CONCLUIDO` — qualquer outra coisa naquela coluna foi o
ERP quem pôs, e não se toca. E o valor de volta é `EM ACABAMENTO`, que descreve a
verdade, em vez de apagar o campo.

**Sobre `propostas`:** hoje a política `Enable read access for all` daquela tabela
é ALL/public/true — a chave **anônima escreve nela**. Isso não é decisão nossa e
não é o que autoriza a escrita; o que autoriza é o pedido do usuário. Registrado
aqui porque é uma exposição do banco que vale a pena o parceiro saber.

Abrir uma exceção nova exige a mesma coisa que estas exigiram: o usuário pedindo,
e a coluna sendo claramente da gráfica.

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
| `producao_volumes` | Os volumes (caixas) de cada setor no acabamento | ✅ Criado 23/08/2026 |
| `producao_volume_itens` | Os **pacotes** de cada volume: modelo, quantidade e responsável | ✅ Criado 23/08/2026, ampliado no mesmo dia |

### Os volumes, e a exceção que o usuário decidiu NÃO abrir

Em 23/08/2026 o Painel do Acabamento ganhou volumes: a caixa física que sai do
setor, com número, tipo, peso de balança, quem pesou e uma lista de modelos com
quantidade. É a quantidade que faz um modelo caber em três caixas e três modelos
caberem numa só.

A ficha `propostas_os_setores` tem `qtd_volumes` e `tipo_volume` — daria para
gravar ali, e a exceção do peso já estava aberta. **O usuário decidiu que não**:
os volumes ficam só do nosso lado, e aquelas duas colunas continuam sendo do ERP.
A tabela acima de "Nunca tocado" continua valendo inteira.

A decisão tem uma consequência prática que vale registrar, porque ela é o motivo
de o recurso funcionar na estação: a ficha do parceiro tem RLS de
`authenticated`, e o operador da gráfica entra pelo código local, **sem sessão**.
É por isso que o peso precisa do desvio pelo agente. Em tabela nossa, com
política de `public` (a mesma de `producao_numeracoes`), a estação grava direto
pelo PostgREST — sem rota nova, sem Edge Function, sem os dois caminhos do
`gravarPeso`.

### O pacote, e por que a tabela não mudou de nome

Ainda em 23/08/2026 o usuário pediu o nível de baixo: *"dentro do mesmo volume,
podemos adicionar vários pacotes… ao editar os volumes, mostra os pacotes,
quantidades e responsáveis de cada pacote"*. O **pacote** é o maço que uma
pessoa fecha: um modelo, uma quantidade, um nome. Vários pacotes vão para dentro
da mesma caixa, e a caixa é o que vai à balança.

A linha de `producao_volume_itens` **é** o pacote. A tabela não passou a
`producao_volume_pacotes` de propósito: renomear quebraria a estação que
estivesse com o painel da versão anterior aberto na tela, que grava e lê por
este nome, e o ganho seria só de leitura.

O que mudou é aditivo — `producao_volumes.nome`, e no pacote uma chave própria
(`id`) mais o `responsavel`. A chave era `(volume_id, modelo_id)`, o que proibia
exatamente o caso pedido: dois pacotes do mesmo modelo na mesma caixa, um de
cada responsável.

**O peso do setor passou a ser escrito sozinho**, com a soma das caixas, a cada
volume gravado — *"a soma de seus pesos vai atualizando o peso real do setor"*.
Isso continua sendo `peso_real_kg` na ficha do parceiro, pelo mesmo caminho de
sempre (agente na estação, PostgREST no site) e com a mesma senha de liberação
acima de 5 %. **A exceção do parceiro não se alargou**: `qtd_volumes` e
`tipo_volume` continuam sem receber escrita nenhuma, e há teste contando as
colunas que aquela ficha recebe.

SQL: [`sql/volumes_do_acabamento.sql`](../sql/volumes_do_acabamento.sql) e
[`sql/pacotes_do_acabamento.sql`](../sql/pacotes_do_acabamento.sql).
Testes: [`tests/acabamento_harness.js`](../tests/acabamento_harness.js), seções
"Os volumes" e "Os pacotes dentro da caixa", e
`tests/test_painel_do_acabamento.py`.

## 🖥️ Tabelas do Painel (prefixo `imposition_`)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `imposition_user_permissions` | Permissões por pessoa (uma coluna por permissão) | ✅ Criado |
| `imposition_acessos_locais` | Códigos de acesso local das estações da gráfica | ✅ Criado |
| `imposition_segredos` | Segredos do painel (plano B dos *Edge Secrets*). Desde 21/08/2026 guarda também `PESO_LIBERACAO_SEGREDO`, de onde sai a senha semanal de liberação de peso do Acabamento — sorteado dentro do banco, nunca passou por arquivo | ✅ Criado |
| `imposition_tempo_no_card` | Há quanto tempo cada pedido está no card da Lista de Arte | ✅ Criado 19/08/2026 |
| `imposition_operadores` | **View** — só os nomes dos acessos locais, para o seletor de responsável do Painel do Acabamento **e para o dropdown de confirmação do Quadro de Avisos** | ✅ Criado 20/08/2026 |
| `imposition_avisos` | O aviso de cada um dos oito quadros (4 setores × 2 painéis) da barra flutuante dos painéis | ✅ Criado 23/08/2026 |
| `imposition_avisos_leituras` | Quem confirmou a leitura de cada aviso, com a hora | ✅ Criado 23/08/2026 |

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

As duas tabelas do **Quadro de Avisos** têm política de `public`, e não de
`authenticated`: quem lê o aviso e confirma a leitura é a estação da gráfica, que
entra pelo código de acesso local e não tem sessão do Supabase. É a mesma decisão
de `producao_volumes`. O SQL está em
[`sql/avisos_dos_paineis.sql`](../sql/avisos_dos_paineis.sql) e a tela em
[`avisos_dos_paineis.md`](avisos_dos_paineis.md).

`imposition_tempo_no_card` guarda só o **carimbo de hora** da última troca de card;
o card em si é calculado no painel por `classificarPedidoNaArte`. O SQL está em
[`sql/tempo_no_card.sql`](../sql/tempo_no_card.sql) e a tela que a usa está
documentada em [`lista_de_arte.md`](lista_de_arte.md).

## 📎 Tabelas presas a um pedido (prefixo `pedidos_`)

| Tabela | Descrição | Status |
|--------|-----------|--------|
| `pedidos_artes` | Arquivos e estado da arte de cada pedido | ✅ Criado |
| `pedidos_links_cliente` | Links públicos de aprovação do cliente | ✅ Criado |
| `pedidos_modelos` | Modelos de cada pedido (cor, numeração, opções de impressão, e desde 20/08/2026 `acabamento_status` / `acabamento_responsavel` / `acabamento_foto_url`; o estágio final do `acabamento_status` passou de `Revisado` a `Pronto` em 21/08/2026; e desde 22/08/2026 `status_impressao_em`, a data em que o modelo virou Impresso, carimbada pelo gatilho `trg_carimba_status_impressao_em`; e desde 23/08/2026 `acabamento_pronto_em`, a hora em que o modelo ficou Pronto no acabamento, carimbada pelo gatilho `trg_carimba_acabamento_pronto_em`) | ✅ Criado |

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

