/**
 * O desenho de QR no canvas — uma fonte só para todas as janelas.
 * ---------------------------------------------------------------------------
 *
 * Este projeto tem VÁRIAS janelas que desenham o mesmo ingresso: o editor de
 * numeração, o card do pedido, a janela de amostra, o link do cliente e a
 * prévia de imposição do Painel de Produção. Elas moram em arquivos diferentes:
 * `script.js`, `pedido.js`, `cliente.js` e `criador-arte.js`.
 *
 * Essa divisão já custou caro duas vezes na mesma semana, sempre do mesmo jeito
 * — alguém acrescenta um elemento e esquece um dos desenhadores:
 *
 *   - o QR Ideal nasceu na parte 1 e o `pedido.js` nunca soube dele: o papel
 *     saía com o elemento e a prévia do Painel não mostrava nada;
 *   - antes disso, o `fonte-canvas.js` ficou fora da lista que as estações
 *     baixam, e o painel delas congelou inteiro.
 *
 * Por isso o desenho vive aqui, e não em cada arquivo. Quem quiser um QR na
 * tela chama `renderQRCodeOnCtx` ou `desenharQRIdeal`, e todos recebem o mesmo
 * pixel.
 *
 * ── Dependências ───────────────────────────────────────────────────────────
 *
 * Só a `qrcodejs` (global `qrcode`), que as duas páginas já carregam do CDN.
 * Nada deste projeto: assim ele carrega cedo, antes de qualquer desenhador, e
 * não pode falhar por causa de outro arquivo.
 */
(function (raiz) {
    'use strict';

    /**
     * Encaixa a imagem dentro da caixa sem distorcer — a mesma conta que os
     * elementos PDF e SVG usam, e pelo mesmo motivo: arte esticada na tela
     * mente sobre o que vai ao papel.
     */
    function drawImageContain(ctx, img, x, y, w, h) {
        var iw = img.naturalWidth || img.width || 0;
        var ih = img.naturalHeight || img.height || 0;
        if (!iw || !ih || !(w > 0) || !(h > 0)) return;
        var escala = Math.min(w / iw, h / ih);
        var dw = iw * escala;
        var dh = ih * escala;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    /**
     * Um QR de verdade, centrado em (x, y), com a quiet zone incluída.
     *
     * A margem de 2 módulos não é enfeite: sem ela o leitor não separa o código
     * do fundo, e o ingresso é recusado na portaria. Os `+ 0.35` no tamanho da
     * célula fecham a fresta que o arredondamento do canvas deixa entre
     * módulos vizinhos — sem eles o QR sai com listras brancas finas.
     */
    function renderQRCodeOnCtx(ctx, text, x, y, sz, color, bgColor) {
        try {
            text = String(text || '0001');
            bgColor = bgColor || '#ffffff';
            color = color || '#000000';

            var qr = qrcode(0, 'L');
            qr.addData(text);
            qr.make();

            var moduleCount = qr.getModuleCount();
            var margin = 2;
            var totalCount = moduleCount + margin * 2;
            var cellSize = sz / totalCount;
            var hsz = sz / 2;

            ctx.fillStyle = bgColor;
            ctx.fillRect(x - hsz, y - hsz, sz, sz);

            ctx.fillStyle = color;
            for (var r = 0; r < moduleCount; r++) {
                for (var c = 0; c < moduleCount; c++) {
                    if (qr.isDark(r, c)) {
                        ctx.fillRect(
                            x - hsz + (c + margin) * cellSize,
                            y - hsz + (r + margin) * cellSize,
                            cellSize + 0.35,
                            cellSize + 0.35
                        );
                    }
                }
            }
        } catch (e) {
            console.error('[QR Code] Erro ao gerar QR Code:', e);
            var h2 = sz / 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - h2, y - h2, sz, sz);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - h2 + 1, y - h2 + 1, sz - 2, sz - 2);
        }
    }

    // ── O QR Ideal ─────────────────────────────────────────────────────────

    /**
     * Repinta a janela que estiver aberta, seja qual for.
     *
     * O conteúdo do QR Ideal e a logo chegam DEPOIS do primeiro desenho — um
     * por rede, a outra por carregamento de imagem —, e o canvas é síncrono.
     * Sem repintar, o QR fica no exemplo até o operador mexer em alguma coisa.
     */
    function repintar() {
        ['drawCanvas', 'drawPedPreview'].forEach(function (nome) {
            if (typeof raiz[nome] === 'function') {
                try { raiz[nome](); } catch (e) { /* janela fechada */ }
            }
        });
    }

    /**
     * A logo do centro do QR Ideal — marca de TELA, que nunca vai ao papel.
     *
     * O QR sai com correção de erro baixa, então uma logo impressa por cima
     * apagaria módulos de verdade e o leitor da portaria recusaria o ingresso.
     * Ela existe só no desenho do navegador: quem gera PDF de produção pede
     * explicitamente para não desenhá-la, e o `engine.py` nem sabe que existe.
     */
    var _logo = new Image();
    _logo.onload = repintar;
    _logo.src = '/Logo Ideal Dark.png';

    function desenharLogoNoQrIdeal(ctx, sz) {
        if (!_logo.complete || !_logo.naturalWidth) return;
        // Abaixo disso o QR é miniatura e a logo vira um borrão colorido no
        // meio dela — atrapalha em vez de identificar.
        if (sz < 24) return;

        var lado = sz * 0.30;
        var meia = lado / 2;
        var raio = lado * 0.14;

        ctx.save();
        // A placa branca é o que faz a logo ler como marca, e não como sujeira
        // por cima dos módulos.
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(-meia, -meia, lado, lado, raio);
        } else {
            ctx.rect(-meia, -meia, lado, lado);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        var folga = lado * 0.10;
        drawImageContain(ctx, _logo, -meia + folga, -meia + folga, lado - folga * 2, lado - folga * 2);
        ctx.restore();
    }

    /**
     * O conteúdo do QR Ideal, perguntado ao agente da estação.
     *
     * O código sai de uma lista de 3 milhões que **só existe nas estações**, e
     * por isso não há como calculá-lo no navegador. A primeira chamada devolve
     * `null`, dispara a busca e repinta quando a resposta chega.
     *
     * Fora da estação — painel aberto pela Vercel — o endpoint não responde e
     * ela devolve `null` para sempre. Quem desenha mostra um exemplo, e é o
     * comportamento certo: online não existe o dado, e inventar um seria pior.
     */
    var _cache = new Map();
    var _jaRepintou = new Set();

    function qrIdealConteudo(pedido, modelo, item) {
        if (!pedido || !modelo) return null;
        var chave = pedido + '|' + modelo + '|' + (item || 1);
        if (_cache.has(chave)) return _cache.get(chave);
        _cache.set(chave, null);

        var base = (typeof raiz.API_BASE_URL !== 'undefined') ? raiz.API_BASE_URL : '';
        fetch(base + '/api/qr-ideal?pedido=' + encodeURIComponent(pedido)
              + '&modelo=' + encodeURIComponent(modelo) + '&item=' + (item || 1))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                if (j && j.conteudo) {
                    _cache.set(chave, j.conteudo);
                    // Uma repintura por chave, e não por resposta: uma tiragem
                    // desenha dezenas de QRs e repintar em cada uma engasgaria.
                    if (!_jaRepintou.has(chave)) {
                        _jaRepintou.add(chave);
                        repintar();
                    }
                }
            })
            .catch(function () { });
        return null;
    }

    /**
     * Desenha o QR Ideal na cor escolhida no elemento — preto 100% por padrão.
     *
     * O desenho fica CENTRADO na origem do contexto: quem chama já transladou
     * até o centro do elemento. É a mesma convenção do resto do editor.
     *
     * `opts.logo === false` desliga a logo do centro — é o que a rasterização
     * do gabarito usa para não levá-la ao PDF de produção.
     */
    function desenharQRIdeal(ctx, el, sz, color, pedido, modelo, item, opts) {
        var conteudo = qrIdealConteudo(pedido, modelo, item);
        renderQRCodeOnCtx(ctx, conteudo || 'EXEMPLO', 0, 0, sz, color);
        if (!opts || opts.logo !== false) desenharLogoNoQrIdeal(ctx, sz);
    }

    raiz.drawImageContain = raiz.drawImageContain || drawImageContain;
    raiz.renderQRCodeOnCtx = renderQRCodeOnCtx;
    raiz.desenharLogoNoQrIdeal = desenharLogoNoQrIdeal;
    raiz.qrIdealConteudo = qrIdealConteudo;
    raiz.desenharQRIdeal = desenharQRIdeal;
})(typeof window !== 'undefined' ? window : globalThis);
