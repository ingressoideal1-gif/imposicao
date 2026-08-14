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
