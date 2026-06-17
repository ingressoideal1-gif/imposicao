# Changelog — Ideal Imposition

Registro histórico de todas as alterações, correções e melhorias aplicadas ao sistema.

---

## [2026-06-16] — Sessão de Correção e Refatoração

### 🐛 Correção Crítica — Menus do sistema pararam de funcionar

**Causa raiz identificada:** O arquivo `frontend/script.js` havia acumulado um **erro de sintaxe fatal** introduzido por edições anteriores. Dentro do bloco `if (el.type === 'PICOTE')` da função `renderElementsList`, existia código **morto/duplicado** com um segundo `return` inacessível. As edições sucessivas desbalancearam as chaves `{` e `}` do arquivo — o Node.js detectou o erro na linha 12767 (`SyntaxError: Unexpected token '}'`), impedindo que o **arquivo JavaScript inteiro carregasse**. Com o JS quebrado, nenhum botão do menu funcionava pois os event listeners nunca eram registrados.

**Solução aplicada:**
1. `script.js` restaurado a partir do `script_backup.js` (backup válido e sintaticamente correto)
2. As melhorias de layout foram reaplicadas de forma segura e cirúrgica
3. Sintaxe verificada com `node --check` após cada edição

---

### ✨ Funcionalidade — Ordenação automática de elementos no Editor de Numeração

**Arquivo:** `frontend/script.js` → função `renderElementsList()`

Os elementos no painel esquerdo do Editor de Numeração agora são exibidos sempre na mesma ordem lógica, independente da ordem de criação.

**Ordem aplicada:**

| Prioridade | Tipo    | Rótulo        |
|-----------|---------|---------------|
| 1         | TEXT    | 🔤 Numeração  |
| 2         | FIXED   | 🔠 Texto Fixo |
| 3         | QR      | 📱 QR Code    |
| 4         | BARCODE | ▌▌ Barcode   |
| 5         | SVG     | 🎨 SVG        |
| 6         | PDF     | 📄 PDF        |
| 7         | PICOTE  | ✂️ Picote (sempre último) |

**Implementação (2 linhas adicionadas):**
```js
const typeOrder = { TEXT: 0, FIXED: 1, QR: 2, BARCODE: 3, SVG: 4, PDF: 5, PICOTE: 6 };
const sortedElements = [...state.numElements].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));
```

---

### 💅 Melhoria de Layout — Cards de Elemento em Grid Responsivo

**Arquivo:** `frontend/style.css`

Os cards de elementos no Editor de Numeração foram reformulados de um layout `flex nowrap` (que causava rolagem horizontal e campos acavalados) para um **CSS Grid responsivo** que distribui os campos em múltiplas linhas de forma limpa.

**Antes:**
- `display: flex; flex-wrap: nowrap` — campos em linha única, saindo da tela
- Rolagem horizontal necessária para ver todos os controles
- Labels e inputs acavalados / cortados

**Depois:**
- `display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))` — campos se distribuem automaticamente em linhas conforme o espaço disponível
- Sem rolagem horizontal — usa toda a área disponível
- `input[type="color"]` com altura padronizada (30px)
- Classe `.el-full` para campos que devem ocupar a linha inteira (ex: Fonte, Texto Fixo)
- Barra de botões (`.add-elements-bar`) com `flex-wrap: wrap` para não transbordar

---

## Arquitetura do Sistema

```
ideal-imposition/
├── frontend/                  ← SPA estática (HTML + CSS + JS puro)
│   ├── index.html             ← Estrutura e views (Single Page App de seções)
│   ├── script.js              ← Toda a lógica frontend (~13.500 linhas)
│   ├── style.css              ← Design system + componentes (~1.800 linhas)
│   ├── supabase-config.js     ← Credenciais Supabase e API_BASE_URL
│   └── vercel.json            ← Rewrites SPA + headers no-cache
│
├── app.py                     ← FastAPI — endpoints REST do motor
├── engine.py                  ← Motor Python de geração de PDFs impostos (PyMuPDF)
├── db.py                      ← Camada de acesso ao Supabase (servidor)
├── requirements.txt           ← Dependências Python (FastAPI, PyMuPDF, etc.)
├── render.yaml                ← Configuração de deploy no Render
│
├── schema_unificado.sql       ← Schema completo do banco de dados
├── DEPLOY.md                  ← Guia de deploy detalhado (Supabase + Vercel + Render)
└── CHANGELOG.md               ← Este arquivo
```

### Fluxo de Dados

```
Browser (hospedado na Vercel)
    │
    ├─[Supabase JS SDK]─────► Supabase PostgreSQL
    │                          (formatos, numerações, cores, OSs, artes)
    │
    └─[fetch REST / JSON]───► Backend FastAPI (hospedado no Render)
                                  └─► engine.py (PyMuPDF — geração de PDF)
                                          └─► Supabase Storage (upload do PDF resultante)
```

### Variáveis de Configuração

| Variável               | Local                  | Descrição                                          |
|------------------------|------------------------|-----------------------------------------------------|
| `VIBECODE_SUPABASE_URL`| `supabase-config.js`   | URL do projeto Supabase                             |
| `VIBECODE_ANON_KEY`    | `supabase-config.js`   | Chave pública anon do Supabase                      |
| `API_BASE_URL`         | `supabase-config.js`   | URL do backend Render (string vazia em localhost)   |

### Tabelas do Banco de Dados (prefixo `producao_`)

| Tabela                          | Descrição                                      |
|---------------------------------|------------------------------------------------|
| `producao_formatos`             | Formatos do item (tamanho, grade, gaps)         |
| `producao_numeracoes`           | Conjuntos de elementos variáveis (VDP)          |
| `producao_saidas`               | Formatos de papel de saída                     |
| `producao_cores`                | Cores de referência por formato                |
| `producao_modelos_imposicao`    | Modelos salvos de imposição                    |
| `producao_ordens_servico`       | Ordens de serviço (pedidos)                    |
| `producao_os_itens`             | Itens de cada OS (produto, setor, cor, num.)   |
| `producao_links_aprovacao`      | Links públicos de aprovação para o cliente     |

---

## Guia Rápido de Publicação

```bash
# 1. Commitar as alterações
git add frontend/script.js frontend/style.css CHANGELOG.md
git commit -m "fix: restaurar JS e melhorar layout dos cards de elemento"

# 2. Publicar (Vercel detecta automaticamente o push e faz deploy)
git push origin main
```

O deploy do frontend é automático via CI/CD da Vercel ao fazer push na branch `main`.
O backend (Render) tem seu próprio ciclo de deploy — push no mesmo repositório também aciona o Render se configurado.

---

*Última atualização: 2026-06-16*
