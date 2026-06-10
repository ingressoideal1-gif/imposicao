# 📄 Ideal Imposition — Documentação Técnica Completa

> **Sistema de Imposição Gráfica com Dados Variáveis (VDP)**
> Última atualização: 10 de Junho de 2026

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Estrutura de Arquivos](#estrutura-de-arquivos)
4. [Backend (FastAPI)](#backend-fastapi)
5. [Motor de Imposição (engine.py)](#motor-de-imposição-enginepy)
6. [Banco de Dados](#banco-de-dados)
7. [Frontend](#frontend)
8. [Serviço de Impressão](#serviço-de-impressão)
9. [Deploy](#deploy)
10. [Desenvolvimento Local](#desenvolvimento-local)
11. [Variáveis de Ambiente e Configuração](#variáveis-de-ambiente-e-configuração)
12. [Histórico de Bugs Resolvidos](#histórico-de-bugs-resolvidos)

---

## Visão Geral

O **Ideal Imposition** é um sistema web completo para **imposição gráfica** de PDFs com suporte a **Dados Variáveis (VDP)**. Ele permite:

- Imposição de PDFs em grades configuráveis (colunas × linhas)
- Numeração sequencial com textos, QR Codes, códigos de barras
- Dados variáveis via CSV (banco de dados)
- Múltiplas artes em uma mesma folha (Multi-Artes)
- Impressão frente/verso (duplex) com espelhamento automático
- Rotação individual de células
- Envio direto para impressoras via PostScript/PPD
- Modelos de imposição salvos para reuso

### Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Python 3.10+ / FastAPI / Uvicorn |
| Motor PDF | PyMuPDF (fitz) |
| Frontend | HTML/CSS/JavaScript vanilla |
| Banco de Dados (local) | JSON (`formats_db.json`) |
| Banco de Dados (produção) | Supabase (PostgreSQL) |
| Hospedagem Backend | Render (Web Service) |
| Hospedagem Frontend | Vercel (Static) |
| Repositório | GitHub |

---

## Arquitetura do Sistema

```
┌───────────────────────────────────────────────────────┐
│                    USUÁRIO (Browser)                    │
│           Frontend: Vercel / localhost:8080             │
└────────────────────┬──────────────────────────────────┘
                     │ HTTP (fetch)
        ┌────────────┼────────────┐
        ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────────┐
  │ Servidor │ │ Agente   │ │   Render     │
  │ Local    │ │ Local    │ │   (Cloud)    │
  │ :8080    │ │ :9000    │ │ imposicao.   │
  │ app.py   │ │ local_   │ │ onrender.com │
  │          │ │ print_   │ │              │
  │          │ │ agent.py │ │              │
  └────┬─────┘ └────┬─────┘ └──────┬───────┘
       │             │              │
       ▼             ▼              ▼
  ┌──────────────────────────────────────┐
  │         engine.py (ImpositionEngine) │
  │    PyMuPDF + QRCode + Barcode        │
  └──────────────────┬───────────────────┘
                     │
  ┌──────────────────┼───────────────────┐
  │                  │                   │
  ▼                  ▼                   ▼
formats_db.json   Supabase          Impressoras
(local)           (produção)        (win32print)
```

### Fluxo de Decisão do Frontend

O frontend detecta automaticamente onde processar:

1. **Porta 8080 ativa?** → Usa servidor local (máxima velocidade)
2. **Porta 9000 ativa?** → Usa agente de impressão local
3. **Nenhum local?** → Usa Render (cloud)

---

## Estrutura de Arquivos

```
ideal-imposition/
│
├── app.py                    # Servidor FastAPI principal (porta 8080)
├── engine.py                 # Motor de imposição PDF (núcleo do sistema)
├── db.py                     # Camada de banco de dados (JSON local)
├── print_service.py          # Serviço de impressão (PostScript/PPD)
├── ppd_parser.py             # Parser de arquivos PPD de impressora
├── local_print_agent.py      # Agente local para impressão (porta 9000)
├── agent_tray.py             # Agente com ícone na bandeja do sistema
├── main.py                   # CLI de teste (antigo, não usado no servidor)
│
├── requirements.txt          # Dependências Python
├── render.yaml               # Configuração de deploy no Render
├── schema.sql                # Schema SQL para Supabase (PostgreSQL)
├── firestore.rules           # Regras do Firestore (legado)
├── iniciar_servidores.bat    # Script Windows para iniciar tudo
├── installer.iss             # Script Inno Setup para criar instalador
├── formats_db.json           # Banco de dados local (gerado automaticamente)
│
├── frontend/                 # Frontend estático
│   ├── index.html            # Página principal (SPA)
│   ├── script.js             # Toda a lógica JavaScript (~10.000 linhas)
│   ├── style.css             # Estilos CSS
│   ├── supabase-config.js    # Configuração Supabase + URL da API
│   ├── vercel.json           # Configuração de deploy Vercel
│   ├── logo.png              # Logo da aplicação
│   └── Logo Ideal Dark.png   # Logo variante escura
│
├── ppds/                     # Arquivos PPD de impressoras uploadados
├── docs/                     # Documentação
├── venv/                     # Ambiente virtual Python (local)
├── build/                    # Build do instalador
└── dist/                     # Distribuição do instalador
```

---

## Backend (FastAPI)

### Arquivo: `app.py`

Servidor principal que roda na **porta 8080**.

#### Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/` | Redireciona para `/app/index.html` |
| `GET` | `/api/proxy?url=` | Proxy para download de PDFs externos |
| **Formatos** | | |
| `GET` | `/api/formatos` | Lista todos os formatos |
| `GET` | `/api/formatos/{id}` | Obtém formato por ID |
| `POST` | `/api/formatos` | Cria novo formato |
| `PUT` | `/api/formatos/{id}` | Atualiza formato |
| `DELETE` | `/api/formatos/{id}` | Remove formato |
| **Numerações** | | |
| `GET` | `/api/numeracoes` | Lista numerações |
| `GET` | `/api/numeracoes/{id}` | Obtém numeração por ID |
| `POST` | `/api/numeracoes` | Cria numeração |
| `PUT` | `/api/numeracoes/{id}` | Atualiza numeração |
| `DELETE` | `/api/numeracoes/{id}` | Remove numeração |
| **Saídas** | | |
| `GET` | `/api/saidas` | Lista saídas (tamanhos de folha) |
| `POST/PUT/DELETE` | `/api/saidas/{id}` | CRUD de saídas |
| **Cores** | | |
| `GET` | `/api/cores` | Lista cores |
| `POST/PUT/DELETE` | `/api/cores/{id}` | CRUD de cores |
| **Modelos** | | |
| `GET` | `/api/modelos_imposicao` | Lista modelos salvos |
| `POST/PUT/DELETE` | `/api/modelos_imposicao/{id}` | CRUD de modelos |
| **Imposição** | | |
| `POST` | `/api/impose` | **Rota principal** — executa imposição |
| **Impressão** | | |
| `GET` | `/api/printers` | Lista impressoras do sistema |
| `GET` | `/api/ppds` | Lista PPDs uploadados |
| `POST` | `/api/ppds/upload` | Upload de arquivo PPD |
| `GET/POST` | `/api/printers/ppd-map` | Mapeamento impressora↔PPD |
| `POST` | `/api/print/submit` | Envia job de impressão |
| **Diagnóstico** | | |
| `GET` | `/api/diag` | Retorna logs de diagnóstico |

#### Rota `/api/impose` (Detalhamento)

Aceita `multipart/form-data` com:

- `file` — Arquivo principal (PDF/JPG/PNG), opcional para multi_artes
- `csv_file` — Arquivo CSV para dados variáveis (opcional)
- `ma_file_0`, `ma_file_1`... — Arquivos de artes múltiplas (para schema multi_artes)
- `payload` — JSON string com toda a configuração:

```json
{
  "formato": { "name": "...", "width_mm": 100, "height_mm": 50, "cols": 2, "rows": 5, ... },
  "saida": { "width_mm": 450, "height_mm": 320, ... },
  "numeracao": { "elements": [...] },
  "numeracao_2": null,
  "seq_start": 1,
  "seq_end": 100,
  "seq_increment": 1,
  "schema": "sequential",
  "print_mode": "front",
  "rotate_page": false,
  "multi_artes": []
}
```

---

## Motor de Imposição (engine.py)

### Classe `ImpositionConfig`

Recebe e pré-processa toda a configuração:

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `base_file` | str | Caminho do PDF/imagem base |
| `out_pdf` | str | Caminho do PDF de saída |
| `formato` | dict | Tamanho do item + grade (cols/rows/gaps) |
| `numeracao` | dict | Elementos VDP da frente |
| `numeracao_2` | dict | Elementos VDP do verso (duplex) |
| `saida` | dict | Tamanho da folha de saída |
| `layout_schema` | str | Esquema de layout |
| `csv_data` | list | Dados CSV para VDP via banco de dados |
| `print_mode` | str | `front`, `duplex` |
| `rotate_page` | bool | Rotação de 90° da página |
| `multi_artes` | list | Lista de artes para Multi-Artes |

### Esquemas de Layout (`layout_schema`)

| Schema | Descrição | Ordenação |
|--------|-----------|-----------|
| `sequential` | Preenche posições sequencialmente | Folha 1: pos 1,2,3,4... Folha 2: pos 5,6,7... |
| `cut_stack` | Empilhar e cortar — mesma posição em folhas diferentes recebe sequência | Pos 1 folha 1 = item 1, Pos 1 folha 2 = item 2... |
| `step_repeat` | Repetição — todos os itens da folha são iguais | Folha 1: todos = item 1, Folha 2: todos = item 2 |
| `pdf_multiple` | Cada página do PDF base vira um item da grade | Página 1 → pos 1, Página 2 → pos 2... |
| `multi_artes` | Múltiplas artes com quantidades independentes | Distribuição por coluna, ordenado por quantidade |

### Elementos VDP Suportados

| Tipo | Campos | Descrição |
|------|--------|-----------|
| `TEXT` | x_mm, y_mm, font_size, font_name, color, rotation, prefix, suffix, pad | Texto com numeração sequencial |
| `FIXED` | x_mm, y_mm, font_size, fixed_value | Texto fixo (não varia) |
| `QR` | x_mm, y_mm, size_mm, color | QR Code gerado dinamicamente |
| `BARCODE` | x_mm, y_mm, width_mm, height_mm, barcode_format, color | Código de barras (code128, ean13, ean8, upca, itf) |
| `SVG` | x_mm, y_mm, width_mm, height_mm, svg_content | Imagem SVG (URL ou inline) |
| `PDF` | x_mm, y_mm, width_mm, height_mm, pdf_content | PDF embutido (base64 ou URL) |

### Fontes Suportadas (Base-14)

| Frontend | PyMuPDF |
|----------|---------|
| `helv` | `helv` (Helvetica) |
| `helv-bold` | `hebo` (Helvetica Bold) |
| `times` | `tiro` (Times Roman) |
| `times-bold` | `tibo` (Times Bold) |
| `cour` | `cour` (Courier) |
| `cour-bold` | `cobo` (Courier Bold) |

### Constante de Conversão

```python
MM2PT = 2.8346  # 1mm = 2.8346 pontos PDF
```

---

## Banco de Dados

### Modo Local (Desenvolvimento)

- **Arquivo:** `formats_db.json`
- **Módulo:** `db.py`
- Banco JSON simples com CRUD para: `formatos`, `numeracoes`, `saidas`, `cores`, `modelos_imposicao`
- IDs gerados com UUID: `fmt_`, `num_`, `sai_`, `cor_`, `mod_`
- Suporta migração de schema antigo (`input_formats`/`output_formats`)

### Modo Produção (Supabase)

- **Schema:** `schema.sql`
- **Configuração:** `frontend/supabase-config.js`
- Tabelas: `formatos`, `saidas`, `cores`, `numeracoes`, `modelos_imposicao`
- RLS desabilitado (segurança gerenciada pela aplicação)
- URL: `https://atsxtuibeitloosckmlc.supabase.co`

---

## Frontend

### Arquivos

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| `index.html` | 70 KB | HTML completo (SPA) |
| `script.js` | 240 KB | Lógica JavaScript (~10.000 linhas) |
| `style.css` | 29 KB | Estilos CSS |
| `supabase-config.js` | 1 KB | Config Supabase + URL da API |
| `vercel.json` | 291 B | Config deploy Vercel |

### Detecção Automática de Backend

O frontend (`supabase-config.js`) detecta automaticamente:

```javascript
const API_BASE_URL = (window.location.hostname === "localhost" || 
                      window.location.hostname === "127.0.0.1") &&
                      window.location.protocol !== 'file:'
    ? ""   // Mesmo domínio (localhost)
    : "https://imposicao.onrender.com";  // Cloud (Render)
```

Além disso, na hora de imposicionar (`runImposition`), o frontend tenta:
1. `http://localhost:8080/api/formatos` → Servidor local (prioridade máxima)
2. `http://localhost:9000/` → Agente de impressão local
3. `API_BASE_URL` → Render (cloud)

---

## Serviço de Impressão

### Arquitetura de Impressão

```
Frontend → /api/print/submit → print_service.py
                                    │
                            ┌───────┼───────┐
                            ▼               ▼
                      convert_pdf_      win32print
                      to_ps_with_ppd    (Windows API)
                            │
                      Render page → JPEG → ASCII85 → PostScript
                            │
                      Inject PPD codes (PageSize, Duplex, Tray...)
```

### Componentes

- **`print_service.py`**: Converte PDF → PostScript com injeção de opções PPD, envia ao spooler Windows
- **`ppd_parser.py`**: Parseia arquivos PPD de impressoras para extrair opções configuráveis
- **`local_print_agent.py`**: Servidor FastAPI leve (porta 9000) para impressão direta
- **`agent_tray.py`**: Versão com ícone na bandeja do sistema (systray)

### Fluxo de Impressão

1. Usuário seleciona impressora e configura opções (bandeja, duplex, qualidade)
2. Frontend envia PDF + opções para `/api/print/submit`
3. Backend converte PDF → PostScript com comandos PPD injetados
4. PostScript é enviado como RAW ao spooler do Windows (`win32print`)

---

## Deploy

### Repositório Git

```
URL:    https://github.com/ingressoideal1-gif/imposicao.git
Branch: main
```

### Regra de Deploy

> **Toda alteração feita na branch `main` dispara deploy automático (CI/CD)** tanto no Vercel (frontend) quanto no Render (backend).

### Deploy do Backend — Render

| Config | Valor |
|--------|-------|
| **Plataforma** | [Render](https://render.com/) |
| **Tipo** | Web Service |
| **Nome** | `ideal-imposition-api` |
| **URL Pública** | `https://imposicao.onrender.com` |
| **Linguagem** | Python 3.10 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| **Config File** | `render.yaml` |
| **Branch monitorada** | `main` |

#### Passos para Deploy Manual no Render

1. Acesse [render.com](https://render.com/) e faça login
2. Selecione o serviço `ideal-imposition-api`
3. O Render detecta automaticamente pushes para `main`
4. Se necessário, clique em **Manual Deploy → Deploy latest commit**

### Deploy do Frontend — Vercel

| Config | Valor |
|--------|-------|
| **Plataforma** | [Vercel](https://vercel.com/) |
| **Root Directory** | `frontend` |
| **Framework** | Other (estático) |
| **Config File** | `frontend/vercel.json` |
| **Branch monitorada** | `main` |
| **Headers** | Cache-Control: no-cache, no-store, must-revalidate |

#### Passos para Deploy Manual na Vercel

**Opção A — Via Dashboard (Recomendado):**
1. Acesse [vercel.com](https://vercel.com/)
2. Selecione o projeto importado
3. O Vercel detecta automaticamente pushes para `main`

**Opção B — Via CLI:**
```bash
cd frontend
npx vercel --prod
```

### Deploy Completo (Checklist)

```
□ Testar localmente: python app.py → http://localhost:8080
□ Verificar que as alterações estão corretas
□ git add . && git commit -m "descrição"
□ git push origin main
□ Aguardar build do Render (2-5 min) → verificar https://imposicao.onrender.com
□ Aguardar build do Vercel (1-2 min) → verificar URL do Vercel
□ Testar online: imposição sequential, multi_artes, duplex
```

### ⚠️ Regras Importantes de Deploy

1. **Nunca edite arquivos diretamente no Render/Vercel** — sempre via Git
2. **A URL da API no frontend** (`supabase-config.js`) deve apontar para `https://imposicao.onrender.com`
3. **O Render tem cold start** — a primeira requisição após inatividade pode demorar ~30s
4. **PDFs grandes** podem causar timeout no Render (plano gratuito: 30s). Para jobs pesados, use o servidor local
5. **O `formats_db.json` no Render é efêmero** — dados persistentes devem ficar no Supabase
6. **Limpar `__pycache__`** após alterações no engine para evitar usar bytecode antigo

---

## Desenvolvimento Local

### Pré-requisitos

- Python 3.10+
- pip / venv
- Git
- Node.js (opcional, para Vercel CLI)

### Configuração Inicial

```bash
cd ideal-imposition
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### Iniciar Servidores

**Opção 1 — Script Batch (Windows):**
```bash
iniciar_servidores.bat
```

Isso inicia:
- Servidor API na porta **8080** (`app.py`)
- Agente de Impressão na porta **9000** (`local_print_agent.py`)

**Opção 2 — Manual:**
```bash
# Terminal 1 — Servidor principal
python app.py

# Terminal 2 — Agente de impressão (opcional)
python local_print_agent.py
```

### Acessar

- **Aplicação:** http://localhost:8080
- **API Docs:** http://localhost:8080/docs (Swagger automático do FastAPI)
- **Agente impressão:** http://localhost:9000

### Dependências (`requirements.txt`)

```
pymupdf>=1.23.0           # Motor PDF (fitz)
qrcode[pil]>=7.4.2        # Geração de QR Codes
fastapi>=0.100.0           # Framework web
uvicorn>=0.23.0            # Servidor ASGI
python-multipart>=0.0.6   # Upload de arquivos (multipart/form-data)
python-barcode[images]>=0.15.1  # Geração de códigos de barras
Pillow>=10.0.0             # Processamento de imagens
firebase-admin>=6.2.0      # Firebase (legado, pode ser removido)
```

> **Nota:** `win32print` (pywin32) é necessário apenas no Windows para impressão direta. Não está no requirements.txt pois não é compatível com Linux (Render).

---

## Variáveis de Ambiente e Configuração

### Supabase (frontend/supabase-config.js)

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave pública (anon) do Supabase |
| `API_BASE_URL` | URL do backend (auto-detectada ou manual) |

### Render (render.yaml)

| Variável | Valor |
|----------|-------|
| `PYTHON_VERSION` | `3.10.0` |

---

## Histórico de Bugs Resolvidos

### Bug #1 — Multi-Artes: "ERR: doc_base nulo!" (10/06/2026)

**Sintoma:** PDFs gerados com multi_artes mostravam mensagem de erro em cada célula.

**Causa:** Bug de indentação no `engine.py` — o loop `for art in sorted_artes:` que popula `multi_map` estava dentro da função `_load_art_as_pdf()` após um `return None`, tornando-o código morto (unreachable). `multi_map` ficava vazio → todas as células usavam `doc_base` (que é `None` para multi_artes).

**Correção:** Mover o loop e a função `_load_art_as_pdf()` para dentro do bloco `if cfg.layout_schema == "multi_artes":`.

**Por que só falhava online:** Localmente o Python usava `__pycache__/engine.cpython-314.pyc` compilado de uma versão anterior (correta). No Render, sem cache, compilava o código quebrado.

### Bug #2 — Multi-Artes: Imposição não iniciava (10/06/2026)

**Sintoma:** Ao clicar "Gerar PDF" no multi_artes, a janela de salvar abria mas nada acontecia depois.

**Causa:** No `frontend/script.js`, o `payloadMultiArtes` usava `...arte` (spread) que copiava propriedades não-serializáveis (`pdfDoc` com referências circulares, `rawFile`, `pagesCache`). O `JSON.stringify` explodia com `TypeError: Converting circular structure to JSON`, e como estava fora do `try/catch`, o erro era silencioso.

**Correção:** Substituir `...arte` por uma lista explícita de propriedades serializáveis: `qtd`, `pdf_url`, `pdf_name`, `num1_id`, `num2_id`, `start`.

### Bug #3 — `urllib.request` não importado (10/06/2026)

**Sintoma:** Artes multi_artes carregadas via URL (Supabase Storage) falhavam silenciosamente.

**Causa:** A função `_load_art_as_pdf()` usava `urllib.request.Request` sem importar o módulo.

**Correção:** Adicionado `import urllib.request` no início da função.

---

*Documentação gerada automaticamente em 10/06/2026. Manter atualizada a cada alteração significativa no projeto.*
