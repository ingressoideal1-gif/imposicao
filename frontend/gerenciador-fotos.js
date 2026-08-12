/* ===========================================================================
   Gerenciador de Fotos — o lote de fotos vira dado variável
   ---------------------------------------------------------------------------
   Duas telas, na ordem em que o trabalho acontece numa gráfica:

     1. IMPORTAR — o lote chega como veio do cliente (nomes sem padrão,
        formatos variados, arquivos a mais, pessoas a menos). Cada arquivo é
        normalizado no navegador, casado com uma linha do banco, e o que não
        casou aparece em pilhas para o operador resolver na mão.

     2. ENQUADRAR — a folha de contato. Todas as fotos já dentro da janela real
        do modelo, para o operador percorrer o lote e corrigir só as tortas.
        É a tela que nenhum concorrente tem: cardPresso, BarTender e o Data
        Merge do InDesign corrigem um registro por vez.

   Como o csv-editor.js, este arquivo NÃO enxerga o `state` do editor. Recebe
   tudo por `abrirGerenciadorDeFotos({...})` e devolve por `onAplicar`.

   A normalização antes do upload não é otimização, é requisito: uma foto de
   celular tem 4 MB e um lote de 500 teria 2 GB subindo e descendo. Reduzida a
   300 dpi da janela, com 30% de folga para o zoom, cada uma fica em ~150 KB.
   Sem isso a biblioteca de fotos vira o tempo de rede que o agente local
   existe para não pagar.
   =========================================================================== */

(function () {
    'use strict';

    var DPI_ALVO = 300;      // resolução de impressão pretendida dentro da janela
    var FOLGA_ZOOM = 1.3;    // 30% a mais, para o operador aproximar sem borrar
    var DPI_MINIMO = 150;    // abaixo disto, rosto borrado em PVC
    var POR_PAGINA = 48;     // cartões por página da folha de contato
    var QUALIDADE = 0.9;

    var cfg = null;          // configuração da sessão aberta
    var fotos = [];          // { nome, blob, url, hash, w, h, dpi }
    var resultado = null;    // saída do casarFotos
    var selecionado = null;  // { tipo: 'sobrando'|'linha', chave }
    var aba = 'importar';
    var pagina = 0;
    var focoEnquadro = -1;   // índice da linha em ajuste na folha de contato

    // ══════════════════════════════════════════════════════════════════════
    // Normalização — EXIF, tamanho, formato
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Quantos pixels aquela foto precisa ter para imprimir a 300 dpi na janela.
     * Nunca amplia: uma foto pequena continua pequena, e o aviso de dpi baixo é
     * que vai contar a verdade ao operador.
     */
    function escalaAlvo(iw, ih, jw_mm, jh_mm) {
        var precisaW = (jw_mm / 25.4) * DPI_ALVO;
        var precisaH = (jh_mm / 25.4) * DPI_ALVO;
        var f = Math.max(precisaW / iw, precisaH / ih) * FOLGA_ZOOM;
        return Math.min(1, f);
    }

    async function carregarBitmap(file) {
        // imageOrientation: 'from-image' resolve o EXIF — sem isso, metade das
        // fotos de celular entra deitada e o operador corrige uma a uma.
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (e) { /* navegador antigo: cai no <img> abaixo */ }
        }
        return await new Promise(function (res, rej) {
            var img = new Image();
            var url = URL.createObjectURL(file);
            img.onload = function () { URL.revokeObjectURL(url); res(img); };
            img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('imagem ilegível')); };
            img.src = url;
        });
    }

    async function hashDoBlob(blob) {
        try {
            var buf = await blob.arrayBuffer();
            var dig = await crypto.subtle.digest('SHA-256', buf);
            return Array.from(new Uint8Array(dig)).slice(0, 12)
                .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        } catch (e) {
            // Sem crypto.subtle (http sem TLS): o nome e o tamanho já separam o
            // lote bem o bastante para servir de chave de arquivo.
            return String(blob.size) + '_' + Math.random().toString(36).slice(2, 10);
        }
    }

    /**
     * Onde está o rosto, em fração da imagem. Só o retângulo é guardado — o
     * executável do agente não ganha nenhuma biblioteca de visão computacional.
     * Sem detector, o padrão é o terço superior: é onde a cabeça está em
     * praticamente toda foto de documento.
     */
    async function acharRosto(bitmap) {
        try {
            if (typeof window.FaceDetector === 'function') {
                var det = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
                var caras = await det.detect(bitmap);
                if (caras && caras.length) {
                    var b = caras[0].boundingBox;
                    return {
                        cx: (b.x + b.width / 2) / bitmap.width,
                        // Um pouco abaixo do centro do rosto: retrato de credencial
                        // pede ombro, não só cabeça.
                        cy: Math.min(0.9, (b.y + b.height * 0.75) / bitmap.height),
                        auto: 'rosto'
                    };
                }
            }
        } catch (e) { /* detector indisponível ou falhou: cai no padrão */ }
        return { cx: 0.5, cy: 0.4, auto: 'padrao' };
    }

    async function normalizarFoto(file, janela) {
        var bmp = await carregarBitmap(file);
        var iw = bmp.width || bmp.naturalWidth;
        var ih = bmp.height || bmp.naturalHeight;
        var esc = escalaAlvo(iw, ih, janela.w_mm, janela.h_mm);
        var lw = Math.max(1, Math.round(iw * esc));
        var lh = Math.max(1, Math.round(ih * esc));

        var cv = document.createElement('canvas');
        cv.width = lw; cv.height = lh;
        var ctx = cv.getContext('2d', { colorSpace: 'srgb' });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0, lw, lh);

        var rosto = await acharRosto(bmp);
        if (bmp.close) bmp.close();

        var blob = await new Promise(function (res) {
            cv.toBlob(function (b) { res(b); }, 'image/jpeg', QUALIDADE);
        });
        if (!blob) throw new Error('o navegador não conseguiu recodificar a imagem');

        var hash = await hashDoBlob(blob);
        var dpi = window.dpiNaJanela(lw, lh, janela.w_mm, janela.h_mm, janela.fit, 1);

        return {
            nome: file.name, blob: blob, hash: hash,
            url: URL.createObjectURL(blob),
            w: lw, h: lh, dpi: dpi, cx: rosto.cx, cy: rosto.cy, auto: rosto.auto,
            origemW: iw, origemH: ih
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    // Estilo e casca do modal
    // ══════════════════════════════════════════════════════════════════════

    var CSS = `
#gf-overlay{position:fixed;inset:0;z-index:1000000;background:rgba(2,6,23,.94);
  display:flex;flex-direction:column;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;font-size:13px}
#gf-overlay *{box-sizing:border-box}
.gf-top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #1e293b;flex-wrap:wrap}
.gf-top h2{margin:0;font-size:15px;font-weight:600}
.gf-abas{display:flex;gap:4px;margin-left:8px}
.gf-aba{padding:6px 14px;border-radius:6px 6px 0 0;background:#0f172a;border:1px solid #1e293b;
  border-bottom:none;cursor:pointer;color:#94a3b8}
.gf-aba.on{background:#1e293b;color:#e2e8f0}
.gf-corpo{flex:1;overflow:auto;padding:16px}
.gf-rodape{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid #1e293b;flex-wrap:wrap}
.gf-btn{padding:7px 14px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer}
.gf-btn:hover{background:#334155}
.gf-btn.primario{background:#2563eb;border-color:#2563eb;color:#fff}
.gf-btn.primario:disabled{opacity:.45;cursor:not-allowed}
.gf-drop{border:2px dashed #334155;border-radius:10px;padding:34px;text-align:center;color:#94a3b8;cursor:pointer}
.gf-drop.sobre{border-color:#3b82f6;background:rgba(59,130,246,.08);color:#e2e8f0}
.gf-pilhas{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:16px}
.gf-pilha{background:#0f172a;border:1px solid #1e293b;border-radius:10px;display:flex;flex-direction:column;min-height:160px}
.gf-pilha h3{margin:0;padding:10px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #1e293b;
  display:flex;justify-content:space-between;align-items:center}
.gf-pilha .lista{overflow:auto;max-height:44vh;padding:6px}
.gf-item{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:6px;cursor:pointer}
.gf-item:hover{background:#1e293b}
.gf-item.sel{background:#1d4ed8}
.gf-item img{width:30px;height:38px;object-fit:cover;border-radius:3px;background:#1e293b;flex:none}
.gf-item .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf-tag{font-size:10px;color:#64748b}
.gf-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:12px}
.gf-card{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:8px;text-align:center}
.gf-card.foco{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.35)}
.gf-card canvas{width:100%;height:auto;border-radius:4px;background:#020617;cursor:grab;display:block}
.gf-card .rot{font-size:11px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf-card .dpi{font-size:10px;color:#64748b}
.gf-card .dpi.ruim{color:#f87171;font-weight:600}
.gf-vazio{color:#64748b;padding:22px;text-align:center}
.gf-aviso{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#fbbf24;
  padding:8px 12px;border-radius:8px;margin-bottom:12px}
.gf-prog{height:6px;background:#1e293b;border-radius:3px;overflow:hidden;flex:1;min-width:140px}
.gf-prog i{display:block;height:100%;background:#3b82f6;width:0}
`;

    function garantirCss() {
        if (document.getElementById('gf-css')) return;
        var s = document.createElement('style');
        s.id = 'gf-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function el(id) { return document.getElementById(id); }

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /** Como identificar uma linha na tela: a primeira coluna com texto. */
    function rotuloDaLinha(i) {
        var r = cfg.rows[i] || {};
        for (var k = 0; k < cfg.headers.length; k++) {
            var v = r[cfg.headers[k]];
            if (v != null && String(v).trim() && cfg.headers[k] !== cfg.coluna) {
                return String(v).slice(0, 28);
            }
        }
        return 'linha ' + (i + 1);
    }

    function linhasAtivas() {
        var out = [];
        cfg.rows.forEach(function (r, i) { if (!r || r.__ativo !== false) out.push(i); });
        return out;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Tela 1 — importar e casar
    // ══════════════════════════════════════════════════════════════════════

    function htmlImportar() {
        if (!fotos.length) {
            return `
            <div class="gf-drop" id="gf-drop">
                <div style="font-size:30px">🖼️</div>
                <div style="margin-top:8px;font-size:14px;color:#e2e8f0">Solte aqui o lote de fotos</div>
                <div style="margin-top:6px">ou clique para escolher — aceita a pasta inteira, JPG, PNG, WEBP e HEIC</div>
                <div class="gf-tag" style="margin-top:14px">
                    As fotos são reduzidas para 300 dpi desta janela (${cfg.janela.w_mm} × ${cfg.janela.h_mm} mm)
                    antes de subir, e casadas com as linhas pelo nome do arquivo.
                </div>
            </div>`;
        }

        var r = resultado || { casadas: [], ambiguas: [], sobrando: [], semFoto: [] };
        var baixaRes = r.casadas.filter(function (c) { return fotoDe(c.arquivo) && fotoDe(c.arquivo).dpi < DPI_MINIMO; }).length;

        return `
        ${baixaRes ? `<div class="gf-aviso">⚠️ ${baixaRes} foto(s) abaixo de ${DPI_MINIMO} dpi nesta janela — vão sair borradas no PVC. Elas aparecem marcadas na aba Enquadrar.</div>` : ''}
        <div class="gf-tag">
            ${fotos.length} arquivo(s) no lote · ${linhasAtivas().length} linha(s) que imprimem.
            Clique numa foto sobrando e depois numa linha sem foto para ligar as duas.
        </div>
        <div class="gf-pilhas">
            ${pilhaCasadas(r)}
            ${pilhaAmbiguas(r)}
            ${pilhaSobrando(r)}
            ${pilhaSemFoto(r)}
        </div>`;
    }

    function fotoDe(nome) {
        return fotos.find(function (f) { return f.nome === nome; }) || null;
    }

    function pilhaCasadas(r) {
        return `
        <div class="gf-pilha">
            <h3>✅ Casadas <span class="gf-tag">${r.casadas.length}</span></h3>
            <div class="lista">
                ${r.casadas.length ? r.casadas.map(function (c) {
            var f = fotoDe(c.arquivo);
            return `<div class="gf-item" onclick="window.__gfDesfazer('${esc(c.arquivo)}')" title="clique para desfazer">
                        <img src="${f ? f.url : ''}" alt="">
                        <div class="txt">${esc(rotuloDaLinha(c.linha))}<br><span class="gf-tag">${esc(c.arquivo)} · ${esc(c.regra)}</span></div>
                    </div>`;
        }).join('') : '<div class="gf-vazio">nenhuma ainda</div>'}
            </div>
        </div>`;
    }

    function pilhaAmbiguas(r) {
        return `
        <div class="gf-pilha">
            <h3>❓ Ambíguas <span class="gf-tag">${r.ambiguas.length}</span></h3>
            <div class="lista">
                ${r.ambiguas.length ? r.ambiguas.map(function (a, i) {
            return `<div style="padding:6px;border-bottom:1px solid #1e293b">
                        <div class="gf-tag">${esc(a.motivo)}</div>
                        ${a.candidatos.map(function (c) {
                var f = fotoDe(c.arquivo);
                return a.linhas.map(function (li) {
                    return `<div class="gf-item" onclick="window.__gfResolver(${i},'${esc(c.arquivo)}',${li})">
                                    <img src="${f ? f.url : ''}" alt="">
                                    <div class="txt">${esc(c.arquivo)} → ${esc(rotuloDaLinha(li))}</div>
                                </div>`;
                }).join('');
            }).join('')}
                    </div>`;
        }).join('') : '<div class="gf-vazio">nada em dúvida</div>'}
            </div>
        </div>`;
    }

    function pilhaSobrando(r) {
        return `
        <div class="gf-pilha">
            <h3>📦 Fotos sem linha <span class="gf-tag">${r.sobrando.length}</span></h3>
            <div class="lista">
                ${r.sobrando.length ? r.sobrando.map(function (s) {
            var f = fotoDe(s.nome);
            var sel = selecionado && selecionado.tipo === 'sobrando' && selecionado.chave === s.nome;
            return `<div class="gf-item ${sel ? 'sel' : ''}" onclick="window.__gfPegar('${esc(s.nome)}')">
                        <img src="${f ? f.url : ''}" alt="">
                        <div class="txt">${esc(s.nome)}</div>
                    </div>`;
        }).join('') : '<div class="gf-vazio">todas encontraram dono</div>'}
            </div>
        </div>`;
    }

    function pilhaSemFoto(r) {
        return `
        <div class="gf-pilha">
            <h3>🚫 Linhas sem foto <span class="gf-tag">${r.semFoto.length}</span></h3>
            <div class="lista">
                ${r.semFoto.length ? r.semFoto.map(function (li) {
            return `<div class="gf-item" onclick="window.__gfSoltar(${li})">
                        <div style="width:30px;height:38px;border-radius:3px;background:#1e293b;flex:none"></div>
                        <div class="txt">${esc(rotuloDaLinha(li))}<br><span class="gf-tag">linha ${li + 1}</span></div>
                    </div>`;
        }).join('') : '<div class="gf-vazio">toda linha tem foto 🎉</div>'}
            </div>
        </div>`;
    }

    // ── Ações das pilhas ──────────────────────────────────────────────────

    window.__gfPegar = function (nome) {
        selecionado = { tipo: 'sobrando', chave: nome };
        pintar();
    };

    window.__gfSoltar = function (linha) {
        if (!selecionado || selecionado.tipo !== 'sobrando') {
            aviso('Escolha antes uma foto na pilha "Fotos sem linha".');
            return;
        }
        ligar(selecionado.chave, linha, 'manual');
        selecionado = null;
        pintar();
    };

    window.__gfResolver = function (idxAmbigua, arquivo, linha) {
        var a = resultado.ambiguas[idxAmbigua];
        if (!a) return;
        ligar(arquivo, linha, 'manual');
        // O que sobrou daquela dúvida volta para as pilhas de sobra, para não
        // sumir de vista: foto não escolhida ainda é foto que alguém enviou.
        resultado.ambiguas.splice(idxAmbigua, 1);
        a.candidatos.forEach(function (c) {
            if (c.arquivo !== arquivo && !jaCasada(c.arquivo)) {
                resultado.sobrando.push({ nome: c.arquivo, ref: c.ref });
            }
        });
        a.linhas.forEach(function (li) {
            if (li !== linha && !linhaCasada(li)) resultado.semFoto.push(li);
        });
        pintar();
    };

    window.__gfDesfazer = function (arquivo) {
        var i = resultado.casadas.findIndex(function (c) { return c.arquivo === arquivo; });
        if (i < 0) return;
        var c = resultado.casadas[i];
        resultado.casadas.splice(i, 1);
        resultado.sobrando.push({ nome: c.arquivo, ref: c.ref });
        if (!linhaCasada(c.linha)) resultado.semFoto.push(c.linha);
        resultado.semFoto.sort(function (a, b) { return a - b; });
        pintar();
    };

    function jaCasada(arquivo) {
        return resultado.casadas.some(function (c) { return c.arquivo === arquivo; });
    }

    function linhaCasada(linha) {
        return resultado.casadas.some(function (c) { return c.linha === linha; });
    }

    function ligar(arquivo, linha, regra) {
        resultado.casadas = resultado.casadas.filter(function (c) {
            return c.arquivo !== arquivo && c.linha !== linha;
        });
        resultado.casadas.push({ arquivo: arquivo, linha: linha, regra: regra });
        resultado.sobrando = resultado.sobrando.filter(function (s) { return s.nome !== arquivo; });
        resultado.semFoto = resultado.semFoto.filter(function (li) { return li !== linha; });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Tela 2 — folha de contato
    // ══════════════════════════════════════════════════════════════════════

    function htmlEnquadrar() {
        var casadas = (resultado && resultado.casadas) || [];
        if (!casadas.length) {
            return '<div class="gf-vazio">Nenhuma foto casada ainda. Comece pela aba Importar.</div>';
        }
        var paginas = Math.ceil(casadas.length / POR_PAGINA);
        var ini = pagina * POR_PAGINA;
        var fatia = casadas.slice(ini, ini + POR_PAGINA);

        return `
        <div class="gf-tag" style="margin-bottom:10px">
            Roda do mouse aproxima · arrastar move · as setas do teclado trocam de foto · duplo clique volta ao enquadramento automático.
            ${paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ''}
        </div>
        <div class="gf-grade">
            ${fatia.map(function (c, k) {
            var f = fotoDe(c.arquivo);
            var idx = ini + k;
            var ruim = f && f.dpi < DPI_MINIMO;
            return `<div class="gf-card ${focoEnquadro === idx ? 'foco' : ''}" id="gf-card-${idx}">
                    <canvas id="gf-cv-${idx}" data-idx="${idx}"></canvas>
                    <div class="rot">${esc(rotuloDaLinha(c.linha))}</div>
                    <div class="dpi ${ruim ? 'ruim' : ''}">${f ? f.dpi + ' dpi' : ''}${ruim ? ' ⚠' : ''}</div>
                </div>`;
        }).join('')}
        </div>
        ${paginas > 1 ? `
        <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
            <button class="gf-btn" onclick="window.__gfPagina(-1)" ${pagina === 0 ? 'disabled' : ''}>← anterior</button>
            <button class="gf-btn" onclick="window.__gfPagina(1)" ${pagina >= paginas - 1 ? 'disabled' : ''}>próxima →</button>
        </div>` : ''}`;
    }

    window.__gfPagina = function (d) {
        pagina = Math.max(0, pagina + d);
        pintar();
    };

    /** Desenha um cartão da folha de contato com o MESMO recorte do papel. */
    function pintarCartao(idx) {
        var c = resultado.casadas[idx];
        if (!c) return;
        var f = fotoDe(c.arquivo);
        var cv = el('gf-cv-' + idx);
        if (!cv || !f) return;

        var jw = cfg.janela.w_mm, jh = cfg.janela.h_mm;
        var larg = 116;
        var alt = Math.round(larg * (jh / jw));
        var dpr = window.devicePixelRatio || 1;
        cv.width = larg * dpr; cv.height = alt * dpr;
        cv.style.height = alt + 'px';
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, larg, alt);
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, larg, alt);

        var img = window.fotoImagem(f.url, function () { pintarCartao(idx); });
        if (!img) return;
        window.desenharJanelaFoto(ctx, img, 0, 0, larg, alt, enquadroDe(c), cfg.janela.fit);
    }

    /** O enquadramento vivo daquela linha (o que a folha de contato edita). */
    function enquadroDe(c) {
        if (!c.enq) {
            var f = fotoDe(c.arquivo);
            c.enq = { cx: f ? f.cx : 0.5, cy: f ? f.cy : 0.4, zoom: 1, rot: 0 };
        }
        return c.enq;
    }

    function ligarInteracaoDosCartoes() {
        var casadas = (resultado && resultado.casadas) || [];
        var ini = pagina * POR_PAGINA;
        casadas.slice(ini, ini + POR_PAGINA).forEach(function (c, k) {
            var idx = ini + k;
            var cv = el('gf-cv-' + idx);
            if (!cv) return;
            pintarCartao(idx);

            cv.addEventListener('wheel', function (ev) {
                ev.preventDefault();
                var e = enquadroDe(c);
                e.zoom = Math.min(4, Math.max(1, e.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)));
                focoEnquadro = idx;
                pintarCartao(idx);
                marcarFoco();
            }, { passive: false });

            var arrastando = false, ox = 0, oy = 0;
            cv.addEventListener('pointerdown', function (ev) {
                arrastando = true; ox = ev.clientX; oy = ev.clientY;
                focoEnquadro = idx;
                marcarFoco();
                cv.setPointerCapture(ev.pointerId);
            });
            cv.addEventListener('pointermove', function (ev) {
                if (!arrastando) return;
                var e = enquadroDe(c);
                // O arrasto move a FOTO, então o centro pedido anda ao contrário.
                e.cx = Math.min(1, Math.max(0, e.cx - (ev.clientX - ox) / cv.clientWidth / e.zoom));
                e.cy = Math.min(1, Math.max(0, e.cy - (ev.clientY - oy) / cv.clientHeight / e.zoom));
                ox = ev.clientX; oy = ev.clientY;
                pintarCartao(idx);
            });
            cv.addEventListener('pointerup', function () { arrastando = false; });
            cv.addEventListener('dblclick', function () {
                var f = fotoDe(c.arquivo);
                c.enq = { cx: f ? f.cx : 0.5, cy: f ? f.cy : 0.4, zoom: 1, rot: 0 };
                pintarCartao(idx);
            });
        });
    }

    function marcarFoco() {
        document.querySelectorAll('.gf-card').forEach(function (n) { n.classList.remove('foco'); });
        var n = el('gf-card-' + focoEnquadro);
        if (n) n.classList.add('foco');
    }

    function aoTeclado(ev) {
        if (aba !== 'enquadrar') return;
        var casadas = (resultado && resultado.casadas) || [];
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
            var novo = focoEnquadro + (ev.key === 'ArrowRight' ? 1 : -1);
            if (novo < 0 || novo >= casadas.length) return;
            focoEnquadro = novo;
            var novaPagina = Math.floor(novo / POR_PAGINA);
            if (novaPagina !== pagina) { pagina = novaPagina; pintar(); }
            else marcarFoco();
            ev.preventDefault();
        } else if (ev.key === 'Escape') {
            fechar();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Gravação
    // ══════════════════════════════════════════════════════════════════════

    async function aplicar() {
        var casadas = (resultado && resultado.casadas) || [];
        if (!casadas.length) { aviso('Nada casado para gravar.'); return; }
        if (!cfg.coluna) { aviso('O elemento de foto ainda não aponta para uma coluna do banco.'); return; }

        var btn = el('gf-aplicar');
        var barra = el('gf-barra');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

        var gravadas = 0, falhas = [];
        for (var i = 0; i < casadas.length; i++) {
            var c = casadas[i];
            var f = fotoDe(c.arquivo);
            if (!f) { falhas.push(c.arquivo); continue; }
            try {
                var url = await cfg.subirFoto(f.blob, f.hash);
                if (!url) throw new Error('o Storage não devolveu endereço');
                var e = enquadroDe(c);
                var linha = cfg.rows[c.linha];
                if (!linha.__fotos) linha.__fotos = {};
                linha.__fotos[cfg.coluna] = {
                    ref: f.hash, url: url, arquivo: f.nome,
                    cx: +e.cx.toFixed(4), cy: +e.cy.toFixed(4),
                    zoom: +e.zoom.toFixed(3), rot: e.rot || 0,
                    dpi: window.dpiNaJanela(f.w, f.h, cfg.janela.w_mm, cfg.janela.h_mm, cfg.janela.fit, e.zoom)
                };
                // A célula mostra o nome do arquivo: legível na grade do CSV, e é
                // o que permite reconhecer a foto sem abrir o gerenciador.
                if (!linha[cfg.coluna]) linha[cfg.coluna] = f.nome;
                gravadas++;
            } catch (ex) {
                console.warn('[Fotos] falha ao subir', c.arquivo, ex);
                falhas.push(c.arquivo);
            }
            if (barra) barra.style.width = Math.round((i + 1) / casadas.length * 100) + '%';
        }

        if (btn) { btn.disabled = false; btn.textContent = '✔ Gravar no banco'; }

        cfg.onAplicar({
            gravadas: gravadas,
            falhas: falhas,
            semFoto: (resultado.semFoto || []).slice(),
            coluna: cfg.coluna
        });

        if (falhas.length) {
            aviso(gravadas + ' foto(s) gravadas, ' + falhas.length + ' falharam. As que falharam continuam no lote.');
        } else {
            fechar();
        }
    }

    function aviso(txt) {
        var n = el('gf-msg');
        if (n) { n.textContent = txt; n.style.display = 'block'; }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Casca
    // ══════════════════════════════════════════════════════════════════════

    function pintar() {
        var corpo = el('gf-corpo');
        if (!corpo) return;
        corpo.innerHTML = aba === 'importar' ? htmlImportar() : htmlEnquadrar();

        document.querySelectorAll('.gf-aba').forEach(function (n) {
            n.classList.toggle('on', n.dataset.aba === aba);
        });

        var r = resultado || { casadas: [] };
        var btn = el('gf-aplicar');
        if (btn) {
            btn.disabled = !r.casadas.length;
            btn.textContent = '✔ Gravar ' + (r.casadas.length || '') + ' foto(s) no banco';
        }

        if (aba === 'importar') ligarDropZone();
        else ligarInteracaoDosCartoes();
    }

    function ligarDropZone() {
        var dz = el('gf-drop');
        if (!dz) return;
        dz.onclick = function () { el('gf-file').click(); };
        dz.ondragover = function (ev) { ev.preventDefault(); dz.classList.add('sobre'); };
        dz.ondragleave = function () { dz.classList.remove('sobre'); };
        dz.ondrop = function (ev) {
            ev.preventDefault();
            dz.classList.remove('sobre');
            receberArquivos(Array.from(ev.dataTransfer.files || []));
        };
    }

    async function receberArquivos(lista) {
        var imgs = lista.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|heic|heif)$/i.test(f.name); });
        if (!imgs.length) { aviso('Nenhuma imagem reconhecida no que foi solto.'); return; }

        var corpo = el('gf-corpo');
        corpo.innerHTML = '<div class="gf-vazio">Preparando as fotos… <div class="gf-prog" style="margin-top:10px"><i id="gf-prep"></i></div></div>';

        for (var i = 0; i < imgs.length; i++) {
            try {
                var f = await normalizarFoto(imgs[i], cfg.janela);
                if (!fotos.some(function (x) { return x.nome === f.nome; })) fotos.push(f);
            } catch (ex) {
                console.warn('[Fotos] arquivo ignorado', imgs[i].name, ex);
            }
            var p = el('gf-prep');
            if (p) p.style.width = Math.round((i + 1) / imgs.length * 100) + '%';
        }

        recasar();
        pintar();
    }

    function recasar() {
        var colunas = [];
        if (cfg.coluna) colunas.push(cfg.coluna);
        cfg.headers.forEach(function (h) { if (colunas.indexOf(h) === -1) colunas.push(h); });
        resultado = window.casarFotos(fotos, cfg.rows, colunas);
    }

    function fechar() {
        var ov = el('gf-overlay');
        if (ov) ov.remove();
        document.removeEventListener('keydown', aoTeclado);
        fotos.forEach(function (f) { try { URL.revokeObjectURL(f.url); } catch (e) { } });
        fotos = []; resultado = null; selecionado = null; cfg = null;
        aba = 'importar'; pagina = 0; focoEnquadro = -1;
    }

    window.abrirGerenciadorDeFotos = function (config) {
        if (!window.casarFotos) {
            alert('A biblioteca de fotos (foto-lib.js) não carregou. Recarregue a página.');
            return;
        }
        cfg = config;
        fotos = []; resultado = null; selecionado = null;
        aba = 'importar'; pagina = 0; focoEnquadro = -1;

        garantirCss();
        var ov = document.createElement('div');
        ov.id = 'gf-overlay';
        ov.innerHTML = `
            <div class="gf-top">
                <h2>🖼️ Gerenciador de Fotos</h2>
                <span class="gf-tag">janela ${cfg.janela.w_mm} × ${cfg.janela.h_mm} mm · coluna “${esc(cfg.coluna || '—')}”</span>
                <div class="gf-abas">
                    <div class="gf-aba on" data-aba="importar" onclick="window.__gfAba('importar')">1 · Importar</div>
                    <div class="gf-aba" data-aba="enquadrar" onclick="window.__gfAba('enquadrar')">2 · Enquadrar</div>
                </div>
                <button class="gf-btn" style="margin-left:auto" onclick="window.__gfFechar()">✕ Fechar</button>
            </div>
            <div class="gf-corpo" id="gf-corpo"></div>
            <div class="gf-rodape">
                <div id="gf-msg" class="gf-aviso" style="display:none;margin:0"></div>
                <div class="gf-prog"><i id="gf-barra"></i></div>
                <button class="gf-btn primario" id="gf-aplicar" disabled onclick="window.__gfAplicar()">✔ Gravar no banco</button>
            </div>
            <input type="file" id="gf-file" multiple accept="image/*" style="display:none">`;
        document.body.appendChild(ov);

        el('gf-file').addEventListener('change', function (ev) {
            receberArquivos(Array.from(ev.target.files || []));
            ev.target.value = '';
        });
        document.addEventListener('keydown', aoTeclado);
        pintar();
    };

    window.__gfAba = function (a) {
        aba = a;
        if (a === 'enquadrar' && focoEnquadro < 0) focoEnquadro = 0;
        pintar();
    };
    window.__gfFechar = fechar;
    window.__gfAplicar = aplicar;
})();
