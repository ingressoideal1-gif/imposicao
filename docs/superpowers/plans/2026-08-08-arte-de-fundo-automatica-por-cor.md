# Arte de Fundo automática por Cor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No editor de numeração do Ideal Imposition, carregar automaticamente no botão **🖼️ Arte de Fundo** o PDF da cor mais antiga cadastrada para o formato base da numeração, preservando o rótulo, o botão Remover e o upload manual que já existem.

**Architecture:** Três funções novas em `frontend/script.js`, todas no mesmo arquivo e próximas do código de Arte de Fundo que já existe. `rasterizePdfToImage(arrayBuffer)` extrai do `loadBgImage()` atual a rasterização de PDF para `<img>`; `resolveCorDoFormatoBase(formatoId)` é uma função pura sobre `state.cores`; `autoLoadCorBg(formatoId)` amarra as duas e preenche `state.bgImage` / `state.bgImageVerso`. Dois pontos de chamada: `editNumeracao()` e `onFormatoSelect()`.

**Tech Stack:** JavaScript de navegador sem build nem framework (`frontend/script.js` é carregado direto por `<script>`), pdf.js já presente na página como global `pdfjsLib`, backend FastAPI (`app.py`) servindo o estático, Puppeteer do `node_modules` do repo para dirigir o navegador.

## Global Constraints

- **`frontend/script.js` é o único arquivo de código modificado** (a Task 7 também acrescenta uma entrada em `CHANGELOG.md`). Nenhuma alteração de HTML, de backend ou de banco. `producao_cores` já tem `formato_id`, `pdf_base64`, `pdf_url`, `pdf_filename`, `pdf_verso_base64` e `created_at`.
- **A página viva é `frontend/index.html`.** `frontend/producao.html` é a versão antiga e não deve ser tocada — `app.py:103` redireciona para `/app/index.html`.
- **Não use a porta 9000 para rodar o app.** O `NewProd.exe` instalado na máquina escuta em `127.0.0.1:9000` e serve uma cópia embutida do frontend, então você olharia código antigo. Use a **9123**. Não mate o `NewProd.exe`.
- **Não há framework de testes no projeto.** O ciclo de teste de cada tarefa é um script Puppeteer no scratchpad, executado com `node`. O scratchpad desta sessão é `C:\Users\Junior\AppData\Local\Temp\claude\c--Users-Junior-Projetos-Ingresso-ideal-ideal-imposition\80609424-2b1f-40d6-9ce7-9bc05c977b65\scratchpad`.
- **Puppeteer precisa de caminho absoluto** quando o script driver está fora do repo: `require(path.join(REPO, 'node_modules', 'puppeteer'))`.
- **Estilo do arquivo:** `frontend/script.js` usa linhas em branco entre statements e comentários em português. Siga o que estiver ao redor do ponto que você editar.
- **Ausência de erro no console não é prova de que rodou.** Toda verificação precisa confirmar um efeito positivo — um valor preenchido, um rótulo que mudou.
- **`window.state` NÃO é o state do editor.** `frontend/script.js:47` declara `const state = { ... }` — um binding léxico global, alcançável dentro de `page.evaluate` pelo nome nu `state`, mas **ausente** de `window`. O `window.state` que existe na página é outro objeto, criado por `frontend/mapas.js:6`. Nos scripts de verificação, use sempre `state` nu no corpo do `page.evaluate`, e ancore o `waitForFunction` numa função que `script.js` de fato exporta (por exemplo `typeof window.clearBgImage === 'function'`) — nunca em `window.state`, que existe desde o `mapas.js` e por isso resolve antes de `script.js` terminar de carregar.
- **Erros de console pré-existentes e não relacionados:** `Erro ao checar print_agents no Supabase` e `favicon.ico` 404. Não são regressão.

## File Structure

Um único arquivo é modificado.

`frontend/script.js` — todo o frontend do app principal num arquivo só. É grande e assim já era; este trabalho segue o padrão estabelecido e **não** o divide. As mudanças ficam agrupadas em dois pontos:

- o bloco de state inicial, por volta da linha 91 (`bgImage`);
- o bloco `// - Arte de Fundo no Canvas (Bug 5) -`, por volta da linha 4459, onde vivem `clearBgImage()` e `loadBgImage()` — é ali que as três funções novas entram;
- e duas chamadas, uma em `editNumeracao()` e uma em `onFormatoSelect()`.

## Como rodar o app (usado em várias tarefas)

Subir uma vez e deixar rodando durante todo o plano:

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
(venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123 > /dev/null 2>&1 &)
timeout 60 bash -c 'until curl -sf http://127.0.0.1:9123/app/index.html -o /dev/null; do sleep 1; done'
```

Parar ao final do plano:

```bash
PID=$(netstat -ano | grep "127.0.0.1:9123" | grep -i listening | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F
```

O app usa Supabase e não há credenciais de teste. Os scripts de verificação semeiam `window.state` e chamam as funções globais direto, como descrito na skill `rodar-app`.

---

### Task 1: `bgImageVerso` no state e `clearBgImage()` limpando as duas faces

O canvas do verso já lê `state.bgImageVerso` em `frontend/script.js:3351` (`refBg = state.bgImageVerso || state.numPdfImageVerso`), mas nada nunca escreve nesse campo — é um caminho morto. Esta tarefa declara o campo e faz o botão **✕ Remover** limpar as duas faces, para que as tarefas seguintes possam preenchê-lo sem deixar arte órfã no verso.

**Files:**
- Modify: `frontend/script.js:91` (bloco de state inicial)
- Modify: `frontend/script.js:4463-4481` (`clearBgImage`)
- Test: `<scratchpad>/verif-task1.js`

**Interfaces:**
- Consumes: nada.
- Produces: `state.bgImageVerso` (`HTMLImageElement | null`, inicial `null`) e a garantia de que `window.clearBgImage()` zera `state.bgImage` **e** `state.bgImageVerso`.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task1.js`:

```js
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.clearBgImage);

  const r = await page.evaluate(() => {
    const declarado = Object.prototype.hasOwnProperty.call(window.state, 'bgImageVerso');
    // Simula duas faces carregadas e manda remover.
    state.bgImage = { fake: 'frente' };
    state.bgImageVerso = { fake: 'verso' };
    window.clearBgImage();
    return {
      declarado,
      frenteLimpa: state.bgImage === null,
      versoLimpo: state.bgImageVerso === null
    };
  });

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const ok = r.declarado && r.frenteLimpa && r.versoLimpo;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Suba o servidor conforme a seção "Como rodar o app" acima, depois:

Run: `node "<scratchpad>/verif-task1.js"`
Expected: FAIL, com `"declarado": false` e `"versoLimpo": false` (o `clearBgImage` atual não toca no verso).

- [ ] **Step 3: Declarar o campo no state**

Em `frontend/script.js`, na linha 91, logo depois de `bgImage`:

```js
    bgImage: null,          // HTMLImageElement | null (arte de fundo no canvas)

    bgImageVerso: null,     // HTMLImageElement | null (arte de fundo do verso, em duplex)
```

- [ ] **Step 4: Fazer `clearBgImage()` limpar as duas faces**

Substitua o corpo de `window.clearBgImage` (`frontend/script.js:4463-4481`) por:

```js
window.clearBgImage = function () {

    state.bgImage = null;

    state.bgImageVerso = null;

    const btn = document.getElementById('btn-remove-bg');

    const name = document.getElementById('bg-file-name');

    const inp = document.getElementById('canvas-bg-file');

    if (btn) btn.style.display = 'none';

    if (name) name.textContent = '';

    if (inp) inp.value = '';

    drawCanvas();

};
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task1.js"`
Expected: PASS, com os três campos `true`.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "fix(editor): declarar bgImageVerso e limpar as duas faces no Remover"
```

---

### Task 2: `rasterizePdfToImage()` — extrair a rasterização de PDF

`loadBgImage()` (`frontend/script.js:4485-4579`) hoje embute a rasterização de PDF no meio do tratamento de `File`. As tarefas seguintes precisam rasterizar PDFs que vêm de base64 ou de URL, não de um `File`. Esta tarefa extrai essa parte para uma função reutilizável e faz `loadBgImage()` passar a usá-la, de modo que upload manual e carregamento automático compartilhem um único caminho.

**Files:**
- Modify: `frontend/script.js:4485-4579` (`loadBgImage`) e área imediatamente acima
- Test: `<scratchpad>/verif-task2.js`

**Interfaces:**
- Consumes: `state.bgImageVerso` da Task 1 (não usado diretamente aqui, mas o arquivo já deve conter aquela mudança).
- Produces: `window.rasterizePdfToImage(arrayBuffer)` → `Promise<HTMLImageElement>`. A imagem devolvida tem `originalPdfWidthPt` e `originalPdfHeightPt` (números, em pontos PostScript) preenchidos a partir do viewport em escala 1. Rejeita se `pdfjsLib` não estiver disponível ou se o PDF não puder ser aberto.

**Por que `originalPdfWidthPt` importa:** `drawCanvasFace` usa `refBg.originalPdfWidthPt || refBg.width` para escalar o fundo (`frontend/script.js:3368`). O bitmap é gerado em escala 2; sem esses campos a arte entraria no canvas ao dobro do tamanho.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task2.js`. Ele carrega o `base_ticket.pdf` que já existe na raiz do repo, injeta os bytes na página e confere as dimensões:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.pdfjsLib);
  await page.waitForFunction(() => typeof window.rasterizePdfToImage === 'function', { timeout: 5000 })
    .catch(() => {});

  const r = await page.evaluate(async (b64) => {
    if (typeof window.rasterizePdfToImage !== 'function') {
      return { existe: false };
    }
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const img = await window.rasterizePdfToImage(bytes.buffer);
    return {
      existe: true,
      ehImagem: img instanceof HTMLImageElement,
      larguraBitmap: img.width,
      wPt: img.originalPdfWidthPt,
      hPt: img.originalPdfHeightPt
    };
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  // O bitmap sai em escala 2, então a largura em px deve ser ~2x a largura em pontos.
  const ok = r.existe && r.ehImagem &&
             r.wPt > 0 && r.hPt > 0 &&
             Math.abs(r.larguraBitmap - r.wPt * 2) <= 2;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-task2.js"`
Expected: FAIL, com `{"existe": false}` — a função ainda não existe.

- [ ] **Step 3: Escrever a função**

Em `frontend/script.js`, logo **acima** de `async function loadBgImage(file)` (linha 4485):

```js
// Rasteriza a página 1 de um PDF e devolve um HTMLImageElement pronto para o canvas.
// Os campos originalPdfWidthPt / originalPdfHeightPt são obrigatórios: drawCanvasFace
// escala o fundo por eles, e sem isso a arte entraria com o tamanho do bitmap (2x).
window.rasterizePdfToImage = async function (arrayBuffer) {

    if (typeof pdfjsLib === 'undefined') {

        throw new Error('PDF.js não disponível.');

    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const page = await pdf.getPage(1);

    const vp = page.getViewport({ scale: 2 });

    const off = document.createElement('canvas');

    const octx = off.getContext('2d');

    off.width = Math.round(vp.width);

    off.height = Math.round(vp.height);

    octx.fillStyle = '#ffffff';

    octx.fillRect(0, 0, off.width, off.height);

    await page.render({ canvasContext: octx, viewport: vp }).promise;

    const img = new Image();

    img.src = off.toDataURL('image/png');

    const vpOrig = page.getViewport({ scale: 1 });

    img.originalPdfWidthPt = vpOrig.width;

    img.originalPdfHeightPt = vpOrig.height;

    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    return img;

};
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task2.js"`
Expected: PASS, com `wPt`/`hPt` maiores que zero e `larguraBitmap` ≈ `wPt * 2`.

- [ ] **Step 5: Fazer `loadBgImage()` usar a função nova**

Substitua o ramo PDF de `loadBgImage()`. O corpo inteiro da função passa a ser:

```js
async function loadBgImage(file) {

    if (!state.numFormato) return;

    const ext = file.name.split('.').pop().toLowerCase();

    try {

        let img;

        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');

            }

            const arrayBuffer = await file.arrayBuffer();

            img = await window.rasterizePdfToImage(arrayBuffer);

        } else {

            img = new Image();

            img.src = URL.createObjectURL(file);

            // Obter o DPI da imagem a partir dos metadados e salvar na img

            img.dpiValue = await getDpi(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        }

        state.bgImage = img;

        // O botão governa só a frente: descartar o verso que tenha vindo de uma cor,

        // senão o canvas duplex mostraria duas artes diferentes.

        state.bgImageVerso = null;

        const btn = document.getElementById('btn-remove-bg');

        const name = document.getElementById('bg-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + file.name;

        drawCanvas();

        toast('Arte de fundo carregada!', 'success');

    } catch (e) {

        toast('Erro ao carregar fundo: ' + e.message, 'error');

    }

}
```

- [ ] **Step 6: Confirmar que o upload manual continua funcionando**

Crie `<scratchpad>/verif-task2b.js`, que dispara `loadBgImage` com um `File` de verdade montado na página:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.pdfjsLib && typeof window.clearBgImage === 'function');

  const r = await page.evaluate(async (b64) => {
    state.numFormato = { id: 'f1', width_mm: 180, height_mm: 50 };
    state.bgImageVerso = { fake: 'verso-antigo' };

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'Arte_Cliente.pdf', { type: 'application/pdf' });

    // loadBgImage não é global; o input é o caminho público.
    const inp = document.getElementById('canvas-bg-file');
    const dt = new DataTransfer();
    dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(res => setTimeout(res, 3000));

    return {
      carregou: !!state.bgImage,
      temPt: !!(state.bgImage && state.bgImage.originalPdfWidthPt > 0),
      versoDescartado: state.bgImageVerso === null,
      rotulo: document.getElementById('bg-file-name').textContent,
      botao: document.getElementById('btn-remove-bg').style.display
    };
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const ok = r.carregou && r.temPt && r.versoDescartado &&
             r.rotulo === '📎 Arte_Cliente.pdf' && r.botao === 'inline-flex';
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

Run: `node "<scratchpad>/verif-task2b.js"`
Expected: PASS.

Se `carregou` for `false`, confira se o listener do `#canvas-bg-file` está registrado — ele é montado em `frontend/script.js:4811` e `4847`; a página precisa ter chegado ao fim da inicialização.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "refactor(editor): extrair rasterizePdfToImage do loadBgImage"
```

---

### Task 3: `resolveCorDoFormatoBase()` — achar a cor mais antiga

Função pura sobre `state.cores`. Fica isolada da parte assíncrona de propósito: é a regra de negócio do pedido ("a mais antiga") e precisa ser verificável sem rede nem pdf.js.

**Files:**
- Modify: `frontend/script.js` (logo acima de `window.rasterizePdfToImage`, criada na Task 2)
- Test: `<scratchpad>/verif-task3.js`

**Interfaces:**
- Consumes: `window.rasterizePdfToImage` da Task 2 existe no arquivo, mas esta função não a usa.
- Produces: `window.resolveCorDoFormatoBase(formatoId)` → objeto de `state.cores` ou `null`. Não filtra por presença de PDF — devolve a mais antiga do formato e deixa a decisão sobre PDF ausente para quem chama.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task3.js`:

```js
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.clearBgImage === 'function');

  const r = await page.evaluate(() => {
    if (typeof window.resolveCorDoFormatoBase !== 'function') return { existe: false };

    const casos = {};

    // 1. Escolhe a mais antiga por created_at, ignorando a ordem do array.
    state.cores = [
      { id: 'c2', name: 'Nova',  formato_id: 'f1', created_at: '2026-05-10T00:00:00Z' },
      { id: 'c1', name: 'Velha', formato_id: 'f1', created_at: '2024-01-02T00:00:00Z' },
      { id: 'c3', name: 'Outro formato', formato_id: 'f2', created_at: '2020-01-01T00:00:00Z' }
    ];
    casos.maisAntiga = (window.resolveCorDoFormatoBase('f1') || {}).id;

    // 2. formato_id numérico contra string: a comparação é por String().
    state.cores = [{ id: 'n1', formato_id: 7, created_at: '2024-01-01T00:00:00Z' }];
    casos.tipoMisto = (window.resolveCorDoFormatoBase('7') || {}).id;

    // 3. Sem cor para o formato -> null.
    state.cores = [{ id: 'x1', formato_id: 'f9', created_at: '2024-01-01T00:00:00Z' }];
    casos.semCor = window.resolveCorDoFormatoBase('f1');

    // 4. created_at ausente vai para o fim; entre iguais preserva a ordem da API.
    state.cores = [
      { id: 'semData1', formato_id: 'f1' },
      { id: 'comData',  formato_id: 'f1', created_at: '2025-03-03T00:00:00Z' },
      { id: 'semData2', formato_id: 'f1' }
    ];
    casos.datasFaltando = (window.resolveCorDoFormatoBase('f1') || {}).id;

    // 5. Todas sem created_at -> a primeira que veio da API.
    state.cores = [
      { id: 'primeira', formato_id: 'f1' },
      { id: 'segunda',  formato_id: 'f1' }
    ];
    casos.todasSemData = (window.resolveCorDoFormatoBase('f1') || {}).id;

    // 6. state.cores vazio ou formatoId falsy nao pode estourar.
    state.cores = [];
    casos.listaVazia = window.resolveCorDoFormatoBase('f1');
    casos.semFormato = window.resolveCorDoFormatoBase('');

    return { existe: true, casos };
  });

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const c = r.casos || {};
  const ok = r.existe &&
    c.maisAntiga === 'c1' &&
    c.tipoMisto === 'n1' &&
    c.semCor === null &&
    c.datasFaltando === 'comData' &&
    c.todasSemData === 'primeira' &&
    c.listaVazia === null &&
    c.semFormato === null;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-task3.js"`
Expected: FAIL, com `{"existe": false}`.

- [ ] **Step 3: Escrever a função**

Em `frontend/script.js`, logo acima de `window.rasterizePdfToImage`:

```js
// Devolve a cor mais antiga cadastrada para o formato base, ou null.
// Só a coluna formato_id da cor conta — os formatos compatíveis da numeração
// (formato_ids) são ignorados de propósito.
// Cores sem created_at vão para o fim; entre empates a ordem da API é preservada
// (Array.prototype.sort é estável), então o critério é determinístico.
window.resolveCorDoFormatoBase = function (formatoId) {

    if (!formatoId) return null;

    const pool = (state.cores || []).filter(c => String(c.formato_id) === String(formatoId));

    if (!pool.length) return null;

    const tempo = c => {

        const t = Date.parse(c.created_at || '');

        return isNaN(t) ? Number.POSITIVE_INFINITY : t;

    };

    return pool.slice().sort((a, b) => {

        const ta = tempo(a);

        const tb = tempo(b);

        // Comparação por sinal: ta - tb daria NaN quando os dois são Infinity.

        return ta === tb ? 0 : (ta < tb ? -1 : 1);

    })[0];

};
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task3.js"`
Expected: PASS, com todos os seis casos batendo.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(editor): resolver a cor mais antiga do formato base"
```

---

### Task 4: `autoLoadCorBg()` — carregar a arte da cor no fundo

Amarra as duas funções anteriores: resolve a cor, busca os bytes do PDF e preenche a frente e, quando houver, o verso.

**Files:**
- Modify: `frontend/script.js` (logo abaixo de `window.rasterizePdfToImage`)
- Test: `<scratchpad>/verif-task4.js`

**Interfaces:**
- Consumes: `window.resolveCorDoFormatoBase(formatoId)` (Task 3), `window.rasterizePdfToImage(arrayBuffer)` (Task 2), `fetchPdfBytes(content)` já existente em `frontend/script.js:147` — aceita base64 com ou sem prefixo `data:` e também URL, com fallback por proxy.
- Produces: `window.autoLoadCorBg(formatoId)` → `Promise<boolean>`, `true` quando carregou a frente. Preenche `state.bgImage`, opcionalmente `state.bgImageVerso`, escreve `#bg-file-name` e mostra `#btn-remove-bg`.

**Regras que o código precisa respeitar:**
- Formato sem cor, ou cor mais antiga sem PDF nenhum (`pdf_base64` e `pdf_url` vazios): não faz nada e devolve `false`. **Sem toast** — não é falha, é situação normal.
- Não cai para a segunda cor mais antiga quando a primeira não tem PDF.
- O verso é carregado **sempre** que a cor tiver `pdf_verso_base64`, sem olhar o `print_mode`. `drawCanvasFace` só desenha a face `back` em duplex, e carregar incondicionalmente evita depender da ordem entre escolher o formato e alternar Frente/FxVerso.
- Falha no verso não derruba a frente.
- O rótulo é `📎 ` + `pdf_filename`, com fallback para `name` da cor, para nunca ficar vazio.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task4.js`:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.pdfjsLib && typeof window.clearBgImage === 'function');

  const r = await page.evaluate(async (b64) => {
    if (typeof window.autoLoadCorBg !== 'function') return { existe: false };

    const casos = {};
    state.numFormato = { id: 'f1', width_mm: 180, height_mm: 50 };

    // 1. Cor com frente e verso: carrega as duas e rotula com o pdf_filename.
    state.cores = [
      { id: 'c1', name: 'Mobi Padrão', formato_id: 'f1', created_at: '2024-01-01T00:00:00Z',
        pdf_filename: 'Mobi Padrao.pdf', pdf_base64: b64, pdf_verso_base64: b64 },
      { id: 'c2', name: 'Nova', formato_id: 'f1', created_at: '2026-01-01T00:00:00Z',
        pdf_filename: 'Nova.pdf', pdf_base64: b64 }
    ];
    window.clearBgImage();
    casos.retornoFrenteVerso = await window.autoLoadCorBg('f1');
    casos.frente = !!state.bgImage;
    casos.frenteTemPt = !!(state.bgImage && state.bgImage.originalPdfWidthPt > 0);
    casos.verso = !!state.bgImageVerso;
    casos.rotulo = document.getElementById('bg-file-name').textContent;
    casos.botao = document.getElementById('btn-remove-bg').style.display;

    // 2. Cor sem pdf_filename: cai para o name.
    state.cores = [{ id: 'c3', name: 'Sem Nome de Arquivo', formato_id: 'f1',
                     created_at: '2024-01-01T00:00:00Z', pdf_base64: b64 }];
    window.clearBgImage();
    await window.autoLoadCorBg('f1');
    casos.rotuloFallback = document.getElementById('bg-file-name').textContent;

    // 3. A mais antiga não tem PDF: não cai para a segunda, não carrega nada.
    state.cores = [
      { id: 'velhaSemPdf', name: 'Velha', formato_id: 'f1', created_at: '2020-01-01T00:00:00Z' },
      { id: 'novaComPdf', name: 'Nova', formato_id: 'f1', created_at: '2026-01-01T00:00:00Z',
        pdf_filename: 'Nova.pdf', pdf_base64: b64 }
    ];
    window.clearBgImage();
    casos.retornoSemPdf = await window.autoLoadCorBg('f1');
    casos.nadaCarregado = state.bgImage === null;
    casos.rotuloVazio = document.getElementById('bg-file-name').textContent === '';

    // 4. Formato sem nenhuma cor.
    state.cores = [];
    window.clearBgImage();
    casos.retornoSemCor = await window.autoLoadCorBg('f1');

    // 5. Cor só com frente: o verso fica nulo.
    state.cores = [{ id: 'c4', name: 'Só Frente', formato_id: 'f1',
                     created_at: '2024-01-01T00:00:00Z',
                     pdf_filename: 'Frente.pdf', pdf_base64: b64 }];
    window.clearBgImage();
    await window.autoLoadCorBg('f1');
    casos.versoNuloQuandoNaoHa = state.bgImageVerso === null;

    return { existe: true, casos };
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const c = r.casos || {};
  const ok = r.existe &&
    c.retornoFrenteVerso === true && c.frente && c.frenteTemPt && c.verso &&
    c.rotulo === '📎 Mobi Padrao.pdf' && c.botao === 'inline-flex' &&
    c.rotuloFallback === '📎 Sem Nome de Arquivo' &&
    c.retornoSemPdf === false && c.nadaCarregado && c.rotuloVazio &&
    c.retornoSemCor === false &&
    c.versoNuloQuandoNaoHa;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-task4.js"`
Expected: FAIL, com `{"existe": false}`.

- [ ] **Step 3: Escrever a função**

Em `frontend/script.js`, logo abaixo de `window.rasterizePdfToImage`:

```js
// Carrega no Arte de Fundo o PDF da cor mais antiga do formato base.
// Devolve true quando a frente foi carregada. Silencioso quando não há cor ou
// PDF: a ausência é situação normal, não falha, e não rende toast.
window.autoLoadCorBg = async function (formatoId) {

    const cor = window.resolveCorDoFormatoBase(formatoId);

    if (!cor) return false;

    // Não cai para a segunda cor: se a mais antiga não tem arte, não há arte.

    const srcFrente = cor.pdf_base64 || cor.pdf_url;

    if (!srcFrente) return false;

    try {

        const bytes = await fetchPdfBytes(srcFrente);

        if (!bytes) return false;

        state.bgImage = await window.rasterizePdfToImage(bytes);

        const btn = document.getElementById('btn-remove-bg');

        const name = document.getElementById('bg-file-name');

        if (btn) btn.style.display = 'inline-flex';

        if (name) name.textContent = '📎 ' + (cor.pdf_filename || cor.name || '');

        // O verso entra sempre que existir, sem olhar o print_mode: drawCanvasFace

        // só desenha a face back em duplex, e assim não dependemos da ordem entre

        // escolher o formato e alternar Frente/FxVerso.

        if (cor.pdf_verso_base64) {

            try {

                const bytesVerso = await fetchPdfBytes(cor.pdf_verso_base64);

                if (bytesVerso) state.bgImageVerso = await window.rasterizePdfToImage(bytesVerso);

            } catch (eVerso) {

                console.warn('[Editor] Erro carregando arte de fundo do verso da cor:', eVerso);

            }

        }

        drawCanvas();

        return true;

    } catch (e) {

        console.warn('[Editor] Erro carregando arte de fundo da cor:', e);

        return false;

    }

};
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task4.js"`
Expected: PASS, com os cinco casos batendo.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(editor): carregar a arte da cor do formato base no fundo"
```

---

### Task 5: Ligar em `editNumeracao()`

Ao abrir uma numeração para editar, limpar o fundo que sobrou e carregar a arte da cor. A limpeza também conserta um defeito latente: `editNumeracao()` nunca tocou em `state.bgImage`, então quem editava a numeração A e em seguida a B via o canvas de B com a arte de A.

**Files:**
- Modify: `frontend/script.js:2767-3014` (`editNumeracao`) — dois pontos: perto do começo e logo depois de `drawCanvas()` na linha 2976
- Test: `<scratchpad>/verif-task5.js`

**Interfaces:**
- Consumes: `window.autoLoadCorBg(formatoId)` (Task 4), `window.clearBgImage()` (Task 1).
- Produces: nenhuma API nova.

**Ordem importa:** o carregamento precisa vir **depois** de `onFormatoSelect(false)` (linha 2959), que é onde `state.numFormato` é resolvido e o editor passa a ser exibido.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task5.js`. Ele semeia duas numerações de formatos diferentes e abre uma depois da outra:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.editNumeracao && window.pdfjsLib);

  const r = await page.evaluate(async (b64) => {
    const casos = {};

    state.formatos = [
      { id: 'f1', name: 'Formato Um',  width_mm: 180, height_mm: 50 },
      { id: 'f2', name: 'Formato Dois', width_mm: 100, height_mm: 60 },
      { id: 'f3', name: 'Sem Cor',      width_mm: 90,  height_mm: 40 }
    ];
    state.cores = [
      { id: 'c1', name: 'Cor Um',  formato_id: 'f1', created_at: '2024-01-01T00:00:00Z',
        pdf_filename: 'Um.pdf',  pdf_base64: b64 },
      { id: 'c2', name: 'Cor Dois', formato_id: 'f2', created_at: '2024-01-01T00:00:00Z',
        pdf_filename: 'Dois.pdf', pdf_base64: b64 }
    ];
    state.numeracoes = [
      { id: 'n1', name: 'Num Um',   formato_id: 'f1', elements: [], tipo: 'SEQUENCIAL' },
      { id: 'n2', name: 'Num Dois', formato_id: 'f2', elements: [], tipo: 'SEQUENCIAL' },
      { id: 'n3', name: 'Num Sem',  formato_id: 'f3', elements: [], tipo: 'SEQUENCIAL' }
    ];

    const espera = () => new Promise(res => setTimeout(res, 2500));

    window.editNumeracao('n1');
    await espera();
    casos.rotuloUm = document.getElementById('bg-file-name').textContent;
    casos.carregouUm = !!state.bgImage;

    // Abrir outra numeração precisa TROCAR a arte, não manter a anterior.
    window.editNumeracao('n2');
    await espera();
    casos.rotuloDois = document.getElementById('bg-file-name').textContent;

    // Formato sem cor: a barra tem que abrir vazia.
    window.editNumeracao('n3');
    await espera();
    casos.rotuloSemCor = document.getElementById('bg-file-name').textContent;
    casos.semCorLimpo = state.bgImage === null;

    return casos;
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const ok = r.carregouUm &&
    r.rotuloUm === '📎 Um.pdf' &&
    r.rotuloDois === '📎 Dois.pdf' &&
    r.rotuloSemCor === '' && r.semCorLimpo;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-task5.js"`
Expected: FAIL — `rotuloUm` vem `''` porque nada carrega automaticamente ainda.

- [ ] **Step 3: Limpar o fundo no começo de `editNumeracao()`**

Em `frontend/script.js`, logo depois do bloco que ativa a view (após `document.getElementById('view-numeracao').classList.add('active');`, linha 2786) e antes de `document.getElementById('num-id').value = n.id;`:

```js
    // Descartar a arte de fundo da numeração aberta antes desta — sem isso,

    // editar a numeração B logo depois da A mostrava o canvas de B com a arte de A.

    window.clearBgImage();

```

Chamar `clearBgImage()` tão cedo é seguro: ele termina em `drawCanvas()`, que retorna de imediato quando `state.numFormato` é nulo (`frontend/script.js:3542`).

- [ ] **Step 4: Carregar a arte da cor no fim de `editNumeracao()`**

Logo depois de `drawCanvas();` na linha 2976 (antes do bloco `(async () => { ... })()` que pré-carrega os `_pdfCanvas`):

```js
    // Trazer a arte da cor mais antiga do formato base. Depois de onFormatoSelect,

    // que é onde state.numFormato foi resolvido.

    window.autoLoadCorBg(n.formato_id);

```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task5.js"`
Expected: PASS, com `rotuloUm` = `📎 Um.pdf`, `rotuloDois` = `📎 Dois.pdf` e `rotuloSemCor` vazio.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(editor): carregar a arte da cor ao editar uma numeracao"
```

---

### Task 6: Ligar em `onFormatoSelect()` para numeração nova

Numa numeração nova, escolher o Formato Base traz a arte. Trocar o formato depois, com um fundo já carregado, não mexe nele.

**Files:**
- Modify: `frontend/script.js:3219-3224` (fim de `window.onFormatoSelect`)
- Test: `<scratchpad>/verif-task6.js`

**Interfaces:**
- Consumes: `window.autoLoadCorBg(formatoId)` (Task 4).
- Produces: nenhuma API nova.

**Por que a guarda dupla:** `editNumeracao()` preenche `#num-id` na linha 2790, **antes** de chamar `onFormatoSelect(false)` na 2959. A condição `#num-id` vazio impede que a Task 5 e esta tarefa carreguem a arte duas vezes na mesma abertura. A condição `!state.bgImage` é o que faz trocas posteriores de formato deixarem em paz um fundo já carregado.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-task6.js`:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.onFormatoSelect && window.pdfjsLib);

  const r = await page.evaluate(async (b64) => {
    const casos = {};
    const espera = () => new Promise(res => setTimeout(res, 2500));

    state.formatos = [
      { id: 'f1', name: 'Formato Um',   width_mm: 180, height_mm: 50 },
      { id: 'f2', name: 'Formato Dois', width_mm: 100, height_mm: 60 }
    ];
    state.cores = [
      { id: 'c1', name: 'Cor Um',   formato_id: 'f1', created_at: '2024-01-01T00:00:00Z',
        pdf_filename: 'Um.pdf',   pdf_base64: b64 },
      { id: 'c2', name: 'Cor Dois', formato_id: 'f2', created_at: '2024-01-01T00:00:00Z',
        pdf_filename: 'Dois.pdf', pdf_base64: b64 }
    ];
    const sel = document.getElementById('num-formato');
    sel.innerHTML = '<option value=""></option>' +
      state.formatos.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

    // Numeração nova: escolher o formato traz a arte.
    document.getElementById('num-id').value = '';
    window.clearBgImage();
    sel.value = 'f1';
    window.onFormatoSelect();
    await espera();
    casos.novaCarregou = document.getElementById('bg-file-name').textContent;

    // Trocar o formato com fundo já carregado NÃO mexe nele.
    sel.value = 'f2';
    window.onFormatoSelect();
    await espera();
    casos.trocaNaoMexe = document.getElementById('bg-file-name').textContent;

    // Edição (num-id preenchido) não dispara por este caminho.
    document.getElementById('num-id').value = 'n1';
    window.clearBgImage();
    sel.value = 'f1';
    window.onFormatoSelect();
    await espera();
    casos.edicaoNaoDispara = document.getElementById('bg-file-name').textContent;

    return casos;
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const ok = r.novaCarregou === '📎 Um.pdf' &&
             r.trocaNaoMexe === '📎 Um.pdf' &&
             r.edicaoNaoDispara === '';
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-task6.js"`
Expected: FAIL — `novaCarregou` vem `''`.

- [ ] **Step 3: Adicionar a chamada no fim de `onFormatoSelect`**

Em `frontend/script.js`, substitua as três últimas linhas de `window.onFormatoSelect` (linhas 3221-3223, `initCanvas(); renderElementsList(); drawCanvas();`) por:

```js
    initCanvas();
    renderElementsList();
    drawCanvas();

    // Numeração nova: trazer a arte da cor mais antiga do formato base.
    // #num-id vazio distingue criação de edição — editNumeracao() preenche esse
    // campo antes de chamar onFormatoSelect(false), e sem esta guarda a arte
    // carregaria duas vezes. E só carregamos quando não há fundo, para que trocar
    // o formato depois deixe em paz o que já está na tela.
    const ehNumeracaoNova = !(document.getElementById('num-id')?.value || '');

    if (ehNumeracaoNova && !state.bgImage) {

        window.autoLoadCorBg(fmtId);

    }
};
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-task6.js"`
Expected: PASS, com os três casos batendo.

- [ ] **Step 5: Reconfirmar que a Task 5 não regrediu**

A guarda nova pode brigar com o caminho de edição. Rode de novo:

Run: `node "<scratchpad>/verif-task5.js"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(editor): carregar a arte da cor ao escolher o formato numa numeracao nova"
```

---

### Task 7: Verificação final na tela e registro no CHANGELOG

Rodar tudo junto uma última vez, conferir o comportamento do verso em duplex — que nenhuma tarefa anterior exercitou ponta a ponta no canvas — e registrar a mudança.

**Files:**
- Modify: `CHANGELOG.md`
- Test: `<scratchpad>/verif-final.js`

**Interfaces:**
- Consumes: tudo que as tarefas 1 a 6 produziram.
- Produces: nada.

- [ ] **Step 1: Rodar as verificações das tarefas anteriores em sequência**

Run:
```bash
node "<scratchpad>/verif-task1.js" && \
node "<scratchpad>/verif-task2.js" && \
node "<scratchpad>/verif-task2b.js" && \
node "<scratchpad>/verif-task3.js" && \
node "<scratchpad>/verif-task4.js" && \
node "<scratchpad>/verif-task5.js" && \
node "<scratchpad>/verif-task6.js"
```
Expected: sete PASS.

- [ ] **Step 2: Escrever a verificação do verso em duplex**

Crie `<scratchpad>/verif-final.js`. Ele abre uma numeração FxVerso e confere que o canvas do verso realmente desenhou alguma coisa, comparando os pixels com um canvas em branco:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const pdfB64 = fs.readFileSync(path.join(REPO, 'base_ticket.pdf')).toString('base64');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.editNumeracao && window.pdfjsLib);

  const r = await page.evaluate(async (b64) => {
    state.formatos = [{ id: 'f1', name: 'Formato Um', width_mm: 180, height_mm: 50 }];
    state.cores = [{ id: 'c1', name: 'Cor Um', formato_id: 'f1',
                     created_at: '2024-01-01T00:00:00Z', pdf_filename: 'Um.pdf',
                     pdf_base64: b64, pdf_verso_base64: b64 }];
    state.numeracoes = [{ id: 'n1', name: 'Duplex', formato_id: 'f1', elements: [],
                          tipo: 'SEQUENCIAL', print_mode: 'duplex' }];

    window.editNumeracao('n1');
    await new Promise(res => setTimeout(res, 3500));

    // O canvas do verso precisa ter conteúdo, não só branco.
    const cv = document.getElementById('numeracao-canvas-verso');
    let versoDesenhado = false;
    if (cv && cv.width > 0) {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255) { versoDesenhado = true; break; }
      }
    }

    return {
      achouCanvasVerso: !!cv,
      versoNoState: !!state.bgImageVerso,
      versoDesenhado,
      frenteNoState: !!state.bgImage
    };
  }, pdfB64);

  console.log(JSON.stringify(r, null, 2));
  console.log('Erros de página:', erros);
  await browser.close();

  const ok = r.frenteNoState && r.versoNoState && r.achouCanvasVerso && r.versoDesenhado &&
             erros.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 3: Rodar a verificação do verso**

Run: `node "<scratchpad>/verif-final.js"`
Expected: PASS.

Se `versoDesenhado` for `false` mas `versoNoState` for `true`, o problema está no desenho, não no carregamento: `drawCanvas()` só desenha a face `back` quando `#num-print-mode` está em `duplex` (`frontend/script.js:3549-3552`). Confirme que `editNumeracao` propagou o `print_mode: 'duplex'` da numeração semeada para o select.

- [ ] **Step 4: Tirar um screenshot para conferência visual**

Acrescente ao fim do `verif-final.js`, antes do `browser.close()`:

```js
  await page.screenshot({ path: path.join(__dirname, 'editor-com-arte.png'), fullPage: true });
```

Run: `node "<scratchpad>/verif-final.js"`
Depois abra `<scratchpad>/editor-com-arte.png` com a ferramenta Read e confirme a olho que a arte aparece atrás dos elementos da numeração, no tamanho do formato e não ao dobro.

- [ ] **Step 5: Registrar no CHANGELOG**

Em `CHANGELOG.md`, a entrada mais recente é a `[v485 — 2026-08-08]` e a linha 7 diz `## Versão atual: **v1.5.2 (v485)** — 2026-08-08`. Atualize essa linha para:

```markdown
## Versão atual: **v1.5.3 (v486)** — 2026-08-08
```

E insira a entrada nova logo acima de `## [v485 — 2026-08-08]`, seguida de uma linha `---`:

```markdown
## [v486 — 2026-08-08] — Arte de Fundo carrega sozinha a cor do formato base

### Resumo
No editor de numeração, o botão **🖼️ Arte de Fundo** deixa de exigir upload manual: ao abrir uma numeração para editar — e ao escolher o Formato Base numa numeração nova — o PDF da cor mais antiga cadastrada para aquele formato entra sozinho no canvas.

### Como a cor é escolhida
Entre as cores cuja coluna `formato_id` aponta para o formato base da numeração, vence a de `created_at` mais antigo. Os formatos compatíveis (`formato_ids`) são ignorados de propósito — só o formato base decide. Formato sem cor, ou cor mais antiga sem PDF, abre a barra vazia, sem erro: a ausência de cor é situação normal.

Nada é persistido. A cor é re-resolvida a cada abertura, então reeditar a cor no catálogo se reflete na próxima vez que a numeração for aberta.

### O que continua igual
O rótulo com o nome do arquivo, o botão **✕ Remover** e o upload manual por cima. Subir um arquivo sobrescreve a frente e descarta o verso automático, porque o botão governa só a frente e manter o verso de uma cor sob a frente de outra arte mostraria duas artes diferentes no mesmo par de canvas.

### Frente e verso
Cores cadastradas como frente e verso carregam também a arte do verso, no canvas duplex. O campo `state.bgImageVerso` já era lido por `drawCanvasFace` mas nunca era escrito — era um caminho morto, agora ligado. O **✕ Remover** passa a limpar as duas faces.

### Corrigido
A arte de fundo de uma numeração vazava para a numeração aberta em seguida: `editNumeracao()` nunca limpava `state.bgImage`, então quem editava a numeração A e abria a B via o canvas de B com a arte da A.
```

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add CHANGELOG.md
git commit -m "docs(changelog): registrar a arte de fundo automatica por cor"
```

- [ ] **Step 7: Derrubar o servidor**

```bash
PID=$(netstat -ano | grep "127.0.0.1:9123" | grep -i listening | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F
```

Não publique. `publicar.ps1` faz deploy real na Vercel e exige confirmação do usuário.
