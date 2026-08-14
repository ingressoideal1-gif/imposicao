# Catálogo de Fontes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consertar o Excluir do catálogo de fontes e trocar o cadastro digitado por upload em lote com nome lido de dentro do arquivo, mais ordem alfabética, busca e amostra na tabela.

**Architecture:** Tudo no frontend. Um módulo novo `frontend/fonte-nome.js` (IIFE sem dependências, roda em Node nos testes, padrão do `fonte-canvas.js`) extrai o nome da tabela `name` de TTF/OTF/WOFF. `script.js` e `index.html` mudam na tela de Fontes. Backend, engine e `fonte-canvas.js` ficam intocados — o caminho da impressão não muda.

**Tech Stack:** JavaScript puro (browser + Node), Pester 3 (`Should Be`) + harness Node, FastAPI já existente (sem mudança).

## Global Constraints

- NÃO alterar `app.py`, `engine.py`, `db.py`, `fonte-canvas.js`, nem o formato do payload de `POST /api/fontes` (`nome`, `font_family`, `categoria`, `arquivo_url`, `ativo`).
- Entradas existentes do catálogo não são tocadas; `nome` e `font_family` de entradas NOVAS recebem a mesma string.
- Duplicata (mesma `chaveDeDuplicata` em `nome` ou `font_family`, no catálogo ou no lote) é PULADA, nunca substituída.
- Scripts novos no `index.html` entram com o mesmo sufixo de versão dos vizinhos (`?v=566`).
- Testes Pester usam a sintaxe antiga (`Should Be`), como o resto de `tests/`.
- Comentários e nomes em português, no tom dos arquivos vizinhos.

---

### Task 1: Corrigir o Excluir (DELETE com id no caminho)

**Files:**
- Create: `tests/CatalogoFontes.Tests.ps1`
- Modify: `frontend/script.js` (função `deletarFonteWeb`, ~linha 372)

**Interfaces:**
- Produces: `tests/CatalogoFontes.Tests.ps1`, que as Tasks 3 e 4 estendem com mais `It`s.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/CatalogoFontes.Tests.ps1`:

```powershell
# Guardas da tela Configuracoes > Fontes.
#
# O bug que originou este arquivo: o frontend chamava DELETE /api/fontes?id=X,
# mas a rota do FastAPI e DELETE /api/fontes/{fonte_id}. O FastAPI responde 405
# e o botao Excluir falhava SEMPRE, desde que existiu. Estas guardas leem o
# fonte (source) para o desvio nao voltar.

$repo = Split-Path $PSScriptRoot -Parent
$js   = Get-Content "$repo\frontend\script.js" -Raw

Describe 'catalogo de fontes -- o Excluir fala com a rota que existe' {
    It 'DELETE leva o id no caminho, como a rota do app.py' {
        ($js -match 'api/fontes/\$\{encodeURIComponent\(id\)\}') | Should Be $true
    }
    It 'DELETE nao usa mais ?id= (que dava 405)' {
        ($js -match 'api/fontes\?id=') | Should Be $false
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: 1 falha (`DELETE leva o id no caminho`), 1 passa.

- [ ] **Step 3: Corrigir o `deletarFonteWeb`**

Em `frontend/script.js`, trocar:

```js
        const res = await fetch(`${apiBase}/api/fontes?id=${id}`, {
            method: 'DELETE'
        });
```

por:

```js
        // A rota do app.py e DELETE /api/fontes/{fonte_id}; mandar ?id= dava 405
        // e o Excluir nunca funcionou.
        const res = await fetch(`${apiBase}/api/fontes/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: 2 passando.

- [ ] **Step 5: Commit**

```bash
git add tests/CatalogoFontes.Tests.ps1 frontend/script.js
git commit -m "fix(fontes): o Excluir chama a rota certa -- id no caminho, nao ?id="
```

---

### Task 2: `fonte-nome.js` — o nome sai de dentro do arquivo

**Files:**
- Create: `frontend/fonte-nome.js`
- Create: `tests/fonte_nome_harness.js`
- Create: `tests/FonteNome.Tests.ps1`

**Interfaces:**
- Produces (globais no browser e `module.exports` no Node):
  - `nomeDaFonte(dados, nomeDoArquivo)` → `Promise<string>` — `dados` é ArrayBuffer ou Uint8Array; nunca rejeita, cai para `nomeDoArquivoLimpo`.
  - `nomeDoArquivoLimpo(nomeDoArquivo)` → `string`.
  - `chaveDeDuplicata(nome)` → `string` (minúsculas, sem acento, espaços colapsados).

- [ ] **Step 1: Escrever o harness que falha**

Criar `tests/fonte_nome_harness.js`:

```js
// Confere o fonte-nome.js fora do navegador: monta fontes TTF minimas em
// memoria (so o cabecalho sfnt + a tabela `name`) e verifica o nome extraido.
// Roda em node: `node tests/fonte_nome_harness.js`. Sai com codigo 1 na falha.

const path = require('path');
const modulo = require(path.join(__dirname, '..', 'frontend', 'fonte-nome.js'));

// ── construtor de TTF de brinquedo ──────────────────────────────────────────

function utf16be(texto) {
    const bytes = [];
    for (const ch of texto) {
        const c = ch.codePointAt(0);
        bytes.push((c >> 8) & 0xff, c & 0xff);
    }
    return bytes;
}

function latin1(texto) {
    return [...texto].map(c => c.codePointAt(0) & 0xff);
}

// registros: [{platform, encoding, language, nameID, texto}]
function montarTabelaName(registros) {
    const strings = [];
    let strOff = 0;
    const recs = [];
    for (const r of registros) {
        const bytes = r.platform === 1 ? latin1(r.texto) : utf16be(r.texto);
        recs.push([r.platform, r.encoding, r.language, r.nameID, bytes.length, strOff]);
        strings.push(...bytes);
        strOff += bytes.length;
    }
    const header = [0, registros.length, 6 + registros.length * 12];
    const out = [];
    const u16 = v => out.push((v >> 8) & 0xff, v & 0xff);
    header.forEach(u16);
    recs.forEach(rec => rec.forEach(u16));
    out.push(...strings);
    return Uint8Array.from(out);
}

function montarTTF(registros) {
    const name = montarTabelaName(registros);
    const out = [];
    const u16 = v => out.push((v >> 8) & 0xff, v & 0xff);
    const u32 = v => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    u32(0x00010000);          // sfnt version (TTF)
    u16(1); u16(0); u16(0); u16(0); // numTables=1, search/entry/range (ignorados)
    out.push(0x6e, 0x61, 0x6d, 0x65); // tag 'name'
    u32(0);                   // checksum (ignorado pelo parser)
    u32(28);                  // offset: 12 do cabecalho + 16 da entrada
    u32(name.length);
    return Uint8Array.from([...out, ...name]);
}

// ── casos ────────────────────────────────────────────────────────────────────

const casos = [];
function caso(nome, fn) { casos.push([nome, fn]); }

caso('familia tipografica (16) + subfamilia (17)', async () => {
    const ttf = montarTTF([
        { platform: 3, encoding: 1, language: 0x0409, nameID: 16, texto: 'Gotham' },
        { platform: 3, encoding: 1, language: 0x0409, nameID: 17, texto: 'Book' },
        { platform: 3, encoding: 1, language: 0x0409, nameID: 1, texto: 'Gotham Book' },
    ]);
    return await modulo.nomeDaFonte(ttf, 'gotham.ttf') === 'Gotham Book';
});

caso('so familia (1) + subfamilia (2) fora do Regular', async () => {
    const ttf = montarTTF([
        { platform: 3, encoding: 1, language: 0x0409, nameID: 1, texto: 'Arial' },
        { platform: 3, encoding: 1, language: 0x0409, nameID: 2, texto: 'Bold' },
    ]);
    return await modulo.nomeDaFonte(ttf, 'arial-bold.ttf') === 'Arial Bold';
});

caso('subfamilia Regular nao gruda no nome', async () => {
    const ttf = montarTTF([
        { platform: 3, encoding: 1, language: 0x0409, nameID: 1, texto: 'Lobster' },
        { platform: 3, encoding: 1, language: 0x0409, nameID: 2, texto: 'Regular' },
    ]);
    return await modulo.nomeDaFonte(ttf, 'lobster.ttf') === 'Lobster';
});

caso('subfamilia ja contida na familia nao repete', async () => {
    const ttf = montarTTF([
        { platform: 3, encoding: 1, language: 0x0409, nameID: 1, texto: 'Gotham Book' },
        { platform: 3, encoding: 1, language: 0x0409, nameID: 2, texto: 'Book' },
    ]);
    return await modulo.nomeDaFonte(ttf, 'gotham_book.ttf') === 'Gotham Book';
});

caso('sem registro windows, vale o macintosh roman', async () => {
    const ttf = montarTTF([
        { platform: 1, encoding: 0, language: 0, nameID: 1, texto: 'Impact' },
    ]);
    return await modulo.nomeDaFonte(ttf, 'impact.ttf') === 'Impact';
});

caso('arquivo ilegivel cai para o nome do arquivo', async () => {
    const lixo = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    return await modulo.nomeDaFonte(lixo, 'gotham_book-2.ttf') === 'Gotham Book 2';
});

caso('nomeDoArquivoLimpo tira extensao, separadores e capitaliza', () => {
    return modulo.nomeDoArquivoLimpo('minha__fonte-nova.otf') === 'Minha Fonte Nova';
});

caso('chaveDeDuplicata ignora caixa, acento e espacos', () => {
    return modulo.chaveDeDuplicata('  São   Paulo Bold ') === 'sao paulo bold'
        && modulo.chaveDeDuplicata('SAO PAULO BOLD') === 'sao paulo bold';
});

(async () => {
    let falhas = 0;
    for (const [nome, fn] of casos) {
        let ok = false;
        try { ok = await fn(); } catch (e) { console.error(`  erro em "${nome}":`, e.message); }
        if (!ok) { falhas++; console.error(`FALHOU: ${nome}`); }
        else console.log(`ok: ${nome}`);
    }
    if (falhas) { console.error(`${falhas} caso(s) falharam`); process.exit(1); }
    console.log(`${casos.length} casos passaram`);
})();
```

Criar `tests/FonteNome.Tests.ps1`:

```powershell
# O nome da fonte sai de DENTRO do arquivo (tabela `name` do sfnt), nao da
# digitacao do usuario. O harness node monta TTFs minimos em memoria e confere
# a extracao, o fallback para o nome do arquivo e a chave de duplicata.

Describe 'fonte-nome.js -- extracao do nome' {
    It 'tem o node disponivel' {
        $node = Get-Command node -ErrorAction SilentlyContinue
        ($null -ne $node) | Should Be $true
    }
    It 'passa todos os casos do harness' {
        $saida = & node "$PSScriptRoot\fonte_nome_harness.js" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "harness falhou:`n$saida" }
        $LASTEXITCODE | Should Be 0
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Invoke-Pester -Path tests\FonteNome.Tests.ps1`
Expected: falha — `frontend/fonte-nome.js` não existe (`Cannot find module`).

- [ ] **Step 3: Escrever o `frontend/fonte-nome.js`**

```js
/**
 * O nome da fonte sai de dentro do arquivo — nao da digitacao.
 * ---------------------------------------------------------------------------
 *
 * Antes, cadastrar fonte exigia digitar "Nome" e "Familia CSS" a mao, um
 * arquivo por vez. Digitacao manual produzia nome != familia — e como o font
 * picker grava `f.nome` no elemento enquanto o @font-face declara
 * `f.font_family`, o desvio fazia a tela desenhar com fonte generica em
 * maquina sem a fonte instalada.
 *
 * Este modulo le a tabela `name` do proprio binario (TTF, OTF, TTC e WOFF;
 * WOFF2 usa Brotli e fica de fora) e devolve UMA string — "Gotham Book",
 * "Arial Bold" — que o cadastro usa como `nome` E como `font_family`.
 * Se qualquer coisa der errado, cai para o nome do arquivo limpo: cadastrar
 * com nome imperfeito e melhor que travar o lote.
 *
 * Sem dependencias e sem tocar em `document`: roda no Node do harness de
 * testes (tests/fonte_nome_harness.js) igual roda no navegador.
 */
(function (escopo) {
    'use strict';

    // ── leitura big-endian sobre Uint8Array ────────────────────────────────
    const u16 = (b, o) => (b[o] << 8) | b[o + 1];
    const u32 = (b, o) => (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
    const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

    function decodificaUtf16be(bytes) {
        let s = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        return s;
    }

    function decodificaLatin1(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return s;
    }

    // ── a tabela `name` ─────────────────────────────────────────────────────
    //
    // Devolve { nameID: texto } escolhendo, por nameID, o registro de maior
    // confianca: Windows/Unicode em ingles (3/1 ou 3/10, lang 0x0409) >
    // Windows/Unicode em qualquer lingua ou Unicode puro (platform 0) >
    // Macintosh Roman (1/0). Outras combinacoes sao ignoradas.
    function lerTabelaName(b) {
        const count = u16(b, 2);
        const stringOffset = u16(b, 4);
        const melhor = {}; // nameID -> {prio, texto}
        for (let i = 0; i < count; i++) {
            const off = 6 + i * 12;
            if (off + 12 > b.length) break;
            const platform = u16(b, off);
            const encoding = u16(b, off + 2);
            const language = u16(b, off + 4);
            const nameID   = u16(b, off + 6);
            const tamanho  = u16(b, off + 8);
            const inicio   = stringOffset + u16(b, off + 10);
            if (inicio + tamanho > b.length) continue;
            const bytes = b.subarray(inicio, inicio + tamanho);

            let texto, prio;
            if (platform === 3 && (encoding === 1 || encoding === 10)) {
                texto = decodificaUtf16be(bytes);
                prio = language === 0x0409 ? 3 : 2;
            } else if (platform === 0) {
                texto = decodificaUtf16be(bytes);
                prio = 2;
            } else if (platform === 1 && encoding === 0) {
                texto = decodificaLatin1(bytes);
                prio = 1;
            } else {
                continue;
            }
            texto = texto.replace(/\u0000/g, '').trim();
            if (!texto) continue;
            if (!melhor[nameID] || prio > melhor[nameID].prio) melhor[nameID] = { prio, texto };
        }
        const nomes = {};
        for (const id of Object.keys(melhor)) nomes[id] = melhor[id].texto;
        return nomes;
    }

    // ── achar a tabela `name` dentro do container ──────────────────────────

    function tabelaNameDoSfnt(b, base) {
        const numTables = u16(b, base + 4);
        for (let i = 0; i < numTables; i++) {
            const off = base + 12 + i * 16;
            if (tag(b, off) === 'name') {
                const inicio = u32(b, off + 8);
                const tamanho = u32(b, off + 12);
                return b.subarray(inicio, inicio + tamanho);
            }
        }
        return null;
    }

    async function inflar(bytes) {
        // WOFF comprime tabelas em zlib; 'deflate' do Streams API e zlib.
        const ds = new DecompressionStream('deflate');
        const resposta = new Response(new Blob([bytes]).stream().pipeThrough(ds));
        return new Uint8Array(await resposta.arrayBuffer());
    }

    async function tabelaNameDoWoff(b) {
        const numTables = u16(b, 12);
        for (let i = 0; i < numTables; i++) {
            const off = 44 + i * 20;
            if (tag(b, off) !== 'name') continue;
            const inicio = u32(b, off + 4);
            const compLen = u32(b, off + 8);
            const origLen = u32(b, off + 12);
            const fatia = b.subarray(inicio, inicio + compLen);
            return compLen < origLen ? await inflar(fatia) : fatia;
        }
        return null;
    }

    // ── API ─────────────────────────────────────────────────────────────────

    function nomeDoArquivoLimpo(nomeDoArquivo) {
        const semExt = String(nomeDoArquivo || '').replace(/\.[a-z0-9]+$/i, '');
        const palavras = semExt.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
        return palavras
            .map(p => p ? p.charAt(0).toUpperCase() + p.slice(1) : p)
            .join(' ') || 'Fonte sem nome';
    }

    // Minusculas, sem acento, espacos colapsados: a chave que decide se duas
    // fontes "sao a mesma" na hora de pular duplicata.
    function chaveDeDuplicata(nome) {
        return String(nome || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/\s+/g, ' ').trim();
    }

    async function nomeDaFonte(dados, nomeDoArquivo) {
        try {
            const b = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
            const assinatura = tag(b, 0);

            let tabela = null;
            if (assinatura === 'wOFF') {
                tabela = await tabelaNameDoWoff(b);
            } else if (assinatura === 'ttcf') {
                // Colecao TrueType: vale a primeira fonte da colecao.
                tabela = tabelaNameDoSfnt(b, u32(b, 12));
            } else if (u32(b, 0) === 0x00010000 || assinatura === 'OTTO' || assinatura === 'true') {
                tabela = tabelaNameDoSfnt(b, 0);
            }
            // wOF2 (WOFF2) cai aqui: Brotli nao da para abrir sem biblioteca.
            if (!tabela) return nomeDoArquivoLimpo(nomeDoArquivo);

            const nomes = lerTabelaName(tabela);
            let familia = nomes[16] || nomes[1];
            if (!familia) return nomeDoArquivoLimpo(nomeDoArquivo);
            const sub = nomes[17] || nomes[2];
            if (sub && !/^(regular|normal)$/i.test(sub)
                && !chaveDeDuplicata(familia).endsWith(chaveDeDuplicata(sub))) {
                familia += ' ' + sub;
            }
            return familia;
        } catch (e) {
            return nomeDoArquivoLimpo(nomeDoArquivo);
        }
    }

    escopo.nomeDaFonte = nomeDaFonte;
    escopo.nomeDoArquivoLimpo = nomeDoArquivoLimpo;
    escopo.chaveDeDuplicata = chaveDeDuplicata;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { nomeDaFonte, nomeDoArquivoLimpo, chaveDeDuplicata };
    }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node tests\fonte_nome_harness.js` e depois `Invoke-Pester -Path tests\FonteNome.Tests.ps1`
Expected: todos os casos ok; Pester 2 passando.

- [ ] **Step 5: Commit**

```bash
git add frontend/fonte-nome.js tests/fonte_nome_harness.js tests/FonteNome.Tests.ps1
git commit -m "feat(fontes): fonte-nome.js le o nome de dentro do arquivo"
```

---

### Task 3: Upload em lote, sem digitação

**Files:**
- Modify: `frontend/index.html` (formulário ~linhas 692-717; includes de script ~linha 2631)
- Modify: `frontend/script.js` (função `salvarNovaFonteWeb`, ~linhas 298-365)
- Modify: `tests/CatalogoFontes.Tests.ps1` (novas guardas)

**Interfaces:**
- Consumes: `nomeDaFonte`, `chaveDeDuplicata` (globais do `fonte-nome.js`, Task 2).
- Produces: `salvarNovaFonteWeb()` sem parâmetros (mesmo nome, agora em lote); div `#fonte-upload-resultado` com o resumo.

- [ ] **Step 1: Escrever as guardas que falham**

Acrescentar ao `tests/CatalogoFontes.Tests.ps1`:

```powershell
$html = Get-Content "$repo\frontend\index.html" -Raw

Describe 'catalogo de fontes -- upload em lote, sem digitacao' {
    It 'nao existe mais campo para digitar o nome' {
        ($html -match 'id="fonte-name"') | Should Be $false
    }
    It 'nao existe mais campo para digitar a familia CSS' {
        ($html -match 'id="fonte-family"') | Should Be $false
    }
    It 'o input de arquivo aceita varios de uma vez' {
        ($html -match 'id="fonte-file"[^>]*multiple') | Should Be $true
    }
    It 'a pagina carrega o fonte-nome.js antes do script.js' {
        $iNome   = $html.IndexOf('fonte-nome.js')
        $iScript = $html.IndexOf('script.js')
        ($iNome -ge 0 -and $iNome -lt $iScript) | Should Be $true
    }
    It 'ha lugar para o resultado do lote aparecer na tela' {
        ($html -match 'id="fonte-upload-resultado"') | Should Be $true
    }
    It 'o cadastro usa o nome extraido como nome E familia' {
        $js2 = Get-Content "$repo\frontend\script.js" -Raw
        ($js2 -match 'font_family:\s*nome') | Should Be $true
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: as 6 guardas novas falham; as 2 da Task 1 passam.

- [ ] **Step 3: Trocar o formulário no `index.html`**

Substituir o bloco do card "Cadastrar Nova Fonte" (as cinco `form-group` dentro do `form-grid`, linhas ~696-716) por:

```html
                    <div class="form-grid" style="grid-template-columns: 2fr 1fr auto;">
                        <div class="form-group">
                            <label>Arquivos de fonte (.ttf, .otf, .woff) — pode selecionar vários</label>
                            <input type="file" class="form-control" id="fonte-file" accept=".ttf,.otf,.woff,.woff2" multiple>
                        </div>
                        <div class="form-group">
                            <label>Categoria (opcional)</label>
                            <input type="text" class="form-control" id="fonte-categoria" placeholder="Ex: Geral, Moderna" value="Geral">
                        </div>
                        <div class="form-group" style="display:flex; align-items:flex-end;">
                            <button class="btn btn-primary" onclick="salvarNovaFonteWeb()" id="btn-salvar-fonte">📤 Carregar Fontes</button>
                        </div>
                    </div>
                    <p style="margin:8px 0 0; color:var(--text-dim); font-size:0.85rem;">
                        O nome de cada fonte é lido de dentro do próprio arquivo — não precisa digitar nada.
                        Fontes com nome já cadastrado são puladas.
                    </p>
                    <div id="fonte-upload-resultado" style="display:none; margin-top:12px; padding:10px 12px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; font-size:0.9rem;"></div>
```

E acrescentar o include, logo após o `fonte-canvas.js` (~linha 2631):

```html
    <script src="fonte-nome.js?v=566"></script>
```

- [ ] **Step 4: Reescrever `salvarNovaFonteWeb` no `script.js`**

Substituir a função inteira (linhas ~298-365) por:

```js
// Upload em lote: o nome sai de dentro de cada arquivo (fonte-nome.js), a
// digitacao acabou. Duplicata (mesmo nome ja no catalogo ou repetido dentro do
// proprio lote) e PULADA, nunca substituida — substituir trocaria em silencio o
// binario de uma fonte ja usada em artes aprovadas.
async function salvarNovaFonteWeb() {
    const fileInput = document.getElementById('fonte-file');
    const categoria = (document.getElementById('fonte-categoria').value || '').trim() || 'Geral';
    const arquivos = Array.from((fileInput && fileInput.files) || []);

    if (!arquivos.length) {
        alert('Selecione um ou mais arquivos de fonte (.ttf, .otf, .woff).');
        return;
    }

    const btn = document.getElementById('btn-salvar-fonte');
    btn.disabled = true;

    // nome E font_family das entradas existentes contam como "ja existe"
    const chavesExistentes = new Set();
    for (const f of (state_fonts.catalogo || [])) {
        if (f.nome) chavesExistentes.add(chaveDeDuplicata(f.nome));
        if (f.font_family) chavesExistentes.add(chaveDeDuplicata(f.font_family));
    }

    const cadastradas = [], puladas = [], falhas = [];
    const apiBase = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

    for (let i = 0; i < arquivos.length; i++) {
        const arquivo = arquivos[i];
        btn.innerText = `⏳ ${i + 1}/${arquivos.length} — ${arquivo.name}`;
        try {
            const dados = await arquivo.arrayBuffer();
            const nome = await nomeDaFonte(dados, arquivo.name);
            const chave = chaveDeDuplicata(nome);
            if (chavesExistentes.has(chave)) {
                puladas.push(nome);
                continue;
            }

            const safeName = arquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `fontes/${Date.now()}_${i}_${safeName}`;
            const { error: uploadError } = await supabaseClient.storage
                .from('chat-ideal')
                .upload(storagePath, arquivo, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabaseClient.storage
                .from('chat-ideal')
                .getPublicUrl(storagePath);

            const res = await fetch(`${apiBase}/api/fontes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: nome,
                    font_family: nome,   // iguais de proposito: mata o desvio nome != familia
                    categoria: categoria,
                    arquivo_url: publicUrlData.publicUrl,
                    ativo: true
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar no banco`);

            chavesExistentes.add(chave); // repetido DENTRO do lote tambem pula
            cadastradas.push(nome);
        } catch (e) {
            console.error('[Fontes] Falha em', arquivo.name, e);
            falhas.push(`${arquivo.name}: ${e.message || e}`);
        }
    }

    fileInput.value = '';
    await loadCatalogoFontes(); // ja rerrenderiza a tabela e o badge

    // O resultado fica ESCRITO na tela, nao so num alert que some.
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const resumo = document.getElementById('fonte-upload-resultado');
    if (resumo) {
        const partes = [`<b>${cadastradas.length}</b> cadastrada(s)${cadastradas.length ? ': ' + esc(cadastradas.join(', ')) : ''}`];
        if (puladas.length) partes.push(`<b>${puladas.length}</b> pulada(s) — já existia(m): ${esc(puladas.join(', '))}`);
        if (falhas.length) partes.push(`<b>${falhas.length}</b> com erro: ${esc(falhas.join('; '))}`);
        resumo.innerHTML = partes.join('<br>');
        resumo.style.display = 'block';
    }

    btn.disabled = false;
    btn.innerText = '📤 Carregar Fontes';
}
window.salvarNovaFonteWeb = salvarNovaFonteWeb;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: 8 passando.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/script.js tests/CatalogoFontes.Tests.ps1
git commit -m "feat(fontes): upload em lote sem digitacao -- nome sai do arquivo, duplicata pula"
```

---

### Task 4: Ordem alfabética, busca e amostra

**Files:**
- Modify: `frontend/script.js` (`loadCatalogoFontes` ~linha 233; `renderCatFontesUI` ~linhas 269-296)
- Modify: `frontend/index.html` (card "Fontes Cadastradas", ~linhas 719-739)
- Modify: `tests/CatalogoFontes.Tests.ps1` (novas guardas)

**Interfaces:**
- Consumes: `chaveDeDuplicata` (Task 2) para normalizar o filtro da busca.
- Produces: `renderCatFontesUI()` continua sem parâmetros (o filtro é lido do input `#busca-fontes`).

- [ ] **Step 1: Escrever as guardas que falham**

Acrescentar ao `tests/CatalogoFontes.Tests.ps1`:

```powershell
Describe 'catalogo de fontes -- ordem, busca e amostra' {
    It 'o catalogo e ordenado por nome ao carregar' {
        $js2 = Get-Content "$repo\frontend\script.js" -Raw
        ($js2 -match "(?s)localeCompare\(.+?'pt-BR'") | Should Be $true
    }
    It 'existe o campo de busca da tabela' {
        ($html -match 'id="busca-fontes"') | Should Be $true
    }
    It 'a tabela tem coluna de amostra' {
        ($html -match '<th>AMOSTRA</th>') | Should Be $true
    }
}
```

(Obs.: `$html` já é lido no topo do arquivo pela Task 3; se a variável ainda
estiver antes do novo formulário, reler aqui com `Get-Content ... -Raw`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: as 3 novas falham.

- [ ] **Step 3: Ordenar no `loadCatalogoFontes`**

Em `frontend/script.js`, trocar:

```js
            const list = await res.json();
            state_fonts.catalogo = list || [];
```

por:

```js
            const list = await res.json();
            // Ordem alfabetica UMA vez, aqui: tabela, font picker e o select do
            // Criar Arte leem todos de state_fonts.catalogo e herdam a ordem.
            state_fonts.catalogo = (list || []).slice().sort((a, b) =>
                String(a.nome || a.font_family || '').localeCompare(
                    String(b.nome || b.font_family || ''), 'pt-BR', { sensitivity: 'base' }));
```

- [ ] **Step 4: Busca e amostra na tela**

No `index.html`, trocar o cabeçalho do card "Fontes Cadastradas" (linhas ~720-732) por:

```html
                    <div class="card-header" style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                        <span class="card-title"><span class="icon">🔤</span> Fontes Cadastradas</span>
                        <input type="text" class="form-control" id="busca-fontes"
                               placeholder="🔍 Buscar fonte por nome, família ou categoria..."
                               style="max-width:340px; margin-left:auto;"
                               oninput="renderCatFontesUI()">
                    </div>
                    <table class="data-table" id="table-fontes">
                        <thead>
                            <tr>
                                <th>NOME DA FONTE</th>
                                <th>AMOSTRA</th>
                                <th>CATEGORIA</th>
                                <th>STATUS</th>
                                <th class="text-right">AÇÕES</th>
                            </tr>
                        </thead>
```

No `script.js`, substituir `renderCatFontesUI` inteira por:

```js
// --- Fontes Web Manager ---
// O filtro vem do input #busca-fontes (quando existir); os chamadores antigos
// continuam chamando sem argumento. A amostra usa a propria fonte: o
// @font-face ja foi injetado pelo definirCatalogoFontes antes deste render.
function renderCatFontesUI() {
    const tbody = document.getElementById('tbody-fontes');
    const empty = document.getElementById('empty-fontes');
    if (!tbody || !empty) return;

    const campoBusca = document.getElementById('busca-fontes');
    const filtro = chaveDeDuplicata(campoBusca ? campoBusca.value : '');
    const todas = state_fonts.catalogo || [];
    const fontes = !filtro ? todas : todas.filter(f =>
        chaveDeDuplicata(f.nome).includes(filtro) ||
        chaveDeDuplicata(f.font_family).includes(filtro) ||
        chaveDeDuplicata(f.categoria || 'Geral').includes(filtro));

    if (!fontes.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        empty.querySelector('p').textContent = todas.length
            ? 'Nenhuma fonte encontrada para a busca.'
            : 'Nenhuma fonte cadastrada na biblioteca web.';
        return;
    }
    empty.style.display = 'none';

    let html = '';
    fontes.forEach(f => {
        const fam = String(f.font_family || f.nome || '').replace(/'/g, "\\'");
        html += `
            <tr>
                <td>
                    <div style="font-family: '${fam}', sans-serif; font-size: 1.1rem;">${f.nome}</div>
                    <code style="background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; color: var(--text-dim);">${f.font_family}</code>
                </td>
                <td style="font-family: '${fam}', sans-serif; font-size: 22px; white-space: nowrap;">AaBbCc 0123456789</td>
                <td><span class="badge" style="background: var(--gray-lighter); color: var(--text-dim);">${f.categoria || 'Geral'}</span></td>
                <td><span style="color: #10b981;">●</span> Ativo</td>
                <td class="text-right">
                    <button class="btn btn-sm" onclick="deletarFonteWeb('${f.id}')" style="color: var(--danger); background: #fee2e2; border: 1px solid #fca5a5;">🗑️ Excluir</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}
window.renderCatFontesUI = renderCatFontesUI;
```

(Nota: a função deixa de ser `async` — nunca teve `await`; nenhum chamador usa o retorno.)

- [ ] **Step 5: Rodar e ver passar**

Run: `Invoke-Pester -Path tests\CatalogoFontes.Tests.ps1`
Expected: 11 passando.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/script.js tests/CatalogoFontes.Tests.ps1
git commit -m "feat(fontes): ordem alfabetica, busca e amostra grande no catalogo"
```

---

### Task 5: Suíte inteira e conferência final

**Files:** nenhum novo.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `Invoke-Pester -Path tests` e `python -m pytest tests -q` (se o projeto roda os dois; `conferir.ps1` mostra o total esperado — eram 131 antes deste trabalho).
Expected: tudo verde, contagem maior que antes (novos testes).

- [ ] **Step 2: Conferir as garantias de não-regressão**

- `git diff main@{1}` (ou `git log --stat`) não pode tocar `app.py`, `engine.py`, `db.py`, `fonte-canvas.js`.
- `grep -n "fonte-name\|fonte-family" frontend/script.js` não pode ter sobras dos campos removidos.

- [ ] **Step 3: Lembrete de publicação (não publicar)**

Avisar o usuário: mudança de frontend → na próxima publicação, site e agente saem juntos (`.\publicar.ps1` + `.\publicar_agente.ps1 <versão nova>`). Publicar é ação do usuário.
