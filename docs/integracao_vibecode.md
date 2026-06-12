# Guia de Integração — Vibecode ↔ Ideal Imposition

## Banco de Dados Compartilhado (Supabase)

Este documento contém tudo que o programador do sistema **Vibecode** precisa para se conectar ao banco de dados compartilhado com o **Ideal Imposition**.

---

## 🔗 Credenciais de Conexão

```
URL:      https://atsxtuibeitloosckmlc.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0c3h0dWliZWl0bG9vc2NrbWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUyNTcsImV4cCI6MjA5NjU5MTI1N30.KppPhKh4s9tHLjB73zYzaaazLukwsPS9v4FvIFy5yxM
```

---

## 📦 Instalação do Client

### JavaScript (browser ou Node.js)
```bash
npm install @supabase/supabase-js
```

### Inicialização
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://atsxtuibeitloosckmlc.supabase.co',
    'SUA_ANON_KEY_AQUI'
);
```

---

## 📋 Schema das Tabelas

### `ordens_servico` — Tabela principal de OS

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | TEXT (PK) | auto `os_XXXXXXXX` | ID único |
| `numero` | INTEGER (UNIQUE) | — | Número humano da OS (ex: 17455) |
| `status` | TEXT | `'ARTE'` | `ARTE`, `PRODUÇÃO`, `FINALIZADA`, `CANCELADA` |
| `observacoes` | TEXT | null | Notas livres |
| `criado_por` | UUID (FK→usuarios) | null | Quem criou |
| `created_at` | TIMESTAMPTZ | now() | Data de criação |
| `updated_at` | TIMESTAMPTZ | now() | Última atualização (automático) |

### `os_itens` — Itens de cada OS

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | TEXT (PK) | auto `osi_XXXXXXXX` | ID único |
| `os_id` | TEXT (FK→ordens_servico) | — | **Obrigatório**. OS pai |
| `setor` | TEXT | — | `TEXTIL`, `IMPRESS.`, `FLEX` |
| `produto` | TEXT | — | `TEX`, `CORDÃO`, `TRIBAND`, `MOBI`, `UP`, `TEX PLUS` |
| `modelo` | TEXT | null | Código do modelo (ex: `123123`) |
| `formato` | TEXT | — | Referência textual (ex: `35X2`) |
| `formato_id` | TEXT | null | FK opcional → tabela `formatos` (Imposition preenche) |
| `quantidade` | INTEGER | — | Quantidade total (> 0) |
| `num_inicial` | INTEGER | 1 | Numeração inicial |
| `num_final` | INTEGER | — | Numeração final |
| `cor` | TEXT | `'STD'` | Nome da cor |
| `cor_id` | TEXT | null | FK opcional → tabela `cores` (Imposition preenche) |
| `blocos` | TEXT | `'N'` | `'N'` ou quantidade numérica (`'50'`, `'25'`) |
| `verso` | BOOLEAN | false | Impressão frente e verso |
| `numeracao` | TEXT | `'SEQUENCIAL'` | Tipo: `PADRÃO`, `QR`, `BARRAS`, `SEQUENCIAL`, `CLIENTE` |
| `numeracao_id` | TEXT | null | FK opcional → tabela `numeracoes` (Imposition preenche) |
| `aprovacao` | TEXT | `'EM ARTE'` | `EM ARTE`, `APROVADA`, `PRONTA`, `REPROVADA` |
| `impressao` | TEXT | `'AGUARD.'` | `AGUARD.`, `PARCIAL`, `IMPRESSO`, `ERRO` |
| `observacoes` | TEXT | null | Notas do item |
| `created_at` | TIMESTAMPTZ | now() | — |
| `updated_at` | TIMESTAMPTZ | now() | Automático |

### `os_log` — Auditoria

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGINT (auto) | ID sequencial |
| `os_id` | TEXT (FK) | OS relacionada |
| `item_id` | TEXT | Item relacionado (sem FK) |
| `usuario_id` | UUID (FK→usuarios) | Quem executou |
| `acao` | TEXT | `CRIOU_OS`, `APROVOU_ITEM`, `IMPRIMIU`, `CANCELOU`, `EDITOU` |
| `detalhes` | JSONB | Dados extras |
| `created_at` | TIMESTAMPTZ | — |

### `usuarios` — Perfis de usuários

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID (PK) | ID do usuário |
| `nome` | TEXT | Nome completo |
| `email` | TEXT (UNIQUE) | Email |
| `role` | TEXT | `admin`, `gerente`, `operador`, `viewer` |
| `ativo` | BOOLEAN | Se está ativo |

---

## 🔀 Responsabilidades por Sistema

### O que o **Vibecode** faz:
- ✅ Cria `ordens_servico`
- ✅ Insere `os_itens`
- ✅ Atualiza `aprovacao` dos itens (`EM ARTE` → `APROVADA` → `PRONTA`)
- ✅ Atualiza `status` da OS (`ARTE` → `PRODUÇÃO` → `FINALIZADA`)
- ✅ Gerencia `usuarios`
- ✅ Registra ações no `os_log`

### O que o **Ideal Imposition** faz:
- ✅ Lê `ordens_servico` e `os_itens`
- ✅ Vincula `formato_id`, `cor_id`, `numeracao_id` (FKs opcionais)
- ✅ Atualiza `impressao` dos itens (`AGUARD.` → `PARCIAL` → `IMPRESSO`)
- ✅ Registra ações no `os_log`

### Campos que **NENHUM** deve alterar do outro:
- Vibecode **NÃO** altera `impressao` (campo do Imposition)
- Imposition **NÃO** altera `aprovacao` nem `status` (campos do Vibecode)

---

## 💻 Exemplos de Código (JavaScript)

### Criar uma OS com itens

```javascript
// 1. Criar a OS
const { data: os, error } = await supabase
    .from('ordens_servico')
    .insert({
        numero: 17455,
        status: 'ARTE',
        observacoes: 'Evento Festival 2026'
    })
    .select()
    .single();

if (error) throw error;

// 2. Inserir itens
const itens = [
    {
        os_id: os.id,
        setor: 'TEXTIL',
        produto: 'TEX',
        modelo: '123123',
        formato: '35X2',
        quantidade: 200,
        num_inicial: 1,
        num_final: 200,
        cor: 'STD',
        verso: true,
        numeracao: 'PADRÃO',
        aprovacao: 'APROVADA'
    },
    {
        os_id: os.id,
        setor: 'IMPRESS.',
        produto: 'TRIBAND',
        modelo: '123126',
        formato: '24X2',
        quantidade: 100,
        num_inicial: 1,
        num_final: 100,
        cor: 'AMARELO',
        verso: false,
        numeracao: 'QR',
        aprovacao: 'APROVADA'
    }
];

const { error: itensError } = await supabase
    .from('os_itens')
    .insert(itens);
```

### Listar OS com contagem de itens

```javascript
const { data, error } = await supabase
    .from('ordens_servico')
    .select(`
        *,
        os_itens(count)
    `)
    .order('created_at', { ascending: false });
```

### Buscar itens de uma OS

```javascript
const { data: itens, error } = await supabase
    .from('os_itens')
    .select('*')
    .eq('os_id', 'os_abc12345')
    .order('created_at');
```

### Atualizar aprovação de um item

```javascript
const { error } = await supabase
    .from('os_itens')
    .update({ aprovacao: 'APROVADA' })
    .eq('id', 'osi_xyz99999');

// Registrar no log
await supabase.from('os_log').insert({
    os_id: 'os_abc12345',
    item_id: 'osi_xyz99999',
    acao: 'APROVOU_ITEM',
    detalhes: { de: 'EM ARTE', para: 'APROVADA' }
});
```

### Filtrar itens por status de impressão

```javascript
const { data, error } = await supabase
    .from('os_itens')
    .select('*, ordens_servico(numero, status)')
    .eq('impressao', 'AGUARD.')
    .eq('aprovacao', 'APROVADA');
```

---

## 📐 Tabelas do Imposition (somente leitura para o Vibecode)

O Vibecode pode **ler** estas tabelas para exibir informações, mas **NÃO deve escrever** nelas:

| Tabela | Descrição |
|--------|-----------|
| `formatos` | Formatos de ingresso (largura, altura, grid) |
| `numeracoes` | Templates de numeração (QR, barras, texto) |
| `saidas` | Formatos de folha de saída (SRA3, A4, A3) |
| `cores` | Cores de fundo com PDF de referência |
| `modelos_imposicao` | Modelos salvos de imposição |

---

## 🔒 Segurança (próximas etapas)

Atualmente o RLS está **desabilitado** para facilitar o desenvolvimento.
Quando o sistema estiver pronto para produção com centenas de usuários:

1. Implementar autenticação do Supabase (email/senha)
2. Habilitar RLS em todas as tabelas
3. Criar policies baseadas em roles (admin, gerente, operador, viewer)
4. Trocar a ANON KEY por tokens autenticados

---

## 📌 Convenções

- **IDs**: prefixados por tipo (`os_`, `osi_`, `cor_`, `fmt_`, `num_`, `sai_`)
- **Datas**: sempre UTC com timezone (TIMESTAMPTZ)
- **updated_at**: atualizado automaticamente via trigger
- **Soft delete**: use campo `status = 'CANCELADA'` em vez de DELETE
- **Log**: registre todas as ações significativas em `os_log`
