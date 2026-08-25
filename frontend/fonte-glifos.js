/**
 * Quais caracteres uma fonte sabe desenhar — lidos do proprio arquivo.
 * ---------------------------------------------------------------------------
 *
 * ── O defeito que este arquivo existe para impedir ─────────────────────────
 *
 * Quando falta um caractere na fonte, o NAVEGADOR troca de fonte so naquele
 * caractere, em silencio, e a tela mostra o nome inteiro. O PyMuPDF nao faz
 * isso: desenha o que a fonte tem e deixa o buraco. Mesmo dado, mesma fonte,
 * dois resultados — e o unico que o operador ve antes de imprimir e o que
 * mente.
 *
 * Medido em 25/08/2026, no pedido 21146 (credenciais do FITNP/FIDAF): a
 * Gotham Book nao tem `ř`, `ě` nem `č`. A amostra que o cliente APROVOU mostra
 * "Ondřej Pek"; o PDF gerado com a mesma fonte volta "Ond ej Pek". Oito dos
 * dez nomes tchecos daquele modelo sairiam furados.
 *
 * E nao foi a primeira vez. O pedido 20495, da mesma cliente e do mesmo
 * evento, imprimiu 185 credenciais em 11/08 com as mesmas fontes e os mesmos
 * nomes — e dois modelos voltaram REPROVADA_CLIENTE. O 21146 e o retrabalho
 * deles, e ia repetir o erro.
 *
 * Nao e azar com uma fonte: das 273 fontes ativas do catalogo, 173 nao
 * conseguem imprimir aquela planilha. As que conseguem sao quase todas fontes
 * do Windows; as de marca (Gotham, Swis721, Swiss 911, Bodoni, Abril Fatface)
 * falham em bloco. Escolher fonte para evento internacional e, hoje, apostar
 * as cegas.
 *
 * ── A regra de ouro deste modulo ───────────────────────────────────────────
 *
 * FONTE QUE NAO DEU PARA LER NAO ACUSA NINGUEM. Toda funcao daqui devolve
 * "nao falta nada" quando a cobertura e desconhecida — WOFF2 (Brotli), fonte
 * do sistema, arquivo que nao baixou, binario torto. Uma trava falsa pararia
 * a grafica por causa de um arquivo que este parser nao entendeu, e isso e
 * pior do que o defeito que ele conserta.
 *
 * Sem dependencias e sem tocar em `document`: roda no Node do harness
 * (tests/fonte_glifos_harness.js) igual roda no navegador, como o
 * `fonte-nome.js` ao lado.
 */
(function (escopo) {
    'use strict';

    // ── leitura big-endian sobre Uint8Array (igual ao fonte-nome.js) ───────
    const u16 = (b, o) => (b[o] << 8) | b[o + 1];
    const u32 = (b, o) => (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
    const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

    // ── faixas ─────────────────────────────────────────────────────────────
    //
    // A cobertura e uma lista ORDENADA e DISJUNTA de faixas [inicio, fim] de
    // code points. Faixa, e nao conjunto: uma fonte CJK com formato 12 mapeia
    // dezenas de milhares de code points em poucos grupos, e guardar cada um
    // deles seria trocar 4 numeros por 40 mil.

    function faixasDeConjunto(conjunto) {
        const cps = [...conjunto].sort((a, b) => a - b);
        const faixas = [];
        for (const cp of cps) {
            const ultima = faixas[faixas.length - 1];
            if (ultima && cp === ultima[1] + 1) ultima[1] = cp;
            else faixas.push([cp, cp]);
        }
        return faixas;
    }

    function normalizarFaixas(faixas) {
        const ordenadas = faixas
            .filter(f => f && f[1] >= f[0])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const saida = [];
        for (const f of ordenadas) {
            const ultima = saida[saida.length - 1];
            // `+ 1` junta faixas encostadas ([32,126] e [127,160] viram uma so).
            if (ultima && f[0] <= ultima[1] + 1) ultima[1] = Math.max(ultima[1], f[1]);
            else saida.push([f[0], f[1]]);
        }
        return saida;
    }

    /** A pergunta que interessa: esta fonte desenha este code point? */
    function temGlifo(cobertura, cp) {
        const faixas = cobertura && cobertura.faixas;
        if (!faixas || !faixas.length) return false;
        let lo = 0;
        let hi = faixas.length - 1;
        while (lo <= hi) {
            const meio = (lo + hi) >> 1;
            if (cp < faixas[meio][0]) hi = meio - 1;
            else if (cp > faixas[meio][1]) lo = meio + 1;
            else return true;
        }
        return false;
    }

    // ── a tabela `cmap` ────────────────────────────────────────────────────
    //
    // A escolha da sub-tabela segue a mesma ordem que os motores de texto
    // usam: Unicode completo (formato 12) na frente, BMP depois, e a simbolica
    // (3,0) por ultimo — ela existe em fontes de icone e mapeia os desenhos na
    // area privada 0xF000, entao so vale quando nao ha nada melhor.
    const PRIORIDADE = [
        (p, e) => p === 3 && e === 10,   // Windows / UCS-4
        (p, e) => p === 0 && e >= 4,     // Unicode 2.0+, UCS-4
        (p, e) => p === 3 && e === 1,    // Windows / BMP  (o caso comum)
        (p, e) => p === 0,               // Unicode, qualquer
        (p, e) => p === 3 && e === 0,    // Windows / simbolica
        (p, e) => p === 1 && e === 0,    // Macintosh Roman
    ];

    function escolherSubTabela(b, base) {
        const n = u16(b, base + 2);
        let melhor = null;
        let melhorPrio = PRIORIDADE.length;
        for (let i = 0; i < n; i++) {
            const off = base + 4 + i * 8;
            if (off + 8 > b.length) break;
            const plataforma = u16(b, off);
            const codificacao = u16(b, off + 2);
            const desvio = u32(b, off + 4);
            if (base + desvio >= b.length) continue;
            for (let p = 0; p < PRIORIDADE.length; p++) {
                if (PRIORIDADE[p](plataforma, codificacao) && p < melhorPrio) {
                    melhorPrio = p;
                    melhor = base + desvio;
                }
            }
        }
        return melhor;
    }

    // Formato 0: 256 bytes, um glifo por byte. Fontes muito antigas.
    function lerFormato0(b, o) {
        const cobertos = new Set();
        for (let c = 0; c < 256; c++) {
            if (o + 6 + c < b.length && b[o + 6 + c] !== 0) cobertos.add(c);
        }
        return faixasDeConjunto(cobertos);
    }

    // Formato 4: segmentos no BMP. E o formato da esmagadora maioria das
    // fontes deste catalogo. Percorrer code point a code point (no maximo
    // 65.536 voltas) e mais simples e mais seguro do que deduzir faixas dos
    // segmentos: dentro de um segmento com `idRangeOffset` ha buracos que
    // apontam para o glifo 0, e um deles e exatamente o caso que este arquivo
    // existe para pegar.
    function lerFormato4(b, o) {
        const segX2 = u16(b, o + 6);
        const segs = segX2 >> 1;
        const oFim = o + 14;
        const oIni = oFim + segX2 + 2;
        const oDelta = oIni + segX2;
        const oRange = oDelta + segX2;
        const cobertos = new Set();
        for (let s = 0; s < segs; s++) {
            const fim = u16(b, oFim + s * 2);
            const ini = u16(b, oIni + s * 2);
            const delta = u16(b, oDelta + s * 2);
            const rangeOff = u16(b, oRange + s * 2);
            if (ini > fim) continue;
            for (let c = ini; c <= fim && c !== 0x10000; c++) {
                let glifo;
                if (rangeOff === 0) {
                    glifo = (c + delta) & 0xffff;
                } else {
                    const p = oRange + s * 2 + rangeOff + (c - ini) * 2;
                    if (p + 1 >= b.length) continue;
                    glifo = u16(b, p);
                    if (glifo !== 0) glifo = (glifo + delta) & 0xffff;
                }
                if (glifo !== 0) cobertos.add(c);
            }
        }
        return faixasDeConjunto(cobertos);
    }

    // Formato 6: uma faixa contigua de code points.
    function lerFormato6(b, o) {
        const primeiro = u16(b, o + 6);
        const quantos = u16(b, o + 8);
        const cobertos = new Set();
        for (let i = 0; i < quantos; i++) {
            const p = o + 10 + i * 2;
            if (p + 1 >= b.length) break;
            if (u16(b, p) !== 0) cobertos.add(primeiro + i);
        }
        return faixasDeConjunto(cobertos);
    }

    // Formato 12: grupos de 32 bits. Aqui as faixas vem prontas do arquivo.
    function lerFormato12(b, o) {
        const grupos = u32(b, o + 12);
        const faixas = [];
        for (let g = 0; g < grupos; g++) {
            const p = o + 16 + g * 12;
            if (p + 12 > b.length) break;
            const ini = u32(b, p);
            const fim = u32(b, p + 4);
            const glifoIni = u32(b, p + 8);
            // Grupo que comeca no glifo 0 e um grupo de "nada aqui".
            if (glifoIni === 0) continue;
            if (fim >= ini) faixas.push([ini, fim]);
        }
        return normalizarFaixas(faixas);
    }

    function lerCmap(b, base) {
        const o = escolherSubTabela(b, base);
        if (o === null || o + 4 > b.length) return null;
        const formato = u16(b, o);
        if (formato === 0) return lerFormato0(b, o);
        if (formato === 4) return lerFormato4(b, o);
        if (formato === 6) return lerFormato6(b, o);
        if (formato === 12) return lerFormato12(b, o);
        return null;   // 2, 13, 14: desconhecido — e desconhecido nao acusa.
    }

    // ── achar a tabela `cmap` dentro do container (espelho do fonte-nome.js) ─

    function tabelaDoSfnt(b, base, alvo) {
        const numTables = u16(b, base + 4);
        for (let i = 0; i < numTables; i++) {
            const off = base + 12 + i * 16;
            if (off + 16 > b.length) break;
            if (tag(b, off) === alvo) {
                const inicio = u32(b, off + 8);
                const tamanho = u32(b, off + 12);
                if (inicio + tamanho > b.length) return null;
                return b.subarray(inicio, inicio + tamanho);
            }
        }
        return null;
    }

    async function inflar(bytes) {
        const ds = new DecompressionStream('deflate');
        const resposta = new Response(new Blob([bytes]).stream().pipeThrough(ds));
        return new Uint8Array(await resposta.arrayBuffer());
    }

    async function tabelaDoWoff(b, alvo) {
        const numTables = u16(b, 12);
        for (let i = 0; i < numTables; i++) {
            const off = 44 + i * 20;
            if (off + 20 > b.length) break;
            if (tag(b, off) !== alvo) continue;
            const inicio = u32(b, off + 4);
            const compLen = u32(b, off + 8);
            const origLen = u32(b, off + 12);
            const fatia = b.subarray(inicio, inicio + compLen);
            return compLen < origLen ? await inflar(fatia) : fatia;
        }
        return null;
    }

    /**
     * A cobertura de um arquivo de fonte (TTF, OTF, TTC ou WOFF).
     * Devolve `{ faixas: [[ini,fim], ...] }` ou `null` quando nao deu para ler
     * — e `null` quer dizer "nao sei", nunca "nao tem".
     */
    async function coberturaDaFonte(dados) {
        try {
            const b = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
            if (b.length < 12) return null;
            const assinatura = tag(b, 0);

            let tabela = null;
            if (assinatura === 'wOFF') {
                tabela = await tabelaDoWoff(b, 'cmap');
            } else if (assinatura === 'ttcf') {
                tabela = tabelaDoSfnt(b, u32(b, 12), 'cmap');
            } else if (u32(b, 0) === 0x00010000 || assinatura === 'OTTO' || assinatura === 'true') {
                tabela = tabelaDoSfnt(b, 0, 'cmap');
            }
            // wOF2 (WOFF2) cai aqui: Brotli nao abre sem biblioteca.
            if (!tabela) return null;

            const faixas = lerCmap(tabela, 0);
            if (!faixas || !faixas.length) return null;
            return { faixas: faixas };
        } catch (e) {
            return null;
        }
    }

    // ── as fontes embutidas do PDF ─────────────────────────────────────────
    //
    // `helv`, `times` e `cour` nao tem arquivo para ler: sao as Base-14 que o
    // PyMuPDF traz de fabrica, e ele as escreve em WinAnsi (cp1252). O que
    // esta fora do cp1252 sai buraco do mesmo jeito — e como sao 18 elementos
    // no acervo usando esses apelidos, deixa-las como "desconhecida" seria
    // abrir um buraco na trava do tamanho do problema original.
    //
    // As 27 avulsas sao a faixa 0x80–0x9F do cp1252, que no Unicode mora
    // espalhada. Repare que `Š` (0x160) e `ž` (0x17E) estao aqui e `ř`
    // (0x159), `ě` (0x11B) e `č` (0x10D) NAO — e exatamente essa a fronteira
    // que fez o nome tcheco furar.
    const AVULSAS_CP1252 = [
        0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
        0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
        0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
    ];
    const COBERTURA_BASE14 = {
        faixas: normalizarFaixas(
            [[0x20, 0x7E], [0xA0, 0xFF]].concat(AVULSAS_CP1252.map(c => [c, c]))
        ),
    };
    const APELIDOS_BASE14 = [
        'helv', 'helv-bold', 'times', 'times-bold', 'cour', 'cour-bold',
    ];

    /** A cobertura de um apelido Base-14, ou `null` se o nome nao for um. */
    function coberturaBase14(nomeDaFonte) {
        const n = String(nomeDaFonte || '').trim().toLowerCase();
        return APELIDOS_BASE14.indexOf(n) >= 0 ? COBERTURA_BASE14 : null;
    }

    // ── as duas perguntas que as telas fazem ───────────────────────────────

    // Caractere de CONTROLE nao e desenhado por fonte nenhuma: a quebra de
    // linha e a tabulacao o motor trata como separador, e o resto (inclusive o
    // DEL, U+007F) nunca deveria estar num nome. Cobrar glifo deles seria
    // acusar do nada -- e uma trava falsa por causa de um byte perdido no CSV e
    // exatamente o que este modulo nao pode fazer.
    function ehControle(cp) {
        return cp < 0x20 || cp === 0x7F || (cp >= 0x80 && cp <= 0x9F);
    }

    /**
     * Os caracteres do texto que esta fonte NAO desenha, sem repetir e na
     * ordem em que aparecem. Cobertura desconhecida (`null`) devolve lista
     * vazia — ver a regra de ouro no cabecalho.
     */
    function faltamNaFonte(cobertura, texto) {
        if (!cobertura || !cobertura.faixas) return [];
        const faltam = [];
        const vistos = new Set();
        for (const ch of String(texto == null ? '' : texto)) {
            const cp = ch.codePointAt(0);
            if (ehControle(cp)) continue;
            if (vistos.has(ch)) continue;
            if (!temGlifo(cobertura, cp)) { vistos.add(ch); faltam.push(ch); }
        }
        return faltam;
    }

    /**
     * O texto COMO SAI NO PAPEL: o que a fonte nao desenha vira espaco, que e
     * o buraco que o `insert_text` do motor deixa. E o que a previa da tela
     * precisa mostrar para parar de mentir.
     */
    function textoComoSaiNoPapel(texto, cobertura) {
        const s = String(texto == null ? '' : texto);
        if (!cobertura || !cobertura.faixas) return s;
        let saida = '';
        for (const ch of s) {
            const cp = ch.codePointAt(0);
            if (ehControle(cp)) { saida += ch; continue; }
            saida += temGlifo(cobertura, cp) ? ch : ' ';
        }
        return saida;
    }

    /** Como o caractere aparece no aviso: o proprio sinal e o codigo Unicode. */
    function rotuloDoCaractere(ch) {
        const cp = String(ch).codePointAt(0);
        return '"' + ch + '" (U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ')';
    }

    // ── o cache das coberturas ─────────────────────────────────────────────
    //
    // Ler o cmap custa um download e uma varredura; as telas perguntam pela
    // mesma fonte dezenas de vezes (uma por card, uma por linha desenhada).
    // O cache guarda o resultado POR NOME, inclusive o resultado "desconhecida"
    // — sem isso, toda fonte que nao da para ler seria rebaixada a cada
    // pergunta, e o link do cliente ficaria batendo no Storage sem parar.
    //
    // `_lidas` existe separado de `_cache` porque `null` tem dois sentidos:
    // "ainda nao perguntei" e "perguntei e nao deu para saber". Sao a mesma
    // resposta para quem desenha (nao acusa), mas nao para quem busca.
    const _cache = {};
    const _lidas = new Set();
    const _emVoo = new Map();

    function chaveDaFonte(nome) {
        return String(nome || '').trim().toLowerCase();
    }

    /** O mapa `{ chave: cobertura|null }` que as funcoes puras recebem. */
    function mapaDeCoberturas() {
        return _cache;
    }

    function coberturaJaLida(nome) {
        return _cache[chaveDaFonte(nome)] || null;
    }

    function coberturaFoiPerguntada(nome) {
        return _lidas.has(chaveDaFonte(nome));
    }

    /** Achar a fonte no catalogo pelo `nome` OU pela `font_family`. */
    function noCatalogo(catalogo, nome) {
        const k = chaveDaFonte(nome);
        for (const f of (catalogo || [])) {
            if (!f) continue;
            if (chaveDaFonte(f.nome) === k || chaveDaFonte(f.font_family) === k) return f;
        }
        return null;
    }

    /**
     * Garante que a cobertura destas fontes esteja lida, baixando o arquivo de
     * quem vier do catalogo. Devolve os nomes cuja resposta MUDOU nesta chamada
     * — e por eles que a tela sabe se vale redesenhar.
     *
     * `opcoes.catalogo`    a lista de fontes (window.catalogoFontes()).
     * `opcoes.buscarBytes` injetavel: `async url => Uint8Array`. O padrao usa
     *                      `fetch`; o harness passa o proprio, e e por isso que
     *                      este modulo continua rodando no Node.
     *
     * Fonte que nao baixa, nao abre, ou nao esta no catalogo entra no cache
     * como DESCONHECIDA. Ela nunca mais e perguntada e nunca acusa ninguem.
     */
    async function garantirCoberturas(nomes, opcoes) {
        const o = opcoes || {};
        const catalogo = o.catalogo || [];
        const buscar = o.buscarBytes || (async (url) => {
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return new Uint8Array(await r.arrayBuffer());
        });

        const novas = [];
        const pendentes = [];
        for (const bruto of (nomes || [])) {
            const nome = String(bruto || '').trim();
            const k = chaveDaFonte(nome);
            if (!k || _lidas.has(k)) continue;

            // As Base-14 nao tem arquivo: a resposta e imediata e nao vai a rede.
            const base14 = coberturaBase14(nome);
            if (base14) {
                _cache[k] = base14;
                _lidas.add(k);
                novas.push(nome);
                continue;
            }

            let promessa = _emVoo.get(k);
            if (!promessa) {
                const f = noCatalogo(catalogo, nome);
                promessa = (async () => {
                    let cob = null;
                    // Fonte do sistema (`system:Arial`) nao tem arquivo aqui: o
                    // motor a procura na maquina que imprime, e daqui nao da
                    // para saber o que ela tem. Desconhecida, entao.
                    if (f && f.arquivo_url) {
                        try {
                            cob = await coberturaDaFonte(await buscar(f.arquivo_url));
                        } catch (e) {
                            cob = null;
                        }
                    }
                    _cache[k] = cob;
                    _lidas.add(k);
                    _emVoo.delete(k);
                })();
                _emVoo.set(k, promessa);
            }
            novas.push(nome);
            pendentes.push(promessa);
        }
        if (pendentes.length) await Promise.all(pendentes);
        return novas;
    }

    escopo.coberturaDaFonte = coberturaDaFonte;
    escopo.coberturaBase14 = coberturaBase14;
    escopo.temGlifo = temGlifo;
    escopo.faltamNaFonte = faltamNaFonte;
    escopo.textoComoSaiNoPapel = textoComoSaiNoPapel;
    escopo.rotuloDoCaractere = rotuloDoCaractere;
    escopo.chaveDaFonte = chaveDaFonte;
    escopo.mapaDeCoberturas = mapaDeCoberturas;
    escopo.coberturaJaLida = coberturaJaLida;
    escopo.coberturaFoiPerguntada = coberturaFoiPerguntada;
    escopo.garantirCoberturas = garantirCoberturas;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            coberturaDaFonte, coberturaBase14, temGlifo,
            faltamNaFonte, textoComoSaiNoPapel, rotuloDoCaractere,
            chaveDaFonte, mapaDeCoberturas, coberturaJaLida,
            coberturaFoiPerguntada, garantirCoberturas,
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
