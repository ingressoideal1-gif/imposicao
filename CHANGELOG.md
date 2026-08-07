# Changelog — Ideal Imposition

Registro historico de todas as alteracoes, correcoes e melhorias aplicadas ao sistema.

---

## Versão atual: **v1.5.0 (v480)** — 2026-08-07

---

## [v1.5.0 (v480) — 2026-08-07] — Painel de Produção: ordenação, filtros de prazo e confirmação de impressão

### Resumo
Quatro mudanças no Painel de Produção e no fluxo de impressão. A mais importante em termos de operação: **imprimir não marca mais o modelo como IMPRESSO sozinho** — passa por confirmação do operador. As demais são de navegação e leitura da fila.

### 1. Confirmação de impressão

Antes, o status virava `IMPRESSO` automaticamente assim que o job era despachado — em alguns caminhos, *antes* mesmo de imprimir. Agora aparece um popup ao fim do envio e o status só muda no "Sim".

| Caminho | Comportamento antigo |
|---|---|
| Botão Imprimir da linha (`pedQueueImprimir`) | marcava IMPRESSO **antes** de imprimir |
| `runPedImposition('print')` — 3 ramos | marcava assim que o agente aceitava o job |
| 🖨️ Imp. Sel. (`pedQueueGerarPDFMulti`) | marcava logo após gerar o PDF, antes do modal abrir |
| Imprimir da fila da view Imposição (`impQueueImprimir`) | marcava antes de imprimir |

Quando a impressão passa pelo modal de seleção de impressora, a confirmação fica pendente (`marcarConfirmacaoPendente`) e dispara após o envio bem-sucedido; `closePrintModal` descarta a pendência se o modal for fechado sem enviar.

**Ações de PDF não alteram status nem pedem confirmação.** Removida a marcação automática de `IMPRESSO` de todos os caminhos de gerar/salvar/baixar PDF, em `pedido.js` e `script.js`. A única escrita automática restante é a de `confirmarImpressaoModelos`, sempre atrás do popup.

### 2. Pedido abre com o primeiro modelo selecionado

`abrirImposicaoDoPedido` selecionava `itemId: null` de propósito. Agora escolhe o primeiro modelo e delega para `enviarParaPedido`.

O "primeiro" é calculado por `getPrimeiroModeloDaOS`, que repete o agrupamento por produto de `renderPedOSQueue` — pegar `itens[0]` daria outro modelo, porque o JavaScript reordena chaves numéricas de objeto.

**Armadilha encontrada no caminho:** `renderPedOSQueue` não é só desenho — ela grava o formato padrão do produto em `item.formato_id`. Chamando `enviarParaPedido` sem essa render antes, `enviarParaImposicao` encontrava o formato vazio, descia toda a cadeia de matching e caía no fallback do primeiro formato do sistema; o `ped-formato` recebia o formato errado e a **cor do modelo se perdia**. A fila passou a ser desenhada antes de carregar o modelo.

> Bug pré-existente relacionado, **não corrigido**: `enviarParaImposicao` procura o produto por `item.id_produto`, enquanto a fila usa `item._vibe_id_produto`. Campos diferentes — esse matching provavelmente nunca acerta. Só não aparece porque a render sempre roda antes e preenche o formato.

### 3. Ordenação por coluna na lista "Pedidos Liberados"

Os títulos viraram botões. O ativo fica destacado com seta do sentido.

| Coluna | 1º clique | 2º clique |
|---|---|---|
| Nº Pedido, Itens, Quantidade, Progresso | maior → menor | inverte |
| Frete | agrupa por tipo (A→Z) | inverte |
| Status | ordem do fluxo: Aguardando → Parcial → Impresso → Revisão | inverte |

Sem coluna escolhida, a lista mantém exatamente a ordem anterior. O botão **ATUALIZAR** do painel zera a ordenação; os demais chamadores de `loadOrdens()` ficaram intactos, para a escolha não sumir ao voltar de um pedido. `aplicarProdSort` usa `slice()` — reordenar o array de origem embaralharia o `state` para as outras telas.

### 4. Filtros por Prazo de Entrega

Três botões centralizados no topo do box, à esquerda de "Todos os Setores", sempre com um selecionado:

- **Para Hoje** — prazo no dia corrente, qualquer hora
- **Atrasados** — data **e hora** anteriores ao momento atual
- **Geral** — sem filtro (padrão; ATUALIZAR volta para ele)

Combinam com busca, setor e estágio sem interferir neles. Pedido sem prazo aparece só no Geral.

**Alerta:** com "Para Hoje" selecionado e havendo atrasado na fila, o botão "Atrasados" fica vermelho. Só nessa condição. O alerta olha `ordensImpressao` — a fila inteira, antes de qualquer filtro — de propósito: é sinal global, não muda com setor, estágio ou busca. Para isso o eixo de prazo saiu do mesmo `filter` dos demais; com a lista já recortada em "Para Hoje" não haveria como enxergar os atrasados.

### Nota técnica: estilos aplicados inline

Os botões de cabeçalho e os de prazo têm o estilo aplicado por JS em `element.style`, não pela folha de estilos. As regras equivalentes foram escritas no `style.css` e **não venciam a cascata** dentro do `<th>` sticky — verificado que o arquivo chegava íntegro ao navegador (chaves e comentários balanceados, servido com o conteúdo certo) sem que a causa fosse identificada. As regras seguem no `style.css` como rede de segurança.

### Ferramental

| Arquivo | O que mudou |
|---|---|
| `.gitignore` | `print_configs.json` — configuração de impressão da estação, gravada em runtime pelo `db.py`, nunca deve ir para o repositório |
| `publicar.ps1` | mensagem de commit virou parâmetro obrigatório, no lugar de um texto fixo sobre `amostra_cor_id` que se repetia em toda publicação. Cada etapa passou a checar `$LASTEXITCODE`: `$ErrorActionPreference` não interrompe comandos nativos, então um commit falho seguia para o push e para o deploy assim mesmo |

### ⚠️ Pendência conhecida: o Prazo de Entrega é sintético

Consultando o Supabase em 2026-08-07: a tabela `propostas` **não tem** coluna `prazo_entrega` nem `prazo`, e `prazo_operacional` está `null` em todos os registros amostrados. Por isso `loadOrdensFromVibecode` sempre cai em `getFallbackPrazo(created_at, numero)`, que devolve `created_at + (3 + numero % 5)` dias.

Consequência: a coluna Prazo Entrega e os filtros "Para Hoje" / "Atrasados" operam sobre uma fórmula derivada da data de criação, não sobre um prazo real. É por isso que praticamente todo pedido aparece como "(Atrasado)". **Definir o campo real ficou pendente com o usuário**; o ponto de mudança é a linha que monta `prazo_entrega` em `loadOrdensFromVibecode` — `pedidoPassaFiltroPrazo` e `formatPrazoDestaque` acompanham automaticamente.

### Commits

- `6e07d43` — ordenação por coluna, confirmação de impressão e abertura com o 1º modelo
- `7cfafa4` — filtros por prazo de entrega, `.gitignore` e `publicar.ps1`

---

## [v1.4.0 (v454) — 2026-08-04] — Correção Crítica: Fontes Web nas Numerações

### Resumo
Correção do bug onde fontes carregadas do catálogo web (Roboto, Open Sans, Montserrat, etc.) eram substituídas por **Helvetica** na geração de PDF pelo motor Python. Fontes web agora renderizam corretamente em numerações (TEXT, FIXED, CAMAROTE_*, TEATRO_*) tanto em modo simples quanto multi-artes.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | `engine.py` — Resolução de Fontes (`v454`) | **Bug principal**: Ao usar `_font_data` (Base64 do TTF embutido), o engine criava o arquivo temporário mas mantinha `font_name = "helv"` (fallback Base-14). O PyMuPDF registrava o buffer da fonte Roboto com alias de Helvetica. **Fix**: Adicionado `font_name = family` no Step 1, idêntico ao que já existia no Step 2 (download por URL). |
| 2 | `script.js` — Multi-Artes (`v454`) | A função `_injectFontUrls()` injetava `arquivo_url` (URL do TTF) para `payloadNumeracao` e `numeracao_2`, mas **não** para os itens dentro de `payloadMultiArtes`. **Fix**: Adicionado loop de injeção para cada item de multi-artes. |
| 3 | Restrição do Catálogo (v453) | Confirmada remoção dos botões "Fontes do PC" e "Digitar Nome" no Criador de Arte. `populateFontFamilySelect()` agora usa exclusivamente `state_fonts.catalogo` (fontes hospedadas). |

### Diagnóstico Detalhado

O bug foi rastreado através de 5 hipóteses documentadas em `fontes_numeracao_debug.md`. A causa raiz confirmada:

```
engine.py linha 546:
  font_name = font_map.get("Roboto", "helv")  → "helv" (Roboto não é Base-14)

engine.py linha 557 (ANTES):
  font_file = tmp_font.name   ← arquivo OK, mas font_name continua "helv"

engine.py linha 614:
  page.insert_font(fontname="helv", fontbuffer=<bytes_da_Roboto>)  ← ERRADO!
```

**Após a correção:**
```
engine.py linha 558 (AGORA):
  font_name = family           ← "Roboto"

engine.py linha 615:
  page.insert_font(fontname="Roboto", fontbuffer=<bytes_da_Roboto>)  ← CORRETO!
```

---

## [v455 — 2026-08-04] — Pipeline de Impressão Vetorial (PDF RAW)

### Resumo
Refatoração do pipeline de impressão para enviar o PDF **diretamente** ao spooler como dados RAW, preservando 100% das fontes embutidas. O método anterior rasterizava cada página como imagem PNG/JPEG, destruindo as fontes e perdendo qualidade vetorial.

### O que mudou

| Aspecto | Antes (GDI Raster) ❌ | Agora (PDF RAW) ✅ |
|---------|----------------------|-------------------|
| Texto | Pixels (imagem) | Vetorial (TrueType) |
| Fontes web | Perdidas na rasterização | Preservadas intactas |
| Qualidade | Limitada ao DPI | Infinita (vetor) |
| Tamanho spool | ~50-100 MB por job | ~2-5 MB (tamanho real do PDF) |
| Velocidade | Lenta (rasterização) | Instantânea (envio direto) |

### Modos de impressão disponíveis

O `print_service.py` agora suporta 4 modos selecionáveis via `options["print_mode"]`:

| Modo | Descrição |
|------|-----------|
| `pdf_raw` (padrão) | Envia PDF direto ao spooler — requer impressora com interpretador PDF |
| `ghostscript` | Converte PDF→PS vetorial via Ghostscript — qualquer impressora PostScript |
| `gdi` | Rasteriza para imagem via GDI/PIL — fallback universal |
| `auto` | Cascata: pdf_raw → ghostscript → gdi |

---


## [v1.3.0 (v408) — 2026-07-29] — Suporte aos Modos de Impressão Reversa e Folha a Folha, Cores e Ajustes de Fila do Pedido

### Resumo
Implementação completa dos novos modos de impressão física (**Impressão Reversa** e **Folha a Folha**), persistência de parametrização de impressão por produto no Supabase, adição do círculo indicador de cor de referência nos modelos, e ajustes visuais nas linhas da fila do pedido.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | Modos de Impressão (`v407`) | Adicionados checkboxes **🔄 Impressão reversa** e **📄 Folha a Folha** no painel de configuração de impressão e no motor de spooling em tempo real (`processPrintQueueOptions`). |
| 2 | Persistência de Impressão (`v406`) | Integração da tabela `producao_print_config` no Supabase com sincronização automática (`savePrintConfigForProduct` e `loadPrintConfigForProduct`). |
| 3 | Estilo de Status Aguardando (`v408`) | Atualizada a cor de fundo das linhas de modelo com status "Aguardando" para **`#65625e`** em `pedido.js` e `script.js`. |
| 4 | Círculo Indicador de Referência (`v404`/`v405`) | Inserido círculo (60% da altura da linha) antes do nome do modelo preenchido com o Hexadecimal da cor de referência. |
| 5 | Dropdown de Cor (`v404`) | Cor de fundo dinâmica com o Hexadecimal da cor selecionada e texto forçado em preto 100% legível (`color: #000000 !important;`). |
| 6 | Resiliência do Supabase (`v403`) | Interceptador gracioso na função `api()` para tratar ausência da coluna `cor_referencia` sem travar a interface. |
| 7 | Ajustes de Layout na Fila (`v396`) | Atualizada a cor das bordas e delimitadores para `#918f8c` e aplicado espaçamento vertical de `3pt` entre linhas de modelos. |
| 8 | Compilação do Executável | Recompilado `dist/IdealImpositionAgent.exe` com tratamento robusto para liberação de portas e processos em segundo plano. |

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
