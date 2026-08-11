# Ideal Imposition — Documentação Completa do Projeto

> Sistema profissional de imposição gráfica com dados variáveis (VDP) para produção de ingressos, pulseiras e credenciais.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estrutura de Arquivos](#estrutura-de-arquivos)
5. [Backend — API (FastAPI)](#backend--api-fastapi)
6. [Motor de Imposição (engine.py)](#motor-de-imposição-enginepy)
7. [Banco de Dados](#banco-de-dados)
8. [Frontend (SPA)](#frontend-spa)
9. [Serviço de Impressão](#serviço-de-impressão)
10. [Deploy e Infraestrutura](#deploy-e-infraestrutura)
11. [Integração Vibecode](#integração-vibecode)
12. [Guia de Desenvolvimento Local](#guia-de-desenvolvimento-local)

---

## Visão Geral

O **Ideal Imposition** é um sistema de imposição gráfica que automatiza o processo de montagem de folhas de impressão com dados variáveis (VDP). Ele permite:

- Cadastrar **formatos** de ingressos/pulseiras com grade de imposição configurável
- Criar **numerações** com elementos variáveis: numeração sequencial, QR Code, código de barras, texto fixo, SVG e PDF
- Definir **saídas** (formatos de folha: SRA3, A3, A4, etc.)
- Cadastrar **cores** de fundo com PDF de referência
- Gerar **PDFs impostos** com dados variáveis para impressão
- Enviar jobs diretamente para **impressoras** locais
- Integrar com sistema externo via **banco de dados compartilhado** (Supabase)

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND (Vercel)                                               │
│  HTML + CSS + Vanilla JS (SPA)                                   │
│  ├─ Supabase Client (CRUD direto no deploy)                     │
│  └─ API_BASE_URL → Render (para /api/impose, /api/print)        │
├──────────────────────────────────────────────────────────────────┤
│  BACKEND (Render / Local)                                        │
│  FastAPI + Uvicorn (porta 8080)                                  │
│  ├─ db.py → formats_db.json (JSON local)                        │
│  ├─ engine.py → Motor de imposição PDF (PyMuPDF)                │
│  └─ print_service.py → Impressão via Win32                      │
├──────────────────────────────────────────────────────────────────┤
│  AGENTE LOCAL (opcional, porta 9000)                             │
│  local_print_agent.py                                            │
│  └─ Permite impressão física local a partir do frontend online  │
├──────────────────────────────────────────────────────────────────┤
│  BANCO DE DADOS                                                  │
│  ├─ Supabase PostgreSQL (9 tabelas, RLS desabilitado)           │
│  └─ formats_db.json (fallback local do backend)                 │
├──────────────────────────────────────────────────────────────────┤
│  SISTEMA EXTERNO (Vibecode)                                      │
│  └─ Conecta ao mesmo Supabase para gestão de OS                │
└──────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

**Ambiente de Produção (Deploy):**
- Frontend (Vercel) → Supabase (CRUD de dados)
- Frontend (Vercel) → Backend Render (processamento de PDF)

**Ambiente Local (Desenvolvimento):**
- Frontend → Backend local FastAPI (tudo via API REST)
- Backend → `formats_db.json` (persistência local)

---

## Stack Tecnológico

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Python | 3.10+ | Linguagem principal |
| FastAPI | ≥0.100.0 | Framework web / API REST |
| Uvicorn | ≥0.23.0 | Servidor ASGI |
| PyMuPDF (fitz) | ≥1.23.0 | Motor de manipulação de PDF |
| Pillow | ≥10.0.0 | Processamento de imagens |
| qrcode[pil] | ≥7.4.2 | Geração de QR Codes |
| python-barcode | ≥0.15.1 | Geração de códigos de barras |
| python-multipart | ≥0.0.6 | Upload de arquivos |
| firebase-admin | ≥6.2.0 | Legado (em migração) |

### Frontend
| Tecnologia | Uso |
|---|---|
| HTML5 | Estrutura |
| CSS3 (Vanilla) | Estilização (tema dark, glassmorphism) |
| JavaScript (Vanilla) | Lógica da SPA |
| PDF.js (v3.11.174) | Renderização de PDFs no browser |
| Supabase JS SDK (v2) | Conexão com banco de dados |
| Google Fonts (Inter) | Tipografia |

### Infraestrutura
| Serviço | Uso |
|---|---|
| Supabase | Banco PostgreSQL + Storage |
| Vercel | Hosting do frontend |
| Render | Hosting do backend |
| GitHub | Repositório de código |

---

## Estrutura de Arquivos

```
ideal-imposition/
├── app.py                    # API FastAPI principal (526 linhas)
├── engine.py                 # Motor de imposição PDF (1200+ linhas)
├── db.py                     # Persistência JSON local (349 linhas)
├── print_service.py          # Serviço de impressão Windows (163 linhas)
├── local_print_agent.py      # Agente local de impressão (239 linhas)
├── ppd_parser.py             # Parser de arquivos PPD
├── main.py                   # CLI standalone (PoC original)
├── requirements.txt          # Dependências Python
├── formats_db.json           # Banco de dados JSON local
├── schema.sql                # Schema SQL base (Supabase)
├── schema_os.sql             # Schema SQL de Ordens de Serviço
├── render.yaml               # Configuração de deploy (Render)
├── DEPLOY.md                 # Guia de deploy
├── iniciar_servidores.bat    # Script para iniciar servidores locais
├── installer.iss             # Script Inno Setup (instalador Windows)
├── agent_tray.py             # Agente de bandeja do sistema
├── agent_tray.spec           # Spec do PyInstaller
├── firestore.rules           # Regras do Firestore (legado)
│
├── frontend/                 # Frontend SPA
│   ├── index.html            # Página principal (1115 linhas)
│   ├── script.js             # Lógica JavaScript (10900+ linhas)
│   ├── style.css             # Estilos CSS (33 KB)
│   ├── supabase-config.js    # Configuração do Supabase
│   ├── Logo Ideal Dark.png   # Logo
│   └── vercel.json           # Configuração Vercel
│
├── docs/                     # Documentação
│   ├── README.md             # Esta documentação
│   └── integracao_vibecode.md
│
├── ppds/                     # Arquivos PPD de impressoras
├── build/                    # Build do PyInstaller
├── dist/                     # Distribuição
└── venv/                     # Ambiente virtual Python
```

---

## Backend — API (FastAPI)

**Arquivo:** `app.py` (526 linhas)
**Porta:** 8080
**Framework:** FastAPI com Uvicorn
**CORS:** Habilitado para todas as origens

### Autenticação

> ⚠️ **ATENÇÃO**: A autenticação está **desabilitada**. A função `get_current_user()` sempre retorna um usuário fake com permissões de admin. Deve ser implementada antes de ir para produção com múltiplos usuários.

### Endpoints Completos

#### Utilitários
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/` | Redireciona para `/app/index.html` |
| `GET` | `/favicon.ico` | Retorna 204 |
| `GET` | `/api/proxy?url=` | Proxy para URLs externas |
| `GET` | `/api/diag` | Retorna logs de diagnóstico |

#### Administração (Stubs)
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/users` | Lista usuários (retorna `[]`) |
| `POST` | `/api/admin/users/{uid}/role` | Define role (retorna 501) |

#### CRUD — Formatos
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/formatos` | Lista todos |
| `GET` | `/api/formatos/{fmt_id}` | Busca por ID |
| `POST` | `/api/formatos` | Cria novo |
| `PUT` | `/api/formatos/{fmt_id}` | Atualiza |
| `DELETE` | `/api/formatos/{fmt_id}` | Remove |

#### CRUD — Numerações
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/numeracoes` | Lista todas |
| `GET` | `/api/numeracoes/{num_id}` | Busca por ID |
| `POST` | `/api/numeracoes` | Cria (dedup por nome) |
| `PUT` | `/api/numeracoes/{num_id}` | Atualiza |
| `DELETE` | `/api/numeracoes/{num_id}` | Remove |

#### CRUD — Saídas
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/saidas` | Lista todas |
| `GET` | `/api/saidas/{sai_id}` | Busca por ID |
| `POST` | `/api/saidas` | Cria nova |
| `PUT` | `/api/saidas/{sai_id}` | Atualiza |
| `DELETE` | `/api/saidas/{sai_id}` | Remove |

#### CRUD — Cores
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/cores` | Lista todas |
| `GET` | `/api/cores/{cor_id}` | Busca por ID |
| `POST` | `/api/cores` | Cria nova |
| `PUT` | `/api/cores/{cor_id}` | Atualiza |
| `DELETE` | `/api/cores/{cor_id}` | Remove |

#### CRUD — Modelos de Imposição
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/modelos_imposicao` | Lista todos |
| `GET` | `/api/modelos_imposicao/{mod_id}` | Busca por ID |
| `POST` | `/api/modelos_imposicao` | Cria novo |
| `PUT` | `/api/modelos_imposicao/{mod_id}` | Atualiza |
| `DELETE` | `/api/modelos_imposicao/{mod_id}` | Remove |

#### Imposição (endpoint principal)
| Método | Path | Descrição |
|--------|------|-----------|
| `POST` | `/api/impose` | Recebe PDF/imagem + payload JSON, gera PDF imposto |

**Parâmetros do `/api/impose`** (multipart form):
- `file` — Arquivo base (PDF/JPG/PNG)
- `csv_file` — CSV opcional para VDP de banco de dados
- `multi_artes_files` — Lista de arquivos para modo Multi-Artes
- `payload` — JSON string com configuração completa

#### Impressão
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/printers` | Lista impressoras do sistema |
| `GET` | `/api/ppds` | Lista PPDs uploadados |
| `POST` | `/api/ppds/upload` | Upload de arquivo PPD |
| `GET` | `/api/printers/ppd-map` | Mapa impressora↔PPD |
| `POST` | `/api/printers/ppd-map` | Salva mapa |
| `POST` | `/api/print/submit` | Envia job de impressão |

#### Ordens de Serviço
| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/ordens` | Lista todas as OS |
| `GET` | `/api/ordens/{os_id}/itens` | Itens de uma OS |
| `PUT` | `/api/os_itens/{item_id}` | Atualiza item (impressao, formato_id, cor_id, numeracao_id) |

---

## Motor de Imposição (engine.py)

**Arquivo:** `engine.py` (1200+ linhas)
**Biblioteca PDF:** PyMuPDF (fitz)
**Constante:** `MM2PT = 2.8346` (conversão milímetros → pontos PDF)

### Classe `ImpositionConfig`

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `base_file` | str | — | Caminho do arquivo base (PDF/imagem) |
| `out_pdf` | str | — | Caminho do PDF de saída |
| `formato` | dict | — | Formato do item |
| `numeracao` | dict/None | None | Numeração 1 com elementos VDP |
| `saida` | dict | — | Formato da folha de saída |
| `seq_start` | int | 1 | Início da sequência |
| `seq_end` | int | 100 | Fim da sequência |
| `seq_increment` | int | 1 | Incremento |
| `layout_schema` | str | "sequential" | Regra de paginação |
| `csv_data` | list/None | None | Dados CSV para VDP |
| `print_mode` | str | "front" | Modo de impressão (front/duplex) |
| `numeracao_2` | dict/None | None | Numeração 2 (verso) |
| `rotate_page` | bool | False | Rotação da página |
| `multi_artes` | list/None | None | Lista de múltiplas artes |

### Schemas de Layout

| Schema | Descrição |
|--------|-----------|
| `sequential` | Numeração sequencial padrão |
| `cut_stack` | Cut & Stack (blocos para guilhotina) |
| `step_repeat` | Step & Repeat (mesma arte repetida) |
| `pdf_multiple` | PDF paginado (cada página = uma arte) |
| `multi_artes` | Múltiplas artes por coluna |

### Tipos de Elementos VDP

| Tipo | Descrição |
|------|-----------|
| `TEXT` | Numeração sequencial com padding, prefixo, sufixo |
| `FIXED` | Texto fixo |
| `QR` | QR Code com cor e tamanho customizáveis |
| `BARCODE` | Código de barras (code128, ean13, ean8, upca, itf) |
| `SVG` | Vetor SVG (inline ou URL) |
| `PDF` | Elemento PDF embutido (base64 ou URL) |
| `PICOTE` | Linha de picote (vertical tracejada) |

---

## Banco de Dados

### Supabase (PostgreSQL)

**URL:** `https://atsxtuibeitloosckmlc.supabase.co`

#### Tabelas Base (schema.sql)

| Tabela | Colunas Principais | Descrição |
|--------|------|-----------|
| `formatos` | id, name, width_mm, height_mm, cols, rows, gap_h_mm, gap_v_mm, offset_h_mm, offset_v_mm, rotations(JSONB) | Formatos de entrada |
| `saidas` | id, name, width_mm, height_mm, file_format | Formatos de folha de saída |
| `cores` | id, name, formato_id, width_mm, height_mm, pdf_base64, pdf_filename | Cores de referência |
| `numeracoes` | id, name, formato_id, formato_ids(JSONB), csv_data(JSONB), elements(JSONB), svg_content, pdf_content | Numerações VDP |
| `modelos_imposicao` | id, name, config(JSONB) | Modelos de imposição salvos |

#### Tabelas de OS (schema_os.sql)

| Tabela | Colunas Principais | Descrição |
|--------|------|-----------|
| `usuarios` | id(UUID), nome, email, role, ativo | Perfis de usuários |
| `ordens_servico` | id, numero(UNIQUE), status, observacoes, criado_por(FK) | Ordens de serviço |
| `os_itens` | id, os_id(FK), setor, produto, modelo, formato, quantidade, num_inicial, num_final, cor, aprovacao, impressao | Itens da OS |
| `os_log` | id, os_id(FK), item_id, usuario_id(FK), acao, detalhes(JSONB) | Auditoria |

#### Convenções de IDs

| Prefixo | Tabela |
|---------|--------|
| `fmt_` | formatos |
| `num_` | numeracoes |
| `sai_` | saidas |
| `cor_` | cores |
| `mod_` | modelos_imposicao |
| `os_` | ordens_servico |
| `osi_` | os_itens |

### JSON Local (formats_db.json)

Fallback do backend em modo local. Mesma estrutura das tabelas Supabase em arquivo JSON.

---

## Frontend (SPA)

**Tema:** Dark mode com glassmorphism, gradientes sutis, fonte Inter

### Design Tokens (CSS Variables)

```css
--bg:          #0a0f1e          /* fundo principal */
--bg2:         #0f172a          /* fundo secundário */
--card:        rgba(17, 25, 46, 0.85)
--blue:        #3b82f6          /* cor primária */
--purple:      #8b5cf6
--teal:        #14b8a6
--green:       #22c55e
--amber:       #f59e0b
--red:         #ef4444
--text:        #e2e8f0
--text-dim:    #94a3b8
--sidebar-w:   240px
--radius:      14px
```

### Views/Seções

| ID | Ícone | Nome | Grupo |
|----|-------|------|-------|
| `view-formatos` | 📐 | Formatos | Configuração |
| `view-lista-formatos` | 📋 | Lista Formatos | Configuração |
| `view-numeracao` | 🔢 | Numeração | Configuração |
| `view-catalogo` | 📚 | Catálogo de Numerações | Configuração |
| `view-saidas` | 📄 | Saídas | Configuração |
| `view-cores` | 🎨 | Cores | Configuração |
| `view-lista-cores` | 📋 | Lista Cores | Configuração |
| `view-imposicao` | 🖨️ | Imposição | Produção |
| `view-amostras` | 🧪 | Amostras | Produção |
| `view-lista-imposicao` | 📋 | Modelos de Imposição | Produção |
| `view-ordens` | 📦 | Ordens de Serviço | Produção |
| `view-admin` | 🛡️ | Usuários | Administração |

### Lógica de Conexão (supabase-config.js)

- **Localhost** → Supabase desativado, usa API local FastAPI
- **Deploy (Vercel)** → Supabase ativo, API_BASE_URL = `https://imposicao.onrender.com`

---

## Serviço de Impressão

### print_service.py
- `win32print` (Windows) para acesso ao spooler
- Conversão PDF → PostScript Level 2 (JPEG → ASCII85)
- PPDs em `ppds/`, mapeamento em `printer_ppd_map.json`

### Nome do trabalho no spool

O que aparece na fila do Windows é **`{ordem}_{nome do arquivo}.pdf`** — sem
nenhuma marca do programa no nome.

O prefixo tem 5 dígitos e é a **ordem de envio**, não o número do arquivo:
`00001` é o primeiro trabalho que sai do painel, `00002` o segundo, e assim por
diante. Ele reinicia em `00001` a cada lote, para que o operador leia sempre "de
00001 até o total do lote". Sem esse prefixo a fila, ordenada por nome, embaralha
capa, miolo e contracapa.

O prefixo é atribuído no envio (`nomeParaSpool` em `frontend/script.js`), porque
é ali que a ordem existe de fato, e vale nos dois caminhos:

| caminho | como chega ao spool |
|---|---|
| impressora local | nome do `multipart` → `job_title` em `app.py` |
| relay pela nuvem | nome do objeto no Storage → `titulo_do_job` em `agent_worker.py` |

No relay o carimbo de tempo do lote é **pasta**, não parte do nome
(`{agente}/{lote}/00001_....pdf`): garante que dois lotes do mesmo modelo não
colidam no Storage sem sujar o nome que o operador lê.

### local_print_agent.py
- FastAPI independente em `127.0.0.1:9000`
- Replica endpoints de impressão e imposição
- Permite que o frontend online acesse impressoras físicas locais

### Instalador Windows (installer.iss)
- App: "Ideal Imposition Agent" v1.0.0
- Instala em `%LOCALAPPDATA%` (sem admin)
- Auto-start com Windows
- Idioma: PT-BR

---

## Deploy e Infraestrutura

| Componente | Serviço | URL |
|------------|---------|-----|
| Frontend | Vercel | (deploy automático via git push) |
| Backend | Render | https://imposicao.onrender.com |
| Banco de Dados | Supabase | https://atsxtuibeitloosckmlc.supabase.co |
| Repositório | GitHub | https://github.com/ingressoideal1-gif/imposicao |

### Deploy automático
- **Push para `main`** → Vercel e Render detectam e fazem deploy automaticamente

---

## Integração Vibecode

Documentação completa em `docs/integracao_vibecode.md`.

### Responsabilidades

| Ação | Vibecode | Imposition |
|------|----------|------------|
| Criar OS | ✅ | ❌ |
| Inserir itens | ✅ | ❌ |
| Atualizar aprovação | ✅ | ❌ |
| Atualizar status da OS | ✅ | ❌ |
| Ler OS e itens | ✅ | ✅ |
| Vincular formato/cor/numeração | ❌ | ✅ |
| Atualizar impressão | ❌ | ✅ |
| Registrar logs | ✅ | ✅ |

---

## Guia de Desenvolvimento Local

### Pré-requisitos
- Python 3.10+
- Git

### Instalação

```bash
git clone https://github.com/ingressoideal1-gif/imposicao.git
cd imposicao
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Executar

```bash
# Script automático (API + Agente de Impressão)
iniciar_servidores.bat

# Ou manualmente
python app.py
# Acesse: http://localhost:8080/app/index.html
```

---

*Documentação gerada em 12/06/2026 — Ideal Imposition v1.0*
