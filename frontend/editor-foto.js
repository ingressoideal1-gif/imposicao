/* ===========================================================================
   Editor de Foto — uma foto de credencial, corrigida sem sair do Gerenciador
   ---------------------------------------------------------------------------
   Abre por cima do Gerenciador de Fotos com UMA foto e devolve um blob novo
   por `aoAplicar`. Não conhece linhas, colunas nem enquadramento: quem liga a
   foto à pessoa é o gerenciador — aqui só se mexe nos bytes.

   Operações locais (todas no navegador, nada sobe para editar):
     · recorte com alça, girar 90°, espelhar
     · brilho / contraste / saturação (ao vivo), nitidez, auto-nível
     · reamostrar por dpi-na-janela
     · remover o fundo (modelo de segmentação leve, baixado uma vez) e
       preencher com uma cor — o clássico da foto 3×4 com fundo bagunçado
     · AMPLIAR a tela e completar o fundo que passou a faltar, por borda
       esticada, espelho ou IA (LaMa, modelo de inpainting Apache-2.0)

   A foto que chega enquadrada demais é o problema mais comum de credencial: não
   sobra fundo para o recorte da janela, e cortar mais significa cortar o ombro
   ou a cabeça. Ampliar a tela inverte isso — a foto inteira cabe, e o que falta
   é inventado só na moldura.

   Eliminar objetos com pincel usa a mesma máquina (`inpaintarRegiao`) e é o
   passo seguinte natural; ele ainda não tem interface.

   API:
     window.abrirEditorDeFoto({
        titulo,                       // o que aparece no topo
        janela: { w_mm, h_mm, fit },  // para o dpi contar a verdade
        zoom,                         // zoom do enquadramento atual
        obterBitmap: () => Promise<ImageBitmap|Image>,
        aoAplicar: (blob, w, h) => …  // jpeg final
     })
   =========================================================================== */

(function () {
    'use strict';

    var QUALIDADE = 0.9;

    var cfg = null;
    var base = null;         // canvas com as edições já aplicadas (sem b/c/s)
    var original = null;     // canvas do estado de abertura, para "voltar"
    var ajustes = null;      // { brilho, contraste, saturacao } ao vivo
    var recorte = null;      // { x0, y0, x1, y1 } em fração do canvas base
    var arrastando = null;
    var ocupado = false;

    var CSS = `
#ef-overlay{position:fixed;inset:0;z-index:1000001;background:rgba(2,6,23,.96);
  display:flex;flex-direction:column;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;font-size:13px}
#ef-overlay *{box-sizing:border-box}
.ef-top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #1e293b}
.ef-top h2{margin:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ef-corpo{flex:1;display:flex;min-height:0}
.ef-palco{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-width:0;position:relative}
.ef-palco canvas{max-width:100%;max-height:100%;border-radius:6px;
  background:repeating-conic-gradient(#1e293b 0 25%,#0f172a 0 50%) 0 0/22px 22px}
.ef-lado{width:300px;flex:none;overflow-y:auto;border-left:1px solid #1e293b;padding:14px;display:flex;flex-direction:column;gap:14px}
.ef-bloco{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px}
.ef-bloco h3{margin:0 0 8px;font-size:12px;font-weight:600;color:#94a3b8}
.ef-linha{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.ef-linha label{flex:none;width:76px;font-size:11px;color:#94a3b8}
.ef-linha input[type=range]{flex:1}
.ef-linha .val{width:34px;text-align:right;font-size:11px;color:#64748b}
.ef-botoes{display:flex;gap:6px;flex-wrap:wrap}
.ef-btn{padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:12px}
.ef-btn:hover{background:#334155}
.ef-btn.primario{background:#2563eb;border-color:#2563eb;color:#fff}
.ef-btn.ligado{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.ef-btn:disabled{opacity:.45;cursor:not-allowed}
.ef-rodape{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid #1e293b}
.ef-tag{font-size:11px;color:#64748b}
.ef-msg{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#fbbf24;
  padding:6px 10px;border-radius:6px;font-size:12px;display:none}
#ef-cv{cursor:crosshair}
.ef-num{width:64px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:12px}
.ef-sel{flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:12px}
`;

    function el(id) { return document.getElementById(id); }

    function garantirCss() {
        if (document.getElementById('ef-css')) return;
        var s = document.createElement('style');
        s.id = 'ef-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function aviso(txt) {
        var n = el('ef-msg');
        if (n) { n.textContent = txt; n.style.display = txt ? 'block' : 'none'; }
    }

    function canvasDe(w, h) {
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w));
        cv.height = Math.max(1, Math.round(h));
        return cv;
    }

    function clonar(cv) {
        var c = canvasDe(cv.width, cv.height);
        c.getContext('2d').drawImage(cv, 0, 0);
        return c;
    }

    // ── dpi e desenho ─────────────────────────────────────────────────────

    function dpiAtual() {
        if (!base || !cfg || !window.dpiNaJanela) return 0;
        return window.dpiNaJanela(base.width, base.height,
            cfg.janela.w_mm, cfg.janela.h_mm, cfg.janela.fit, cfg.zoom || 1);
    }

    /** Filtro CSS dos ajustes ao vivo (brilho/contraste/saturação). */
    function filtroCss() {
        var a = ajustes;
        var partes = [];
        if (a.brilho) partes.push('brightness(' + (1 + a.brilho / 100) + ')');
        if (a.contraste) partes.push('contrast(' + (1 + a.contraste / 100) + ')');
        if (a.saturacao) partes.push('saturate(' + (1 + a.saturacao / 100) + ')');
        return partes.length ? partes.join(' ') : 'none';
    }

    function desenhar() {
        var cv = el('ef-cv');
        if (!cv || !base) return;
        cv.width = base.width;
        cv.height = base.height;
        var ctx = cv.getContext('2d');
        ctx.filter = filtroCss();
        ctx.drawImage(base, 0, 0);
        ctx.filter = 'none';

        if (recorte) {
            var x0 = recorte.x0 * cv.width, y0 = recorte.y0 * cv.height;
            var x1 = recorte.x1 * cv.width, y1 = recorte.y1 * cv.height;
            // Escurece o que sai; o traço marca o que fica.
            ctx.fillStyle = 'rgba(2,6,23,.62)';
            ctx.fillRect(0, 0, cv.width, y0);
            ctx.fillRect(0, y1, cv.width, cv.height - y1);
            ctx.fillRect(0, y0, x0, y1 - y0);
            ctx.fillRect(x1, y0, cv.width - x1, y1 - y0);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = Math.max(2, cv.width / 260);
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        }

        var n = el('ef-dpi');
        if (n) {
            var d = dpiAtual();
            n.textContent = base.width + ' × ' + base.height + ' px · '
                + (d ? d + ' dpi na janela' + ((cfg.zoom || 1) > 1.01 ? ' (zoom ' + cfg.zoom.toFixed(1) + '×)' : '') : '');
        }
    }

    /** Aplica os ajustes ao vivo na base (chamado antes de qualquer operação). */
    function assarAjustes() {
        if (!ajustes.brilho && !ajustes.contraste && !ajustes.saturacao) return;
        var novo = canvasDe(base.width, base.height);
        var ctx = novo.getContext('2d');
        ctx.filter = filtroCss();
        ctx.drawImage(base, 0, 0);
        base = novo;
        ajustes = { brilho: 0, contraste: 0, saturacao: 0 };
        ['ef-brilho', 'ef-contraste', 'ef-saturacao'].forEach(function (id) {
            var r = el(id);
            if (r) { r.value = 0; var v = el(id + '-v'); if (v) v.textContent = '0'; }
        });
    }

    // ── operações ─────────────────────────────────────────────────────────

    function girar(graus) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var deitado = (graus % 180) !== 0;
        var novo = canvasDe(deitado ? base.height : base.width, deitado ? base.width : base.height);
        var ctx = novo.getContext('2d');
        ctx.translate(novo.width / 2, novo.height / 2);
        ctx.rotate(graus * Math.PI / 180);
        ctx.drawImage(base, -base.width / 2, -base.height / 2);
        base = novo;
        recorte = null;
        desenhar();
    }

    function espelhar(horizontal) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var novo = canvasDe(base.width, base.height);
        var ctx = novo.getContext('2d');
        ctx.translate(horizontal ? base.width : 0, horizontal ? 0 : base.height);
        ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
        ctx.drawImage(base, 0, 0);
        base = novo;
        desenhar();
    }

    function aplicarRecorte() {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        if (!recorte) { aviso('Arraste sobre a foto para marcar o recorte.'); return; }
        assarAjustes();
        var x0 = Math.round(recorte.x0 * base.width), y0 = Math.round(recorte.y0 * base.height);
        var w = Math.round((recorte.x1 - recorte.x0) * base.width);
        var h = Math.round((recorte.y1 - recorte.y0) * base.height);
        if (w < 8 || h < 8) { aviso('Recorte pequeno demais.'); return; }
        var novo = canvasDe(w, h);
        novo.getContext('2d').drawImage(base, x0, y0, w, h, 0, 0, w, h);
        base = novo;
        recorte = null;
        aviso('');
        desenhar();
    }

    /**
     * Nitidez por máscara de desfoque: original + (original − borrado) × força.
     * O borrado sai de um drawImage reduzido e reampliado — rápido e sem
     * convolução em JS pixel a pixel.
     */
    function nitidez(forca) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var w = base.width, h = base.height;
        var borrado = canvasDe(Math.max(1, w / 2), Math.max(1, h / 2));
        borrado.getContext('2d').drawImage(base, 0, 0, borrado.width, borrado.height);
        var suave = canvasDe(w, h);
        var sctx = suave.getContext('2d');
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(borrado, 0, 0, w, h);

        var a = base.getContext('2d').getImageData(0, 0, w, h);
        var b = sctx.getImageData(0, 0, w, h);
        var da = a.data, db = b.data, k = forca;
        for (var i = 0; i < da.length; i += 4) {
            da[i] = Math.max(0, Math.min(255, da[i] + (da[i] - db[i]) * k));
            da[i + 1] = Math.max(0, Math.min(255, da[i + 1] + (da[i + 1] - db[i + 1]) * k));
            da[i + 2] = Math.max(0, Math.min(255, da[i + 2] + (da[i + 2] - db[i + 2]) * k));
        }
        base.getContext('2d').putImageData(a, 0, 0);
        desenhar();
    }

    /** Estica o histograma entre os percentis 1 e 99 — o "auto" clássico. */
    function autoNivel() {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var w = base.width, h = base.height;
        var img = base.getContext('2d').getImageData(0, 0, w, h);
        var d = img.data;
        var hist = new Array(256).fill(0);
        for (var i = 0; i < d.length; i += 4) {
            hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
        }
        var total = w * h, alvo = total * 0.01;
        var lo = 0, hi = 255, acc = 0;
        for (var v = 0; v < 256; v++) { acc += hist[v]; if (acc > alvo) { lo = v; break; } }
        acc = 0;
        for (var v2 = 255; v2 >= 0; v2--) { acc += hist[v2]; if (acc > alvo) { hi = v2; break; } }
        if (hi - lo < 10) { aviso('A foto já usa a faixa toda de tons.'); return; }
        var ganho = 255 / (hi - lo);
        for (var j = 0; j < d.length; j += 4) {
            d[j] = Math.max(0, Math.min(255, (d[j] - lo) * ganho));
            d[j + 1] = Math.max(0, Math.min(255, (d[j + 1] - lo) * ganho));
            d[j + 2] = Math.max(0, Math.min(255, (d[j + 2] - lo) * ganho));
        }
        base.getContext('2d').putImageData(img, 0, 0);
        desenhar();
    }

    function reamostrarParaDpi(alvo) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        var d = dpiAtual();
        if (!d) { aviso('Não dá para medir o dpi sem a janela.'); return; }
        if (Math.abs(alvo - d) < 2) { aviso('A foto já está em ' + d + ' dpi nesta janela.'); return; }
        assarAjustes();
        var k = alvo / d;
        var novo = canvasDe(base.width * k, base.height * k);
        var ctx = novo.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(base, 0, 0, novo.width, novo.height);
        base = novo;
        if (k > 1) aviso('Interpolada para ' + alvo + ' dpi — suaviza o serrilhado, não recupera detalhe.');
        else aviso('');
        desenhar();
    }

    // ── ampliar a tela (mais fundo em volta) ──────────────────────────────

    /**
     * Margens iguais dos quatro lados, em pixels, para uma ampliação de `pct`
     * por cento. A conta é sobre o MENOR lado de propósito: usando o próprio
     * lado de cada eixo, uma foto 3×4 ganharia uma moldura visivelmente mais
     * grossa em cima e embaixo do que nas laterais.
     */
    function margensUniformes(pct) {
        var m = Math.max(1, Math.round(Math.min(base.width, base.height) * pct / 100));
        return { topo: m, dir: m, baixo: m, esq: m };
    }

    /**
     * Margens que fazem a foto INTEIRA caber na janela sem corte nenhum.
     *
     * A janela recorta o que sobra (`fit: cover`), então basta igualar a
     * proporção: só o eixo que está faltando cresce, e ele cresce metade para
     * cada lado, para o rosto continuar centrado onde estava.
     */
    function margensParaCaberNaJanela() {
        var zero = { topo: 0, dir: 0, baixo: 0, esq: 0 };
        if (!cfg || !cfg.janela || !cfg.janela.w_mm || !cfg.janela.h_mm) return zero;
        var alvo = cfg.janela.w_mm / cfg.janela.h_mm;
        var atual = base.width / base.height;
        if (Math.abs(alvo - atual) < 0.005) return zero;
        if (atual > alvo) {
            var falta = Math.round((base.width / alvo - base.height) / 2);
            return { topo: falta, dir: 0, baixo: falta, esq: 0 };
        }
        var f = Math.round((base.height * alvo - base.width) / 2);
        return { topo: 0, dir: f, baixo: 0, esq: f };
    }

    /**
     * Cobre a tela inteira com um fundo inventado a partir da própria foto.
     * Cobre inclusive onde a foto original vai entrar — quem chama desenha a
     * foto por cima depois, e é isso que garante que ela saia daqui com todos
     * os pixels que tinha.
     *
     *   'borda'   — estica a linha/coluna da borda para fora. É o melhor para
     *               fundo de estúdio, parede e degradê: continua a cor exata do
     *               encontro, sem repetir forma nenhuma.
     *   'espelho' — reflete a foto nos quatro lados e nos quatro cantos.
     *               Preserva textura (folhagem, tijolo), ao custo da simetria.
     */
    function preencherFundo(ctx, larg, alt, m, modo) {
        var w = base.width, h = base.height, x = m.esq, y = m.topo;

        if (modo === 'espelho') {
            // Nove ladrilhos. O truque de cada reflexo é a âncora: com
            // scale(-1) o desenho cresce para a ESQUERDA do ponto transladado,
            // então a aba da esquerda ancora em x (e cobre x-w..x) e a da
            // direita ancora em x+2w (e cobre x+w..x+2w). Desenhar em (0,0)
            // nos dois casos é o que faz a conta fechar.
            for (var col = -1; col <= 1; col++) {
                for (var lin = -1; lin <= 1; lin++) {
                    ctx.save();
                    ctx.translate(x + (col === 1 ? 2 * w : 0), y + (lin === 1 ? 2 * h : 0));
                    ctx.scale(col === 0 ? 1 : -1, lin === 0 ? 1 : -1);
                    ctx.drawImage(base, 0, 0);
                    ctx.restore();
                }
            }
            return;
        }

        var dir = larg - (x + w), baixo = alt - (y + h);
        if (y > 0) ctx.drawImage(base, 0, 0, w, 1, x, 0, w, y);
        if (baixo > 0) ctx.drawImage(base, 0, h - 1, w, 1, x, y + h, w, baixo);
        if (x > 0) ctx.drawImage(base, 0, 0, 1, h, 0, y, x, h);
        if (dir > 0) ctx.drawImage(base, w - 1, 0, 1, h, x + w, y, dir, h);
        if (x > 0 && y > 0) ctx.drawImage(base, 0, 0, 1, 1, 0, 0, x, y);
        if (dir > 0 && y > 0) ctx.drawImage(base, w - 1, 0, 1, 1, x + w, 0, dir, y);
        if (x > 0 && baixo > 0) ctx.drawImage(base, 0, h - 1, 1, 1, 0, y + h, x, baixo);
        if (dir > 0 && baixo > 0) ctx.drawImage(base, w - 1, h - 1, 1, 1, x + w, y + h, dir, baixo);
    }

    /**
     * Canvas alfa com o ANEL novo opaco e o retângulo da foto transparente —
     * é o "buraco a preencher" na linguagem do modelo de inpainting, e o
     * recorte do borrão nos modos instantâneos.
     *
     * `avanco` come alguns pixels para dentro da foto: a costura fica coberta,
     * em vez de virar uma linha visível no encontro do inventado com o real.
     */
    function mascaraDoAnel(larg, alt, m, avanco, suavizar) {
        var mk = canvasDe(larg, alt);
        var c = mk.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, larg, alt);
        c.globalCompositeOperation = 'destination-out';
        if (suavizar) c.filter = 'blur(' + suavizar + 'px)';
        c.fillRect(m.esq + avanco, m.topo + avanco,
            Math.max(1, base.width - 2 * avanco), Math.max(1, base.height - 2 * avanco));
        return mk;
    }

    /**
     * Amplia a tela e completa o que passou a faltar.
     *
     * A ordem importa: o fundo inventado cobre a tela inteira e é borrado
     * ANTES de a foto entrar. Assim o borrão nunca encosta num pixel original
     * — a foto é colada por cima, inteira, no fim.
     */
    async function ampliar(m, modo) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        if (!m.topo && !m.dir && !m.baixo && !m.esq) {
            aviso('Não há o que ampliar: a foto já está na proporção da janela.');
            return;
        }
        assarAjustes();

        var larg = base.width + m.esq + m.dir;
        var alt = base.height + m.topo + m.baixo;

        var fundo = canvasDe(larg, alt);
        var fc = fundo.getContext('2d');
        fc.imageSmoothingQuality = 'high';
        preencherFundo(fc, larg, alt, m, modo === 'espelho' ? 'espelho' : 'borda');

        var maior = Math.max(m.topo, m.dir, m.baixo, m.esq);
        var raio = Math.max(1, Math.min(24, Math.round(maior / 8)));
        var borrado = canvasDe(larg, alt);
        var bc = borrado.getContext('2d');
        bc.filter = 'blur(' + raio + 'px)';
        bc.drawImage(fundo, 0, 0);

        var novo = canvasDe(larg, alt);
        var ctx = novo.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(borrado, 0, 0);
        // O borrão chupa transparência de fora da tela e deixa a beirada
        // semitransparente — que no JPEG final vira uma vinheta preta. O fundo
        // sem borrão por baixo tapa exatamente essa faixa, com a mesma cor.
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(fundo, 0, 0);
        ctx.globalCompositeOperation = 'source-over';

        ctx.drawImage(base, m.esq, m.topo);

        if (modo === 'ia') await completarComIa(novo, m);

        base = novo;
        recorte = null;   // as frações do recorte eram da tela antiga
        desenhar();
    }

    // ── remover fundo (modelo leve, baixado uma vez) ──────────────────────

    var ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
    // No NOSSO Storage, nunca no GitHub: asset de release nao manda CORS (o
    // navegador recusa), e a producao nao pode depender de github.com no ar.
    // Subido e conferido por sha256 pela ferramenta subir_modelo_fundo.ps1;
    // para trocar de modelo, suba com OUTRO nome (CDN da Cloudflare na frente).
    var MODELOS = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/modelos/';
    var MODELO_FUNDO = MODELOS + 'u2netp.onnx';          // segmentar a pessoa (4 MB)
    var MODELO_COMPLETAR = MODELOS + 'lama-inpaint-512.onnx';  // completar buraco (92 MB)
    var sessoes = {};

    function carregarOrt() {
        if (window.ort) return Promise.resolve();
        return new Promise(function (res, rej) {
            var s = document.createElement('script');
            s.src = ORT_CDN + 'ort.min.js';
            s.onload = function () {
                try { window.ort.env.wasm.wasmPaths = ORT_CDN; } catch (e) { }
                res();
            };
            s.onerror = function () { rej(new Error('não baixou o onnxruntime')); };
            document.head.appendChild(s);
        });
    }

    /**
     * Bytes do modelo, guardados no Cache Storage do navegador.
     *
     * O de completar tem 92 MB. Depender só do cache HTTP significaria
     * rebaixá-lo toda vez que o navegador decidisse limpar a casa — e o
     * operador esperaria de novo, no meio de um trabalho. O Cache Storage
     * sobrevive a isso. Onde ele não existe (janela sem contexto seguro), o
     * download direto continua valendo.
     */
    async function bytesDoModelo(url) {
        try {
            var cache = await caches.open('ideal-modelos-ia');
            var guardado = await cache.match(url);
            if (guardado) return new Uint8Array(await guardado.arrayBuffer());
            var resp = await fetch(url);
            if (!resp.ok) throw new Error('o modelo respondeu ' + resp.status);
            try { await cache.put(url, resp.clone()); } catch (e) { }
            return new Uint8Array(await resp.arrayBuffer());
        } catch (e) {
            var r = await fetch(url);
            if (!r.ok) throw new Error('o modelo respondeu ' + r.status);
            return new Uint8Array(await r.arrayBuffer());
        }
    }

    /**
     * Sessão do modelo, preferindo a GPU.
     *
     * No WASM a página roda em uma thread só (habilitar mais exigiria isolar a
     * origem, o que quebraria o Supabase e as bibliotecas de CDN), e o LaMa
     * leva ~20 s por foto assim. Na GPU cai para poucos segundos. Nem toda
     * estação tem WebGPU, então a queda para o WASM é obrigatória — e é ela que
     * mantém a promessa de funcionar em qualquer máquina.
     */
    async function carregarModelo(url) {
        if (sessoes[url]) return sessoes[url];
        await carregarOrt();
        var bytes = await bytesDoModelo(url);
        if (navigator.gpu) {
            try {
                sessoes[url] = await window.ort.InferenceSession.create(bytes, {
                    executionProviders: ['webgpu']
                });
                return sessoes[url];
            } catch (e) {
                console.warn('[EditorFoto] WebGPU indisponivel, indo de CPU', e);
            }
        }
        sessoes[url] = await window.ort.InferenceSession.create(bytes, {
            executionProviders: ['wasm']
        });
        return sessoes[url];
    }

    /**
     * Completa por IA a região marcada na máscara, e SÓ ela.
     *
     * O modelo é o LaMa (Apache-2.0), de entrada fixa 512×512. Isso significa
     * que a foto inteira é reduzida a 512 para ele olhar — o que seria uma
     * perda inaceitável se a saída dele virasse a foto. Não vira: o resultado é
     * recortado pela máscara e colado só no anel novo, com a borda suavizada.
     * Todo pixel que veio da câmera continua com a resolução que tinha.
     *
     * `mascara` é um canvas do tamanho da tela onde o alfa opaco marca o
     * buraco. Serve tanto para a moldura da ampliação quanto, no futuro, para
     * um pincel de eliminar objetos — a máquina é a mesma.
     */
    async function inpaintarRegiao(tela, mascara) {
        var sess = await carregarModelo(MODELO_COMPLETAR);
        var N = 512;

        var mini = canvasDe(N, N);
        mini.getContext('2d').drawImage(tela, 0, 0, N, N);
        var px = mini.getContext('2d').getImageData(0, 0, N, N).data;

        var mm = canvasDe(N, N);
        mm.getContext('2d').drawImage(mascara, 0, 0, N, N);
        var mp = mm.getContext('2d').getImageData(0, 0, N, N).data;

        // CHW em 0..1 (a dieta do LaMa) e a máscara em 1 = buraco.
        var img = new Float32Array(3 * N * N);
        var msk = new Float32Array(N * N);
        for (var i = 0; i < N * N; i++) {
            img[i] = px[i * 4] / 255;
            img[N * N + i] = px[i * 4 + 1] / 255;
            img[2 * N * N + i] = px[i * 4 + 2] / 255;
            msk[i] = mp[i * 4 + 3] > 8 ? 1 : 0;
        }

        var nomes = sess.inputNames;
        var nImg = nomes.filter(function (n) { return /mask/i.test(n); }).length
            ? nomes.filter(function (n) { return !/mask/i.test(n); })[0] : nomes[0];
        var nMsk = nomes.filter(function (n) { return /mask/i.test(n); })[0] || nomes[1];

        var entrada = {};
        entrada[nImg] = new window.ort.Tensor('float32', img, [1, 3, N, N]);
        entrada[nMsk] = new window.ort.Tensor('float32', msk, [1, 1, N, N]);
        var saida = (await sess.run(entrada))[sess.outputNames[0]].data;

        // A saída do LaMa já vem em 0..255; o clamp é contra o estouro do GAN.
        var rcv = canvasDe(N, N);
        var rimg = rcv.getContext('2d').createImageData(N, N);
        for (var p = 0; p < N * N; p++) {
            rimg.data[p * 4] = Math.max(0, Math.min(255, saida[p]));
            rimg.data[p * 4 + 1] = Math.max(0, Math.min(255, saida[N * N + p]));
            rimg.data[p * 4 + 2] = Math.max(0, Math.min(255, saida[2 * N * N + p]));
            rimg.data[p * 4 + 3] = 255;
        }
        rcv.getContext('2d').putImageData(rimg, 0, 0);
        return rcv;
    }

    /** Ampliação por IA: o anel da moldura é o buraco a completar. */
    async function completarComIa(tela, m) {
        var larg = tela.width, alt = tela.height;
        var avanco = Math.max(2, Math.round(Math.min(larg, alt) / 120));
        var buraco = mascaraDoAnel(larg, alt, m, avanco, 0);
        var pintado = await inpaintarRegiao(tela, buraco);

        // Volta só o anel, com a costura suavizada.
        var recorteIa = canvasDe(larg, alt);
        var rc = recorteIa.getContext('2d');
        rc.imageSmoothingQuality = 'high';
        rc.drawImage(pintado, 0, 0, larg, alt);
        rc.globalCompositeOperation = 'destination-in';
        rc.drawImage(mascaraDoAnel(larg, alt, m, avanco, Math.max(2, avanco)), 0, 0);
        tela.getContext('2d').drawImage(recorteIa, 0, 0);
    }

    /**
     * Segmenta a pessoa (u2netp, 320×320) e compõe sobre a cor escolhida.
     * É o clássico da foto de documento: fundo bagunçado vira fundo liso.
     */
    async function removerFundo(corHex) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var sess = await carregarModelo(MODELO_FUNDO);

        var N = 320;
        var mini = canvasDe(N, N);
        var mctx = mini.getContext('2d');
        mctx.drawImage(base, 0, 0, N, N);
        var md = mctx.getImageData(0, 0, N, N).data;

        // CHW normalizado com média/desvio do ImageNet — a dieta do u2net.
        var entrada = new Float32Array(3 * N * N);
        var MEIO = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225];
        for (var i = 0; i < N * N; i++) {
            entrada[i] = (md[i * 4] / 255 - MEIO[0]) / DESVIO[0];
            entrada[N * N + i] = (md[i * 4 + 1] / 255 - MEIO[1]) / DESVIO[1];
            entrada[2 * N * N + i] = (md[i * 4 + 2] / 255 - MEIO[2]) / DESVIO[2];
        }

        var nomeEntrada = sess.inputNames[0];
        var saidas = await sess.run((function () {
            var o = {};
            o[nomeEntrada] = new window.ort.Tensor('float32', entrada, [1, 3, N, N]);
            return o;
        })());
        var mapa = saidas[sess.outputNames[0]].data;

        // Normaliza 0..1 (a saída do u2net não vem calibrada).
        var mn = Infinity, mx = -Infinity;
        for (var a = 0; a < N * N; a++) { if (mapa[a] < mn) mn = mapa[a]; if (mapa[a] > mx) mx = mapa[a]; }
        var faixa = (mx - mn) || 1;

        // Máscara 320×320 vira canvas alfa em cinza e é reampliada suave.
        var mcv = canvasDe(N, N);
        var mimg = mcv.getContext('2d').createImageData(N, N);
        for (var p = 0; p < N * N; p++) {
            var alfa = Math.max(0, Math.min(1, (mapa[p] - mn) / faixa));
            mimg.data[p * 4] = mimg.data[p * 4 + 1] = mimg.data[p * 4 + 2] = 255;
            mimg.data[p * 4 + 3] = Math.round(alfa * 255);
        }
        mcv.getContext('2d').putImageData(mimg, 0, 0);

        var w = base.width, h = base.height;
        var novo = canvasDe(w, h);
        var ctx = novo.getContext('2d');
        // Fundo liso por baixo…
        ctx.fillStyle = corHex || '#ffffff';
        ctx.fillRect(0, 0, w, h);
        // …e a pessoa por cima, recortada pela máscara reampliada.
        var pessoa = canvasDe(w, h);
        var pctx = pessoa.getContext('2d');
        pctx.drawImage(base, 0, 0);
        pctx.globalCompositeOperation = 'destination-in';
        pctx.imageSmoothingQuality = 'high';
        pctx.drawImage(mcv, 0, 0, w, h);
        ctx.drawImage(pessoa, 0, 0);

        base = novo;
        desenhar();
    }

    // ── interação do recorte ──────────────────────────────────────────────

    function posNoCanvas(cv, ev) {
        var r = cv.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
            y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))
        };
    }

    function ligarRecorte() {
        var cv = el('ef-cv');
        if (!cv) return;
        cv.onpointerdown = function (ev) {
            var p = posNoCanvas(cv, ev);
            arrastando = p;
            recorte = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
            cv.setPointerCapture(ev.pointerId);
        };
        cv.onpointermove = function (ev) {
            if (!arrastando) return;
            var p = posNoCanvas(cv, ev);
            recorte = {
                x0: Math.min(arrastando.x, p.x), y0: Math.min(arrastando.y, p.y),
                x1: Math.max(arrastando.x, p.x), y1: Math.max(arrastando.y, p.y)
            };
            desenhar();
        };
        cv.onpointerup = function () {
            arrastando = null;
            if (recorte && (recorte.x1 - recorte.x0 < 0.01 || recorte.y1 - recorte.y0 < 0.01)) {
                recorte = null;
                desenhar();
            }
        };
    }

    // ── casca ─────────────────────────────────────────────────────────────

    function fechar() {
        var ov = el('ef-overlay');
        if (ov) ov.remove();
        document.removeEventListener('keydown', aoTeclado);
        cfg = null; base = null; original = null; recorte = null; arrastando = null;
    }

    function aoTeclado(ev) {
        if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); }
    }

    async function aplicar() {
        if (ocupado || !base) return;
        assarAjustes();
        ocupado = true;
        var btn = el('ef-aplicar');
        if (btn) { btn.disabled = true; btn.textContent = 'Aplicando…'; }
        try {
            var blob = await new Promise(function (res) {
                base.toBlob(function (b) { res(b); }, 'image/jpeg', QUALIDADE);
            });
            if (!blob) throw new Error('o navegador não recodificou a imagem');
            var w = base.width, h = base.height;
            var cb = cfg.aoAplicar;
            fechar();
            await cb(blob, w, h);
        } catch (ex) {
            aviso('Não deu para aplicar: ' + ex.message);
            if (btn) { btn.disabled = false; btn.textContent = '✔ Aplicar à pessoa'; }
        } finally {
            ocupado = false;
        }
    }

    window.abrirEditorDeFoto = async function (config) {
        cfg = config;
        ajustes = { brilho: 0, contraste: 0, saturacao: 0 };
        recorte = null;

        garantirCss();
        var ov = document.createElement('div');
        ov.id = 'ef-overlay';
        ov.innerHTML = `
        <div class="ef-top">
            <h2>✏️ ${esc(cfg.titulo || 'Editar foto')}</h2>
            <span class="ef-tag" id="ef-dpi"></span>
            <button class="ef-btn" style="margin-left:auto" onclick="window.__efFechar()">✕ Cancelar (Esc)</button>
        </div>
        <div class="ef-corpo">
            <div class="ef-palco"><canvas id="ef-cv"></canvas></div>
            <div class="ef-lado">
                <div class="ef-bloco">
                    <h3>Recorte e posição</h3>
                    <div class="ef-tag" style="margin-bottom:8px">Arraste sobre a foto para marcar o recorte.</div>
                    <div class="ef-botoes">
                        <button class="ef-btn" onclick="window.__efRecortar()">▦ Aplicar recorte</button>
                        <button class="ef-btn" onclick="window.__efGirar(-90)" title="Girar 90° para a esquerda">⟲ 90°</button>
                        <button class="ef-btn" onclick="window.__efGirar(90)" title="Girar 90° para a direita">⟳ 90°</button>
                        <button class="ef-btn" onclick="window.__efEspelhar(true)" title="Espelhar na horizontal">↔ espelhar</button>
                    </div>
                </div>
                <div class="ef-bloco">
                    <h3>Ampliar a tela (mais fundo)</h3>
                    <div class="ef-tag" style="margin-bottom:8px">
                        Foto enquadrada demais? Em vez de cortar o ombro, cresça a moldura e complete o fundo que passou a faltar.
                    </div>
                    <div class="ef-linha">
                        <label>Margem</label>
                        <input type="number" class="ef-num" id="ef-margem" min="1" max="100" step="5" value="20">
                        <span class="ef-tag">% do menor lado</span>
                    </div>
                    <div class="ef-linha">
                        <label>Completar com</label>
                        <select class="ef-sel" id="ef-modo-ampliar">
                            <option value="borda">Borda esticada — instantâneo</option>
                            <option value="espelho">Espelhado — instantâneo</option>
                            <option value="ia">IA (baixa 92 MB na 1ª vez)</option>
                        </select>
                    </div>
                    <div class="ef-botoes">
                        <button class="ef-btn" id="ef-ampliar" onclick="window.__efAmpliar()"
                            title="Cresce a moldura pela margem escolhida, dos quatro lados">⤢ Ampliar</button>
                        <button class="ef-btn" id="ef-caber" onclick="window.__efCaberNaJanela()"
                            title="Cresce só o que falta para a foto INTEIRA caber na janela desta credencial, sem corte nenhum">⧉ Caber na janela</button>
                    </div>
                </div>
                <div class="ef-bloco">
                    <h3>Cores e luz</h3>
                    <div class="ef-linha"><label>Brilho</label><input type="range" id="ef-brilho" min="-60" max="60" value="0"><span class="val" id="ef-brilho-v">0</span></div>
                    <div class="ef-linha"><label>Contraste</label><input type="range" id="ef-contraste" min="-60" max="60" value="0"><span class="val" id="ef-contraste-v">0</span></div>
                    <div class="ef-linha"><label>Saturação</label><input type="range" id="ef-saturacao" min="-60" max="60" value="0"><span class="val" id="ef-saturacao-v">0</span></div>
                    <div class="ef-botoes">
                        <button class="ef-btn" onclick="window.__efAutoNivel()" title="Estica os tons entre o preto e o branco reais da foto">✨ Auto-nível</button>
                        <button class="ef-btn" onclick="window.__efNitidez()" title="Realça os contornos (máscara de desfoque)">🔪 Nitidez</button>
                    </div>
                </div>
                <div class="ef-bloco">
                    <h3>Resolução</h3>
                    <div class="ef-linha">
                        <label>dpi na janela</label>
                        <input type="number" class="ef-num" id="ef-dpi-alvo" min="72" max="600" step="10" value="300">
                        <button class="ef-btn" onclick="window.__efReamostrar()">Reamostrar</button>
                    </div>
                    <div class="ef-tag">Para cima interpola (suaviza, não recupera detalhe); para baixo enxuga o arquivo.</div>
                </div>
                <div class="ef-bloco">
                    <h3>Fundo</h3>
                    <div class="ef-linha">
                        <label>Cor nova</label>
                        <input type="color" id="ef-cor-fundo" value="#ffffff" style="width:40px;height:26px;border:none;background:none;padding:0">
                        <button class="ef-btn" id="ef-fundo" onclick="window.__efRemoverFundo()"
                            title="Separa a pessoa do fundo (modelo baixado uma vez, roda neste computador) e preenche com a cor">🪄 Remover fundo</button>
                    </div>
                    <div class="ef-tag">Para completar fundo que falta, use “Ampliar a tela”. Eliminar objetos com pincel é a próxima etapa.</div>
                </div>
                <div class="ef-bloco">
                    <div class="ef-botoes">
                        <button class="ef-btn" onclick="window.__efVoltar()" title="Descarta todas as edições desta janela">↩ Voltar ao original</button>
                    </div>
                </div>
                <div class="ef-msg" id="ef-msg"></div>
            </div>
        </div>
        <div class="ef-rodape">
            <span class="ef-tag">Nada sobe enquanto você edita — o envio acontece no Gravar do Gerenciador.</span>
            <button class="ef-btn primario" id="ef-aplicar" style="margin-left:auto" onclick="window.__efAplicar()">✔ Aplicar à pessoa</button>
        </div>`;
        document.body.appendChild(ov);
        document.addEventListener('keydown', aoTeclado);

        ['brilho', 'contraste', 'saturacao'].forEach(function (nome) {
            var r = el('ef-' + nome);
            r.oninput = function () {
                ajustes[nome === 'saturacao' ? 'saturacao' : nome] = Number(r.value);
                var v = el('ef-' + nome + '-v');
                if (v) v.textContent = r.value;
                desenhar();
            };
        });

        try {
            var bmp = await cfg.obterBitmap();
            var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
            base = canvasDe(w, h);
            base.getContext('2d').drawImage(bmp, 0, 0);
            if (bmp.close) bmp.close();
            original = clonar(base);
            ligarRecorte();
            desenhar();
        } catch (ex) {
            aviso('Não consegui abrir a foto: ' + ex.message);
        }
    };

    window.__efFechar = fechar;
    window.__efAplicar = aplicar;
    window.__efRecortar = aplicarRecorte;
    window.__efGirar = girar;
    window.__efEspelhar = espelhar;
    window.__efAutoNivel = autoNivel;
    window.__efNitidez = function () { nitidez(0.6); };
    window.__efVoltar = function () {
        if (!original) return;
        base = clonar(original);
        recorte = null;
        ajustes = { brilho: 0, contraste: 0, saturacao: 0 };
        ['ef-brilho', 'ef-contraste', 'ef-saturacao'].forEach(function (id) {
            var r = el(id);
            if (r) { r.value = 0; var v = el(id + '-v'); if (v) v.textContent = '0'; }
        });
        aviso('');
        desenhar();
    };
    window.__efReamostrar = function () {
        var alvo = Number(el('ef-dpi-alvo').value) || 300;
        reamostrarParaDpi(Math.max(72, Math.min(600, alvo)));
    };
    /**
     * As duas portas da ampliação. A demora só existe no modo IA, e ela é
     * dita antes de começar: 92 MB na primeira vez de cada estação, e uns
     * segundos de conta a cada foto. Botão que trava sem explicar parece
     * defeito.
     */
    async function correrAmpliacao(m) {
        if (ocupado) return;
        var modo = (el('ef-modo-ampliar') || {}).value || 'borda';
        var botoes = [el('ef-ampliar'), el('ef-caber')];
        ocupado = true;
        botoes.forEach(function (b) { if (b) b.disabled = true; });
        if (modo === 'ia') {
            aviso('Completando com IA… Na primeira vez desta estação o modelo baixa (88 MB) e fica guardado. '
                + 'Com placa de vídeo são poucos segundos; só no processador, uns 20 s por foto. '
                + 'Se for pressa, “Borda esticada” é instantâneo e resolve fundo liso.');
        }
        try {
            await ampliar(m, modo);
            if (modo === 'ia') aviso('');
        } catch (ex) {
            console.warn('[EditorFoto] ampliar falhou', ex);
            aviso(modo === 'ia'
                ? 'A IA não completou agora (' + ex.message + '). Escolha “Borda esticada” ou “Espelhado” — são instantâneos e não dependem de rede.'
                : 'Não deu para ampliar: ' + ex.message);
        } finally {
            ocupado = false;
            botoes.forEach(function (b) { if (b) b.disabled = false; });
        }
    }

    window.__efAmpliar = function () {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        var pct = Math.max(1, Math.min(100, Number((el('ef-margem') || {}).value) || 20));
        return correrAmpliacao(margensUniformes(pct));
    };

    window.__efCaberNaJanela = function () {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        return correrAmpliacao(margensParaCaberNaJanela());
    };

    window.__efRemoverFundo = async function () {
        if (ocupado) return;
        ocupado = true;
        var btn = el('ef-fundo');
        if (btn) { btn.disabled = true; btn.textContent = 'Separando…'; }
        aviso('Baixando o modelo na primeira vez (uns 5 MB)…');
        try {
            await removerFundo(el('ef-cor-fundo').value);
            aviso('');
        } catch (ex) {
            console.warn('[EditorFoto] remover fundo falhou', ex);
            aviso('Remoção de fundo indisponível agora (' + ex.message + '). As demais edições seguem funcionando.');
        } finally {
            ocupado = false;
            if (btn) { btn.disabled = false; btn.textContent = '🪄 Remover fundo'; }
        }
    };
})();
