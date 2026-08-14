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
            texto = texto.replace(/\u0000/g, '').trim(); // NUL sobra de decodificacao torta
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
