// texto-ajuste.js — ajuste de texto variavel a um espaco de largura fixa.
//
// window.ajustarTextoNaLargura e ESPELHO EXATO de _ajustar_texto_na_largura
// do engine.py: mudou aqui, muda la, senao a tela quebra a linha num lugar e
// o papel em outro. Folga de 0,5% pela mesma razao (reguas diferentes).
// Arquivo proprio (padrao csv-editor.js) porque index.html e cliente.html
// carregam scripts distintos e uma copia em cada um driftaria.

(function () {
    'use strict';

    function ajustarTextoNaLargura(medir, texto, corpo, larguraMax, modo) {
        const paragrafos = String(texto).split('\n');
        larguraMax = Number(larguraMax) || 0;
        corpo = Number(corpo) || 0;
        if (larguraMax <= 0 || corpo <= 0) return { corpo: corpo, linhas: paragrafos };
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
            return { corpo: corpo, linhas: linhas };
        }

        // shrink (padrao): largura de texto e linear no corpo — uma divisao basta.
        let maior = 0;
        for (const p of paragrafos) {
            const w = medir(p, corpo);
            if (w > maior) maior = w;
        }
        if (maior > alvo) return { corpo: corpo * (alvo / maior), linhas: paragrafos };
        return { corpo: corpo, linhas: paragrafos };
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
        const modo = (el && el.overflow === 'wrap') ? 'wrap' : 'shrink';
        const aj = ajustarTextoNaLargura(medir, label, fsBase, maxPx, modo);

        ctx.font = montarFonte(aj.corpo);
        let larguraPx = 0;
        for (const linha of aj.linhas) {
            const w = ctx.measureText(linha).width;
            if (w > larguraPx) larguraPx = w;
        }

        let alinhar = 'center', xTexto = 0;
        if (maxPx > 0 && el.text_align === 'left') { alinhar = 'left'; xTexto = -maxPx / 2; }
        else if (maxPx > 0 && el.text_align === 'right') { alinhar = 'right'; xTexto = maxPx / 2; }

        ctx.textAlign = alinhar;
        ctx.textBaseline = 'middle';
        const lineHeight = aj.corpo * 1.2;   // igual ao engine.py
        if (aj.linhas.length > 1) {
            const totalH = aj.linhas.length * lineHeight;
            const blockTop = -totalH / 2;
            aj.linhas.forEach(function (linha, i) {
                ctx.fillText(linha, xTexto, blockTop + i * lineHeight + lineHeight / 2);
            });
        } else {
            ctx.fillText(aj.linhas[0], xTexto, 0);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        return { corpo: aj.corpo, linhas: aj.linhas, larguraPx: larguraPx };
    }

    window.ajustarTextoNaLargura = ajustarTextoNaLargura;
    window.desenharTextoAjustado = desenharTextoAjustado;
})();
