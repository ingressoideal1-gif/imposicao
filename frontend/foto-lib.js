/**
 * foto-lib.js — a foto como dado variável.
 *
 * Aqui mora tudo o que decide O QUE aparece dentro da janela de foto de uma
 * credencial. É de propósito que este arquivo não conheça nem o DOM nem o
 * `state`: a geometria daqui é a GÊMEA da do `engine.py` (`_foto_encaixe`), e
 * uma gêmea que diverge é pior que nenhuma — a tela prometeria um
 * enquadramento e o PVC sairia com outro. Quem mexer numa das duas mexe na
 * outra, e o teste que prova a igualdade é `tests/test_engine_foto.py` de um
 * lado e `tests/foto_lib_harness.js` do outro.
 *
 * Vocabulário:
 *   · janela  — o retângulo do elemento FOTO na arte, em mm (width_mm × height_mm)
 *   · meta    — o enquadramento daquela linha: { url, cx, cy, zoom, rot }
 *   · cx/cy   — o ponto da foto que fica no centro da janela, em fração (0..1)
 *   · zoom    — fator sobre o encaixe mínimo; 1 = o menor que ainda cobre
 */

(function (raiz) {
    'use strict';

    var META_PADRAO = { cx: 0.5, cy: 0.5, zoom: 1, rot: 0 };

    /**
     * O enquadramento daquela linha, ou null se a linha não tem foto.
     *
     * Dois caminhos, na mesma ordem do engine:
     *   1. `__fotos[coluna]` — o que o Gerenciador de Fotos grava dentro da linha.
     *   2. o valor cru da coluna — uma URL ou caminho escrito na própria célula,
     *      como BarTender e NiceLabel fazem.
     */
    function fotoDaLinha(el, linha) {
        if (!el || !linha) return null;
        var col = el.csv_column || '';
        var mapa = linha.__fotos;
        if (mapa && typeof mapa === 'object') {
            var m = mapa[col];
            if (m && typeof m === 'object' && String(m.url || '').trim()) {
                return Object.assign({}, META_PADRAO, m);
            }
        }
        var bruto = String(linha[col] == null ? '' : linha[col]).trim();
        if (bruto) return Object.assign({}, META_PADRAO, { url: bruto });
        return null;
    }

    /**
     * Retângulo em que a foto INTEIRA deve ser desenhada dentro da janela, para
     * que o pedaço pedido apareça. O que sobra é cortado por quem desenha (um
     * clip no canvas; no engine, a borda da página temporária).
     *
     * Devolve { x, y, w, h } em relação ao canto superior esquerdo da janela.
     */
    function encaixeFoto(iw, ih, jw, jh, fit, cx, cy, zoom, rot) {
        if ((rot || 0) % 180 === 90) { var t = iw; iw = ih; ih = t; }
        if (!(iw > 0) || !(ih > 0) || !(jw > 0) || !(jh > 0)) return null;

        var cobrir = String(fit || 'cover').toLowerCase() !== 'contain';
        var base = cobrir ? Math.max(jw / iw, jh / ih) : Math.min(jw / iw, jh / ih);
        var esc = base * Math.max(Number(zoom) || 1, 0.01);
        var dw = iw * esc, dh = ih * esc;

        if (!cobrir) return { x: (jw - dw) / 2, y: (jh - dh) / 2, w: dw, h: dh };

        // Cobrir não pode deixar buraco: o centro pedido manda, mas preso.
        var fx = Number.isFinite(cx) ? cx : 0.5;
        var fy = Number.isFinite(cy) ? cy : 0.5;
        var x = Math.min(0, Math.max(jw - dw, jw / 2 - fx * dw));
        var y = Math.min(0, Math.max(jh - dh, jh / 2 - fy * dh));
        return { x: x, y: y, w: dw, h: dh };
    }

    /**
     * Desenha a foto dentro da janela, com o mesmo recorte que o papel terá.
     *
     * Nunca use `ctx.drawImage(img, x, y, w, h)` cru numa janela de foto: isso
     * estica a imagem para caber, e a regra do produto é foto sem distorção. O
     * corte vem do clip; a proporção nunca é tocada.
     */
    function desenharJanelaFoto(ctx, img, x, y, jw, jh, meta, fit) {
        var iw = img.naturalWidth || img.width || 0;
        var ih = img.naturalHeight || img.height || 0;
        var m = Object.assign({}, META_PADRAO, meta || {});
        var g = encaixeFoto(iw, ih, jw, jh, fit, m.cx, m.cy, m.zoom, m.rot);
        if (!g) return false;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, jw, jh);
        ctx.clip();
        var rot = ((Number(m.rot) || 0) % 360 + 360) % 360;
        if (rot) {
            ctx.translate(x + jw / 2, y + jh / 2);
            ctx.rotate(rot * Math.PI / 180);
            // Depois de girar, a caixa calculada já está na orientação final:
            // desenhar a imagem crua exige desfazer a troca de eixos.
            var ew = (rot % 180 === 90) ? g.h : g.w;
            var eh = (rot % 180 === 90) ? g.w : g.h;
            ctx.drawImage(img, -ew / 2, -eh / 2, ew, eh);
        } else {
            ctx.drawImage(img, x + g.x, y + g.y, g.w, g.h);
        }
        ctx.restore();
        return true;
    }

    /**
     * Resolução efetiva da foto dentro da janela, em dpi.
     *
     * É o número que decide se aquela foto pode ir ao papel. Abaixo de 150 dpi
     * o rosto sai borrado num cartão PVC, e é melhor o operador saber disso na
     * folha de contato do que na bandeja da impressora.
     */
    function dpiNaJanela(iw, ih, jwMm, jhMm, fit, zoom) {
        var g = encaixeFoto(iw, ih, jwMm, jhMm, fit, 0.5, 0.5, zoom, 0);
        if (!g || !(g.w > 0)) return 0;
        // g.w está em mm (a janela veio em mm); a foto inteira ocupa g.w mm.
        return Math.round(iw / (g.w / 25.4));
    }

    // ─── Casamento: a qual linha pertence cada arquivo do lote ───────────────
    //
    // O lote chega como veio do cliente: `Foto Ana.JPG`, `ana.jpeg`,
    // `CPF 123.456.789-00.png`, `IMG_4471.jpg`. É a etapa em que todo sistema do
    // mercado — BarTender, NiceLabel, cardPresso, Express Badging — resolve o
    // que dá por nome de arquivo e joga o resto numa lista para o operador
    // resolver na mão. A regra inegociável: **na dúvida, não escolher**. Uma
    // credencial com a foto trocada só é descoberta pelo cliente.

    var SEM_EXT = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif)$/i;

    function semExtensao(nome) {
        return String(nome || '').replace(SEM_EXT, '');
    }

    function normalizarTexto(txt) {
        return String(txt == null ? '' : txt)
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');                          // espaço, _, -, .
    }

    function soDigitos(txt) {
        return String(txt == null ? '' : txt).replace(/\D/g, '');
    }

    // Um número curto não pode virar chave: "1.jpg" casaria com meia planilha.
    var MIN_DIGITOS = 5;

    var REGRAS = [
        { nome: 'exato', chave: function (t) { return String(t || '').trim(); } },
        { nome: 'sem-extensao', chave: function (t) { return semExtensao(String(t || '').trim()); } },
        { nome: 'normalizado', chave: function (t) { return normalizarTexto(semExtensao(t)); } },
        {
            nome: 'digitos', chave: function (t) {
                var d = soDigitos(semExtensao(t));
                return d.length >= MIN_DIGITOS ? d : '';
            }
        }
    ];

    /** Distância de edição, limitada — só para sugerir, nunca para casar. */
    function distancia(a, b) {
        if (a === b) return 0;
        if (!a.length || !b.length) return Math.max(a.length, b.length);
        var ant = new Array(b.length + 1);
        for (var j = 0; j <= b.length; j++) ant[j] = j;
        for (var i = 1; i <= a.length; i++) {
            var atual = [i];
            for (var k = 1; k <= b.length; k++) {
                atual[k] = Math.min(
                    ant[k] + 1,
                    atual[k - 1] + 1,
                    ant[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)
                );
            }
            ant = atual;
        }
        return ant[b.length];
    }

    /**
     * Distribui os arquivos do lote entre as linhas do banco.
     *
     * `arquivos`: [{ nome, ... }] — o objeto inteiro volta nos resultados.
     * `linhas`:   as linhas do banco, na ordem; as desmarcadas (`__ativo:false`)
     *             ficam de fora, porque elas não imprimem.
     * `colunas`:  quais colunas tentar, em ordem de preferência.
     *
     * Devolve { casadas, ambiguas, sobrando, semFoto }, onde `linha` é sempre o
     * ÍNDICE na lista original — é ele que o gravador usa para achar a linha.
     */
    function casarFotos(arquivos, linhas, colunas) {
        var arqs = (arquivos || []).map(function (a, i) {
            return { i: i, ref: a, nome: (a && a.nome) || String(a) };
        });
        var lins = [];
        (linhas || []).forEach(function (l, i) {
            if (l && l.__ativo === false) return;   // não imprime, não precisa de foto
            lins.push({ i: i, ref: l });
        });
        var cols = (colunas && colunas.length) ? colunas : ['Foto'];

        var casadas = [];
        var ambiguas = [];
        var arqLivre = {}, linLivre = {};
        arqs.forEach(function (a) { arqLivre[a.i] = a; });
        lins.forEach(function (l) { linLivre[l.i] = l; });

        REGRAS.forEach(function (regra) {
            var porChaveArq = {}, porChaveLin = {};

            Object.keys(arqLivre).forEach(function (k) {
                var a = arqLivre[k];
                var c = regra.chave(a.nome);
                if (!c) return;
                (porChaveArq[c] || (porChaveArq[c] = [])).push(a);
            });

            Object.keys(linLivre).forEach(function (k) {
                var l = linLivre[k];
                cols.forEach(function (col) {
                    var v = l.ref ? l.ref[col] : null;
                    if (v == null || v === '') return;
                    var c = regra.chave(v);
                    if (!c) return;
                    var lista = porChaveLin[c] || (porChaveLin[c] = []);
                    if (lista.indexOf(l) === -1) lista.push(l);
                });
            });

            Object.keys(porChaveArq).forEach(function (chave) {
                var as = porChaveArq[chave].filter(function (a) { return arqLivre[a.i]; });
                var ls = (porChaveLin[chave] || []).filter(function (l) { return linLivre[l.i]; });
                if (!as.length || !ls.length) return;

                if (as.length === 1 && ls.length === 1) {
                    casadas.push({ arquivo: as[0].nome, ref: as[0].ref, linha: ls[0].i, regra: regra.nome });
                    delete arqLivre[as[0].i];
                    delete linLivre[ls[0].i];
                    return;
                }

                // Disputa: dois arquivos para a mesma pessoa, ou duas pessoas
                // com o mesmo nome. Vira pendência com os candidatos à vista.
                ambiguas.push({
                    regra: regra.nome,
                    motivo: as.length > 1 ? 'mais de uma foto para a mesma linha' : 'a mesma foto serve a mais de uma linha',
                    candidatos: as.map(function (a) { return { arquivo: a.nome, ref: a.ref }; }),
                    linhas: ls.map(function (l) { return l.i; })
                });
                as.forEach(function (a) { delete arqLivre[a.i]; });
                ls.forEach(function (l) { delete linLivre[l.i]; });
            });
        });

        // Sugestão aproximada para o que sobrou dos dois lados. Oferece, nunca aplica.
        var sobrando = Object.keys(arqLivre).map(function (k) { return arqLivre[k]; });
        var semFoto = Object.keys(linLivre).map(function (k) { return linLivre[k]; });

        sobrando.slice().forEach(function (a) {
            var alvo = normalizarTexto(semExtensao(a.nome));
            if (!alvo) return;
            var melhor = null, melhorD = Infinity;
            semFoto.forEach(function (l) {
                cols.forEach(function (col) {
                    var v = l.ref ? l.ref[col] : null;
                    if (v == null || v === '') return;
                    var d = distancia(alvo, normalizarTexto(v));
                    if (d < melhorD) { melhorD = d; melhor = l; }
                });
            });
            // Até 20% de diferença, e nunca mais que 3 caracteres: além disso
            // não é erro de digitação, é outra pessoa.
            var limite = Math.min(3, Math.floor(alvo.length * 0.2) + 1);
            if (melhor && melhorD > 0 && melhorD <= limite) {
                ambiguas.push({
                    regra: 'sugestao',
                    motivo: 'nome parecido, não idêntico',
                    candidatos: [{ arquivo: a.nome, ref: a.ref }],
                    linhas: [melhor.i]
                });
                sobrando = sobrando.filter(function (x) { return x !== a; });
                semFoto = semFoto.filter(function (x) { return x !== melhor; });
            }
        });

        return {
            casadas: casadas,
            ambiguas: ambiguas,
            sobrando: sobrando.map(function (a) { return { nome: a.nome, ref: a.ref }; }),
            semFoto: semFoto.map(function (l) { return l.i; })
        };
    }

    // ─── Cache de imagens ────────────────────────────────────────────────────
    //
    // O cache é por URL e NÃO por elemento, de propósito: o objeto do elemento é
    // o mesmo para todos os modelos que dividem a numeração (a armadilha que o
    // `preloadAmostraItemPdfElements` documenta), mas a foto muda a cada LINHA.
    // Guardar a imagem no elemento faria toda credencial sair com a foto da
    // primeira pessoa.

    var cache = new Map();

    function registro(url) {
        var reg = cache.get(url);
        if (reg) return reg;

        var img = typeof Image !== 'undefined' ? new Image() : null;
        reg = { img: img, pronta: false, falhou: false, ouvintes: new Set() };
        reg.espera = new Promise(function (resolve) {
            if (!img) { reg.falhou = true; return resolve(reg); }
            img.crossOrigin = 'anonymous';
            var fim = function () {
                reg.ouvintes.forEach(function (fn) { try { fn(); } catch (e) { } });
                reg.ouvintes.clear();
                resolve(reg);
            };
            img.onload = function () { reg.pronta = true; fim(); };
            img.onerror = function () { reg.falhou = true; fim(); };
            img.src = url;
        });
        cache.set(url, reg);
        return reg;
    }

    /** A imagem, se já estiver pronta; senão null, e `aoCarregar` avisa quando chegar. */
    function fotoImagem(url, aoCarregar) {
        if (!url) return null;
        var reg = registro(url);
        if (reg.pronta) return reg.img;
        if (typeof aoCarregar === 'function') reg.ouvintes.add(aoCarregar);
        return null;
    }

    /** Tamanho em pixels da foto já carregada, ou null se ainda não chegou. */
    function dimensoesDaFoto(url) {
        var reg = url ? cache.get(url) : null;
        if (!reg || !reg.pronta || !reg.img) return null;
        return { w: reg.img.naturalWidth || reg.img.width, h: reg.img.naturalHeight || reg.img.height };
    }

    /** Espera a foto chegar (ou falhar). Para quem desenha uma vez só. */
    function carregarFoto(url) {
        return url ? registro(url).espera : Promise.resolve(null);
    }

    /**
     * Carrega de uma vez todas as fotos que aqueles elementos vão precisar.
     *
     * Existe pelo mesmo motivo do pré-carregamento de SVG e PDF: as janelas que
     * desenham uma vez só — o visualizador de PDF, o gabarito — não têm como
     * repintar quando a imagem chega tarde. Elas precisam da foto ANTES do
     * primeiro traço.
     */
    function precarregarFotosDosElementos(elementos, linhas) {
        var els = (elementos || []).filter(function (e) { return e && e.type === 'FOTO'; });
        if (!els.length) return Promise.resolve();
        var fonte = (linhas && linhas.length) ? linhas : [null];
        var urls = new Set();
        fonte.forEach(function (linha) {
            els.forEach(function (el) {
                var m = fotoDaLinha(el, linha);
                if (m && m.url) urls.add(m.url);
            });
        });
        return Promise.all(Array.from(urls).map(carregarFoto));
    }

    /**
     * Desenha uma janela de foto ancorada no CENTRO (0,0) do contexto já
     * transladado — a mesma ancoragem de todos os outros elementos.
     *
     * Sem foto na linha, desenha a moldura com o nome da coluna: o operador
     * precisa enxergar a janela vazia enquanto monta a arte, não um buraco
     * invisível que só aparece na hora de imprimir.
     */
    function desenharElementoFoto(ctx, el, S, isSelected, linha, aoCarregar) {
        var w = (el.width_mm || 25) * S;
        var h = (el.height_mm || 32) * S;
        var hw = w / 2, hh = h / 2;
        var meta = fotoDaLinha(el, linha);
        var img = meta ? fotoImagem(meta.url, aoCarregar) : null;

        ctx.save();
        if (el.corner === 'circle' || el.corner === 'round') {
            ctx.beginPath();
            if (el.corner === 'circle') {
                ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
            } else if (ctx.roundRect) {
                ctx.roundRect(-hw, -hh, w, h, Math.min(w, h) * 0.12);
            } else {
                ctx.rect(-hw, -hh, w, h);
            }
            ctx.clip();
        }

        if (img) {
            desenharJanelaFoto(ctx, img, -hw, -hh, w, h, meta, el.fit || 'cover');
        } else {
            ctx.fillStyle = 'rgba(148,163,184,0.18)';
            ctx.fillRect(-hw, -hh, w, h);
            // Silhueta: diz "aqui entra uma pessoa" sem depender de texto
            // legível dentro de uma janela de 25 mm.
            ctx.fillStyle = 'rgba(100,116,139,0.55)';
            ctx.beginPath();
            ctx.arc(0, -h * 0.12, Math.min(w, h) * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, h * 0.34, w * 0.32, h * 0.26, 0, Math.PI, 0);
            ctx.fill();

            var fs = Math.max(6, Math.min(11, h * 0.11));
            ctx.font = fs + 'px Inter, sans-serif';
            ctx.fillStyle = '#475569';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('[' + (el.csv_column || 'coluna') + ']', 0, hh - fs);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
        ctx.restore();

        ctx.strokeStyle = isSelected ? '#3b82f6' : (el.color || '#94a3b8');
        ctx.lineWidth = isSelected ? 2 : 1;
        if (isSelected) {
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-hw - 2, -hh - 2, w + 4, h + 4);
            ctx.setLineDash([]);
        } else {
            ctx.strokeRect(-hw, -hh, w, h);
        }
    }

    var api = {
        META_PADRAO: META_PADRAO,
        fotoDaLinha: fotoDaLinha,
        encaixeFoto: encaixeFoto,
        desenharJanelaFoto: desenharJanelaFoto,
        dpiNaJanela: dpiNaJanela,
        casarFotos: casarFotos,
        normalizarTexto: normalizarTexto,
        fotoImagem: fotoImagem,
        dimensoesDaFoto: dimensoesDaFoto,
        carregarFoto: carregarFoto,
        precarregarFotosDosElementos: precarregarFotosDosElementos,
        desenharElementoFoto: desenharElementoFoto
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    Object.keys(api).forEach(function (k) { raiz[k] = api[k]; });
})(typeof window !== 'undefined' ? window : globalThis);
