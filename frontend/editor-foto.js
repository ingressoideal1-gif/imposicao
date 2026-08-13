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

   As operações GENERATIVAS (eliminar objetos, completar fundo) ficam para a
   fase da API externa: exigem modelo generativo, que não roda nas estações.

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

    // ── remover fundo (modelo leve, baixado uma vez) ──────────────────────

    var ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
    // No NOSSO Storage, nunca no GitHub: asset de release nao manda CORS (o
    // navegador recusa), e a producao nao pode depender de github.com no ar.
    // Subido e conferido por sha256 pela ferramenta subir_modelo_fundo.ps1;
    // para trocar de modelo, suba com OUTRO nome (CDN da Cloudflare na frente).
    var MODELO_URL = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/modelos/u2netp.onnx';
    var modeloSessao = null;

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

    async function carregarModelo() {
        if (modeloSessao) return modeloSessao;
        await carregarOrt();
        var resp = await fetch(MODELO_URL);
        if (!resp.ok) throw new Error('o modelo respondeu ' + resp.status);
        var bytes = new Uint8Array(await resp.arrayBuffer());
        modeloSessao = await window.ort.InferenceSession.create(bytes, {
            executionProviders: ['wasm']
        });
        return modeloSessao;
    }

    /**
     * Segmenta a pessoa (u2netp, 320×320) e compõe sobre a cor escolhida.
     * É o clássico da foto de documento: fundo bagunçado vira fundo liso.
     */
    async function removerFundo(corHex) {
        if (!base) { aviso('A foto ainda não carregou.'); return; }
        assarAjustes();
        var sess = await carregarModelo();

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
                    <div class="ef-tag">Eliminar objetos e completar fundo chegam na próxima etapa, com IA generativa.</div>
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
