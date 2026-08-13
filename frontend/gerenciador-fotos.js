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
    var DPI_MINIMO = 200;    // abaixo disto, selo vermelho no cartão
    var DPI_TETO = 350;      // acima disto depois de enquadrada, é excesso...
    var DPI_QUEIMA = 300;    // ...e o Gravar reamostra para cá: arquivo menor, RIP mais rápido
    var POR_PAGINA = 48;     // cartões por página da folha de contato
    var QUALIDADE = 0.9;

    var cfg = null;          // configuração da sessão aberta
    var fotos = [];          // { nome, blob, url, hash, w, h, dpi, noBanco }
    var resultado = null;    // saída do casarFotos
    var selecionado = null;  // { tipo: 'sobrando'|'linha', chave }
    var aba = 'importar';
    var pagina = 0;
    var focoEnquadro = -1;   // índice da linha em ajuste na folha de contato
    var colunaId = '';       // coluna que identifica a pessoa na tela
    var trocandoLinha = -1;  // linha cuja foto está sendo substituída

    // Duplas separadas na mão ('arquivo|linha' → true). Sem esta memória o
    // botão de desvincular seria inútil exatamente quando os nomes batem: o
    // próximo recasamento automático juntaria os dois de novo.
    var divorcios = {};

    // Divórcios por sessão de numeração+coluna, para sobreviverem ao fechar e
    // reabrir da tela — mesma vida útil das sobras logo abaixo.
    var divorciosGuardados = new Map();

    // Fotos que ainda não acharam dono, guardadas por numeração+coluna.
    //
    // Elas não pertencem a nenhuma linha, então não têm onde ser gravadas — e
    // some daí a regra: gravar o lote NÃO pode fazê-las desaparecer. Numa
    // gráfica, a foto sobrando quase sempre é de alguém que ainda vai entrar na
    // lista, ou é a mesma pessoa com o nome escrito de outro jeito. Jogá-la fora
    // obrigaria o operador a reimportar o pendrive inteiro.
    //
    // O limite honesto: isto vive na aba aberta. Recarregar a página perde o que
    // não foi ligado a ninguém — por isso existe o relatório.
    var sobrasGuardadas = new Map();

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
    // Reamostragem — interpolar para cima, queimar para baixo, editar
    // ══════════════════════════════════════════════════════════════════════

    /**
     * O arquivo daquela foto, esteja onde estiver: o blob local do lote, ou o
     * endereço no Storage (foto que veio do banco). O Storage responde com CORS
     * liberado, então dá para trazer os bytes de volta e reprocessar.
     */
    async function bitmapDaFoto(f) {
        var blob = f.blob;
        if (!blob) {
            var origem = f.remota || f.url;
            if (!origem || !/^(https?:|blob:|data:)/i.test(origem)) throw new Error('foto sem arquivo acessível');
            var resp = await fetch(origem);
            if (!resp.ok) throw new Error('o Storage respondeu ' + resp.status);
            blob = await resp.blob();
        }
        return { bmp: await carregarBitmap(blob), blob: blob };
    }

    /**
     * Reamostra a foto por um fator e a põe no lugar da antiga, marcando para
     * subir de novo no Gravar (hash novo). O fator é a conta inteira: o dpi na
     * janela é linear no tamanho do pixel, então chegar ao dpi X a partir do
     * dpi Y é multiplicar as dimensões por X/Y.
     *
     * Interpolar (fator > 1) suaviza o serrilhado, não recupera detalhe — quem
     * chama marca `f.interpolada` para o cartão contar essa verdade.
     */
    async function reamostrarFoto(f, fator) {
        var par = await bitmapDaFoto(f);
        var bmp = par.bmp;
        var lw = Math.max(1, Math.round(bmp.width * fator));
        var lh = Math.max(1, Math.round(bmp.height * fator));

        var cv = document.createElement('canvas');
        cv.width = lw; cv.height = lh;
        var ctx = cv.getContext('2d', { colorSpace: 'srgb' });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0, lw, lh);
        if (bmp.close) bmp.close();

        var blob = await new Promise(function (res) {
            cv.toBlob(function (b) { res(b); }, 'image/jpeg', QUALIDADE);
        });
        if (!blob) throw new Error('o navegador não recodificou a imagem');

        substituirArquivoDaFoto(f, blob, lw, lh, await hashDoBlob(blob));
    }

    /**
     * Troca os bytes de uma foto mantendo o NOME — é pelo nome que os vínculos
     * apontam. `noBanco` cai: bytes novos precisam subir no próximo Gravar.
     */
    function substituirArquivoDaFoto(f, blob, w, h, hash) {
        try { if (f.blob) URL.revokeObjectURL(f.url); } catch (e) { }
        f.blob = blob;
        f.url = URL.createObjectURL(blob);
        f.hash = hash;
        f.w = w; f.h = h;
        f.noBanco = false;
        f.remota = null;
        // Os marcadores descrevem os bytes ANTIGOS. Quem reamostra volta a
        // marcar logo em seguida; quem edita no editor não deve herdar um
        // "interp." que já não vale.
        f.interpolada = false;
        f.queimada = false;
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
.gf-card .dpi.alta{color:#38bdf8}
.gf-drop.compacta{padding:12px;margin-bottom:4px}
.gf-sel{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:5px 8px;font-size:12px}
.gf-duvida{padding:8px;border-bottom:1px solid #1e293b}
.gf-par{display:flex;gap:8px;align-items:center;padding:6px;border:1px solid #334155;border-radius:8px;
  margin-bottom:6px;cursor:pointer;background:#0b1220}
.gf-par:hover{border-color:#3b82f6;background:#111c33}
.gf-par img{width:38px;height:48px;object-fit:cover;border-radius:4px;background:#1e293b;flex:none}
.gf-lados{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.gf-lado{display:flex;flex-direction:column;min-width:0;flex:1}
.gf-lado b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.gf-rot{font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf-seta{color:#475569;flex:none}
.gf-card.faltante{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.07)}
.gf-semfoto{height:0;padding-bottom:128%;position:relative;border-radius:4px;
  background:repeating-linear-gradient(45deg,rgba(239,68,68,.10) 0 8px,rgba(239,68,68,.22) 8px 16px);
  color:#f87171;font-weight:700;font-size:11px;line-height:1.15;letter-spacing:.5px}
.gf-semfoto::after{content:'SEM FOTO';position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.gf-mini{margin-top:6px;width:100%;font-size:10px;padding:3px 6px;border-radius:5px;
  border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer}
.gf-mini:hover{background:#334155;color:#e2e8f0}
.gf-acoes{display:flex;gap:4px}
.gf-acoes .gf-mini{width:auto;flex:1}
.gf-vazio{color:#64748b;padding:22px;text-align:center}
.gf-aviso{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#fbbf24;
  padding:8px 12px;border-radius:8px;margin-bottom:12px}
.gf-queima{font-size:11px;color:#64748b;margin:0 0 10px;padding:6px 10px;border-radius:8px;
  border:1px solid #1e293b;background:#0f172a}
.gf-queima.on{color:#7dd3fc;border-color:rgba(56,189,248,.4);background:rgba(56,189,248,.1)}
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

    /**
     * A coluna que identifica a pessoa na tela.
     *
     * Sem dizer de QUAL coluna veio o texto, o operador não consegue comparar
     * "Ana Paula" com `ana_paula.jpg` com segurança — pode ser o nome, pode ser
     * o cargo, pode ser um código. Por isso o nome da coluna aparece sempre, e o
     * operador pode trocar qual coluna manda.
     */
    function colunaDeIdentidade() {
        if (colunaId && cfg.headers.indexOf(colunaId) !== -1) return colunaId;
        for (var k = 0; k < cfg.headers.length; k++) {
            if (cfg.headers[k] === cfg.coluna) continue;
            for (var i = 0; i < cfg.rows.length; i++) {
                var v = cfg.rows[i] ? cfg.rows[i][cfg.headers[k]] : null;
                if (v != null && String(v).trim()) return cfg.headers[k];
            }
        }
        return cfg.headers[0] || '';
    }

    /** { coluna, valor } daquela linha, para a tela mostrar os dois. */
    function identidadeDaLinha(i) {
        var col = colunaDeIdentidade();
        var r = cfg.rows[i] || {};
        var v = col ? r[col] : null;
        v = (v == null ? '' : String(v)).trim();
        return { coluna: col, valor: v || ('linha ' + (i + 1)) };
    }

    function rotuloDaLinha(i) {
        var id = identidadeDaLinha(i);
        return id.valor.slice(0, 40);
    }

    /** As demais colunas da linha, para desempatar uma ambiguidade. */
    function detalhesDaLinha(i, limite) {
        var r = cfg.rows[i] || {};
        var col = colunaDeIdentidade();
        var out = [];
        for (var k = 0; k < cfg.headers.length && out.length < (limite || 3); k++) {
            var h = cfg.headers[k];
            if (h === col || h === cfg.coluna) continue;
            var v = r[h];
            if (v == null || !String(v).trim()) continue;
            out.push({ coluna: h, valor: String(v).slice(0, 30) });
        }
        return out;
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
        var r = resultado || { casadas: [], ambiguas: [], sobrando: [], semFoto: [] };
        var baixaRes = r.casadas.filter(function (c) { var f = fotoDe(c.arquivo); return f && f.dpi && f.dpi < DPI_MINIMO; }).length;
        var primeiraVez = !fotos.length;

        // A zona de soltar NUNCA some. O lote de uma gráfica chega em pedaços —
        // um pendrive hoje, um WhatsApp amanhã — e ter de gravar para poder
        // trazer mais fotos obrigaria o operador a fechar e reabrir a tela a
        // cada leva.
        var solta = `
        <div class="gf-drop ${primeiraVez ? '' : 'compacta'}" id="gf-drop">
            <div style="font-size:${primeiraVez ? 30 : 18}px">🖼️</div>
            <div style="margin-top:6px;font-size:${primeiraVez ? 14 : 13}px;color:#e2e8f0">
                ${primeiraVez ? 'Solte aqui o lote de fotos' : '➕ Solte mais fotos aqui (o que já foi casado não se perde)'}
            </div>
            <div style="margin-top:4px">ou clique para escolher — aceita a pasta inteira, JPG, PNG, WEBP e HEIC</div>
            ${primeiraVez ? `<div class="gf-tag" style="margin-top:14px">
                As fotos são reduzidas para 300 dpi desta janela (${cfg.janela.w_mm} × ${cfg.janela.h_mm} mm)
                antes de subir, e casadas com as linhas pelo nome do arquivo.
            </div>` : ''}
        </div>`;

        if (primeiraVez && !r.casadas.length && !r.semFoto.length) return solta;

        return `
        ${baixaRes ? `<div class="gf-aviso">⚠️ ${baixaRes} foto(s) abaixo de ${DPI_MINIMO} dpi nesta janela — qualidade baixa para PVC. Elas aparecem marcadas em vermelho na aba Enquadrar, onde dá para interpolá-las.</div>` : ''}
        ${solta}
        <div style="display:flex;align-items:center;gap:10px;margin:12px 0 4px;flex-wrap:wrap">
            <span class="gf-tag">
                ${fotos.length} foto(s) no lote · ${linhasAtivas().length} linha(s) que imprimem ·
                clique numa foto sobrando e depois numa linha sem foto para ligar as duas
            </span>
            <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
                <label class="gf-tag">Identificar a linha pela coluna</label>
                <select class="gf-sel" onchange="window.__gfColunaId(this.value)">
                    ${cfg.headers.filter(function (h) { return h !== cfg.coluna; })
                .map(function (h) { return `<option value="${esc(h)}" ${colunaDeIdentidade() === h ? 'selected' : ''}>${esc(h)}</option>`; }).join('')}
                </select>
            </span>
        </div>
        <div class="gf-pilhas">
            ${pilhaCasadas(r)}
            ${pilhaAmbiguas(r)}
            ${pilhaSobrando(r)}
            ${pilhaSemFoto(r)}
        </div>`;
    }

    window.__gfColunaId = function (v) {
        colunaId = v;
        pintar();
    };

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

    /**
     * A pilha das dúvidas mostra a COMPARAÇÃO, não só o veredito.
     *
     * Uma ambiguidade só é decidível se o operador enxergar os dois lados: o
     * arquivo (miniatura e nome) e a linha (a coluna de identidade mais as
     * outras colunas que desempatam). "ana.jpg → Ana" não ajuda quando existem
     * duas Anas; "ana.jpg → Nome: Ana · CPF: 123 · Cargo: Portaria" ajuda.
     */
    function pilhaAmbiguas(r) {
        return `
        <div class="gf-pilha">
            <h3>❓ Ambíguas <span class="gf-tag">${r.ambiguas.length}</span></h3>
            <div class="lista">
                ${r.ambiguas.length ? r.ambiguas.map(function (a, i) {
            return `<div class="gf-duvida">
                        <div class="gf-tag" style="margin-bottom:6px">⚠️ ${esc(a.motivo)}</div>
                        ${a.candidatos.map(function (c) {
                var f = fotoDe(c.arquivo);
                return a.linhas.map(function (li) {
                    var id = identidadeDaLinha(li);
                    var extras = detalhesDaLinha(li, 3);
                    return `<div class="gf-par" onclick="window.__gfResolver(${i},'${esc(c.arquivo)}',${li})"
                                     title="clique para usar esta foto nesta linha">
                                    <img src="${f ? f.url : ''}" alt="">
                                    <div class="gf-lados">
                                        <div class="gf-lado">
                                            <span class="gf-rot">arquivo</span>
                                            <b>${esc(c.arquivo)}</b>
                                        </div>
                                        <div class="gf-seta">↔</div>
                                        <div class="gf-lado">
                                            <span class="gf-rot">${esc(id.coluna)} · linha ${li + 1}</span>
                                            <b>${esc(id.valor)}</b>
                                            ${extras.map(function (e) {
                        return `<span class="gf-rot">${esc(e.coluna)}: ${esc(e.valor)}</span>`;
                    }).join('')}
                                        </div>
                                    </div>
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
        var col = colunaDeIdentidade();
        return `
        <div class="gf-pilha">
            <h3>🚫 Linhas sem foto <span class="gf-tag">${r.semFoto.length}</span></h3>
            <div class="lista">
                ${r.semFoto.length ? r.semFoto.map(function (li) {
            var id = identidadeDaLinha(li);
            var extras = detalhesDaLinha(li, 2);
            return `<div class="gf-item" onclick="window.__gfSoltar(${li})">
                        <div style="width:30px;height:38px;border-radius:3px;background:#1e293b;flex:none"></div>
                        <div class="txt">
                            <span class="gf-rot">${esc(id.coluna)} · linha ${li + 1}</span><br>
                            <b>${esc(id.valor)}</b>
                            ${extras.length ? '<br>' + extras.map(function (e) {
                return `<span class="gf-rot">${esc(e.coluna)}: ${esc(e.valor)}</span>`;
            }).join(' · ') : ''}
                        </div>
                    </div>`;
        }).join('') : '<div class="gf-vazio">toda linha tem foto 🎉</div>'}
            </div>
            ${r.semFoto.length ? `<div class="gf-tag" style="padding:6px 10px;border-top:1px solid #1e293b">
                comparando pela coluna <b>${esc(col)}</b>
            </div>` : ''}
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
        separar(c);
        pintar();
    };

    /**
     * Desfaz um vínculo, decidido pelo operador — e portanto DEFINITIVO para o
     * automático: a dupla vai para a lista de divórcios e não volta a casar
     * sozinha, nem nesta sessão nem quando a tela reabrir.
     *
     * Se o vínculo já estava GRAVADO na linha, ele é removido agora: a célula
     * esvazia, fica vermelha nas outras telas, e a impressão passa a acusar a
     * linha — que é a verdade. Vale depois de salvar a numeração.
     */
    function separar(c) {
        divorcios[c.arquivo + '|' + c.linha] = true;
        resultado.casadas = resultado.casadas.filter(function (x) { return x !== c; });
        if (!resultado.sobrando.some(function (s) { return s.nome === c.arquivo; })) {
            resultado.sobrando.push({ nome: c.arquivo, ref: c.ref });
        }
        if (!linhaCasada(c.linha) && resultado.semFoto.indexOf(c.linha) === -1) {
            resultado.semFoto.push(c.linha);
        }
        resultado.semFoto.sort(function (a, b) { return a - b; });

        var r = cfg.rows[c.linha];
        if (r) {
            var tinhaGravado = !!(r.__fotos && r.__fotos[cfg.coluna]);
            if (tinhaGravado) delete r.__fotos[cfg.coluna];
            if (r[cfg.coluna] != null && String(r[cfg.coluna]).trim()) r[cfg.coluna] = '';
            if (tinhaGravado) {
                aviso('Foto desvinculada de "' + rotuloDaLinha(c.linha) + '". '
                    + 'Salve a numeração para o desfazer valer no banco.');
            }
        }
    }

    window.__gfDesvincular = function (linha) {
        var c = (resultado.casadas || []).find(function (x) { return x.linha === linha; });
        if (!c) return;
        separar(c);
        // A folha de contato some com o cartão; a pilha "Fotos sem linha" da
        // aba Importar é onde a foto reaparece para ser religada.
        pintar();
    };

    function jaCasada(arquivo) {
        return resultado.casadas.some(function (c) { return c.arquivo === arquivo; });
    }

    function linhaCasada(linha) {
        return resultado.casadas.some(function (c) { return c.linha === linha; });
    }

    function ligar(arquivo, linha, regra) {
        // Religar na mão anula o divórcio: a última palavra é sempre do
        // operador, num sentido e no outro.
        delete divorcios[arquivo + '|' + linha];
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
        var faltantes = (resultado && resultado.semFoto) || [];
        if (!casadas.length && !faltantes.length) {
            return '<div class="gf-vazio">Nenhuma foto casada ainda. Comece pela aba Importar.</div>';
        }
        var paginas = Math.ceil(casadas.length / POR_PAGINA) || 1;
        var ini = pagina * POR_PAGINA;
        var fatia = casadas.slice(ini, ini + POR_PAGINA);
        var ultimaPagina = pagina >= paginas - 1;

        return `
        <div class="gf-tag" style="margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span>
                Roda do mouse aproxima · arrastar move · as setas do teclado trocam de foto · duplo clique volta ao enquadramento automático.
                ${paginas > 1 ? ` · página ${pagina + 1} de ${paginas}` : ''}
                ${faltantes.length ? ` · <b style="color:#f87171">${faltantes.length} sem foto</b>` : ''}
            </span>
            <button class="gf-btn" id="gf-interp" style="margin-left:auto" onclick="window.__gfInterpolar()"
                title="Reamostra para ${DPI_MINIMO} dpi todas as fotos abaixo disso, no enquadramento atual. Interpolação suaviza o serrilhado — não recupera detalhe.">
                ⬆ Interpolar fracas até ${DPI_MINIMO} dpi</button>
        </div>
        <div class="gf-queima" id="gf-queima"
            title="Excesso de resolução é custo sem ganho: peso de arquivo, upload e RIP mais lentos, sem diferença no papel. Por isso a redução acontece no Gravar, e não na importação — enquanto você enquadra, a folga extra serve para aproximar sem borrar."></div>
        <div class="gf-grade">
            ${fatia.map(function (c, k) {
            var idx = ini + k;
            var selo = seloDpi(c);
            var id = identidadeDaLinha(c.linha);
            return `<div class="gf-card ${focoEnquadro === idx ? 'foco' : ''}" id="gf-card-${idx}">
                    <canvas id="gf-cv-${idx}" data-idx="${idx}"></canvas>
                    <div class="rot" title="${esc(id.coluna)}: ${esc(id.valor)}">${esc(id.valor)}</div>
                    <div class="${selo.classe}" title="${esc(selo.titulo)}">${esc(selo.texto)}</div>
                    <div class="gf-acoes">
                        <button class="gf-mini" onclick="window.__gfTrocar(${c.linha})" title="Substituir a foto desta pessoa por outro arquivo">🔁 trocar</button>
                        <button class="gf-mini" onclick="window.__gfEditar(${c.linha})" title="Abrir esta foto no editor: recorte, cores, nitidez, resolução, fundo">✏️ editar</button>
                    </div>
                    <button class="gf-mini" onclick="window.__gfDesvincular(${c.linha})" title="Desfazer o vínculo: a foto volta para 'Fotos sem linha' e a pessoa para 'Linhas sem foto'">✕ desvincular</button>
                </div>`;
        }).join('')}
            ${ultimaPagina ? faltantes.map(function (li) {
            // As faltantes ficam na MESMA grade, no fim: o operador percorre o
            // lote inteiro numa tela só e vê os buracos junto com o resto, em
            // vez de descobri-los na hora de imprimir.
            var id = identidadeDaLinha(li);
            return `<div class="gf-card faltante" title="${esc(id.coluna)}: ${esc(id.valor)}">
                    <div class="gf-semfoto"></div>
                    <div class="rot">${esc(id.valor)}</div>
                    <div class="dpi">linha ${li + 1}</div>
                    <button class="gf-mini" onclick="window.__gfTrocar(${li})">📎 anexar foto</button>
                </div>`;
        }).join('') : ''}
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

    /**
     * Interpola para 200 dpi todas as fotos abaixo disso, no enquadramento de
     * agora. É opcional e de lote: o operador decide se prefere o serrilhado
     * honesto ou a suavização — e o cartão passa a dizer "interp." porque
     * interpolação não recupera detalhe, só disfarça a falta dele.
     */
    window.__gfInterpolar = async function () {
        var alvo = (resultado.casadas || []).filter(function (c) {
            var d = dpiDoEnquadro(c);
            return d > 0 && d < DPI_MINIMO;
        });
        if (!alvo.length) { aviso('Nenhuma foto abaixo de ' + DPI_MINIMO + ' dpi neste enquadramento.'); return; }

        var barra = el('gf-barra');
        var feitas = 0, falhas = 0;
        for (var i = 0; i < alvo.length; i++) {
            var c = alvo[i];
            var f = fotoDe(c.arquivo);
            var d = dpiDoEnquadro(c);
            if (!f || !d) { falhas++; continue; }
            try {
                await reamostrarFoto(f, DPI_MINIMO / d);
                f.interpolada = true;
                feitas++;
            } catch (ex) {
                console.warn('[Fotos] interpolar falhou', c.arquivo, ex);
                falhas++;
            }
            if (barra) barra.style.width = Math.round((i + 1) / alvo.length * 100) + '%';
        }
        if (barra) barra.style.width = '0';
        pintar();
        aviso(feitas + ' foto(s) interpoladas até ' + DPI_MINIMO + ' dpi'
            + (falhas ? ' — ' + falhas + ' não deu (arquivo inacessível).' : '.')
            + ' Elas sobem de novo no Gravar. Interpolação suaviza, não recupera detalhe.');
    };

    /**
     * Substituir a foto de UMA pessoa, a qualquer momento.
     *
     * O caso é corriqueiro numa gráfica: a foto veio tremida, o cliente mandou
     * outra depois, a pessoa trocou de crachá. Sem isto, corrigir um rosto
     * obrigaria a reimportar o lote inteiro.
     */
    window.__gfTrocar = function (linha) {
        trocandoLinha = linha;
        el('gf-file-uma').click();
    };

    /**
     * Abre a foto daquela pessoa no editor (recorte, cores, nitidez,
     * resolução, fundo). O editor devolve um blob novo; a foto editada entra
     * no lugar da antiga MANTENDO o enquadramento — só os bytes mudam — e
     * sobe no próximo Gravar, como uma troca.
     */
    window.__gfEditar = async function (linha) {
        var c = (resultado.casadas || []).find(function (x) { return x.linha === linha; });
        if (!c) return;
        var f = fotoDe(c.arquivo);
        if (!f) return;
        if (typeof window.abrirEditorDeFoto !== 'function') {
            aviso('O editor de fotos (editor-foto.js) não carregou. Recarregue a página.');
            return;
        }
        var id = identidadeDaLinha(linha);
        window.abrirEditorDeFoto({
            titulo: id.valor + ' — ' + f.nome,
            janela: cfg.janela,
            zoom: enquadroDe(c).zoom,
            obterBitmap: function () {
                return bitmapDaFoto(f).then(function (par) { return par.bmp; });
            },
            aoAplicar: async function (blob, w, h) {
                substituirArquivoDaFoto(f, blob, w, h, await hashDoBlob(blob));
                f.editada = true;
                pintar();
                aviso('Foto de "' + id.valor + '" editada. Ela sobe de novo no Gravar.');
            }
        });
    };

    async function receberTroca(file) {
        var linha = trocandoLinha;
        trocandoLinha = -1;
        if (linha < 0 || !file) return;
        try {
            var nova = await normalizarFoto(file, cfg.janela);
            // Nome único por linha: duas pessoas podem mandar "foto.jpg", e o
            // casamento é por nome de arquivo.
            if (fotoDe(nova.nome)) nova.nome = nova.nome + ' (linha ' + (linha + 1) + ')';
            fotos.push(nova);
            ligar(nova.nome, linha, 'trocada');
            var c = resultado.casadas.find(function (x) { return x.linha === linha; });
            if (c) c.enq = { cx: nova.cx, cy: nova.cy, zoom: 1, rot: 0 };
            pintar();
        } catch (ex) {
            aviso('Não consegui ler esse arquivo: ' + ex.message);
        }
    }

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

        var img = window.fotoImagem(f.url, window.repintor('gf-cartao-' + idx, function () { pintarCartao(idx); }));
        if (!img) return;

        // Foto que veio do banco não trouxe as dimensões: agora que a imagem
        // chegou, dá para medi-la.
        if (!f.w || !f.h) {
            var dim = window.dimensoesDaFoto(f.url);
            if (dim) { f.w = dim.w; f.h = dim.h; }
        }

        atualizarDpi(idx, c);
        window.desenharJanelaFoto(ctx, img, 0, 0, larg, alt, enquadroDe(c), cfg.janela.fit);
    }

    /**
     * A resolução real daquela foto NESTE enquadramento.
     *
     * O zoom conta, e conta muito: aproximar 2× usa metade da largura da foto
     * para preencher a mesma janela, então a resolução cai pela metade. Uma foto
     * que entrou com 390 dpi vira 195 dpi com zoom 2 — ainda boa — e 130 dpi com
     * zoom 3, que é rosto borrado em PVC.
     *
     * Por isso o número não pode ser o do momento da importação: ele é
     * recalculado a cada ajuste, e é o mesmo cálculo que vai para o banco.
     */
    function dpiDoEnquadro(c) {
        var f = fotoDe(c.arquivo);
        if (!f || !f.w || !f.h) return 0;
        return window.dpiNaJanela(f.w, f.h, cfg.janela.w_mm, cfg.janela.h_mm,
            cfg.janela.fit, enquadroDe(c).zoom);
    }

    /**
     * O quanto esta foto está ACIMA do teto — 0 quando não está, ou quando a
     * queima não se aplica a ela.
     *
     * Só conta foto que ainda tem `blob`, isto é, que vai subir neste Gravar.
     * Foto que já está no banco não é reamostrada mesmo que o operador afaste o
     * zoom e a resolução dispare: rebaixá-la custaria um reupload por rosto e
     * não mudaria nada no papel. Esta é a mesma condição que o `aplicar()` usa,
     * de propósito — se o contador da tela usasse outra, ele prometeria uma
     * redução que não aconteceria.
     */
    function dpiEmExcesso(c) {
        var f = fotoDe(c.arquivo);
        if (!f || !f.blob) return 0;
        var d = dpiDoEnquadro(c);
        return d > DPI_TETO ? d : 0;
    }

    /**
     * O selo de qualidade do cartão — texto, cor e explicação — num lugar só.
     * A primeira pintura e o recálculo ao vivo passam os dois por aqui: quando
     * eram duas fórmulas separadas, o marcador "interp." sumia no primeiro
     * arrasto do enquadramento.
     */
    function seloDpi(c) {
        var f = fotoDe(c.arquivo);
        var dpi = dpiDoEnquadro(c) || (f && f.dpi) || 0;
        var z = enquadroDe(c).zoom;
        var ruim = dpi > 0 && dpi < DPI_MINIMO;
        var alta = dpiEmExcesso(c) > 0;

        var titulo;
        if (ruim) {
            titulo = 'Abaixo de ' + DPI_MINIMO + ' dpi nesta janela com este zoom — qualidade baixa para PVC. O botão "Interpolar fracas" suaviza.';
        } else if (alta) {
            titulo = 'Acima de ' + DPI_TETO + ' dpi nesta janela: no Gravar esta foto sobe reamostrada para '
                + DPI_QUEIMA + ' dpi. Arquivo menor, RIP mais rápido, impressão igual.';
        } else if (f && f.queimada) {
            titulo = 'Reduzida para ' + DPI_QUEIMA + ' dpi no Gravar, porque passava de ' + DPI_TETO + ' dpi neste enquadramento.';
        } else if (f && f.interpolada) {
            titulo = 'Interpolada até ' + DPI_MINIMO + ' dpi: o serrilhado foi suavizado, mas o detalhe original não volta.';
        } else {
            titulo = 'Resolução da foto dentro da janela, já contando o zoom deste enquadramento.';
        }

        return {
            texto: (dpi ? dpi + ' dpi' : '')
                + (z > 1.01 ? ' · ' + z.toFixed(1) + '×' : '')
                + (ruim ? ' ⚠' : '')
                + (alta ? ' · ⤓ ' + DPI_QUEIMA + ' no Gravar' : '')
                + (f && f.interpolada ? ' · interp.' : '')
                + (f && f.queimada ? ' · reduzida' : ''),
            classe: 'dpi' + (ruim ? ' ruim' : (alta ? ' alta' : '')),
            titulo: titulo
        };
    }

    function atualizarDpi(idx, c) {
        var dpi = dpiDoEnquadro(c);
        // Sem dimensões ainda (foto do banco que não terminou de carregar) o
        // cartão fica como está — mas a régua da barra recalcula assim mesmo,
        // porque o cartão vizinho pode ter acabado de chegar.
        if (!dpi) { atualizarReguaDeDpi(); return; }
        var f = fotoDe(c.arquivo);
        if (f) f.dpi = dpi;
        var cartao = el('gf-card-' + idx);
        var alvo = cartao ? cartao.querySelector('.dpi') : null;
        if (alvo) {
            var s = seloDpi(c);
            alvo.textContent = s.texto;
            alvo.className = s.classe;
            alvo.title = s.titulo;
        }
        atualizarReguaDeDpi();
    }

    /**
     * As duas pontas da régua contam ao vivo, na barra da folha de contato: o
     * botão de interpolar (abaixo de 200) e o aviso da queima (acima de 350).
     *
     * Contar uma vez só na montagem não serve: as dimensões das fotos do banco
     * chegam quando as imagens carregam, e qualquer arrasto de zoom muda os dois
     * números. O aviso da queima aparece mesmo com contagem zero — é a única
     * coisa na tela que conta ao operador que essa redução existe e é automática.
     */
    function atualizarReguaDeDpi() {
        var casadas = (resultado && resultado.casadas) || [];

        var btn = el('gf-interp');
        if (btn) {
            var fracas = casadas.filter(function (c) {
                var d = dpiDoEnquadro(c);
                return d > 0 && d < DPI_MINIMO;
            }).length;
            btn.disabled = !fracas;
            btn.textContent = fracas
                ? '⬆ Interpolar ' + fracas + ' foto(s) fracas até ' + DPI_MINIMO + ' dpi'
                : '⬆ Nenhuma foto abaixo de ' + DPI_MINIMO + ' dpi';
        }

        var chip = el('gf-queima');
        if (chip) {
            var altas = casadas.filter(function (c) { return dpiEmExcesso(c) > 0; }).length;
            chip.className = 'gf-queima' + (altas ? ' on' : '');
            chip.textContent = altas
                ? '⤓ ' + altas + ' foto(s) acima de ' + DPI_TETO + ' dpi neste enquadramento — o Gravar as reduz para '
                + DPI_QUEIMA + ' dpi antes de subir. É automático, não há o que marcar.'
                : '⤓ Acima de ' + DPI_TETO + ' dpi o Gravar reduz para ' + DPI_QUEIMA
                + ' dpi automaticamente — nenhuma foto deste lote está acima.';
        }
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

        var gravadas = 0, queimadas = 0, falhas = [];
        for (var i = 0; i < casadas.length; i++) {
            var c = casadas[i];
            var f = fotoDe(c.arquivo);
            if (!f) { falhas.push(c.arquivo); continue; }

            // Excesso de resolução é custo sem ganho: acima de 350 dpi no
            // enquadramento decidido, a foto que vai subir é reamostrada para
            // 300 — arquivo menor, RIP mais rápido, impressão igual. Feito
            // aqui, e não na importação, para preservar a folga de zoom
            // enquanto o operador ainda está enquadrando. Só para fotos que
            // já iam subir (blob): as antigas do banco não pagam reupload.
            var dpiExcesso = dpiEmExcesso(c);
            if (dpiExcesso) {
                try {
                    await reamostrarFoto(f, DPI_QUEIMA / dpiExcesso);
                    f.queimada = true;
                    queimadas++;
                } catch (e) {
                    // Falhar em reduzir não impede de gravar: a foto sobe do
                    // tamanho que veio e imprime igual, só mais pesada.
                    console.warn('[Fotos] nao deu para reduzir', c.arquivo, e);
                }
            }

            try {
                // Foto que já está no banco não sobe de novo: reenquadrar 500
                // credenciais não pode custar 500 uploads. Só o retângulo muda.
                var url = f.noBanco ? (f.remota || f.url) : await cfg.subirFoto(f.blob, f.hash);
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
                // o que permite reconhecer a foto sem abrir o gerenciador. Uma
                // foto trocada precisa atualizar o nome, senão a célula passa a
                // mentir sobre qual arquivo está impresso.
                linha[cfg.coluna] = f.nome;

                // Já subiu: a partir daqui ela é uma foto do banco, e gravar de
                // novo (depois de reenquadrar) não repete o upload.
                //
                // O `url` fica guardado à parte e a tela CONTINUA desenhando a
                // partir do arquivo que já está na memória. Trocar para o
                // endereço da nuvem faria o navegador rebaixar, uma a uma, as
                // fotos que ele acabou de enviar — e qualquer atraso de
                // propagação do Storage deixaria a folha de contato preta.
                f.remota = url;
                f.noBanco = true;

                gravadas++;
            } catch (ex) {
                console.warn('[Fotos] falha ao subir', c.arquivo, ex);
                falhas.push(c.arquivo);
            }
            if (barra) barra.style.width = Math.round((i + 1) / casadas.length * 100) + '%';
        }

        if (btn) { btn.disabled = false; btn.textContent = '✔ Gravar no banco'; }
        if (barra) barra.style.width = '0';

        cfg.onAplicar({
            gravadas: gravadas,
            queimadas: queimadas,
            falhas: falhas,
            semFoto: (resultado.semFoto || []).slice(),
            sobrando: (resultado.sobrando || []).length,
            coluna: cfg.coluna
        });

        // A tela NÃO fecha ao gravar. Fechar levaria embora as fotos que
        // sobraram — que não têm linha, logo não têm onde ser gravadas — e o
        // operador teria de reimportar o lote para continuar de onde parou.
        pintar();

        var resumo = gravadas + ' foto(s) gravadas.';
        if (falhas.length) resumo += ' ' + falhas.length + ' falharam e continuam no lote.';
        if ((resultado.sobrando || []).length) resumo += ' ' + resultado.sobrando.length + ' foto(s) continuam sem linha, aqui na tela.';
        if ((resultado.semFoto || []).length) resumo += ' ' + resultado.semFoto.length + ' linha(s) ainda sem foto.';
        aviso(resumo);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Relatório — o que falta e o que sobrou, para cobrar do cliente
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Uma tabela com as duas pendências, para abrir no Excel e mandar de volta a
     * quem enviou o lote: quem ficou sem foto, e que fotos chegaram sem dono.
     *
     * É o que fecha o ciclo com o cliente — sem isso o operador copiava nome por
     * nome da tela para um e-mail.
     */
    function baixarRelatorio() {
        var r = resultado || { sobrando: [], semFoto: [] };
        var col = colunaDeIdentidade();
        var linhas = [['Pendencia', col, 'Linha', 'Detalhes', 'Arquivo']];

        (r.semFoto || []).forEach(function (li) {
            var id = identidadeDaLinha(li);
            var extras = detalhesDaLinha(li, 6).map(function (e) { return e.coluna + ': ' + e.valor; }).join(' | ');
            linhas.push(['Linha sem foto', id.valor, String(li + 1), extras, '']);
        });

        (r.sobrando || []).forEach(function (s) {
            linhas.push(['Foto sem linha', '', '', '', s.nome]);
        });

        (r.ambiguas || []).forEach(function (a) {
            linhas.push([
                'Em duvida',
                a.linhas.map(function (li) { return identidadeDaLinha(li).valor; }).join(' / '),
                a.linhas.map(function (li) { return li + 1; }).join(' / '),
                a.motivo,
                a.candidatos.map(function (c) { return c.arquivo; }).join(' / ')
            ]);
        });

        if (linhas.length === 1) { aviso('Nada pendente para relatar — o lote está fechado.'); return; }

        // ; e BOM: é o que o Excel em português abre sem pedir nada.
        var csv = '﻿' + linhas.map(function (l) {
            return l.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';');
        }).join('\r\n');

        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fotos_pendentes.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);

        aviso('Relatório baixado: ' + (r.semFoto || []).length + ' linha(s) sem foto e '
            + (r.sobrando || []).length + ' foto(s) sem linha.');
    }
    window.__gfRelatorio = baixarRelatorio;

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
        else { ligarInteracaoDosCartoes(); atualizarReguaDeDpi(); }
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
                var antiga = fotoDe(f.nome);
                if (!antiga) {
                    fotos.push(f);
                } else if (antiga.noBanco) {
                    // Mesmo nome de uma foto já gravada: é o cliente reenviando
                    // aquela pessoa. A nova entra no lugar, e a linha que já
                    // apontava para ela passa a apontar para a nova.
                    fotos[fotos.indexOf(antiga)] = f;
                }
            } catch (ex) {
                console.warn('[Fotos] arquivo ignorado', imgs[i].name, ex);
            }
            var p = el('gf-prep');
            if (p) p.style.width = Math.round((i + 1) / imgs.length * 100) + '%';
        }

        recasar();
        pintar();
    }

    /**
     * Casa o que ainda não foi casado, PRESERVANDO o que já está decidido.
     *
     * É o que permite trazer o lote em levas: a segunda leva não desfaz o
     * casamento da primeira, nem as ligações feitas na mão, nem as fotos que já
     * estavam gravadas no banco. Só os arquivos novos disputam as linhas que
     * ainda estão vazias.
     */
    /**
     * Traz para a tela as fotos que já estão gravadas nas linhas.
     *
     * Elas entram como casadas e SEM `blob`: na hora de gravar não sobem de
     * novo, só o enquadramento é atualizado. Reenquadrar 500 credenciais não
     * pode custar 500 uploads.
     */
    function carregarDoBanco() {
        var casadas = [], semFoto = [];
        (cfg.rows || []).forEach(function (linha, i) {
            if (!linha || linha.__ativo === false) return;
            var meta = (linha.__fotos || {})[cfg.coluna];
            if (!meta || !String(meta.url || '').trim()) { semFoto.push(i); return; }

            var nome = meta.arquivo || String(linha[cfg.coluna] || '').trim() || ('foto ' + (i + 1));
            if (!fotoDe(nome)) {
                fotos.push({
                    nome: nome, blob: null, url: meta.url, hash: meta.ref || '',
                    w: 0, h: 0, dpi: meta.dpi || 0,
                    cx: meta.cx, cy: meta.cy, noBanco: true
                });
            }
            casadas.push({
                arquivo: nome, linha: i, regra: 'no banco',
                enq: {
                    cx: typeof meta.cx === 'number' ? meta.cx : 0.5,
                    cy: typeof meta.cy === 'number' ? meta.cy : 0.4,
                    zoom: typeof meta.zoom === 'number' ? meta.zoom : 1,
                    rot: meta.rot || 0
                }
            });
        });
        resultado = { casadas: casadas, ambiguas: [], sobrando: [], semFoto: semFoto };

        // As fotos que sobraram da última vez voltam para a pilha delas, e
        // disputam de novo as linhas que agora estão vazias — a lista de pessoas
        // pode ter crescido desde então.
        var guardadas = sobrasGuardadas.get(chaveDaSessao()) || [];
        guardadas.forEach(function (f) { if (!fotoDe(f.nome)) fotos.push(f); });
        if (guardadas.length) recasar();

        if (resultado.casadas.length) aba = 'enquadrar';
    }

    function recasar() {
        var colunas = [];
        if (cfg.coluna) colunas.push(cfg.coluna);
        cfg.headers.forEach(function (h) { if (colunas.indexOf(h) === -1) colunas.push(h); });

        var jaCasadas = (resultado && resultado.casadas) ? resultado.casadas.slice() : [];
        var arquivosUsados = {}, linhasUsadas = {};
        jaCasadas.forEach(function (c) { arquivosUsados[c.arquivo] = true; linhasUsadas[c.linha] = true; });

        var novos = fotos.filter(function (f) { return !arquivosUsados[f.nome]; });

        // Cópia das linhas com as já resolvidas marcadas como inativas: o
        // `casarFotos` já sabe pular linha inativa, então não é preciso um
        // caminho novo só para isto. A cópia é rasa e descartável — as linhas de
        // verdade não são tocadas.
        var visiveis = cfg.rows.map(function (r, i) {
            return linhasUsadas[i] ? { __ativo: false } : r;
        });

        var novo = window.casarFotos(novos, visiveis, colunas);

        // Dupla divorciada não volta pelo automático. A foto segue livre para
        // OUTRA linha e a linha para OUTRA foto — só aquele par está vetado.
        var vetadas = novo.casadas.filter(function (c) { return divorcios[c.arquivo + '|' + c.linha]; });
        if (vetadas.length) {
            novo.casadas = novo.casadas.filter(function (c) { return vetadas.indexOf(c) === -1; });
            vetadas.forEach(function (c) {
                if (!novo.sobrando.some(function (s) { return s.nome === c.arquivo; })) {
                    novo.sobrando.push({ nome: c.arquivo, ref: c.ref });
                }
                if (novo.semFoto.indexOf(c.linha) === -1) novo.semFoto.push(c.linha);
            });
            novo.semFoto.sort(function (a, b) { return a - b; });
        }

        resultado = {
            casadas: jaCasadas.concat(novo.casadas),
            ambiguas: novo.ambiguas,
            sobrando: novo.sobrando,
            semFoto: novo.semFoto
        };
    }

    function chaveDaSessao() {
        return (cfg && (cfg.chave || (cfg.numId + '|' + cfg.coluna))) || 'sem-chave';
    }

    function fechar() {
        var ov = el('gf-overlay');
        if (ov) ov.remove();
        document.removeEventListener('keydown', aoTeclado);

        // As fotos que ainda não acharam dono ficam guardadas para quando a tela
        // for reaberta; as outras já estão no banco e podem sair da memória.
        var sobrando = ((resultado && resultado.sobrando) || []).map(function (s) { return fotoDe(s.nome); })
            .filter(Boolean);
        if (cfg) {
            if (sobrando.length) sobrasGuardadas.set(chaveDaSessao(), sobrando);
            else sobrasGuardadas.delete(chaveDaSessao());
            var vetos = Object.keys(divorcios);
            if (vetos.length) divorciosGuardados.set(chaveDaSessao(), divorcios);
            else divorciosGuardados.delete(chaveDaSessao());
        }
        var manter = {};
        sobrando.forEach(function (f) { manter[f.nome] = true; });
        fotos.forEach(function (f) {
            if (manter[f.nome]) return;
            try { if (f.blob) URL.revokeObjectURL(f.url); } catch (e) { }
        });

        fotos = []; resultado = null; selecionado = null; cfg = null;
        aba = 'importar'; pagina = 0; focoEnquadro = -1; trocandoLinha = -1;
    }

    window.abrirGerenciadorDeFotos = function (config) {
        if (!window.casarFotos) {
            alert('A biblioteca de fotos (foto-lib.js) não carregou. Recarregue a página.');
            return;
        }
        cfg = config;
        fotos = []; resultado = null; selecionado = null;
        aba = 'importar'; pagina = 0; focoEnquadro = -1;
        colunaId = ''; trocandoLinha = -1;
        divorcios = divorciosGuardados.get(cfg.chave || (cfg.numId + '|' + cfg.coluna)) || {};

        // O gerenciador nunca abre em branco: o que já está gravado nas linhas
        // volta para a tela, com o enquadramento que tem. É isso que permite
        // reenquadrar ou trocar uma foto depois — sem precisar reimportar o lote
        // inteiro só para acertar um rosto torto.
        carregarDoBanco();

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
                <button class="gf-btn" onclick="window.__gfRelatorio()" title="Baixa uma planilha com quem ficou sem foto e que fotos chegaram sem dono">📋 Relatório de pendências</button>
                <button class="gf-btn primario" id="gf-aplicar" disabled onclick="window.__gfAplicar()">✔ Gravar no banco</button>
            </div>
            <input type="file" id="gf-file" multiple accept="image/*" style="display:none">
            <input type="file" id="gf-file-uma" accept="image/*" style="display:none">`;
        document.body.appendChild(ov);

        el('gf-file').addEventListener('change', function (ev) {
            receberArquivos(Array.from(ev.target.files || []));
            ev.target.value = '';
        });
        el('gf-file-uma').addEventListener('change', function (ev) {
            receberTroca((ev.target.files || [])[0]);
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
