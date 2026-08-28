/**
 * O desenho de codigo de barras no canvas - uma fonte so para todas as janelas.
 * ---------------------------------------------------------------------------
 *
 * Ate 27/08/2026 as dez janelas que desenham um ingresso pintavam, no lugar do
 * codigo de barras, um padrao FIXO de 40 barras - o mesmo desenho para qualquer
 * valor e qualquer simbologia. Tamanho e posicao do bloco estavam certos; o
 * conteudo, nao. O operador nao tinha como ver na tela se o Code 128 daquele
 * numero ficaria denso demais para a largura escolhida, nem se o EAN-13 aceitou
 * os digitos que ele digitou.
 *
 * Este modulo desenha o codigo de verdade. As tabelas foram EXTRAIDAS da mesma
 * biblioteca que o motor usa (`python-barcode`) e os algoritmos sao espelho dos
 * de la, incluindo a troca de conjunto do Code 128 - que e onde duas
 * implementacoes honestas divergem, e divergir aqui e a tela mentir de novo.
 * `tests/test_barcode_canvas.py` compara os dois lados valor a valor.
 *
 * -- Dependencias -----------------------------------------------------------
 *
 * Nenhuma. Como o `qr-canvas.js`, ele carrega cedo e nao pode falhar por causa
 * de outro arquivo.
 *
 * -- Normalizacao -----------------------------------------------------------
 *
 * As simbologias numericas estritas exigem um numero exato de digitos, e o motor
 * ajusta o valor antes de codificar (`_modulos_do_barcode` no `engine.py`). A
 * mesma normalizacao mora aqui, porque um EAN-13 com 5 digitos na tela e 12 no
 * papel seriam dois codigos diferentes.
 */
(function (raiz) {
    'use strict';

    // -- Tabelas, lidas da biblioteca do motor -----------------------------
    var C128_A = {"\u0000": 64, "\u0001": 65, "\u0002": 66, "\u0003": 67, "\u0004": 68, "\u0005": 69, "\u0006": 70, "\u0007": 71, "\b": 72, "\t": 73, "\n": 74, "\u000b": 75, "\f": 76, "\r": 77, "\u000e": 78, "\u000f": 79, "\u0010": 80, "\u0011": 81, "\u0012": 82, "\u0013": 83, "\u0014": 84, "\u0015": 85, "\u0016": 86, "\u0017": 87, "\u0018": 88, "\u0019": 89, "\u001a": 90, "\u001b": 91, "\u001c": 92, "\u001d": 93, "\u001e": 94, "\u001f": 95, " ": 0, "!": 1, "\"": 2, "#": 3, "$": 4, "%": 5, "&": 6, "'": 7, "(": 8, ")": 9, "*": 10, "+": 11, ",": 12, "-": 13, ".": 14, "/": 15, "0": 16, "1": 17, "2": 18, "3": 19, "4": 20, "5": 21, "6": 22, "7": 23, "8": 24, "9": 25, ":": 26, ";": 27, "<": 28, "=": 29, ">": 30, "?": 31, "@": 32, "A": 33, "B": 34, "C": 35, "D": 36, "E": 37, "F": 38, "G": 39, "H": 40, "I": 41, "J": 42, "K": 43, "L": 44, "M": 45, "N": 46, "O": 47, "P": 48, "Q": 49, "R": 50, "S": 51, "SHIFT": 98, "T": 52, "TO_B": 100, "TO_C": 99, "U": 53, "V": 54, "W": 55, "X": 56, "Y": 57, "Z": 58, "[": 59, "\\": 60, "]": 61, "^": 62, "_": 63, "ñ": 102, "ò": 97, "ó": 96, "ô": 101};
    var C128_B = {" ": 0, "!": 1, "\"": 2, "#": 3, "$": 4, "%": 5, "&": 6, "'": 7, "(": 8, ")": 9, "*": 10, "+": 11, ",": 12, "-": 13, ".": 14, "/": 15, "0": 16, "1": 17, "2": 18, "3": 19, "4": 20, "5": 21, "6": 22, "7": 23, "8": 24, "9": 25, ":": 26, ";": 27, "<": 28, "=": 29, ">": 30, "?": 31, "@": 32, "A": 33, "B": 34, "C": 35, "D": 36, "E": 37, "F": 38, "G": 39, "H": 40, "I": 41, "J": 42, "K": 43, "L": 44, "M": 45, "N": 46, "O": 47, "P": 48, "Q": 49, "R": 50, "S": 51, "SHIFT": 98, "T": 52, "TO_A": 101, "TO_C": 99, "U": 53, "V": 54, "W": 55, "X": 56, "Y": 57, "Z": 58, "[": 59, "\\": 60, "]": 61, "^": 62, "_": 63, "`": 64, "a": 65, "b": 66, "c": 67, "d": 68, "e": 69, "f": 70, "g": 71, "h": 72, "i": 73, "j": 74, "k": 75, "l": 76, "m": 77, "n": 78, "o": 79, "p": 80, "q": 81, "r": 82, "s": 83, "t": 84, "u": 85, "v": 86, "w": 87, "x": 88, "y": 89, "z": 90, "{": 91, "|": 92, "}": 93, "~": 94, "": 95, "ñ": 102, "ò": 97, "ó": 96, "ô": 100};
    var C128_C = {"TO_A": 101, "TO_B": 100, "ñ": 102};
    var C128_CODES = ["11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110", "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110", "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000", "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000", "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100", "11010010000", "11010011100"];
    var C128_START = {"A": 103, "B": 104, "C": 105};
    var C128_STOP = "11000111010";
    var C128_TO = {"100": 104, "101": 103, "99": 105};
    var C39_MAP = {" ": "100011101011101", "$": "100010001000101", "%": "101000100010001", "+": "100010100010001", "-": "100010101110111", ".": "111000101011101", "/": "100010001010001", "0": "101000111011101", "1": "111010001010111", "2": "101110001010111", "3": "111011100010101", "4": "101000111010111", "5": "111010001110101", "6": "101110001110101", "7": "101000101110111", "8": "111010001011101", "9": "101110001011101", "A": "111010100010111", "B": "101110100010111", "C": "111011101000101", "D": "101011100010111", "E": "111010111000101", "F": "101110111000101", "G": "101010001110111", "H": "111010100011101", "I": "101110100011101", "J": "101011100011101", "K": "111010101000111", "L": "101110101000111", "M": "111011101010001", "N": "101011101000111", "O": "111010111010001", "P": "101110111010001", "Q": "101010111000111", "R": "111010101110001", "S": "101110101110001", "T": "101011101110001", "U": "111000101010111", "V": "100011101010111", "W": "111000111010101", "X": "100010111010111", "Y": "111000101110101", "Z": "100011101110101"};
    var C39_VAL = {" ": 38, "$": 39, "%": 42, "+": 41, "-": 36, ".": 37, "/": 40, "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "A": 10, "B": 11, "C": 12, "D": 13, "E": 14, "F": 15, "G": 16, "H": 17, "I": 18, "J": 19, "K": 20, "L": 21, "M": 22, "N": 23, "O": 24, "P": 25, "Q": 26, "R": 27, "S": 28, "T": 29, "U": 30, "V": 31, "W": 32, "X": 33, "Y": 34, "Z": 35};
    var C39_EDGE = "100010111011101";
    var C39_MIDDLE = "0";
    var EAN_CODES = {"A": ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"], "B": ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"], "C": ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]};
    var EAN_LEFT = ["AAAAAA", "AABABB", "AABBAB", "AABBBA", "ABAABB", "ABBAAB", "ABBBAA", "ABABAB", "ABABBA", "ABBABA"];
    var EAN_EDGE = "101";
    var EAN_MIDDLE = "01010";
    var UPC_CODES = {"L": ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"], "R": ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]};
    var UPC_EDGE = "101";
    var UPC_MIDDLE = "01010";
    var ITF_CODES = ["NNWWN", "WNNNW", "NWNNW", "WWNNN", "NNWNW", "WNWNN", "NWWNN", "NNNWW", "WNNWN", "NWNWN"];
    var ITF_START = "NnNn";
    var ITF_STOP = "WnN";
    var CB_CODES = {"$": "NnWwNnN", "+": "NnWnWnW", "-": "NnNwWnN", ".": "WnWnWnN", "/": "WnWnNnW", "0": "NnNnNwW", "1": "NnNnWwN", "2": "NnNwNnW", "3": "WwNnNnN", "4": "NnWnNwN", "5": "WnNnNwN", "6": "NwNnNnW", "7": "NwNnWnN", "8": "NwWnNnN", "9": "WnNwNnN", ":": "WnNnWnW"};
    var CB_STARTSTOP = {"A": "NnWwNwN", "B": "NwNwNnW", "C": "NnNwNwW", "D": "NnNwWwN"};

    // -- Code 128 ----------------------------------------------------------
    //
    // Espelho de `barcode/codex.py`. O conjunto comeca em C e troca conforme o
    // caractere; `buffer` guarda o digito solto que ainda espera o par.

    function code128(texto) {
        var conjunto = 'C';
        var buffer = '';
        var tem = function (obj, ch) { return Object.prototype.hasOwnProperty.call(obj, ch); };

        function converter(ch) {
            if (conjunto === 'A') return C128_A[ch];
            if (conjunto === 'B') return C128_B[ch];
            if (tem(C128_C, ch)) return C128_C[ch];
            if (/^[0-9]$/.test(ch)) {
                buffer += ch;
                if (buffer.length === 2) {
                    var v = parseInt(buffer, 10);
                    buffer = '';
                    return v;
                }
                return null;
            }
            throw new Error('caractere ' + ch + ' fora do conjunto ' + conjunto);
        }

        function trocar(qual) {
            var codigo;
            if (qual === 'A') codigo = converter('TO_A');
            else if (qual === 'B') codigo = converter('TO_B');
            else codigo = converter('TO_C');
            conjunto = qual;
            return [codigo];
        }

        function talvezTrocar(pos) {
            var ch = texto[pos];
            var proximos = texto.slice(pos, pos + 10);
            var olharAdiante = function () {
                var digitos = 0;
                for (var i = 0; i < proximos.length; i++) {
                    if (/[0-9]/.test(proximos[i])) digitos++; else break;
                }
                return digitos > 3;
            };
            var codigos = [];
            if (conjunto === 'C' && !/^[0-9]$/.test(ch)) {
                if (tem(C128_B, ch)) codigos = trocar('B');
                else if (tem(C128_A, ch)) codigos = trocar('A');
                if (buffer.length === 1) {
                    codigos.push(converter(buffer[0]));
                    buffer = '';
                }
            } else if (conjunto === 'B') {
                if (olharAdiante()) codigos = trocar('C');
                else if (!tem(C128_B, ch) && tem(C128_A, ch)) codigos = trocar('A');
            } else if (conjunto === 'A') {
                if (olharAdiante()) codigos = trocar('C');
                else if (!tem(C128_A, ch) && tem(C128_B, ch)) codigos = trocar('B');
            }
            return codigos;
        }

        var codificado = [C128_START[conjunto]];
        for (var i = 0; i < texto.length; i++) {
            var extras = talvezTrocar(i);
            for (var k = 0; k < extras.length; k++) codificado.push(extras[k]);
            var num = converter(texto[i]);
            if (num !== null && num !== undefined) codificado.push(num);
        }
        if (buffer.length === 1) {
            var t = trocar('B');
            for (var m = 0; m < t.length; m++) codificado.push(t[m]);
            codificado.push(converter(buffer[0]));
            buffer = '';
        }
        // `_try_to_optimize`: START seguido de troca imediata vira um START so.
        if (tem(C128_TO, String(codificado[1]))) {
            codificado.splice(0, 2, C128_TO[String(codificado[1])]);
        }

        var soma = codificado[0];
        for (var n = 1; n < codificado.length; n++) soma += n * codificado[n];
        codificado.push(soma % 103);

        var saida = '';
        for (var p = 0; p < codificado.length; p++) saida += C128_CODES[codificado[p]];
        return saida + C128_STOP + '11';
    }

    // -- Code 39 -----------------------------------------------------------

    function code39(texto) {
        var codigo = String(texto).toUpperCase();
        var soma = 0;
        for (var i = 0; i < codigo.length; i++) soma += C39_VAL[codigo[i]];
        var resto = soma % 43;
        for (var ch in C39_VAL) {
            if (C39_VAL[ch] === resto) { codigo += ch; break; }
        }
        var partes = [C39_EDGE];
        for (var k = 0; k < codigo.length; k++) partes.push(C39_MAP[codigo[k]]);
        partes.push(C39_EDGE);
        return partes.join(C39_MIDDLE);
    }

    // -- EAN-13, EAN-8 e UPC-A ---------------------------------------------

    function digitoEan(base) {
        var pares = 0, impares = 0;
        for (var i = base.length - 2; i >= 0; i -= 2) pares += parseInt(base[i], 10);
        for (var k = base.length - 1; k >= 0; k -= 2) impares += parseInt(base[k], 10);
        return (10 - ((pares + impares * 3) % 10)) % 10;
    }

    function ean13(texto) {
        var base = String(texto).slice(0, 12);
        var ean = base + digitoEan(base);
        var codigo = EAN_EDGE;
        var padrao = EAN_LEFT[parseInt(ean[0], 10)];
        for (var i = 0; i < 6; i++) codigo += EAN_CODES[padrao[i]][parseInt(ean[1 + i], 10)];
        codigo += EAN_MIDDLE;
        for (var k = 7; k < ean.length; k++) codigo += EAN_CODES['C'][parseInt(ean[k], 10)];
        return codigo + EAN_EDGE;
    }

    function ean8(texto) {
        var base = String(texto).slice(0, 7);
        var ean = base + digitoEan(base);
        var codigo = EAN_EDGE;
        for (var i = 0; i < 4; i++) codigo += EAN_CODES['A'][parseInt(ean[i], 10)];
        codigo += EAN_MIDDLE;
        for (var k = 4; k < ean.length; k++) codigo += EAN_CODES['C'][parseInt(ean[k], 10)];
        return codigo + EAN_EDGE;
    }

    function upca(texto) {
        var base = String(texto).slice(0, 11);
        var impares = 0, pares = 0;
        for (var i = 0; i < base.length; i += 2) impares += parseInt(base[i], 10);
        for (var k = 1; k < base.length; k += 2) pares += parseInt(base[k], 10);
        var conferencia = (pares + impares * 3) % 10;
        var upc = base + (conferencia === 0 ? 0 : 10 - conferencia);
        var codigo = UPC_EDGE;
        for (var a = 0; a < 6; a++) codigo += UPC_CODES['L'][parseInt(upc[a], 10)];
        codigo += UPC_MIDDLE;
        for (var b = 6; b < upc.length; b++) codigo += UPC_CODES['R'][parseInt(upc[b], 10)];
        return codigo + UPC_EDGE;
    }

    // -- ITF e Codabar: largura de traco estreito/largo, como na biblioteca --

    function expandir(dados, estreito, largo) {
        var saida = '';
        for (var i = 0; i < dados.length; i++) {
            var e = dados[i];
            if (e === 'W') saida += new Array(largo + 1).join('1');
            else if (e === 'w') saida += new Array(largo + 1).join('0');
            else if (e === 'N') saida += new Array(estreito + 1).join('1');
            else if (e === 'n') saida += new Array(estreito + 1).join('0');
        }
        return saida;
    }

    function itf(texto) {
        var codigo = String(texto);
        if (codigo.length % 2 !== 0) codigo = '0' + codigo;
        var dados = ITF_START;
        for (var i = 0; i < codigo.length; i += 2) {
            var barras = parseInt(codigo[i], 10);
            var espacos = parseInt(codigo[i + 1], 10);
            for (var j = 0; j < 5; j++) {
                dados += ITF_CODES[barras][j].toUpperCase();
                dados += ITF_CODES[espacos][j].toLowerCase();
            }
        }
        return expandir(dados + ITF_STOP, 2, 5);
    }

    function codabar(texto) {
        var codigo = String(texto);
        if (!CB_STARTSTOP[codigo[0]] || !CB_STARTSTOP[codigo[codigo.length - 1]]) {
            throw new Error('Codabar comeca e termina com A, B, C ou D');
        }
        var meio = [];
        for (var i = 1; i < codigo.length - 1; i++) meio.push(CB_CODES[codigo[i]]);
        var dados = CB_STARTSTOP[codigo[0]] + 'n' + meio.join('n')
                  + 'n' + CB_STARTSTOP[codigo[codigo.length - 1]];
        return expandir(dados, 2, 5);
    }

    // -- Normalizacao: a MESMA do motor -------------------------------------

    function normalizar(dado, formato) {
        var fmt = String(formato || 'code128').toLowerCase();
        var texto = String(dado === null || dado === undefined ? '' : dado);
        if (fmt === 'ean13' || fmt === 'ean8' || fmt === 'upca' || fmt === 'itf') {
            var so = texto.replace(/[^0-9]/g, '');
            if (!so) so = '0';
            var minimo = { ean13: 12, ean8: 7, upca: 11 }[fmt];
            if (minimo) {
                while (so.length < minimo) so = '0' + so;
                if (so.length > minimo + 1) so = so.slice(0, minimo);
            } else if (so.length % 2 !== 0) {
                so = '0' + so;
            }
            texto = so;
        }
        return { fmt: fmt, texto: texto };
    }

    /** O padrao de barras (fita de `1` e `0`) - o mesmo que o motor desenha. */
    function modulosDoBarcode(dado, formato) {
        var n = normalizar(dado, formato);
        if (n.fmt === 'code39') return code39(n.texto);
        if (n.fmt === 'ean13') return ean13(n.texto);
        if (n.fmt === 'ean8') return ean8(n.texto);
        if (n.fmt === 'upca') return upca(n.texto);
        if (n.fmt === 'itf') return itf(n.texto);
        if (n.fmt === 'codabar') return codabar(n.texto);
        return code128(n.texto);
    }

    /**
     * O codigo de barras centrado em (x, y), ocupando a caixa INTEIRA.
     *
     * Fundo branco e barras cheias, de ponta a ponta da altura - que e o que o
     * motor imprime desde que o desenho dele virou vetorial. A caixa e a caixa
     * das barras: quem pede 12 mm de altura ve 12 mm aqui e recebe 12 mm no
     * papel.
     */
    function renderBarcodeOnCtx(ctx, texto, x, y, w, h, cor, formato, corFundo) {
        var meiaL = w / 2, meiaA = h / 2;
        // `corFundo === 'transparent'` e para o PDF Gabarito, que e uma folha
        // transparente por contrato: ali um retangulo branco esconderia a arte
        // que o gabarito existe para ser sobreposto.
        if (corFundo !== 'transparent') {
            ctx.fillStyle = corFundo || '#ffffff';
            ctx.fillRect(x - meiaL, y - meiaA, w, h);
        }
        var padrao;
        try {
            padrao = modulosDoBarcode(texto, formato);
        } catch (e) {
            // Valor que a simbologia recusa: a caixa com a borda vermelha avisa,
            // em vez de um desenho bonito que o papel nao vai ter.
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x - meiaL + 1, y - meiaA + 1, w - 2, h - 2);
            return;
        }
        if (!padrao || !padrao.length) return;
        ctx.fillStyle = cor || '#000000';
        var larguraModulo = w / padrao.length;
        var i = 0;
        while (i < padrao.length) {
            if (padrao[i] === '1') {
                var j = i;
                while (j + 1 < padrao.length && padrao[j + 1] === '1') j++;
                // Barras vizinhas viram UM retangulo: sem a fresta branca que o
                // arredondamento do canvas deixaria entre elas.
                ctx.fillRect(x - meiaL + i * larguraModulo, y - meiaA,
                             (j + 1 - i) * larguraModulo, h);
                i = j + 1;
            } else {
                i++;
            }
        }
    }

    raiz.modulosDoBarcode = modulosDoBarcode;
    raiz.renderBarcodeOnCtx = renderBarcodeOnCtx;
})(typeof window !== 'undefined' ? window : globalThis);
