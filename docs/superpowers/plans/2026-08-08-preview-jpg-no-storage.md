# Preview da numeração no Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar o preview da numeração como um arquivo `.jpg` num bucket do Supabase Storage e deixar na coluna `preview_jpg` apenas a URL pública, migrando as 42 linhas que hoje carregam 454,6 KB de base64.

**Architecture:** Os previews vão para o bucket `artes`, sob o prefixo `previews-numeracoes/`. A função `uploadToStorage` de `frontend/script.js` — que já converte data URL em Blob, sobe e devolve URL pública — ganha um parâmetro de opções para escolher o bucket e o nome exato do objeto. `saveNumeracao` resolve o id de destino do registro **antes** de subir, e grava o preview como `previews-numeracoes/<id>.jpg` com upsert. Um script Python migra as linhas existentes.

**Tech Stack:** JavaScript de navegador sem build (`frontend/script.js` carregado direto por `<script>`), Supabase JS v2 já na página como `supabaseClient`, Supabase Storage REST API, Python 3 com `requests` para o script de migração, Puppeteer do `node_modules` do repo para dirigir o navegador.

## Global Constraints

- **Projeto Supabase:** `https://vwbtitjlpelrcnsytzqw.supabase.co`. As chaves estão em `.env.local` na raiz. **Nunca escreva o valor de uma chave em arquivo versionado, em log ou na saída de um comando.** Leia sempre do `.env.local` em tempo de execução.
- **Use a chave ANÔNIMA para tudo.** Medido: a `SUPABASE_SERVICE_KEY` do `.env.local` é rejeitada pelo PostgREST com **HTTP 401** (embora funcione no Storage), enquanto a `NEXT_PUBLIC_SUPABASE_ANON_KEY` responde 200. Além disso a anônima é o caminho que o app usa de verdade, então testar com ela é testar o que importa. Não tente contornar o 401 da service key — está fora do escopo deste plano.
- **Bucket, exato:** `artes`. **Caminho do objeto, exato:** `previews-numeracoes/<id da numeração>.jpg` — com o prefixo de pasta e SEM timestamp.
- **Por que não um bucket dedicado:** o bucket `previews-numeracoes` foi criado e é público, mas o upload com a chave anônima é recusado nele (`new row violates row-level security policy`), enquanto no `artes` passa com HTTP 200. As políticas permissivas foram aplicadas e não destravaram — indício de política RESTRICTIVE discriminando buckets. O usuário decidiu usar o `artes` com prefixo. A Task 1 já está concluída e registra tudo isso; **não tente criar bucket nem mexer em política de Storage**.
- **A página viva é `frontend/index.html`.** `frontend/producao.html` é a versão antiga e não deve ser tocada.
- **Não use a porta 9000 para rodar o app.** O `NewProd.exe` instalado na máquina escuta em `127.0.0.1:9000` e serve uma cópia embutida do frontend. Use a **9123**. Não mate o `NewProd.exe`.
- **Não há framework de testes no projeto.** O ciclo de teste é script Puppeteer (frontend) ou script Python (banco/Storage), executado com `node` / `venv/Scripts/python.exe`. O scratchpad desta sessão é `C:\Users\Junior\AppData\Local\Temp\claude\c--Users-Junior-Projetos-Ingresso-ideal-ideal-imposition\80609424-2b1f-40d6-9ce7-9bc05c977b65\scratchpad`.
- **Puppeteer precisa de caminho absoluto** quando o script está fora do repo: `require(path.join(REPO, 'node_modules', 'puppeteer'))`.
- **`window.state` e `window.supabaseClient` NÃO existem.** `frontend/script.js` declara `const state = {...}` e `frontend/supabase-config.js` declara `let supabaseClient`; declarações `const`/`let` no topo de um script clássico NÃO viram propriedade de `window`. Dentro de `page.evaluate` use os nomes nus `state` e `supabaseClient`. O `window.state` que existe na página vem de `frontend/mapas.js:6` e é outro objeto. Ancore `waitForFunction` em algo que `script.js` de fato exporta, como `typeof window.saveNumeracao === 'function'`, ou no nome nu.
- **(nota antiga, mantida)** `window.state` NÃO é o state do editor: `frontend/script.js` declara `const state = {...}`, binding léxico global alcançável dentro de `page.evaluate` pelo nome nu `state`, mas ausente de `window`. O `window.state` da página vem de `frontend/mapas.js:6`. Ancore `waitForFunction` numa função que `script.js` exporta, por exemplo `typeof window.saveNumeracao === 'function'`.
- **Estilo:** `frontend/script.js` usa linhas em branco entre statements e comentários em português. Siga o que estiver ao redor.
- **Ausência de erro não é prova de que rodou.** Em especial: `uploadToStorage` devolve o base64 quando o upload falha, então um save "bem-sucedido" pode ter gravado base64. Toda verificação de preview precisa ler a coluna e exigir `https://`.
- **Erros de console pré-existentes e não relacionados:** `Erro ao checar print_agents no Supabase` e `favicon.ico` 404.

## File Structure

- `frontend/script.js` — todo o frontend do app num arquivo só; é grande e assim já era, e este trabalho não o divide. Duas regiões mudam: a função `uploadToStorage` (por volta da linha 5808) e `window.saveNumeracao` (por volta da 5892).
- `migrar_previews_para_storage.py` — **criar**, na raiz do repo, no estilo dos `migrate_*.py` que já existem. Responsabilidade única: mover as 42 linhas de base64 para o bucket. É um script de uso único, mas fica versionado como registro do que foi feito.
- `criar_bucket_previews.sql` — **já existe** (commit `6466017`), registro da tentativa de bucket dedicado. Não mexa nele.
- `.gitignore` — uma linha nova para o arquivo de backup.
- `CHANGELOG.md` — entrada nova.

## Como ler as chaves (usado em várias tarefas)

No bash:

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
```

No Python:

```python
def ler_env(caminho='.env.local'):
    env = {}
    with open(caminho, 'r', encoding='utf-8') as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith('#') or '=' not in linha:
                continue
            k, v = linha.split('=', 1)
            env[k.strip()] = v.strip()
    return env
```

## Como rodar o app (usado nas tarefas 3 e 5)

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
(venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 9123 > /dev/null 2>&1 &)
timeout 60 bash -c 'until curl -sf http://127.0.0.1:9123/app/index.html -o /dev/null; do sleep 1; done'
```

Parar ao final:

```bash
PID=$(netstat -ano | grep "127.0.0.1:9123" | grep -i listening | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F
```

---

### Task 1: CONCLUÍDA — decisão de bucket já tomada

Não execute nada nesta tarefa. Ela está registrada aqui só para quem ler o plano em ordem.

O que se descobriu, medindo contra o Supabase de produção:

- O bucket `previews-numeracoes` foi criado por API e é público. Está vazio.
- Upload com a **chave anônima** nesse bucket: **HTTP 400**, `new row violates row-level security policy`.
- Upload com a **chave anônima** no bucket `artes`: **HTTP 200**.
- `storage.objects` tem 34 políticas. As políticas permissivas de `criar_bucket_previews.sql` foram aplicadas e o bloqueio permaneceu, o que aponta para uma política RESTRICTIVE discriminando buckets — permissiva nova não destrava restritiva, porque restritivas combinam por `AND`.

**Decisão do usuário:** usar o bucket `artes` com o prefixo `previews-numeracoes/`, que preserva o agrupamento lógico e torna a migração futura para o bucket dedicado uma troca de uma linha.

O `criar_bucket_previews.sql` fica no repositório como registro da tentativa (commit `6466017`).

---

### Task 2: `uploadToStorage` aceita bucket e nome de objeto

A função hoje tem a lista de buckets fixa em `['artes', 'imposicao-storage']` e monta o nome do objeto como `${path}/${Date.now()}_${nome}`. O preview precisa de outro bucket e de um nome estável, sem timestamp, para que salvar a mesma numeração de novo sobrescreva em vez de acumular órfãos.

**Files:**
- Modify: `frontend/script.js:5808` (assinatura de `uploadToStorage`) e `:5854-5856` (montagem de `finalPath` e `bucketsToTry`)
- Test: `<scratchpad>/verif-upload-opts.js`

**Interfaces:**
- Consumes: nada. O bucket de destino (`artes`) já aceita upload anônimo hoje.
- Produces: `uploadToStorage(content, fileName, path, opts)` onde `opts` é um objeto opcional com duas chaves, ambas opcionais:
  - `opts.buckets` — array de nomes de bucket a tentar, na ordem. Sem ela, mantém `['artes', 'imposicao-storage']`.
  - `opts.objectPath` — caminho exato do objeto dentro do bucket. Sem ela, mantém `${path || 'uploads'}/${Date.now()}_${nome saneado}`.
  As três chamadas existentes passam 3 argumentos e não mudam de comportamento.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-upload-opts.js`:

```js
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveNumeracao === 'function' && typeof supabaseClient !== 'undefined' && supabaseClient);

  const r = await page.evaluate(async () => {
    // uploadToStorage não é global; espiona-se pelo supabaseClient.storage.
    const chamadas = [];
    const originalFrom = supabaseClient.storage.from.bind(supabaseClient.storage);
    supabaseClient.storage.from = (bucket) => {
      const real = originalFrom(bucket);
      const originalUpload = real.upload.bind(real);
      real.upload = (caminho, blob, opcoes) => {
        chamadas.push({ bucket, caminho });
        // Não sobe de verdade: devolve erro para o loop seguir sem tocar na rede.
        return Promise.resolve({ data: null, error: { message: 'interceptado pelo teste' } });
      };
      return real;
    };

    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

    // 1. Sem opts: buckets e nome padrão.
    await window.__uploadToStorageTeste(dataUrl, 'x.jpg', 'uploads_teste');
    const padrao = chamadas.slice();

    chamadas.length = 0;

    // 2. Com opts: bucket e nome exatos.
    await window.__uploadToStorageTeste(dataUrl, 'x.jpg', 'ignorado',
      { buckets: ['previews-numeracoes'], objectPath: 'abc-123.jpg' });
    const comOpts = chamadas.slice();

    supabaseClient.storage.from = originalFrom;
    return { padrao, comOpts };
  });

  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  const p = r.padrao || [];
  const o = r.comOpts || [];
  const ok =
    p.length === 2 && p[0].bucket === 'artes' && p[1].bucket === 'imposicao-storage' &&
    /^uploads_teste\/\d+_x\.jpg$/.test(p[0].caminho) &&
    o.length === 1 && o[0].bucket === 'previews-numeracoes' && o[0].caminho === 'abc-123.jpg';
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

O teste chama `window.__uploadToStorageTeste`, um alias que você vai expor no Step 3 — `uploadToStorage` é uma função de módulo, não global, e sem o alias não há como exercitá-la do teste.

- [ ] **Step 2: Rodar para confirmar que falha**

Suba o servidor conforme a seção acima, depois:

Run: `node "<scratchpad>/verif-upload-opts.js"`
Expected: FAIL, com erro de `window.__uploadToStorageTeste is not a function`.

- [ ] **Step 3: Alterar a função**

Em `frontend/script.js`, troque a assinatura:

```js
async function uploadToStorage(content, fileName, path, opts = {}) {
```

E o trecho que monta o destino (hoje `const safeName = ...; const finalPath = ...; const bucketsToTry = ['artes', 'imposicao-storage'];`) por:

```js
    const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'arquivo';

    // objectPath dá o caminho exato dentro do bucket. Sem ele, o nome recebe um
    // timestamp — o que é certo para arte de cliente, onde cada envio é um arquivo
    // novo, e errado para o preview, que deve sobrescrever o do próprio registro.
    const finalPath = opts.objectPath || `${path || 'uploads'}/${Date.now()}_${safeName}`;

    const bucketsToTry = (opts.buckets && opts.buckets.length) ? opts.buckets : ['artes', 'imposicao-storage'];
```

E logo depois do fim da função, exponha o alias usado pelo teste:

```js
// Alias para os scripts de verificação: uploadToStorage é função de módulo e não
// seria alcançável de dentro de um page.evaluate.
window.__uploadToStorageTeste = uploadToStorage;
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-upload-opts.js"`
Expected: PASS — a chamada sem `opts` tenta `artes` e depois `imposicao-storage` com nome timestampado, e a chamada com `opts` tenta só `previews-numeracoes` com o caminho `abc-123.jpg`.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(storage): uploadToStorage aceita bucket e nome de objeto"
```

---

### Task 3: `saveNumeracao` sobe o preview para o bucket

**Files:**
- Modify: `frontend/script.js:5892-6090` (`window.saveNumeracao`) — três pontos: a resolução do id no início, a troca de `preview_jpg`, e a ramificação do save no fim
- Test: `<scratchpad>/verif-preview-save.js`

**Interfaces:**
- Consumes: `uploadToStorage(content, fileName, path, opts)` da Task 2; o bucket da Task 1.
- Produces: `preview_jpg` passa a conter uma URL `https://.../object/public/artes/previews-numeracoes/<id>.jpg`.

**A armadilha central desta tarefa.** O fim de `saveNumeracao` tem **três** caminhos, não dois:

1. `id` preenchido → `PUT /numeracoes/<id>`.
2. `id` vazio, mas existe numeração com o mesmo nome → `PUT /numeracoes/<existing.id>`.
3. `id` vazio e nome inédito → `POST /numeracoes`, e `api()` gera o UUID internamente (`frontend/script.js:730`).

O preview precisa ir para o Storage com o nome do registro que **de fato** vai receber os dados. Se você gerar um UUID novo e o caminho 2 disparar, o `.jpg` fica com um nome que não corresponde a registro nenhum e o preview da numeração homônima aponta para um arquivo com nome alheio. Por isso o id de destino é resolvido **antes** do upload, e o caminho 3 passa esse id no corpo — `api()` respeita `body.id` (`let id = body.id`, `:730`) e monta `{ id, ...body }` (`:752`), onde o valor do corpo prevalece.

- [ ] **Step 1: Escrever a verificação que falha**

Crie `<scratchpad>/verif-preview-save.js`. Ele salva uma numeração pelo app e depois lê a linha direto do Supabase:

```js
const fs = require('fs');
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

function lerEnv() {
  const env = {};
  for (const linha of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split('\n')) {
    const t = linha.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

(async () => {
  const env = lerEnv();
  const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = env.SUPABASE_SERVICE_KEY;
  const nome = 'ZZ Teste Preview Storage';

  const cabecalhos = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  // Limpa restos de execuções anteriores.
  await fetch(`${SUPA}/rest/v1/producao_numeracoes?name=eq.${encodeURIComponent(nome)}`,
    { method: 'DELETE', headers: cabecalhos });

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveNumeracao === 'function' && typeof supabaseClient !== 'undefined' && supabaseClient);
  await page.waitForFunction(() => state.formatos && state.formatos.length > 0, { timeout: 20000 });

  const primeiroSave = await page.evaluate(async (nomeNum) => {
    const fmt = state.formatos[0];
    document.getElementById('num-formato').value = fmt.id;
    window.onFormatoSelect();
    document.getElementById('num-id').value = '';
    document.getElementById('num-name').value = nomeNum;
    document.getElementById('num-tipo').value = 'SEQUENCIAL';
    state.numElements = [];
    await window.saveNumeracao();
    await new Promise(r => setTimeout(r, 4000));
    return true;
  }, nome);

  const buscar = async () => {
    const res = await fetch(
      `${SUPA}/rest/v1/producao_numeracoes?name=eq.${encodeURIComponent(nome)}&select=id,preview_jpg`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    return (await res.json())[0];
  };

  const linha1 = await buscar();

  // Salvar DE NOVO com o mesmo nome tem que reaproveitar o mesmo objeto.
  await page.evaluate(async (nomeNum) => {
    const fmt = state.formatos[0];
    document.getElementById('num-formato').value = fmt.id;
    window.onFormatoSelect();
    document.getElementById('num-id').value = '';
    document.getElementById('num-name').value = nomeNum;
    state.numElements = [];
    await window.saveNumeracao();
    await new Promise(r => setTimeout(r, 4000));
  }, nome);

  const linha2 = await buscar();

  // Quantos objetos existem no bucket com esse id?
  const listaRes = await fetch(`${SUPA}/storage/v1/object/list/artes`,
    { method: 'POST', headers: { ...cabecalhos, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: 'previews-numeracoes/', limit: 100 }) });
  const objetos = await listaRes.json();

  let urlOk = 0, tipo = '';
  if (linha2 && /^https:\/\//.test(linha2.preview_jpg || '')) {
    const r = await fetch(linha2.preview_jpg);
    urlOk = r.status;
    tipo = r.headers.get('content-type') || '';
  }

  const r = {
    idPrimeiro: linha1 && linha1.id,
    idSegundo: linha2 && linha2.id,
    ehUrl: /^https:\/\//.test((linha2 && linha2.preview_jpg) || ''),
    ehBase64: /^data:image/.test((linha2 && linha2.preview_jpg) || ''),
    url: (linha2 && linha2.preview_jpg || '').slice(0, 90),
    urlHttp: urlOk,
    tipo,
    objetosDoId: objetos.filter(o => o.name === `${linha2 && linha2.id}.jpg`).length,
    totalObjetos: objetos.length
  };
  console.log(JSON.stringify(r, null, 2));

  // Limpeza: apaga a linha e o objeto de teste.
  await fetch(`${SUPA}/rest/v1/producao_numeracoes?name=eq.${encodeURIComponent(nome)}`,
    { method: 'DELETE', headers: cabecalhos });
  if (linha2 && linha2.id) {
    await fetch(`${SUPA}/storage/v1/object/artes/previews-numeracoes/${linha2.id}.jpg`,
      { method: 'DELETE', headers: cabecalhos });
  }
  await browser.close();

  const ok = r.ehUrl && !r.ehBase64 && r.urlHttp === 200 && r.tipo.includes('image/jpeg') &&
             r.idPrimeiro === r.idSegundo && r.objetosDoId === 1 &&
             r.url.includes('previews-numeracoes') && r.url.includes(r.idSegundo);
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node "<scratchpad>/verif-preview-save.js"`
Expected: FAIL, com `"ehBase64": true` e `"ehUrl": false` — o código atual grava data URL.

- [ ] **Step 3: Resolver o id de destino no início de `saveNumeracao`**

Logo depois das validações de `name` e `fmtId` (após a linha `if (!fmtId) return toast('Selecione um formato.', 'error');`) e antes do `toast('Fazendo upload e salvando...')`:

```js
    // O id de destino precisa ser conhecido ANTES do upload: o preview vai para o
    // Storage com o nome do registro. São três caminhos de gravação — editar,
    // substituir uma numeração homônima, ou criar — e os três têm que apontar para
    // o mesmo id que o arquivo no bucket.
    const temSupabase = typeof supabaseClient !== 'undefined' && !!supabaseClient;

    const homonima = id ? null : state.numeracoes.find(

        n => n.name.trim().toLowerCase() === name.toLowerCase()

    );

    const gerarUuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)

        ? crypto.randomUUID()

        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {

            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);

            return v.toString(16);

        });

    // Sem Supabase o app roda offline: deixa o id em branco para que api() use o
    // esquema local dela, e o preview cai no fallback base64 de uploadToStorage.
    const numeracaoId = id || (homonima ? homonima.id : (temSupabase ? gerarUuid() : ''));
```

- [ ] **Step 4: Subir o preview em vez de gravar base64**

Logo depois da linha `previewJpgBase64 = previewCanvas.toDataURL('image/jpeg', 0.85);` e do `}` que fecha o `if (fmt)`, antes dos uploads de SVG e PDF:

```js
        // Preview para o Storage: nome estável pelo id do registro, com upsert, para
        // que salvar de novo sobrescreva em vez de deixar um órfão no bucket.
        let previewValor = previewJpgBase64;

        if (previewJpgBase64 && numeracaoId) {

            previewValor = await uploadToStorage(

                previewJpgBase64,

                numeracaoId + '.jpg',

                '',

                { buckets: ['artes'], objectPath: 'previews-numeracoes/' + numeracaoId + '.jpg' }

            );

        }
```

E troque `preview_jpg: previewJpgBase64,` por:

```js
            preview_jpg: previewValor,
```

- [ ] **Step 5: Usar o id resolvido na ramificação do save**

Troque o bloco `if (id) { ... } else { const existing = ...; if (existing) { ... } else { ... } }` do fim da função por:

```js
        if (id) {

            await api('PUT', `/numeracoes/${id}`, data);

            toast('Numeração atualizada!', 'success');

        } else if (homonima) {

            await api('PUT', `/numeracoes/${homonima.id}`, data);

            toast('Numeração substituída!', 'success');

        } else {

            await api('POST', '/numeracoes', numeracaoId ? { id: numeracaoId, ...data } : data);

            toast('Numeração salva!', 'success');

        }
```

A `homonima` já foi resolvida no Step 3 a partir do mesmo `state.numeracoes`, então esta ramificação decide exatamente como antes — só que agora o id que ela usa é o mesmo que nomeou o arquivo no bucket.

- [ ] **Step 6: Rodar para confirmar que passa**

Run: `node "<scratchpad>/verif-preview-save.js"`
Expected: PASS. Em particular `ehUrl: true`, `ehBase64: false`, `urlHttp: 200`, `tipo` contendo `image/jpeg`, `idPrimeiro === idSegundo` e `objetosDoId: 1` — o segundo save sobrescreveu em vez de criar um arquivo novo.

Se `ehBase64` vier `true`, o upload falhou e o fallback devolveu o base64: volte para a Task 1 e confira a política de escrita do bucket. Não trate isso como "passou com ressalva".

- [ ] **Step 7: Confirmar que SVG e PDF continuam indo para `artes`**

Run: `node "<scratchpad>/verif-upload-opts.js"`
Expected: PASS — as chamadas sem `opts` seguem tentando `artes` e depois `imposicao-storage`.

- [ ] **Step 8: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add frontend/script.js
git commit -m "feat(numeracao): gravar o preview como .jpg no Storage"
```

---

### Task 4: Migrar as 42 linhas que ainda têm base64

**Files:**
- Create: `migrar_previews_para_storage.py`
- Modify: `.gitignore`
- Test: o próprio script, que termina com uma verificação

**Interfaces:**
- Consumes: o bucket da Task 1.
- Produces: todas as linhas de `producao_numeracoes` com preview passam a conter URL. Nenhuma interface de código.

- [ ] **Step 1: Ignorar o arquivo de backup**

Acrescente ao fim do `.gitignore`:

```
# Backup local da migração de preview_jpg — rede de segurança da máquina, não
# conteúdo do projeto. São centenas de KB de base64 que não devem entrar no git.
backup_preview_jpg_*.json
```

- [ ] **Step 2: Escrever o script**

Crie `migrar_previews_para_storage.py` na raiz:

```python
# -*- coding: utf-8 -*-
"""
Migra producao_numeracoes.preview_jpg de data URL base64 para arquivo .jpg no
bucket previews-numeracoes, deixando na coluna apenas a URL publica.

Uso:
    venv/Scripts/python.exe migrar_previews_para_storage.py

E idempotente: linhas que ja tenham URL sao puladas. Se o upload de uma linha
falhar, a linha NAO e alterada -- trocar a coluna por uma URL inexistente
perderia o preview de vez.
"""
import base64
import datetime
import json
import sys

import requests

BUCKET = "artes"
PREFIXO = "previews-numeracoes"
TABELA = "producao_numeracoes"


def ler_env(caminho=".env.local"):
    env = {}
    with open(caminho, "r", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def main():
    env = ler_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    # A chave anonima e usada em tudo: a service key deste projeto e rejeitada
    # pelo PostgREST com 401, e a anonima e o caminho que o app usa de verdade.
    h = {"apikey": anon, "Authorization": "Bearer " + anon}
    h_json = dict(h, **{"Content-Type": "application/json"})

    # 1. Ler tudo
    res = requests.get(
        url + "/rest/v1/" + TABELA + "?select=id,name,preview_jpg",
        headers=h, timeout=60)
    res.raise_for_status()
    linhas = res.json()
    print("Linhas na tabela: %d" % len(linhas))

    # 2. Backup ANTES de qualquer escrita
    carimbo = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_backup = "backup_preview_jpg_%s.json" % carimbo
    with open(nome_backup, "w", encoding="utf-8") as f:
        json.dump(linhas, f, ensure_ascii=False)
    print("Backup gravado em %s" % nome_backup)

    pendentes = [l for l in linhas
                 if (l.get("preview_jpg") or "").startswith("data:")]
    ja_url = [l for l in linhas
              if (l.get("preview_jpg") or "").startswith("http")]
    vazias = [l for l in linhas if not (l.get("preview_jpg") or "")]
    print("A migrar: %d | ja em URL: %d | sem preview: %d"
          % (len(pendentes), len(ja_url), len(vazias)))

    if not pendentes:
        print("Nada a fazer.")
        return 0

    migradas, falhas = [], []

    for linha in pendentes:
        num_id = linha["id"]
        nome = linha.get("name") or "(sem nome)"
        conteudo = linha["preview_jpg"]

        try:
            b64 = conteudo.split("base64,", 1)[1]
            binario = base64.b64decode(b64)
        except Exception as e:
            falhas.append((num_id, nome, "base64 invalido: %s" % e))
            continue

        objeto = "%s/%s.jpg" % (PREFIXO, num_id)
        up = requests.post(
            "%s/storage/v1/object/%s/%s" % (url, BUCKET, objeto),
            headers=dict(h, **{"Content-Type": "image/jpeg",
                               "x-upsert": "true"}),
            data=binario, timeout=120)

        if up.status_code not in (200, 201):
            falhas.append((num_id, nome, "upload HTTP %d: %s"
                           % (up.status_code, up.text[:120])))
            continue

        publica = "%s/storage/v1/object/public/%s/%s" % (url, BUCKET, objeto)

        pat = requests.patch(
            "%s/rest/v1/%s?id=eq.%s" % (url, TABELA, num_id),
            headers=h_json, json={"preview_jpg": publica}, timeout=60)

        if pat.status_code not in (200, 204):
            falhas.append((num_id, nome, "patch HTTP %d: %s"
                           % (pat.status_code, pat.text[:120])))
            continue

        migradas.append((num_id, nome, publica, len(binario)))
        print("  OK %-40s %6.1f KB" % (nome[:40], len(binario) / 1024.0))

    # 3. Verificar de verdade: a coluna virou URL E o arquivo existe e e JPEG
    print("\nVerificando...")
    res = requests.get(
        url + "/rest/v1/" + TABELA + "?select=id,name,preview_jpg",
        headers=h, timeout=60)
    res.raise_for_status()

    restou_base64 = [l for l in res.json()
                     if (l.get("preview_jpg") or "").startswith("data:")]

    urls_ruins = []
    for _id, nome, publica, _tam in migradas:
        r = requests.get(publica, timeout=60)
        tipo = r.headers.get("content-type", "")
        if r.status_code != 200 or "image/jpeg" not in tipo:
            urls_ruins.append((nome, publica, r.status_code, tipo))

    print("\n=== RESULTADO ===")
    print("Migradas: %d" % len(migradas))
    print("Falhas:   %d" % len(falhas))
    for num_id, nome, motivo in falhas:
        print("  FALHOU %s (%s): %s" % (nome, num_id, motivo))
    print("Ainda em base64 na tabela: %d" % len(restou_base64))
    for l in restou_base64:
        print("  - %s (%s)" % (l.get("name"), l["id"]))
    print("URLs que nao responderam JPEG: %d" % len(urls_ruins))
    for nome, publica, cod, tipo in urls_ruins:
        print("  - %s -> HTTP %s tipo %s" % (nome, cod, tipo))

    ok = not falhas and not restou_base64 and not urls_ruins
    print("\n%s" % ("SUCESSO" if ok else "INCOMPLETO"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Registrar o estado de antes**

Antes de rodar a migração, guarde o número para comparar depois:

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
SUPA_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
curl -s "$SUPA_URL/rest/v1/producao_numeracoes?select=id,preview_jpg" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  | python -c "
import sys, json
rows = json.load(sys.stdin)
b64 = [r for r in rows if (r.get('preview_jpg') or '').startswith('data:')]
url = [r for r in rows if (r.get('preview_jpg') or '').startswith('http')]
print('base64:', len(b64), '| url:', len(url), '| total:', len(rows))
print('KB em base64: %.1f' % (sum(len(r['preview_jpg']) for r in b64)/1024))
"
```

Expected: em torno de `base64: 42 | url: 0 | total: 49` e ~454,6 KB. Anote os números exatos no relatório — pode haver uma linha a mais se a Task 3 tiver criado alguma.

- [ ] **Step 4: Rodar a migração**

Run: `venv/Scripts/python.exe migrar_previews_para_storage.py`
Expected: termina com `SUCESSO`, `Falhas: 0`, `Ainda em base64 na tabela: 0` e `URLs que nao responderam JPEG: 0`.

Se terminar com `INCOMPLETO`, **não** commite e não siga para a Task 5: relate as linhas que falharam e o motivo. O backup está no `backup_preview_jpg_<carimbo>.json` da raiz.

- [ ] **Step 5: Conferir o estado de depois**

Rode de novo o comando do Step 3.
Expected: `base64: 0`, `url` igual ao total de linhas que tinham preview, e o total de KB caindo para alguns poucos (só o comprimento das URLs).

- [ ] **Step 6: Confirmar a idempotência**

Run: `venv/Scripts/python.exe migrar_previews_para_storage.py`
Expected: `A migrar: 0 | ja em URL: N | sem preview: M` e `Nada a fazer.` — sem erro e sem tocar em nada. Um segundo backup é gravado, o que é esperado e inofensivo.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add migrar_previews_para_storage.py .gitignore
git commit -m "chore(migracao): mover previews de base64 para o Storage"
```

Confirme com `git status --short` que nenhum `backup_preview_jpg_*.json` entrou no commit.

---

### Task 5: Verificação final e CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Test: `<scratchpad>/verif-final-preview.js`

**Interfaces:**
- Consumes: tudo das tarefas 1 a 4.
- Produces: nada.

- [ ] **Step 1: Rodar as verificações anteriores**

```bash
node "<scratchpad>/verif-upload-opts.js" && \
node "<scratchpad>/verif-preview-save.js"
```
Expected: dois PASS.

- [ ] **Step 2: Medir o ganho no carregamento**

O motivo do trabalho é que os 455 KB atravessavam a rede a cada `loadAll()`. Confirme que isso acabou. Crie `<scratchpad>/verif-final-preview.js`:

```js
const path = require('path');
const REPO = 'c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition';
const puppeteer = require(path.join(REPO, 'node_modules', 'puppeteer'));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  let bytesNumeracoes = 0;
  page.on('response', async (res) => {
    if (res.url().includes('producao_numeracoes') && res.request().method() === 'GET') {
      try { bytesNumeracoes += (await res.buffer()).length; } catch (e) {}
    }
  });

  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));

  await page.goto('http://127.0.0.1:9123/app/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => state.numeracoes && state.numeracoes.length > 0, { timeout: 30000 });

  const r = await page.evaluate(() => {
    const nums = state.numeracoes || [];
    return {
      total: nums.length,
      comBase64: nums.filter(n => (n.preview_jpg || '').startsWith('data:')).length,
      comUrl: nums.filter(n => (n.preview_jpg || '').startsWith('http')).length,
      semPreview: nums.filter(n => !n.preview_jpg).length
    };
  });

  r.kbNumeracoes = +(bytesNumeracoes / 1024).toFixed(1);
  r.erros = erros;
  console.log(JSON.stringify(r, null, 2));
  await browser.close();

  // NAO ha limiar de KB total: medido depois, `csv_data` sozinho pesa ~460 KB na
  // tabela e domina o payload. O ganho desta mudanca esta na coluna preview_jpg
  // (454,6 KB -> 5,41 KB), nao no total da resposta.
  const ok = r.comBase64 === 0 && r.comUrl > 0 && erros.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
```

Run: `node "<scratchpad>/verif-final-preview.js"`
Expected: PASS, com `comBase64: 0`. Anote `kbNumeracoes` no relatório como registro, mas **não** o trate como critério: a medição mostrou que `csv_data` pesa ~460 KB na tabela e domina o payload, então o total não cai proporcionalmente. O ganho desta mudança é na coluna `preview_jpg`, de 454,6 KB para 5,41 KB — é esse o número a reportar.

- [ ] **Step 3: Registrar no CHANGELOG**

Em `CHANGELOG.md`, a entrada mais recente é `[v486 — 2026-08-08]` e a linha 7 diz `## Versão atual: **v1.5.3 (v486)** — 2026-08-08`. Atualize essa linha para:

```markdown
## Versão atual: **v1.5.4 (v487)** — 2026-08-08
```

E insira a entrada nova logo acima de `## [v486 — 2026-08-08]`, seguida de uma linha `---`. Substitua `NNN` pelos valores reais medidos nos Steps 2 e 4 da Task 4:

```markdown
## [v487 — 2026-08-08] — Preview da numeração sai da tabela e vai para o Storage

### Resumo
O preview de 100 DPI gerado ao salvar uma numeração era gravado como data URL base64 na coluna `preview_jpg` de `producao_numeracoes`. Agora é um arquivo `.jpg` no bucket `artes`, sob o prefixo `previews-numeracoes/`, e a coluna guarda só a URL pública.

### Por que
Não era só armazenamento. `loadAll()` carrega as numerações com `select *`, então os NNN KB de base64 espalhados por NNN linhas atravessavam a rede a cada carregamento de página — para um dado que nenhuma tela usa. Depois da mudança o mesmo carregamento traz NNN KB.

### Um preview por numeração
O arquivo é nomeado com o id do registro (`previews-numeracoes/<id>.jpg`) e sobe com upsert, então salvar a mesma numeração dez vezes sobrescreve o mesmo objeto em vez de deixar dez órfãos no bucket. Para isso o id passou a ser resolvido no início de `saveNumeracao`, antes do upload — inclusive no caminho em que salvar sem id, com um nome que já existe, substitui a numeração homônima em vez de criar outra.

### Migração
As NNN linhas que já estavam em base64 foram convertidas de uma vez, com backup local do estado anterior. A conferência não se contentou com o PATCH ter retornado sem erro: cada URL foi baixada exigindo status 200 e `content-type: image/jpeg`.

### Se o Storage falhar
`uploadToStorage` mantém o comportamento antigo de cair para base64 quando o upload não passa. A coluna continua funcionando em vez de ficar vazia — é degradação, não quebra.
```

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/Junior/Projetos Ingresso ideal/ideal-imposition"
git add CHANGELOG.md
git commit -m "docs(changelog): registrar o preview da numeracao no Storage"
```

- [ ] **Step 5: Derrubar o servidor**

```bash
PID=$(netstat -ano | grep "127.0.0.1:9123" | grep -i listening | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F
```

Não publique. `publicar.ps1` faz deploy real na Vercel e exige confirmação do usuário.
