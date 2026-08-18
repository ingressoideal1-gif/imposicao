/* ===========================================================================
   Visualização ampliada da amostra — a "janela combinada" em tela cheia
   ---------------------------------------------------------------------------
   Clicar na imagem de um modelo abre esta janela: a mesma arte combinada que o
   card mostra (cor + arte + numeração), grande, com frente e verso juntos e —
   quando a numeração usa banco de dados (CSV) — o seletor de páginas para
   folhear as linhas que ESTE modelo imprime.

   Esta janela NÃO redesenha nada. Ela espelha o que `drawAmostraFace()` já
   pintou no card, copiando o bitmap do canvas. É de propósito: o card é o
   renderizador canônico (ver docs/editor_de_arte.md) e uma segunda
   implementação divergiria dele no primeiro ajuste de fusão de camadas — o
   operador aprovaria numa tela o que sairia diferente no papel.

   Depende de `script.js` para o estado e para virar a página:
   `state`, `numeracaoIdDoItem()`, `linhasDaAmostra()`, `paginaDaAmostra()`,
   `amostraCsvPagina()` e `abrirCsvDoModelo()`.
   =========================================================================== */

(function () {
    'use strict';

    // Abaixo do editor de CSV (1000000) de propósito: dali se escolhem as
    // linhas, e o editor precisa cobrir esta janela quando abre por cima.
    const Z = 99000;

    let dom = null;
    let alvo = { idx: null, osId: null };
    let ampliado = false;      // fit na tela (falso) ou tamanho natural (verdadeiro)

    // ══════════════════════════════════════════════════════════════════════
    // Estado — sempre relido do state, nunca guardado
    // ══════════════════════════════════════════════════════════════════════

    function itemAtual() {
        if (alvo.idx == null) return null;
        const itens = (state && state.osItens) ? state.osItens[alvo.osId] : null;
        return itens ? itens[alvo.idx] : null;
    }

    function numAtual() {
        const item = itemAtual();
        if (!item) return null;
        const nid = item.numeracao_id || item.amostra_num_id || null;
        if (!nid) return null;
        return (state.numeracoes || []).find(n => String(n.id) === String(nid)) || null;
    }

    function containerDoCard() {
        return document.getElementById(state.amostrasContainerId || 'amostras-itens-container');
    }

    /**
     * As faces que o card tem desenhadas agora. Em modo PDF o canvas tradicional
     * fica escondido e quem vale é o do visualizador de PDF; no link do cliente
     * as faces são <img> em vez de <canvas>.
     */
    function facesDoCard() {
        const cont = containerDoCard();
        const item = itemAtual();
        if (!cont || !item) return [];
        const idx = alvo.idx;
        const faces = [];
        const juntar = (rotulo, cor, el) => {
            const src = fonteDe(el);
            if (src) faces.push({ rotulo, cor, src });
        };
        if (item.modo_pdf) {
            juntar('PDF', '#60a5fa', cont.querySelector('#amostra-pdf-canvas-' + idx));
        } else {
            juntar('FRENTE', '#60a5fa',
                cont.querySelector('#amostra-item-canvas-' + idx)
                || cont.querySelector('#amostra-item-img-' + idx));
            if (item.verso) {
                juntar('VERSO', '#fbbf24',
                    cont.querySelector('#amostra-item-canvas-verso-' + idx)
                    || cont.querySelector('#amostra-item-img-verso-' + idx));
            }
        }
        return faces;
    }

    function fonteDe(el) {
        if (!el) return null;
        if (el.tagName === 'CANVAS') {
            if (!el.width || !el.height) return null;
            try { return el.toDataURL('image/png'); } catch (e) { return null; }
        }
        const src = el.getAttribute('src');
        return src && src.length > 8 ? src : null;
    }

    function linhas() {
        const item = itemAtual();
        if (!item || typeof linhasDaAmostra !== 'function') return [];
        return linhasDaAmostra(item, numAtual()) || [];
    }

    /** A janela só pagina quando há de fato dado variável de CSV para folhear. */
    function paginavel() {
        const num = numAtual();
        const temElementoCsv = !!(num && (num.elements || []).some(el => el.source === 'database'));
        return temElementoCsv && linhas().length > 1;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Montagem
    // ══════════════════════════════════════════════════════════════════════

    function injetarCss() {
        if (document.getElementById('amostra-mod-css')) return;
        const st = document.createElement('style');
        st.id = 'amostra-mod-css';
        st.textContent = `
#amostra-mod-ov{position:fixed;inset:0;z-index:${Z};background:rgba(2,6,23,0.985);
  display:flex;flex-direction:column;font-family:inherit;color:#e2e8f0;}
#amostra-mod-ov .am-top{display:flex;align-items:center;gap:12px;padding:12px 18px;
  border-bottom:1px solid rgba(148,163,184,0.25);background:rgba(15,23,42,0.9);flex-shrink:0;}
#amostra-mod-ov .am-tit{font-weight:800;font-size:1.05rem;color:#ffd700;text-transform:uppercase;
  letter-spacing:0.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#amostra-mod-ov .am-sub{font-size:0.82rem;color:#94a3b8;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
#amostra-mod-ov .am-b{background:rgba(148,163,184,0.14);border:1px solid rgba(148,163,184,0.3);
  color:#e2e8f0;border-radius:8px;padding:6px 12px;font-size:0.85rem;font-weight:700;
  cursor:pointer;white-space:nowrap;}
#amostra-mod-ov .am-b:hover:not(:disabled){background:rgba(148,163,184,0.28);}
#amostra-mod-ov .am-b:disabled{opacity:0.35;cursor:default;}
#amostra-mod-ov .am-b.fechar{background:rgba(239,68,68,0.2);border-color:rgba(239,68,68,0.5);}
#amostra-mod-ov .am-corpo{flex:1;overflow:auto;display:flex;flex-wrap:wrap;gap:24px;
  align-items:center;justify-content:center;padding:22px;}
/* Centralizacao "segura": quando a arte e maior que o espaco (Tamanho real),
   centralizar corta a borda de cima/da esquerda e a rolagem nao alcanca o que
   ficou de fora. Com "safe", nesse caso o alinhamento cai para o inicio e a
   imagem inteira volta a ser acessivel. Navegador antigo ignora estas duas
   linhas e fica com a centralizacao acima — nada quebra. */
#amostra-mod-ov .am-corpo{align-items:safe center;justify-content:safe center;}
#amostra-mod-ov .am-face{display:flex;flex-direction:column;align-items:center;gap:8px;}
#amostra-mod-ov .am-face .rot{font-size:0.8rem;font-weight:800;letter-spacing:0.06em;}
/* Janela limpa: nenhum fio de contorno, nenhum canto arredondado. O antigo
   "border:1px" desenhava uma moldura por cima da beirada da arte (com
   box-sizing:border-box ele ainda comia 2px do conteudo ao caber na tela), e
   era isso que parecia cortar a imagem. A sombra continua, mas cai FORA da
   imagem e nao encosta em pixel nenhum do desenho. */
#amostra-mod-ov .am-face img{display:block;background:#fff;border:0;border-radius:0;
  outline:none;box-shadow:0 10px 30px rgba(0,0,0,0.55);cursor:zoom-in;}
#amostra-mod-ov.ampliado .am-corpo{align-items:flex-start;}
#amostra-mod-ov.ampliado .am-face img{cursor:zoom-out;}
#amostra-mod-ov .am-vazio{color:#94a3b8;text-align:center;font-size:0.95rem;line-height:1.7;}
#amostra-mod-ov .am-pe{display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:12px 18px;border-top:1px solid rgba(148,163,184,0.25);
  background:rgba(15,23,42,0.9);flex-shrink:0;}
#amostra-mod-ov .am-pe .linha{display:flex;align-items:center;gap:10px;}
#amostra-mod-ov .am-pe input{width:84px;text-align:center;background:rgba(2,6,23,0.85);
  border:1px solid rgba(148,163,184,0.35);border-radius:6px;color:#e2e8f0;padding:5px 6px;
  font-size:0.88rem;}
#amostra-mod-ov .am-info{font-weight:800;font-size:0.95rem;min-width:130px;text-align:center;}
#amostra-mod-ov .am-resumo{font-size:0.82rem;color:#94a3b8;text-align:center;}
`;
        document.head.appendChild(st);
    }

    function montar() {
        injetarCss();
        const ov = document.createElement('div');
        ov.id = 'amostra-mod-ov';
        ov.innerHTML = `
<div class="am-top">
  <div style="min-width:0;flex:1;">
    <div class="am-tit" id="am-tit">Modelo</div>
    <div class="am-sub" id="am-sub"></div>
  </div>
  <button class="am-b" id="am-csv-edit" title="Ver e editar o banco de dados (CSV) desta numeração">📊 Banco</button>
  <button class="am-b" id="am-csv-fatia" title="Escolher as linhas do banco que este modelo imprime">🧩 Linhas do modelo</button>
  <button class="am-b" id="am-zoom" title="Alternar entre caber na tela e o tamanho natural">🔍 Tamanho real</button>
  <button class="am-b fechar" id="am-fechar" title="Fechar (Esc)">✕ Fechar</button>
</div>
<div class="am-corpo" id="am-corpo"></div>
<div class="am-pe" id="am-pe" style="display:none;">
  <div class="linha">
    <button class="am-b" id="am-prev" title="Linha anterior (←)">◀</button>
    <span class="am-info" id="am-info">Linha 1 / 1</span>
    <input type="number" id="am-goto" min="1" value="1" title="Ir para a linha">
    <button class="am-b" id="am-next" title="Próxima linha (→)">▶</button>
  </div>
  <div class="am-resumo" id="am-resumo"></div>
</div>`;
        document.body.appendChild(ov);

        dom = {
            ov,
            tit: ov.querySelector('#am-tit'),
            sub: ov.querySelector('#am-sub'),
            corpo: ov.querySelector('#am-corpo'),
            pe: ov.querySelector('#am-pe'),
            info: ov.querySelector('#am-info'),
            resumo: ov.querySelector('#am-resumo'),
            goto: ov.querySelector('#am-goto'),
            prev: ov.querySelector('#am-prev'),
            next: ov.querySelector('#am-next'),
            zoom: ov.querySelector('#am-zoom'),
            bEdit: ov.querySelector('#am-csv-edit'),
            bFatia: ov.querySelector('#am-csv-fatia')
        };

        dom.ov.onclick = e => { if (dom && e.target === dom.ov) fechar(); };
        dom.corpo.onclick = e => { if (dom && e.target === dom.corpo) fechar(); };
        ov.querySelector('#am-fechar').onclick = fechar;
        dom.prev.onclick = () => andar(-1);
        dom.next.onclick = () => andar(1);
        dom.goto.onchange = () => irPara(parseInt(dom.goto.value));
        dom.zoom.onclick = alternarZoom;
        dom.bEdit.onclick = () => window.abrirCsvDoModelo(alvo.idx, alvo.osId, 'editar');
        dom.bFatia.onclick = () => window.abrirCsvDoModelo(alvo.idx, alvo.osId, 'distribuir');
        document.addEventListener('keydown', aoTeclar, true);
    }

    function aoTeclar(e) {
        if (!dom) return;
        // Com o editor de CSV aberto por cima, as teclas são dele.
        if (document.getElementById('csv-ed-overlay')) return;
        if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
        if (!paginavel()) return;
        if (e.target && e.target.tagName === 'INPUT') return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); andar(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); andar(1); }
        else if (e.key === 'Home') { e.preventDefault(); irPara(1); }
        else if (e.key === 'End') { e.preventDefault(); irPara(linhas().length); }
    }

    function alternarZoom() {
        ampliado = !ampliado;
        dom.ov.classList.toggle('ampliado', ampliado);
        dom.zoom.textContent = ampliado ? '🔍 Caber na tela' : '🔍 Tamanho real';
        desenharFaces();
    }

    // ══════════════════════════════════════════════════════════════════════
    // Navegação — quem vira a página é o card; esta janela só o espelha
    // ══════════════════════════════════════════════════════════════════════

    function andar(delta) {
        if (!paginavel()) return;
        Promise.resolve(window.amostraCsvPagina(alvo.idx, alvo.osId, delta)).then(atualizar);
    }

    function irPara(n) {
        if (!paginavel() || isNaN(n)) return;
        Promise.resolve(window.amostraCsvPagina(alvo.idx, alvo.osId, 0, n)).then(atualizar);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Pintura
    // ══════════════════════════════════════════════════════════════════════

    function desenharFaces() {
        const faces = facesDoCard();
        dom.corpo.innerHTML = '';
        if (!faces.length) {
            const v = document.createElement('div');
            v.className = 'am-vazio';
            v.innerHTML = '🎨<br>Nada desenhado ainda neste modelo.<br>'
                + '<span style="font-size:0.85rem;opacity:0.8;">'
                + 'Escolha cor e numeração e carregue a arte.</span>';
            dom.corpo.appendChild(v);
            return;
        }
        const alturaLivre = faces.length > 1 ? '46vh' : '78vh';
        const larguraLivre = faces.length > 1 ? '46vw' : '92vw';
        faces.forEach(f => {
            const box = document.createElement('div');
            box.className = 'am-face';
            const rot = document.createElement('div');
            rot.className = 'rot';
            rot.textContent = f.rotulo;
            rot.style.color = f.cor;
            const img = document.createElement('img');
            img.src = f.src;
            if (ampliado) {
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            } else {
                img.style.maxWidth = larguraLivre;
                img.style.maxHeight = alturaLivre;
                img.style.objectFit = 'contain';
            }
            img.onclick = alternarZoom;
            box.appendChild(rot);
            box.appendChild(img);
            dom.corpo.appendChild(box);
        });
    }

    function desenharCabecalho() {
        const item = itemAtual();
        const num = numAtual();
        dom.tit.textContent = (item && (item.nome_modelo || item.produto))
            || ('Modelo ' + (alvo.idx + 1));
        const partes = [];
        if (num && num.name) partes.push('Numeração: ' + num.name);
        if (num && num.csv_data && num.csv_data.length) {
            partes.push((num.csv_filename || 'banco.csv')
                + ' — ' + linhas().length.toLocaleString('pt-BR') + ' linha(s) neste modelo');
        }
        dom.sub.textContent = partes.join('  ·  ');

        const temCsv = !!(num && num.csv_data && num.csv_data.length);
        dom.bEdit.style.display = temCsv ? '' : 'none';
        dom.bFatia.style.display = temCsv ? '' : 'none';
    }

    function desenharRodape() {
        if (!paginavel()) { dom.pe.style.display = 'none'; return; }
        dom.pe.style.display = 'flex';
        const item = itemAtual();
        const num = numAtual();
        const ls = linhas();
        const total = ls.length;
        const pag = (typeof paginaDaAmostra === 'function')
            ? paginaDaAmostra(item, total, alvo.osId) : 0;
        const linha = ls[pag] || {};
        dom.info.textContent = 'Linha ' + (pag + 1) + ' / ' + total;
        if (document.activeElement !== dom.goto) {
            dom.goto.value = pag + 1;
            dom.goto.max = total;
        }
        dom.prev.disabled = pag <= 0;
        dom.next.disabled = pag >= total - 1;
        const cols = (num && num.csv_headers && num.csv_headers.length)
            ? num.csv_headers
            : Object.keys(linha).filter(k => k !== '__ativo' && k !== '__id');
        dom.resumo.textContent = cols.slice(0, 6)
            .map(c => c + ': ' + (linha[c] == null ? '' : linha[c]))
            .join('  ·  ');
    }

    function atualizar() {
        if (!dom) return;
        if (!itemAtual() || !containerDoCard()) { fechar(); return; }
        desenharCabecalho();
        desenharFaces();
        desenharRodape();
    }

    function fechar() {
        document.removeEventListener('keydown', aoTeclar, true);
        if (dom && dom.ov) dom.ov.remove();
        dom = null;
        alvo = { idx: null, osId: null };
        ampliado = false;
    }

    // ══════════════════════════════════════════════════════════════════════
    // API
    // ══════════════════════════════════════════════════════════════════════

    window.abrirAmostraModal = function (idx, osId) {
        if (dom) fechar();
        alvo = { idx: idx, osId: osId };
        if (!itemAtual()) { alvo = { idx: null, osId: null }; return; }
        montar();
        atualizar();
    };

    window.AmostraModal = {
        /** Chamado pelo card a cada redesenho, para a janela não ficar velha. */
        atualizar: function (idx, osId) {
            if (!dom) return;
            if (String(idx) !== String(alvo.idx) || String(osId) !== String(alvo.osId)) return;
            atualizar();
        },
        fechar: fechar,
        aberto: function () { return !!dom; }
    };
})();
