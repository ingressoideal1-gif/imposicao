# Gerenciador de Fotos — Plano de Implementação

> **Para quem executa:** cada tarefa termina com teste rodado e commit. Os passos usam
> caixas (`- [ ]`) para acompanhamento.

**Objetivo:** tornar a foto um dado variável de primeira classe — janela de foto na arte,
lote importado e casado com as linhas do banco, enquadramento automático por rosto e
folha de contato para o ajuste fino.

**Arquitetura:** um tipo de elemento novo (`FOTO`) no motor e no editor; a linha do CSV
guarda uma referência e o retângulo de recorte na chave de sistema `__fotos`; o navegador
normaliza, sobe para o bucket `fotos` e resolve o casamento; o agente baixa uma vez por
hash e cacheia em disco.

**Stack:** PyMuPDF (`fitz`), Pillow, JavaScript sem framework, Supabase Storage.

## Restrições globais

- O `NewProd.exe` embute o `engine.py`: qualquer mudança nele obriga a publicar o agente
  junto com o site, com número de versão novo.
- Elemento PDF/SVG tem Finalidade (`render_mode`); `FOTO` nasce e permanece em `print`.
- Nunca `ctx.drawImage(img, x, y, w, h)` cru: a janela de foto tem função própria de
  desenho que espelha o que o motor faz.
- `frontend/producao.html` é cópia morta — não editar.
- A ausência de `__ativo` na linha significa ativa; `__fotos` segue a mesma convenção de
  chave de sistema e nunca aparece como coluna na grade.
- Nada de biblioteca de visão computacional no executável: a detecção de rosto acontece
  no navegador e só o retângulo é gravado.

---

### Tarefa 1: Motor — elemento `FOTO`

**Arquivos:**
- Modificar: `engine.py` (`_so_layout`, `_render_element`, cache de fotos)
- Criar: `tests/test_engine_foto.py`

**Interfaces:**
- Produz: `_foto_box(el, iw, ih)` → `(clip_irect, rotacao)`; `_render_element` passa a
  aceitar `el["type"] == "FOTO"`.
- Consome: `csv_row["__fotos"][el["csv_column"]]` com `{ref, url, cx, cy, zoom, rot}`.

- [ ] **Passo 1: teste que falha** — `tests/test_engine_foto.py` desenha um `FOTO` de
  25×32 mm com uma imagem 400×400 e mede `page.get_image_info()`: a imagem tem de ocupar
  exatamente o retângulo da janela (cover não deixa margem) e a proporção do recorte tem
  de bater com a da janela.
- [ ] **Passo 2: rodar e ver falhar** — `pytest tests/test_engine_foto.py -v`.
- [ ] **Passo 3: implementar** `_foto_bytes()` (cache em memória + disco por hash),
  `_foto_clip()` (recorte em pixels a partir de `cx/cy/zoom` e do modo `cover`/`contain`)
  e o ramo `FOTO` em `_render_element`, com `insert_image(..., clip=..., keep_proportion=True)`.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

### Tarefa 2: Motor — conferência e pré-carregamento

**Arquivos:**
- Modificar: `engine.py` (`ImpositionEngine.process`)
- Modificar: `tests/test_engine_foto.py`

- [ ] **Passo 1: teste que falha** — imposição com uma linha sem foto levanta erro citando
  a linha; imposição com duas linhas apontando a mesma URL faz **um** download.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** `_preparar_fotos(cfg)` chamado no início de `process()`:
  varre os elementos `FOTO`, junta as URLs de todas as linhas ativas, acusa as linhas sem
  foto numa mensagem só, e aquece o cache em paralelo com `ThreadPoolExecutor`.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

### Tarefa 3: Frontend — elemento `FOTO` no editor de numeração

**Arquivos:**
- Modificar: `frontend/index.html` (botão na paleta, ~L529)
- Modificar: `frontend/script.js` (`addElement` L5258, desenho L3899, lista L5501,
  painel de propriedades, prévia L8034, gabarito L23945/L24684/L29636)
- Criar: `frontend/foto-lib.js` (normalização, hash, casamento, recorte — sem DOM)

- [ ] **Passo 1:** `addElement('FOTO')` com os padrões do spec e o botão `🖼️ Foto`.
- [ ] **Passo 2:** `drawFotoElement(ctx, el, S, isSelected)` numa função só, usada pelos
  seis pontos de desenho; sem foto carregada, desenha a janela com o nome da coluna.
- [ ] **Passo 3:** painel de propriedades — largura, altura, coluna do banco, encaixe
  (cobrir/caber), cantos.
- [ ] **Passo 4:** conferir no navegador com a skill `rodar-app`.
- [ ] **Passo 5:** commit.

### Tarefa 4: Biblioteca de fotos — normalizar, casar, subir

**Arquivos:**
- Modificar: `frontend/foto-lib.js`
- Criar: `tests/foto_lib_harness.js` (nó de teste sem navegador, como `cor_numeracao_harness.js`)

- [ ] **Passo 1: teste que falha** — a cascata de casamento resolve nome exato, sem
  extensão, normalizado, só dígitos, e devolve `ambiguas` quando dois arquivos disputam a
  mesma linha.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar** `casarFotos(arquivos, linhas, colunas)` →
  `{casadas, ambiguas, sobrando, semFoto}` e `normalizarFoto(file, janela)` →
  `{blob, hash, w, h, dpi}`.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit.**

### Tarefa 5: Importador de lote (tela das quatro pilhas)

**Arquivos:**
- Modificar: `frontend/csv-editor.js`, `frontend/index.html`, `frontend/script.js`

- [ ] **Passo 1:** botão "🖼️ Importar Fotos" na box do banco de dados, aceitando pasta e
  `.zip`.
- [ ] **Passo 2:** tela das quatro pilhas com arrastar para resolver sobras; nada é
  gravado no CSV antes de confirmar.
- [ ] **Passo 3:** ao confirmar, sobe para o bucket `fotos` em `<numeracao_id>/<hash>.jpg`
  e grava `__fotos` nas linhas.
- [ ] **Passo 4:** conferir no navegador com a skill `rodar-app`.
- [ ] **Passo 5:** commit.

### Tarefa 6: Folha de contato e detecção de rosto

**Arquivos:**
- Modificar: `frontend/foto-lib.js`, `frontend/csv-editor.js`

- [ ] **Passo 1:** detecção de rosto na importação (`FaceDetector` quando existir, com
  recuo para o terço superior centrado), gravando só `cx/cy/zoom`.
- [ ] **Passo 2:** grade de miniaturas renderizadas com o mesmo recorte do motor.
- [ ] **Passo 3:** roda do mouse dá zoom, arrasto move, `←`/`→` trocam de registro,
  botão volta ao automático.
- [ ] **Passo 4:** selo vermelho abaixo de 150 dpi e contador de linhas sem foto.
- [ ] **Passo 5:** conferir no navegador e commit.

### Tarefa 7: Documentação e publicação

- [ ] Atualizar `docs/DOCUMENTACAO.md` e `docs/editor_de_csv.md` com `__fotos`.
- [ ] Criar `.claude/skills/fotos-variaveis/SKILL.md` com as armadilhas do caminho.
- [ ] Rodar `.\ferramentas\conferir.ps1` e avisar o usuário que o agente precisa sair
  junto, com número novo.
