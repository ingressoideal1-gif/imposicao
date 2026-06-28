# Changelog — Ideal Imposition

Registro historico de todas as alteracoes, correcoes e melhorias aplicadas ao sistema.

---

## Versão atual: **v1.2.0** — 2026-06-28

---

## [v1.2.0 — 2026-06-28] — Novo motor de Blocos Estritos e Interface de Navegação

### Resumo
Adição da funcionalidade Cut & Stack Estrito (Blocos) e Colunas Independentes, juntamente com controles de paginação avançados no Visualizador de Imposição para conferência da matemática do PDF gerado.

### Implementações Aplicadas

| # | Função | O que mudou |
|---|---|---|
| 1 | `engine.py` (Cut & Stack) | Criação da matemática robusta para as modalidades "Colunas Independentes" (Total de Folhas = Altura da Coluna) e "Blocos Estritos" (Agrupamento fixo por tamanho de bloco/profundidade). |
| 2 | `app.py` | Correção na passagem dos parâmetros `cut_stack_mode`, `sheets_per_block` e `block_depth` do frontend para a instância do `ImpositionConfig`. |
| 3 | Visualizador (`script.js`) | Refatoração da lógica do Visualizador para desenhar perfeitamente a matemática de qualquer folha, batendo com a lógica final da geração de PDF do `engine.py`. |
| 4 | Visualizador Numerado (`script.js`) | Correção da formatação de valores numerados para respeitar tickets múltiplos dentro da mesma célula em tempo de Preview. |
| 5 | Controles Paginados (`index.html`) | Adição de `input` de página direta e setas de avanço/recuo de Folhas direto na tela de pré-visualização. |

---

## [v1.1.0 — 2026-06-27] — Fluxo de Status de Arte e Link do Cliente

### Resumo
Refatoração completa do fluxo de status entre o painel interno (designer/atendente) e o link público do cliente. Corrigidos 4 bugs críticos que faziam o link abrir a tela errada.

### Fixes aplicados

| # | Função | O que mudou |
|---|---|---|
| 1 | `getOrCreateLinkCliente()` | Não sobrescreve mais status finais (APROVADO, REPROVADO, Em Arte, Pendente) ao clicar em "Copiar Link" |
| 2 | `initClientePage()` — OS locais | `producao_ordens_servico` só complementa o status se o link ainda estiver em estado inicial |
| 3 | `initClientePage()` — detecção de aprovado | `'ARTE_APROVADA'` (aprovação interna) não ativa mais a tela "Artes Aprovadas!" do cliente |
| 4 | `statusProntoParaLink` | Somente `'Enviar Arte'` destaca o botão de link em azul |

### Fluxo de status definido

```
[OS Criada] → "Em Arte"
    │
    ├─ Designer marca TODOS modelos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
    ├─ Designer marca PARCIALMENTE + clica "Voltar p/ Atendimento" → "Pendente Informação"
    └─ Atendente clica "Voltar para Arte" → "Em Arte"

[Status = "Enviar Arte"] → Link do cliente ATIVO
    ├─ Cliente APROVA TODOS → "APROVADO"
    └─ Cliente marca UM como "Alterar" → "REPROVADO"

[Status = "REPROVADO"] → Designer corrige → marca todos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
```

### O que o cliente vê por status

| Status | Cliente vê |
|---|---|
| `Enviar Arte` | 🎨 Janelas de aprovação dos modelos |
| `APROVADO` | ✅ "Artes Aprovadas! Em breve seu pedido entra em produção." |
| `REPROVADO` | ❌ "Artes Reprovadas. Nossa equipe está realizando as correções." |
| `Em Arte` / `Pendente Informação` / outros | 🕐 "Artes em Preparação. Aguarde." |

### Commit
`ed6e17c` — `fix(arte): fluxo correto de status - Em Arte > Enviar Arte (auto) > APROVADO/REPROVADO`

---



### 1. fix: Menus do sistema pararam de funcionar (CRITICO)

**Commits:** `8fbcc2b`, `f9a3d4c`

**Causa raiz:** O `script.js` havia acumulado um erro de sintaxe fatal. Edicoes sucessivas no bloco `renderElementsList` desbalancaram as chaves `{` e `}` do arquivo. O Node.js detectou `SyntaxError: Unexpected token '}'` na linha 12767, impedindo que o **JavaScript inteiro carregasse**. Com o JS quebrado, nenhum botao do menu funcionava pois os event listeners nunca eram registrados.

**Solucao:**
1. `script.js` restaurado a partir do `script_backup.js` (backup valido e sintaticamente correto)
2. As melhorias de layout foram reaplicadas de forma segura e cirurgica
3. Sintaxe verificada com `node --check` apos cada edicao

---

### 2. feat: Ordenacao automatica de elementos no Editor de Numeracao

**Commits:** `8fbcc2b`, `5a7f1f0`
**Arquivo:** `frontend/script.js` -> funcao `renderElementsList()`

Os elementos no painel esquerdo do Editor de Numeracao agora sao exibidos sempre na mesma ordem logica, independente da ordem de criacao.

**Ordem aplicada:**

| Prioridade | Tipo    | Rotulo               |
|-----------|---------|----------------------|
| 1         | TEXT    | Numeracao sequencial |
| 2         | FIXED   | Texto Fixo           |
| 3         | QR      | QR Code              |
| 4         | BARCODE | Barcode              |
| 5         | SVG     | SVG                  |
| 6         | PDF     | PDF                  |
| 7         | PICOTE  | Picote (sempre ultimo) |

**Implementacao (2 linhas adicionadas):**
```js
const typeOrder = { TEXT: 0, FIXED: 1, QR: 2, BARCODE: 3, SVG: 4, PDF: 5, PICOTE: 6 };
const sortedElements = [...state.numElements].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));
```

---

### 3. style: Layout em Grid Responsivo nos Cards de Elemento

**Commits:** `f9a3d4c`
**Arquivo:** `frontend/style.css`

Os cards de elementos no Editor de Numeracao foram reformulados de `flex nowrap` (causava rolagem horizontal e campos acavalados) para CSS Grid responsivo.

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))`
- Campos se distribuem automaticamente em multiplas linhas
- Sem rolagem horizontal, usa toda a area disponivel
- `input[type="color"]` com altura padronizada (30px)
- Classe `.el-full` para campos que ocupam a linha inteira

---

### 4. fix: Restauracao completa do painel de producao (CRITICO)

**Commits:** `5a7f1f0`

**Problema:** Ao restaurar o `script.js` do `script_backup.js`, foram perdidas funcionalidades criticas que estavam em commits posteriores do git mas anteriores ao backup. O backup estava DESATUALIZADO em relacao ao repositorio.

**Funcionalidades recuperadas:**

| Funcao | Descricao |
|---|---|
| `filtroSetor` (8x) | Filtro por setor no painel de producao |
| `filtroStatus` (8x) | Filtro por status das OSs |
| `clienteFinalizarFluxo` (6x) | Fluxo de aprovacao/rejeicao pelo cliente |
| `atualizarBarraFinalCliente` (2x) | Barra dinamica no link publico do cliente |
| Funcoes `renderOrdens` | Renderizacao completa das ordens de servico |
| Funcoes de amostras | Amostras por item, combinadas, individuais |

**Solucao:** Restauracao direta do commit `fc2688d` (14.477 linhas, UTF-8, sintaxe valida) que era o estado correto do `main` antes da nossa feature branch.

---

### 5. fix: Caracteres estranhos no browser (ÔÇö, â€", etc.)

**Commits:** `d534be5`
**Arquivo:** `frontend/script.js`

**Causa:** O `script.js` original (commitado no git) continha 2.236 caracteres Unicode especiais nos comentarios de secao (box-drawing, aspas tipograficas, em dashes). Dependendo do contexto do browser ou do encoding intermediario, esses bytes causavam exibicao de "ÔÇö", "â€"" e similares.

**Caracteres substituidos:**

| Caractere | Unicode | Aparecia como | Substituido por |
|---|---|---|---|
| `─` (box drawing) | U+2500-U+257F | `ÔÇö` | `-` |
| `—` (em dash) | U+2014 | `â€"` | `--` |
| `'` `'` (aspas curvas) | U+2018/2019 | `â€˜` | `'` |
| `"` `"` (aspas duplas) | U+201C/201D | `â€œ` | `"` |

**Resultado:** 1.602 caracteres substituidos, 0 box-drawing restantes, sintaxe JS validada.

---

### 6. docs: CHANGELOG.md criado

**Arquivo:** `CHANGELOG.md` (raiz do projeto)

Criado registro historico completo das alteracoes do projeto.

---

### 7. fix: Problema de DNS local resolvido para publicacao

**Situacao:** O DNS local do sistema nao resolvia `github.com` nem `vercel.com`, impedindo o `git push`.

**Solucao aplicada:**
- Resolucao dos IPs via DNS externo (8.8.8.8)
- Adicao de entradas fixas ao `C:\Windows\System32\drivers\etc\hosts` via PowerShell elevado:
  ```
  4.228.31.150  github.com
  4.228.31.150  api.github.com
  198.169.1.129 vercel.com
  216.198.79.130 imposicao.vercel.app
  216.24.57.9   imposicao.onrender.com
  ```

> **ATENCAO:** Essas entradas sao temporarias. Se o DNS local for corrigido, remova-as do arquivo hosts para evitar conflitos com mudancas de IP do GitHub/Vercel.

---

## Arquitetura do Sistema

```
ideal-imposition/
|-- frontend/                  <- SPA estatica (HTML + CSS + JS puro)
|   |-- index.html             <- Estrutura e views (Single Page App de secoes)
|   |-- script.js              <- Toda a logica frontend (~14.500 linhas)
|   |-- style.css              <- Design system + componentes (~1.800 linhas)
|   |-- supabase-config.js     <- Credenciais Supabase e API_BASE_URL
|   `-- vercel.json            <- Rewrites SPA + headers no-cache
|
|-- app.py                     <- FastAPI - endpoints REST do motor
|-- engine.py                  <- Motor Python de geracao de PDFs impostos (PyMuPDF)
|-- db.py                      <- Camada de acesso ao Supabase (servidor)
|-- requirements.txt           <- Dependencias Python (FastAPI, PyMuPDF, etc.)
|-- render.yaml                <- Configuracao de deploy no Render
|
|-- schema_unificado.sql       <- Schema completo do banco de dados
|-- DEPLOY.md                  <- Guia de deploy detalhado (Supabase + Vercel + Render)
`-- CHANGELOG.md               <- Este arquivo
```

### Fluxo de Dados

```
Browser (hospedado na Vercel)
    |
    |--[Supabase JS SDK]------> Supabase PostgreSQL
    |                           (formatos, numeracoes, cores, OSs, artes)
    |
    `--[fetch REST / JSON]----> Backend FastAPI (hospedado no Render)
                                    `-> engine.py (PyMuPDF - geracao de PDF)
                                            `-> Supabase Storage (upload PDF)
```

### Tabelas do Banco de Dados (prefixo `producao_`)

| Tabela                          | Descricao                                       |
|---------------------------------|-------------------------------------------------|
| `producao_formatos`             | Formatos do item (tamanho, grade, gaps)          |
| `producao_numeracoes`           | Conjuntos de elementos variaveis (VDP)           |
| `producao_saidas`               | Formatos de papel de saida                      |
| `producao_cores`                | Cores de referencia por formato                 |
| `producao_modelos_imposicao`    | Modelos salvos de imposicao                     |
| `producao_ordens_servico`       | Ordens de servico (pedidos)                     |
| `producao_os_itens`             | Itens de cada OS (produto, setor, cor, num.)    |
| `producao_links_aprovacao`      | Links publicos de aprovacao para o cliente      |

---

## Guia de Publicacao Rapida

```bash
# Commitar e publicar (Vercel detecta automaticamente e faz deploy em ~2min)
git add .
git commit -m "descricao da mudanca"
git push origin main
```

> Se o `git push` falhar com "Could not resolve host: github.com":
> Execute como Administrador e adicione ao `C:\Windows\System32\drivers\etc\hosts`:
> `4.228.31.150 github.com`

---

*Ultima atualizacao: 2026-06-16*
