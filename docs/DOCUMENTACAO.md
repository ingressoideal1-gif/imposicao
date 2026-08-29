# Ideal Imposition — Documentação Técnica Completa

> Sistema profissional de imposição gráfica com dados variáveis (VDP) para gráficas.  
> Versão da documentação: **Junho 2026**

> [!CAUTION]
> **Partes deste documento estão desatualizadas.** Ele descreve a arquitetura de
> junho de 2026 e ainda não foi revisto por inteiro. Conferido em 19/08/2026:
>
> - **A autenticação não é mais Firebase.** O `frontend/firebase-config.js` nem
>   existe mais, e nenhuma página do painel carrega o SDK. Quem autentica é o
>   Supabase. Sobrou uma referência defensiva em `frontend/pedido.js`, protegida
>   por `typeof firebase !== 'undefined'` — código morto. Ignore a seção 12 e as
>   menções a `firebase-admin`, a tokens do Firebase e ao Firebase Storage.
> - **O backend não é mais o servidor Python na nuvem.** São Edge Functions no
>   Supabase; o Render foi desligado. O `app.py` continua no repositório porque é
>   o motor que roda **localmente**, dentro do agente NewProd — a imposição e a
>   geração de PDF nunca acontecem na nuvem, por tempo e por segurança.
> - As rotas listadas na seção 6 valem para esse motor local, não para uma API
>   pública.
>
> **Enquanto a revisão não vem**, use como fonte de verdade:
> [`STATUS_PROJETO.md`](STATUS_PROJETO.md) (onde o projeto está),
> [`REGRAS_BANCO.md`](REGRAS_BANCO.md) (o banco),
> [`lista_de_arte.md`](lista_de_arte.md) e
> [`fluxo_aprovacao_arte.md`](fluxo_aprovacao_arte.md) (as telas de arte),
> [`tela_do_pedido.md`](tela_do_pedido.md) (a tela onde se manda imprimir),
> [`painel_do_acabamento.md`](painel_do_acabamento.md) (o Acabamento),
> [`PUBLICAR.md`](PUBLICAR.md) e [`../GUIA_AGENTE.md`](../GUIA_AGENTE.md)
> (publicação e agente).
>
> O que continua verdadeiro aqui: a descrição do **motor de imposição**
> (`engine.py`), dos **elementos VDP**, dos **esquemas de imposição**, do **modo
> duplex** e da **regra de centralização** — que é a maior parte do documento.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Como Rodar o Projeto](#3-como-rodar-o-projeto)
4. [Módulo de Banco de Dados — db.py](#4-módulo-de-banco-de-dados--dbpy)
5. [Motor de Imposição — engine.py](#5-motor-de-imposição--enginepy)
6. [API REST — app.py](#6-api-rest--apppy)
7. [Frontend — script.js](#7-frontend--scriptjs)
8. [Elementos VDP Suportados](#8-elementos-vdp-suportados)
9. [Esquemas de Imposição](#9-esquemas-de-imposição)
10. [Modo Duplex (Frente e Verso)](#10-modo-duplex-frente-e-verso)
11. [Regra de Centralização de Artes](#11-regra-de-centralização-de-artes)
12. [Autenticação Firebase](#12-autenticação-firebase)
13. [Serviço de Impressão Local](#13-serviço-de-impressão-local)
14. [Deploy (Vercel / Supabase)](#14-deploy-vercel--render--supabase)

---

## 1. Visão Geral

O **Ideal Imposition** é uma aplicação web completa para gráficas que automatiza o processo de imposição gráfica — o posicionamento de múltiplas cópias de um item (ingresso, cartão, rótulo) em uma folha grande de papel para impressão offset ou digital.

O sistema suporta:
- Imposição em grade (N colunas × M linhas) com gaps e offsets configuráveis
- Dados variáveis (VDP): numeração sequencial, QR Code, código de barras, texto fixo, SVG e PDF embutido
- Banco de dados externo via CSV
- Modo frente/verso (duplex) com espelhamento automático
- Rotação individual de células na grade
- Multi-artes (várias artes diferentes na mesma folha)
- Amostras geradas para aprovação com PDF de referência de cor
- Agente de impressão local (envio direto para impressoras da rede)
- Autenticação Firebase com controle de papel (admin/editor/user)

---

## 2. Arquitetura do Sistema

```
ideal-imposition/
├── app.py                  # API FastAPI — rotas REST e autenticação
├── engine.py               # Motor de imposição — PyMuPDF (fitz)
├── db.py                   # Persistência local JSON (fallback do Firestore)
├── print_service.py        # Serviço de envio para impressoras CUPS/IPP
├── local_print_agent.py    # Agente HTTP local (porta 9000)
├── ppd_parser.py           # Parser de arquivos PPD de impressoras
├── formats_db.json         # Banco de dados local (formatos, numerações, saídas)
├── requirements.txt        # Dependências Python
├── iniciar_servidores.bat  # Script de inicialização local (Windows)
├── venv/                   # Ambiente virtual Python
├── frontend/
│   ├── index.html          # SPA — todo o HTML do painel
│   ├── style.css           # Design premium (tema escuro, glassmorphism)
│   ├── script.js           # Toda a lógica do frontend (~5000 linhas)
│   └── firebase-config.js  # Configuração do Firebase SDK
└── docs/
    ├── DOCUMENTACAO.md             # Esta documentação
    ├── regra_centralizacao.md      # Regra técnica de centralização de PDFs
    ├── walkthrough_recursos_recentes.md
    └── PUBLICAR.md                 # Documento único de publicação (substituiu DEPLOY.md)
```

> **Aviso de validade.** Fora da seção 14, este documento descreve o estado do projeto em
> junho de 2026 e envelheceu em pontos importantes: o banco é o **Supabase**, não o
> Firestore; o frontend é servido pela **Vercel**, não pelo Firebase Hosting; e o
> `app.py` local escuta a **porta 9000**, não a 8080. Em caso de divergência, valem
> [PUBLICAR.md](PUBLICAR.md) e o código.

### Fluxo de dados

```
Browser (script.js)
   │
   ├─ CRUD (formatos, numerações, saídas, cores, modelos)
   │     └─► Firestore (online) OU FastAPI → db.py → formats_db.json (local)
   │
   └─ POST /api/impose (multipart: PDF + CSV + payload JSON)
         └─► FastAPI (app.py)
               └─► ImpositionEngine (engine.py)
                     └─► PyMuPDF → PDF final gerado → download
```

---

## 3. Como Rodar o Projeto

### Pré-requisitos
- Python 3.10+
- Node.js não é necessário (pure HTML/CSS/JS)

### Instalação

```powershell
# Criar ambiente virtual
python -m venv venv

# Instalar dependências
venv\Scripts\pip install -r requirements.txt
```

### Iniciar o servidor

```powershell
# Opção 1: Script automático (recomendado no Windows)
.\iniciar_servidores.bat

# Opção 2: Manual
venv\Scripts\python.exe app.py
```

O servidor sobe na porta **8080**. Acesse: **http://localhost:8080**

O frontend detecta automaticamente se o servidor local está disponível e o usa. Não há alternativa na nuvem: imposição e impressão acontecem **só** na estação da gráfica, por decisão de 16/08/2026 (tempo e segurança). Sem estação, o trabalho para e o operador lê o motivo.

### Dependências principais (`requirements.txt`)

| Pacote | Uso |
|---|---|
| `fastapi` | Framework da API REST |
| `uvicorn` | Servidor ASGI |
| `pymupdf` (fitz) | Motor de manipulação de PDF |
| `Pillow` | Leitura de imagens JPG/PNG |
| `qrcode` | Geração de QR Codes |
| `python-barcode[images]` | Geração de códigos de barras |
| `firebase-admin` | Autenticação Firebase no backend |
| `svglib` + `reportlab` | Conversão de SVG para PDF |

---

## 4. Módulo de Banco de Dados — db.py

O `db.py` é uma camada de persistência simples em arquivo JSON (`formats_db.json`). Funciona como **fallback local** quando o Firestore não está disponível, e também como banco principal em modo de desenvolvimento.

### Coleções

| Coleção | Prefixo de ID | Descrição |
|---|---|---|
| `formatos` | `fmt_` | Dimensões do item + configuração da grade |
| `numeracoes` | `num_` | Configurações de VDP (elementos, CSV, SVG, PDF) |
| `saidas` | `sai_` | Tamanho da folha de saída e formato do arquivo |
| `cores` | `cor_` | PDF de referência de cor vinculado a um formato |
| `modelos_imposicao` | `mod_` | Modelos pré-configurados de imposição (OS) |

### Schema de `formatos`

```json
{
  "id": "fmt_abc12345",
  "name": "Ingresso 100×50mm",
  "width_mm": 100,
  "height_mm": 50,
  "cols": 2,
  "rows": 5,
  "gap_h_mm": 3,
  "gap_v_mm": 2,
  "offset_h_mm": 0,
  "offset_v_mm": 0,
  "rotations": { "0": 90, "3": 180 }
}
```

> `rotations` é um dicionário onde a chave é o índice da célula (`"0"` = célula 0) e o valor é o ângulo de rotação (0, 90, 180, 270).

### Schema de `numeracoes`

```json
{
  "id": "num_abc12345",
  "name": "Numeração VIP",
  "formato_id": "fmt_abc12345",
  "svg_content": "...",
  "svg_filename": "logo.svg",
  "pdf_content": "data:application/pdf;base64,...",
  "pdf_filename": "timbre.pdf",
  "csv_data": [ {"nome": "João", "codigo": "001"} ],
  "elements": [ ...ver schema de elementos... ]
}
```

### Schema de `elementos` (dentro de `numeracao.elements`)

```json
{
  "id": "el_1",
  "type": "TEXT",         // TEXT | FIXED | QR | BARCODE | SVG | PDF | PICOTE
  "x_mm": 10,
  "y_mm": 5,
  "rotation": 0,
  "color": "#000000",
  "font_size": 14,
  "font_name": "helv",
  "pad": 5,
  "prefix": "ING-",
  "suffix": "",
  "face": "both",         // both | front | back (duplex)
  "fixed": false,
  "fixed_value": "",
  "source": "sequential", // sequential | database
  "csv_column": "",
  "size_mm": 15,          // para QR
  "width_mm": 40,         // para BARCODE, SVG, PDF
  "height_mm": 10,
  "barcode_format": "code128",
  "svg_content": "...",   // SVG: conteúdo inline ou URL
  "pdf_content": "..."    // PDF: base64 ou URL
}
```

---

## 5. Motor de Imposição — engine.py

### `ImpositionConfig`

Classe de configuração que recebe todos os parâmetros e realiza a conversão de mm → pt PDF (fator `MM2PT = 2.8346`).

**Parâmetros principais:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `base_file` | `str` | Caminho para o PDF/JPG/PNG da arte |
| `out_pdf` | `str` | Caminho de saída do PDF gerado |
| `formato` | `dict` | Dados do formato (width_mm, height_mm, cols, rows, gaps, offsets, rotations) |
| `numeracao` | `dict\|None` | Configuração VDP da frente (ou única numeração) |
| `numeracao_2` | `dict\|None` | Configuração VDP do verso (duplex) |
| `saida` | `dict` | Folha de saída (width_mm, height_mm) |
| `seq_start` | `int` | Número inicial da sequência |
| `seq_end` | `int` | Número final da sequência |
| `seq_increment` | `int` | Incremento da sequência (padrão: 1) |
| `layout_schema` | `str` | Esquema de distribuição |
| `csv_data` | `list[dict]\|None` | Dados do CSV para VDP |
| `print_mode` | `str` | `"front"`, `"duplex"` |
| `rotate_page` | `bool` | Rotaciona a página de saída 90° |
| `multi_artes` | `list[dict]` | Lista de artes para o esquema multi_artes |

### `ImpositionEngine`

Classe principal que executa o processamento.

#### Método `process()`

1. **Valida** se a grade cabe na folha de saída. Se não couber, lança `ValueError`.
2. **Centraliza** o bloco de grade na folha (`start_x`, `start_y`).
3. **Itera** folha por folha (`total_sheets = ceil(total_items / poses_per_sheet)`).
4. **Para cada célula** da grade:
   - Cria um PDF temporário (`temp_doc`) com as dimensões do item.
   - **Posiciona a arte** centralizada no temp_doc com offset aplicado.
   - **Renderiza os elementos VDP** (`_render_element`) no temp_doc.
   - **Impõe** o temp_doc na folha final com rotação da célula via `show_pdf_page`.
5. Em modo **duplex**: gera também a página de verso com espelhamento horizontal de colunas e rotação invertida.
6. Salva o PDF final com `garbage=3, deflate=True` (compressão máxima).

#### Método `_render_element()`

Renderiza um único elemento VDP numa página PyMuPDF. Suporta:

| Tipo | Biblioteca | Notas |
|---|---|---|
| `TEXT`, `FIXED` | PyMuPDF `insert_text` | Fontes Base-14 (helv, hebo, tiro, tibo, cour, cobo) |
| `QR` | `qrcode` + PIL | PNG gerado em memória |
| `BARCODE` | `python-barcode` + `ImageWriter` | 7 formatos: code128, ean13, ean8, upca, itf, code39, codabar |
| `SVG` | `svglib` + `reportlab` + PyMuPDF | SVG convertido para PDF temporário |
| `PDF` | PyMuPDF `show_pdf_page` | Base64 ou URL via `_get_url_bytes` |

#### Método `_load_base_as_pdf()`

Converte a arte base para um documento PyMuPDF:
- **PDF**: abre diretamente com `fitz.open`.
- **JPG/PNG**: cria um PDF temporário em memória com `fitz.open()`, insere a imagem centralizada proporcionalente (escala `min(w/img_w, h/img_h)`).

---

## 6. API REST — app.py

Servidor FastAPI com CORS aberto (`*`), servindo o frontend estático em `/app`.

### Endpoints

#### Utilitários

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/` | Redireciona para `/app/index.html` |
| `GET` | `/api/proxy?url=...` | Proxy para URLs externas (evita CORS no frontend) |

#### CRUD — Formatos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/formatos` | Lista todos os formatos |
| `GET` | `/api/formatos/{id}` | Busca formato por ID |
| `POST` | `/api/formatos` | Cria novo formato |
| `PUT` | `/api/formatos/{id}` | Atualiza formato |
| `DELETE` | `/api/formatos/{id}` | Remove formato |

#### CRUD — Numerações, Saídas, Cores, Modelos

Mesma estrutura que Formatos para as rotas:
- `/api/numeracoes`
- `/api/saidas`
- `/api/cores`
- `/api/modelos_imposicao`

#### Imposição

```
POST /api/impose   (multipart/form-data)
```

**Campos do form:**

| Campo | Tipo | Descrição |
|---|---|---|
| `file` | `UploadFile\|None` | Arte base (PDF, JPG, PNG). Omitido em multi_artes. |
| `csv_file` | `UploadFile\|None` | CSV com banco de dados variáveis |
| `payload` | `str` (JSON) | Configuração completa da imposição |

**Payload JSON (campos principais):**

```json
{
  "formato_id": "fmt_abc",
  "saida_id": "sai_abc",
  "numeracao_id": "num_abc",
  "numeracao_2_id": null,
  "formato": { ...objeto formato completo... },
  "saida": { ...objeto saída completo... },
  "numeracao": { ...objeto numeração completo... },
  "seq_start": 1,
  "seq_end": 1000,
  "seq_increment": 1,
  "schema": "sequential",
  "print_mode": "front",
  "rotate_page": false,
  "multi_artes": []
}
```

**Retorno:** `FileResponse` com o PDF imposto para download.

#### Impressão

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/printers` | Lista impressoras disponíveis |
| `GET` | `/api/ppds` | Lista arquivos PPD disponíveis |
| `POST` | `/api/ppds/upload` | Faz upload de arquivo PPD |
| `GET` | `/api/printers/ppd-map` | Obtém mapeamento impressora → PPD |
| `POST` | `/api/printers/ppd-map` | Salva mapeamento |
| `POST` | `/api/print/submit` | Envia job de impressão |

#### Administração

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/admin/users` | Lista usuários Firebase (admin only) |
| `POST` | `/api/admin/users/{uid}/role` | Altera papel do usuário (admin only) |

### Autenticação nas rotas

Todas as rotas (exceto utilitárias) recebem um `Bearer Token` JWT do Firebase via header `Authorization`. O backend verifica com `firebase_admin.auth.verify_id_token()`.

**Fallback de segurança:** Se o token falhar (ex.: servidor local sem chave de serviço), usa `local-fallback-user` com papel `admin=True` — permite desenvolvimento local sem Firebase configurado.

---

## 7. Frontend — script.js

Arquivo JavaScript único (~5000 linhas) em modo `'use strict'` sem framework (Vanilla JS).

### Estado global (`state`)

```javascript
const state = {
  formatos: [],           // array de formatos do banco
  numeracoes: [],         // array de numerações do banco
  saidas: [],             // array de saídas do banco
  cores: [],              // array de cores do banco
  modelosImposicao: [],   // array de modelos de imposição

  // Editor de Numeração
  numFormato: null,       // formato selecionado no editor
  numElements: [],        // elementos no canvas do editor
  numElCounter: 0,        // contador de IDs (nunca reseta)
  selectedElId: null,     // ID do elemento selecionado
  canvasScale: 3,         // px por mm no canvas do editor
  bgImage: null,          // arte de fundo carregada
  numSvgImage: null,      // imagem SVG da numeração
  numPdfImage: null,      // imagem renderizada do PDF da numeração
  numPdfContent: "",      // base64 ou URL do PDF da numeração
  numCsvHeaders: [],      // cabeçalhos do CSV carregado no editor
  numCsvData: null,       // dados do CSV carregado no editor

  // Preview de Imposição
  impArtImage: null,      // HTMLImageElement da arte no preview
  impArtPdfDoc: null,     // documento pdfjsLib da arte
  impArtPagesCache: {},   // cache de páginas renderizadas por número
  impMultiArtes: [],      // artes para o modo multi_artes
  csvFile: null,          // File do CSV na imposição
  csvData: null,          // dados parsed do CSV

  // Layout
  fmtRotations: {},       // rotações por índice de célula
  printMode: "front",     // front | duplex
  previewFace: "front",   // front | back
  loadedOSName: "",       // nome da OS carregada
  expectedArteName: "",   // validação de nome de arquivo
};
```

### Funções principais do preview de imposição

#### `updateImpSummary()`
Recalcula o resumo (total de itens, folhas, etc.) sempre que qualquer seleção muda. Também:
- Pré-carrega `num._svgImage` se a numeração tem SVG
- Pré-carrega `el._pdfCanvas` de cada elemento PDF via `preloadNumPdfElements()`
- Libera/trava campos de início/fim conforme o esquema
- Chama `drawPreview()`

#### `drawPreview()`
Renderiza o preview canvas da imposição. Para cada célula da grade:
1. Calcula posição e aplica rotação pelo centro.
2. Desenha a arte base (imagem ou página do PDF).
3. Chama `drawVdpElements()` para sobrepor os elementos VDP.
4. Aplica clipping para conter a arte na célula.

#### `drawVdpElements(currentNum, source_id)`
Itera sobre `currentNum.elements` e renderiza cada elemento no canvas 2D:

| Tipo | Renderização |
|---|---|
| `TEXT`, `FIXED` | `ctx.fillText()` com fonte correta |
| `QR` | Placeholder visual (grade 7×7) |
| `BARCODE` | Padrão de barras fake + label do formato |
| `SVG` | `ctx.drawImage(currentNum._svgImage)` se disponível |
| `PDF` | `ctx.drawImage(el._pdfCanvas)` se disponível (carregado assincronamente via pdfjsLib) |

#### `runImposition()`
Função principal que dispara a geração do PDF:
1. Valida campos obrigatórios.
2. **Abre o `showSaveFilePicker`** imediatamente (dentro do gesto do usuário, antes da requisição).
3. Detecta disponibilidade do servidor local (porta 8080) ou agente local (porta 9000); sem nenhum dos dois, a imposição não acontece — não existe motor na nuvem.
4. Monta `FormData` com o arquivo, CSV e payload JSON.
5. Faz `fetch POST /api/impose` com `AbortController` (cancelável pelo usuário).
6. Salva via `fileHandle.createWritable()` ou baixa via `URL.createObjectURL()`.

### Funções do editor de numeração

#### `drawCanvas()`
Renderiza o canvas do editor de numeração. Usa `state.canvasScale` (px/mm) para escalar tudo. Chama `drawElement()` para cada elemento de `state.numElements`.

#### `drawElement(ctx, el, S, isSelected)`
Desenha um único elemento VDP no canvas do editor:
- `TEXT`/`FIXED`: `window.desenharTextoAjustado()`, o mesmo ajuste de largura que o motor faz
- `QR` e `QR_IDEAL`: `window.renderQRCodeOnCtx()` / `window.desenharQRIdeal()`, do `qr-canvas.js`
- `BARCODE`: `window.renderBarcodeOnCtx()`, do `barcode-canvas.js` — o código de verdade, com a
  mesma codificação do motor. Até 27/08/2026 era um padrão fixo de 40 barras, igual para qualquer
  valor; ver `docs/fidelidade_tela_papel.md`
- `SVG`/`PDF`: `drawArteDoElemento()` sobre `el._svgImage` / `el._pdfCanvas` — por elemento, nunca
  global (as variáveis `state.numSvgImage` e `state.numPdfImage` deixaram de existir na v490)
- `FOTO`: `desenharElementoFoto()`
- `PICOTE`: linha tracejada vertical que atravessa toda a altura do formato

#### `saveNumeracao()`
Serializa `state.numElements` e faz upload de SVG/PDF para o Firebase Storage (se disponível) antes de salvar. O `pdf_content` de cada elemento PDF é substituído pela URL do Storage antes de persistir.

---

## 8. Elementos VDP Suportados

### TEXT (Numeração Sequencial)
- **Valor:** `{prefix}{numero_formatado}{suffix}`, onde `numero_formatado = str(val).zfill(pad)`.
- **Fonte:** Mapeamento para Base-14 PDF: `helv` (Helvetica), `hebo` (Helvetica Bold), `tiro` (Times Roman), `tibo` (Times Bold), `cour` (Courier), `cobo` (Courier Bold).
- **Suporte a CSV:** Se `source === "database"`, lê o valor da coluna `csv_column` do registro correspondente.

### FIXED (Texto Fixo)
- Igual ao TEXT, mas `fixed_value` é estático e não varia por item.

### QR Code
- **Backend:** `qrcode.QRCode(version=1, error_correction=ERROR_CORRECT_L, border=0)` + PIL → PNG → `fitz.insert_image`.
- **Cor personalizada** via `fill_color` do `make_image`.
- Dimensão controlada por `size_mm`. A margem é **zero** dos dois lados: o QR ocupa a caixa inteira.

### BARCODE (Código de Barras)
- **Backend:** `_modulos_do_barcode()` pede à `python-barcode` só o **padrão de módulos**
  (`build()`), e o motor desenha as barras como retângulos **vetoriais** — sem imagem. Assim a
  altura impressa é a pedida por construção, e o traço sai na resolução do RIP.
  Até 27/08/2026 era um PNG a 300 dpi, e a faixa branca de 1 mm que a biblioteca acrescenta era
  esticada junto: um elemento de 60 × 12 mm imprimia barras de 60,03 × 10,67.
- **Formatos suportados:** `code128`, `ean13`, `ean8`, `upca`, `itf`, `code39`, `codabar`.
- Normalização automática de dados: EAN-13 → 12 dígitos, EAN-8 → 7 dígitos, UPC-A → 11 dígitos, ITF → comprimento par. A mesma normalização existe no `frontend/barcode-canvas.js`.
- O fundo branco continua: é o contraste que o leitor pede sobre arte colorida.
- **Frontend:** `frontend/barcode-canvas.js`, dono único do desenho nas dez janelas. As tabelas
  foram extraídas da própria `python-barcode` e os algoritmos são espelho dos de lá — inclusive a
  troca de conjunto A/B/C do Code 128. `tests/test_barcode_canvas.py` compara os dois lados.

### SVG
- **Backend:** `svglib.svg2rlg()` + `reportlab.renderPDF.drawToString()` → PDF temporário em memória → `_colar_arte_pdf()` (que é `show_pdf_page` com o grupo de transparência, quando há opacidade).
- **Frontend:** `el._svgImage`, **no próprio elemento** — desde a v490 não há mais fonte global. O
  desenho é sempre `drawArteDoElemento()`, que encaixa sem distorcer.
- **Tamanho natural:** `svgNaturalSizeMm()` lê o tamanho do texto do arquivo, reproduzindo a
  interpretação do `svglib`. Medir pelo navegador erra quando o SVG não declara dimensão absoluta.

### PDF (Elemento PDF)
- **Backend:** Decodifica `pdf_content` (base64 ou URL via proxy) → `fitz.open()` → `_colar_arte_pdf()`. Entra **vetorial**, sempre: rasterizar a arte do cliente é proibido neste projeto.
- **Frontend editor:** `el._pdfCanvas`, por elemento (renderizado via pdfjsLib).
- **Frontend preview (imposição):** `el._pdfCanvas` — canvas offscreen renderizado assincronamente via pdfjsLib com escala 2x. Cache fica no próprio objeto elemento.
- **Pré-carregamento:** ao selecionar uma numeração no painel de imposição, `preloadNumPdfElements()` dispara o carregamento de todos os PDFs dos elementos antes mesmo do primeiro `drawPreview()`.

### PICOTE
- **Frontend editor:** Linha tracejada vertical que cruza todo o canvas na posição `x_mm`.
- **Backend:** Ignorado na renderização (não aparece no PDF final). É guia de acabamento, não tinta
  — divergência de propósito, registrada em `docs/fidelidade_tela_papel.md`.
- **No verso** ele espelha: `x = width_mm − x_mm`, porque o corte é físico e atravessa o papel.

### Geometria comum a todos os elementos

- `x_mm` e `y_mm` são o **centro** do elemento, contados do canto superior esquerdo da peça — dos
  dois lados.
- `rotation` (0, 90, 180 ou 270) gira a **caixa**, não só o conteúdo: um elemento de 40 × 20 mm a
  90° ocupa 20 × 40 na peça. No motor isso é `_caixa_girada()`.
- O texto é centrado na vertical pela régua do **arquivo da fonte**, não por uma média — ver
  `_fracao_tipografica()` e `docs/fidelidade_tela_papel.md`.
- O que passa da borda da peça **sangra** no papel, em todas as poses: é a sobra que protege do
  desvio da guilhotina (`_folga_de_sangria()`).

---

## 9. Esquemas de Imposição

| Schema | `layout_schema` | Comportamento |
|---|---|---|
| **Sequencial** | `sequential` | Folha por folha; dentro de cada folha, linha por linha, coluna por coluna. |
| **Corte e Empilhamento** | `cut_stack` | Coloca o mesmo número relativo da pilha em cada posição da folha. Ao cortar e empilhar, a sequência fica em ordem vertical. |
| **Step & Repeat** | `step_repeat` | Repete o mesmo item (item_index = 0 fixo) em todas as posições de todas as folhas. |
| **PDF Múltiplo** | `pdf_multiple` | Cada página do PDF de entrada ocupa uma posição da grade. `total_items = num_pages`. Em duplex: `total_items = ceil(pages/2)`, com frente e verso correlacionados. |
| **Multi-Artes** | `multi_artes` | Múltiplas artes diferentes na mesma folha. Cada arte tem URL de PDF, quantidade, numeração 1 e numeração 2 próprias. Distribuição por coluna (column-first). |

### Lógica de `item_index`

```python
if schema == "cut_stack":
    item_index = (P * total_sheets) + S
elif schema == "multi_artes":
    P_col_first = col * rows + row  # column-first
    item_index = (P_col_first * total_sheets) + S
elif schema == "sequential":
    item_index = (S * poses_per_sheet) + P
elif schema == "step_repeat":
    item_index = S  # sempre o mesmo (o índice da folha)
```

---

## 10. Modo Duplex (Frente e Verso)

Ao selecionar `print_mode = "duplex"`, para cada folha lógica são geradas **2 páginas no PDF de saída**:

### Página de Frente (ímpar)
- Renderização normal: coluna `col` da esquerda para a direita.
- Elementos com `face = "front"` ou `"both"`.
- Rotação da célula: `cell_rotation = rotations[P]`.

### Página de Verso (par)
- **Espelhamento horizontal:** `col_verso = cols - 1 - col`.
- Elementos com `face = "back"` ou `"both"`.
- **Rotação invertida:** `cell_rotation = (360 - cell_rotation_frente) % 360`.
- Página base do PDF de entrada: página de índice `page_idx_back` (segunda página do PDF ou `item_index * 2 + 1` em pdf_multiple).

### Agrupamento de elementos por face

No `ImpositionConfig`, ao carregar a numeração 1 → `face = "front"`.  
Ao carregar a numeração 2 → `face = "back"`.  
Em modo não-duplex, todos os elementos usam `face = el.get("face", "both")`.

---

## 11. Regra de Centralização de Artes

> Documentação técnica detalhada em: [regra_centralizacao.md](regra_centralizacao.md)

PDFs exportados de CorelDraw, Illustrator e InDesign frequentemente têm origem deslocada no CropBox (ex.: `Rect(100, 150, 355, 291)` para um cartão de 90×50mm). Sem tratamento, isso causa:
- **Deslocamento na folha** (offset indesejado)
- **Estouro de célula** (arte vaza para células adjacentes)

### Solução no backend (PyMuPDF)

```python
# Dimensões reais da arte = rect da página (post-CropBox)
base_w = page_base.rect.width
base_h = page_base.rect.height

# Centralizar na célula temporária
art_temp_x0 = (cfg.item_w - base_w) / 2 + cfg.offset_h
art_temp_y0 = (cfg.item_h - base_h) / 2 - cfg.offset_v

# CRÍTICO: clip=page_base.rect mapeia as coordenadas absolutas do CropBox
temp_page.show_pdf_page(rect_art_temp, doc_base, page_idx, clip=page_base.rect)
```

### Solução no frontend (PDF.js)

O `viewport` do PDF.js já normaliza a origem para `(0,0)`, portanto `viewport.width` e `viewport.height` representam as dimensões úteis exatas. A centralização no canvas é:

```javascript
const drawX = (canvasWidth - drawW) / 2;
const drawY = (canvasHeight - drawH) / 2;
```

---

## 12. Autenticação Firebase

### Frontend

O `firebase-config.js` inicializa o SDK v8 (compat) e disponibiliza `firebase.auth()` e `dbFirebase` (Firestore).

Ao carregar a página, `firebase.auth().onAuthStateChanged()` verifica se há usuário logado:
- **Logado:** carrega dados, exibe perfil, verifica claims para mostrar opções de admin.
- **Deslogado:** exibe overlay de login (email/senha ou Google).

O token JWT é obtido com `firebase.auth().currentUser.getIdToken()` e enviado em todas as requisições à API como `Authorization: Bearer {token}`.

### Backend

`firebase_admin.initialize_app(options={"projectId": "ideal-arte-e64f6"})` sem chave de serviço — usa Application Default Credentials (ADC).

Funções:
- `get_current_user()`: verifica token ou retorna fallback local.
- `check_admin()`: verifica claim `admin=True`.

### Papéis de usuário

| Papel | Claims | Permissões |
|---|---|---|
| `admin` | `{admin: true, editor: true}` | CRUD completo + gerenciar usuários |
| `editor` | `{admin: false, editor: true}` | CRUD de conteúdo |
| `user` | `{admin: false, editor: false}` | Somente leitura |

---

## 13. Serviço de Impressão Local

### Arquitetura

```
Browser → POST /api/print/submit → FastAPI → print_service.py → CUPS/lpr
                  ↑
         local_print_agent.py (porta 9000)
         [Para uso direto sem servidor remoto]
```

### `print_service.py`

- `get_printers()`: lista impressoras via `lpstat -p` (Linux/Mac) ou WMI (Windows).
- `send_print_job(printer_name, pdf_path, selected_options_codes, job_title)`: envia o PDF para a impressora com opções PPD convertidas.
- `load_printer_ppd_map()` / `save_printer_ppd_map()`: persiste o mapeamento impressora → arquivo PPD em `printer_ppd_map.json`.

### `ppd_parser.py`

Parser simplificado de arquivos PPD que extrai:
- `nick_name`, `model_name`
- `options`: dicionário `{option_key: {label, choices: {key: {label, code}}}}`

### `local_print_agent.py`

Servidor HTTP mínimo (porta 9000) que expõe o mesmo endpoint `/api/print/submit` e `/api/printers`. Permite que o browser envie o PDF diretamente para uma impressora local sem precisar do servidor FastAPI da porta 8080.

---

## 14. Deploy (Vercel / Supabase)

> **Como publicar, como voltar e o que fazer quando dá errado: [PUBLICAR.md](PUBLICAR.md).**
> Aquele é o documento único de publicação. Esta seção descreve só onde cada peça roda.

### Frontend (Vercel)

- Projeto `ideal-imposition`, servido em `ideal-imposition.vercel.app`.
- Publicado por `.\publicar.ps1 "mensagem"`, na raiz do repositório.

### Backend na nuvem (Edge Functions)

- Vivem em `supabase/functions/`, em Deno/TypeScript, no projeto `vwbtitjlpelrcnsytzqw`.
- Sobem no `.\publicar.ps1`, **antes** do push: a função tem de chegar antes da tela
  que aponta para ela.
- Até 16/08/2026 este papel era de uma cópia do `app.py` hospedada num serviço na
  nuvem. Ela foi desligada em 17/08/2026, e o `app.py` ficou sendo só o motor da
  estação da gráfica.

### Motor da estação (`app.py`)

- Roda na máquina da gráfica, dentro do `NewProd.exe`, na porta 9000 (e na 8080 em
  desenvolvimento). Não existe cópia dele na nuvem, e não deve voltar a existir:
  imposição e impressão são locais por tempo e por segurança.

### Banco de dados e arquivos (Supabase)

- Projeto `vwbtitjlpelrcnsytzqw`. Substituiu o Firestore; o Firebase não é mais usado em produção.
- A chave *anônima* em `frontend/supabase-config.js` é pública por natureza — o navegador
  precisa dela. A chave `service_role` **nunca** vai para arquivo versionado: ela mora no
  `.env.local`, e o freio de segredo do `publicar.ps1` existe para barrá-la.

### Agente da gráfica (`NewProd.exe`)

- Numeração própria, publicada por `.\publicar_agente.ps1 <versão>`. Instalador no bucket
  `agent-releases` do Supabase Storage. Funcionamento interno em [GUIA_AGENTE.md](../GUIA_AGENTE.md).

### Conferir se está tudo em ordem

```powershell
.\ferramentas\conferir.ps1
```

### Detecção de ambiente no frontend

O `runImposition()` detecta automaticamente onde processar:

```javascript
// 1. Servidor local FastAPI (porta 8080) — máxima velocidade
const apiCheck = await fetch("http://localhost:8080/api/formatos", { signal, timeout: 500ms });
if (apiCheck.ok) → baseUrl = "http://localhost:8080"

// 2. Agente local (porta 9000) — impressão local
const agentCheck = await fetch("http://localhost:9000/", { signal, timeout: 300ms });
if (agentCheck.ok && data.status === "running") → baseUrl = "http://localhost:9000"

// 3. Sem fallback de nuvem: imposição é só na estação
else → baseUrl = API_BASE_URL (definido no firebase-config.js)
```

---

*Documentação mantida e atualizada pela equipe Ideal / Antigravity — Junho 2026.*
