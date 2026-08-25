// Confere o fonte-glifos.js fora do navegador: monta fontes TTF minimas em
// memoria (cabecalho sfnt + tabela `cmap`) e verifica quais caracteres ele diz
// que a fonte desenha.
//
// O caso que da nome a tudo isto e o ultimo bloco: uma fonte que cobre a faixa
// latina inteira MENOS `ř`, `ě` e `č` — que e o retrato da Gotham Book do
// catalogo, medida no pedido 21146.
//
// Roda em node: `node tests/fonte_glifos_harness.js`. Sai com codigo 1 na falha.

const path = require('path');
const modulo = require(path.join(__dirname, '..', 'frontend', 'fonte-glifos.js'));
const {
    coberturaDaFonte, coberturaBase14, temGlifo,
    faltamNaFonte, textoComoSaiNoPapel, rotuloDoCaractere,
} = modulo;

// ── construtor de fonte de brinquedo ────────────────────────────────────────

function bytesU16(v) { return [(v >> 8) & 0xff, v & 0xff]; }
function bytesU32(v) {
    return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

/**
 * cmap formato 4 a partir de segmentos.
 * Cada segmento: { ini, fim, delta } (idRangeOffset 0) ou
 *                { ini, fim, glifos: [...] } (idRangeOffset, com buracos onde
 *                o glifo for 0 — o caso que interessa).
 */
function subTabelaFormato4(segmentos) {
    // O segmento final 0xFFFF e obrigatorio pela especificacao.
    const segs = segmentos.concat([{ ini: 0xffff, fim: 0xffff, delta: 1 }]);
    const n = segs.length;
    const oFim = 14;
    const oIni = oFim + n * 2 + 2;
    const oDelta = oIni + n * 2;
    const oRange = oDelta + n * 2;
    const glyphArray = [];

    const rangeOffsets = [];
    for (let s = 0; s < n; s++) {
        if (!segs[s].glifos) { rangeOffsets.push(0); continue; }
        // Distancia, EM BYTES, da propria casa de idRangeOffset ate onde os
        // glifos deste segmento comecam no glyphIdArray.
        const daquiAteOFimDoRange = (n - s) * 2;
        rangeOffsets.push(daquiAteOFimDoRange + glyphArray.length * 2);
        glyphArray.push(...segs[s].glifos);
    }

    const corpo = [];
    segs.forEach(s => corpo.push(...bytesU16(s.fim)));
    corpo.push(...bytesU16(0));                                  // reservedPad
    segs.forEach(s => corpo.push(...bytesU16(s.ini)));
    segs.forEach(s => corpo.push(...bytesU16(s.delta || 0)));
    rangeOffsets.forEach(r => corpo.push(...bytesU16(r)));
    glyphArray.forEach(g => corpo.push(...bytesU16(g)));

    const tamanho = 14 + corpo.length;
    return [
        ...bytesU16(4), ...bytesU16(tamanho), ...bytesU16(0),
        ...bytesU16(n * 2), ...bytesU16(0), ...bytesU16(0), ...bytesU16(0),
        ...corpo,
    ];
}

/** cmap formato 12 a partir de grupos { ini, fim, glifoIni }. */
function subTabelaFormato12(grupos) {
    const corpo = [];
    grupos.forEach(g => corpo.push(
        ...bytesU32(g.ini), ...bytesU32(g.fim), ...bytesU32(g.glifoIni)));
    return [
        ...bytesU16(12), ...bytesU16(0),
        ...bytesU32(16 + corpo.length), ...bytesU32(0),
        ...bytesU32(grupos.length), ...corpo,
    ];
}

/** cmap formato 6: faixa contigua a partir de `primeiro`. */
function subTabelaFormato6(primeiro, glifos) {
    const corpo = [];
    glifos.forEach(g => corpo.push(...bytesU16(g)));
    return [
        ...bytesU16(6), ...bytesU16(10 + corpo.length), ...bytesU16(0),
        ...bytesU16(primeiro), ...bytesU16(glifos.length), ...corpo,
    ];
}

/** Tabela cmap com N sub-tabelas: [{plataforma, codificacao, sub}]. */
function montarCmap(entradas) {
    const cabecalho = [...bytesU16(0), ...bytesU16(entradas.length)];
    let desvio = 4 + entradas.length * 8;
    const registros = [];
    const subs = [];
    for (const e of entradas) {
        registros.push(...bytesU16(e.plataforma), ...bytesU16(e.codificacao), ...bytesU32(desvio));
        subs.push(...e.sub);
        desvio += e.sub.length;
    }
    return Uint8Array.from([...cabecalho, ...registros, ...subs]);
}

/** TTF com uma unica tabela, a `cmap`. */
function montarTTF(cmap) {
    const cabecalho = [
        ...bytesU32(0x00010000),
        ...bytesU16(1), ...bytesU16(0), ...bytesU16(0), ...bytesU16(0),
        0x63, 0x6d, 0x61, 0x70,                    // tag 'cmap'
        ...bytesU32(0),                            // checksum (ignorado)
        ...bytesU32(28),                           // offset: 12 + 16
        ...bytesU32(cmap.length),
    ];
    return Uint8Array.from([...cabecalho, ...cmap]);
}

function fonteFormato4(segmentos, plataforma, codificacao) {
    return montarTTF(montarCmap([{
        plataforma: plataforma === undefined ? 3 : plataforma,
        codificacao: codificacao === undefined ? 1 : codificacao,
        sub: subTabelaFormato4(segmentos),
    }]));
}

// ── mini arcabouco de teste (padrao dos outros harnesses) ───────────────────

const casos = [];
function caso(nome, fn) { casos.push([nome, fn]); }

function ok(cond, msg) { if (!cond) throw new Error(msg || 'esperava verdadeiro'); }
function igual(a, b, msg) {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg || 'diferente') + ': ' + sa + ' != ' + sb);
}

// ── casos: leitura do cmap ──────────────────────────────────────────────────

caso('formato 4 sem idRangeOffset cobre a faixa declarada', async () => {
    const cob = await coberturaDaFonte(fonteFormato4([{ ini: 0x41, fim: 0x5a, delta: 100 }]));
    ok(cob, 'nao leu a fonte');
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(temGlifo(cob, 0x5a), 'faltou o Z');
    ok(!temGlifo(cob, 0x40), 'cobriu o @, que esta fora da faixa');
    ok(!temGlifo(cob, 0x5b), 'cobriu o [, que esta fora da faixa');
});

caso('formato 4 com idRangeOffset enxerga o BURACO no meio do segmento', async () => {
    // A-E declarados, mas o C aponta para o glifo 0: nao existe.
    const cob = await coberturaDaFonte(fonteFormato4([
        { ini: 0x41, fim: 0x45, glifos: [10, 11, 0, 13, 14] },
    ]));
    ok(cob, 'nao leu a fonte');
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(temGlifo(cob, 0x42), 'faltou o B');
    ok(!temGlifo(cob, 0x43), 'o C aponta para o glifo 0 e NAO deveria contar');
    ok(temGlifo(cob, 0x44), 'faltou o D');
    ok(temGlifo(cob, 0x45), 'faltou o E');
});

caso('formato 12 le faixas de 32 bits', async () => {
    const fonte = montarTTF(montarCmap([{
        plataforma: 3, codificacao: 10,
        sub: subTabelaFormato12([
            { ini: 0x20, fim: 0x7e, glifoIni: 3 },
            { ini: 0x1f600, fim: 0x1f64f, glifoIni: 500 },
        ]),
    }]));
    const cob = await coberturaDaFonte(fonte);
    ok(cob, 'nao leu a fonte');
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(temGlifo(cob, 0x1f600), 'faltou o emoji fora do BMP');
    ok(!temGlifo(cob, 0x1f700), 'cobriu code point fora dos grupos');
});

caso('formato 12 ignora grupo que comeca no glifo 0', async () => {
    const fonte = montarTTF(montarCmap([{
        plataforma: 3, codificacao: 10,
        sub: subTabelaFormato12([
            { ini: 0x41, fim: 0x5a, glifoIni: 3 },
            { ini: 0x100, fim: 0x17f, glifoIni: 0 },
        ]),
    }]));
    const cob = await coberturaDaFonte(fonte);
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(!temGlifo(cob, 0x159), 'grupo com glifoIni 0 nao cobre nada');
});

caso('formato 6 cobre a faixa contigua e pula o glifo 0', async () => {
    const fonte = montarTTF(montarCmap([{
        plataforma: 1, codificacao: 0,
        sub: subTabelaFormato6(0x41, [10, 0, 12]),
    }]));
    const cob = await coberturaDaFonte(fonte);
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(!temGlifo(cob, 0x42), 'o B aponta para o glifo 0');
    ok(temGlifo(cob, 0x43), 'faltou o C');
});

caso('entre duas sub-tabelas vence a de Unicode completo', async () => {
    // A (3,1) diz que so tem A-Z; a (3,10) tem tambem o emoji. Vale a segunda.
    const fonte = montarTTF(montarCmap([
        { plataforma: 3, codificacao: 1, sub: subTabelaFormato4([{ ini: 0x41, fim: 0x5a, delta: 1 }]) },
        {
            plataforma: 3, codificacao: 10,
            sub: subTabelaFormato12([
                { ini: 0x41, fim: 0x5a, glifoIni: 3 },
                { ini: 0x1f600, fim: 0x1f600, glifoIni: 99 },
            ]),
        },
    ]));
    const cob = await coberturaDaFonte(fonte);
    ok(temGlifo(cob, 0x1f600), 'nao escolheu a sub-tabela de Unicode completo');
});

// ── casos: a regra de ouro ──────────────────────────────────────────────────

caso('binario que nao da para ler devolve null, nao "nao tem"', async () => {
    igual(await coberturaDaFonte(Uint8Array.from([1, 2, 3])), null, 'binario curto');
    igual(await coberturaDaFonte(new Uint8Array(200)), null, 'binario sem assinatura');
    // wOF2: Brotli, fora do alcance deste parser.
    const woff2 = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, ...new Array(100).fill(0)]);
    igual(await coberturaDaFonte(woff2), null, 'WOFF2 deveria ser desconhecida');
});

caso('cobertura desconhecida NAO acusa caractere nenhum', () => {
    igual(faltamNaFonte(null, 'Ondřej Pek'), [], 'null acusou');
    igual(faltamNaFonte(undefined, 'Ondřej Pek'), [], 'undefined acusou');
    igual(faltamNaFonte({}, 'Ondřej Pek'), [], 'objeto sem faixas acusou');
    igual(textoComoSaiNoPapel('Ondřej Pek', null), 'Ondřej Pek', 'null mexeu no texto');
});

// ── casos: as perguntas que as telas fazem ──────────────────────────────────

// O retrato da Gotham Book: latino completo, menos os tres carons tchecos.
async function fonteComoAGotham() {
    return await coberturaDaFonte(fonteFormato4([
        { ini: 0x20, fim: 0x7e, delta: 3 },
        { ini: 0xa0, fim: 0xff, delta: 3 },
        // 0x100-0x17f com buracos exatamente em č (0x10d), ě (0x11b) e ř (0x159)
        {
            ini: 0x100, fim: 0x17f,
            glifos: Array.from({ length: 0x80 }, (_, i) => {
                const cp = 0x100 + i;
                return (cp === 0x10d || cp === 0x11b || cp === 0x159) ? 0 : 200 + i;
            }),
        },
    ]));
}

caso('a fonte tipo Gotham acusa exatamente ř, ě e č', async () => {
    const cob = await fonteComoAGotham();
    ok(temGlifo(cob, 0x160), 'o Š deveria existir (e existe na Gotham)');
    ok(temGlifo(cob, 0x17e), 'o ž deveria existir (e existe na Gotham)');
    ok(temGlifo(cob, 0xe1), 'o á deveria existir');
    igual(faltamNaFonte(cob, 'Ondřej Pek'), ['ř'], 'Ondřej');
    igual(faltamNaFonte(cob, 'Vojtěch Šefl'), ['ě'], 'Vojtěch');
    igual(faltamNaFonte(cob, 'Václav Wočadlo'), ['č'], 'Václav');
    igual(faltamNaFonte(cob, 'Klára Bláhová'), [], 'Klára sai inteira');
    igual(faltamNaFonte(cob, 'Alžběta Kaplanová'), ['ě'], 'Alžběta');
});

caso('o caractere que falta so aparece uma vez na lista', async () => {
    const cob = await fonteComoAGotham();
    igual(faltamNaFonte(cob, 'řřř ěě'), ['ř', 'ě'], 'repetiu');
});

caso('quebra de linha e tabulacao nao sao cobradas', async () => {
    const cob = await fonteComoAGotham();
    igual(faltamNaFonte(cob, 'Ana\nMaria\tSilva'), [], 'acusou separador');
    igual(textoComoSaiNoPapel('Ana\nMaria', cob), 'Ana\nMaria', 'comeu a quebra de linha');
});

caso('a previa mostra o buraco que o papel mostra', async () => {
    const cob = await fonteComoAGotham();
    igual(textoComoSaiNoPapel('Ondřej Pek', cob), 'Ond ej Pek', 'Ondřej');
    igual(textoComoSaiNoPapel('Václav Wočadlo', cob), 'Václav Wo adlo', 'Václav');
    igual(textoComoSaiNoPapel('Klára Bláhová', cob), 'Klára Bláhová', 'Klára mudou sem precisar');
});

// ── casos: as Base-14 do PDF ────────────────────────────────────────────────

caso('helv e as outras Base-14 cobrem o cp1252 e mais nada', () => {
    const cob = coberturaBase14('helv');
    ok(cob, 'helv deveria ter cobertura conhecida');
    ok(temGlifo(cob, 0x41), 'faltou o A');
    ok(temGlifo(cob, 0xe7), 'faltou o ç, que o cp1252 tem');
    ok(temGlifo(cob, 0x20ac), 'faltou o euro, que o cp1252 tem');
    ok(temGlifo(cob, 0x160), 'faltou o Š, que o cp1252 tem');
    ok(!temGlifo(cob, 0x159), 'o ř nao esta no cp1252');
    ok(!temGlifo(cob, 0x11b), 'o ě nao esta no cp1252');
    ok(!temGlifo(cob, 0x10d), 'o č nao esta no cp1252');
    igual(faltamNaFonte(cob, 'Ondřej Pek'), ['ř'], 'helv com nome tcheco');
});

caso('todos os seis apelidos Base-14 sao reconhecidos', () => {
    for (const n of ['helv', 'helv-bold', 'times', 'times-bold', 'cour', 'cour-bold']) {
        ok(coberturaBase14(n), n + ' deveria ser Base-14');
    }
    ok(coberturaBase14('HELV'), 'o reconhecimento ignora caixa');
});

caso('fonte do sistema e fonte do catalogo NAO sao Base-14', () => {
    igual(coberturaBase14('system:Arial|bold'), null, 'system: virou Base-14');
    igual(coberturaBase14('gotham book'), null, 'catalogo virou Base-14');
    igual(coberturaBase14(''), null, 'vazio virou Base-14');
    igual(coberturaBase14(null), null, 'null virou Base-14');
});

// ── caso: o rotulo do aviso ─────────────────────────────────────────────────

caso('o rotulo mostra o sinal e o codigo Unicode', () => {
    igual(rotuloDoCaractere('ř'), '"ř" (U+0159)', 'ř');
    igual(rotuloDoCaractere('ě'), '"ě" (U+011B)', 'ě');
    igual(rotuloDoCaractere('A'), '"A" (U+0041)', 'A');
});

// ── casos: o cache das coberturas ───────────────────────────────────────────

const {
    garantirCoberturas, mapaDeCoberturas, coberturaJaLida, coberturaFoiPerguntada,
} = modulo;

// Um catalogo de mentira com uma fonte que tem A-Z e nada mais.
const BYTES_AZ = fonteFormato4([{ ini: 0x41, fim: 0x5a, delta: 100 }]);
function catalogoDeMentira() {
    return [
        { nome: 'Fonte AZ', font_family: 'Fonte AZ', arquivo_url: 'http://exemplo/az.ttf' },
        { nome: 'Fonte Torta', font_family: 'Fonte Torta', arquivo_url: 'http://exemplo/torta.ttf' },
        { nome: 'Fonte Fora do Ar', font_family: 'Fonte Fora do Ar', arquivo_url: 'http://exemplo/erro.ttf' },
    ];
}

caso('garantirCoberturas baixa do catalogo e guarda no cache', async () => {
    let idas = 0;
    const buscarBytes = async (url) => {
        idas++;
        if (url.endsWith('az.ttf')) return BYTES_AZ;
        if (url.endsWith('torta.ttf')) return Uint8Array.from([9, 9, 9]);
        throw new Error('fora do ar');
    };
    const catalogo = catalogoDeMentira();

    await garantirCoberturas(['Fonte AZ'], { catalogo, buscarBytes });
    ok(coberturaFoiPerguntada('Fonte AZ'), 'nao registrou que perguntou');
    ok(temGlifo(coberturaJaLida('Fonte AZ'), 0x41), 'nao leu o A');
    igual(faltamNaFonte(coberturaJaLida('Fonte AZ'), 'ABZ'), [], 'acusou letra que existe');
    igual(faltamNaFonte(coberturaJaLida('Fonte AZ'), 'Aç'), ['ç'], 'nao acusou o ç');
    igual(idas, 1, 'baixou mais de uma vez');

    // Segunda pergunta pela MESMA fonte nao volta a rede.
    await garantirCoberturas(['Fonte AZ', 'fonte az', 'FONTE AZ'], { catalogo, buscarBytes });
    igual(idas, 1, 'o cache nao segurou a segunda pergunta');
});

caso('arquivo torto e download que falha viram DESCONHECIDA, e nao acusam', async () => {
    const buscarBytes = async (url) => {
        if (url.endsWith('torta.ttf')) return Uint8Array.from([9, 9, 9]);
        throw new Error('fora do ar');
    };
    const catalogo = catalogoDeMentira();
    await garantirCoberturas(['Fonte Torta', 'Fonte Fora do Ar'], { catalogo, buscarBytes });

    ok(coberturaFoiPerguntada('Fonte Torta'), 'nao registrou a pergunta da torta');
    ok(coberturaFoiPerguntada('Fonte Fora do Ar'), 'nao registrou a pergunta da que falhou');
    igual(coberturaJaLida('Fonte Torta'), null, 'a torta deveria ser desconhecida');
    igual(coberturaJaLida('Fonte Fora do Ar'), null, 'a que falhou deveria ser desconhecida');
    igual(faltamNaFonte(coberturaJaLida('Fonte Torta'), 'Ondřej'), [], 'a torta acusou');
});

caso('fonte que nao esta no catalogo fica desconhecida sem ir a rede', async () => {
    let idas = 0;
    const buscarBytes = async () => { idas++; return BYTES_AZ; };
    await garantirCoberturas(['system:Arial|bold'], { catalogo: catalogoDeMentira(), buscarBytes });
    igual(idas, 0, 'foi a rede por uma fonte do sistema');
    ok(coberturaFoiPerguntada('system:Arial|bold'), 'nao registrou a pergunta');
    igual(coberturaJaLida('system:Arial|bold'), null, 'system: deveria ser desconhecida');
});

caso('as Base-14 se resolvem sem download', async () => {
    let idas = 0;
    const buscarBytes = async () => { idas++; return BYTES_AZ; };
    await garantirCoberturas(['helv', 'times-bold'], { catalogo: [], buscarBytes });
    igual(idas, 0, 'foi a rede por uma Base-14');
    ok(temGlifo(coberturaJaLida('helv'), 0xe7), 'helv perdeu o ç');
    igual(faltamNaFonte(coberturaJaLida('times-bold'), 'Ondřej'), ['ř'], 'times-bold nao acusou o ř');
});

caso('o mapa de coberturas e o que as funcoes puras recebem', async () => {
    const mapa = mapaDeCoberturas();
    ok(mapa['fonte az'], 'a Fonte AZ nao esta no mapa');
    ok(Object.prototype.hasOwnProperty.call(mapa, 'fonte torta'), 'a torta nao esta no mapa');
    igual(mapa['fonte torta'], null, 'a torta deveria estar no mapa como null');
});

// ── execucao ────────────────────────────────────────────────────────────────

(async () => {
    let falhas = 0;
    for (const [nome, fn] of casos) {
        try {
            await fn();
        } catch (e) {
            falhas++;
            console.error('FALHOU: ' + nome + '\n   ' + (e && e.message));
        }
    }
    if (falhas) {
        console.error('\n' + falhas + ' de ' + casos.length + ' caso(s) falharam.');
        process.exit(1);
    }
    console.log('OK: ' + casos.length + ' caso(s) do fonte-glifos passaram.');
})();
