// texto-ajuste.js — ajuste de texto variavel a um espaco de largura fixa.
//
// window.ajustarTextoNaLargura e ESPELHO EXATO de _ajustar_texto_na_largura
// do engine.py: mudou aqui, muda la, senao a tela quebra a linha num lugar e
// o papel em outro. Folga de 0,5% pela mesma razao (reguas diferentes).
// Arquivo proprio (padrao csv-editor.js) porque index.html e cliente.html
// carregam scripts distintos e uma copia em cada um driftaria.

(function () {
    'use strict';

    // Ate onde as letras podem ser espremidas no modo "condense" antes de a
    // fonte tambem ter de encolher. Abaixo de ~75% o texto fica ilegivel no
    // papel — e o mesmo piso que os motores de VDP do mercado usam.
    const PISO_CONDENSA = 0.75;

    function ajustarTextoNaLargura(medir, texto, corpo, larguraMax, modo) {
        const paragrafos = String(texto).split('\n');
        larguraMax = Number(larguraMax) || 0;
        corpo = Number(corpo) || 0;
        if (larguraMax <= 0 || corpo <= 0) return { corpo: corpo, linhas: paragrafos, escalaX: 1 };
        const alvo = larguraMax * 0.995;

        if (modo === 'wrap') {
            const linhas = [];
            for (const p of paragrafos) {
                if (!p) { linhas.push(''); continue; }
                let atual = '';
                for (let palavra of p.split(' ')) {
                    while (palavra.length > 1 && medir(palavra, corpo) > alvo) {
                        if (atual) { linhas.push(atual); atual = ''; }
                        let corte = palavra.length - 1;
                        while (corte > 1 && medir(palavra.slice(0, corte), corpo) > alvo) corte--;
                        linhas.push(palavra.slice(0, corte));
                        palavra = palavra.slice(corte);
                    }
                    const tentativa = atual ? atual + ' ' + palavra : palavra;
                    if (atual && medir(tentativa, corpo) > alvo) {
                        linhas.push(atual);
                        atual = palavra;
                    } else {
                        atual = tentativa;
                    }
                }
                linhas.push(atual);
            }
            return { corpo: corpo, linhas: linhas, escalaX: 1 };
        }

        // A linha mais larga manda nos outros dois modos: largura de texto e
        // linear no corpo, entao uma divisao resolve os dois sem laco.
        let maior = 0;
        for (const p of paragrafos) {
            const w = medir(p, corpo);
            if (w > maior) maior = w;
        }
        if (maior <= alvo) return { corpo: corpo, linhas: paragrafos, escalaX: 1 };

        if (modo === 'condense') {
            const escala = alvo / maior;
            if (escala >= PISO_CONDENSA) {
                // Coube so espremendo: a ALTURA fica intacta, que e a razao de
                // ser deste modo — as linhas seguem alinhadas de um ingresso
                // ao outro.
                return { corpo: corpo, linhas: paragrafos, escalaX: escala };
            }
            // Nem no piso coube: espreme ate o piso e o resto vira corpo menor.
            return {
                corpo: corpo * (alvo / (maior * PISO_CONDENSA)),
                linhas: paragrafos,
                escalaX: PISO_CONDENSA
            };
        }

        // shrink (padrao)
        return { corpo: corpo * (alvo / maior), linhas: paragrafos, escalaX: 1 };
    }

    // Desenha o texto de um elemento com ajuste de largura, ancorado no centro
    // (0,0) — assume o ctx ja transladado/rotacionado pelo chamador. Multilinha
    // com line_height = 1.2 x corpo, identico ao engine.py. montarFonte(fsPx)
    // devolve o valor de ctx.font para aquele corpo (cada pagina tem seu builder).
    // Devolve {corpo, linhas, larguraPx} — larguraPx e a linha mais larga no
    // corpo final, para sublinhado de selecao e caixa de clique.
    function desenharTextoAjustado(ctx, el, label, fsBase, pxPorMm, montarFonte) {
        const maxPx = (el && Number(el.max_width_mm) > 0) ? Number(el.max_width_mm) * pxPorMm : 0;
        const medir = function (t, fs) { ctx.font = montarFonte(fs); return ctx.measureText(t).width; };
        const modo = modoDoElemento(el);
        const aj = ajustarTextoNaLargura(medir, label, fsBase, maxPx, modo);
        const esc = aj.escalaX || 1;

        ctx.font = montarFonte(aj.corpo);
        let medidaPx = 0;
        for (const linha of aj.linhas) {
            const w = ctx.measureText(linha).width;
            if (w > medidaPx) medidaPx = w;
        }

        let alinhar = 'center', xTexto = 0;
        if (maxPx > 0 && el.text_align === 'left') { alinhar = 'left'; xTexto = -maxPx / 2; }
        else if (maxPx > 0 && el.text_align === 'right') { alinhar = 'right'; xTexto = maxPx / 2; }

        // Comprimir so o eixo X reproduz o morph do engine: as letras estreitam
        // e a altura fica. O x do texto e pre-dividido para a linha cair no
        // mesmo lugar depois da compressao (o ctx ja esta na ancora do elemento,
        // que e o pivot dos dois lados).
        if (esc !== 1) { ctx.save(); ctx.scale(esc, 1); }

        ctx.textAlign = alinhar;
        ctx.textBaseline = 'middle';
        const lineHeight = aj.corpo * 1.2;   // igual ao engine.py
        const x = xTexto / esc;
        if (aj.linhas.length > 1) {
            const totalH = aj.linhas.length * lineHeight;
            const blockTop = -totalH / 2;
            aj.linhas.forEach(function (linha, i) {
                ctx.fillText(linha, x, blockTop + i * lineHeight + lineHeight / 2);
            });
        } else {
            ctx.fillText(aj.linhas[0], x, 0);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        if (esc !== 1) ctx.restore();

        return {
            corpo: aj.corpo,
            linhas: aj.linhas,
            escalaX: esc,
            larguraPx: medidaPx * esc   // largura no papel, ja comprimida
        };
    }

    /** O modo de ajuste gravado no elemento, com o padrao de sempre. */
    function modoDoElemento(el) {
        const m = el && el.overflow;
        return (m === 'wrap' || m === 'condense') ? m : 'shrink';
    }

    /**
     * Passa o banco inteiro pelo mesmo ajuste do desenho e diz onde o dado
     * variavel vai sofrer — antes de o papel sair da impressora.
     *
     * Tres perguntas, e as tres custam caro na producao:
     *   1. alguma linha tem a coluna VAZIA? (ticket em branco)
     *   2. alguma fica com a fonte miuda demais para ler?
     *   3. alguma quebra em tantas linhas que passa da altura do ticket?
     *
     * Tudo em pixels de canvas; `pxPorMm` converte para as unidades que a tela
     * mostra ao operador (mm e pt).
     */
    function conferirEstouroDaColuna(cfg) {
        const linhas = Array.isArray(cfg.linhas) ? cfg.linhas : [];
        const col = cfg.coluna || '';
        const pxPorMm = Number(cfg.pxPorMm) || 1;
        const corpoPx = Number(cfg.corpoPx) || 0;
        const maxPx = Number(cfg.larguraMaxPx) || 0;
        const minPt = Number(cfg.corpoMinimoPt) || 0;
        const alturaMm = Number(cfg.alturaDisponivelMm) || 0;
        const modo = cfg.modo || 'shrink';
        const pre = cfg.prefixo || '', suf = cfg.sufixo || '';
        const emPt = px => (px / pxPorMm) * 2.8346;   // px de canvas -> pt

        const res = {
            conferidas: 0, vazias: [], miudas: [], altas: [],
            piorCorpoPt: null, maiorLinhas: 1, indices: []
        };
        if (!col || !linhas.length) return res;

        const apontadas = new Set();
        for (let i = 0; i < linhas.length; i++) {
            const r = linhas[i];
            if (!r || r.__ativo === false) continue;    // desmarcada não imprime
            res.conferidas++;

            const bruto = (r[col] == null) ? '' : String(r[col]);
            if (bruto === '') {
                res.vazias.push(i);
                apontadas.add(i);
                continue;
            }

            const aj = ajustarTextoNaLargura(cfg.medir, pre + bruto + suf, corpoPx, maxPx, modo);
            const corpoPt = emPt(aj.corpo);
            if (res.piorCorpoPt === null || corpoPt < res.piorCorpoPt) res.piorCorpoPt = corpoPt;
            if (aj.linhas.length > res.maiorLinhas) res.maiorLinhas = aj.linhas.length;

            if (minPt > 0 && corpoPt < minPt) {
                res.miudas.push({ indice: i, corpoPt: corpoPt });
                apontadas.add(i);
            }
            if (alturaMm > 0) {
                const blocoMm = (aj.linhas.length * aj.corpo * 1.2) / pxPorMm;
                if (blocoMm > alturaMm) {
                    res.altas.push({ indice: i, linhas: aj.linhas.length, alturaMm: blocoMm });
                    apontadas.add(i);
                }
            }
        }
        res.indices = Array.from(apontadas).sort((a, b) => a - b);
        return res;
    }

    window.PISO_CONDENSA = PISO_CONDENSA;
    window.ajustarTextoNaLargura = ajustarTextoNaLargura;
    window.desenharTextoAjustado = desenharTextoAjustado;
    window.conferirEstouroDaColuna = conferirEstouroDaColuna;
})();
