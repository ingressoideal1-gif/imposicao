# Changelog — Ideal Imposition

Registro cronológico de todas as funcionalidades implementadas, correções e melhorias.

---

## [2026-06-13] — Integração: Tabelas de Catálogo no Supabase do Vibecode (Aprovação Parcial)

### Funcionalidade 1 — Criação do Schema Isolado de Catálogo com RLS Habilitado
Conforme a aprovação parcial e ressalvas do parceiro Vibecode, estruturamos o banco de dados centralizado do ecossistema. Foram isoladas as tabelas do catálogo de layout (configurações geométricas) no arquivo `schema_catalogo.sql` com o Row Level Security (RLS) habilitado e políticas de acesso configuradas por padrão.

**Tabelas de Catálogo Criadas:**
- `producao_formatos` — Gabarito geométrico de imposição.
- `producao_numeracoes` — Templates de VDP.
- `producao_saidas` — Dimensões de papel de saída.
- `producao_cores` — Cadastro de cores e calibração de fundos.
- `producao_modelos_imposicao` — Receitas prontas de motor.
- `producao_produtos_formatos` — **Nova tabela** adicionada com base no feedback do usuário para mapear o `id_produto` (do ERP) ao `formato_id` correspondente do catálogo.

**Políticas RLS Aplicadas:**
- `SELECT` permitido de forma pública/anônima (`anon` e `authenticated`) para leitura da API e do frontend.
- `ALL` (escrita/edição) restrito exclusivamente a conexões autenticadas (`authenticated`).

**Dados Semente (Seed) Cadastrados:**
- Formato padrão: **Mobi** (`152x53mm`, 2 colunas × 4 linhas).
- Saídas padrão: **A3** e **A4**.

---

### Correção 2 — Execução do Script de Servidores Locais (`iniciar_servidores.bat`)
- **Problema:** O console de terminal CMD filha aberto pelo comando `start` não abria no diretório do projeto, fazendo com que ele tentasse carregar o executável do Python e os scripts em `C:\Windows\system32` (onde não existiam) e fechando silenciosamente sem que o usuário visse o erro. Além disso, havia um parêntese não escapado no bloco condicional `if/else` que quebrava o parser de lotes do CMD.
- **Solução:** Adicionado o parâmetro `/D "%~dp0"` nos comandos `start` para forçar o diretório de trabalho correto na inicialização e removidos os parênteses do bloco condicional do assistente de lotes para evitar conflito com o parser. O servidor agora inicia normalmente em background e ouve nas portas `8080` (FastAPI) e `9000` (Agente de Impressão).

---

## [2026-06-08] — Correção: Transparência do PDF no Canvas e Renderização na Imposição

### Problema 1 — Fundo branco nas numerações com elemento PDF (visualizador)
Numerações contendo elementos do tipo **PDF** exibiam fundo **branco** no preview de
imposição e no editor de numeração. O PDF.js preenche o canvas com branco por padrão
antes de renderizar o conteúdo.

### Solução 1 — `frontend/script.js`
Adicionado `background: 'rgba(0,0,0,0)'` no objeto `renderContext` do PDF.js em
**3 locais**:

- `loadNumPdfFile()` — carregamento inicial do arquivo PDF no editor
- `drawPreview()` — bloco de renderização do elemento PDF no canvas de preview
- `preloadNumPdfElements()` — pré-carregamento assíncrono ao selecionar numeração

Isso instrui o PDF.js a respeitar a transparência do canvas em vez de preencher com branco.

---

### Problema 2 — Elemento PDF não renderizava no PDF final da imposição
O `_get_url_bytes()` do engine usava timeout de **5 segundos** para baixar o PDF
do Firebase Storage, insuficiente para a primeira requisição. O PDF era silenciosamente
ignorado sem renderizar na imposição.

### Solução 2 — `engine.py`
- Timeout de download de URL aumentado de **5s → 30s**
- Adicionado `pdf_doc.close()` após renderizar o elemento (evita leak de memória)
- Logs de diagnóstico melhorados para rastrear URL, tamanho e status do download

### Solução 2b — `app.py`
- Adicionados logs `[impose]` que mostram os elementos PDF recebidos na numeração
  (url/base64 e dimensões) para facilitar diagnóstico futuro

---



### Problema
Numerações que continham elementos do tipo **PDF** geravam corretamente o PDF final
(o motor backend via PyMuPDF renderizava o conteúdo corretamente), mas o elemento
ficava **invisível na janela de preview** de imposição — o `drawVdpElements` não
tinha nenhum tratamento para `el.type === 'PDF'`.

### Solução

**`frontend/script.js` — 3 alterações:**

1. **`drawVdpElements` (preview de imposição)**  
   Adicionado bloco `else if (el.type === 'PDF')` que:
   - Verifica se `el._pdfCanvas` já existe (canvas offscreen cacheado).
   - Se não, dispara carregamento assíncrono via `pdfjsLib.getDocument()`.
   - Renderiza a 1ª página em canvas offscreen com escala 2× para alta resolução.
   - Armazena em `el._pdfCanvas` e chama `drawPreview()` para redesenhar.
   - Enquanto carrega: exibe placeholder cinza com texto "PDF...".
   - Se sem conteúdo: exibe placeholder "📄 PDF".

2. **`updateImpSummary` — função `preloadNumPdfElements(numeracao)`**  
   Função utilitária que itera sobre todos os elementos da numeração selecionada
   e pré-carrega `el._pdfCanvas` para cada `el.type === 'PDF'` com `pdf_content`.
   Executada para `num` e `num2` toda vez que a numeração muda no dropdown.
   Segue o mesmo padrão já existente para SVG (`num._svgImage`).

3. **`hitTest` (editor de numeração)**  
   Adicionada linha `else if (el.type === 'PDF') { w = el.width_mm || 20; h = el.height_mm || 20; }`
   para o elemento PDF ter hitbox correta ao clicar/arrastar no canvas do editor.

---

## [2026-06-08] — Diagnóstico: Servidor FastAPI Offline

### Problema
O PDF imposicionado não era gerado. O servidor FastAPI (porta 8080) estava parado.

### Causa
O servidor não é iniciado automaticamente com o sistema. Precisa ser iniciado manualmente
via `iniciar_servidores.bat` ou `venv\Scripts\python.exe app.py`.

### Solução
Servidor reiniciado. Confirmado respondendo HTTP 200 em `/api/formatos`.

---

## [2026-06-07 ou anterior] — Multi-Artes

### Funcionalidade
Novo esquema de imposição `multi_artes` que permite colocar múltiplas artes
diferentes na mesma chapa de imposição.

**Frontend (`script.js`):**
- Array `state.impMultiArtes` com objetos `{pdf_url, pdf_name, qtd, num1_id, num2_id}`.
- UI renderizada por `renderMultiArtes()` / `renderMultiArtesList()`.
- Upload individual por arte via `uploadMultiArtePdf(index, fileInput)`.
- Preview: `drawPreview()` acumula `item_index` percorrendo cada arte pela quantidade.

**Backend (`engine.py`):**
- Schema `multi_artes`: itera pelas artes da lista, coluna por coluna (column-first).
- Cada arte tem sua própria numeração 1 e 2.
- `_load_multi_arte_pdf(arte)` carrega o PDF da URL via `_get_url_bytes()`.

---

## [Anterior] — Modo Duplex (Frente e Verso)

### Funcionalidade
Geração automática de PDF com frente e verso para impressão duplex.

- Cada folha lógica gera 2 páginas no PDF final.
- Colunas do verso espelhadas horizontalmente: `col_verso = cols - 1 - col`.
- Rotação do verso: `(360 - rot_frente) % 360`.
- Elementos filtrados por `face`: `front`, `back`, `both`.
- Em modo `pdf_multiple + duplex`: pares de páginas (ímpar=frente, par=verso).

---

## [Anterior] — Rotação Individual de Células

### Funcionalidade
Permite aplicar rotações diferentes (0°, 90°, 180°, 270°) para cada célula da grade.

- `formato.rotations`: dicionário `{indice_celula: angulo}`.
- UI: clicar no canvas do formato seleciona a célula; botões aplicam a rotação.
- Backend: rotação aplicada por `show_pdf_page(..., rotate=angle)`.
- Verso: rotação automicamente invertida.

---

## [Anterior] — Elemento SVG nas Numerações

### Funcionalidade
Suporte a SVG como elemento VDP, permitindo logos e ícones vetoriais.

- Backend: `svglib.svg2rlg()` + `reportlab` converte SVG para PDF temp → `show_pdf_page`.
- Frontend editor: `state.numSvgImage` renderizado via `data:image/svg+xml`.
- Frontend preview: `currentNum._svgImage` pré-carregado em `updateImpSummary`.

---

## [Anterior] — Elemento PDF nas Numerações (Backend)

### Funcionalidade
Suporte a PDF como elemento VDP — permite timbre, logo em PDF vetorial, etc.

- Backend: decodifica `pdf_content` (base64 ou URL) → `fitz.open(stream)` → `show_pdf_page`.
- Frontend editor: `state.numPdfImage` (renderizado via pdfjsLib).
- *(Frontend preview de imposição: implementado em 2026-06-08, ver acima.)*

---

## [Anterior] — Picote

### Funcionalidade
Linha tracejada vertical no canvas do editor como guia visual de picote/corte.

- Renderizado apenas no frontend (canvas do editor e preview).
- **Ignorado no PDF final** (não aparece na impressão).
- Inicializa em `x_mm = 25` por padrão.

---

## [Anterior] — Barra de Progresso com ETA

### Funcionalidade
Barra de progresso visual durante a geração do PDF com estimativa de tempo restante.

- Calcula total de itens antes de iniciar (considerando CSV, pdf_multiple, multi_artes).
- Detecta se o processamento é local (180 itens/s) ou remoto (~35 itens/s + latência).
- Progresso sintético avança até 95%, completa em 100% ao receber a resposta.
- Botão de cancelamento via `AbortController`.

---

## [Anterior] — Centralização Absoluta e Correção de CropBox

### Funcionalidade
PDFs com CropBox deslocado (CorelDraw, Illustrator, InDesign) são corretamente
centralizados na célula via `clip=page_base.rect` no PyMuPDF.

> Ver documentação técnica completa em `docs/regra_centralizacao.md`.

---

## [Anterior] — Autenticação Firebase

### Funcionalidade
- Login com email/senha e Google OAuth via Firebase Auth.
- Claims personalizadas: `admin`, `editor`.
- Backend valida JWT via `firebase_admin.auth.verify_id_token()`.
- Painel de administração para alterar papéis de usuários.
- Fallback local (sem auth) para desenvolvimento.

---

## [Anterior] — Serviço de Impressão Local

### Funcionalidade
- Agente HTTP local (porta 9000) para enviar PDFs diretamente a impressoras da rede.
- Parser de arquivos PPD para opções avançadas de impressão.
- Mapeamento impressora → PPD persistido em `printer_ppd_map.json`.

---

## [Anterior] — Tela de Amostras

### Funcionalidade
Geração de amostra combinada (cor + numeração) para aprovação antes da tiragem.

- Três canvases separados: Cor, Numeração, Combinado.
- Escala 1:1 entre os três para comparação fiel.
- PDF de referência de cor carregado via `state.cores`.

---

## [Anterior] — Esquema PDF Múltiplo

### Funcionalidade
Carrega um PDF de múltiplas páginas e impõe cada página em uma posição da grade.

- `total_items = pdf.numPages`.
- Em duplex: `total_items = ceil(pages / 2)`.
- Campos início/fim travados automaticamente.

---

*Changelog mantido pela equipe Ideal / Antigravity.*
