/* ===========================================================================
   Editor de CSV — modal de tela cheia da numeração
   ---------------------------------------------------------------------------
   Mostra o banco de dados (CSV) de uma numeração como planilha e permite
   editar célula, linha e coluna, buscar, filtrar, ordenar, e marcar quais
   linhas entram na impressão.

   Este arquivo NÃO enxerga o `state` do editor de numeração. Ele recebe tudo
   pelo argumento de `abrirEditorCsv()` e devolve tudo pelo `onAplicar`. Ver
   docs/superpowers/specs/2026-08-11-editor-csv-design.md.

   A chave `__ativo: false` dentro de uma linha marca que ela NÃO deve ser
   impressa. A ausência da chave significa ativa — assim todo CSV já salvo
   continua valendo. Ela nunca entra nos cabeçalhos nem é exportada.
   =========================================================================== */

(function () {
    'use strict';

    const COL_ATIVO = '__ativo';
    // Identidade estável da linha. Existe porque a distribuição do banco entre os
    // modelos de um pedido é feita à mão, linha a linha, e posição não serve de
    // referência: inserir uma linha no meio faria toda seleção já salva escorregar.
    // Nunca reaproveitado, nunca exportado, nunca oferecido como coluna.
    const COL_ID = '__id';
    const COLS_INTERNAS = [COL_ATIVO, COL_ID];

    function colunaInterna(nome) {
        return COLS_INTERNAS.indexOf(nome) !== -1;
    }
    const ROW_H = 30;      // altura da linha, em px (fixa: a grade é virtualizada)
    const HEAD_H = 38;
    const W_DRAG = 26;
    const W_CHECK = 38;
    const W_IDX = 58;
    const OVERSCAN = 8;
    const W_MODELO = 168;
    // Cores dos modelos na distribuicao. Escolhidas para se distinguirem tambem
    // em monitor de chao de fabrica, que costuma estar mal calibrado.
    const PALETA = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
                    '#ec4899', '#14b8a6', '#ef4444', '#eab308'];
    const MAX_UNDO = 50;

    // ══════════════════════════════════════════════════════════════════════
    // Funções puras — sem DOM, testáveis isoladamente
    // ══════════════════════════════════════════════════════════════════════

    /** Conta ocorrências de cada delimitador candidato fora de aspas. */
    function detectarDelimitador(texto) {
        const amostra = texto.slice(0, 65536);
        const cand = [',', ';', '\t', '|'];
        const contagem = { ',': 0, ';': 0, '\t': 0, '|': 0 };
        let dentroAspas = false;
        for (let i = 0; i < amostra.length; i++) {
            const c = amostra[i];
            if (c === '"') {
                if (dentroAspas && amostra[i + 1] === '"') { i++; continue; }
                dentroAspas = !dentroAspas;
                continue;
            }
            if (dentroAspas) continue;
            if (c === '\n') {
                // Decide pela primeira linha, que é onde o cabeçalho mora.
                if (contagem[','] || contagem[';'] || contagem['\t'] || contagem['|']) break;
            }
            if (Object.prototype.hasOwnProperty.call(contagem, c)) contagem[c]++;
        }
        let melhor = ',', max = -1;
        for (const c of cand) {
            if (contagem[c] > max) { max = contagem[c]; melhor = c; }
        }
        return max > 0 ? melhor : ',';
    }

    /**
     * Parser CSV conforme a RFC 4180: aspas, aspas duplicadas (""), campo com
     * quebra de linha dentro, BOM, e CRLF ou LF. Devolve
     * { headers, rows, delimitador }.
     */
    function parseCsv(texto, delimitadorForcado) {
        if (typeof texto !== 'string') return { headers: [], rows: [], delimitador: ',' };
        if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);   // BOM
        const D = delimitadorForcado || detectarDelimitador(texto);

        const matriz = [];
        let linha = [];
        let campo = '';
        let dentroAspas = false;
        let temCampo = false;

        const fecharCampo = () => { linha.push(campo); campo = ''; temCampo = false; };
        const fecharLinha = () => { fecharCampo(); matriz.push(linha); linha = []; };

        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (dentroAspas) {
                if (c === '"') {
                    if (texto[i + 1] === '"') { campo += '"'; i++; }
                    else dentroAspas = false;
                } else {
                    campo += c;
                }
                continue;
            }
            if (c === '"' && !temCampo) { dentroAspas = true; temCampo = true; continue; }
            if (c === D) { fecharCampo(); continue; }
            if (c === '\r') { if (texto[i + 1] === '\n') i++; fecharLinha(); continue; }
            if (c === '\n') { fecharLinha(); continue; }
            campo += c;
            temCampo = true;
        }
        if (campo !== '' || linha.length) fecharLinha();

        // Descarta linhas totalmente vazias (arquivo terminado em quebra de linha).
        const util = matriz.filter(l => l.some(v => String(v).trim() !== ''));
        if (!util.length) return { headers: [], rows: [], delimitador: D };

        const headers = normalizarCabecalhos(util[0]);
        const rows = [];
        for (let i = 1; i < util.length; i++) {
            const obj = {};
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = (util[i][j] !== undefined ? String(util[i][j]) : '').trim();
            }
            rows.push(obj);
        }
        return { headers, rows, delimitador: D };
    }

    /** Cabeçalho sem nome vira "Coluna N"; nome repetido ganha sufixo. */
    function normalizarCabecalhos(brutos) {
        const vistos = new Set();
        return brutos.map((h, i) => {
            let nome = String(h == null ? '' : h).trim();
            if (!nome || colunaInterna(nome)) nome = `Coluna ${i + 1}`;
            let final = nome, n = 2;
            while (vistos.has(final)) { final = `${nome} (${n++})`; }
            vistos.add(final);
            return final;
        });
    }

    /** Escapa um campo só quando precisa (delimitador, aspas ou quebra de linha). */
    function escaparCampo(valor, D) {
        const s = valor == null ? '' : String(valor);
        if (s.includes(D) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    /** Serializa de volta para texto CSV. A coluna __ativo nunca é exportada. */
    function serializarCsv(headers, rows, delimitador) {
        const D = delimitador || ',';
        const linhas = [headers.map(h => escaparCampo(h, D)).join(D)];
        for (const r of rows) {
            linhas.push(headers.map(h => escaparCampo(r[h], D)).join(D));
        }
        return linhas.join('\r\n');
    }

    /** Uma linha só está fora da impressão quando tem __ativo === false. */
    function linhaAtiva(row) {
        return !row || row[COL_ATIVO] !== false;
    }

    function contarAtivas(rows) {
        if (!Array.isArray(rows)) return 0;
        let n = 0;
        for (const r of rows) if (linhaAtiva(r)) n++;
        return n;
    }

    /** Só as linhas que serão impressas, na ordem original. */
    function apenasAtivas(rows) {
        return Array.isArray(rows) ? rows.filter(linhaAtiva) : [];
    }

    /**
     * Gera uma sequência de rótulos: prefixo + número (com zeros à esquerda) +
     * sufixo. Ex.: gerarSequencia({qtd:3, inicio:1, passo:1, zeros:3,
     * prefixo:'ING-'}) → ['ING-001','ING-002','ING-003'].
     */
    function gerarSequencia({ qtd, inicio = 1, passo = 1, zeros = 0, prefixo = '', sufixo = '' }) {
        const out = [];
        let v = Number(inicio) || 0;
        const p = Number(passo) || 1;
        const z = Math.max(0, Number(zeros) || 0);
        for (let i = 0; i < qtd; i++) {
            out.push(`${prefixo}${String(v).padStart(z, '0')}${sufixo}`);
            v += p;
        }
        return out;
    }

    /** Texto colado do Excel/Sheets: TSV com campos possivelmente entre aspas. */
    function parseColado(texto) {
        if (!texto) return [];
        const D = texto.includes('\t') ? '\t' : detectarDelimitador(texto);
        const r = parseCsv(texto, D);
        // Aqui não existe cabeçalho: a primeira linha também é dado.
        const matriz = [r.headers];
        for (const row of r.rows) matriz.push(r.headers.map(h => row[h]));
        return matriz;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Identidade da linha e faixas compactas
    // ══════════════════════════════════════════════════════════════════════

    /** Maior __id já usado. Ids não são reaproveitados: some, some para sempre. */
    function maiorId(rows) {
        let max = 0;
        for (const r of (rows || [])) {
            const v = Number(r && r[COL_ID]);
            if (Number.isFinite(v) && v > max) max = v;
        }
        return max;
    }

    /**
     * Garante __id em toda linha, sem mexer nos que já existem. CSV salvo antes
     * desta versão recebe os ids pela posição atual — o que é seguro justamente
     * porque ainda não existe nenhuma seleção salva para sair do lugar.
     * Muda `rows` no lugar e devolve quantos ids foram criados.
     */
    function garantirIds(rows) {
        if (!Array.isArray(rows)) return 0;
        let proximo = maiorId(rows) + 1;
        let criados = 0;
        for (const r of rows) {
            if (!r) continue;
            const v = Number(r[COL_ID]);
            if (!Number.isFinite(v) || v <= 0) { r[COL_ID] = proximo++; criados++; }
        }
        return criados;
    }

    /**
     * Comprime uma lista de ids em faixas: [1,2,3,7,10,11] → ["1-3","7","10-11"].
     * Marcar à mão quase sempre produz blocos contínuos, então 400 linhas
     * seguidas viram uma string em vez de 400 números no jsonb.
     */
    function comprimirIds(ids) {
        const ord = Array.from(new Set((ids || []).map(Number).filter(Number.isFinite))).sort((a, b) => a - b);
        const out = [];
        let i = 0;
        while (i < ord.length) {
            const ini = ord[i];
            let fim = ini;
            while (i + 1 < ord.length && ord[i + 1] === fim + 1) { fim = ord[++i]; }
            out.push(ini === fim ? String(ini) : `${ini}-${fim}`);
            i++;
        }
        return out;
    }

    /** Desfaz o `comprimirIds`. Aceita número solto ou faixa "a-b". */
    function expandirIds(faixas) {
        const out = [];
        for (const f of (faixas || [])) {
            const s = String(f);
            const m = s.match(/^(\d+)-(\d+)$/);
            if (m) {
                const a = Number(m[1]), b = Number(m[2]);
                for (let v = Math.min(a, b); v <= Math.max(a, b); v++) out.push(v);
            } else {
                const v = Number(s);
                if (Number.isFinite(v)) out.push(v);
            }
        }
        return out;
    }

    /**
     * As linhas que um modelo imprime: a fatia dele, já sem as canceladas e na
     * ordem original do banco (que é a ordem de impressão).
     * `selecao` nula ou vazia significa "o banco inteiro" — é o que mantém todo
     * pedido anterior a esta versão funcionando sem migração de dado.
     */
    function fatiaDoModelo(rows, selecao) {
        const ativas = apenasAtivas(rows);
        if (!selecao || !selecao.ids || !selecao.ids.length) return ativas;
        const querido = new Set(expandirIds(selecao.ids));
        return ativas.filter(r => querido.has(Number(r[COL_ID])));
    }

    window.CsvEditor = {
        COL_ATIVO, COL_ID, colunaInterna,
        parseCsv, serializarCsv, detectarDelimitador,
        linhaAtiva, contarAtivas, apenasAtivas, gerarSequencia, parseColado,
        maiorId, garantirIds, comprimirIds, expandirIds, fatiaDoModelo
    };

    // ══════════════════════════════════════════════════════════════════════
    // Estado do modal
    // ══════════════════════════════════════════════════════════════════════

    let ed = null;
    let dom = null;

    function aviso(msg, tipo) {
        if (typeof window.toast === 'function') window.toast(msg, tipo || 'info');
        else console.log(`[csv-editor] ${msg}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // CSS (injetado uma vez)
    // ══════════════════════════════════════════════════════════════════════

    function injetarCss() {
        if (document.getElementById('csv-ed-css')) return;
        const st = document.createElement('style');
        st.id = 'csv-ed-css';
        st.textContent = `
#csv-ed-overlay{position:fixed;inset:0;z-index:1000000;background:rgba(2,6,23,.92);
  backdrop-filter:blur(4px);display:flex;align-items:stretch;justify-content:center;padding:14px}
#csv-ed-shell{display:flex;flex-direction:column;width:100%;max-width:1700px;background:var(--bg,#0a0f1e);
  border:1px solid var(--border,rgba(148,163,184,.25));border-radius:var(--radius,14px);overflow:hidden;
  box-shadow:0 24px 70px rgba(0,0,0,.6)}
.csv-ed-top{display:flex;align-items:center;gap:12px;padding:12px 16px;
  border-bottom:1px solid var(--border,rgba(148,163,184,.25));background:rgba(30,41,59,.55)}
.csv-ed-title{font-size:1rem;font-weight:700;color:var(--text,#e2e8f0)}
.csv-ed-sub{font-size:.8rem;color:var(--text-dim,#94a3b8)}
.csv-ed-x{margin-left:auto;background:none;border:1px solid var(--border,rgba(148,163,184,.25));
  color:var(--text-dim,#94a3b8);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:1rem}
.csv-ed-x:hover{color:#ef4444;border-color:#ef4444}
.csv-ed-bars{display:flex;flex-direction:column;gap:6px;padding:10px 16px;
  border-bottom:1px solid var(--border,rgba(148,163,184,.25));background:rgba(15,23,42,.5)}
.csv-ed-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.csv-ed-bar label.grp{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;
  color:var(--text-faint,#475569);margin-right:2px;font-weight:700}
.csv-ed-b{background:rgba(51,65,85,.7);border:1px solid var(--border,rgba(148,163,184,.25));
  color:var(--text,#e2e8f0);border-radius:8px;padding:5px 10px;font-size:.78rem;cursor:pointer;
  font-family:inherit;white-space:nowrap}
.csv-ed-b:hover:not(:disabled){border-color:var(--border-glow,rgba(99,160,255,.35));background:rgba(71,85,105,.85)}
.csv-ed-b:disabled{opacity:.38;cursor:not-allowed}
.csv-ed-b.perigo:hover:not(:disabled){border-color:#ef4444;color:#ef4444}
.csv-ed-in{background:rgba(15,23,42,.85);border:1px solid var(--border,rgba(148,163,184,.25));
  color:var(--text,#e2e8f0);border-radius:8px;padding:5px 9px;font-size:.78rem;font-family:inherit}
.csv-ed-in:focus{outline:none;border-color:#3b82f6}
.csv-ed-sep{width:1px;align-self:stretch;background:var(--border,rgba(148,163,184,.25));margin:0 4px}
.csv-ed-guia{align-items:center;gap:10px;padding:8px 12px;border-radius:10px;
  background:rgba(30,41,59,.6);border:1px solid var(--border,rgba(148,163,184,.25))}
.csv-ed-guia .passo{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;
  color:var(--text,#e2e8f0)}
.csv-ed-guia .num{display:inline-flex;align-items:center;justify-content:center;
  width:19px;height:19px;border-radius:50%;background:#3b82f6;color:#fff;
  font-size:.72rem;font-weight:800;flex-shrink:0}
.csv-ed-guia .seta{color:var(--text-faint,#475569)}
.csv-ed-guia .estado{margin-left:auto;font-size:.8rem;font-weight:700;white-space:nowrap}
.csv-ed-guia .nota{flex-basis:100%;font-size:.75rem;color:var(--text-dim,#94a3b8)}

.csv-ed-scroll{flex:1;overflow:auto;outline:none;background:rgba(10,15,30,.6)}
.csv-ed-inner{position:relative}
.csv-ed-head{position:sticky;top:0;z-index:5;display:flex;width:100%;height:${HEAD_H}px;
  background:#111a2e;border-bottom:1px solid var(--border,rgba(148,163,184,.25))}
.csv-ed-hc{display:flex;align-items:center;gap:5px;padding:0 8px;font-size:.76rem;font-weight:700;
  color:var(--text,#e2e8f0);border-right:1px solid rgba(148,163,184,.14);flex:none;
  cursor:pointer;user-select:none;overflow:hidden}
.csv-ed-hc.fixa{cursor:default;color:var(--text-dim,#94a3b8);justify-content:center}
.csv-ed-hc:hover:not(.fixa){background:rgba(59,130,246,.14)}
.csv-ed-hc .ord{color:#3b82f6;font-size:.7rem}
.csv-ed-hc .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.csv-ed-spacer{position:relative;width:100%}
.csv-ed-r{position:absolute;left:0;right:0;display:flex;height:${ROW_H}px;
  border-bottom:1px solid rgba(148,163,184,.09)}
.csv-ed-r:hover{background:rgba(59,130,246,.07)}
.csv-ed-r.off{opacity:.42}
.csv-ed-r.off .csv-ed-c{text-decoration:line-through;text-decoration-color:rgba(239,68,68,.55)}
.csv-ed-c{display:flex;align-items:center;padding:0 8px;font-size:.78rem;color:var(--text,#e2e8f0);
  border-right:1px solid rgba(148,163,184,.09);flex:none;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;cursor:cell}
.csv-ed-c.idx{color:var(--text-faint,#475569);justify-content:flex-end;font-variant-numeric:tabular-nums;cursor:default}
.csv-ed-c.chk,.csv-ed-c.dg{justify-content:center;cursor:pointer;padding:0}
.csv-ed-c.dg{color:var(--text-faint,#475569);cursor:grab}
.csv-ed-c.dg.travada{opacity:.25;cursor:not-allowed}
.csv-ed-c.cursor{outline:2px solid #3b82f6;outline-offset:-2px;background:rgba(59,130,246,.13)}
.csv-ed-r.arrastando{opacity:.4}
.csv-ed-r.alvo{border-bottom:2px solid #3b82f6}
.csv-ed-edit{position:absolute;z-index:8;background:#0f172a;border:2px solid #3b82f6;
  color:var(--text,#e2e8f0);font-size:.78rem;font-family:inherit;padding:0 6px;outline:none;display:none}
.csv-ed-vazio{padding:40px;text-align:center;color:var(--text-dim,#94a3b8);font-size:.86rem}

.csv-ed-foot{display:flex;align-items:center;gap:12px;padding:11px 16px;
  border-top:1px solid var(--border,rgba(148,163,184,.25));background:rgba(30,41,59,.55)}
.csv-ed-foot .info{font-size:.82rem;color:var(--text-dim,#94a3b8)}
.csv-ed-foot .info b{color:#22c55e}
.csv-ed-acoes{margin-left:auto;display:flex;gap:8px}
.csv-ed-b.principal{background:#3b82f6;border-color:#3b82f6;color:#fff;font-weight:600;padding:7px 18px}
.csv-ed-b.principal:hover{background:#2563eb}

#csv-ed-dlg,#csv-ed-cols{position:fixed;inset:0;background:rgba(2,6,23,.72);
  display:flex;align-items:center;justify-content:center;padding:20px}
#csv-ed-cols{z-index:1000001}
#csv-ed-dlg{z-index:1000002}   /* diálogo aberto por cima do painel de colunas */
.csv-ed-dlgbox{background:var(--bg2,#1e293b);border:1px solid var(--border,rgba(148,163,184,.25));
  border-radius:var(--radius,14px);padding:20px;width:min(520px,100%);max-height:86vh;overflow:auto;
  box-shadow:0 20px 60px rgba(0,0,0,.6)}
.csv-ed-dlgbox h3{font-size:.98rem;margin-bottom:6px;color:var(--text,#e2e8f0)}
.csv-ed-dlgbox .nota{font-size:.78rem;color:var(--text-dim,#94a3b8);margin-bottom:14px;line-height:1.5}
.csv-ed-f{margin-bottom:11px}
.csv-ed-f label{display:block;font-size:.75rem;color:var(--text-dim,#94a3b8);margin-bottom:4px}
.csv-ed-f .csv-ed-in,.csv-ed-f select{width:100%}
.csv-ed-dlgacoes{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.csv-ed-colrow{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.csv-ed-colrow .csv-ed-in{flex:1}
.csv-ed-colrow .uso{font-size:.7rem;color:#f59e0b;white-space:nowrap}
.csv-ed-dlgbox textarea.csv-ed-in{font-family:ui-monospace,Consolas,monospace;font-size:.76rem;
  line-height:1.5;resize:vertical;white-space:pre;overflow:auto}
.csv-ed-vazio .acoes{margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.csv-ed-vazio .titulo{font-size:.95rem;color:var(--text,#e2e8f0);margin-bottom:6px;font-weight:600}
.csv-ed-r.sel{background:rgba(59,130,246,.20)}
.csv-ed-r.sel:hover{background:rgba(59,130,246,.26)}
/* Linha apontada por quem abriu a tela: a marca fica mesmo com o filtro
   desligado, senão o operador perderia de vista o que veio consertar. */
.csv-ed-r.apontada{box-shadow:inset 3px 0 0 #f59e0b;background:rgba(245,158,11,.07)}
.csv-ed-r.apontada:hover{background:rgba(245,158,11,.13)}
.csv-ed-c.mod{gap:6px;font-size:.75rem}
.csv-ed-c.mod.sem{color:#f59e0b}
.csv-ed-c .chip,.csv-ed-b .chip{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block}
.csv-ed-b.modelo{display:inline-flex;align-items:center;gap:7px}
`;
        document.head.appendChild(st);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Diálogos auxiliares
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Diálogo genérico. `campos` é uma lista de
     * {key, label, type:'text'|'number'|'select'|'checkbox', value, options}.
     * Resolve com um objeto de valores, ou null se cancelado.
     */
    function dialogo(titulo, nota, campos, rotuloOk) {
        return new Promise(resolve => {
            const bg = document.createElement('div');
            bg.id = 'csv-ed-dlg';
            const box = document.createElement('div');
            box.className = 'csv-ed-dlgbox';
            bg.appendChild(box);

            const h = document.createElement('h3');
            h.textContent = titulo;
            box.appendChild(h);
            if (nota) {
                const p = document.createElement('div');
                p.className = 'nota';
                p.textContent = nota;
                box.appendChild(p);
            }

            const inputs = {};
            for (const c of campos) {
                const f = document.createElement('div');
                f.className = 'csv-ed-f';

                // Caixa de marcar fica ao lado do texto, nao embaixo dele, e o
                // texto inteiro e clicavel.
                if (c.type === 'checkbox') {
                    const l = document.createElement('label');
                    l.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin:0';
                    const el = document.createElement('input');
                    el.type = 'checkbox';
                    el.checked = !!c.value;
                    const txt = document.createElement('span');
                    txt.textContent = c.label || '';
                    l.appendChild(el);
                    l.appendChild(txt);
                    f.appendChild(l);
                    inputs[c.key] = el;
                    box.appendChild(f);
                    continue;
                }

                if (c.label) {
                    const l = document.createElement('label');
                    l.textContent = c.label;
                    f.appendChild(l);
                }
                let el;
                if (c.type === 'select') {
                    el = document.createElement('select');
                    el.className = 'csv-ed-in';
                    for (const o of (c.options || [])) {
                        const op = document.createElement('option');
                        op.value = o.v;
                        op.textContent = o.t;
                        if (String(o.v) === String(c.value)) op.selected = true;
                        el.appendChild(op);
                    }
                } else if (c.type === 'checkbox') {
                    el = document.createElement('input');
                    el.type = 'checkbox';
                    el.checked = !!c.value;
                } else if (c.type === 'textarea') {
                    el = document.createElement('textarea');
                    el.className = 'csv-ed-in';
                    el.rows = c.rows || 10;
                    el.value = c.value == null ? '' : c.value;
                    if (c.placeholder) el.placeholder = c.placeholder;
                } else {
                    el = document.createElement('input');
                    el.className = 'csv-ed-in';
                    el.type = c.type || 'text';
                    el.value = c.value == null ? '' : c.value;
                    if (c.placeholder) el.placeholder = c.placeholder;
                }
                inputs[c.key] = el;
                f.appendChild(el);
                box.appendChild(f);
            }

            const acoes = document.createElement('div');
            acoes.className = 'csv-ed-dlgacoes';
            const bCancel = document.createElement('button');
            bCancel.className = 'csv-ed-b';
            bCancel.textContent = 'Cancelar';
            const bOk = document.createElement('button');
            bOk.className = 'csv-ed-b principal';
            bOk.textContent = rotuloOk || 'Aplicar';
            acoes.appendChild(bCancel);
            acoes.appendChild(bOk);
            box.appendChild(acoes);

            const fechar = valor => { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(valor); };
            const colher = () => {
                const out = {};
                for (const c of campos) {
                    const el = inputs[c.key];
                    out[c.key] = c.type === 'checkbox' ? el.checked
                        : c.type === 'number' ? Number(el.value)
                            : el.value;
                }
                return out;
            };
            const onKey = e => {
                if (e.key === 'Escape') { e.stopPropagation(); fechar(null); }
                // Enter dentro de um textarea e quebra de linha, nao confirmacao:
                // colar do Excel depende disso.
                else if (e.key === 'Enter' && e.target.tagName !== 'SELECT'
                    && e.target.tagName !== 'TEXTAREA') { e.stopPropagation(); fechar(colher()); }
            };
            document.addEventListener('keydown', onKey, true);
            bCancel.onclick = () => fechar(null);
            bOk.onclick = () => fechar(colher());
            bg.onclick = e => { if (e.target === bg) fechar(null); };

            document.body.appendChild(bg);
            const primeiro = Object.values(inputs)[0];
            if (primeiro) { primeiro.focus(); if (primeiro.select) primeiro.select(); }
        });
    }

    function confirmar(titulo, nota, rotuloOk) {
        return dialogo(titulo, nota, [], rotuloOk || 'Confirmar').then(r => r !== null);
    }

    const CAMPO_ESCOPO = {
        key: 'escopo', label: 'Aplicar em', type: 'select', value: 'visiveis',
        options: [
            { v: 'visiveis', t: 'Linhas visíveis (busca e filtro atuais)' },
            { v: 'marcadas', t: 'Linhas marcadas' },
            { v: 'todas', t: 'Todas as linhas' }
        ]
    };

    /** Índices reais das linhas atingidas por um escopo. */
    function indicesDoEscopo(escopo) {
        if (escopo === 'todas') return ed.rows.map((_, i) => i);
        if (escopo === 'marcadas') {
            const out = [];
            ed.rows.forEach((r, i) => { if (linhaAtiva(r)) out.push(i); });
            return out;
        }
        return ed.view.slice();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Desfazer / refazer
    // ══════════════════════════════════════════════════════════════════════

    function limiteUndo() {
        // CSV grande gasta muita memória por instantâneo; guarda menos passos.
        if (ed.rows.length > 20000) return 6;
        if (ed.rows.length > 5000) return 18;
        return MAX_UNDO;
    }

    function snapshot() {
        ed.undo.push({
            headers: ed.headers.slice(),
            rows: ed.rows.map(r => Object.assign({}, r)),
            dono: new Map(ed.dono)
        });
        while (ed.undo.length > limiteUndo()) ed.undo.shift();
        ed.redo.length = 0;
        ed.sujo = true;
    }

    function desfazer() {
        if (!ed.undo.length) return;
        ed.redo.push({
            headers: ed.headers.slice(),
            rows: ed.rows.map(r => Object.assign({}, r)),
            dono: new Map(ed.dono)
        });
        const s = ed.undo.pop();
        ed.headers = s.headers;
        ed.rows = s.rows;
        if (s.dono) ed.dono = s.dono;
        recalcular();
    }

    function refazer() {
        if (!ed.redo.length) return;
        ed.undo.push({
            headers: ed.headers.slice(),
            rows: ed.rows.map(r => Object.assign({}, r)),
            dono: new Map(ed.dono)
        });
        const s = ed.redo.pop();
        ed.headers = s.headers;
        ed.rows = s.rows;
        if (s.dono) ed.dono = s.dono;
        recalcular();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Visão: busca, filtro e ordenação
    // ══════════════════════════════════════════════════════════════════════

    function recomputarView() {
        const busca = (ed.busca || '').trim().toLowerCase();
        const fc = ed.filtroCol;
        const fv = ed.filtroVal;
        const idx = [];
        for (let i = 0; i < ed.rows.length; i++) {
            const r = ed.rows[i];
            if (ed.soSemModelo && (!linhaAtiva(r) || donoDaLinha(r) != null)) continue;
            if (ed.soDestacadas && ed.destacar && !ed.destacar.ids.has(Number(r[COL_ID]))) continue;
            if (fc && fv !== '' && String(r[fc] == null ? '' : r[fc]) !== fv) continue;
            if (busca) {
                let achou = false;
                for (const h of ed.headers) {
                    if (String(r[h] == null ? '' : r[h]).toLowerCase().includes(busca)) { achou = true; break; }
                }
                if (!achou) continue;
            }
            idx.push(i);
        }
        if (ed.ordemCol) {
            const col = ed.ordemCol, dir = ed.ordemDir;
            idx.sort((a, b) => {
                const va = String(ed.rows[a][col] == null ? '' : ed.rows[a][col]);
                const vb = String(ed.rows[b][col] == null ? '' : ed.rows[b][col]);
                const na = parseFloat(va), nb = parseFloat(vb);
                const ambosNum = !isNaN(na) && !isNaN(nb) && String(na) === va.trim() && String(nb) === vb.trim();
                const cmp = ambosNum ? (na - nb) : va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' });
                return cmp * dir;
            });
        }
        ed.view = idx;
    }

    function ordenacaoOuFiltroAtivo() {
        // `soDestacadas` entra aqui pelo mesmo motivo dos outros: com a grade
        // filtrada, a posição na tela não é a posição de impressão, e arrastar
        // jogaria a linha num lugar que o operador não está vendo.
        return !!(ed.ordemCol || (ed.busca || '').trim()
            || (ed.filtroCol && ed.filtroVal !== '') || ed.soDestacadas);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Distribuição entre os modelos do pedido
    // ══════════════════════════════════════════════════════════════════════

    /** O modal tem dois modos; este diz se estamos no de distribuir. */
    function ehDistribuicao() {
        return !!(ed && ed.modelos && ed.modelos.length);
    }

    function corDoModelo(id) {
        const i = ed.modelos.findIndex(m => String(m.id) === String(id));
        return i < 0 ? 'var(--text-faint,#475569)' : PALETA[i % PALETA.length];
    }

    function nomeDoModelo(id) {
        const m = ed.modelos.find(x => String(x.id) === String(id));
        return m ? m.nome : '(modelo fora do pedido)';
    }

    /** Dono atual de uma linha, ou null. A posse é exclusiva por construção. */
    function donoDaLinha(row) {
        const d = ed.dono.get(Number(row[COL_ID]));
        return d === undefined ? null : d;
    }

    /**
     * Entrega as linhas selecionadas a um modelo — ou as deixa sem dono, quando
     * `modeloId` é nulo. Exclusiva de propósito: dar uma linha a um modelo tira
     * dela o dono anterior, e é isso que torna impossível imprimir o mesmo
     * assento em dois modelos do mesmo pedido.
     */
    function atribuir(modeloId) {
        if (!ed.sel.size) { aviso('Selecione as linhas primeiro.', 'error'); return; }
        snapshot();
        const movidos = {};
        let n = 0;
        for (const id of ed.sel) {
            const antes = ed.dono.get(id);
            if (antes !== undefined && String(antes) !== String(modeloId)) {
                movidos[antes] = (movidos[antes] || 0) + 1;
            }
            if (modeloId == null) ed.dono.delete(id);
            else ed.dono.set(id, modeloId);
            n++;
        }
        ed.sel.clear();
        recalcular();
        const de = Object.keys(movidos)
            .map(k => movidos[k] + ' de ' + nomeDoModelo(k)).join(', ');
        aviso(
            (modeloId == null
                ? n + ' linha(s) ficaram sem modelo'
                : n + ' linha(s) para ' + nomeDoModelo(modeloId))
            + (de ? ' (tiradas de: ' + de + ')' : '') + '.',
            'success'
        );
    }

    /**
     * Seleciona um intervalo de linhas pelo numero da coluna #. Existe porque
     * repartir 3.000 assentos entre setores e trabalho de intervalo, nao de
     * clique: rolar ate a linha 1.500 com shift pressionado nao e caminho.
     */
    async function selecionarIntervalo() {
        const v = await dialogo('Selecionar por intervalo',
            'Use o número da linha que aparece na coluna #, que é a ordem de impressão.',
            [
                { key: 'de', label: 'Da linha', type: 'number', value: 1 },
                { key: 'ate', label: 'Até a linha', type: 'number', value: ed.rows.length },
                {
                    key: 'pular', type: 'checkbox', value: true,
                    label: 'Pular as linhas que já são de outro modelo (as vermelhas)'
                },
                {
                    key: 'somar', type: 'checkbox', value: false,
                    label: 'Somar à seleção atual, em vez de substituí-la'
                }
            ], 'Selecionar');
        if (!v) return;

        const de = Math.max(1, Math.min(ed.rows.length, parseInt(v.de) || 1));
        const ate = Math.max(1, Math.min(ed.rows.length, parseInt(v.ate) || 1));
        const a = Math.min(de, ate) - 1, b = Math.max(de, ate) - 1;

        if (!v.somar) ed.sel.clear();

        let pegas = 0, deOutro = 0, desmarcadas = 0;
        for (let i = a; i <= b; i++) {
            const row = ed.rows[i];
            if (!row) continue;
            // Linha desmarcada nao vai para o papel; atribui-la a um modelo nao
            // faria nada, e ainda inflaria a contagem da fatia.
            if (!linhaAtiva(row)) { desmarcadas++; continue; }
            const dono = donoDaLinha(row);
            const deTerceiro = dono != null && (!ed.foco || String(dono) !== String(ed.foco));
            if (v.pular && deTerceiro) { deOutro++; continue; }
            ed.sel.add(Number(row[COL_ID]));
            pegas++;
        }
        recalcular();
        aviso(
            `${pegas.toLocaleString('pt-BR')} linha(s) selecionada(s)`
            + (deOutro ? `, ${deOutro} de outro modelo ficaram de fora` : '')
            + (desmarcadas ? `, ${desmarcadas} desmarcada(s) ignorada(s)` : '')
            + '.',
            pegas ? 'success' : 'error'
        );
    }

    /** Quantas linhas ativas cada modelo leva, e quantas ficaram sem dono. */
    function cobertura() {
        const porModelo = {};
        ed.modelos.forEach(m => { porModelo[m.id] = 0; });
        let semDono = 0, ativas = 0;
        for (const r of ed.rows) {
            if (!linhaAtiva(r)) continue;
            ativas++;
            const d = donoDaLinha(r);
            if (d == null) semDono++;
            else if (porModelo[d] !== undefined) porModelo[d]++;
            else semDono++;      // dono de um modelo que saiu do pedido
        }
        return { porModelo, semDono, ativas };
    }

    function alternarSelecao(ri, aditivo, ateAqui) {
        const id = Number(ed.rows[ri][COL_ID]);
        if (ateAqui && ed.ultimoClique != null) {
            const a = posicaoNaView(ed.ultimoClique), b = posicaoNaView(ri);
            if (a >= 0 && b >= 0) {
                for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
                    ed.sel.add(Number(ed.rows[ed.view[p]][COL_ID]));
                }
                pintarJanela(); renderRodape(); return;
            }
        }
        if (ed.sel.has(id)) ed.sel.delete(id); else ed.sel.add(id);
        ed.ultimoClique = ri;
        pintarJanela();
        renderCabecalho();
        renderRodape();
        renderBarras();   // os botoes de modelo so ligam com algo selecionado
    }

    function selecionarView(ligado) {
        for (const i of ed.view) {
            const id = Number(ed.rows[i][COL_ID]);
            if (ligado) ed.sel.add(id); else ed.sel.delete(id);
        }
        pintarJanela();
        renderCabecalho();
        renderRodape();
        renderBarras();
    }

    /** Cancela ou reativa as linhas selecionadas (o __ativo de sempre). */
    function cancelarSelecao(cancelar) {
        if (!ed.sel.size) { aviso('Selecione as linhas primeiro.', 'error'); return; }
        snapshot();
        for (const r of ed.rows) {
            if (!ed.sel.has(Number(r[COL_ID]))) continue;
            if (cancelar) r[COL_ATIVO] = false; else delete r[COL_ATIVO];
        }
        recalcular();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Larguras de coluna
    // ══════════════════════════════════════════════════════════════════════

    function calcularLarguras() {
        const amostra = Math.min(ed.rows.length, 200);
        for (const h of ed.headers) {
            if (ed.larguras[h]) continue;
            let max = h.length;
            for (let i = 0; i < amostra; i++) {
                const v = ed.rows[i][h];
                if (v != null && String(v).length > max) max = String(v).length;
            }
            ed.larguras[h] = Math.max(92, Math.min(300, 22 + max * 7.6));
        }
        for (const k of Object.keys(ed.larguras)) {
            if (!ed.headers.includes(k)) delete ed.larguras[k];
        }
    }

    function larguraTotal() {
        let w = W_DRAG + W_CHECK + W_IDX + (ehDistribuicao() ? W_MODELO : 0);
        for (const h of ed.headers) w += ed.larguras[h] || 120;
        return w;
    }

    function esquerdaDaColuna(c) {
        let x = W_DRAG + W_CHECK + W_IDX + (ehDistribuicao() ? W_MODELO : 0);
        for (let i = 0; i < c; i++) x += ed.larguras[ed.headers[i]] || 120;
        return x;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Renderização
    // ══════════════════════════════════════════════════════════════════════

    function recalcular() {
        // Linha nova — criada, colada ou importada — nasce sem __id. Como toda
        // mutação passa por aqui, este é o único lugar que precisa cuidar disso.
        garantirIds(ed.rows);
        calcularLarguras();
        recomputarView();
        renderCabecalho();
        renderBarras();
        renderCorpo(true);
        renderRodape();
    }

    function renderCabecalho() {
        const head = dom.head;
        head.innerHTML = '';
        head.style.minWidth = larguraTotal() + 'px';

        const fixa = (w, txt, titulo) => {
            const d = document.createElement('div');
            d.className = 'csv-ed-hc fixa';
            d.style.width = w + 'px';
            d.textContent = txt;
            if (titulo) d.title = titulo;
            return d;
        };
        head.appendChild(fixa(W_DRAG, ''));

        const distrib = ehDistribuicao();
        const hChk = fixa(W_CHECK, '', distrib
            ? 'Selecionar ou limpar as linhas visíveis'
            : 'Marcar ou desmarcar tudo');
        hChk.style.cursor = 'pointer';
        const cbTodos = document.createElement('input');
        cbTodos.type = 'checkbox';
        cbTodos.checked = distrib
            ? (ed.view.length > 0 && ed.view.every(i => ed.sel.has(Number(ed.rows[i][COL_ID]))))
            : (ed.rows.length > 0 && contarAtivas(ed.rows) === ed.rows.length);
        cbTodos.onclick = e => {
            e.stopPropagation();
            if (distrib) selecionarView(cbTodos.checked);
            else marcarTodas(cbTodos.checked);
        };
        hChk.appendChild(cbTodos);
        head.appendChild(hChk);

        head.appendChild(fixa(W_IDX, '#', 'Ordem de impressão'));
        if (distrib) head.appendChild(fixa(W_MODELO, 'Modelo', 'Qual modelo do pedido imprime esta linha'));

        ed.headers.forEach((h, c) => {
            const d = document.createElement('div');
            d.className = 'csv-ed-hc';
            d.style.width = (ed.larguras[h] || 120) + 'px';
            const nm = document.createElement('span');
            nm.className = 'nm';
            nm.textContent = h;
            d.appendChild(nm);
            if (ed.ordemCol === h) {
                const o = document.createElement('span');
                o.className = 'ord';
                o.textContent = ed.ordemDir > 0 ? '▲' : '▼';
                d.appendChild(o);
            }
            d.title = `${h} — clique para ordenar a visualização`;
            d.onclick = () => {
                if (ed.ordemCol === h && ed.ordemDir > 0) ed.ordemDir = -1;
                else if (ed.ordemCol === h) { ed.ordemCol = null; ed.ordemDir = 1; }
                else { ed.ordemCol = h; ed.ordemDir = 1; }
                recalcular();
            };
            head.appendChild(d);
        });
    }

    function renderCorpo(resetScroll) {
        const n = ed.view.length;
        dom.inner.style.minWidth = larguraTotal() + 'px';
        dom.spacer.style.height = (n * ROW_H) + 'px';
        dom.spacer.style.minWidth = larguraTotal() + 'px';
        if (resetScroll) dom.scroll.scrollTop = Math.min(dom.scroll.scrollTop, Math.max(0, n * ROW_H - 50));
        renderVazio();
        pintarJanela();
        posicionarEdicao();
    }

    /**
     * O painel que ocupa o lugar da grade quando não há linha para mostrar.
     * Banco vazio é diferente de filtro que não casou: no primeiro caso a tela
     * precisa dizer por onde começar, senão o operador fica olhando um retângulo
     * escuro sem saber que dá para colar do Excel.
     */
    function renderVazio() {
        dom.vazio.innerHTML = '';
        if (ed.view.length) { dom.vazio.style.display = 'none'; return; }
        dom.vazio.style.display = 'block';

        if (ed.rows.length) {
            dom.vazio.textContent = ed.soSemModelo
                ? 'Nenhuma linha sem modelo — está tudo distribuído.'
                : ed.soDestacadas
                    ? 'Nenhuma das linhas apontadas continua no banco.'
                    : 'Nenhuma linha casa com a busca e o filtro atuais.';
            return;
        }
        if (ehDistribuicao()) {
            dom.vazio.textContent = 'Este banco de dados está vazio. '
                + 'Abra a numeração para montá-lo antes de distribuir.';
            return;
        }

        const t = document.createElement('div');
        t.className = 'titulo';
        t.textContent = ed.headers.length
            ? 'Nenhuma linha ainda.'
            : 'Banco de dados vazio.';
        const p = document.createElement('div');
        p.textContent = ed.headers.length
            ? 'As colunas já existem. Acrescente linhas, ou cole os dados de uma vez.'
            : 'Cole as colunas prontas do Excel, importe um arquivo, ou monte à mão criando as colunas.';
        const acoes = document.createElement('div');
        acoes.className = 'acoes';
        acoes.appendChild(botao('📋 Colar do Excel…', 'Colar o conteúdo copiado de uma planilha', colarDoExcel));
        acoes.appendChild(botao('⬆ Importar CSV', 'Escolher um arquivo .csv', importarCsv));
        acoes.appendChild(botao(ed.headers.length ? '+ Nova linha' : '+ Criar coluna', null,
            ed.headers.length ? novaLinha : novaColuna));

        dom.vazio.appendChild(t);
        dom.vazio.appendChild(p);
        dom.vazio.appendChild(acoes);
    }

    function pintarJanela() {
        const n = ed.view.length;
        const topo = Math.max(0, dom.scroll.scrollTop - HEAD_H);
        const ini = Math.max(0, Math.floor(topo / ROW_H) - OVERSCAN);
        const fim = Math.min(n, Math.ceil((topo + dom.scroll.clientHeight) / ROW_H) + OVERSCAN);

        const frag = document.createDocumentFragment();
        for (let p = ini; p < fim; p++) frag.appendChild(montarLinha(p));

        // Guarda o input de edição, que é filho permanente do spacer.
        dom.spacer.querySelectorAll('.csv-ed-r').forEach(e => e.remove());
        dom.spacer.appendChild(frag);
    }

    function montarLinha(pos) {
        const ri = ed.view[pos];
        const row = ed.rows[ri];
        const distrib = ehDistribuicao();
        const selecionada = distrib && ed.sel.has(Number(row[COL_ID]));
        const el = document.createElement('div');
        el.className = 'csv-ed-r' + (linhaAtiva(row) ? '' : ' off')
            + (selecionada ? ' sel' : '')
            + (ed.destacar && ed.destacar.ids.has(Number(row[COL_ID])) ? ' apontada' : '');
        el.style.top = (pos * ROW_H) + 'px';
        el.style.minWidth = larguraTotal() + 'px';
        el.dataset.ri = ri;

        const travado = ordenacaoOuFiltroAtivo();
        const dg = document.createElement('div');
        dg.className = 'csv-ed-c dg' + (travado ? ' travada' : '');
        dg.style.width = W_DRAG + 'px';
        dg.textContent = '⠿';
        dg.title = travado
            ? 'Desative a busca, o filtro e a ordenação para reordenar arrastando'
            : 'Arraste para mudar a ordem de impressão';
        if (!travado) {
            dg.draggable = true;
            dg.ondragstart = e => {
                ed.arrastando = ri;
                el.classList.add('arrastando');
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(ri)); } catch (_) { }
            };
            dg.ondragend = () => {
                ed.arrastando = null;
                dom.spacer.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo'));
                pintarJanela();
            };
        }
        el.appendChild(dg);

        el.ondragover = e => {
            if (ed.arrastando == null) return;
            e.preventDefault();
            dom.spacer.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo'));
            el.classList.add('alvo');
        };
        el.ondrop = e => {
            if (ed.arrastando == null) return;
            e.preventDefault();
            moverLinha(ed.arrastando, ri);
            ed.arrastando = null;
        };

        const chk = document.createElement('div');
        chk.className = 'csv-ed-c chk';
        chk.style.width = W_CHECK + 'px';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        // A caixa troca de sentido entre os dois modos, e isso e deliberado:
        // distribuindo, ela e a selecao do momento; editando, ela diz se a
        // linha vai para o papel.
        cb.checked = distrib ? selecionada : linhaAtiva(row);
        cb.title = distrib
            ? 'Selecionar esta linha para atribuir a um modelo'
            : 'Desmarcada, a linha não é impressa (mas continua guardada)';
        cb.onclick = e => {
            e.stopPropagation();
            if (distrib) alternarSelecao(ri, true, e.shiftKey);
            else alternarAtiva(ri, cb.checked);
        };
        chk.appendChild(cb);
        el.appendChild(chk);

        const idx = document.createElement('div');
        idx.className = 'csv-ed-c idx';
        idx.style.width = W_IDX + 'px';
        idx.textContent = String(ri + 1);
        el.appendChild(idx);

        if (distrib) {
            const cm = document.createElement('div');
            cm.className = 'csv-ed-c mod';
            cm.style.width = W_MODELO + 'px';
            const dono = donoDaLinha(row);
            // Aberta a partir de um modelo (o 🧩 do card), a coluna vira
            // semaforo: verde e o que este modelo ainda pode pegar, vermelho e
            // o que ja pertence a outro. Sem foco — vindo do aviso da fila, em
            // que se reparte entre todos — vale a cor de cada modelo, que ali e
            // a informacao util.
            const comFoco = !!ed.foco;
            const meu = comFoco && dono != null && String(dono) === String(ed.foco);
            if (dono == null && !comFoco) {
                cm.classList.add('sem');
                cm.textContent = '— sem modelo';
            } else if (dono == null) {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.style.background = '#22c55e';
                cm.appendChild(chip);
                const nm = document.createElement('span');
                nm.textContent = 'Disponível';
                nm.style.color = '#22c55e';
                cm.appendChild(nm);
            } else {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.style.background = (comFoco && !meu) ? '#ef4444' : corDoModelo(dono);
                cm.appendChild(chip);
                const nm = document.createElement('span');
                nm.textContent = nomeDoModelo(dono);
                if (comFoco && !meu) nm.style.color = '#ef4444';
                nm.style.overflow = 'hidden';
                nm.style.textOverflow = 'ellipsis';
                cm.appendChild(nm);
            }
            el.appendChild(cm);
        }

        ed.headers.forEach((h, c) => {
            const cel = document.createElement('div');
            cel.className = 'csv-ed-c';
            if (!distrib && ed.cursor.r === ri && ed.cursor.c === c) cel.classList.add('cursor');
            cel.style.width = (ed.larguras[h] || 120) + 'px';
            const v = row[h];
            cel.textContent = v == null ? '' : String(v);
            // Tudo no mousedown, com preventDefault: assim o blur padrão do input
            // de edição não dispara depois de o cursor já ter mudado de célula —
            // o que gravaria o valor antigo na célula nova.
            cel.onmousedown = e => {
                e.preventDefault();
                // Distribuindo nao se edita dado: clicar na linha e selecionar.
                // Sao dois trabalhos diferentes, e misturar os dois na mesma tela
                // e o caminho curto para alterar um assento sem querer.
                if (distrib) { alternarSelecao(ri, e.ctrlKey || e.metaKey, e.shiftKey); return; }
                if (ed.editando) confirmarEdicao();
                ed.cursor = { r: ri, c };
                iniciarEdicao();
            };
            el.appendChild(cel);
        });

        return el;
    }

    function renderRodape() {
        if (ehDistribuicao()) return renderRodapeDistribuicao();
        const ativas = contarAtivas(ed.rows);
        const total = ed.rows.length;
        dom.info.innerHTML = '';
        const b = document.createElement('b');
        b.textContent = ativas.toLocaleString('pt-BR');
        dom.info.appendChild(b);
        dom.info.appendChild(document.createTextNode(
            ` de ${total.toLocaleString('pt-BR')} ${total === 1 ? 'linha será impressa' : 'linhas serão impressas'}` +
            (ed.view.length !== total ? ` · ${ed.view.length.toLocaleString('pt-BR')} visíveis` : '')
        ));
        dom.sub.textContent = `${total.toLocaleString('pt-BR')} linhas · ${ed.headers.length} colunas`;
    }

    /**
     * No modo distribuição sobra uma pergunta só, porque a posse é exclusiva e
     * linha repetida não pode acontecer: ficou alguém sem dono?
     */
    function renderRodapeDistribuicao() {
        const c = cobertura();
        dom.info.innerHTML = '';

        const marca = document.createElement('b');
        if (c.semDono) {
            marca.textContent = `⚠ ${c.semDono.toLocaleString('pt-BR')} sem modelo`;
            marca.style.color = '#f59e0b';
            marca.style.cursor = 'pointer';
            marca.title = 'Clique para ver só essas linhas';
            marca.onclick = filtrarSemModelo;
        } else {
            marca.textContent = `✓ ${c.ativas.toLocaleString('pt-BR')} linhas distribuídas`;
        }
        dom.info.appendChild(marca);

        const resto = ed.modelos
            .map(m => `${m.nome} ${(c.porModelo[m.id] || 0).toLocaleString('pt-BR')}`)
            .join(' · ');
        dom.info.appendChild(document.createTextNode(
            `  ·  ${resto}` + (ed.sel.size ? `  ·  ${ed.sel.size} selecionadas` : '')
        ));

        const canceladas = ed.rows.length - c.ativas;
        dom.sub.textContent = `${ed.rows.length.toLocaleString('pt-BR')} linhas`
            + (canceladas ? ` · ${canceladas} canceladas` : '');
    }

    /**
     * A faixa de quem chegou aqui apontando linhas — hoje, o conferidor de
     * espaço do texto do editor de numeração. Sem ela a tela abriria filtrada
     * e nada explicaria por que o banco "encolheu".
     */
    function renderFaixaApontadas(bars) {
        if (!ed.destacar) return;
        const n = ed.destacar.ids.size;
        const faixa = document.createElement('div');
        faixa.className = 'csv-ed-bar csv-ed-guia';
        faixa.innerHTML = '<span class="nota" style="color:#f59e0b;">⚠️ '
            + ed.destacar.motivo.replace(/[<>]/g, '') + '</span>';
        faixa.appendChild(botao(
            ed.soDestacadas
                ? `✕ mostrando só as ${n} apontadas`
                : `🔍 mostrar só as ${n} apontadas`,
            ed.soDestacadas
                ? 'Voltar a mostrar o banco inteiro'
                : 'Filtrar a grade nas linhas apontadas',
            alternarSoDestacadas));
        bars.appendChild(faixa);
    }

    /** Liga e desliga o filtro das linhas apontadas. */
    function alternarSoDestacadas() {
        ed.busca = '';
        ed.filtroCol = '';
        ed.filtroVal = '';
        ed.soDestacadas = !ed.soDestacadas;
        recalcular();
    }

    /** Deixa na tela só as linhas ativas que ninguém pegou. */
    function filtrarSemModelo() {
        ed.busca = '';
        ed.filtroCol = '';
        ed.filtroVal = '';
        ed.soSemModelo = !ed.soSemModelo;
        recalcular();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Edição de célula
    // ══════════════════════════════════════════════════════════════════════

    function posicaoNaView(ri) {
        return ed.view.indexOf(ri);
    }

    function iniciarEdicao(valorInicial) {
        const { r, c } = ed.cursor;
        if (r < 0 || c < 0 || !ed.rows[r] || !ed.headers[c]) return;
        const pos = posicaoNaView(r);
        if (pos < 0) return;
        const inp = dom.edit;
        inp.style.display = 'block';
        inp.style.top = (pos * ROW_H) + 'px';
        inp.style.left = esquerdaDaColuna(c) + 'px';
        inp.style.width = (ed.larguras[ed.headers[c]] || 120) + 'px';
        inp.style.height = ROW_H + 'px';
        inp.value = valorInicial != null ? valorInicial : (ed.rows[r][ed.headers[c]] || '');
        ed.editando = true;
        inp.focus();
        if (valorInicial == null) inp.select();
        else inp.setSelectionRange(inp.value.length, inp.value.length);
    }

    function posicionarEdicao() {
        if (!ed.editando) { dom.edit.style.display = 'none'; return; }
        const pos = posicaoNaView(ed.cursor.r);
        if (pos < 0) { cancelarEdicao(); return; }
        dom.edit.style.top = (pos * ROW_H) + 'px';
    }

    function confirmarEdicao() {
        if (!ed.editando) return;
        const { r, c } = ed.cursor;
        const h = ed.headers[c];
        const novo = dom.edit.value;
        ed.editando = false;
        dom.edit.style.display = 'none';
        if (ed.rows[r] && String(ed.rows[r][h] == null ? '' : ed.rows[r][h]) !== novo) {
            snapshot();
            ed.rows[r][h] = novo;
            recalcular();
        }
        dom.scroll.focus();
    }

    function cancelarEdicao() {
        ed.editando = false;
        dom.edit.style.display = 'none';
        dom.scroll.focus();
    }

    function moverCursor(dr, dc) {
        const pos = posicaoNaView(ed.cursor.r);
        let np = pos < 0 ? 0 : pos + dr;
        np = Math.max(0, Math.min(ed.view.length - 1, np));
        let nc = ed.cursor.c + dc;
        nc = Math.max(0, Math.min(ed.headers.length - 1, nc));
        ed.cursor = { r: ed.view[np], c: nc };
        garantirVisivel(np);
        pintarJanela();
    }

    function garantirVisivel(pos) {
        // A linha `pos` ocupa, nas coordenadas do contêiner de rolagem,
        // [HEAD_H + pos*ROW_H, HEAD_H + (pos+1)*ROW_H]. A faixa realmente
        // visível começa depois do cabeçalho fixo.
        const topoLinha = HEAD_H + pos * ROW_H;
        const minScroll = topoLinha + ROW_H - dom.scroll.clientHeight;
        const maxScroll = topoLinha - HEAD_H;
        if (dom.scroll.scrollTop > maxScroll) dom.scroll.scrollTop = Math.max(0, maxScroll);
        else if (dom.scroll.scrollTop < minScroll) dom.scroll.scrollTop = Math.max(0, minScroll);
    }

    /** Cola uma matriz TSV a partir da célula do cursor, criando o que faltar. */
    function colarMatriz(matriz) {
        if (!matriz.length) return;
        const pos = Math.max(0, posicaoNaView(ed.cursor.r));
        const c0 = Math.max(0, ed.cursor.c);
        snapshot();

        // Colunas que faltam
        const precisaCols = c0 + Math.max(...matriz.map(l => l.length));
        while (ed.headers.length < precisaCols) {
            const nome = nomeDeColunaLivre(`Coluna ${ed.headers.length + 1}`);
            ed.headers.push(nome);
            ed.rows.forEach(r => { r[nome] = ''; });
        }
        // Linhas que faltam (só quando não há filtro, senão a posição não bate)
        for (let i = 0; i < matriz.length; i++) {
            const p = pos + i;
            if (p >= ed.view.length) {
                const nova = {};
                ed.headers.forEach(h => { nova[h] = ''; });
                ed.rows.push(nova);
                ed.view.push(ed.rows.length - 1);
            }
            const ri = ed.view[p];
            for (let j = 0; j < matriz[i].length; j++) {
                const h = ed.headers[c0 + j];
                if (h) ed.rows[ri][h] = matriz[i][j];
            }
        }
        recalcular();
        aviso(`${matriz.length} linha(s) coladas.`, 'success');
    }

    /**
     * Despeja uma matriz inteira no banco: é o caminho de "colar do Excel" e o
     * de começar do zero. Diferente de `colarMatriz`, que preenche a partir da
     * célula do cursor, aqui a primeira linha pode virar o cabeçalho.
     * `modo` é 'substituir' ou 'anexar'. Devolve quantas linhas entraram.
     */
    function aplicarMatriz(matriz, comCabecalho, modo) {
        if (!matriz || !matriz.length) return 0;
        snapshot();

        let cabecalhos, linhas;
        if (comCabecalho) {
            cabecalhos = normalizarCabecalhos(matriz[0]);
            linhas = matriz.slice(1);
        } else {
            const largura = Math.max(...matriz.map(l => l.length));
            cabecalhos = (modo === 'anexar' && ed.headers.length)
                ? ed.headers.slice()
                : Array.from({ length: largura }, (_, i) => `Coluna ${i + 1}`);
            linhas = matriz;
        }

        if (modo === 'substituir') {
            ed.headers = cabecalhos;
            ed.rows = [];
            ed.larguras = {};
            ed.ordemCol = null;
            ed.filtroCol = '';
            ed.filtroVal = '';
            ed.busca = '';
        } else {
            // Anexando: coluna que o texto trouxe e a tabela não tem é criada,
            // senão o dado colado sumiria sem aviso.
            cabecalhos.forEach(h => {
                if (!ed.headers.includes(h)) {
                    ed.headers.push(h);
                    ed.rows.forEach(r => { r[h] = ''; });
                }
            });
        }

        for (const l of linhas) {
            const o = {};
            ed.headers.forEach(h => { o[h] = ''; });
            cabecalhos.forEach((h, i) => {
                if (Object.prototype.hasOwnProperty.call(o, h)) o[h] = l[i] != null ? l[i] : '';
            });
            ed.rows.push(o);
        }

        ed.cursor = { r: ed.rows.length ? 0 : -1, c: 0 };
        recalcular();
        return linhas.length;
    }

    /**
     * Cola por uma caixa de texto em vez de depender do Ctrl+V na grade. É o
     * caminho principal de quem está montando o banco do zero: o Excel copia
     * TSV, e a primeira linha quase sempre é o cabeçalho.
     */
    async function colarDoExcel() {
        const vazio = !ed.headers.length || !ed.rows.length;
        const v = await dialogo('Colar do Excel',
            'Selecione as células no Excel ou no Google Sheets, copie com Ctrl+C, '
            + 'e cole aqui dentro com Ctrl+V.',
            [
                {
                    key: 'texto', label: 'Cole aqui', type: 'textarea', rows: 9,
                    placeholder: 'Fila\tNumero\tSetor\nA\t01\tPista\nA\t02\tPista'
                },
                { key: 'cabecalho', label: 'A primeira linha é o cabeçalho', type: 'checkbox', value: true },
                {
                    key: 'modo', label: 'O que fazer', type: 'select',
                    value: vazio ? 'substituir' : 'anexar',
                    options: [
                        { v: 'substituir', t: 'Substituir tudo o que está aqui' },
                        { v: 'anexar', t: 'Anexar ao final' }
                    ]
                }
            ], 'Colar');
        if (!v || !String(v.texto).trim()) return;

        const n = aplicarMatriz(parseColado(v.texto), v.cabecalho, v.modo);
        aviso(n ? `${n} linha(s) coladas.` : 'Nada para colar.', n ? 'success' : 'error');
    }

    function nomeDeColunaLivre(base) {
        let nome = base, n = 2;
        while (ed.headers.includes(nome) || colunaInterna(nome)) nome = `${base} (${n++})`;
        return nome;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Operações de linha
    // ══════════════════════════════════════════════════════════════════════

    function alternarAtiva(ri, ativa) {
        snapshot();
        if (ativa) delete ed.rows[ri][COL_ATIVO];
        else ed.rows[ri][COL_ATIVO] = false;
        recalcular();
    }

    function marcarTodas(ativa) {
        snapshot();
        for (const r of ed.rows) { if (ativa) delete r[COL_ATIVO]; else r[COL_ATIVO] = false; }
        recalcular();
    }

    function marcarView(ativa) {
        snapshot();
        for (const i of ed.view) { if (ativa) delete ed.rows[i][COL_ATIVO]; else ed.rows[i][COL_ATIVO] = false; }
        recalcular();
    }

    function soAsVisiveis() {
        snapshot();
        const dentro = new Set(ed.view);
        ed.rows.forEach((r, i) => { if (dentro.has(i)) delete r[COL_ATIVO]; else r[COL_ATIVO] = false; });
        recalcular();
    }

    function inverterMarcacao() {
        snapshot();
        for (const r of ed.rows) {
            if (linhaAtiva(r)) r[COL_ATIVO] = false; else delete r[COL_ATIVO];
        }
        recalcular();
    }

    async function marcarIntervalo() {
        const v = await dialogo('Marcar por intervalo',
            'Use o número da linha que aparece na coluna #, que é a ordem de impressão.',
            [
                { key: 'de', label: 'Da linha', type: 'number', value: 1 },
                { key: 'ate', label: 'Até a linha', type: 'number', value: ed.rows.length },
                {
                    key: 'acao', label: 'Ação', type: 'select', value: 'marcar',
                    options: [{ v: 'marcar', t: 'Marcar (imprimir)' }, { v: 'desmarcar', t: 'Desmarcar (não imprimir)' }]
                }
            ], 'Aplicar');
        if (!v) return;
        const de = Math.max(1, Math.min(ed.rows.length, v.de || 1));
        const ate = Math.max(1, Math.min(ed.rows.length, v.ate || 1));
        const a = Math.min(de, ate) - 1, b = Math.max(de, ate) - 1;
        snapshot();
        for (let i = a; i <= b; i++) {
            if (v.acao === 'marcar') delete ed.rows[i][COL_ATIVO];
            else ed.rows[i][COL_ATIVO] = false;
        }
        recalcular();
        aviso(`${b - a + 1} linha(s) ${v.acao === 'marcar' ? 'marcadas' : 'desmarcadas'}.`, 'success');
    }

    function novaLinha() {
        if (!ed.headers.length) {
            aviso('Crie ao menos uma coluna antes de acrescentar linhas.', 'error');
            return;
        }
        snapshot();
        const nova = {};
        ed.headers.forEach(h => { nova[h] = ''; });
        const pos = posicaoNaView(ed.cursor.r);
        if (pos >= 0 && !ordenacaoOuFiltroAtivo()) ed.rows.splice(ed.cursor.r + 1, 0, nova);
        else ed.rows.push(nova);
        recalcular();
    }

    function duplicarLinha() {
        if (ed.cursor.r < 0 || !ed.rows[ed.cursor.r]) { aviso('Escolha uma linha primeiro.', 'error'); return; }
        snapshot();
        const copia = Object.assign({}, ed.rows[ed.cursor.r]);
        delete copia[COL_ID];        // a cópia é outra linha, com identidade própria
        ed.rows.splice(ed.cursor.r + 1, 0, copia);
        recalcular();
    }

    async function removerLinha() {
        if (ed.cursor.r < 0 || !ed.rows[ed.cursor.r]) { aviso('Escolha uma linha primeiro.', 'error'); return; }
        const ri = ed.cursor.r;
        const ok = await confirmar(`Remover a linha ${ri + 1}?`,
            'A linha é apagada de verdade. Para tirá-la só da impressão, desmarque a caixinha em vez de remover.',
            'Remover');
        if (!ok) return;
        snapshot();
        ed.rows.splice(ri, 1);
        ed.cursor = { r: Math.min(ri, ed.rows.length - 1), c: ed.cursor.c };
        recalcular();
    }

    async function removerDesmarcadas() {
        const fora = ed.rows.length - contarAtivas(ed.rows);
        if (!fora) { aviso('Não há linha desmarcada.', 'info'); return; }
        const ok = await confirmar(`Remover as ${fora} linhas desmarcadas?`,
            'Elas são apagadas do banco de dados desta numeração. Isso não dá para desfazer depois de salvar.',
            'Remover');
        if (!ok) return;
        snapshot();
        ed.rows = ed.rows.filter(linhaAtiva);
        recalcular();
        aviso(`${fora} linha(s) removidas.`, 'success');
    }

    function moverLinha(de, para) {
        if (de === para) return;
        snapshot();
        const [r] = ed.rows.splice(de, 1);
        ed.rows.splice(para, 0, r);
        ed.cursor = { r: para, c: ed.cursor.c };
        recalcular();
    }

    async function aplicarOrdemNaImpressao() {
        if (!ed.ordemCol) { aviso('Ordene por uma coluna primeiro, clicando no cabeçalho.', 'error'); return; }
        const ok = await confirmar('Aplicar esta ordem à impressão?',
            'A ordem das linhas é a ordem em que os itens saem impressos. Reordenar de verdade muda qual dado cai em cada ticket.',
            'Aplicar a ordem');
        if (!ok) return;
        snapshot();
        const novas = ed.view.map(i => ed.rows[i]);
        const dentro = new Set(ed.view);
        ed.rows.forEach((r, i) => { if (!dentro.has(i)) novas.push(r); });
        ed.rows = novas;
        ed.ordemCol = null;
        ed.ordemDir = 1;
        recalcular();
        aviso('Ordem aplicada à impressão.', 'success');
    }

    // ══════════════════════════════════════════════════════════════════════
    // Operações de coluna
    // ══════════════════════════════════════════════════════════════════════

    function usoDaColuna(nome) {
        try {
            const m = typeof ed.colunasEmUso === 'function' ? ed.colunasEmUso() : {};
            return Number(m && m[nome]) || 0;
        } catch (_) { return 0; }
    }

    async function novaColuna() {
        const v = await dialogo('Nova coluna', null,
            [{ key: 'nome', label: 'Nome da coluna', type: 'text', value: '', placeholder: 'Ex: Setor' }],
            'Criar');
        if (!v || !String(v.nome).trim()) return;
        const nome = nomeDeColunaLivre(String(v.nome).trim());
        snapshot();
        ed.headers.push(nome);
        ed.rows.forEach(r => { r[nome] = ''; });
        recalcular();
    }

    /** Registra a renomeação de forma encadeada: A→B seguido de B→C vira A→C. */
    function registrarRenomeacao(de, para) {
        const anterior = ed.renomeacoes.find(x => x.para === de);
        if (anterior) anterior.para = para;
        else ed.renomeacoes.push({ de, para });
    }

    function gerenciarColunas() {
        const bg = document.createElement('div');
        // Id próprio: este painel pode abrir um `dialogo()` por cima, e dois
        // elementos com o mesmo id fariam o Esc fechar os dois de uma vez.
        bg.id = 'csv-ed-cols';
        const box = document.createElement('div');
        box.className = 'csv-ed-dlgbox';
        bg.appendChild(box);

        const h = document.createElement('h3');
        h.textContent = 'Colunas';
        box.appendChild(h);
        const nota = document.createElement('div');
        nota.className = 'nota';
        nota.textContent = 'Renomear uma coluna atualiza junto os elementos da numeração que apontam para ela. '
            + 'Remover uma coluna em uso deixa esses elementos órfãos.';
        box.appendChild(nota);

        const lista = document.createElement('div');
        box.appendChild(lista);

        const pintar = () => {
            lista.innerHTML = '';
            ed.headers.forEach((nome, i) => {
                const row = document.createElement('div');
                row.className = 'csv-ed-colrow';

                const inp = document.createElement('input');
                inp.className = 'csv-ed-in';
                inp.value = nome;
                inp.onchange = () => {
                    const novo = String(inp.value).trim();
                    if (!novo || novo === nome) { inp.value = nome; return; }
                    if (ed.headers.includes(novo) || colunaInterna(novo)) {
                        aviso('Já existe uma coluna com esse nome.', 'error');
                        inp.value = nome;
                        return;
                    }
                    renomearColuna(i, novo);
                    pintar();
                };

                const uso = usoDaColuna(nome);
                if (uso) {
                    const u = document.createElement('span');
                    u.className = 'uso';
                    u.textContent = `${uso} elemento${uso > 1 ? 's' : ''}`;
                    row.appendChild(u);
                }

                const bUp = document.createElement('button');
                bUp.className = 'csv-ed-b';
                bUp.textContent = '↑';
                bUp.disabled = i === 0;
                bUp.onclick = () => { moverColuna(i, i - 1); pintar(); };

                const bDown = document.createElement('button');
                bDown.className = 'csv-ed-b';
                bDown.textContent = '↓';
                bDown.disabled = i === ed.headers.length - 1;
                bDown.onclick = () => { moverColuna(i, i + 1); pintar(); };

                const bDel = document.createElement('button');
                bDel.className = 'csv-ed-b perigo';
                bDel.textContent = '✕';
                bDel.onclick = async () => {
                    const usoAgora = usoDaColuna(ed.headers[i]);
                    const ok = await confirmar(`Remover a coluna "${ed.headers[i]}"?`,
                        usoAgora
                            ? `${usoAgora} elemento(s) da numeração usam esta coluna e vão ficar sem dado.`
                            : 'Os valores dessa coluna são apagados em todas as linhas.',
                        'Remover');
                    if (!ok) return;
                    removerColuna(i);
                    pintar();
                };

                row.insertBefore(inp, row.firstChild);
                row.appendChild(bUp);
                row.appendChild(bDown);
                row.appendChild(bDel);
                lista.appendChild(row);
            });
        };
        pintar();

        const acoes = document.createElement('div');
        acoes.className = 'csv-ed-dlgacoes';
        const bNova = document.createElement('button');
        bNova.className = 'csv-ed-b';
        bNova.textContent = '+ Nova coluna';
        bNova.onclick = async () => { await novaColuna(); pintar(); };
        const bFechar = document.createElement('button');
        bFechar.className = 'csv-ed-b principal';
        bFechar.textContent = 'Fechar';
        bFechar.onclick = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); };
        acoes.appendChild(bNova);
        acoes.appendChild(bFechar);
        box.appendChild(acoes);

        const onKey = e => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('csv-ed-dlg')) return;   // há um diálogo por cima
            e.stopPropagation();
            bFechar.onclick();
        };
        document.addEventListener('keydown', onKey, true);
        bg.onclick = e => { if (e.target === bg) bFechar.onclick(); };
        document.body.appendChild(bg);
    }

    function renomearColuna(i, novo) {
        const antigo = ed.headers[i];
        snapshot();
        ed.headers[i] = novo;
        ed.rows.forEach(r => {
            r[novo] = r[antigo];
            delete r[antigo];
        });
        ed.larguras[novo] = ed.larguras[antigo];
        delete ed.larguras[antigo];
        if (ed.ordemCol === antigo) ed.ordemCol = novo;
        if (ed.filtroCol === antigo) ed.filtroCol = novo;
        registrarRenomeacao(antigo, novo);
        recalcular();
    }

    function removerColuna(i) {
        const nome = ed.headers[i];
        snapshot();
        ed.headers.splice(i, 1);
        ed.rows.forEach(r => { delete r[nome]; });
        delete ed.larguras[nome];
        if (ed.ordemCol === nome) ed.ordemCol = null;
        if (ed.filtroCol === nome) { ed.filtroCol = ''; ed.filtroVal = ''; }
        ed.cursor.c = Math.min(ed.cursor.c, ed.headers.length - 1);
        recalcular();
    }

    function moverColuna(de, para) {
        if (para < 0 || para >= ed.headers.length) return;
        snapshot();
        const [h] = ed.headers.splice(de, 1);
        ed.headers.splice(para, 0, h);
        recalcular();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Operações em massa
    // ══════════════════════════════════════════════════════════════════════

    function opcoesDeColuna() {
        return ed.headers.map(h => ({ v: h, t: h }));
    }

    async function preencher() {
        if (!ed.headers.length) return;
        const v = await dialogo('Preencher coluna', null, [
            { key: 'col', label: 'Coluna', type: 'select', value: ed.headers[Math.max(0, ed.cursor.c)], options: opcoesDeColuna() },
            { key: 'valor', label: 'Valor', type: 'text', value: '' },
            CAMPO_ESCOPO
        ], 'Preencher');
        if (!v) return;
        const alvo = indicesDoEscopo(v.escopo);
        snapshot();
        for (const i of alvo) ed.rows[i][v.col] = v.valor;
        recalcular();
        aviso(`${alvo.length} célula(s) preenchidas.`, 'success');
    }

    async function gerarColunaSequencial() {
        if (!ed.headers.length) return;
        const v = await dialogo('Gerar sequência',
            'Preenche a coluna escolhida com números em sequência, na ordem em que as linhas aparecem.', [
            { key: 'col', label: 'Coluna', type: 'select', value: ed.headers[Math.max(0, ed.cursor.c)], options: opcoesDeColuna() },
            { key: 'prefixo', label: 'Prefixo', type: 'text', value: '', placeholder: 'Ex: ING-' },
            { key: 'inicio', label: 'Começa em', type: 'number', value: 1 },
            { key: 'passo', label: 'Passo', type: 'number', value: 1 },
            { key: 'zeros', label: 'Zeros à esquerda (total de dígitos)', type: 'number', value: 0 },
            { key: 'sufixo', label: 'Sufixo', type: 'text', value: '' },
            CAMPO_ESCOPO
        ], 'Gerar');
        if (!v) return;
        const alvo = indicesDoEscopo(v.escopo);
        const seq = gerarSequencia({
            qtd: alvo.length, inicio: v.inicio, passo: v.passo,
            zeros: v.zeros, prefixo: v.prefixo, sufixo: v.sufixo
        });
        snapshot();
        alvo.forEach((i, k) => { ed.rows[i][v.col] = seq[k]; });
        recalcular();
        aviso(`${alvo.length} valor(es) gerados.`, 'success');
    }

    async function localizarSubstituir() {
        const v = await dialogo('Localizar e substituir', null, [
            {
                key: 'col', label: 'Coluna', type: 'select', value: '__todas',
                options: [{ v: '__todas', t: 'Todas as colunas' }].concat(opcoesDeColuna())
            },
            { key: 'de', label: 'Localizar', type: 'text', value: '' },
            { key: 'para', label: 'Substituir por', type: 'text', value: '' },
            { key: 'inteiro', label: 'Só quando o valor for exatamente igual', type: 'checkbox', value: false },
            CAMPO_ESCOPO
        ], 'Substituir');
        if (!v || v.de === '') return;
        const alvo = indicesDoEscopo(v.escopo);
        const cols = v.col === '__todas' ? ed.headers : [v.col];
        let n = 0;
        snapshot();
        for (const i of alvo) {
            for (const h of cols) {
                const atual = String(ed.rows[i][h] == null ? '' : ed.rows[i][h]);
                if (v.inteiro) {
                    if (atual === v.de) { ed.rows[i][h] = v.para; n++; }
                } else if (atual.includes(v.de)) {
                    ed.rows[i][h] = atual.split(v.de).join(v.para);
                    n++;
                }
            }
        }
        recalcular();
        aviso(n ? `${n} célula(s) alteradas.` : 'Nada encontrado.', n ? 'success' : 'info');
    }

    // ══════════════════════════════════════════════════════════════════════
    // Importar / exportar
    // ══════════════════════════════════════════════════════════════════════

    function importarCsv() {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.csv,.txt';
        inp.onchange = async () => {
            if (!inp.files || !inp.files.length) return;
            const file = inp.files[0];
            const texto = await file.text();
            const r = parseCsv(texto);
            if (!r.rows.length) { aviso('O arquivo está vazio ou não é um CSV válido.', 'error'); return; }
            const v = await dialogo(`Importar "${file.name}"`,
                `${r.rows.length} linhas e ${r.headers.length} colunas encontradas.`, [{
                    key: 'modo', label: 'O que fazer', type: 'select', value: 'substituir',
                    options: [
                        { v: 'substituir', t: 'Substituir tudo o que está aqui' },
                        { v: 'anexar', t: 'Anexar ao final (mantém as colunas atuais)' }
                    ]
                }], 'Importar');
            if (!v) return;
            snapshot();
            if (v.modo === 'substituir') {
                ed.headers = r.headers;
                ed.rows = r.rows;
                ed.filename = file.name;
                ed.delim = r.delimitador;
                ed.larguras = {};
                ed.ordemCol = null;
                ed.filtroCol = '';
                ed.filtroVal = '';
                ed.busca = '';
                dom.title.textContent = `📊 ${ed.filename}`;
            } else {
                for (const nova of r.rows) {
                    const obj = {};
                    ed.headers.forEach(h => { obj[h] = nova[h] != null ? nova[h] : ''; });
                    ed.rows.push(obj);
                }
            }
            recalcular();
            aviso('CSV importado.', 'success');
        };
        inp.click();
    }

    function exportarCsv() {
        const texto = serializarCsv(ed.headers, ed.rows, ed.delim || ',');
        const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (ed.filename || 'banco.csv').replace(/\.csv$/i, '') + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Barras de ferramentas
    // ══════════════════════════════════════════════════════════════════════

    function botao(txt, titulo, onClick, classe) {
        const b = document.createElement('button');
        b.className = 'csv-ed-b' + (classe ? ' ' + classe : '');
        b.textContent = txt;
        if (titulo) b.title = titulo;
        b.onclick = onClick;
        return b;
    }

    function renderBarras() {
        const bars = dom.bars;
        bars.innerHTML = '';

        renderFaixaApontadas(bars);

        // Faixa 1 — busca, filtro, desfazer, arquivo
        const b1 = document.createElement('div');
        b1.className = 'csv-ed-bar';

        const busca = document.createElement('input');
        busca.className = 'csv-ed-in';
        busca.type = 'search';
        busca.placeholder = '🔍 Buscar em todas as colunas';
        busca.style.minWidth = '240px';
        busca.value = ed.busca;
        busca.oninput = () => {
            ed.busca = busca.value;
            recomputarView();
            renderCorpo();
            renderRodape();
        };
        b1.appendChild(busca);

        const selCol = document.createElement('select');
        selCol.className = 'csv-ed-in';
        selCol.appendChild(new Option('Filtrar por coluna…', ''));
        ed.headers.forEach(h => { selCol.appendChild(new Option(h, h)); });
        selCol.value = ed.filtroCol || '';
        b1.appendChild(selCol);

        const selVal = document.createElement('select');
        selVal.className = 'csv-ed-in';
        selVal.disabled = !ed.filtroCol;
        const pintarValores = () => {
            selVal.innerHTML = '';
            selVal.appendChild(new Option('(todos)', ''));
            if (ed.filtroCol) {
                const vistos = new Set();
                for (const r of ed.rows) {
                    const v = String(r[ed.filtroCol] == null ? '' : r[ed.filtroCol]);
                    if (!vistos.has(v)) vistos.add(v);
                    if (vistos.size > 500) break;
                }
                Array.from(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
                    .forEach(v => selVal.appendChild(new Option(v === '' ? '(vazio)' : v, v)));
            }
            selVal.value = ed.filtroVal || '';
        };
        pintarValores();
        selCol.onchange = () => {
            ed.filtroCol = selCol.value;
            ed.filtroVal = '';
            selVal.disabled = !ed.filtroCol;
            pintarValores();
            recomputarView();
            renderCorpo();
            renderRodape();
        };
        selVal.onchange = () => {
            ed.filtroVal = selVal.value;
            recomputarView();
            renderCorpo();
            renderRodape();
        };
        b1.appendChild(selVal);

        b1.appendChild(document.createElement('div')).className = 'csv-ed-sep';
        const bU = botao('↶', 'Desfazer (Ctrl+Z)', desfazer);
        bU.disabled = !ed.undo.length;
        const bR = botao('↷', 'Refazer (Ctrl+Y)', refazer);
        bR.disabled = !ed.redo.length;
        b1.appendChild(bU);
        b1.appendChild(bR);

        b1.appendChild(document.createElement('div')).className = 'csv-ed-sep';
        // Distribuindo, trocar o banco por baixo apagaria as fatias: as linhas
        // novas teriam identidade nova e nenhum modelo as reconheceria.
        if (!ehDistribuicao()) {
            b1.appendChild(botao('📋 Colar do Excel…', 'Colar células copiadas de uma planilha', colarDoExcel));
            b1.appendChild(botao('⬆ Importar', 'Trocar ou anexar um arquivo CSV', importarCsv));
        }
        b1.appendChild(botao('⬇ Exportar', 'Baixar o CSV como está agora', exportarCsv));
        if (ed.ordemCol) {
            b1.appendChild(document.createElement('div')).className = 'csv-ed-sep';
            b1.appendChild(botao('⇅ Aplicar ordem à impressão',
                'A ordenação por cabeçalho é só visual. Isto reordena de verdade.',
                aplicarOrdemNaImpressao));
        }
        bars.appendChild(b1);

        if (ehDistribuicao()) { renderBarrasDistribuicao(bars); return; }

        // Faixa 2 — linhas e colunas
        const b2 = document.createElement('div');
        b2.className = 'csv-ed-bar';
        const l2 = document.createElement('label');
        l2.className = 'grp';
        l2.textContent = 'Linhas';
        b2.appendChild(l2);
        b2.appendChild(botao('+ Nova', 'Nova linha depois da atual', novaLinha));
        b2.appendChild(botao('⧉ Duplicar', 'Duplicar a linha atual', duplicarLinha));
        b2.appendChild(botao('✕ Remover', 'Apagar a linha atual', removerLinha, 'perigo'));
        b2.appendChild(botao('🗑 Remover desmarcadas', 'Apagar de vez todas as linhas desmarcadas', removerDesmarcadas, 'perigo'));
        b2.appendChild(document.createElement('div')).className = 'csv-ed-sep';
        const l2b = document.createElement('label');
        l2b.className = 'grp';
        l2b.textContent = 'Colunas';
        b2.appendChild(l2b);
        b2.appendChild(botao('+ Nova', 'Criar uma coluna', novaColuna));
        b2.appendChild(botao('⚙ Renomear / ordenar', 'Renomear, reordenar e remover colunas', gerenciarColunas));
        bars.appendChild(b2);

        // Faixa 3 — seleção e massa
        const b3 = document.createElement('div');
        b3.className = 'csv-ed-bar';
        const l3 = document.createElement('label');
        l3.className = 'grp';
        l3.textContent = 'Imprimir';
        b3.appendChild(l3);
        b3.appendChild(botao('Tudo', 'Marcar todas as linhas', () => marcarTodas(true)));
        b3.appendChild(botao('Nada', 'Desmarcar todas as linhas', () => marcarTodas(false)));
        b3.appendChild(botao('Inverter', 'Inverter a marcação', inverterMarcacao));
        b3.appendChild(botao('Só as visíveis', 'Marcar as linhas visíveis e desmarcar todo o resto', soAsVisiveis));
        b3.appendChild(botao('Marcar visíveis', 'Marcar as linhas visíveis sem mexer no resto', () => marcarView(true)));
        b3.appendChild(botao('Intervalo…', 'Marcar ou desmarcar por número de linha', marcarIntervalo));
        b3.appendChild(document.createElement('div')).className = 'csv-ed-sep';
        const l3b = document.createElement('label');
        l3b.className = 'grp';
        l3b.textContent = 'Massa';
        b3.appendChild(l3b);
        b3.appendChild(botao('Preencher…', 'Preencher uma coluna com um valor', preencher));
        b3.appendChild(botao('Gerar sequência…', 'Numerar uma coluna em sequência', gerarColunaSequencial));
        b3.appendChild(botao('Localizar/Substituir…', null, localizarSubstituir));
        bars.appendChild(b3);
    }

    /**
     * Barras do modo distribuição. Nada de estrutura aqui — nem coluna, nem
     * linha nova, nem edição de célula. Distribuir é um trabalho; consertar o
     * dado é outro, e cada um tem a sua tela.
     */
    function renderBarrasDistribuicao(bars) {
        const c = cobertura();

        // Sem esta faixa a tela abre com os botoes de modelo apagados e nada
        // explica por que: o operador ve controles mortos e nao descobre que
        // falta marcar as linhas. Foi exatamente a queixa que a criou.
        const guia = document.createElement('div');
        guia.className = 'csv-ed-bar csv-ed-guia';
        guia.innerHTML =
            '<span class="passo"><span class="num">1</span>'
            + 'Clique nas linhas que um modelo vai imprimir</span>'
            + '<span class="seta">\u2192</span>'
            + '<span class="passo"><span class="num">2</span>'
            + 'Clique no nome do modelo, na barra de baixo</span>'
            + '<span class="nota">'
            + (ed.foco
                ? '<b style="color:#22c55e">\u25cf Disponível</b> \u00b7 '
                  + '<b style="color:#ef4444">\u25cf já é de outro modelo</b> \u00b7 '
                  + 'as suas ficam na cor do modelo. &nbsp;&nbsp;'
                : '')
            + 'Aqui só se reparte. Para corrigir o conteúdo das '
            + 'células, feche e use <b>📊 Ver / editar</b> no card do modelo.</span>';
        const estado = document.createElement('span');
        estado.className = 'estado';
        if (ed.sel.size) {
            estado.textContent = ed.sel.size.toLocaleString('pt-BR') + ' linha(s) selecionada(s)';
            estado.style.color = '#22c55e';
        } else {
            estado.textContent = 'Nenhuma linha selecionada ainda';
            estado.style.color = '#f59e0b';
        }
        guia.insertBefore(estado, guia.querySelector('.nota'));
        bars.appendChild(guia);

        const b2 = document.createElement('div');
        b2.className = 'csv-ed-bar';
        const l = document.createElement('label');
        l.className = 'grp';
        l.textContent = 'Atribuir a';
        b2.appendChild(l);

        ed.modelos.forEach(m => {
            const b = document.createElement('button');
            b.className = 'csv-ed-b modelo';
            b.title = ed.sel.size
                ? `Dar as ${ed.sel.size} linha(s) selecionada(s) para ${m.nome}`
                : 'Marque as linhas primeiro \u2014 clique nelas na tabela';
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.style.background = corDoModelo(m.id);
            b.appendChild(chip);
            b.appendChild(document.createTextNode(
                `${m.nome} (${(c.porModelo[m.id] || 0).toLocaleString('pt-BR')})`));
            b.disabled = !ed.sel.size;
            // O modelo de onde a tela foi aberta fica marcado: com seis faixas
            // coloridas na barra, achar a sua é o primeiro trabalho do operador.
            if (ed.foco && String(m.id) === ed.foco) {
                b.style.outline = '2px solid ' + corDoModelo(m.id);
                b.style.outlineOffset = '1px';
            }
            b.onclick = () => atribuir(m.id);
            b2.appendChild(b);
        });

        const bNinguem = botao('— Sem modelo',
            ed.sel.size ? 'Tirar o dono das linhas selecionadas'
                        : 'Marque as linhas primeiro \u2014 clique nelas na tabela',
            () => atribuir(null));
        bNinguem.disabled = !ed.sel.size;
        b2.appendChild(bNinguem);
        bars.appendChild(b2);

        const b3 = document.createElement('div');
        b3.className = 'csv-ed-bar';
        const l3 = document.createElement('label');
        l3.className = 'grp';
        l3.textContent = 'Selecionar';
        b3.appendChild(l3);
        b3.appendChild(botao('Visíveis', 'Selecionar tudo que está na tela agora',
            () => selecionarView(true)));
        b3.appendChild(botao('Intervalo…',
            'Selecionar da linha N até a linha M pelo número da coluna #',
            selecionarIntervalo));
        b3.appendChild(botao('Limpar', 'Limpar a seleção', () => {
            ed.sel.clear(); pintarJanela(); renderCabecalho(); renderRodape(); renderBarras();
        }));
        b3.appendChild(botao('Sem modelo', 'Selecionar as linhas que ninguém pegou', () => {
            ed.sel.clear();
            for (const r of ed.rows) {
                if (linhaAtiva(r) && donoDaLinha(r) == null) ed.sel.add(Number(r[COL_ID]));
            }
            recalcular();
        }));

        b3.appendChild(document.createElement('div')).className = 'csv-ed-sep';
        const l3b = document.createElement('label');
        l3b.className = 'grp';
        l3b.textContent = 'Linha';
        b3.appendChild(l3b);
        const bCancel = botao('✕ Cancelar', 'A linha deixa de ser impressa por qualquer modelo',
            () => cancelarSelecao(true), 'perigo');
        bCancel.disabled = !ed.sel.size;
        const bVolta = botao('↺ Reativar', 'Devolver a linha à impressão',
            () => cancelarSelecao(false));
        bVolta.disabled = !ed.sel.size;
        b3.appendChild(bCancel);
        b3.appendChild(bVolta);

        if (ed.soSemModelo) {
            b3.appendChild(document.createElement('div')).className = 'csv-ed-sep';
            b3.appendChild(botao('✕ mostrando só as sem modelo',
                'Voltar a mostrar o banco inteiro', filtrarSemModelo));
        }
        bars.appendChild(b3);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Abrir / fechar
    // ══════════════════════════════════════════════════════════════════════

    function montarModal() {
        const ov = document.createElement('div');
        ov.id = 'csv-ed-overlay';
        const shell = document.createElement('div');
        shell.id = 'csv-ed-shell';
        ov.appendChild(shell);

        const top = document.createElement('div');
        top.className = 'csv-ed-top';
        const title = document.createElement('div');
        title.className = 'csv-ed-title';
        const sub = document.createElement('div');
        sub.className = 'csv-ed-sub';
        const x = document.createElement('button');
        x.className = 'csv-ed-x';
        x.textContent = '✕';
        x.title = 'Fechar sem aplicar (Esc)';
        top.appendChild(title);
        top.appendChild(sub);
        top.appendChild(x);
        shell.appendChild(top);

        const bars = document.createElement('div');
        bars.className = 'csv-ed-bars';
        shell.appendChild(bars);

        const scroll = document.createElement('div');
        scroll.className = 'csv-ed-scroll';
        scroll.tabIndex = 0;
        const inner = document.createElement('div');
        inner.className = 'csv-ed-inner';
        const head = document.createElement('div');
        head.className = 'csv-ed-head';
        const spacer = document.createElement('div');
        spacer.className = 'csv-ed-spacer';
        const edit = document.createElement('input');
        edit.className = 'csv-ed-edit';
        spacer.appendChild(edit);
        inner.appendChild(head);
        inner.appendChild(spacer);
        scroll.appendChild(inner);
        const vazio = document.createElement('div');
        vazio.className = 'csv-ed-vazio';
        vazio.textContent = 'Nenhuma linha para mostrar com a busca e o filtro atuais.';
        inner.appendChild(vazio);
        shell.appendChild(scroll);

        const foot = document.createElement('div');
        foot.className = 'csv-ed-foot';
        const info = document.createElement('div');
        info.className = 'info';
        const acoes = document.createElement('div');
        acoes.className = 'csv-ed-acoes';
        const bCancel = document.createElement('button');
        bCancel.className = 'csv-ed-b';
        bCancel.textContent = 'Cancelar';
        const bOk = document.createElement('button');
        bOk.className = 'csv-ed-b principal';
        bOk.textContent = '✓ Aplicar';
        acoes.appendChild(bCancel);
        acoes.appendChild(bOk);
        foot.appendChild(info);
        foot.appendChild(acoes);
        shell.appendChild(foot);

        document.body.appendChild(ov);
        dom = { ov, shell, title, sub, bars, scroll, inner, head, spacer, edit, vazio, info, bCancel, bOk, x };
        return dom;
    }

    function ligarEventos() {
        dom.scroll.addEventListener('scroll', () => pintarJanela());

        dom.edit.addEventListener('keydown', e => {
            // Tudo o que e digitado no input fica no input. Sem isto, o Enter
            // borbulha ate a grade, que o trata como "comecar a editar" e deixa
            // ed.editando preso em true — e dai todo atalho e engolido.
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); confirmarEdicao(); moverCursor(1, 0); }
            else if (e.key === 'Tab') { e.preventDefault(); confirmarEdicao(); moverCursor(0, e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelarEdicao(); }
        });
        dom.edit.addEventListener('blur', () => { if (ed.editando) confirmarEdicao(); });
        dom.edit.addEventListener('paste', e => {
            e.stopPropagation();   // senao a grade cola a mesma matriz de novo
            const texto = (e.clipboardData || window.clipboardData).getData('text');
            if (texto && (texto.includes('\t') || /\r?\n/.test(texto.trim()))) {
                e.preventDefault();
                cancelarEdicao();
                colarMatriz(parseColado(texto));
            }
        });

        dom.scroll.addEventListener('paste', e => {
            if (ed.editando || ehDistribuicao()) return;
            const texto = (e.clipboardData || window.clipboardData).getData('text');
            if (!texto) return;
            e.preventDefault();
            const matriz = parseColado(texto);
            // Numa tabela sem colunas nao existe "a partir do cursor": a primeira
            // linha colada vira o cabecalho, que e o que se espera ao montar um
            // banco do zero.
            if (!ed.headers.length) aplicarMatriz(matriz, true, 'substituir');
            else colarMatriz(matriz);
        });

        dom.scroll.addEventListener('keydown', e => {
            if (ed.editando) return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); desfazer(); }
                else if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); refazer(); }
                return;
            }
            switch (e.key) {
                case 'ArrowDown': e.preventDefault(); moverCursor(1, 0); break;
                case 'ArrowUp': e.preventDefault(); moverCursor(-1, 0); break;
                case 'ArrowRight': e.preventDefault(); moverCursor(0, 1); break;
                case 'ArrowLeft': e.preventDefault(); moverCursor(0, -1); break;
                case 'Enter': case 'F2':
                    e.preventDefault();
                    if (!ehDistribuicao()) iniciarEdicao();
                    break;
                case 'Delete': {
                    e.preventDefault();
                    if (ehDistribuicao()) break;
                    const { r, c } = ed.cursor;
                    if (ed.rows[r] && ed.headers[c] && ed.rows[r][ed.headers[c]] !== '') {
                        snapshot();
                        ed.rows[r][ed.headers[c]] = '';
                        recalcular();
                    }
                    break;
                }
                case ' ': {
                    e.preventDefault();
                    if (ehDistribuicao()) {
                        if (ed.rows[ed.cursor.r]) alternarSelecao(ed.cursor.r, true, false);
                    } else if (ed.rows[ed.cursor.r]) {
                        alternarAtiva(ed.cursor.r, !linhaAtiva(ed.rows[ed.cursor.r]));
                    }
                    break;
                }
                default:
                    if (ehDistribuicao()) break;
                    if (e.key.length === 1 && !e.altKey) { e.preventDefault(); iniciarEdicao(e.key); }
            }
        });

        dom.x.onclick = fechar;
        dom.bCancel.onclick = fechar;
        dom.bOk.onclick = aplicar;
        // O clique no rodapé borbulha até aqui, e a essa altura o Aplicar já
        // pode ter destruído o modal — daí o `dom &&`.
        dom.ov.onclick = e => { if (dom && e.target === dom.ov) fechar(); };
        document.addEventListener('keydown', onKeyGlobal, true);
    }

    function onKeyGlobal(e) {
        if (!ed || document.querySelector('#csv-ed-dlg, #csv-ed-cols')) return;
        if (e.key === 'Escape') { e.stopPropagation(); fechar(); }
    }

    async function fechar() {
        if (ed && ed.sujo) {
            const ok = await confirmar('Descartar as alterações?',
                'Você mexeu no banco de dados e ainda não aplicou. Fechar agora joga fora essas mudanças.',
                'Descartar');
            if (!ok) return;
        }
        destruir();
    }

    function destruir() {
        document.removeEventListener('keydown', onKeyGlobal, true);
        if (dom && dom.ov) dom.ov.remove();
        dom = null;
        ed = null;
    }

    function aplicar() {
        if (ed.editando) confirmarEdicao();
        const cb = ed.onAplicar;
        const carga = {
            headers: ed.headers.slice(),
            rows: ed.rows,
            filename: ed.filename,
            renomeacoes: ed.renomeacoes.filter(x => x.de !== x.para)
        };
        if (ehDistribuicao()) {
            // Uma entrada por modelo, sempre — inclusive vazia. Modelo que ficou
            // sem nenhuma linha precisa ter a fatia gravada como vazia, senao o
            // valor antigo continuaria valendo no banco.
            const dist = {};
            ed.modelos.forEach(m => { dist[m.id] = []; });
            for (const r of ed.rows) {
                const d = donoDaLinha(r);
                if (d != null && dist[d]) dist[d].push(Number(r[COL_ID]));
            }
            carga.distribuicao = {};
            Object.keys(dist).forEach(k => {
                carga.distribuicao[k] = { tipo: 'linhas', ids: comprimirIds(dist[k]) };
            });
        }
        destruir();
        if (typeof cb === 'function') cb(carga);
    }

    /**
     * Abre o modal. Ver o contrato no cabeçalho deste arquivo.
     */
    window.abrirEditorCsv = function (opts) {
        opts = opts || {};
        if (dom) return;                        // já aberto
        injetarCss();

        const headers = Array.isArray(opts.headers) ? opts.headers.filter(h => !colunaInterna(h)) : [];
        const rows = Array.isArray(opts.rows) ? opts.rows.map(r => Object.assign({}, r)) : [];

        // Um CSV salvo sem cabeçalho explícito ainda assim tem as chaves nas linhas.
        if (!headers.length && rows.length) {
            for (const k of Object.keys(rows[0])) if (!colunaInterna(k)) headers.push(k);
        }
        garantirIds(rows);

        ed = {
            headers, rows,
            filename: opts.filename || 'banco.csv',
            delim: opts.delimitador || ',',
            colunasEmUso: opts.colunasEmUso,
            onAplicar: opts.onAplicar,
            modelos: Array.isArray(opts.modelos) ? opts.modelos.slice() : null,
            // Modelo de onde a tela foi aberta. Só destaca — não restringe nada.
            foco: opts.foco != null ? String(opts.foco) : null,
            dono: new Map(),
            sel: new Set(),
            ultimoClique: null,
            soSemModelo: false,
            // Linhas apontadas por quem abriu a tela (hoje, o conferidor de
            // espaço do texto). Chegam como POSIÇÃO na lista e viram __id logo
            // abaixo: id sobrevive a ordenar, filtrar e desfazer; posição não.
            destacar: null,
            soDestacadas: false,
            renomeacoes: [],
            busca: '', filtroCol: '', filtroVal: '',
            ordemCol: null, ordemDir: 1,
            view: [], larguras: {},
            cursor: { r: rows.length ? 0 : -1, c: 0 },
            undo: [], redo: [], sujo: false,
            editando: false, arrastando: null
        };

        const dest = opts.destacar;
        if (dest && Array.isArray(dest.indices) && dest.indices.length) {
            const ids = new Set();
            dest.indices.forEach(i => {
                const r = ed.rows[i];
                if (r && r[COL_ID] != null) ids.add(Number(r[COL_ID]));
            });
            if (ids.size) {
                ed.destacar = { ids, motivo: String(dest.motivo || '') };
                ed.soDestacadas = true;   // abre já mostrando o problema
            }
        }

        // Cada modelo chega com a fatia que ja tinha salva; o mapa inverte isso
        // para "linha -> dono", que e como a tela pergunta.
        if (ehDistribuicao()) {
            ed.modelos.forEach(m => {
                const ids = (m.selecao && m.selecao.ids) ? expandirIds(m.selecao.ids) : [];
                ids.forEach(id => ed.dono.set(Number(id), m.id));
            });
        }

        montarModal();
        dom.title.textContent = (ehDistribuicao() ? '🧩 Distribuir ' : '📊 ') + ed.filename
            + (ed.foco && ehDistribuicao() ? '  —  aberto por ' + nomeDoModelo(ed.foco) : '');
        ligarEventos();
        recalcular();
        setTimeout(() => dom && dom.scroll.focus(), 30);
    };
})();
