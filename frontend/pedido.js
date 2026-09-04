// PEDIDO.JS - GERADO AUTOMATICAMENTE POR CLONAGEM DE SCRIPT.JS

/**
 * Rede de segurança para a janela de sincronização do painel.
 *
 * O `arte-de-impressao.js` é um arquivo NOVO. A estação baixa o painel usando a
 * lista `PAINEL_ARQUIVOS` que está **embutida no agente instalado** — e um
 * agente anterior à 1.2.64 não conhece esse nome. Ele já sincroniza o
 * `index.html` e o `producao.html` novos, que referenciam o script, mas não
 * busca o script. Nessa janela o arquivo dá 404 e `arteDeImpressao` fica
 * indefinida.
 *
 * Sem esta guarda, a montagem do trabalho lançaria `ReferenceError` e a
 * imposição pararia por completo naquela estação — trocaríamos um defeito de
 * arte por uma parada de produção.
 *
 * A regra é repetida aqui de propósito, e é uma linha: melhor duplicar um
 * `indexOf` do que deixar a estação sem imposição, ou deixá-la voltar a
 * imprimir a amostra de aprovação.
 */
function arteParaImpor(url) {
    if (typeof arteDeImpressao === 'function') return arteDeImpressao(url);
    return (url && String(url).indexOf('amostras_renderizadas') === -1) ? url : null;
}

/**
 * O Modo de Impressão, repetido aqui pelo mesmo motivo do `arteParaImpor`.
 *
 * O `script.js` define estes três e a `index.html` o carrega antes deste
 * arquivo — mas a `cliente.html` e a `controle.html` carregam o `pedido.js`
 * SEM o `script.js`. Um `temVerso` indefinido ali não daria erro visível: daria
 * uma folha sem verso, descoberta no papel. Melhor duplicar três linhas.
 *
 * São três valores desde 31/08/2026: 'front', 'duplex' (FxVerso) e
 * 'duplex_unico' (FxVersoUnico). `temVerso` responde "tem verso?" — verdadeiro
 * nos dois modos duplex. `versoUnico` responde "como pagina?" — só o
 * FxVersoUnico anda a frente de 1 em 1 e repete uma página só no verso.
 */
function temVerso(printMode) {
    const m = String(printMode || 'front').trim().toLowerCase();
    return m === 'duplex' || m === 'duplex_unico';
}
window.temVerso = temVerso;

function versoUnico(printMode) {
    return String(printMode || 'front').trim().toLowerCase() === 'duplex_unico';
}
window.versoUnico = versoUnico;

/**
 * Qual dos três Modos de Impressão vale para um modelo do pedido.
 *
 * O nome diz VERSO e não IMPRESSÃO porque `modoDeImpressaoDoModelo` já existe
 * no script.js desde antes, e responde outra coisa: sequencial ou blocado.
 *
 * O FxVersoUnico vive só na numeração (`producao_numeracoes.print_mode`, tabela
 * nossa): a coluna `verso_tipo` é do ERP parceiro e não conhece esse texto. Por
 * isso a numeração só é consultada para ACRESCENTAR o terceiro modo — fora dele
 * a regra continua a de antes, o `verso` do item.
 */
function modoDeVersoDoModelo(item) {
    const nid = (typeof numeracaoIdDoItem === 'function') ? numeracaoIdDoItem(item) : null;
    const num = nid ? (state.numeracoes || []).find(n => String(n.id) === String(nid)) : null;
    if (versoUnico(num && num.print_mode)) return 'duplex_unico';
    const temVersoNoErp = !!(item && (item.verso === true || (item.verso_tipo && item.verso_tipo !== 'Frente')));
    return temVersoNoErp ? 'duplex' : 'front';
}
window.modoDeVersoDoModelo = modoDeVersoDoModelo;

function applyPedFormatoDefaults() {
    const fmtSel = document.getElementById('ped-formato');
    if (!fmtSel) return;
    
    const selectedFmtId = fmtSel.value;
    if (!selectedFmtId) return;
    
    const fmt = state.formatos.find(f => String(f.id) === String(selectedFmtId));
    if (!fmt) return;
    
    // Aplica a Regra de Paginação se houver
    if (fmt.default_schema) {
        const schemaSel = document.getElementById('ped-schema');
        if (schemaSel) {
            schemaSel.value = fmt.default_schema;
            schemaSel.dispatchEvent(new Event('change'));
        }
    }
    
    // Aplica a Saída se houver
    if (fmt.default_saida_id) {
        const saidaSel = document.getElementById('ped-saida');
        if (saidaSel) {
            // Verifica se a opção existe
            if (Array.from(saidaSel.options).some(opt => String(opt.value) === String(fmt.default_saida_id))) {
                saidaSel.value = fmt.default_saida_id;
            }
        }
    }
    
    // Cut & Stack mode
    if (fmt.default_cut_stack_mode) {
        const modeSel = document.getElementById('ped-cutstack-mode');
        if (modeSel) modeSel.value = fmt.default_cut_stack_mode;
    }
    
    // Sheets per block
    if (fmt.default_sheets_per_block) {
        const sheetsInp = document.getElementById('ped-sheets-per-block');
        if (sheetsInp) sheetsInp.value = fmt.default_sheets_per_block;
    }
    
    // Block depth
    if (fmt.default_block_depth) {
        const depthInp = document.getElementById('ped-block-depth');
        if (depthInp) depthInp.value = fmt.default_block_depth;
    }
    
    // Rotate — a regra mora em `rotacaoDaFolhaDoFormato` (script.js), que a
    // Montagem tambem le: e' o que impede a folha refeita de sair sem a
    // rotacao que o formato pede.
    let rotVal = rotacaoDaFolhaDoFormato(fmt);
    const rotateCb = document.getElementById('ped-rotate-page');
    if (rotateCb) {
        rotateCb.value = String(rotVal);
        state.rotatePage = rotVal;
    }

    // A bandeja dupla (capa/miolo) depende do MESMO `has_cover` deste
    // formato — ver `atualizarBandejaCapaMiolo` (script.js). Trocar o
    // formato sem trocar de impressora não reavaliava isso antes; e é esta
    // chamada, disparada pelo `dispatchEvent('change')` que o
    // `enviarParaImposicao` dá em `#ped-formato`, quem corrige a corrida com
    // `initPedPrintPanel()` descrita lá.
    atualizarBandejaCapaMiolo();
}
window.applyPedFormatoDefaults = applyPedFormatoDefaults;

function populatePedNumeracoes() {
    const fmtSel = document.getElementById('ped-formato');
    if (!fmtSel) return;

    const selectedFmtId = fmtSel.value;

    const activeOSItem = state.activeOSItem;
    let currentClientId = null;
    let currentItemId = null;
    if (activeOSItem) {
        currentItemId = activeOSItem.itemId;
        const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
        if (os) {
            currentClientId = os.id_cliente;
        }
    }

    // Filtra numerações cujo formato_ids inclui o formato selecionado e respeita o Cli_Num
    let filteredNums = state.numeracoes.filter(n => {
        // Filtro de customizada por cliente / item
        if (n.is_custom) {
            if (n.Cli_Num) {
                if (String(n.Cli_Num) !== String(currentClientId)) return false;
            } else {
                if (String(n.os_item_id) !== String(currentItemId)) return false;
            }
        } else {
            // Se tiver Cli_Num, restringe ao cliente atual
            if (n.Cli_Num && String(n.Cli_Num) !== String(currentClientId)) return false;
        }

        if (selectedFmtId) {
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(selectedFmtId));
        }
        return true;
    });
    filteredNums.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

    // Popula Numeração 1 e Numeração 2
    ['ped-numeracao', 'ped-numeracao-2'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;

        sel.innerHTML = '<option value="">-- Sem numeração --</option>' +
            filteredNums.map(n => {
                const nFmt = state.formatos.find(f => String(f.id) === String(n.formato_id));
                const label = nFmt ? ` (${nFmt.name})` : '';
                return `<option value="${n.id}">${n.name}${label}</option>`;
            }).join('');

        // Restaurar seleção anterior se ainda existir na lista filtrada
        if (cur && filteredNums.some(n => String(n.id) === String(cur))) {
            sel.value = cur;
        } else {
            sel.value = '';
        }
    });

    if (typeof window.togglePedNumEditButtons === 'function') window.togglePedNumEditButtons();
}
window.populatePedNumeracoes = populatePedNumeracoes;

/** Teto de páginas rasterizadas guardadas por documento na prévia. */
const MAX_PAGINAS_EM_CACHE = 60;

/**
 * Descarta as páginas rasterizadas mais antigas quando o cache passa do teto.
 *
 * Em Pdf Paginado cada pose da folha usa uma página diferente, então uma folha de N
 * poses rasteriza N páginas. Sem teto, um PDF de centenas de páginas acumula centenas
 * de canvases em memória à medida que o operador navega pelas folhas.
 *
 * O teto é folgado sobre o maior número de poses por folha que o sistema produz, então
 * a folha visível nunca é despejada — a página descartada é sempre de uma folha que
 * saiu da tela, e rasterizar de novo custa uma passada do pdf.js.
 */
function limitarCachePaginas(pdfDoc) {
    const cache = pdfDoc && pdfDoc.pagesCache;
    if (!cache) return;
    const chaves = Object.keys(cache);
    if (chaves.length <= MAX_PAGINAS_EM_CACHE) return;
    // Object.keys preserva a ordem de inserção para chaves não numéricas ("page_12"),
    // então as primeiras são as mais antigas.
    for (const chave of chaves.slice(0, chaves.length - MAX_PAGINAS_EM_CACHE)) {
        delete cache[chave];
    }
}

/**
 * Mostra, acima da prévia, quando a quantidade que será impressa não bate com a
 * quantidade pedida na OS.
 *
 * Em Pdf Paginado quem manda na quantidade é o ARQUIVO: o engine faz
 * `total_items = nº de páginas` (metade em duplex) e ignora a quantidade do pedido.
 * Isso é intencional — reimpressão parcial é caso legítimo —, mas era silencioso.
 * O aviso não bloqueia; só torna a conta visível antes de gastar papel.
 *
 * O elemento é criado sob demanda para valer no index.html e no producao.html sem
 * duplicar marcação.
 */
function atualizarAvisoPaginacao(schema, totalItens) {
    const canvas = document.getElementById('ped-preview-canvas');
    if (!canvas) return;

    let aviso = document.getElementById('ped-preview-aviso-qtd');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'ped-preview-aviso-qtd';
        aviso.style.cssText = 'display:none; width:100%; box-sizing:border-box; margin-bottom:8px;'
            + ' padding:8px 12px; border-radius:var(--radius); font-size:0.82rem; font-weight:600;'
            + ' background:rgba(245,158,11,0.12); border:1px solid var(--amber); color:var(--amber);';
        canvas.insertAdjacentElement('beforebegin', aviso);
    }

    const item = state.activeOSItem
        ? (state.osItens[state.activeOSItem.osId] || []).find(i => String(i.id) === String(state.activeOSItem.itemId))
        : null;
    const qtdPedida = item ? parseInt(item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0)) || 0 : 0;

    if (schema !== 'pdf_multiple' || !qtdPedida || !totalItens || qtdPedida === totalItens) {
        aviso.style.display = 'none';
        return;
    }

    const paginas = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : totalItens;
    aviso.textContent = `⚠️ O PDF tem ${paginas} página(s) e o pedido pede ${qtdPedida}. `
        + `Vai imprimir ${totalItens}.`;
    aviso.style.display = 'block';
}
window.atualizarAvisoPaginacao = atualizarAvisoPaginacao;

/**
 * Trava a Regra de Paginação em "Pdf Paginado" enquanto o modelo estiver em modo PDF.
 *
 * Um modelo em modo PDF tem, como arte, um arquivo de várias páginas em que cada página
 * é um ingresso diferente. Só a regra Pdf Paginado consome uma página por pose; em
 * qualquer outra o engine repete a página 1 em toda a folha, e o operador só descobre no
 * papel. Por isso a regra é imposta, e o campo trava com o motivo à vista.
 *
 * Para sair, desliga-se o modo PDF na tela de arte, que é onde essa decisão pertence.
 *
 * O aviso é criado sob demanda ao lado do campo, para valer no index.html e no
 * producao.html sem precisar manter a mesma marcação nos dois.
 */
function aplicarTravaModoPdf(ativo) {
    const sel = document.getElementById('ped-schema');
    if (!sel) return;

    let nota = document.getElementById('ped-schema-lock-note');
    if (!nota) {
        nota = document.createElement('span');
        nota.id = 'ped-schema-lock-note';
        nota.style.cssText = 'font-size: 0.78rem; color: var(--amber); font-weight: 600; display: none;';
        nota.textContent = '🔒 Modo PDF: cada página do arquivo é um ingresso';
        nota.title = 'Para mudar a regra, desligue o Modo PDF na tela de arte do modelo.';
        sel.insertAdjacentElement('afterend', nota);
    }

    if (ativo && sel.value !== 'pdf_multiple') {
        sel.value = 'pdf_multiple';
        sel.dispatchEvent(new Event('change'));
    }
    sel.disabled = !!ativo;
    nota.style.display = ativo ? 'inline' : 'none';
}
window.aplicarTravaModoPdf = aplicarTravaModoPdf;

/**
 * Guarda o PDF do VERSO da prévia e, junto, o tamanho da página dele.
 *
 * O tamanho mora ao lado do documento porque a prévia precisa dele ANTES de
 * escolher a página: é ele que decide o retângulo da arte dentro da célula.
 *
 * Frente e verso podem ser arquivos de tamanhos diferentes — no modelo 1000740
 * do pedido 21408 a frente tem 110,70 mm de largura e o verso 104,35 — e o
 * motor lê o rect de CADA um (`base_w_verso` no engine.py). Sem guardar esta
 * medida, o verso saía desenhado com a da frente.
 *
 * Chamar com `null` limpa os dois, e limpa de forma síncrona: as três primeiras
 * linhas rodam antes de qualquer `await`, então quem só quer zerar não precisa
 * esperar a promessa.
 */
async function guardarPdfDoVersoDaPrevia(pdfV) {
    state.pedArtVersoPdfDoc = pdfV || null;
    state.pedArtVersoWidth = 0;
    state.pedArtVersoHeight = 0;
    if (!pdfV) return;
    try {
        const vp = (await pdfV.getPage(1)).getViewport({ scale: 1 });
        state.pedArtVersoWidth = vp.width;    // em pt
        state.pedArtVersoHeight = vp.height;  // em pt
    } catch (e) {
        console.warn('[Previa] Nao consegui medir a pagina do verso:', e);
    }
}
window.guardarPdfDoVersoDaPrevia = guardarPdfDoVersoDaPrevia;

/**
 * Mede a página de uma arte da folha COMBINADA e guarda o tamanho pela URL.
 *
 * Somar modelos numa folha só é o único caminho em que a prévia não passa pelo
 * `loadPedArtFile` — cada arte é baixada aqui mesmo, pela URL, e nunca ninguém
 * anotou de que tamanho ela era. Sem esta medida, `art_orig_w` caía no
 * `item_w` de reserva e toda arte da folha combinada era desenhada do tamanho
 * da célula, enquanto o motor a cola no tamanho do arquivo (`base_w`).
 *
 * A medida é a da PÁGINA 1. Nos arquivos desta gráfica todas as páginas de um
 * mesmo PDF têm o mesmo tamanho — conferido nos cinco arquivos do pedido 21408
 * —, e o motor lê o rect de cada página. Um arquivo com páginas de tamanhos
 * diferentes sairia certo no papel e aproximado nesta janela.
 *
 * Guardado por URL, e não no objeto da arte: a lista de artes é remontada a
 * cada desenho da prévia, e o que morasse nela se perderia junto.
 */
async function medirArteDaFolhaCombinada(url, doc) {
    if (!url || !doc) return;
    if (!state.multiArtesPdfTamanho) state.multiArtesPdfTamanho = {};
    if (state.multiArtesPdfTamanho[url]) return;
    try {
        const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
        state.multiArtesPdfTamanho[url] = { w: vp.width, h: vp.height };   // em pt
    } catch (e) {
        console.warn('[Previa] Nao consegui medir a arte da folha combinada:', e);
    }
}
window.medirArteDaFolhaCombinada = medirArteDaFolhaCombinada;

async function loadPedArtFile(file) {
    state.pedArtFile = file;

    const ext = file.name.split('.').pop().toLowerCase();

    try {

        if (ext === 'pdf') {

            if (typeof pdfjsLib === 'undefined') {

                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');

            }

            pdfjsLib.GlobalWorkerOptions.workerSrc =

                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            

            // Salvar documento PDF e inicializar caches para paginação especial de Pdf Múltiplo

            state.pedArtPdfDoc = pdf;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



            const page = await pdf.getPage(1);

            const vp = page.getViewport({ scale: 1 });



            const scale = 2; // Renderizar em maior resolução para melhor qualidade de preview

            const off = document.createElement('canvas');

            const octx = off.getContext('2d');

            off.width = vp.width * scale;

            off.height = vp.height * scale;

            octx.fillStyle = '#ffffff';

            octx.fillRect(0, 0, off.width, off.height);

            await page.render({ canvasContext: octx, viewport: page.getViewport({ scale }) }).promise;



            state.pedArtImage = off;

            state.pedArtWidth = vp.width; // em pt

            state.pedArtHeight = vp.height; // em pt

            

            // Se estiver em Pdf Múltiplo, atualiza limites

            const schema = document.getElementById('ped-schema').value;

            if (schema === "pdf_multiple") {

                const impStart = document.getElementById('ped-start');

                const impEnd = document.getElementById('ped-end');

                if (impStart) {

                    impStart.value = 1;

                    impStart.setAttribute('disabled', 'true');

                }

                if (impEnd) {

                    impEnd.value = pdf.numPages;

                    impEnd.setAttribute('disabled', 'true');

                }

            }

        } else {

            // Se for imagem normal, limpa referências de PDF

            state.pedArtPdfDoc = null;

            state.pedArtPagesCache = {};

            state.pedArtPagesRendering = {};



            const img = new Image();

            img.src = URL.createObjectURL(file);

            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

            

            // Obter o DPI da imagem a partir dos metadados

            const dpi = await getDpi(file);

            

            state.pedArtImage = img;

            // Converter pixels para pontos PDF (1pt = 1/72 polegada, logo: px / DPI * 72)

            state.pedArtWidth = img.width * (72 / dpi);

            state.pedArtHeight = img.height * (72 / dpi);

        }

        updatePedSummary(); // Recalcular sumário e forçar redesenho do preview

    } catch (e) {

        toast('Erro ao carregar arte: ' + e.message, 'error');

        state.pedArtImage = null;

        state.pedArtPdfDoc = null;

        state.pedArtPagesCache = {};

        state.pedArtPagesRendering = {};

        updatePedSummary();

    }

}
window.loadPedArtFile = loadPedArtFile;

/**
 * Redesenha a janela de visualizacao UMA vez por rajada.
 *
 * Gemea do `agendarRedesenhoDasFilas` no script.js, pela mesma razao e com o
 * mesmo desenho de duas pontas. Medido na tela, no pedido 21202, um clique num
 * modelo chamava o `drawPedPreview` 8 a 9 vezes -- sete delas saindo do
 * `updatePedSummary`, que por sua vez e disparado por cada `change` dos selects
 * que a abertura do modelo preenche.
 *
 * Cada desenho custa ~33 ms (a janela mostra UMA folha, a atual -- nao as N do
 * modelo), entao aqui a economia e modesta. O que ela evita, alem dos ~56 ms, e
 * a folha piscando sete vezes no caminho ate a configuracao final.
 *
 * As duas pontas importam. O COMECO da rajada desenha na hora porque sair do
 * `updatePedSummary` sem desenhar deixaria na tela a folha do desenho ANTERIOR
 * -- e o operador conferiria uma folha que nao corresponde mais ao que esta
 * configurado, que e o perigo anotado dentro do proprio `drawPedPreview`. O FIM
 * desenha uma vez depois que a tela assentou.
 */
const _JANELA_DA_PREVIA_MS = 900;
let _previaDesenhaAgora = false;
let _previaNoFimDaRajada = null;

function agendarRedesenhoDaPrevia() {
    if (typeof drawPedPreview !== 'function') return;
    if (!_previaDesenhaAgora) {
        _previaDesenhaAgora = true;
        setTimeout(() => { _previaDesenhaAgora = false; }, _JANELA_DA_PREVIA_MS);
        drawPedPreview();
    }
    if (_previaNoFimDaRajada) clearTimeout(_previaNoFimDaRajada);
    _previaNoFimDaRajada = setTimeout(() => {
        _previaNoFimDaRajada = null;
        drawPedPreview();
    }, _JANELA_DA_PREVIA_MS);
}
window.agendarRedesenhoDaPrevia = agendarRedesenhoDaPrevia;

function drawPedPreview() {

    // Chegou a vez de desenhar: o recado de "montando a previa" sai daqui, e
    // nao no fim, porque todos os caminhos desta funcao — inclusive os de erro
    // — escrevem no proprio canvas. Ver limparPreviaEnquantoCarrega().
    if (typeof previaFicouPronta === 'function') previaFicouPronta();

    let fmtId, numId, saiId, start, end, schema = 'sequential', item_local_index, item_arte_index;
    const activeItem = state.activeOSItem;
    
    // Auto-preencher 'Folhas p/ Bloco' se disponivel na OS, para manter o Preview consistente
    if (state.selectedOSItems && state.selectedOSItems.length > 0) {
        const firstWithBloco = state.selectedOSItems.find(sel => {
            const sItem = state.osItens[sel.osId]?.find(i => String(i.id) === String(sel.itemId));
            return sItem && ((sItem.bloco && parseInt(sItem.bloco) > 0) || (sItem.blocos && sItem.blocos !== 'N'));
        });
        if (firstWithBloco) {
            const blocItem = state.osItens[firstWithBloco.osId]?.find(i => String(i.id) === String(firstWithBloco.itemId));
            const sheetsInp = document.getElementById('ped-sheets-per-block');
            if (sheetsInp && blocItem?.bloco) sheetsInp.value = parseInt(blocItem.bloco);
        }
    } else if (activeItem) {
        const sItem = state.osItens[activeItem.osId]?.find(i => String(i.id) === String(activeItem.itemId));
        if (sItem && sItem.bloco) {
            const sheetsInp = document.getElementById('ped-sheets-per-block');
            if (sheetsInp) sheetsInp.value = parseInt(sItem.bloco);
        }
    }
    if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            fmtId = item.formato_id;
            numId = item.numeracao_id;
            saiId = item.saida_id;
            if (!saiId && fmtId) {
                const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
                if (fmtObj) saiId = fmtObj.default_saida_id;
            }
            start = item.num_inicial !== undefined && item.num_inicial !== null ? parseInt(item.num_inicial) : (parseInt(item.numeracao_inicio) || 1);
            end = item.num_final !== undefined && item.num_final !== null ? parseInt(item.num_final) : (parseInt(item.numeracao_fim) || 100);
            const fmtObj = state.formatos.find(f => String(f.id) === String(fmtId));
            // A regra de paginação sai do campo "Regra de Paginação", não do formato:
            // é o campo que runPedImposition() manda no payload, e portanto é ele que
            // decide o que sai no papel. Ler o formato aqui fazia a prévia desenhar uma
            // regra e a impressão usar outra. O formato só entra como recuo.
            schema = document.getElementById('ped-schema')?.value
                || (fmtObj ? fmtObj.default_schema : 'sequential');
        }
    } else {
        fmtId = document.getElementById('ped-formato')?.value;
        numId = document.getElementById('ped-numeracao')?.value;
        saiId = document.getElementById('ped-saida')?.value;
        start = parseInt(document.getElementById('ped-start')?.value) || 1;
        end = parseInt(document.getElementById('ped-end')?.value) || 100;
        schema = document.getElementById('ped-schema')?.value || 'sequential';
    }

    let isMultiSelected = false;
    let tempMultiArtes = null;

    if (!state.multiArtesPdfCache) state.multiArtesPdfCache = {};
    if (!state.multiArtesPdfLoading) state.multiArtesPdfLoading = {};
    if (!state.multiArtesPdfTamanho) state.multiArtesPdfTamanho = {};

    if (state.selectedOSItems && state.selectedOSItems.length > 1) {
        isMultiSelected = true;
        schema = 'multi_artes';
        tempMultiArtes = state.selectedOSItems.map(s => {
            const sItem = state.osItens[s.osId]?.find(i => String(i.id) === String(s.itemId));
            const qt = sItem ? (parseInt(sItem.qtd !== undefined && sItem.qtd !== null ? sItem.qtd : (sItem.quantidade || 0))) : 0;
            
            const corObj = sItem && sItem.amostra_cor_id
                ? (state.cores || []).find(c => String(c.id) === String(sItem.amostra_cor_id))
                : (sItem ? (state.cores || []).find(c => globalFuzzyMatch(c.name, sItem.cor || sItem.padrao || '')) : null);
            // So arte de verdade vai ao motor. A amostra de aprovacao e a Cor
            // ficam de fora — ver frontend/arte-de-impressao.js. Sem arte, o
            // trabalho sai so com numeracao, que e o correto e o que sempre foi.
            //
            // Vale para a previa tambem, e de proposito: `itemArteUrl` alimenta
            // o cache de PDF que ela desenha. A previa tem de mostrar o que sai
            // no papel — se exibisse a amostra, prometeria o que nao sai.
            const itemArteUrl = arteParaImpor(sItem ? sItem.arte_url : null);

            const wantsDuplex = sItem ? (sItem.verso_tipo === 'FxVerso' || sItem.verso === true) : false;
            const itemArteVersoUrl = (sItem && wantsDuplex)
                ? arteParaImpor(sItem.verso_arte_url || sItem.url_arquivo_arte_verso)
                : null;

            let pdfDoc = null;
            if (itemArteUrl && state.multiArtesPdfCache[itemArteUrl]) {
                pdfDoc = state.multiArtesPdfCache[itemArteUrl];
            } else if (itemArteUrl && !state.multiArtesPdfLoading[itemArteUrl]) {
                // A MARCA DE "CARREGANDO" SAI QUANDO A TENTATIVA TERMINA (02/09/2026).
                //
                // Ela existe para o mesmo download nao disparar varias vezes, e
                // nunca era apagada. No sucesso isso nao aparecia -- o cache
                // acima responde antes. No ERRO, a arte nao entrava no cache, a
                // marca bloqueava qualquer nova tentativa, e aquela arte ficava
                // fora da folha pelo resto da sessao, sem aviso nenhum.
                //
                // Reproduzido com a rede falhando UMA vez: seis redesenhos em 12
                // segundos, e a segunda arte nunca voltou. So o F5 destravava.
                //
                // `finally`, no molde que este arquivo ja usa para as paginas do
                // PDF. O redesenho continua so no caminho de sucesso: chamado no
                // `catch`, cada falha dispararia outra tentativa, em laco.
                state.multiArtesPdfLoading[itemArteUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteUrl] = doc;
                    return medirArteDaFolhaCombinada(itemArteUrl, doc);
                }).then(() => {
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF for multi arte preview:', e);
                }).finally(() => { delete state.multiArtesPdfLoading[itemArteUrl]; });
            }

            let pdfVersoDoc = null;
            if (itemArteVersoUrl && state.multiArtesPdfCache[itemArteVersoUrl]) {
                pdfVersoDoc = state.multiArtesPdfCache[itemArteVersoUrl];
            } else if (itemArteVersoUrl && !state.multiArtesPdfLoading[itemArteVersoUrl]) {
                state.multiArtesPdfLoading[itemArteVersoUrl] = true;
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                fetch(itemArteVersoUrl).then(r => r.arrayBuffer()).then(buf => {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(doc => {
                    state.multiArtesPdfCache[itemArteVersoUrl] = doc;
                    return medirArteDaFolhaCombinada(itemArteVersoUrl, doc);
                }).then(() => {
                    if (typeof drawPedPreview === 'function') drawPedPreview();
                }).catch(e => {
                    console.error('Error fetching PDF VERSO for multi arte preview:', e);
                }).finally(() => { delete state.multiArtesPdfLoading[itemArteVersoUrl]; });
            }

            return {
                qtd: qt,
                // O que a prévia desenha deitado na borda da célula tem de ser o
                // que sai no papel: o NÚMERO do modelo, e só quando a opção do
                // modelo está marcada. Até 18/08/2026 vinha `sItem.produto` e
                // aparecia sempre — a tela mostrava um texto que a impressão não
                // tinha, e escondia a decisão de imprimir o número.
                nome: (sItem && typeof imprimeNumeroDoModelo === 'function' && imprimeNumeroDoModelo(sItem))
                    ? String(sItem.modelo || '')
                    : '',
                num1_id: sItem ? (sItem.amostra_num_id || sItem.numeracao_id || numId) : numId,
                start: sItem ? parseInt(sItem.num_inicial !== undefined && sItem.num_inicial !== null ? sItem.num_inicial : (sItem.numeracao_inicio || 1)) : 1,
                has_raw_file: false,
                is_selected: true,
                amostra_cor_id: sItem ? sItem.amostra_cor_id : null,
                pdfDoc: pdfDoc,
                pdfVersoDoc: pdfVersoDoc,
                // O tamanho da PAGINA de cada arte, em pontos. E o que faz a
                // folha combinada desenhar a arte no tamanho do arquivo, como o
                // motor faz, em vez de esticada ate a celula. Ver
                // `medirArteDaFolhaCombinada`.
                artWidth: (state.multiArtesPdfTamanho[itemArteUrl] || {}).w,
                artHeight: (state.multiArtesPdfTamanho[itemArteUrl] || {}).h,
                bloco: sItem && sItem.bloco ? parseInt(sItem.bloco) : null,
                // `pedidos_modelos.id` — o modelo desta arte. O QR Ideal tira uma
                // coluna do pool por modelo; sem isto o motor recusa a folha.
                modelo: s.itemId || (sItem ? sItem.id : null)
            };
        });
    }

    const printModeEl = document.getElementById('ped-print-mode');
    if (printModeEl) {
        state.printMode = printModeEl.value;
    } else if (activeItem) {
        const itens = state.osItens[activeItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(activeItem.itemId));
        if (item) {
            state.printMode = modoDeVersoDoModelo(item);
        }
    }

    const canvas = document.getElementById('ped-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (!fmtId || !saiId) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando formato e saída...', 150, 100);
        document.getElementById('ped-preview-sheet-num').textContent = 'Sem Configuração';
        // Sem prévia não há conta, e o selo da sobra some junto.
        if (typeof registrarContaDaTela === 'function') registrarContaDaTela(0, 0);
        return;
    }

    const fmt = state.formatos.find(f => String(f.id) === String(fmtId));
    const sai = state.saidas.find(s => String(s.id) === String(saiId));

    if (!fmt || !sai) {
        // Não pode ser um `return` silencioso. A prévia é um canvas que só muda quando
        // alguém desenha nele: saindo daqui sem desenhar, a folha do desenho ANTERIOR
        // continua na tela, sem nenhum sinal de que parou de ser atualizada — e o
        // operador confere uma folha que não corresponde mais ao que está configurado.
        //
        // Acontece de verdade quando o cadastro em memória perde o formato ou a saída
        // referenciados pelo item: uma recarga de catálogo em andamento, um formato
        // apagado, uma OS aberta antes de o cadastro terminar de carregar.
        const faltando = (!fmt && !sai) ? 'o formato e a saída' : (!fmt ? 'o formato' : 'a saída');
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ef4444';
        ctx.fillText(`Não encontrei ${faltando} no cadastro.`, 150, 92);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Recarregue a página e abra o pedido de novo.', 150, 112);
        const badge = document.getElementById('ped-preview-sheet-num');
        if (badge) badge.textContent = 'Sem Formato';
        return;
    }

    // Validação estrita das regras de imposição do formato na visualização
    if (!fmt.default_schema || !fmt.default_saida_id) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.fillStyle = '#ef4444';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Erro: Regras de Imposição ausentes no Formato.', 150, 100);
        document.getElementById('ped-preview-sheet-num').textContent = 'Erro de Regra';
        // Sem prévia não há conta, e o selo da sobra some junto.
        if (typeof registrarContaDaTela === 'function') registrarContaDaTela(0, 0);
        return;
    }

    if (fmt.default_schema === 'cut_stack') {
        if (!fmt.default_cut_stack_mode || !fmt.default_sheets_per_block) {
            canvas.width = 300;
            canvas.height = 200;
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, 300, 200);
            ctx.fillStyle = '#ef4444';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Erro: Parâmetros Cut & Stack ausentes.', 150, 100);
            document.getElementById('ped-preview-sheet-num').textContent = 'Erro de Regra';
            // Sem prévia não há conta, e o selo da sobra some junto.
            if (typeof registrarContaDaTela === 'function') registrarContaDaTela(0, 0);
            return;
        }
    }

    // Fonte única da regra de paginação: o campo "Regra de Paginação". É o valor que
    // runPedImposition() envia ao engine, então é o que a prévia tem de desenhar —
    // senão a tela mostra uma coisa e o papel sai outra. O formato entra como recuo,
    // e continua mandando na saída, que não faz parte desta escolha.
    schema = document.getElementById('ped-schema')?.value || fmt.default_schema;
    saiId = fmt.default_saida_id;

    // COM VÁRIOS MODELOS, QUEM DECIDE É A MESMA REGRA DO PAYLOAD (02/09/2026).
    //
    // O seletor de Regra de Paginação acima continua valendo para UM modelo. Com
    // a seleção combinada ele não serve: ninguém o atualiza quando a seleção ou a
    // barra "somar folha" mudam — só o padrão do formato escreve nele —, enquanto
    // o `runPedImposition` decide por `esquemaDaSelecaoCombinada()`.
    //
    // Medido antes deste conserto, com dois modelos blocados num formato de
    // regra `sequential`:
    //
    //   barra em "folha própria"      → máquina: cut_stack    | janela: sequential
    //   barra em "aproveitar a folha"  → máquina: multi_artes  | janela: sequential
    //
    // A janela nunca mudava, e nunca batia. Clicar na barra trocava o que a
    // impressora faz e não mexia na tela.
    if (isMultiSelected && typeof esquemaDaSelecaoCombinada === 'function') {
        schema = esquemaDaSelecaoCombinada();
    }

    // O que a janela decidiu, publicado como o `state.contaDaTela` faz: sem
    // isto não há como conferir — nem num teste, nem no console — se a tela e a
    // máquina estão desenhando o mesmo trabalho.
    state.esquemaDaPrevia = schema;


    
    const previewPartEl = document.getElementById('ped-preview-part-input');
    let previewPart = 'miolo';
    if (previewPartEl) {
        const isDuplex = temVerso(state.printMode);
        if (fmt.has_cover || isDuplex) {
            mostrarControleDaPrevia(previewPartEl, true);

            const currentVal = previewPartEl.value;
            
            let optionsHtml = '';
            optionsHtml += '<option value="miolo">Miolo</option>';
            if (isDuplex) {
                optionsHtml += '<option value="miolo_verso">Miolo (Verso)</option>';
            }
            if (fmt.has_cover) {
                optionsHtml += '<option value="capa">Capa</option>';
                optionsHtml += '<option value="contracapa">Contracapa</option>';
            }
            
            // Só atualizar o HTML se as opções mudaram para evitar loops de re-renderização
            const existingOptions = Array.from(previewPartEl.options).map(o => o.value).join(',');
            const newOptions = isDuplex 
                ? (fmt.has_cover ? 'miolo,miolo_verso,capa,contracapa' : 'miolo,miolo_verso')
                : (fmt.has_cover ? 'miolo,capa,contracapa' : 'miolo');
                
            if (existingOptions !== newOptions) {
                previewPartEl.innerHTML = optionsHtml;
                if (optionsHtml.includes(`value="${currentVal}"`)) {
                    previewPartEl.value = currentVal;
                } else {
                    previewPartEl.value = 'miolo';
                }
            }
            
            previewPart = previewPartEl.value;
        } else {
            mostrarControleDaPrevia(previewPartEl, false);
            previewPartEl.value = 'miolo';
            previewPart = 'miolo';
        }
    }

    const num = state.numeracoes.find(n => String(n.id) === String(numId)) || null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;

    // A fonte precisa ter CHEGADO antes do traco. Canvas e raster: se ela ainda
    // esta baixando, o navegador pinta com uma generica e NAO redesenha quando
    // ela chega. E como a centralizacao usa a largura MEDIDA do texto, a fonte
    // errada desloca tambem a posicao do numero na peca — nao e so o desenho da
    // letra. Mesmo molde do `drawPreview` do script.js: dispara a busca e manda
    // repintar quando vier fonte nova. Ver tests/test_espera_de_fonte_nas_janelas.py.
    try {
        const _nomesFonte = window.fontesDosElementos([
            ...((num && num.elements) || []),
            ...((num2 && num2.elements) || []),
        ]);
        if (_nomesFonte.length) {
            window.garantirFontesCarregadas(_nomesFonte).then(novas => {
                if (novas && novas.length) drawPedPreview();
            });
        }
    } catch (_) { /* nunca impedir o desenho por causa disto */ }

    const MM2PT = 2.8346;

    const sheet_w = sai.width_mm * MM2PT;

    const sheet_h = sai.height_mm * MM2PT;

    const item_w = fmt.width_mm * MM2PT;

    const item_h = fmt.height_mm * MM2PT;

    const gap_h = (fmt.gap_h_mm || 0) * MM2PT;

    const gap_v = (fmt.gap_v_mm || 0) * MM2PT;

    const fmt_off_h = (fmt.offset_h_mm || 0) * MM2PT;

    const fmt_off_v = (fmt.offset_v_mm || 0) * MM2PT;



    // Calcular escala baseada no tamanho real do container (70% da área, sem invadir o painel)
    // Usar clientWidth do container pai para limitar dinamicamente
    const canvasContainer = canvas.closest('.ped-preview-canvas-container') || canvas.parentElement;
    // Subtrair padding do container (32px = 16px cada lado)
    const availW = canvasContainer ? Math.max(200, canvasContainer.clientWidth - 32) : 800;
    const availH = canvasContainer ? Math.max(200, canvasContainer.clientHeight - 32) : 600;

    // Escala interna alta (resolução do canvas) — limitada por 1920x1360
    const MAX_W = Math.min(1920, availW * 2);
    const MAX_H = Math.min(1360, availH * 2);

    const scale = Math.min(MAX_W / sheet_w, MAX_H / sheet_h);

    canvas.width = Math.round(sheet_w * scale);
    canvas.height = Math.round(sheet_h * scale);

    // CSS: redimensionar para caber visivelmente no container disponível
    const displayScale = Math.min(availW / (sheet_w * scale), availH / (sheet_h * scale));
    const displayW = Math.round(canvas.width * displayScale);
    const displayH = Math.round(canvas.height * displayScale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;



    // Fundo branco do papel

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);



    const cols = fmt.cols;

    const rows = fmt.rows;

    const used_w = cols * item_w + (cols - 1) * gap_h;

    const used_h = rows * item_h + (rows - 1) * gap_v;



    const start_x = (sheet_w - used_w) / 2;
    const start_y = (sheet_h - used_h) / 2;

    let ticket_qtd = 1;
    if (num && num.tipo === "TICKET") {
        ticket_qtd = parseInt(num.ticket_qtd) || 1;
    }
    let raw_items = Math.max(1, end - start + 1);
    if (state.csvData) {
        raw_items = state.csvData.length;
    } else if (schema === 'pdf_multiple') {
        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;
        raw_items = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;
    }

    let total_items = raw_items;
    if (schema === "multi_artes" || isMultiSelected) {
        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        let sum_physical = 0;
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            sum_physical += q;
        }
        total_items = sum_physical;
    } else {
        if (num && num.tipo === "TICKET") {
            total_items = Math.ceil(raw_items / ticket_qtd);
        } else {
            total_items = raw_items;
        }
    }

    const poses_per_sheet = cols * rows;
    let total_sheets = Math.ceil(total_items / poses_per_sheet);

    // ─── A LISTA DE MULTI-ARTES SÓ VALE EM MULTI-ARTES ─────────────────────────
    // `state.impMultiArtes` é preenchida pelo painel de Multi-Artes e **nunca é
    // limpa** — não há um único ponto no projeto que a esvazie. Consultá-la fora
    // desse esquema fazia um trabalho anterior da sessão contaminar o seguinte:
    // as poses cujo índice caísse na faixa de quantidade da primeira arte passavam
    // a buscar a numeração DA ARTE (`num1_id`), que não existe mais, e desenhavam
    // nenhum elemento. Como a faixa começa no índice 0, era sempre a primeira pose
    // da folha que saía sem numeração — na tela, porque o payload do motor só leva
    // multi_artes quando o esquema é multi_artes, e por isso o papel saía certo.
    //
    // `isMultiSelected` já força `schema = 'multi_artes'` mais acima, então esta
    // condição cobre os dois casos. É o mesmo gate que o script.js sempre usou.
    const artesMultiAtivas = (schema === 'multi_artes')
        ? ((isMultiSelected ? tempMultiArtes : state.impMultiArtes) || [])
        : [];

    let is_strict_mode = false;
    let stack_size = 50;
    let sets_needed = 1;
    // O PLANO DE MONTAGEM É ZERADO ANTES DE QUALQUER DECISÃO (02/09/2026).
    //
    // Ele é um global (`window.currentAssemblySets`) e nunca era limpo: aberto
    // um trabalho que o construía, ele ficava pendurado no navegador e o
    // trabalho SEGUINTE — que podia não ter plano nenhum — era desenhado com o
    // plano do anterior. As três leituras dele (as folhas visíveis, a conta do
    // `S` e o mapeamento das poses) perguntam só se ele existe.
    //
    // É a mesma armadilha já documentada aqui para o `state.impMultiArtes`.
    // Zerando no começo, ou ele é construído para ESTE trabalho, ou não existe.
    window.currentAssemblySets = null;

    if (schema === "cut_stack" || schema === "multi_artes") {
        const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
        stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        // A FOLHA SOMADA NÃO É PILHA (02/09/2026).
        //
        // `multi_artes` saiu daqui. O motor o trata como esquema próprio, sem
        // olhar o modo de cut stack (`is_strict_assembly` no engine.py exige
        // `layout_schema == "cut_stack"`), e enfileira as peças de todos os
        // modelos coluna a coluna — que é a regra do usuário para somar: total
        // de células ÷ células do formato, sem reservar folha por modelo.
        //
        // Enquanto ele entrava aqui, a janela montava uma pilha por modelo e
        // prometia outra folha: no pedido 21408, Set 1 com 7 folhas só do
        // 1000739 e Set 2 com 5 só do 1000740, enquanto a máquina faz 12 folhas
        // com os dois misturados desde a primeira. O papel sempre saiu certo.
        //
        // A condição de fora ficou: é dela que sai o `stack_size`, que o Refazer
        // e as contas de pilha continuam usando.
        if (schema === "cut_stack" && (cutstackMode === 'strict' || cutstackMode === 'strict_assembly')) {
            is_strict_mode = true;
            if (cutstackMode === 'strict_assembly') {
                if (typeof buildStrictAssemblySets === 'function') {
                    window.currentAssemblySets = buildStrictAssemblySets(artesMultiAtivas, isMultiSelected, total_items, stack_size, poses_per_sheet);
                    sets_needed = window.currentAssemblySets.length;
                    total_sheets = window.currentAssemblySets.reduce((sum, s) => sum + s.num_sheets, 0);
                } else {
                    const itemsPerSet = stack_size * poses_per_sheet;
                    sets_needed = Math.ceil(total_items / itemsPerSet);
                }
            } else {
                const itemsPerSet = stack_size * poses_per_sheet;
                sets_needed = Math.ceil(total_items / itemsPerSet);
                total_sheets = sets_needed * stack_size;
            }
        }
    }

    const setSelect = document.getElementById('ped-preview-set-input');
    const refazerSetSelect = document.getElementById('ped-refazer-set');
    if (setSelect && refazerSetSelect) {
        if (sets_needed >= 1 && (schema === "cut_stack" || schema === "multi_artes")) {
            mostrarControleDaPrevia(setSelect, true);
            refazerSetSelect.style.display = 'inline-block';
            
            if (setSelect.options.length !== sets_needed) {
                const currentVal = setSelect.value;
                const currentRefVal = refazerSetSelect.value;
                setSelect.innerHTML = '';
                refazerSetSelect.innerHTML = '';
                for (let i = 1; i <= sets_needed; i++) {
                    setSelect.add(new Option(`Set ${i}`, i));
                    refazerSetSelect.add(new Option(`Set ${i}`, i));
                }
                setSelect.value = currentVal <= sets_needed ? currentVal : 1;
                refazerSetSelect.value = currentRefVal <= sets_needed ? currentRefVal : 1;
            }
        } else {
            mostrarControleDaPrevia(setSelect, false);
            refazerSetSelect.style.display = 'none';
            setSelect.innerHTML = '<option value="1">Set 1</option>';
            refazerSetSelect.innerHTML = '<option value="1">Set 1</option>';
        }
    }

    const currentSet = setSelect && setSelect.style.display !== 'none' ? parseInt(setSelect.value) || 1 : 1;
    
    // Determinar o total de folhas visíveis neste set
    let visible_sheets = total_sheets;
    if (is_strict_mode) {
        if (window.currentAssemblySets) {
            visible_sheets = window.currentAssemblySets[currentSet - 1]?.num_sheets || 0;
        } else {
            if (currentSet < sets_needed) {
                visible_sheets = stack_size;
            } else {
                visible_sheets = total_sheets - ((sets_needed - 1) * stack_size);
            }
        }
    }

    // ─── O QUE A CAIXA "REFAZER" PRECISA SABER ─────────────────────────────────
    // Os campos De/Até contam folhas DENTRO DO SET. O campo de células conta
    // POSIÇÕES NO MODELO — o 1º, o 6º, o 22º ticket —, e por isso o teto dele é a
    // quantidade do modelo, não as poses da folha. Limitar pelas poses recusava
    // "22" num formato de dez células, que é um pedido perfeitamente legítimo.
    //
    // Guardar o total de folhas ANTES da compactação é essencial: uma vez
    // compactada, a prévia passa a mostrar folhas de saída, e validar "De: 7"
    // contra elas recusaria uma folha de origem que existe.
    window.pedRefazerTotalFolhas = visible_sheets;
    window.pedRefazerTotalCelulas = total_items;
    if (typeof sincronizarLimitesRefazer === 'function') sincronizarLimitesRefazer();

    // ─── REFAZER CÉLULA: A PRÉVIA MOSTRA A FOLHA COMPACTADA ────────────────────
    // As células são POSIÇÕES NO MODELO (o 1º, o 6º, o 22º ticket), então o
    // índice interno do item é `posição - 1` e pronto — nenhuma conta de esquema
    // entra aqui. Onde o item caiu na tiragem original é irrelevante para quem só
    // quer o ticket de volta; o motor faz exatamente a mesma coisa (`fontes`, no
    // engine.py), e é essa simetria que mantém tela e papel iguais.
    const refazerCels = typeof getRefazerCelulasSelecionadas === 'function'
        ? getRefazerCelulasSelecionadas()
        : null;

    let fontesRefazer = null;
    if (refazerCels) {
        // Ordem digitada: é ela que decide qual item ocupa qual posição na folha.
        fontesRefazer = refazerCels
            .filter(pos => pos >= 1 && pos <= total_items)
            .map(pos => ({ item_index: pos - 1, posicao: pos }));
        // Nenhuma posição digitada ainda: continua havendo uma folha para mostrar,
        // e ela é a folha vazia. `Math.max(1, ...)` evita o "Folha 1 de 0".
        visible_sheets = Math.max(1, Math.ceil(fontesRefazer.length / poses_per_sheet));
        total_sheets = visible_sheets;
    }

    const folhaBase = sets_needed > 1 || refazerCels
        ? `Folha ${window.currentPreviewPage || 1} de ${visible_sheets}`
        : `Folha ${window.currentPreviewPage || 1} de ${total_sheets}`;
    let folhaLabel = folhaBase;
    if (refazerCels) {
        folhaLabel = fontesRefazer.length === 0
            ? `${folhaBase} · digite as posições a refazer (1 a ${total_items})`
            : `${folhaBase} · compactada · ${fontesRefazer.length} de ${total_items} item(ns) do modelo`;
    }
    // Em Pdf Paginado a quantidade sai do ARQUIVO, não do pedido: o engine faz
    // total_items = nº de páginas (metade em duplex). Dizer isso no cabeçalho é o que
    // permite ao operador conferir a conta sem abrir o PDF.
    document.getElementById('ped-preview-sheet-num').textContent =
        (schema === 'pdf_multiple' && state.pedArtPdfDoc)
            ? `${folhaLabel} · ${state.pedArtPdfDoc.numPages} páginas do PDF · ${poses_per_sheet} por folha`
            : folhaLabel;
    atualizarAvisoPaginacao(schema, total_items);

    // A conta da sobra sai DAQUI na aba Pedido, e não do Sumário.
    //
    // O Sumário desta aba vive dentro de um `display: none !important` e nem
    // chega a ser calculado: os campos Formato e Saída dele também estão
    // escondidos, ficam vazios, e `updatePedSummary` desiste na primeira
    // conferência. Quem sabe quantas folhas o trabalho tem é a prévia — é ela
    // que escreve "FOLHA 1 DE 7" na tela, e é esse número que o operador lê.
    if (typeof registrarContaDaTela === 'function') {
        registrarContaDaTela(total_items, poses_per_sheet,
            typeof itemAtivoDoPedido === 'function' ? itemAtivoDoPedido() : null);
    }

    const isBack = state.previewFace === 'back' || previewPart === 'miolo_verso';

    // Quantos elementos de numeração cada pose pintou nesta passada (ver o aviso no fim)
    const posesDesenhadas = [];

    // As linhas cujas fotos esta folha precisa. Colhidas durante o desenho e
    // usadas UMA vez no fim: ver o bloco "Fotos" antes da borda da folha.
    const _linhasFoto = [];

    // Célula de saída sem item — a folha inteira logo que se marca "Refazer
    // Célula", e a sobra do fim quando a conta não fecha redondo.
    //
    // Desenhada clara e tracejada de propósito: no papel essas células saem em
    // BRANCO, e um véu escuro faria a prévia parecer que ali há algo bloqueado.
    // O tracejado diz "a célula existe e está vazia", que é a verdade da folha.
    const desenharCelulaVazia = (row, col) => {
        const col_f = isBack ? (cols - 1 - col) : col;
        const x = (start_x + col_f * (item_w + gap_h)) * scale;
        const y = (start_y + row * (item_h + gap_v)) * scale;
        const w = item_w * scale;
        const h = item_h * scale;
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,0.10)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(100,116,139,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    };

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const P = row * cols + col;

            let local_S = (window.currentPreviewPage || 1) - 1;
            if (local_S >= visible_sheets) local_S = visible_sheets - 1;
            if (local_S < 0) local_S = 0;
            
            let S = local_S;
            if (is_strict_mode && !window.currentAssemblySets) {
                S = ((currentSet - 1) * stack_size) + local_S;
            }

            let item_index = (S * poses_per_sheet) + P;
            // Posição no modelo que caiu nesta célula da folha compactada — usada
            // só para o rótulo, mas é o dado que deixa o operador conferir que
            // pediu os itens certos ("#22" = o vigésimo segundo do modelo).
            let origemDaCelula = null;

            if (fontesRefazer) {
                // Folha compactada: esta célula recebe o próximo item da lista, na
                // ordem digitada. O índice é a posição no modelo menos 1.
                const fonte = fontesRefazer[(local_S * poses_per_sheet) + P];
                if (!fonte) {
                    desenharCelulaVazia(row, col);
                    continue;
                }
                item_index = fonte.item_index;
                // Deixados indefinidos de propósito: sem eles, a busca por arte
                // mais abaixo cai no percurso por quantidade acumulada, que é o
                // certo aqui porque `item_index` é global no trabalho.
                item_local_index = undefined;
                item_arte_index = undefined;
                origemDaCelula = fonte;
            } else if (schema === "cut_stack" || schema === "multi_artes") {
                const cutstackMode = document.getElementById('ped-cutstack-mode')?.value || 'independent';
                // O ESQUEMA DECIDE ANTES DO MODO DE CUT STACK (02/09/2026).
                //
                // É a ordem do motor: lá o `multi_artes` é um caso próprio do
                // `layout_schema`, resolvido sem olhar o `cut_stack_mode`. Aqui
                // ele vinha depois, e por isso duas coisas davam errado: o ramo
                // do plano de montagem o interceptava (era o defeito), e uma
                // máquina com 'strict' salvo no formato levaria a folha somada
                // para o mapeamento de pilha.
                //
                // Esta conta é a mesma das outras duas pontas — a prévia da
                // Imposição e o `engine.py`. Ela já estava escrita logo abaixo;
                // só nunca chegava a rodar.
                if (schema === "multi_artes") {
                    const P_col_first = col * rows + row;
                    item_index = (P_col_first * total_sheets) + S;
                } else if (cutstackMode === 'strict' && !window.currentAssemblySets) {
                    const full_sets = Math.floor(total_sheets / stack_size);
                    const set_index = Math.floor(S / stack_size);
                    const sheet_within_set = S % stack_size;
                    item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set;
                } else if (cutstackMode === 'strict_assembly' && window.currentAssemblySets) {
                    let set_def = window.currentAssemblySets[currentSet - 1];
                    if (set_def && set_def.cell_allocations[P] && set_def.cell_allocations[P][local_S]) {
                        let item_data = set_def.cell_allocations[P][local_S];
                        item_index = item_data.global_index;
                        item_local_index = item_data.local_index;
                        item_arte_index = item_data.arte_index;
                    } else {
                        item_index = total_items; // skip rendering this cell
                        item_local_index = undefined;
                        item_arte_index = undefined;
                    }
                } else if (cutstackMode === 'strict_assembly') {
                    const full_sets = Math.floor(total_sheets / stack_size);
                    if (S < full_sets * stack_size) {
                        const set_index = Math.floor(S / stack_size);
                        const sheet_within_set = S % stack_size;
                        item_index = ((P * full_sets) + set_index) * stack_size + sheet_within_set;
                    } else {
                        const S_asm = S - (full_sets * stack_size);
                        const asm_sheets = total_sheets - (full_sets * stack_size);
                        const base_index = full_sets * stack_size * poses_per_sheet;
                        item_index = base_index + (P * asm_sheets) + S_asm;
                    }
                } else {
                    item_index = (P * total_sheets) + S;
                }
            } else if (schema === "step_repeat") {
                item_index = S;
            }

            if (item_index >= total_items) continue;

            // Para o verso da folha (tombamento horizontal), espelhamos as colunas fisicamente
            const col_fisico = isBack ? (cols - 1 - col) : col;

            const cell_x0 = start_x + col_fisico * (item_w + gap_h);

            const cell_y0 = start_y + row * (item_h + gap_v);



            const cw = item_w * scale;

            const ch = item_h * scale;



            // Centro da célula para rotação

            const centerX = (cell_x0 + item_w / 2) * scale;

            const centerY = (cell_y0 + item_h / 2) * scale;

            

            // Inverter a rotação da célula no verso para bater frente/verso

            const cellRotationFrente = fmt.rotations ? (parseInt(fmt.rotations[P]) || 0) : 0;

            const cellRotation = isBack ? ((360 - cellRotationFrente) % 360) : cellRotationFrente;



            ctx.save();

            ctx.translate(centerX, centerY);

            if (cellRotation !== 0) {

                ctx.rotate((cellRotation * Math.PI) / 180);

            }



            // Borda do item (desenhada em torno do centro 0,0)

            ctx.strokeStyle = '#cbd5e1';

            ctx.lineWidth = 0.5;

            ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);



            // Clipping restrito à célula (impede que artes com sangria vazem)
            ctx.beginPath();
            ctx.rect(-cw / 2, -ch / 2, cw, ch);
            ctx.clip();

            let multiArteItem = null;
            const artesList = artesMultiAtivas;

            if (artesList.length > 0) {
                if (typeof item_arte_index !== 'undefined' && item_arte_index !== null) {
                    multiArteItem = artesList[item_arte_index];
                } else {
                    let accumulated = 0;
                    for (let i = 0; i < artesList.length; i++) {
                        let q = parseInt(artesList[i].qtd) || 0;
                        if (item_index >= accumulated && item_index < accumulated + q) {
                            multiArteItem = artesList[i];
                            break;
                        }
                        accumulated += q;
                    }
                }
            }

            // ─── CAMADA BASE DA COR (AMOSTRA) ──────────────────────────────────
            // Se o checkbox "AMOSTRA" (#ped-preview-toggle-amostra) estiver marcado,
            // desenhamos a camada base da Cor (amostra_cor_id / Cor da OS) abaixo
            // de todas as demais camadas. (Apenas visualização, NUNCA é impressa).
            const showAmostraCor = document.getElementById('ped-preview-toggle-amostra')?.checked === true;
            if (showAmostraCor) {
                const sItem = state.activeOSItem ? (state.osItens[state.activeOSItem.osId]?.find(i => String(i.id) === String(state.activeOSItem.itemId))) : null;
                const corId = (multiArteItem && multiArteItem.amostra_cor_id)
                    ? multiArteItem.amostra_cor_id
                    : (sItem ? sItem.amostra_cor_id : (document.getElementById('ped-cor')?.value || ''));
                
                const corObj = corId
                    ? (state.cores || []).find(c => String(c.id) === String(corId))
                    : (state.cores || []).find(c => globalFuzzyMatch(c.name, (sItem ? (sItem.cor || sItem.padrao || '') : '')));

                if (corObj) {
                    // O catálogo não traz o PDF da cor. Esta função é síncrona
                    // de propósito (é o desenho), então em vez de esperar: pede o
                    // arquivo e redesenha quando ele chega. Roda uma vez só —
                    // depois `pdf_base64` deixa de ser `undefined`.
                    if (corObj.pdf_base64 === undefined && typeof window.garantirPdfDaCor === 'function') {
                        window.garantirPdfDaCor(corObj).then(() => {
                            if (typeof drawPedPreview === 'function') drawPedPreview();
                        });
                    }

                    // 1. Desenhar cor de fundo / hex de referência se cadastrada
                    const hexColor = corObj.cor_referencia || corObj.hex || corObj.color || '';
                    if (hexColor) {
                        ctx.fillStyle = hexColor;
                        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
                    }

                    // 2. Se a cor possuir arquivo PDF ou imagem de amostra (Frente/Verso)
                    const corPdfUrl = isBack ? (corObj.pdf_verso_url || corObj.pdf_verso_base64) : (corObj.pdf_url || corObj.pdf_base64);
                    if (corPdfUrl) {
                        if (!corObj._pdfCache) corObj._pdfCache = {};
                        const cKey = isBack ? 'verso' : 'frente';
                        const corPdfDoc = corObj._pdfCache[cKey];

                        if (corPdfDoc) {
                            if (corPdfDoc.pagesCache && corPdfDoc.pagesCache['page_1']) {
                                const cachedCorCanvas = corPdfDoc.pagesCache['page_1'];
                                ctx.drawImage(cachedCorCanvas, -cw / 2, -ch / 2, cw, ch);
                            } else if (!corPdfDoc.rendering) {
                                corPdfDoc.rendering = true;
                                (async () => {
                                    try {
                                        const p = await corPdfDoc.getPage(1);
                                        const vp = p.getViewport({ scale: 1.5 });
                                        const off = document.createElement('canvas');
                                        off.width = vp.width;
                                        off.height = vp.height;
                                        const octx = off.getContext('2d');
                                        octx.fillStyle = '#ffffff';
                                        octx.fillRect(0, 0, off.width, off.height);
                                        await p.render({ canvasContext: octx, viewport: vp }).promise;
                                        if (!corPdfDoc.pagesCache) corPdfDoc.pagesCache = {};
                                        corPdfDoc.pagesCache['page_1'] = off;
                                        if (typeof drawPedPreview === 'function') drawPedPreview();
                                    } catch (e) {
                                        console.error('Erro ao renderizar pág da Cor base:', e);
                                    } finally {
                                        delete corPdfDoc.rendering;
                                    }
                                })();
                            }
                        } else if (!corObj._pdfLoading) {
                            corObj._pdfLoading = true;
                            if (typeof pdfjsLib !== 'undefined') {
                                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                                }
                                const fetchPromise = corPdfUrl.startsWith('data:')
                                    ? pdfjsLib.getDocument({ data: atob(corPdfUrl.split('base64,')[1] || corPdfUrl) }).promise
                                    : fetch(corPdfUrl).then(r => r.arrayBuffer()).then(buf => pdfjsLib.getDocument({ data: buf }).promise);

                                fetchPromise.then(doc => {
                                    corObj._pdfCache[cKey] = doc;
                                    delete corObj._pdfLoading;
                                    if (typeof drawPedPreview === 'function') drawPedPreview();
                                }).catch(e => {
                                    console.error('Erro ao carregar PDF da cor da amostra:', e);
                                    delete corObj._pdfLoading;
                                });
                            }
                        }
                    }
                }
            }



            // ─── GRUPO ARTE + NUMERAÇÃO ────────────────────────────────────────
            // A numeração NÃO funde com a arte: ela cobre a arte, e são as duas JUNTAS
            // que multiplicam sobre a cor do papel (a camada "AMOSTRA" acima). Por isso
            // tudo o que é impresso nesta posição — arte, nome do modelo e elementos
            // variáveis — é pintado antes neste canvas transparente, e só no fim o
            // grupo inteiro é composto sobre a folha com 'multiply'. Compor cada camada
            // direto na folha faria o multiply em cascata: a numeração escureceria onde
            // caísse em cima da arte. Mesma regra de drawAmostraFace() no script.js.
            //
            // O canvas do grupo tem o tamanho da folha inteira e recebe a MESMA matriz
            // de transformação e o MESMO clip da célula, para as coordenadas de desenho
            // continuarem idênticas às da folha e a composição final ser pixel a pixel,
            // sem reamostragem (nada de arte esticada ou meio pixel fora de lugar).
            if (!window._pedGrupoCanvas || window._pedGrupoCanvas.width !== canvas.width || window._pedGrupoCanvas.height !== canvas.height) {
                window._pedGrupoCanvas = document.createElement('canvas');
                window._pedGrupoCanvas.width = canvas.width;
                window._pedGrupoCanvas.height = canvas.height;
            }
            const grupoCanvas = window._pedGrupoCanvas;
            const gctx = grupoCanvas.getContext('2d');

            // Retângulo desta célula em pixels da folha: limita o clear e a composição
            // ao pedaço que interessa, em coordenadas inteiras.
            const _mCel = ctx.getTransform();
            const _cantos = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]]
                .map(([x, y]) => [_mCel.a * x + _mCel.c * y + _mCel.e, _mCel.b * x + _mCel.d * y + _mCel.f]);
            const gx0 = Math.max(0, Math.floor(Math.min(..._cantos.map(c => c[0]))) - 2);
            const gy0 = Math.max(0, Math.floor(Math.min(..._cantos.map(c => c[1]))) - 2);
            const gx1 = Math.min(grupoCanvas.width, Math.ceil(Math.max(..._cantos.map(c => c[0]))) + 2);
            const gy1 = Math.min(grupoCanvas.height, Math.ceil(Math.max(..._cantos.map(c => c[1]))) + 2);
            const gw = gx1 - gx0;
            const gh = gy1 - gy0;

            gctx.setTransform(1, 0, 0, 1, 0, 0);
            if (gw > 0 && gh > 0) gctx.clearRect(gx0, gy0, gw, gh);
            gctx.save();
            gctx.setTransform(_mCel);
            gctx.beginPath();
            gctx.rect(-cw / 2, -ch / 2, cw, ch);
            gctx.clip();

            // Despeja o grupo na folha: uma única multiplicação sobre a cor.
            let grupoFechado = false;
            const fecharGrupo = () => {
                if (grupoFechado) return;
                grupoFechado = true;
                gctx.restore();
                if (gw <= 0 || gh <= 0) return;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (showAmostraCor) ctx.globalCompositeOperation = 'multiply';
                ctx.drawImage(grupoCanvas, gx0, gy0, gw, gh, gx0, gy0, gw, gh);
                ctx.restore();
            };

            let activePdfDoc = state.pedArtPdfDoc;

            let activeImage = state.pedArtImage;

            let isMultiArtePdf = false;

            let art_orig_w = state.pedArtWidth;

            let art_orig_h = state.pedArtHeight;



             if (multiArteItem) {

                if (multiArteItem.pdfDoc) {

                    activePdfDoc = multiArteItem.pdfDoc;

                    isMultiArtePdf = true;

                    art_orig_w = multiArteItem.artWidth || item_w;

                    art_orig_h = multiArteItem.artHeight || item_h;

                }

                activeImage = null; 

            }



            if (activeImage || activePdfDoc) {
                // Centralizar a arte na célula + aplicar offset do formato (em relação ao centro da célula que é 0,0)
                // (positivo H = direita, positivo V = para cima → negar Y)
                let offH = fmt_off_h * scale;
                let offV = -fmt_off_v * scale;
                
                // A ARTE EM PDF ENTRA NO TAMANHO REAL (02/09/2026).
                //
                // O comentário que estava aqui dizia que "o backend sempre ajusta
                // proporcionalmente a arte base (JPG ou PDF) para caber na caixa
                // item_w x item_h". Isso vale só para IMAGEM: o `_load_base_as_pdf`
                // do motor converte a imagem numa página do tamanho do item e a
                // encaixa dentro. Arte em PDF ele não toca — usa o rect da PRÓPRIA
                // página (`base_w`/`base_h`) e a centraliza na célula, deixando o
                // que passa para a faca cortar.
                //
                // Enquanto a arte tinha o tamanho exato da peça, a diferença não
                // aparecia. Medido no pedido 21408, célula de 105 x 148 mm: o
                // modelo 1000739 (arte 104,35 x 158,35 mm) aparecia a 93,5% do
                // tamanho e o 1000740 (arte 110,70 x 164,70 mm) a 89,9% — com uma
                // faixa branca em volta que o papel não tem. O motor imprimia
                // certo nos dois; era só esta janela.
                //
                // É o mesmo conserto que o card do modelo recebeu em 18/08/2026
                // (`drawAmostraFace`) e o Criador de Arte junto. Esta era a
                // terceira tela com a regra, e a única que ficou para trás.
                //
                // O VERSO PODE TER OUTRO TAMANHO. No FxVersoUnico ele é um arquivo
                // separado — no 1000740, 104,35 mm contra os 110,70 da frente — e o
                // motor lê o rect de cada página (`base_w_verso`). Desenhar o verso
                // com a medida da frente o mostraria 6% maior do que sai no papel.
                if (isBack && !isMultiArtePdf
                        && state.pedArtVersoPdfDoc && state.pedArtVersoWidth) {
                    art_orig_w = state.pedArtVersoWidth;
                    art_orig_h = state.pedArtVersoHeight;
                }
                const arteEhPdf = !!activePdfDoc;
                const fitScale = arteEhPdf ? 1 : Math.min(item_w / art_orig_w, item_h / art_orig_h);
                let dw = art_orig_w * fitScale * scale;
                let dh = art_orig_h * fitScale * scale;


                
                if (previewPart === 'capa' || previewPart === 'contracapa') {
                    const cScale = (parseFloat(fmt.cover_scale) || 100) / 100.0;
                    dw *= cScale;
                    dh *= cScale;
                    offH = (parseFloat(fmt.cover_offset_x) || 0) * MM2PT * scale;
                    offV = -(parseFloat(fmt.cover_offset_y) || 0) * MM2PT * scale;
                } else {
                    // A ESCALA DA CAMADA DE ARTE (31/08/2026), a mesma que vai ao
                    // motor. Estica só a arte, cada eixo por conta própria, em
                    // torno do centro da célula — o `offH/offV` continua sendo o
                    // deslocamento do formato, e a numeração não anda com ela.
                    //
                    // Não vale para capa e contracapa: aquelas têm a escala
                    // própria do formato (`cover_scale`), que é outra coisa.
                    //
                    // O recorte na célula já existe: o `gctx` foi clipado no
                    // retângulo da célula logo acima, então o que passar do corte
                    // não aparece — como no papel. O motor ainda deixa a arte
                    // usar metade do vão até a célula vizinha como sangria; aqui
                    // a janela mostra a peça já aparada, que é o que sai do
                    // corte.
                    const _escArte = (multiArteItem && multiArteItem._escalaH !== undefined)
                        ? { h: multiArteItem._escalaH, v: multiArteItem._escalaV }
                        : ((typeof escalaDaArteDoTrabalho === 'function')
                            ? escalaDaArteDoTrabalho() : { h: 100, v: 100 });
                    dw *= (parseFloat(_escArte.h) || 100) / 100;
                    dh *= (parseFloat(_escArte.v) || 100) / 100;
                }



                if (dw > 0 && dh > 0) {

                    if (activePdfDoc) {

                        // Determinar qual página física real do PDF base exibir

                        let pageNum = 1;

                        if (schema === "pdf_multiple") {

                            if (versoUnico(state.printMode)) {

                                // A frente anda 1 a 1, como no simplex. O verso
                                // sai de OUTRO arquivo, sempre da pagina 1: e a
                                // mesma para todas as pecas. Sem arquivo de
                                // verso a celula fica vazia de proposito --
                                // desenhar a pagina 1 da frente ali seria a tela
                                // mentindo sobre o que vai sair no papel.

                                if (isBack) {

                                    activePdfDoc = state.pedArtVersoPdfDoc || null;

                                    pageNum = activePdfDoc ? 1 : 0;

                                } else {

                                    pageNum = item_index + 1;

                                }

                            } else if (state.printMode === "duplex") {

                                pageNum = isBack ? (item_index * 2 + 2) : (item_index * 2 + 1);

                            } else {

                                pageNum = item_index + 1;

                            }

                        } else {

                            pageNum = isBack ? 2 : 1;

                        }



                        // `>= 1` e a guarda do caso acima: `getPage(0)` estoura.
                        if (activePdfDoc && pageNum >= 1 && pageNum <= activePdfDoc.numPages) {

                            let pagesCache = activePdfDoc.pagesCache;

                            let pagesRendering = activePdfDoc.pagesRendering;

                            if (!pagesCache) {

                                pagesCache = {};

                                activePdfDoc.pagesCache = pagesCache;

                            }

                            if (!pagesRendering) {

                                pagesRendering = {};

                                activePdfDoc.pagesRendering = pagesRendering;

                            }



                            const cacheKey = `page_${pageNum}`;

                            const cachedPage = pagesCache[cacheKey];

                            if (cachedPage) {

                                // A arte entra no grupo; quem multiplica é o grupo inteiro
                                gctx.drawImage(cachedPage, offH - dw / 2, offV - dh / 2, dw, dh);

                            } else {

                                if (!pagesRendering[cacheKey]) {

                                    pagesRendering[cacheKey] = true;

                                    (async () => {

                                        try {

                                            const page = await activePdfDoc.getPage(pageNum);

                                            const vp = page.getViewport({ scale: 1.5 });

                                            const off = document.createElement('canvas');

                                            off.width = vp.width;

                                            off.height = vp.height;

                                            const octx = off.getContext('2d');

                                            octx.fillStyle = '#ffffff';

                                            octx.fillRect(0, 0, off.width, off.height);

                                            await page.render({ canvasContext: octx, viewport: vp }).promise;

                                            

                                            pagesCache[cacheKey] = off;
                                            limitarCachePaginas(activePdfDoc);

                                            drawPedPreview(); // Redesenhar o preview principal

                                        } catch (err) {

                                            console.error(`Erro ao renderizar pág. ${pageNum}:`, err);

                                        } finally {

                                            delete pagesRendering[cacheKey];

                                        }

                                    })();

                                }

                                

                                // Placeholder enquanto carrega a página

                                ctx.fillStyle = '#f1f5f9';

                                ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                                ctx.strokeStyle = '#cbd5e1';

                                ctx.lineWidth = 0.5;

                                ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                                ctx.fillStyle = '#94a3b8';

                                ctx.font = `${Math.max(6, Math.round(ch * 0.08))}px Inter`;

                                ctx.textAlign = 'center';

                                ctx.textBaseline = 'middle';

                                ctx.fillText(`Carregando Pág. ${pageNum}...`, offH, offV);

                            }

                        } else {

                            // Página excedente ou sem verso, desenha vazio

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                            ctx.strokeStyle = '#cbd5e1';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                        }

                    } else if (activeImage) {

                        if (isBack) {

                            // Imagem única não tem verso de arte

                            ctx.fillStyle = '#ffffff';

                            ctx.fillRect(offH - dw / 2, offV - dh / 2, dw, dh);

                            ctx.strokeStyle = '#cbd5e1';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(offH - dw / 2, offV - dh / 2, dw, dh);

                        } else {
                            // A arte entra no grupo; quem multiplica é o grupo inteiro
                            gctx.drawImage(activeImage, 0, 0, activeImage.width, activeImage.height, offH - dw / 2, offV - dh / 2, dw, dh);
                        }

                    }

                }

            } else {

                ctx.fillStyle = '#f8fafc';

                ctx.fillRect(-cw / 2, -ch / 2, cw, ch);

                ctx.strokeStyle = '#e2e8f0';

                ctx.setLineDash([3, 3]);

                ctx.strokeRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4);

                ctx.setLineDash([]);



                ctx.fillStyle = '#94a3b8';

                ctx.font = `${Math.max(7, Math.round(ch * 0.12))}px Inter`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'middle';

                ctx.fillText(`Posição ${P + 1}`, 0, 0);

            }



            // Desenhar Nome da Arte (Multi-Artes)
            
            if (previewPart === 'capa' || previewPart === 'contracapa') {
                // Capa/contracapa não recebe numeração: o grupo já está fechado aqui, e o
                // texto de bloco abaixo é anotação da folha, desenhado por cima dele.
                fecharGrupo();
                if (previewPart === 'capa' && !isBack) {
                    const color = fmt.cover_font_color || '#000000';
                    const fsPdf = parseInt(fmt.cover_font_size) || 12;
                    const xPdf = parseFloat(fmt.cover_font_x) || 10;
                    const yPdf = parseFloat(fmt.cover_font_y) || 10;
                    
                    ctx.fillStyle = color;
                    ctx.font = `bold ${fsPdf * scale}px Helvetica, sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.textAlign = 'left';
                    
                    // Obter bloco e ticket_qtd do modelo ativo nesta pose
                    const item_bloco = (multiArteItem && multiArteItem.bloco) ? parseInt(multiArteItem.bloco) : null;
                    
                    const sheetsInput = document.getElementById('ped-sheets-per-block');
                    const sheetsPerBlock = item_bloco || ((sheetsInput && sheetsInput.value) 
                        ? parseInt(sheetsInput.value) 
                        : (parseInt(fmt.default_sheets_per_block) || 50));
                        
                    let item_ticket_qtd = 1;
                    if (multiArteItem) {
                        if (multiArteItem.num1_id) {
                            const itemNum = state.numeracoes.find(n => String(n.id) === String(multiArteItem.num1_id));
                            if (itemNum && itemNum.tipo === "TICKET") {
                                item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                            }
                        }
                    } else {
                        item_ticket_qtd = ticket_qtd;
                    }

                    const local_idx = (typeof item_local_index !== 'undefined') ? item_local_index : item_index;
                    const cell_stack_size = sheetsPerBlock;
                    const bloco_num = Math.floor(local_idx / cell_stack_size) + 1;

                    const textX = -cw/2 + (xPdf * MM2PT * scale);
                    const textY = -ch/2 + (yPdf * MM2PT * scale);

                    function _isCamaroteLocal(n) {
                        if (!n) return false;
                        if (n.tipo === 'CAMAROTE' || n.type === 'CAMAROTE') return true;
                        if (n.svg_content && String(n.svg_content).includes('CAMAROTE')) return true;
                        if (Array.isArray(n.elements) && n.elements.some(e => e && String(e.type || '').startsWith('CAMAROTE_'))) return true;
                        return false;
                    }

                    let isNumCamarote = _isCamaroteLocal(num);
                    let activeOSItemObj = null;
                    if (activeItem) {
                        const _itens = state.osItens[activeItem.osId] || [];
                        activeOSItemObj = _itens.find(i => String(i.id) === String(activeItem.itemId));
                    }
                    if (!isNumCamarote) {
                        if (multiArteItem && multiArteItem.num1_id) {
                            const itemNum = (state.numeracoes || []).find(n => String(n.id) === String(multiArteItem.num1_id));
                            if (_isCamaroteLocal(itemNum)) isNumCamarote = true;
                        }
                        if (!isNumCamarote && activeOSItemObj) {
                            const nid = activeOSItemObj.amostra_num_id || activeOSItemObj.numeracao_id;
                            if (nid) {
                                const itemNum = (state.numeracoes || []).find(n => String(n.id) === String(nid));
                                if (_isCamaroteLocal(itemNum)) isNumCamarote = true;
                            }
                        }
                        if (!isNumCamarote) {
                            const checkObj = multiArteItem || activeOSItemObj;
                            if (checkObj) {
                                const tipoStr = String(checkObj.tipo_numeracao || checkObj.numeracao || checkObj.gabarito_operacional || '').toUpperCase();
                                if (tipoStr === 'CAMAROTE' || tipoStr.includes('CAMAROTE')) isNumCamarote = true;
                            }
                        }
                    }

                    if (isNumCamarote) {
                        let cIni = 1, lCam = 1;
                        const targetObj = multiArteItem || activeOSItemObj;
                        if (targetObj) {
                            cIni = parseInt(targetObj.c_ini || targetObj.C_INI) || 1;
                            lCam = parseInt(targetObj.l_cam || targetObj.L_CAM) || 1;
                        }
                        if (cIni <= 1) cIni = parseInt(document.getElementById('ped-c-ini')?.value) || 1;
                        if (lCam <= 1) lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;

                        const camaroteNum = String(cIni + (bloco_num - 1)).padStart(2, '0');
                        const wCamarote = ctx.measureText(`Camarote ${camaroteNum}`).width;

                        ctx.fillText(`Camarote ${camaroteNum}`, textX, textY);
                        ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                        ctx.fillText(` - de 1 a ${lCam}`, textX + wCamarote, textY);
                    } else {
                        const blocoNum = String(bloco_num).padStart(2, '0');
                        const wBloco = ctx.measureText(`Bloco ${blocoNum}`).width;
                        
                        ctx.fillText(`Bloco ${blocoNum}`, textX, textY);
                        ctx.font = `normal ${fsPdf * scale}px Helvetica, sans-serif`;
                        
                        const seqStartInput = document.getElementById('ped-start');
                        const seqStart = multiArteItem ? multiArteItem.start : ((seqStartInput && seqStartInput.value) ? parseInt(seqStartInput.value) : 1);
                        
                        const start_idx = (bloco_num - 1) * cell_stack_size;
                        const end_idx = start_idx + cell_stack_size - 1;
                        const v_start = seqStart + start_idx * item_ticket_qtd;
                        const v_end = seqStart + (end_idx + 1) * item_ticket_qtd - 1;
                        
                        const vStartStr = String(v_start).padStart(4, '0');
                        const vEndStr = String(v_end).padStart(4, '0');
                        
                        ctx.fillText(` - de ${vStartStr} a ${vEndStr}`, textX + wBloco, textY);
                    }
                }
                ctx.restore();
                continue;
            }

            if (multiArteItem && multiArteItem.nome) {
                // O nome é impresso junto com a arte, então é desenhado NO GRUPO (gctx),
                // acima da arte e sem multiply, como a numeração.
                gctx.save();
                const nomeTxt = String(multiArteItem.nome).padStart(6, '0');
                const nomeColor = multiArteItem.nome_color || '#000000';
                // Fonte: 17pt em pontos PDF, convertido para pixels do canvas
                const nomeFontSizePx = 14 * scale;
                gctx.font = `${nomeFontSizePx}px Impact, Arial, sans-serif`;
                gctx.fillStyle = nomeColor;
                gctx.textAlign = 'center';
                gctx.textBaseline = 'middle';
                // Posição X: 0mm da lateral esquerda da célula
                // Após rotação -90°, textBaseline='middle' centraliza horizontalmente,
                // então o ponto de translate é o CENTRO do texto rotacionado.
                // Para a borda esquerda do texto ficar a 0mm: center_x = -cw/2 + fontSize/2
                gctx.translate(-cw / 2 + nomeFontSizePx / 2, 0);
                gctx.rotate(-Math.PI / 2);
                // textAlign='center' centraliza o texto verticalmente (eixo X pré-rotação = eixo Y pós-rotação)
                gctx.fillText(nomeTxt, 0, 0);
                gctx.restore();
            }

            // Elementos variáveis (VDP) - Suporte a 2 numerações sobrepostas

        // O parametro `ctx` sombreia, de proposito, o contexto da folha dentro de toda
        // esta funcao: os elementos variaveis sao desenhados no GRUPO (arte + numeracao),
        // que so depois multiplica sobre a cor. Chame sempre passando gctx.
        let vdpDesenhados = 0;
        const drawVdpElements = (currentNum, source_id, ctx) => {

            if (currentNum && currentNum.elements) {

                let effectiveStart = start;
                let val_index = item_index;
                if (schema === "multi_artes" || isMultiSelected) {
                    if (multiArteItem) {
                        effectiveStart = multiArteItem.start !== undefined ? multiArteItem.start : start;
                        if (typeof item_local_index !== 'undefined') {
                            val_index = item_local_index;
                        }
                    }
                }
                const val = effectiveStart + val_index;

                let numPrintMode = currentNum.print_mode;
                if (!numPrintMode && currentNum.elements) {
                    const metaEl = currentNum.elements.find(x => x.type === 'METADATA');
                    if (metaEl) {
                        numPrintMode = metaEl.print_mode;
                    }
                }

                // O checkbox 🎨 AMOSTRA troca o que esta janela promete. Desmarcado,
                // ela reflete a impressão, e o elemento de Layout fica de fora. Marcado,
                // ela vira a peça acabada — desenha a camada base da Cor por baixo e,
                // pela mesma razão, mostra os elementos de Layout. Nada disso muda o que
                // é impresso: o checkbox é só de visualização, e o payload enviado ao
                // motor continua sem os elementos de Layout em qualquer um dos dois casos.
                const mostrarLayout = document.getElementById('ped-preview-toggle-amostra')?.checked === true;

                currentNum.elements.forEach(el => {

                    // `elementoSoLayout` vem do script.js, que a index.html carrega
                    // antes deste arquivo (mesma dependência da drawImageContain).
                    if (!mostrarLayout && typeof elementoSoLayout === 'function' && elementoSoLayout(el)) return;

                    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

                    let effectiveFace = el.face || 'both';

                    if (temVerso(printMode)) {
                        if (temVerso(numPrintMode)) {
                            effectiveFace = el.face || 'both';
                        } else {
                            effectiveFace = source_id === 1 ? 'front' : 'back';
                        }
                    }



                    // Pular elementos que não são da face ativa

                    if (isBack && effectiveFace === 'front') return;

                    if (!isBack && effectiveFace === 'back') return;

                    // Passou pelos filtros: este elemento vai mesmo ser pintado nesta pose.
                    // A contagem alimenta o aviso de pose sem numeração, no fim do desenho.
                    vdpDesenhados++;

                    // Posição do elemento relativa ao canto superior esquerdo da célula

                    const el_x = el.x_mm * MM2PT * scale;

                    const el_y = el.y_mm * MM2PT * scale;



                    // Converter para coordenadas relativas ao centro da célula (0,0)

                    const el_x_rel = el_x - cw / 2;

                    const el_y_rel = el_y - ch / 2;



                    const color = el.color || '#000000';

                    const rotation = el.rotation || 0;



                    let val_str = "";

                    if (el.fixed) {

                        val_str = el.fixed_value || "";

                    } else if (el.type === 'TEATRO_FILA') {
                        const filaVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Fila || 'A' : 'A';
                        val_str = `${el.prefix || ''}${filaVal}`;

                    } else if (el.type === 'TEATRO_LUGAR') {
                        const lugarVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Numero || '22' : '22';
                        val_str = `${el.prefix || ''}${lugarVal}`;

                    } else if (el.type === 'TEATRO_COMBO') {
                        const filaVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Fila || 'A' : 'A';
                        const lugarVal = (state.csvData && state.csvData[item_index]) ? state.csvData[item_index].Numero || '22' : '22';
                        const filaT = `${el.prefix_fila || ''}${filaVal}`;
                        const lugarT = `${el.prefix_lugar || ''}${lugarVal}`;
                        val_str = el.layout === '2lines' ? `${filaT}\n${lugarT}` : `${filaT} - ${lugarT}`;

                    } else if (el.type === 'CAMAROTE_LOCAL') {
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
                        const _cIni = parseInt(document.getElementById('ped-c-ini')?.value) || 1;
                        const _localNum = _cIni + Math.floor(item_index / _lCam);
                        val_str = `${el.prefix || ''}${_localNum}`;

                    } else if (el.type === 'CAMAROTE_PESSOA') {
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
                        val_str = `${el.prefix || ''}${(item_index % _lCam) + 1}`;

                    } else if (el.type === 'CAMAROTE_PESSOA_TOTAL') {
                        const _lCam = parseInt(document.getElementById('ped-l-cam')?.value) || 1;
                        val_str = `${el.prefix || ''}${(item_index % _lCam) + 1}/${_lCam}`;

                    } else if (el.source === 'database') {

                        if (state.csvData && state.csvData[item_index]) {

                            const colName = el.csv_column || '';

                            val_str = String(state.csvData[item_index][colName] || '');

                        } else {

                            val_str = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;

                        }

                    } else {

                        const pad = parseInt(el.pad) || 0;

                        const prefix = el.prefix || "";

                        const suffix = el.suffix || "";

                        let current_val = val;
                        if (currentNum && currentNum.tipo === "TICKET" && source_id === 1) {
                            const pos = parseInt(el.ticket_pos) || 1;
                            const N = parseInt(currentNum.ticket_qtd) || 1;
                            current_val = effectiveStart + (val_index * N) + (pos - 1);
                        } else if (currentNum && currentNum.tipo === "TICKET" && source_id === 2) {
                            const pos = parseInt(el.ticket_pos) || 1;
                            const N = parseInt(currentNum.ticket_qtd) || 1;
                            current_val = effectiveStart + (val_index * N) + (pos - 1);
                        }

                        const raw = pad > 0 ? String(current_val).padStart(pad, '0') : String(current_val);

                        val_str = `${prefix}${raw}${suffix}`;

                    }



                    ctx.save();

                    ctx.translate(el_x_rel, el_y_rel);

                    ctx.rotate(rotation * Math.PI / 180);



                    if (el.type === 'TEXT' || el.type === 'FIXED' || el.type.startsWith('TEATRO_') || el.type.startsWith('CAMAROTE_')) {

                        const fs = (el.font_size || 12) * scale;

                        ctx.font = buildCanvasFont(fs, el.font_name);

                        ctx.fillStyle = color;

                        window.desenharTextoAjustado(
                            ctx, el, val_str, fs, scale * 2.8346,
                            (f) => buildCanvasFont(f, el.font_name)
                        );

                    } else if (el.type === 'QR' || el.type === 'QR_IDEAL') {

                        // QR de VERDADE, pelo mesmo desenhador do card do pedido
                        // e do link do cliente (frontend/qr-canvas.js). Ate
                        // 14/08/2026 esta janela desenhava tres marcas de canto
                        // — uma representacao —, e o QR Ideal nem isso: ele nao
                        // caia em ramo nenhum e sumia da tela enquanto saia no
                        // papel.
                        const sz = (el.size_mm || 15) * MM2PT * scale;

                        if (el.type === 'QR_IDEAL') {
                            // O numero do ingresso segue a MESMA conta do
                            // elemento de numeracao, incluindo o caso TICKET. Se
                            // divergissem, a tela mostraria um codigo e o papel
                            // sairia outro — e so a portaria descobriria.
                            let _qiVal = val;
                            if (currentNum && currentNum.tipo === "TICKET") {
                                const _pos = parseInt(el.ticket_pos) || 1;
                                const _N = parseInt(currentNum.ticket_qtd) || 1;
                                _qiVal = effectiveStart + (val_index * _N) + (_pos - 1);
                            }

                            // O codigo sai do pool, que so existe na estacao.
                            // Fora dela `qrIdealConteudo` devolve null e o
                            // desenho vira exemplo — o mesmo que o editor faz.
                            const _os = (state.activeOSItem && state.ordens)
                                ? state.ordens.find(o => String(o.id) === String(state.activeOSItem.osId))
                                : null;
                            const _modelo = (multiArteItem && multiArteItem.modelo)
                                || (state.activeOSItem ? state.activeOSItem.itemId : null);

                            window.desenharQRIdeal(
                                ctx, el, sz, color,
                                _os ? _os.numero : null, _modelo, _qiVal
                            );
                        } else {
                            window.renderQRCodeOnCtx(ctx, val_str, 0, 0, sz, color);
                        }

                    } else if (el.type === 'BARCODE') {

                        const bw = (el.width_mm || 40) * MM2PT * scale;

                        const bh = (el.height_mm || 10) * MM2PT * scale;

                        // `val_str` ja e o valor deste item — o mesmo que o motor
                        // codifica. O rotulo com o nome da simbologia saiu junto
                        // com o padrao falso: era desenhado FORA da caixa do
                        // elemento, num lugar onde o papel nao tem nada.
                        window.renderBarcodeOnCtx(ctx, val_str, 0, 0, bw, bh, color, el.barcode_format);

                    } else if (el.type === 'FOTO') {

                        // A foto é a da LINHA daquele item, não a da primeira: é
                        // nesta janela que o operador confere, item a item, se cada
                        // credencial recebeu a pessoa certa antes de mandar imprimir.
                        //
                        // Sem este ramo a prévia desenhava o nome e o cargo e pulava
                        // a foto — a tela mentia sobre o papel justamente na peça em
                        // que a foto É o conteúdo.
                        if (typeof window.desenharElementoFoto === 'function') {

                            const _lf = (state.csvData && state.csvData[item_index]) || null;
                            if (_lf && _linhasFoto.indexOf(_lf) === -1) _linhasFoto.push(_lf);

                            // Sem repintor por elemento, de propósito. Cada foto que
                            // chegasse mandaria a prévia INTEIRA se redesenhar — e uma
                            // passada da prévia redesenha a folha toda, com a arte
                            // rasterizada e todas as poses. Com uma credencial por
                            // pessoa isso vira dezenas de redesenhos completos e a aba
                            // engasga. Quem espera as fotos é o bloco no fim da função,
                            // que carrega todas e redesenha uma vez só.
                            window.desenharElementoFoto(ctx, el, MM2PT * scale, false, _lf, null);

                        }

                    } else if (el.type === 'SVG') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const hw = sz_w / 2, hh = sz_h / 2;

                        const svgImg = currentNum && currentNum._svgImage;

                        if (svgImg) {

                            // Tamanho original, escala 100%, sem distorcao: drawImage cru
                            // esticaria o SVG para dentro da caixa e faria a tela divergir
                            // do papel, onde o engine.py usa keep_proportion=True.
                            drawArteDoElemento(ctx, svgImg, -hw, -hh, sz_w, sz_h, el);

                        } else {

                            ctx.strokeStyle = color;

                            ctx.lineWidth = 0.5 * scale;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.font = `${Math.max(5, sz_h * 0.15)}px Inter, sans-serif`;

                            ctx.fillStyle = color;

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            ctx.fillText('SVG', 0, 0);

                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';

                        }

                    } else if (el.type === 'PDF') {

                        const sz_w = (el.width_mm || 20) * MM2PT * scale;

                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const hw = sz_w / 2, hh = sz_h / 2;

                        if (el._pdfCanvas) {

                            // Mesma regra do SVG acima: proporcao preservada, sobra centralizada
                            drawArteDoElemento(ctx, el._pdfCanvas, -hw, -hh, sz_w, sz_h, el);

                        } else if (el.pdf_content && !el._pdfLoading) {

                            el._pdfLoading = true;

                            (async () => {

                                try {

                                    const pdfData = await fetchPdfBytes(el.pdf_content);

                                    if (!pdfData) throw new Error('fetchPdfBytes retornou null');

                                    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                                    const page = await pdf.getPage(1);

                                    const vp = page.getViewport({ scale: 2 });

                                    const offCanvas = document.createElement('canvas');

                                    offCanvas.width = Math.round(vp.width);

                                    offCanvas.height = Math.round(vp.height);

                                    const octx = offCanvas.getContext('2d');

                                    await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;

                                    el._pdfCanvas = offCanvas;

                                    delete el._pdfLoading;

                                    drawPedPreview();

                                } catch (errPdf) {

                                    console.error('[Preview] Erro ao renderizar PDF do elemento VDP:', errPdf);

                                    delete el._pdfLoading;

                                }

                            })();

                            // Placeholder enquanto carrega

                            ctx.fillStyle = '#f1f5f9';

                            ctx.fillRect(-hw, -hh, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.fillStyle = '#64748b';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('PDF...', 0, 0);

                            ctx.textAlign = 'left';

                            ctx.textBaseline = 'alphabetic';

                        } else if (!el.pdf_content) {

                            ctx.fillStyle = '#f8fafc';

                            ctx.fillRect(-hw, -hh, sz_w, sz_h);

                            ctx.strokeStyle = '#94a3b8';

                            ctx.lineWidth = 0.5;

                            ctx.strokeRect(-hw, -hh, sz_w, sz_h);

                            ctx.fillStyle = '#94a3b8';

                            ctx.font = `${Math.max(5, sz_h * 0.18)}px Inter, sans-serif`;

                            ctx.textAlign = 'center';

                            ctx.textBaseline = 'middle';

                            ctx.fillText('PDF', 0, 0);

                            ctx.textAlign = 'left';

                            ctx.textBaseline = 'alphabetic';

                        }

                    }

                    ctx.restore();

                });

            }

        };

        // Para multi_artes ou imposição combinada, usar a numeração específica de cada arte se disponível
        const artNum1 = multiArteItem ? (multiArteItem.numeracao || state.numeracoes.find(n => String(n.id) === String(multiArteItem.num1_id))) : null;
        const artNum2 = multiArteItem ? (multiArteItem.numeracao_2 || state.numeracoes.find(n => String(n.id) === String(multiArteItem.num2_id))) : null;
        if (multiArteItem) {
            drawVdpElements(artNum1, 1, gctx);
            drawVdpElements(artNum2, 2, gctx);
        } else {
            drawVdpElements(num, 1, gctx);
            drawVdpElements(num2, 2, gctx);
        }

        // Registro de quantos elementos de numeração esta pose de fato pintou. Serve ao
        // aviso no fim do desenho: uma pose sem numeração no meio de poses com numeração
        // é um defeito que passa despercebido na tela e só aparece no papel.
        posesDesenhadas.push({
            pose: P + 1,
            item_index,
            pagina: (schema === 'pdf_multiple')
                ? (state.printMode === 'duplex' ? item_index * 2 + 1 : item_index + 1)
                : null,
            // A frente do FxVersoUnico anda 1 a 1, e por isso cai no ramo de
            // cima junto com o simplex — o `=== 'duplex'` aqui é a pergunta
            // "como pagina?", que só o FxVerso clássico responde aos pares.
            elementos: vdpDesenhados,
        });

        // Arte + nome + numeração prontos: o grupo multiplica de uma vez só sobre a cor
        fecharGrupo();

        // ─── RÓTULO DA PÁGINA (só em Pdf Paginado) ─────────────────────────────
        // Oito poses de páginas diferentes são visualmente iguais a oito cópias da
        // mesma página. Sem dizer qual página caiu em cada pose, o operador não tem
        // como perceber que a paginação deixou de funcionar.
        //
        // É anotação de tela, não tinta: desenhada DEPOIS de fecharGrupo(), fora do
        // grupo arte+numeração, para não multiplicar sobre a cor nem entrar no PDF.
        if (schema === 'pdf_multiple') {
            const totalPaginas = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 0;
            const pFrente = state.printMode === 'duplex' ? (item_index * 2 + 1) : (item_index + 1);
            let rotulo;
            if (totalPaginas && pFrente > totalPaginas) {
                // O engine recua para a primeira página quando a página pedida não existe
                rotulo = 'p. 1 (repetida)';
            } else if (versoUnico(state.printMode)) {
                // O `V` diz que aquele verso é o mesmo em todas as células — sem
                // ele, oito versos idênticos parecem uma paginação quebrada.
                rotulo = state.pedArtVersoPdfDoc ? `p. ${pFrente} / V` : `p. ${pFrente} (sem verso)`;
            } else if (state.printMode === 'duplex') {
                const pVerso = pFrente + 1;
                rotulo = (totalPaginas && pVerso > totalPaginas) ? `p. ${pFrente}` : `p. ${pFrente} / ${pVerso}`;
            } else {
                rotulo = `p. ${pFrente}`;
            }

            ctx.save();
            // Um terço do tamanho original (0.13): o rótulo é referência de conferência,
            // não conteúdo da folha, e competia visualmente com a arte.
            const fs = Math.max(5, Math.round(ch * 0.043));
            ctx.font = `600 ${fs}px Inter, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const px = -cw / 2 + fs * 0.4;
            const py = -ch / 2 + fs * 0.4;
            // Halo claro para o rótulo sobreviver a arte escura
            ctx.lineWidth = Math.max(2, fs * 0.28);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.strokeText(rotulo, px, py);
            ctx.fillStyle = '#0284c7';
            ctx.fillText(rotulo, px, py);
            ctx.restore();
        }

        // ─── QUAL ITEM DO MODELO CAIU AQUI (FOLHA COMPACTADA) ──────────────────
        // Na folha compactada o item mudou de lugar: o 22º ticket do modelo pode
        // cair na primeira célula. Sem dizer qual é, o operador não tem como
        // conferir que pediu os itens certos.
        //
        // Anotação de tela, como o rótulo de página acima: desenhada depois de
        // fecharGrupo(), fora do grupo arte+numeração, para não multiplicar sobre
        // a cor nem entrar no PDF.
        if (origemDaCelula) {
            ctx.save();
            const fsOrig = Math.max(6, Math.round(ch * 0.055));
            ctx.font = `700 ${fsOrig}px Inter, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            const rotulo = `#${origemDaCelula.posicao}`;
            const ox = -cw / 2 + fsOrig * 0.4;
            const oy = ch / 2 - fsOrig * 0.4;
            ctx.lineWidth = Math.max(2, fsOrig * 0.32);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.strokeText(rotulo, ox, oy);
            ctx.fillStyle = '#059669';
            ctx.fillText(rotulo, ox, oy);
            ctx.restore();
        }

            ctx.restore();

        }

    }



    // ─── AVISO: pose sem numeração no meio de poses com numeração ──────────────
    // Uma pose que não pinta nenhum elemento enquanto as vizinhas pintam é sempre
    // defeito — o gabarito vale para a folha inteira. Na tela isso passa batido; no
    // papel, custa tiragem. Aqui o desenho denuncia a si mesmo, com os dados que
    // permitem entender o caso sem precisar reproduzi-lo.
    const comNumeracao = posesDesenhadas.filter(p => p.elementos > 0);
    const semNumeracao = posesDesenhadas.filter(p => p.elementos === 0);
    if (comNumeracao.length && semNumeracao.length) {
        console.warn(
            '[Prévia] Numeração não desenhada em ' + semNumeracao.length + ' de '
            + posesDesenhadas.length + ' poses desta folha.',
            {
                poses_sem_numeracao: semNumeracao,
                poses_com_numeracao: comNumeracao,
                regra: schema,
                folha: window.currentPreviewPage || 1,
                face: isBack ? 'verso' : 'frente',
                numeracao_id: numId || null,
                elementos_no_gabarito: (num && num.elements) ? num.elements.length : 0,
            }
        );
    }

    // ─── Fotos: carregar o lote da folha e repintar UMA vez ────────────────────
    //
    // Só as linhas DESTA folha: com 88 pessoas, pedir as 88 fotos para mostrar as
    // 21 que cabem na folha é rede paga à toa.
    //
    // `fotosPendentes` é o que fecha o laço: sem ele, o repinte pediria as fotos
    // de novo, elas resolveriam na hora (já em cache) e mandariam repintar outra
    // vez, para sempre.
    if (_linhasFoto.length && typeof window.fotosPendentes === 'function') {

        const _elsFoto = [];

        [num, num2].forEach(n => {
            if (n && Array.isArray(n.elements)) _elsFoto.push(...n.elements);
        });

        if (_elsFoto.some(e => e && e.type === 'FOTO')
            && window.fotosPendentes(_elsFoto, _linhasFoto).length) {

            window.precarregarFotosDosElementos(_elsFoto, _linhasFoto)
                .then(() => drawPedPreview())
                .catch(() => { });

        }

    }

    // Borda da folha

    ctx.strokeStyle = '#1e293b';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(0, 0, canvas.width, canvas.height);

}
window.drawPedPreview = drawPedPreview;

window.setPedPreviewFace = function (face) {
    state.previewFace = face;
    const btnFront = document.getElementById('ped-btn-preview-front');
    const btnBack = document.getElementById('ped-btn-preview-back');
    if (face === 'front') {
        if (btnFront) {
            btnFront.style.background = 'var(--blue)';
            btnFront.style.color = 'white';
        }
        if (btnBack) {
            btnBack.style.background = 'rgba(255,255,255,0.06)';
            btnBack.style.color = 'var(--text-dim)';
        }
    } else {
        if (btnFront) {
            btnFront.style.background = 'rgba(255,255,255,0.06)';
            btnFront.style.color = 'var(--text-dim)';
        }
        if (btnBack) {
            btnBack.style.background = 'var(--blue)';
            btnBack.style.color = 'white';
        }
    }
    drawPedPreview();
};

window.changePedPreviewPage = function() {
    const input = document.getElementById('ped-preview-page-input');
    if (!input) return;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) val = 1;
    window.currentPreviewPage = val;
    drawPedPreview();
};

window.prevPedPreviewPage = function() {
    if ((window.currentPreviewPage || 1) > 1) {
        window.currentPreviewPage = (window.currentPreviewPage || 1) - 1;
        const input = document.getElementById('ped-preview-page-input');
        if (input) input.value = window.currentPreviewPage;
        drawPedPreview();
    }
};

window.nextPedPreviewPage = function() {
    window.currentPreviewPage = (window.currentPreviewPage || 1) + 1;
    const input = document.getElementById('ped-preview-page-input');
    if (input) input.value = window.currentPreviewPage;
    drawPedPreview();
};

// ═══════════════════════════════════════════════════════════════════════════
//  REFAZER FOLHAS / REFAZER CÉLULA
// ═══════════════════════════════════════════════════════════════════════════
// Refazer é o que o operador usa quando a tiragem já saiu e uma parte dela se
// perdeu — folha amassada, ticket borrado. A numeração nunca se desloca: o item
// leva o número que sempre teve, e só a posição na folha muda.
//
// São DOIS MODOS, e eles não se combinam — marcar um desmarca o outro:
//
//  · REFAZER FOLHAS — De/Até contam folhas DENTRO DO SET escolhido, não folhas
//    do trabalho todo. Reimprime as folhas inteiras, iguais às originais.
//
//  · REFAZER CÉLULA — a lista é de POSIÇÕES NO MODELO, 1-based: o 1º, o 6º, o
//    22º ticket do trabalho. NÃO é a pose da folha; pedir "22" num formato de
//    dez células é legítimo e quer dizer o vigésimo segundo ticket. Os itens
//    pedidos são compactados numa folha só, na ordem digitada.
//
// Combinar os dois não faz sentido: as posições já são absolutas no modelo, e
// uma faixa de folhas só poderia contradizê-las.

function refazerFolhasAtivo() {
    return document.getElementById('ped-refazer-checkbox')?.checked === true;
}

function refazerCelulasAtivo() {
    return document.getElementById('ped-refazer-cel-checkbox')?.checked === true;
}

// Aceita "1,3,5", "1 3 5" e faixas "1-4". Devolve a lista **na ordem digitada**,
// sem repetição, mais o que não deu para entender — o campo é digitado às pressas,
// na frente da impressora, e um "1,,3" não pode virar erro.
//
// A ordem é digitada, NÃO crescente. Ordenar parecia inofensivo e não é: os
// itens ocupam a folha na ordem da lista, então digitar "7" e depois "7,3"
// fazia o 7 saltar da primeira posição para a segunda diante do operador. O
// `Set` do JavaScript preserva a ordem de inserção, e é dele que vem a garantia.
//
// O teto é a QUANTIDADE DO MODELO (`pedRefazerTotalCelulas`), não as poses da
// folha: os números são posições no modelo, e "22" num formato de dez células é
// um pedido válido.
function parseRefazerCelulas(texto) {
    const cels = new Set();
    const invalidos = [];
    const total = window.pedRefazerTotalCelulas || 0;

    for (const bruto of String(texto || '').split(/[,;\s]+/)) {
        const parte = bruto.trim();
        if (!parte) continue;

        const faixa = parte.match(/^(\d+)\s*-\s*(\d+)$/);
        if (faixa) {
            const ini = parseInt(faixa[1]);
            const fim = parseInt(faixa[2]);
            if (ini >= 1 && fim >= ini && (!total || fim <= total)) {
                for (let c = ini; c <= fim; c++) cels.add(c);
            } else {
                invalidos.push(parte);
            }
            continue;
        }

        const n = parseInt(parte);
        if (!isNaN(n) && String(n) === parte && n >= 1 && (!total || n <= total)) {
            cels.add(n);
        } else {
            invalidos.push(parte);
        }
    }

    return { cels: Array.from(cels), invalidos };
}

// null = a folha da tiragem, inteira. Lista = a folha compactada com esses itens
// — e a lista VAZIA é um estado legítimo, não "sem filtro": marcar o checkbox
// esvazia a folha na hora, e cada posição digitada vai aparecendo. É o que deixa
// o operador montar a folha vendo o que está montando, em vez de digitar às
// cegas e conferir depois.
function getRefazerCelulasSelecionadas() {
    if (!refazerCelulasAtivo()) return null;
    const { cels } = parseRefazerCelulas(document.getElementById('ped-refazer-cel')?.value);
    return cels;
}
window.getRefazerCelulasSelecionadas = getRefazerCelulasSelecionadas;

// Chamado de dentro de drawPedPreview(): põe nos campos os limites reais desta
// imposição — quantas folhas tem o set e quantos itens tem o modelo.
function sincronizarLimitesRefazer() {
    const totalFolhas = window.pedRefazerTotalFolhas || 0;
    const totalCelulas = window.pedRefazerTotalCelulas || 0;

    for (const id of ['ped-refazer-de', 'ped-refazer-ate']) {
        const el = document.getElementById(id);
        if (el && totalFolhas > 0) el.max = totalFolhas;
    }

    const infoFolhas = document.getElementById('ped-refazer-total');
    if (infoFolhas) infoFolhas.textContent = totalFolhas ? `de ${totalFolhas} folhas` : '';

    const infoCels = document.getElementById('ped-refazer-cel-info');
    if (infoCels) {
        if (!refazerCelulasAtivo()) {
            infoCels.textContent = totalCelulas ? `1 a ${totalCelulas}` : '';
            infoCels.style.color = 'var(--text-muted)';
        } else {
            const { cels, invalidos } = parseRefazerCelulas(document.getElementById('ped-refazer-cel')?.value);
            if (invalidos.length) {
                infoCels.textContent = `inválido: ${invalidos.join(', ')} (1 a ${totalCelulas})`;
                infoCels.style.color = '#f87171';
            } else if (cels.length) {
                infoCels.textContent = `${cels.length} de ${totalCelulas} itens`;
                infoCels.style.color = '#34d399';
            } else {
                infoCels.textContent = totalCelulas ? `1 a ${totalCelulas}` : '';
                infoCels.style.color = 'var(--text-muted)';
            }
        }
    }
}
window.sincronizarLimitesRefazer = sincronizarLimitesRefazer;

// Leva a prévia para a folha digitada em "De:", no set escolhido. É o que
// transforma o campo em conferência: o operador digita 7 e vê a folha 7 antes
// de mandar refazer.
function irParaFolhaRefazer() {
    const de = parseInt(document.getElementById('ped-refazer-de')?.value);
    if (isNaN(de) || de < 1) return;

    const setRefazer = document.getElementById('ped-refazer-set');
    const setPreview = document.getElementById('ped-preview-set-input');
    if (setRefazer && setPreview && setRefazer.style.display !== 'none') {
        setPreview.value = setRefazer.value;
    }

    const total = window.pedRefazerTotalFolhas || 0;
    window.currentPreviewPage = (total && de > total) ? total : de;

    const pageInput = document.getElementById('ped-preview-page-input');
    if (pageInput) pageInput.value = window.currentPreviewPage;

    drawPedPreview();
}

function irParaPrimeiraFolhaDaPrevia() {
    window.currentPreviewPage = 1;
    const pageInput = document.getElementById('ped-preview-page-input');
    if (pageInput) pageInput.value = 1;
    drawPedPreview();
}

// `origem` diz qual checkbox o operador acabou de mexer, para que o OUTRO possa
// ser desmarcado. Os dois modos são excludentes: "Refazer Folhas" reimprime
// folhas inteiras da tiragem e "Refazer Célula" monta uma folha nova com itens
// escolhidos pela posição no modelo. Deixar os dois ligados só produziria um
// pedido contraditório — uma faixa de folhas não filtra posições absolutas.
window.onRefazerToggle = function(origem) {
    const cbFolhas = document.getElementById('ped-refazer-checkbox');
    const cbCels = document.getElementById('ped-refazer-cel-checkbox');
    if (origem === 'folhas' && cbFolhas?.checked && cbCels) cbCels.checked = false;
    if (origem === 'celulas' && cbCels?.checked && cbFolhas) cbFolhas.checked = false;

    const marcadoFolhas = refazerFolhasAtivo();
    const marcadoCels = refazerCelulasAtivo();

    const boxFolhas = document.getElementById('ped-refazer-inputs');
    if (boxFolhas) boxFolhas.style.display = marcadoFolhas ? 'flex' : 'none';

    const boxCels = document.getElementById('ped-refazer-cel-inputs');
    if (boxCels) boxCels.style.display = marcadoCels ? 'flex' : 'none';

    // O aviso pertence aos dois modos: aparece se qualquer um estiver ligado.
    // Ele substituiu o par de botoes que morava aqui — hoje existe UM par de
    // Gerar PDF / Imprimir na janela, no grupo de cima, e com o Refazer ligado
    // ele vale para a faixa escolhida. O aviso e' o que diz isso ao operador,
    // dos dois lados: aqui, e junto dos proprios botoes.
    const ligado = marcadoFolhas || marcadoCels;
    const acoes = document.getElementById('ped-refazer-acoes');
    if (acoes) acoes.style.display = ligado ? 'block' : 'none';
    const avisoNoPar = document.getElementById('ped-aviso-refazer');
    if (avisoNoPar) avisoNoPar.style.display = ligado ? 'block' : 'none';

    // Ligar o Refazer devolve o botao Imprimir a um modelo ja IMPRESSO: e' o
    // unico momento em que reimprimir uma faixa faz sentido.
    if (typeof updatePedImprimirButtonsVisibility === 'function') updatePedImprimirButtonsVisibility();

    // Ligar ou desligar as células troca o que a prévia é (folha da tiragem x
    // folha compactada), então a contagem de páginas muda embaixo do operador.
    if (marcadoCels) irParaPrimeiraFolhaDaPrevia();
    else if (marcadoFolhas) irParaFolhaRefazer();
    else drawPedPreview();
};

window.onRefazerFolhaChange = function() {
    irParaFolhaRefazer();
};

window.onRefazerCelulaChange = function() {
    // Mudar as células muda quantas folhas compactadas existem; ficar na página 3
    // de uma saída que agora tem uma só confunde mais do que ajuda.
    irParaPrimeiraFolhaDaPrevia();
};

// Trocar de modelo tem de zerar a caixa: uma faixa de folhas do pedido anterior
// não quer dizer nada no pedido seguinte, e deixá-la marcada é convite a refazer
// a coisa errada.
function resetRefazerControls() {
    for (const id of ['ped-refazer-checkbox', 'ped-refazer-cel-checkbox']) {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    }
    for (const id of ['ped-refazer-de', 'ped-refazer-ate', 'ped-refazer-cel']) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    }
    if (typeof window.onRefazerToggle === 'function') window.onRefazerToggle();
}
window.resetRefazerControls = resetRefazerControls;

// Traduz a caixa para o que vai no payload — e recusa o que geraria um PDF
// vazio. Devolver {erro} em vez de mandar mesmo assim é o ponto central da
// correção: antes, uma faixa invertida ou fora do total produzia zero folhas e a
// tela ainda dizia "concluído e arquivos salvos".
function montarRefazerPayload(isRefazer) {
    const vazio = { refazer_de: 0, refazer_ate: 0, refazer_set: 1, refazer_celulas: [], sufixo: '' };
    if (!isRefazer) return vazio;

    const usaCels = refazerCelulasAtivo();
    // Modos excludentes (ver onRefazerToggle): com células, a faixa de folhas não
    // participa — as posições já são absolutas no modelo.
    const usaFolhas = !usaCels && refazerFolhasAtivo();
    if (!usaFolhas && !usaCels) {
        return { erro: 'Marque "Refazer Folhas" ou "Refazer Célula" antes de refazer.' };
    }

    const resultado = { ...vazio };
    const partes = [];

    if (usaFolhas) {
        const totalFolhas = window.pedRefazerTotalFolhas || 0;
        const deRaw = document.getElementById('ped-refazer-de')?.value;
        const ateRaw = document.getElementById('ped-refazer-ate')?.value;
        const de = parseInt(deRaw);
        const ate = parseInt(ateRaw);

        if (isNaN(de) || de < 1) {
            // O caso clássico: só "Até" preenchido. Antes disso passar, o motor
            // lia refazer_de = 0, desligava o filtro e refazia o trabalho inteiro.
            return { erro: 'Refazer Folhas: preencha "De:" com a primeira folha da faixa.' };
        }
        const ateFinal = (isNaN(ate) || ate < 1) ? de : ate;
        if (ateFinal < de) {
            return { erro: `Refazer Folhas: "Até" (${ateFinal}) é menor que "De" (${de}).` };
        }
        if (totalFolhas && de > totalFolhas) {
            return { erro: `Refazer Folhas: a folha ${de} não existe — este set tem ${totalFolhas} folha(s).` };
        }
        if (totalFolhas && ateFinal > totalFolhas) {
            return { erro: `Refazer Folhas: a folha ${ateFinal} não existe — este set tem ${totalFolhas} folha(s).` };
        }

        const setEl = document.getElementById('ped-refazer-set');
        const set = (setEl && setEl.style.display !== 'none') ? (parseInt(setEl.value) || 1) : 1;

        resultado.refazer_de = de;
        resultado.refazer_ate = ateFinal;
        resultado.refazer_set = set;
        partes.push(de === ateFinal ? `folha${de}` : `folhas${de}-${ateFinal}`);
        if (set > 1) partes.unshift(`set${set}`);
    }

    if (usaCels) {
        const { cels, invalidos } = parseRefazerCelulas(document.getElementById('ped-refazer-cel')?.value);
        if (invalidos.length) {
            return { erro: `Refazer Célula: não entendi "${invalidos.join(', ')}". Use as posições do item no modelo, de 1 a ${window.pedRefazerTotalCelulas || '?'}, separadas por vírgula.` };
        }
        if (!cels.length) {
            return { erro: 'Refazer Célula: informe as posições, separadas por vírgula (ex: 1,6,22).' };
        }
        resultado.refazer_celulas = cels;
        // No máximo seis no nome do arquivo: uma reposição de trinta itens viraria
        // um nome que o Windows recusa.
        const resumo = cels.length > 6 ? `${cels.slice(0, 6).join('-')}-mais${cels.length - 6}` : cels.join('-');
        partes.push(`itens${resumo}`);
    }

    // O sufixo entra no nome do arquivo. Sem ele, refazer 3 folhas gravava por
    // cima do PDF do trabalho inteiro, com o mesmo nome, na mesma pasta.
    resultado.sufixo = partes.length ? `_refazer_${partes.join('_')}` : '';
    return resultado;
}
window.montarRefazerPayload = montarRefazerPayload;

function onPedNumeracaoSelect() {
    const numId = document.getElementById('ped-numeracao')?.value;
    if (numId && window.state && window.state.numeracoes) {
        const num = window.state.numeracoes.find(n => String(n.id) === String(numId));
        if (num && num.print_mode) {
            const printModeSelect = document.getElementById('ped-print-mode');
            if (printModeSelect) {
                printModeSelect.value = num.print_mode;
            }
        }
    }
    updatePedSummary();
}

function updatePedSummary() {

    const fmtSelect = document.getElementById('ped-formato');

    const numSelect = document.getElementById('ped-numeracao');

    const numSelect2 = document.getElementById('ped-numeracao-2');



    const printMode = document.getElementById('ped-print-mode')?.value || 'front';

    const lblNum1Text = document.getElementById('lbl-ped-num-1-text');

    const lblNum2Text = document.getElementById('lbl-ped-num-2-text');

    if (lblNum1Text && lblNum2Text) {

        if (temVerso(printMode)) {

            lblNum1Text.innerHTML = '2. Numeração <b style="color:var(--blue)">FRENTE</b> (opcional)';

            lblNum2Text.innerHTML = '3. Numeração <b style="color:var(--blue)">VERSO</b> (opcional)';

        } else {

            lblNum1Text.innerHTML = '2. Numeração 1 (opcional)';

            lblNum2Text.innerHTML = '3. Numeração 2 (opcional)';

        }

    }



    if (document.getElementById('ped-schema')?.value === 'multi_artes') {

        
        renderMultiArtes();

    }



    const lastFmtId = numSelect.getAttribute('data-last-fmt') || '';

    const currentFmtId = fmtSelect ? fmtSelect.value : '';



    if (currentFmtId !== lastFmtId) {

        const curNumVal = numSelect.value;

        const curNumVal2 = numSelect2 ? numSelect2.value : '';

        const filteredNums = currentFmtId ? state.numeracoes.filter(n => {
            const ids = n.formato_ids || [n.formato_id];
            return ids.some(id => String(id) === String(currentFmtId));
        }) : state.numeracoes;

        

        const optionsHtml = '<option value="">-- Sem numeração --</option>' + 

            filteredNums.map(n => `<option value="${n.id}">${n.name}</option>`).join('');



        numSelect.innerHTML = optionsHtml;

        if (filteredNums.some(n => String(n.id) === String(curNumVal))) {

            numSelect.value = curNumVal;

        } else {

            numSelect.value = "";

        }

        numSelect.setAttribute('data-last-fmt', currentFmtId);



        if (numSelect2) {

            numSelect2.innerHTML = optionsHtml;

            if (filteredNums.some(n => String(n.id) === String(curNumVal2))) {

                numSelect2.value = curNumVal2;

            } else {

                numSelect2.value = "";

            }

        }

    }



    const fmtId = document.getElementById('ped-formato').value;

    const numId = document.getElementById('ped-numeracao').value;

    const saiId = document.getElementById('ped-saida').value;

    const start = parseInt(document.getElementById('ped-start').value) || 1;

    const end = parseInt(document.getElementById('ped-end').value) || 100;

    const box = document.getElementById('ped-summary');



    const num = state.numeracoes.find(n => String(n.id) === String(numId)) || null;

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;

    // Mostrar/esconder painel CAMAROTE conforme tipo da numeração
    const camarotePanel = document.getElementById('ped-camarote-panel');
    const isCamarote = num && (num.tipo === 'CAMAROTE' || num.type === 'CAMAROTE');
    if (camarotePanel) camarotePanel.style.display = isCamarote ? 'block' : 'none';

    if (num && num.svg_content && !num._svgImage) {

        const img = new Image();

        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(num.svg_content);

        img.onload = () => {

            num._svgImage = img;

            drawPedPreview();

        };

    }

    // Pré-carregar canvas de cada elemento PDF da numeração selecionada

    function preloadNumPdfElements(numeracao) {

        if (!numeracao || !numeracao.elements) return;

        numeracao.elements.forEach(el => {

            if (el.type === 'PDF' && el.pdf_content && !el._pdfCanvas && !el._pdfLoading) {

                el._pdfLoading = true;

                (async () => {

                    try {

                        const pdfData = await fetchPdfBytes(el.pdf_content);

                        if (!pdfData) throw new Error('fetchPdfBytes retornou null');

                        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                        const page = await pdf.getPage(1);

                        const vp = page.getViewport({ scale: 2 });

                        const offCanvas = document.createElement('canvas');

                        offCanvas.width = Math.round(vp.width);

                        offCanvas.height = Math.round(vp.height);

                        const octx = offCanvas.getContext('2d');

                        await page.render({ canvasContext: octx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;

                        el._pdfCanvas = offCanvas;

                        delete el._pdfLoading;

                        drawPedPreview();

                    } catch (err) {

                        console.error('[Preview] Erro pré-carregando PDF do elemento:', err);

                        delete el._pdfLoading;

                    }

                })();

            }

        });

    }

    preloadNumPdfElements(num);

    preloadNumPdfElements(num2);

    const schema = document.getElementById('ped-schema').value;

    const isPdfMultiple = (schema === "pdf_multiple");



    // Atualizar modo de impressão no estado global

    const printModeEl = document.getElementById('ped-print-mode');

    state.printMode = printModeEl ? printModeEl.value : 'front';

    

    // Exibir/ocultar alternador de face para o preview

    const faceContainer = document.getElementById('ped-preview-face-container');

    if (faceContainer) {

        if (temVerso(state.printMode)) {

            faceContainer.style.display = 'flex';

        } else {

            faceContainer.style.display = 'none';

            state.previewFace = 'front';

            const btnFront = document.getElementById('ped-btn-preview-front');

            const btnBack = document.getElementById('ped-btn-preview-back');

            if (btnFront) {

                btnFront.style.background = 'var(--blue)';

                btnFront.style.color = 'white';

            }

            if (btnBack) {

                btnBack.style.background = 'rgba(255,255,255,0.06)';

                btnBack.style.color = 'var(--text-dim)';

            }

        }

    }



    if (isPdfMultiple) {

        const ms = document.getElementById('ped-mapa-teatro');
        if (!ms || !ms.value) {
            state.csvData = null;
        }

        state.csvFile = null;

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

        const finalItems = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

        

        // Travar e preencher campos

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

        if (impStart) {

            impStart.value = 1;

            impStart.setAttribute('disabled', 'true');

        }

        if (impEnd) {

            impEnd.value = finalItems;

            impEnd.setAttribute('disabled', 'true');

        }

    } else if (num && num.csv_data && num.csv_data.length) {

        // A fatia do modelo, nao o banco inteiro: varios modelos do mesmo pedido
        // costumam dividir o mesmo CSV. Espelha updateImpSummary no script.js —
        // esta tela e um clone dele e ficou para tras quando a fatia nasceu, o
        // que fazia o pedido 20495 impor as 238 linhas do caderno em cada um dos
        // oito paises.
        state.csvData = (typeof fatiaCsvDoItem === 'function')
            ? fatiaCsvDoItem(itemAtivoDoPedido(), num)
            : num.csv_data;
        state.csvDataDerivado = true;   // e da numeracao: nao serve a nenhuma outra

        state.csvFile = null; // Banco embutido

        

        // Travar e preencher campos

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

        if (impStart) {

            impStart.value = 1;

            impStart.setAttribute('disabled', 'true');

        }

        if (impEnd) {

            impEnd.value = state.csvData.length;   // ja e a fatia, ja sem canceladas

            impEnd.setAttribute('disabled', 'true');

        }

    } else {

        const csvFileEl = document.getElementById('csv-file');

        if (!csvFileEl || !csvFileEl.files.length) {

            const ms = document.getElementById('ped-mapa-teatro');
            if (!ms || !ms.value) {
                state.csvData = null;
            }

            state.csvFile = null;

        }

        

        const impStart = document.getElementById('ped-start');

        const impEnd = document.getElementById('ped-end');

        if (impStart) impStart.removeAttribute('disabled');

        if (impEnd) impEnd.removeAttribute('disabled');

    }

    const impMapaTeatroGroup = document.getElementById('ped-mapa-teatro-group');
    const impStartGroup = document.getElementById('ped-start-group');
    const impEndGroup = document.getElementById('ped-end-group');
    
    if ((num && num.tipo === 'TEATRO') || (num2 && num2.tipo === 'TEATRO')) {
        if (impMapaTeatroGroup) impMapaTeatroGroup.style.display = 'block';
        if (impStartGroup) impStartGroup.style.display = 'none';
        if (impEndGroup) impEndGroup.style.display = 'none';
        populateImpMapasTeatro();
        // Carregar dados do mapa de teatro selecionado
        const mapaTeatro = document.getElementById('ped-mapa-teatro');
        if (mapaTeatro && mapaTeatro.value) {
            loadMapaTeatroData(mapaTeatro.value);
        }
    } else {
        if (impMapaTeatroGroup) impMapaTeatroGroup.style.display = 'none';
        if (impStartGroup) impStartGroup.style.display = 'block';
        if (impEndGroup) impEndGroup.style.display = 'block';
    }




    if (!fmtId || !saiId) {

        box.style.display = 'none';

        agendarRedesenhoDaPrevia();

        return;

    }



    const fmt = state.formatos.find(f => f.id === fmtId);

    const sai = state.saidas.find(s => s.id === saiId);

    if (!fmt || !sai) {

        box.style.display = 'none';

        drawPedPreview();

        return;

    }



    let total = 1;

    if (isPdfMultiple) {

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

        total = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

    } else if (schema === 'multi_artes') {

        total = state.impMultiArtes.reduce((acc, a) => acc + (parseInt(a.qtd) || 0), 0);

        if (total < 1) total = 1;

    } else if (state.csvData) {

        total = (typeof linhasAtivasCsv === 'function')
            ? linhasAtivasCsv(state.csvData).length
            : state.csvData.length;

    } else {

        total = end - start + 1;

    }

    let ticket_qtd = 1;
    if (num && num.tipo === "TICKET") {
        ticket_qtd = parseInt(num.ticket_qtd) || 1;
    }

    const perSheet = fmt.cols * fmt.rows;
    const total_impressions = (num && num.tipo === "TICKET") ? Math.ceil(total / ticket_qtd) : total;
    let sheets = Math.ceil(total_impressions / perSheet);

    const cutstackMode = document.getElementById('ped-cutstack-mode')?.value;
    if (schema === 'cut_stack' || schema === 'multi_artes') {
        const stack_size = (parseInt(document.getElementById('ped-sheets-per-block')?.value) || 50) * (parseInt(document.getElementById('ped-block-depth')?.value) || 1);
        if (schema === 'multi_artes' || cutstackMode === 'strict_assembly') {
            if (typeof buildStrictAssemblySets === 'function') {
                const artesList = schema === 'multi_artes' ? state.impMultiArtes : [];
                const assSets = buildStrictAssemblySets(artesList, schema === 'multi_artes', total_impressions, stack_size, perSheet);
                sheets = assSets.reduce((sum, s) => sum + s.num_sheets, 0);
            } else {
                const itemsPerSet = stack_size * perSheet;
                const sets_needed = Math.ceil(total_impressions / itemsPerSet);
                sheets = sets_needed * stack_size;
            }
        } else if (cutstackMode === 'strict') {
            const itemsPerSet = stack_size * perSheet;
            const sets_needed = Math.ceil(total_impressions / itemsPerSet);
            sheets = sets_needed * stack_size;
        }
    }



    box.style.display = 'grid';

    document.getElementById('ped-sum-formato').textContent = `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)`;

    document.getElementById('ped-sum-grade').textContent = `${fmt.cols} × ${fmt.rows} = ${perSheet} itens/folha`;

    document.getElementById('ped-sum-total').textContent = total.toLocaleString('pt-BR');

    document.getElementById('ped-sum-folhas').textContent = sheets.toLocaleString('pt-BR') + ' folha(s)';

    document.getElementById('ped-sum-saida').textContent = `${sai.name} -- ${(sai.file_format || 'pdf').toUpperCase()}`;
    // Nesta aba o Sumário NÃO publica a conta da sobra: ele vive dentro de um
    // `display: none !important`, e os campos Formato e Saída dele, escondidos
    // junto, ficam vazios — esta função desiste na primeira conferência. Quem
    // publica é a prévia, que é quem sabe quantas folhas o trabalho tem.



    // Update steps

    ['step-1', 'step-2', 'step-3', 'step-4'].forEach((s, i) => {
        const el = document.getElementById(s);
        if (!el) return;
        el.classList.remove('done', 'active');
        el.classList.add(i < 3 ? 'done' : 'active');
    });



    if (typeof window.togglePedNumEditButtons === 'function') window.togglePedNumEditButtons();

    agendarRedesenhoDaPrevia();

}
/**
 * A caixa "Entregar cada bloco enquanto gera" foi mexida: grava no modelo.
 *
 * Pela regra do projeto, escolha de impressao do operador fica salva no modelo,
 * e nao so na sessao. A coluna `entregar_por_bloco` de `pedidos_modelos` aceita
 * nulo, e nulo significa "usa o padrao da tela" -- ver a leitura no
 * `enviarParaPedido`, que trata nulo como marcado.
 */
window.onPedEntregarPorBlocoToggle = function (marcado) {
    const ativo = state.activeOSItem;
    if (!ativo) return;
    const itens = state.osItens[ativo.osId] || [];
    const item = itens.find(i => String(i.id) === String(ativo.itemId));
    if (item) item.entregar_por_bloco = !!marcado;
    if (typeof autoSaveOSItemField === 'function') {
        autoSaveOSItemField(ativo.itemId, ativo.osId, 'entregar_por_bloco', !!marcado);
    }
};

window.onPedNumeracaoSelect = onPedNumeracaoSelect;
window.updatePedSummary = updatePedSummary;

function clearPedActiveOS() {

    state.loadedOSName = "";

    state.expectedArteName = "";

    

    const activeOsStatus = document.getElementById('ped-active-os-status');

    const activeOsName = document.getElementById('ped-active-os-name');

    if (activeOsStatus && activeOsName) {

        activeOsName.textContent = "Nenhuma";

        activeOsStatus.style.display = 'none';

    }



    const infoEl = document.getElementById('ped-file-info');
        const fileInput = document.getElementById('ped-file');
    if (fileInput) {
        fileInput.value = '';
    }

    toast('OS desvinculada. Validações de arquivo liberadas.', 'info');
}
window.clearPedActiveOS = clearPedActiveOS;



/* ══════════════════════════════════════════════════════════════════════════
   A JANELA DE VISUALIZACAO ABRE ABAIXO DO MODELO
   ══════════════════════════════════════════════════════════════════════════

   Ate 28/08/2026 a janela morava num card no FIM da pagina: o operador
   escolhia o modelo no topo da fila e ia procurar a previa depois de todas as
   caixas de produto. Num pedido com varios produtos, o olho perdia o vinculo
   entre a linha escolhida e o que a previa mostrava.

   Agora ela abre logo abaixo do modelo, dentro da caixa do produto.

   O PONTO QUE NAO PODE SER PERDIDO DE VISTA: a janela e' UM elemento so, que
   MUDA DE LUGAR. Ela nunca e' escrita dentro do HTML da fila. Redesenha-la
   custaria o canvas ja pintado (voltaria em branco), remontaria o painel de
   impressao — que vai buscar as capacidades da impressora no agente — e
   devolveria bandeja, papel e copias ao padrao, apagando a escolha do
   operador. Mover custa 3,4 ms e nao cresce com o tamanho do pedido; num
   pedido de 52 modelos, redesenhar a fila inteira custa 160 ms nesta maquina
   e quase 1 s numa estacao antiga.
   ══════════════════════════════════════════════════════════════════════════ */

/** A janela, onde quer que ela esteja no momento. */
function janelaDeVisualizacao() {
    return document.getElementById('ped-preview-card-container');
}

/**
 * Abre e fecha um dos grupos de acao da coluna direita da janela.
 *
 * Sao quatro, separados por tipo: Imprimir e PDF (o unico aberto de partida),
 * Configuracao de Impressao, Gerenciamento de Cores e Refazer Folhas. Antes
 * tudo isso morava aberto ao mesmo tempo — o painel do driver ocupava 30% da
 * largura o tempo todo, e a previa ficava espremida no meio.
 */
function alternarGrupoDaJanela(id) {
    const grupo = document.getElementById(id);
    if (!grupo) return;
    const corpo = document.getElementById(id + '-corpo');
    const botao = grupo.querySelector('.jg-botao');
    const seta = grupo.querySelector('.jg-seta');

    const abrir = !grupo.classList.contains('jg-aberto');
    grupo.classList.toggle('jg-aberto', abrir);
    if (corpo) corpo.style.display = abrir ? 'flex' : 'none';
    if (botao) botao.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (seta) seta.textContent = abrir ? '▲' : '▼';

    // As curvas de cor sao desenhadas num canvas cujo tamanho vem dos atributos
    // width/height, e nao do layout — mas quem abre o grupo pela primeira vez
    // pode nao ter passado por nenhum desenho ainda.
    if (abrir && id === 'jg-cores') {
        if (typeof desenharCurvaCor === 'function') desenharCurvaCor();
        if (typeof desenharPreviaCor === 'function') desenharPreviaCor();
    }

    // As pastas do hot folder sao do DISCO da estacao, e o disco muda por fora
    // do painel: alguem cria uma pasta no RIP, a rede cai, um mapeamento some.
    // Reler ao abrir custa uma requisicao ao agente local e evita o pior caso —
    // o operador escolher um ladrilho de pasta que ja nao existe.
    if (abrir && id === 'jg-hotfolder' && typeof carregarHotFolders === 'function') {
        carregarHotFolders();
    }
}
window.alternarGrupoDaJanela = alternarGrupoDaJanela;

/**
 * Mostra ou esconde um controle da coluna esquerda da previa.
 *
 * Os controles ganharam um rotulo proprio ("Folha", "Set", "Parte", "Face"), e
 * esconder so o `<select>` deixaria o rotulo orfao na tela. Esconde a caixa
 * inteira quando existe uma.
 */
function mostrarControleDaPrevia(el, mostrar) {
    if (!el) return;
    const caixa = el.closest ? (el.closest('.ped-janela-controle') || el) : el;
    caixa.style.display = mostrar ? (caixa === el ? 'inline-block' : 'flex') : 'none';
}
window.mostrarControleDaPrevia = mostrarControleDaPrevia;

/**
 * Este modelo usa numeracao de CAMAROTE?
 *
 * Muda as quatro colunas do meio da fila (Q_CAM, L_CAM, C_INI no lugar de QTD,
 * N. inicial, N. final), e por isso precisa ser respondido ANTES de desenhar o
 * cabecalho da caixa — nao so' dentro de cada linha.
 */
function modeloEhCamarote(item) {
    if (!item) return false;

    // A COLUNA DO BANCO VEM PRIMEIRO. `amostra_num_id` e' a coluna;
    // `numeracao_id` e' o espelho antigo, que so vale quando a coluna nao veio.
    // Lendo o espelho primeiro, um modelo cuja numeracao foi trocada abre o
    // banco errado — e sao doze pontos de leitura espalhados por duas telas.
    // Ver `numeracaoIdDoItem` no script.js e o csv_fatia_do_modelo_harness.
    const nid = typeof numeracaoIdDoItem === 'function'
        ? numeracaoIdDoItem(item)
        : (item.amostra_num_id || item.numeracao_id);
    let num = nid ? (state.numeracoes || []).find(n => String(n.id) === String(nid)) : null;
    if (!num) {
        const nome = item.gabarito_operacional || item.numeracao || '';
        if (nome && typeof globalNormStr === 'function') {
            num = (state.numeracoes || []).find(n => globalNormStr(n.name || n.tipo || '') === globalNormStr(nome));
        }
    }
    return !!(num && (num.tipo === 'CAMAROTE' || num.type === 'CAMAROTE'));
}
window.modeloEhCamarote = modeloEhCamarote;

/**
 * Preto ou branco por cima desta tinta?
 *
 * O seletor de Cor pinta o proprio fundo com a cor do modelo e ATE 28/08/2026
 * forcava o texto em preto. Em tinta clara funcionava; em tinta escura — preto,
 * azul-marinho, comuns em grafica — o nome da cor desaparecia dentro da propria
 * caixa. A conta e' a luminancia relativa, a mesma que os guias de contraste
 * usam: acima do meio pede texto escuro, abaixo pede texto claro.
 */
function textoLegivelSobre(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const canal = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
    return L > 0.36 ? '#000000' : '#ffffff';
}
window.textoLegivelSobre = textoLegivelSobre;

/* ══════════════════════════════════════════════════════════════════════════
   OS SELETORES DA FILA SE ENCHEM QUANDO O OPERADOR OS ABRE
   ══════════════════════════════════════════════════════════════════════════

   Cada linha da fila tem um seletor de Cor e um de Numeracao, e cada um nascia
   com a lista INTEIRA dentro: no formato mais carregado do catalogo sao 18
   cores e 106 numeracoes, 124 opcoes por linha. Num pedido de 52 modelos isso
   e' 6.362 dos 8.892 elementos da tela — quase tres quartos dela — para o
   operador ver, de cada seletor, UMA linha.

   Medido num Chrome de verdade, redesenhando a fila do pedido 21202:

       lista inteira em cada linha : 8.892 elementos, 160 ms (922 ms numa
                                     estacao 4x mais lenta)
       so a opcao escolhida        : 2.530 elementos,  40 ms (289 ms)

   Isso importa porque a fila se redesenha a CADA clique num modelo, e o clique
   virou um interruptor que o operador usa mais vezes que antes.

   COMO A LISTA CHEGA, E POR QUE NAO EXISTE MAIS UMA "REDE" QUE ENCHE TUDO.

   A primeira versao disto (28/08/2026) enchia, um segundo e meio depois de
   cada redesenho, TODOS os seletores que ninguem tivesse aberto — uma rede de
   seguranca para o caso de algum navegador da grafica nao disparar os eventos.
   Medida na tela, ela desfazia a propria economia que este bloco existe para
   fazer:

       encher os 104 seletores de uma vez : 121 ms de interface travada
       o redesenho SEGUINTE, ja com a fila cheia de novo : 158 ms (contra 44)

   Ou seja: 1,5 s depois de cada clique a fila voltava a ter 8.533 elementos, e
   o clique seguinte pagava a demolicao deles. O operador via a tela travar.

   Agora a lista chega por CINCO caminhos, todos baratos e nenhum em lote:

     - passar o mouse pela LINHA enche os dois seletores dela (~2 ms). O mouse
       sempre passa pela linha antes de chegar ao seletor, entao na pratica ela
       ja esta pronta quando o operador clica;
     - `mousedown`, `focus`, `keydown` e `touchstart` no proprio seletor, que
       cobrem teclado, toque e qualquer navegador que nao dispare os outros.

   Encher no `mousedown` de um `<select>` funciona: o evento e' entregue ANTES
   de o navegador desenhar a lista. E, mesmo que um navegador exotico nao o
   disparasse, o `focus` chegaria — nenhum navegador abre um seletor sem
   focar antes.
   ══════════════════════════════════════════════════════════════════════════ */

/** As cores que valem para este formato — a mesma regra da linha e do filtro. */
function coresDoFormato(fmtId) {
    return (state.cores || []).filter(c => !fmtId || !c.formato_id || String(c.formato_id) === String(fmtId));
}

/** As numeracoes que valem para este formato. */
function numeracoesDoFormato(fmtId) {
    return (state.numeracoes || []).filter(n => !fmtId || !n.formato_id || String(n.formato_id) === String(fmtId));
}

/** As <option> do seletor de Cor, pintadas com a tinta de cada uma. */
function opcoesDeCorDaFila(fmtId, escolhida) {
    return '<option value="">— Cor —</option>' + coresDoFormato(fmtId).map(c => {
        const sel = escolhida && String(c.id) === String(escolhida) ? 'selected' : '';
        const refHex = c.cor_referencia || c.hex || '';
        const optStyle = refHex ? `background-color: ${refHex}; color: ${textoLegivelSobre(refHex)}; font-weight: bold;` : '';
        return `<option value="${c.id}" ${sel} style="${optStyle}">${c.name}</option>`;
    }).join('');
}

/** As <option> do seletor de Numeracao. */
function opcoesDeNumeracaoDaFila(fmtId, escolhida) {
    return '<option value="">— Numeração —</option>' + numeracoesDoFormato(fmtId).map(n => {
        const sel = escolhida && String(n.id) === String(escolhida) ? 'selected' : '';
        return `<option value="${n.id}" ${sel}>${n.name || n.tipo}</option>`;
    }).join('');
}

/**
 * Enche um seletor da fila com a lista inteira, uma vez so.
 *
 * Chamada quando o operador vai abrir o seletor, e tambem pela rede de
 * seguranca logo abaixo. Preserva o que estava escolhido.
 */
function encherSeletorDaFila(sel) {
    if (!sel || sel.dataset.cheio === '1') return;
    sel.dataset.cheio = '1';
    const escolhida = sel.value;
    sel.innerHTML = sel.dataset.lista === 'cores'
        ? opcoesDeCorDaFila(sel.dataset.fmt || '', escolhida)
        : opcoesDeNumeracaoDaFila(sel.dataset.fmt || '', escolhida);
    sel.value = escolhida;
}
window.encherSeletorDaFila = encherSeletorDaFila;

/**
 * Passar o mouse pela linha prepara os dois seletores dela.
 *
 * Custa uns 2 ms e acontece antes do clique — o mouse sempre atravessa a linha
 * para chegar ao seletor. E' o que substituiu a rede que enchia a fila inteira
 * em lote e travava a interface por 121 ms. Ver o bloco acima.
 */
function encherSeletoresDaLinha(linha) {
    if (!linha) return;

    // LINHA TRAVADA NAO ENCHE. Desde 29/08/2026 os seletores de Cor e Numeracao
    // so' abrem com a senha da gerencia — montar a lista de um seletor que nao
    // vai abrir seria pagar o preco que este bloco inteiro existe para evitar,
    // e pagar por NADA. Na pratica isso deixa a fila permanentemente enxuta: so'
    // o modelo liberado carrega as suas duas listas.
    const id = String(linha.id || '').replace('ped-queue-row-', '');
    if (id && !modeloEstaLiberado(id)) return;

    linha.querySelectorAll('select[data-lista]:not([data-cheio="1"])')
        .forEach(encherSeletorDaFila);
}
window.encherSeletoresDaLinha = encherSeletoresDaLinha;

/* ══════════════════════════════════════════════════════════════════════════
   OS CAMPOS DA LINHA SO' SE ALTERAM COM A SENHA DA GERENCIA (29/08/2026)
   ══════════════════════════════════════════════════════════════════════════

   Qtd, N. inicial, Bloco, Cor, Numeracao e Verso — e, no CAMAROTE, Q_CAM, L_CAM
   e C_INI — decidem o que sai no papel e o que o cliente contratou. A tela do
   Pedido fica aberta no chao de fabrica, e ate agora qualquer um que passasse
   podia mudar a quantidade de uma tiragem com um clique.

   A senha e' a MESMA do peso fora dos 5 % no Painel do Acabamento, conferida no
   MESMO lugar: o servidor. Ela nunca esta no navegador — a funcao que pergunta
   vem do `acabamento.js`, exportada de la para nao existirem duas politicas.

   O QUE NAO PASSA PELA TRAVA:
   - O **Status da impressao**. Marcar o que ja saiu e' o trabalho normal do
     operador, e pedir senha para isso pararia a producao (decisao do usuario).
   - A caixinha de marcar para a folha combinada, que escolhe o que imprimir e
     nao altera dado nenhum do modelo.

   O ALCANCE, decidido pelo usuario: liberado o modelo, ele fica liberado ATE A
   JANELA DELE SER FECHADA. Abrir outro modelo, fechar a janela ou sair da tela
   tranca tudo de novo.
   ══════════════════════════════════════════════════════════════════════════ */

/** Este modelo esta com os campos liberados? */
function modeloEstaLiberado(itemId) {
    return !!(state.modeloLiberado && String(state.modeloLiberado) === String(itemId));
}
window.modeloEstaLiberado = modeloEstaLiberado;

/** Fecha a liberacao. Chamada ao trocar de modelo e ao fechar a janela. */
function trancarCamposDoModelo() {
    if (!state.modeloLiberado) return;
    state.modeloLiberado = null;
    if (typeof renderPedOSQueue === 'function') renderPedOSQueue();
}
window.trancarCamposDoModelo = trancarCamposDoModelo;

/**
 * O porteiro de cada campo travado.
 *
 * Devolve `true` quando o campo pode ser usado. Travado, ele impede o gesto
 * (o menu do seletor nao abre, o campo nao recebe o cursor) e abre a caixa da
 * senha — o operador descobre a regra tentando, que e' quando ela importa.
 */
function travaDaGerencia(evento, itemId) {
    if (modeloEstaLiberado(itemId)) return true;
    if (evento) {
        evento.preventDefault();
        evento.stopPropagation();
    }
    pedirSenhaDaGerencia(itemId);
    return false;
}
window.travaDaGerencia = travaDaGerencia;

/** Abre a caixa da senha para este modelo. */
function pedirSenhaDaGerencia(itemId) {
    const caixa = document.getElementById('ped-senha-gerencia');
    if (!caixa) return;

    caixa.dataset.item = itemId;

    const nome = document.getElementById('ped-senha-modelo');
    if (nome) {
        const itens = (state.pedidoAberto && state.osItens[state.pedidoAberto.osId]) || [];
        const item = itens.find(i => String(i.id) === String(itemId));
        nome.textContent = item
            ? ((item.modelo ? item.modelo + ' · ' : '') + (item.produto || 'modelo'))
            : 'modelo';
    }

    const erro = document.getElementById('ped-senha-erro');
    if (erro) erro.textContent = '';
    caixa.style.display = 'flex';

    const campo = document.getElementById('ped-senha-campo');
    if (campo) { campo.value = ''; setTimeout(() => campo.focus(), 30); }
}
window.pedirSenhaDaGerencia = pedirSenhaDaGerencia;

function fecharSenhaDaGerencia() {
    const caixa = document.getElementById('ped-senha-gerencia');
    if (caixa) caixa.style.display = 'none';
}
window.fecharSenhaDaGerencia = fecharSenhaDaGerencia;

/**
 * Confere a senha e libera os campos daquele modelo.
 *
 * Senha errada ou rede fora: a caixa FICA aberta com o motivo, e nada e'
 * liberado. E' a mesma postura do popup do Acabamento — nada passa antes do sim
 * do servidor.
 */
async function liberarCamposDoModelo() {
    const caixa = document.getElementById('ped-senha-gerencia');
    const campo = document.getElementById('ped-senha-campo');
    const erro = document.getElementById('ped-senha-erro');
    const botao = document.getElementById('ped-senha-ok');
    if (!caixa || !campo) return;

    const senha = String(campo.value || '').trim();
    if (!senha) {
        if (erro) erro.textContent = 'Digite a senha da gerência.';
        return;
    }

    if (typeof window.conferirSenhaDeLiberacao !== 'function') {
        // Sem quem conferir, NADA e' liberado. Uma trava que se abre sozinha
        // quando a conferencia falha nao e' trava.
        if (erro) erro.textContent = 'Não consigo conferir a senha agora. Recarregue a página e tente de novo.';
        return;
    }

    if (botao) { botao.disabled = true; botao.textContent = 'Conferindo…'; }
    try {
        const confere = await window.conferirSenhaDeLiberacao(senha);
        if (!confere) {
            if (erro) erro.textContent = 'Senha incorreta.';
            campo.value = '';
            campo.focus();
            return;
        }
        state.modeloLiberado = caixa.dataset.item || null;
        fecharSenhaDaGerencia();
        renderPedOSQueue();
        if (typeof toast === 'function') {
            toast('Campos liberados neste modelo até fechar a janela dele.', 'success');
        }
    } catch (e) {
        console.error('[pedido] erro ao conferir a senha da gerência:', e);
        if (erro) erro.textContent = `Não deu para conferir a senha (${e && e.message ? e.message : e}).`;
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Liberar'; }
    }
}
window.liberarCamposDoModelo = liberarCamposDoModelo;

/**
 * A porta de um seletor da fila: primeiro a trava, depois a lista.
 *
 * Os dois cuidados moram na MESMA funcao porque moram no mesmo gesto. Escritos
 * como dois `onmousedown` no mesmo elemento, o navegador guarda o primeiro e
 * ignora o segundo em silencio — foi assim que a trava da gerencia nasceu
 * inerte, e o harness pegou.
 *
 * Travado: o gesto e' barrado e a caixa da senha aparece; a lista nem chega a
 * ser montada, porque nao ha o que escolher.
 */
function portaDoSeletor(evento, el, itemId) {
    if (!travaDaGerencia(evento, itemId)) return false;
    encherSeletorDaFila(el);
    return true;
}
window.portaDoSeletor = portaDoSeletor;

/** O Refazer (folhas ou celulas) esta ligado? */
function refazerLigado() {
    return (typeof refazerFolhasAtivo === 'function' && refazerFolhasAtivo())
        || (typeof refazerCelulasAtivo === 'function' && refazerCelulasAtivo());
}
window.refazerLigado = refazerLigado;

/**
 * Devolve a janela para a casa dela, fora da fila.
 *
 * Chamada SEMPRE antes de o `renderPedOSQueue` reescrever o corpo da fila: o
 * `innerHTML` destroi tudo o que estiver la dentro, e a janela estando dentro
 * seria destruida junto.
 */
function recolherJanelaParaCasa() {
    const janela = janelaDeVisualizacao();
    const casa = document.getElementById('ped-preview-home');
    if (!janela || !casa) return;
    if (janela.parentElement !== casa) casa.appendChild(janela);

    // A linha-abrigo vazia nao fica na tabela: ela abriria um vao sem motivo.
    document.querySelectorAll('#ped-os-queue-body tr.linha-da-janela')
        .forEach(tr => tr.remove());
}

/**
 * Rola a tela suavemente para que a base da janela de visualização do modelo
 * selecionado se alinhe com a base da tela (monitor / viewport).
 */
function rolarParaBaseDaJanela() {
    setTimeout(() => {
        const abrigo = document.getElementById('ped-linha-da-janela');
        const janela = (abrigo && abrigo.style.display !== 'none') ? abrigo : document.getElementById('ped-preview-container');
        if (!janela) return;
        if (typeof janela.scrollIntoView === 'function') {
            janela.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
        }
    }, 80);
}
window.rolarParaBaseDaJanela = rolarParaBaseDaJanela;

/**
 * Leva a janela para uma linha-abrigo logo abaixo do modelo pedido.
 *
 * Devolve `true` se conseguiu. Falha em silencio (e devolve `false`) quando a
 * linha nao esta na tela — o modelo pode ter sido escondido por um filtro, ou
 * a fila pode ainda nao ter sido desenhada.
 */
function moverJanelaParaModelo(itemId, opts = {}) {
    const { rolar = false } = opts;
    const janela = janelaDeVisualizacao();
    if (!janela) return false;                    // producao.html nao tem a janela
    const linha = document.getElementById(`ped-queue-row-${itemId}`);
    if (!linha || linha.style.display === 'none') return false;

    let abrigo = document.getElementById('ped-linha-da-janela');
    if (!abrigo) {
        abrigo = document.createElement('tr');
        abrigo.id = 'ped-linha-da-janela';
        abrigo.className = 'linha-da-janela';
        // 11 colunas: e' o numero de celulas da linha do modelo nos DOIS
        // desenhos possiveis (o normal e o de CAMAROTE). Ver renderPedOSQueue.
        abrigo.innerHTML = '<td colspan="11"></td>';
    }
    linha.parentNode.insertBefore(abrigo, linha.nextSibling);
    abrigo.firstElementChild.appendChild(janela);
    janela.style.display = 'block';

    if (rolar && typeof rolarParaBaseDaJanela === 'function') {
        rolarParaBaseDaJanela();
    }
    return true;
}

/**
 * Pinta o realce das linhas sem redesenhar a fila.
 *
 * Trocar de modelo aberto mexe em duas linhas — a que fechou e a que abriu.
 * Fazer isso pelo `renderPedOSQueue` significaria remontar as 52 linhas e as
 * 6.400 opcoes de cor e numeracao delas para mudar uma borda.
 */
function pintarLinhaAberta(itemId) {
    document.querySelectorAll('#ped-os-queue-body tr.fila-linha.aberta')
        .forEach(tr => tr.classList.remove('aberta'));
    if (!itemId) return;
    const linha = document.getElementById(`ped-queue-row-${itemId}`);
    if (linha) linha.classList.add('aberta');
}

/**
 * Apaga a previa no INSTANTE do clique.
 *
 * O carregamento de um modelo e' encadeado (400, 600 e 800 ms), e a previa so
 * e' desenhada no fim. Com a janela abrindo ao lado do modelo, o operador fica
 * olhando para ela esse tempo todo — e sem isto ela mostraria a folha do
 * modelo ANTERIOR debaixo do nome do modelo novo. A regra do projeto e' que a
 * janela mostra o modelo selecionado, nunca outro.
 */
function limparPreviaEnquantoCarrega() {
    const canvas = document.getElementById('ped-preview-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
    }
    const selo = document.getElementById('ped-preview-sheet-num');
    if (selo) selo.textContent = 'Montando…';

    const dono = canvas ? (canvas.closest('.ped-preview-canvas-container') || canvas.parentElement) : null;
    if (dono && !dono.querySelector('.previa-montando')) {
        const recado = document.createElement('div');
        recado.className = 'previa-montando';
        recado.innerHTML = '<span class="roda"></span><span>Montando a pr&eacute;via deste modelo…</span>';
        dono.insertBefore(recado, dono.firstChild);
    }
}

/** Tira o recado de "montando" e devolve o canvas. Chamada pelo drawPedPreview. */
function previaFicouPronta() {
    document.querySelectorAll('.previa-montando').forEach(el => el.remove());
    const canvas = document.getElementById('ped-preview-canvas');
    if (canvas) canvas.style.display = '';
}
window.previaFicouPronta = previaFicouPronta;

/**
 * Fecha a janela e desseleciona o modelo.
 *
 * NAO redesenha a fila: nada do conteudo das linhas mudou, so o realce de uma
 * delas — e isso e' uma troca de classe.
 */
function fecharJanelaDoModelo() {
    state.activeOSItem = null;

    // FECHAR A JANELA TRANCA OS CAMPOS DE NOVO. E' o alcance que o usuario
    // definiu para a senha da gerencia: liberado o modelo, ele fica liberado
    // ate a janela dele ser fechada. So' redesenha se havia algo liberado —
    // fechar uma janela sem liberacao continua custando o caminho barato.
    const haviaLiberacao = !!state.modeloLiberado;
    state.modeloLiberado = null;
    recolherJanelaParaCasa();
    const janela = janelaDeVisualizacao();
    if (janela) janela.style.display = 'none';
    pintarLinhaAberta(null);
    if (typeof updatePedImprimirButtonsVisibility === 'function') updatePedImprimirButtonsVisibility();
    if (typeof atualizarBarraDeSoma === 'function') atualizarBarraDeSoma();

    // Os campos liberados voltam a nascer travados, e isso exige redesenhar a
    // linha: `readonly` e os porteiros dos seletores estao no HTML dela.
    if (haviaLiberacao) renderPedOSQueue();
}
window.fecharJanelaDoModelo = fecharJanelaDoModelo;

/**
 * O CLIQUE NA LINHA E' UM INTERRUPTOR.
 *
 * Clicar num modelo o abre; clicar de novo NO MESMO fecha a janela e o
 * desseleciona. A pagina passa a abrir sem nenhum modelo selecionado — antes
 * ela sempre abria com o primeiro carregado, e o operador nao tinha como
 * chegar a um estado neutro.
 *
 * Existe separado do `enviarParaPedido` DE PROPOSITO: aquele significa "abra
 * este modelo" e e' chamado tambem por quem edita um campo da linha
 * (pedQueueUpdateField, pedQueueUpdateCor, pedQueueUpdateNum). Se o
 * interruptor morasse la, editar a quantidade do modelo aberto o fecharia.
 */
async function alternarModeloAberto(itemId, osId) {
    const jaAberto = state.activeOSItem
        && String(state.activeOSItem.itemId) === String(itemId)
        && String(state.activeOSItem.osId) === String(osId);

    if (jaAberto) {
        fecharJanelaDoModelo();
        return;
    }
    await enviarParaPedido(itemId, osId);
}
window.alternarModeloAberto = alternarModeloAberto;

async function enviarParaPedido(itemId, osId) {
    const itens = typeof getOSItens === 'function' ? getOSItens(osId) : (state.osItens[osId] || []);
    const item = itens.find(i => String(i.id) === String(itemId)) || itens[0];
    if (!item) return toast('Item não encontrado.', 'error');

    // Guardar referência ao item ativo para atualização automática pós-imposição
    const trocouDeModelo = !state.activeOSItem
        || String(state.activeOSItem.itemId) !== String(item.id);
    state.activeOSItem = { itemId: item.id, osId };

    // Abrir OUTRO modelo tranca o que estava liberado: a senha da gerencia vale
    // para um modelo so', ate a janela dele fechar.
    if (trocouDeModelo) state.modeloLiberado = null;

    // O pedido que a fila desenha e' guardado a parte do modelo aberto: sem
    // isso a fila sumiria da tela ao fechar a janela, porque ela se desenhava
    // a partir de `activeOSItem` e nada mais.
    state.pedidoAberto = { osId };

    // A previa se apaga AGORA, antes de qualquer espera, para nunca mostrar a
    // folha do modelo anterior debaixo do nome do modelo novo.
    if (trocouDeModelo) limparPreviaEnquantoCarrega();

    // O cabecalho da janela diz DE QUE MODELO ela e'. Com a janela abrindo
    // dentro da fila, entre dezenas de linhas parecidas, isso deixou de ser
    // enfeite: e' o que liga o que esta desenhado ao que foi clicado.
    const nomeNoCabecalho = document.getElementById('ped-preview-modelo');
    if (nomeNoCabecalho) {
        const codigo = item.modelo ? String(item.modelo) + ' · ' : '';
        nomeNoCabecalho.textContent = codigo + (item.produto || item.nome_modelo || 'modelo');
    }

    // O realce da linha e' imediato: o operador ve o clique valer sem esperar
    // o carregamento. A janela vai junto, se a fila ja estiver desenhada.
    pintarLinhaAberta(item.id);
    moverJanelaParaModelo(item.id, { rolar: true });

    // Trocou de pedido? A selecao do anterior nao pode atravessar: ela some da
    // fila, que so desenha o pedido aberto, e continuaria decidindo o que entra
    // na folha combinada. Ver problemaNaSelecao().
    if (typeof limparSelecaoDeOutroPedido === 'function') limparSelecaoDeOutroPedido(osId);

    // Atualizar o título do cabeçalho da página de Pedido
    const activeOS = typeof findOSInState === 'function' ? findOSInState(osId) : (state.ordens ? state.ordens.find(o => o.id === osId) : null);
    let nomeEvento = '';
    if (state.todasArtes) {
        const arteObj = state.todasArtes.find(a => String(a.id_int) === String(osId).replace('vibe_', ''));
        if (arteObj) nomeEvento = arteObj.nome_evento || '';
    }
    const pedViewTitle = document.getElementById('ped-view-title');
    const pedViewSubtitle = document.getElementById('ped-view-subtitle');
    // As duas linhas do título moram no `script.js`, numa função só: dois
    // caminhos chegam aqui, e escrever o título duas vezes o faria depender de
    // por onde a pessoa entrou.
    if (typeof pintarTituloDaTelaDePedido === 'function') {
        pintarTituloDaTelaDePedido(pedViewTitle, activeOS, nomeEvento);
    }
    if (pedViewSubtitle) {
        pedViewSubtitle.style.display = 'none';
    }

    const previewContainer = document.getElementById('ped-preview-card-container');
    if (previewContainer) {
        previewContainer.style.display = 'block';
        // Inicializar painel lateral de driver de impressão
        if (typeof initPedPrintPanel === 'function') {
            initPedPrintPanel().then(() => {
                const prodId = item._vibe_id_produto || item.id_produto || item.produto_id;
                if (prodId && typeof loadPrintConfigForProduct === 'function') {
                    loadPrintConfigForProduct(prodId);
                }
                if (typeof _updateSaveButtonLabel === 'function') {
                    _updateSaveButtonLabel();
                }
            }).catch(e => console.warn('[PedPrintPanel] init error:', e));
        }
    }

    // Navegar para a view de Pedido (sem mudar para Imposição).
    //
    // `showView` direto, e NAO um clique no botao do menu: o clique no menu
    // agora significa "quero a pagina inicial da tela" e fecha a janela do
    // modelo — o que desfaria exatamente o que esta funcao acabou de fazer.
    if (typeof window.showView === 'function') {
        window.showView('view-pedido');
    } else {
        const navBtn = document.querySelector('[data-view="view-pedido"]');
        if (navBtn) navBtn.click();
    }

    // ====================================================================
    // DELEGAR resolução de Formato / Saída / Numeração / Arte
    // para enviarParaImposicao (código comprovadamente funcional no script.js)
    // switchTab=false para não mudar a aba
    // ====================================================================
    if (typeof enviarParaImposicao === 'function') {
        await enviarParaImposicao(item.id, osId, false);
    }

    // O formato do modelo só está CERTO em #ped-formato a partir daqui — é o
    // `enviarParaImposicao` quem o resolve. `initPedPrintPanel()`, logo
    // acima, roda em paralelo sem esperar por isto, e pode já ter perguntado
    // pela bandeja dupla (capa/miolo) com o formato do modelo ANTERIOR. O
    // `dispatchEvent('change')` que o `enviarParaImposicao` dá em
    // `#ped-formato` já corrige isso via `applyPedFormatoDefaults`; esta
    // chamada é o reforço, para o caso de o listener de `change` não estar
    // ligado ainda quando o modelo abre pela primeira vez.
    if (typeof atualizarBandejaCapaMiolo === 'function') atualizarBandejaCapaMiolo();

    // --- PREENCHER FAIXA DE NUMERAÇÃO (ped-start / ped-end) ---
    setTimeout(() => {
        const numStart = document.getElementById('ped-start');
        const numEnd = document.getElementById('ped-end');
        if (numStart && item.num_inicial) numStart.value = item.num_inicial;
        if (numEnd && item.num_final) numEnd.value = item.num_final;

        // --- CAMAROTE: preencher C_INI, Q_CAM e L_CAM ---
        const cIniHidden = document.getElementById('ped-c-ini');
        const qCamHidden = document.getElementById('ped-q-cam');
        const lCamHidden = document.getElementById('ped-l-cam');
        const cIniVal = item.C_INI || item.c_ini || 1;
        const qCamVal = item.Q_CAM || item.q_cam || item.qtd_locais || item.qtd_cam || 0;
        const lCamVal = item.L_CAM || item.l_cam || item.lotacao_cam || item.lotacao || item.lotacao_por_local || 1;
        if (cIniHidden) cIniHidden.value = cIniVal;
        if (qCamHidden) qCamHidden.value = qCamVal;
        if (lCamHidden) lCamHidden.value = lCamVal;
    }, 400);

    // --- PREENCHER MODO DE IMPRESSÃO + BLOCOS ---
    setTimeout(() => {
        const printMode = document.getElementById('ped-print-mode');
        if (printMode) {
            printMode.value = modoDeVersoDoModelo(item);
            if (typeof updatePedSummary === 'function') {
                updatePedSummary();
            }
        }
        if (item.blocos && item.blocos !== 'N') {
            const schemaSelect = document.getElementById('ped-schema');
            if (schemaSelect) {
                schemaSelect.value = 'cut_stack';
                schemaSelect.dispatchEvent(new Event('change'));
            }
            const modeSelect = document.getElementById('ped-cutstack-mode');
            if (modeSelect) {
                modeSelect.value = 'strict_assembly';
                modeSelect.dispatchEvent(new Event('change'));
            }
        }
        // Modo PDF vence blocos, e por isso vem depois: um PDF multipaginas nao pode ser
        // Cut & Stack da mesma pagina. Cada pagina do arquivo e um ingresso diferente,
        // entao a regra so pode ser Pdf Paginado.
        aplicarTravaModoPdf(!!item.modo_pdf);

        // A ESCOLHA DE ENTREGA DESTE MODELO (27/08/2026).
        //
        // NULO na coluna significa "ninguem escolheu neste modelo" -- e ai vale
        // o padrao da tela, que hoje e marcado. Por isso a leitura e
        // `!== false` e nao `!!`: um `!!` transformaria o nulo em desmarcado e
        // desligaria o recurso em todo modelo que nunca foi tocado.
        const cxEntrega = document.getElementById('ped-entregar-por-bloco');
        if (cxEntrega) cxEntrega.checked = (item.entregar_por_bloco !== false);
        updatePedSummary();
        if (typeof drawPedPreview === 'function') drawPedPreview();
    }, 800);

    // --- ATUALIZAR PAINEL DE ITENS OS ---
    setTimeout(() => { renderPedOSQueue(); }, 600);

    // --- MATCHING AUTOMÁTICO DE NUMERAÇÃO ---
    setTimeout(() => {
        let numId = item.numeracao_id;
        const fmtSelect = document.getElementById('ped-formato');
        const formatoId = fmtSelect ? fmtSelect.value : null;
        
        if (!numId && item.numeracao) {
            numId = matchNumeracao(item.numeracao, formatoId);
            if (numId) {
                autoSaveOSItemField(itemId, osId, 'numeracao_id', numId);
            }
        }
        if (numId) {
            const numSelect = document.getElementById('ped-numeracao');
            if (numSelect) {
                const opt = numSelect.querySelector(`option[value="${numId}"]`);
                if (opt) {
                    numSelect.value = numId;
                    numSelect.dispatchEvent(new Event('change'));
                }
            }
        }
    }, 500);
    
    // --- CARREGAR ARTE (PDF/IMAGEM) ---
    setTimeout(async () => {
        const arteUrl = item.arte_url || null;
        const corObj = item.amostra_cor_id
            ? (state.cores || []).find(c => String(c.id) === String(item.amostra_cor_id))
            : (state.cores || []).find(c => globalFuzzyMatch(c.name, item.cor || item.padrao || ''));
        
        // Só quando a arte vai sair da cor: o catálogo não traz o PDF.
        if (!arteUrl && corObj && typeof window.garantirPdfDaCor === 'function') {
            await window.garantirPdfDaCor(corObj);
        }
        
        if (arteUrl) {
            state.isColorTemplate = false;
            const filenameFromUrl = decodeURIComponent(arteUrl.split('/').pop().split('?')[0]);
            const filename = filenameFromUrl || item.nome_arquivo_arte || `Arte_${item.modelo || 'Modelo'}.pdf`;
            
            fetch(arteUrl)
                .then(res => {
                    const ct = res.headers.get('content-type') || '';
                    return res.blob().then(blob => ({ blob, ct }));
                })
                .then(({ blob, ct }) => {
                    const isPdf = ct.includes('pdf') || filename.toLowerCase().endsWith('.pdf');
                    const isImg = ct.includes('image') || /\.(png|jpg|jpeg|webp)$/i.test(filename);
                    if (!isPdf && !isImg) return;
                    const file = new File([blob], filename, { type: ct || (isPdf ? 'application/pdf' : 'image/png') });
                    state.expectedArteName = filename;
                    loadPedArtFile(file);
                    
                    const pedInfo = document.getElementById('ped-file-info');
                    if (pedInfo) {
                        pedInfo.textContent = `✅ ${filename} (Carregado do Pedido)`;
                        pedInfo.style.display = 'block';
                    }
                    setTimeout(() => { if (typeof drawPedPreview === 'function') drawPedPreview(); }, 600);
                })
                .catch(err => console.warn('[OS→Ped] Erro ao baixar arte via URL:', err));
                
            // Carregar Verso se houver
            guardarPdfDoVersoDaPrevia(null);   // zera o doc e a medida da pagina
            state.pedArtVersoFile = null;
            if (item.verso_arte_url) {
                const filenameV = item.nome_arquivo_arte_verso || `Arte_verso_${item.modelo || 'Modelo'}.pdf`;
                fetch(item.verso_arte_url)
                    .then(res => {
                        const ct = res.headers.get('content-type') || '';
                        return res.blob().then(blob => ({ blob, ct }));
                    })
                    .then(({ blob, ct }) => {
                        const isPdf = ct.includes('pdf') || filenameV.toLowerCase().endsWith('.pdf');
                        // O ARQUIVO, e nao so o documento da previa: um modelo
                        // sozinho nao passa por `multi_artes` e manda a arte como
                        // upload. Sem guardar o arquivo aqui, o FxVersoUnico
                        // chegaria ao motor sem verso nenhum (31/08/2026).
                        state.pedArtVersoFile = new File([blob], filenameV, { type: ct || 'application/pdf' });
                        if (isPdf && typeof pdfjsLib !== 'undefined') {
                            blob.arrayBuffer().then(arrayBuffer => {
                                pdfjsLib.getDocument({ data: arrayBuffer }).promise
                                    .then(pdfV => guardarPdfDoVersoDaPrevia(pdfV))
                                    .then(() => {
                                    setTimeout(() => { if (typeof drawPedPreview === 'function') drawPedPreview(); }, 300);
                                }).catch(e => console.error('[OS→Ped] Erro ao carregar PDF de verso da arte:', e));
                            });
                        }
                    })
                    .catch(err => console.warn('[OS→Ped] Erro ao baixar arte de verso via URL:', err));
            }
        } else if (corObj && corObj.pdf_base64) {
            state.isColorTemplate = true;
            try {
                const base64Data = corObj.pdf_base64.includes('base64,') ? corObj.pdf_base64.split('base64,')[1] : corObj.pdf_base64;
                const binStr = atob(base64Data);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const filename = corObj.pdf_filename || `${corObj.name}.pdf`;
                const file = new File([blob], filename, { type: 'application/pdf' });
                state.expectedArteName = filename;
                loadPedArtFile(file);
                
                // Carregar Verso da Cor se for Duplex
                guardarPdfDoVersoDaPrevia(null);   // zera o doc e a medida da pagina
                state.pedArtVersoFile = null;
                if (corObj.frente_verso && corObj.pdf_verso_base64) {
                    const base64DataV = corObj.pdf_verso_base64.includes('base64,') ? corObj.pdf_verso_base64.split('base64,')[1] : corObj.pdf_verso_base64;
                    const binStrV = atob(base64DataV);
                    const bytesV = new Uint8Array(binStrV.length);
                    for (let i = 0; i < binStrV.length; i++) bytesV[i] = binStrV.charCodeAt(i);
                    // Mesma razao do ramo da arte do item: o FxVersoUnico precisa
                    // do ARQUIVO do verso, nao so do documento da previa.
                    state.pedArtVersoFile = new File(
                        [new Blob([bytesV], { type: 'application/pdf' })],
                        corObj.pdf_verso_filename || `${corObj.name}_verso.pdf`,
                        { type: 'application/pdf' }
                    );
                    pdfjsLib.getDocument({ data: bytesV }).promise
                        .then(pdfV => guardarPdfDoVersoDaPrevia(pdfV))
                        .then(() => {
                        setTimeout(() => { if (typeof drawPedPreview === 'function') drawPedPreview(); }, 300);
                    }).catch(e => console.error('[OS→Ped] Erro ao carregar PDF de verso da cor:', e));
                }
                
                const pedInfo = document.getElementById('ped-file-info');
                if (pedInfo) {
                    pedInfo.textContent = `✅ ${filename} (Carregado da Cor)`;
                    pedInfo.style.display = 'block';
                }
                setTimeout(() => { if (typeof drawPedPreview === 'function') drawPedPreview(); }, 600);
            } catch (e) {
                console.error('[OS→Ped] Erro ao carregar PDF base64 da cor:', e);
            }
        } else {
            state.isColorTemplate = false;
            state.pedArtFile = null;
            state.pedArtPdfDoc = null;
            guardarPdfDoVersoDaPrevia(null);   // zera o doc e a medida da pagina
            state.pedArtVersoFile = null;
            state.pedArtImage = null;
            const pedInfo = document.getElementById('ped-file-info');
            if (pedInfo) pedInfo.style.display = 'none';
            setTimeout(() => { if (typeof drawPedPreview === 'function') drawPedPreview(); }, 600);
        }
    }, 700);
}
window.enviarParaPedido = enviarParaPedido;

window.togglePedItemSelection = function(itemId, osId) {
    if (!state.selectedOSItems) state.selectedOSItems = [];
    
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;

    // A fila so desenha o pedido aberto. Um modelo marcado em OUTRO pedido fica
    // invisivel: o operador nao ve e nao consegue desmarcar, e na hora de impor
    // ele entra com `qtd: 0` e some da folha. Foi o que aconteceu ao marcar
    // 1000277 (pedido 20495) com 1000278 (pedido 20508) ainda marcado.
    if (typeof limparSelecaoDeOutroPedido === 'function') {
        const largados = limparSelecaoDeOutroPedido(osId);
        if (largados) {
            toast(`${largados} modelo(s) de outro pedido foram desmarcados: `
                + 'a folha combinada vale para um pedido so.', 'info');
        }
    }

    const idx = state.selectedOSItems.findIndex(s => String(s.itemId) === String(itemId));
    
    if (idx !== -1) {
        state.selectedOSItems.splice(idx, 1);
    } else {
        // Dois modelos só saem na mesma folha se combinarem em cor, formato,
        // saída, face e modo PDF. Até a v630 só a cor era conferida, e os
        // outros quatro produzem folha impossível, não só diferente.
        if (state.selectedOSItems.length > 0) {
            const firstSelectedId = state.selectedOSItems[0].itemId;
            const firstSelectedItem = itens.find(i => String(i.id) === String(firstSelectedId));
            const motivo = (firstSelectedItem && typeof porQueNaoCombina === 'function')
                ? porQueNaoCombina(firstSelectedItem, item)
                : null;
            if (motivo) {
                const jaMarcado = firstSelectedItem.nome_modelo || firstSelectedItem.produto || 'o modelo já marcado';
                toast(`Este modelo não sai na mesma folha que ${jaMarcado}: ${motivo}. `
                    + 'Desmarque os outros para imprimir este sozinho.', 'warning');
                return;
            }
        }
        state.selectedOSItems.push({ itemId, osId });
    }

    renderPedOSQueue();
    if (typeof atualizarBarraDeSoma === 'function') atualizarBarraDeSoma();
    drawPedPreview();
};

/**
 * Quanto o produto tem e quanto dele ainda falta imprimir.
 *
 * É a pergunta que o operador faz de pé na frente da impressora — "quantas
 * pulseiras esse pedido tem?" —, e que até aqui ele só respondia somando de
 * cabeça as linhas da lista.
 *
 * Restante é o que ainda NÃO está impresso. Só existem dois status desde
 * 28/08/2026 (Aguardando e Impresso); um 'Parcial' legado gravado antes disso
 * cai em Aguardando no normalizador e conta como restante inteiro — a conta
 * erra sempre para o lado de sobrar, nunca para o de faltar.
 */
function contaDoProduto(itens) {

    let total = 0;

    let impressa = 0;

    (itens || []).forEach(it => {

        const q = parseInt(it.qtd !== undefined && it.qtd !== null ? it.qtd : it.quantidade) || 0;

        total += q;

        if (normalizarStatusImpressao(it.status_impressao || it.impressao) === 'Impresso') {
            impressa += q;
        }

    });

    return { total, impressa, restante: Math.max(0, total - impressa) };
}
window.contaDoProduto = contaDoProduto;



/**
 * A cor do modelo, resolvida do jeito que a fila sempre resolveu.
 *
 * O ERP grava a cor de duas maneiras — o id (`amostra_cor_id`) e o nome escrito
 * à mão (`cor`/`padrao`) —, e nem sempre as duas. A ordem abaixo é a que a
 * linha da fila já usava: o id primeiro, o nome exato depois, e só então o
 * aproximado.
 *
 * Virou função porque agora tem DOIS leitores: a bolinha de cor da linha e o
 * filtro por cor do cabeçalho do produto. Se cada um resolvesse a cor por conta
 * própria, o filtro esconderia linhas que a bolinha pinta — e o operador não
 * teria como saber qual dos dois está certo.
 */
function resolverCorDoModelo(item, coresDoFormato) {

    const coresItem = coresDoFormato || [];

    let selectedCorId = null;

    const corIdAtual   = item.amostra_cor_id ? String(item.amostra_cor_id) : null;
    const corNomeAtual = item.cor || item.padrao || '';

    if (corIdAtual) {
        const found = coresItem.find(c => String(c.id) === corIdAtual);
        if (found) selectedCorId = String(found.id);
    }
    if (!selectedCorId && corNomeAtual) {
        const exactMatch = coresItem.find(c => globalNormStr(c.name) === globalNormStr(corNomeAtual));
        if (exactMatch) {
            selectedCorId = String(exactMatch.id);
        } else {
            const fuzzyMatch = coresItem.find(c => globalFuzzyMatch(c.name, corNomeAtual));
            if (fuzzyMatch) selectedCorId = String(fuzzyMatch.id);
        }
    }

    let selectedCorObj = null;
    if (selectedCorId) {
        selectedCorObj = coresItem.find(c => String(c.id) === String(selectedCorId));
    }
    if (!selectedCorObj && corIdAtual) {
        selectedCorObj = (state.cores || []).find(c => String(c.id) === String(corIdAtual));
    }
    if (!selectedCorObj && corNomeAtual) {
        selectedCorObj = (state.cores || []).find(c => globalNormStr(c.name) === globalNormStr(corNomeAtual) || globalFuzzyMatch(c.name, corNomeAtual));
    }

    const corRefHex = selectedCorObj ? (selectedCorObj.cor_referencia || selectedCorObj.hex || '') : '';

    // O rótulo é o nome do catálogo quando ele existe, e o texto do ERP quando
    // não: modelo cuja cor não bate com nenhuma cadastrada continua tendo cor no
    // papel, e deixá-lo de fora do filtro faria o operador achar que ele sumiu.
    const rotulo = (selectedCorObj && selectedCorObj.name) || String(corNomeAtual || '').trim();

    const chave = rotulo ? globalNormStr(rotulo) : '__sem_cor__';

    return { selectedCorId, selectedCorObj, corRefHex, rotulo, chave };
}
window.resolverCorDoModelo = resolverCorDoModelo;



/** A cor escolhida no cabeçalho de cada produto, uma por caixa. */
function filtroDeCorDaFila() {
    if (!state.filtroCorDaFila) state.filtroCorDaFila = {};
    return state.filtroCorDaFila;
}
window.filtroDeCorDaFila = filtroDeCorDaFila;



/**
 * O botão "Aguardando", no topo da página, está ligado?
 *
 * Fica em `state` e não no botão porque a fila se redesenha a cada campo salvo:
 * quem guarda a escolha na tela a perde na primeira troca de modelo.
 */
function soAguardandoLigado() {
    return !!state.filtroSoAguardando;
}
window.soAguardandoLigado = soAguardandoLigado;



/** Liga e desliga o "Aguardando" do topo da página. */
function alternarSoAguardando() {
    state.filtroSoAguardando = !soAguardandoLigado();
    aplicarFiltrosDaFila();
    desmarcarModelosEscondidos();
}
window.alternarSoAguardando = alternarSoAguardando;



/**
 * O botão diz, ele mesmo, se está ligado.
 *
 * Sem isto o operador veria uma lista mais curta do que o pedido tem e não
 * teria na tela o que a encurtou — nem como desfazer.
 */
function pintarBotaoSoAguardando() {

    const btn = document.getElementById('btn-ped-so-aguardando');

    if (!btn) return;

    const ligado = soAguardandoLigado();

    btn.classList.toggle('active', ligado);

    btn.setAttribute('aria-pressed', ligado ? 'true' : 'false');

    btn.title = ligado
        ? 'Mostrando só os modelos que ainda não foram impressos. Clique para ver todos.'
        : 'Mostrar só os modelos que ainda não foram impressos';

}
window.pintarBotaoSoAguardando = pintarBotaoSoAguardando;



/**
 * Os dois filtros da fila escondem linhas, NÃO redesenham a fila.
 *
 * São dois, e eles se somam: a COR, escolhida no cabeçalho de cada produto, e o
 * AGUARDANDO, do topo da página, que vale para a fila inteira. Uma linha só fica
 * na tela se passar pelos dois.
 *
 * Redesenhar custa caro aqui — cada linha carrega um `<select>` de todas as
 * numerações e outro de todas as cores, e é por isso que os redesenhos já
 * andam agrupados em `agendarRedesenhoDasFilas`. Filtrar é um gesto de olhar,
 * não de salvar: nada vai ao banco, e as escolhas ficam guardadas em memória
 * para sobreviver ao próximo redesenho, que as reaplica no fim.
 */
function aplicarFiltrosDaFila() {

    const filtros = filtroDeCorDaFila();

    const soAguardando = soAguardandoLigado();

    let visiveisNaTela = 0;

    document.querySelectorAll('#ped-os-queue-body [data-caixa-cor]').forEach(caixa => {

        const escolhida = filtros[caixa.getAttribute('data-caixa-cor')] || '';

        let visiveisNaCaixa = 0;

        caixa.querySelectorAll('tr[data-cor-chave]').forEach(tr => {

            const bateCor = !escolhida || tr.getAttribute('data-cor-chave') === escolhida;

            const bateStatus = !soAguardando || tr.getAttribute('data-impresso') !== 'sim';

            const mostra = bateCor && bateStatus;

            tr.style.display = mostra ? '' : 'none';

            if (mostra) visiveisNaCaixa++;

        });

        // Produto sem nenhuma linha na tela sai junto: sobraria um cabeçalho
        // solto, com a conta de um produto cujos modelos nenhum aparece.
        caixa.style.display = visiveisNaCaixa ? '' : 'none';

        visiveisNaTela += visiveisNaCaixa;

    });

    // Tela vazia precisa dizer por que está vazia, e como sair dali.
    const recado = document.getElementById('ped-fila-vazia');

    if (recado) recado.style.display = (soAguardando && visiveisNaTela === 0) ? 'block' : 'none';

    pintarBotaoSoAguardando();

    // MODELO ESCONDIDO FECHA A JANELA.
    //
    // A janela agora mora dentro da fila, logo abaixo do modelo aberto. Se o
    // filtro de cor ou o "so Aguardando" esconde justamente esse modelo, a
    // janela ficaria pendurada embaixo de nada — e continuaria mandando na
    // impressao de um modelo que o operador nao ve mais. E' o mesmo motivo da
    // desmarcarModelosEscondidos() logo abaixo, aplicado a janela.
    if (state.activeOSItem) {
        const linhaAberta = document.getElementById(`ped-queue-row-${state.activeOSItem.itemId}`);
        if (linhaAberta && linhaAberta.style.display === 'none') {
            fecharJanelaDoModelo();
        }
    }

}
window.aplicarFiltrosDaFila = aplicarFiltrosDaFila;



/**
 * Modelo escondido pelo filtro sai da seleção.
 *
 * "Imprimir selecionados" imprime o que está MARCADO, não o que está na tela.
 * Sem isto, filtrar por Vermelho depois de ter marcado um Azul deixaria o Azul
 * marcado fora de vista — e ele sairia na folha junto. Folha impressa errada é
 * refugo, e o operador não teria como ver de onde veio.
 */
function desmarcarModelosEscondidos() {

    const marcados = state.selectedOSItems || [];

    if (!marcados.length) return;

    const restantes = marcados.filter(sel => {
        const tr = document.getElementById(`ped-queue-row-${sel.itemId}`);
        return !tr || tr.style.display !== 'none';
    });

    if (restantes.length === marcados.length) return;

    state.selectedOSItems = restantes;

    renderPedOSQueue();

    if (typeof atualizarBarraDeSoma === 'function') atualizarBarraDeSoma();

    if (typeof drawPedPreview === 'function') drawPedPreview();

}



/** Guarda a cor escolhida no cabeçalho do produto e reaplica o filtro. */
function filtrarFilaPorCor(chaveDaCaixa, chaveDaCor) {
    filtroDeCorDaFila()[chaveDaCaixa] = chaveDaCor || '';
    aplicarFiltrosDaFila();
    desmarcarModelosEscondidos();
}
window.filtrarFilaPorCor = filtrarFilaPorCor;



function renderPedOSQueue() {
    const container = document.getElementById( 'ped-os-queue' );
    const wrapper = document.getElementById( 'ped-os-queue-body' );
    if (!container || !wrapper) return;

    // A fila desenha o PEDIDO ABERTO, e nao o modelo ativo: desde 28/08/2026 a
    // tela abre sem nenhum modelo selecionado, e fechar a janela deixa
    // `activeOSItem` nulo. Lendo so o modelo ativo, a fila inteira sumiria da
    // tela no primeiro clique de fechar.
    const activeItem = state.activeOSItem || null;
    const osId = (state.pedidoAberto && state.pedidoAberto.osId)
        || (activeItem && activeItem.osId);
    if (!osId) {
        container.style.display = 'none';
        return;
    }

    const itens = typeof getOSItens === 'function' ? getOSItens(osId) : (state.osItens[osId] || []);
    if (!itens.length) {
        container.style.display = 'none';
        return;
    }

    // Não selecionar item automaticamente. O usuário deve clicar explicitamente.

    // A JANELA SAI DA FILA ANTES DE A FILA SER REESCRITA.
    // O `innerHTML` la embaixo destroi tudo o que estiver dentro do corpo da
    // fila. Com a janela dentro, ela seria destruida junto — canvas em branco,
    // painel de impressao remontado, bandeja e papel de volta ao padrao. Ela
    // volta para baixo do modelo aberto no fim desta funcao.
    recolherJanelaParaCasa();

    container.style.display = 'block';

    const groups = {};
    itens.forEach(item => {
        const prodId = item._vibe_id_produto || 'sem_produto';
        if (!groups[prodId]) groups[prodId] = [];
        groups[prodId].push(item);
    });

    console.log('[renderPedOSQueue] state.produtosGlobais:', state.produtosGlobais);
    console.log('[renderPedOSQueue] groups keys:', Object.keys(groups));

    const todasCores = state.cores || [];
    const todasNums = state.numeracoes || [];
    // ── A ESCALA DA FILA (29/08/2026) ───────────────────────────────────────
    //
    // Estes tamanhos foram desenhados quando a tela abria com `zoom: 0.8`: a
    // fonte de 1,2rem chegava aos olhos como ~15 px. Tirado o zoom, a fila
    // passou a desenhar 25% maior do que sempre foi, e o usuario descreveu a
    // distorcao com precisao: a fila ficava melhor a 80%, e a janela de
    // visualizacao — que usa os tamanhos do proprio aplicativo — ficava melhor
    // a 100%. Duas escalas na mesma tela, e nenhum zoom que servisse as duas.
    //
    // Entao a escala desceu para onde ela ja estava DE FATO na tela: cada
    // medida daqui e' a de antes multiplicada por 0,8. A fila continua sendo a
    // parte de fonte maior da pagina (0,96rem contra os 0,8rem da janela),
    // porque ela e' lida em pe, na frente da impressora — o que mudou e' que
    // agora as duas convivem no mesmo 100%.
    //
    // NAO devolva estes numeros ao tamanho antigo sem devolver o zoom junto.
    const inputStyle = 'background:#030a00; border:1px solid #334155; border-radius:4px; color:#ffffff; padding:6px 8px; font-size:0.96rem; width:100%;';
    const selectStyle = 'appearance: none; -webkit-appearance: none; -moz-appearance: none; background: #030a00; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #ffffff; padding: 6px 9px; font-size: 0.92rem; width: 100%; max-width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; cursor: pointer; text-align: center; text-align-last: center; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.3); transition: all 0.2s ease;';
    // Os dois estilos "Disabled" que moravam aqui sairam em 29/08/2026, junto
    // com o unico controle que os usava: o seletor de Formato do produto, que
    // nascia desabilitado sempre que o produto tinha formato padrao — o caso
    // normal — e servia so' de rotulo.
    const selectHeaderStyle = 'background:#1e293b; border:1px solid #918f8c; border-radius:4px; color:#f1f5f9; padding:3px 7px; font-size:0.78rem; cursor:pointer;';

    let html = '';

    for (const prodId of Object.keys(groups)) {
        const groupItens = groups[prodId];
        let nomeReal = 'Produto Desconhecido';
        let setorPcp = '';
        let formatoPadraoId = null;
        
        if (prodId !== 'sem_produto') {
            const prodObj = (state.produtosGlobais || []).find(p => String(p.id_produto) === String(prodId));
            if (prodObj) {
                nomeReal = prodObj.nomeReal || `Produto #${prodId}`;
                setorPcp = prodObj.setor_pcp || '';
                if (prodObj.id_formato) {
                    const fmtObj = (state.formatos || []).find(f => String(f.id_formato_num) === String(prodObj.id_formato));
                    if (fmtObj) formatoPadraoId = fmtObj.id;
                }
            } else {
                nomeReal = `Produto #${prodId}`;
            }
        }

        const setorBadge = setorPcp ? `<span class="badge bg-secondary ms-2" style="font-size:0.7rem; vertical-align:middle; color: #ffffff;">${setorPcp}</span>` : '';

        // Box level Formato & Saida calculation
        let boxFmtSel = formatoPadraoId || (groupItens[0].formato_id || '');
        
        // If there's a forced formato, auto-apply it to all items if missing
        if (formatoPadraoId) {
            groupItens.forEach(item => {
                if (String(item.formato_id) !== String(formatoPadraoId)) {
                    item.formato_id = formatoPadraoId;
                    setTimeout(() => autoSaveOSItemField(item.id, osId, 'formato_id', formatoPadraoId), 10);
                }
                if (!item.saida_id) {
                    const fObj = (state.formatos || []).find(f => String(f.id) === String(formatoPadraoId));
                    if (fObj && fObj.default_saida_id) {
                        item.saida_id = fObj.default_saida_id;
                        setTimeout(() => autoSaveOSItemField(item.id, osId, 'saida_id', fObj.default_saida_id), 10);
                    }
                }
            });
        }

        // ── O que o cabeçalho do produto diz: quanto tem e quanto falta ──────
        //
        // A conta é do PRODUTO inteiro, somando todos os modelos da caixa, e NÃO
        // segue o filtro de cor ao lado — de propósito: o total do produto é o
        // mesmo com o filtro ligado ou desligado, e um número que encolhesse ao
        // escolher uma cor já seria outra coisa.
        const conta = contaDoProduto(groupItens);

        const qtdTotalProduto = conta.total;

        const qtdRestanteProduto = conta.restante;

        // A cor de cada modelo, resolvida UMA vez: alimenta a lista do filtro
        // aqui em cima e a bolinha de cada linha lá embaixo.
        const coresDaCaixa = todasCores.filter(c => !boxFmtSel || !c.formato_id || String(c.formato_id) === String(boxFmtSel));

        const corPorItem = new Map();
        const coresDosModelos = new Map();

        groupItens.forEach(it => {

            const c = resolverCorDoModelo(it, coresDaCaixa);

            corPorItem.set(String(it.id), c);

            const jaVista = coresDosModelos.get(c.chave);

            if (jaVista) {
                jaVista.n += 1;
            } else {
                coresDosModelos.set(c.chave, { rotulo: c.rotulo || 'Sem cor', hex: c.corRefHex, n: 1 });
            }

        });

        // TRES NUMEROS, E NAO DOIS (28/08/2026).
        //
        // Antes o selo dizia Total e Restante. Faltava o do meio, que e' o que o
        // operador quer saber olhando a caixa: quanto ja saiu. A conta de
        // impressas ja existia no `contaDoProduto` e nao chegava a tela.
        //
        // Fica no CENTRO da linha do produto, entre o nome e os seletores.
        const qtdImpressaProduto = conta.impressa;

        const resumoDoProduto = qtdTotalProduto > 0 ? `
                    <span style="display:inline-flex; align-items:center; gap:8px;
                                 padding:3px 14px; background:#1e293b; border:1px solid #918f8c;
                                 border-radius:6px; font-size:0.8rem; font-weight:700; white-space:nowrap;"
                          title="Soma das quantidades de todos os modelos deste produto: quanto tem, quanto já saiu e quanto falta">
                        <span style="color:#94a3b8; font-weight:600;">Total:</span>
                        <span style="color:#ffffff;">${qtdTotalProduto.toLocaleString('pt-BR')}</span>
                        <span style="color:#918f8c;">-</span>
                        <span style="color:#94a3b8; font-weight:600;">Impressas:</span>
                        <span style="color:#22c55e;">${qtdImpressaProduto.toLocaleString('pt-BR')}</span>
                        <span style="color:#918f8c;">-</span>
                        <span style="color:#94a3b8; font-weight:600;">Faltam:</span>
                        <span style="color:${qtdRestanteProduto > 0 ? '#f59e0b' : '#22c55e'};">${qtdRestanteProduto.toLocaleString('pt-BR')}</span>
                    </span>` : '';

        // ── O filtro por cor deste produto ──────────────────────────────────
        //
        // Só lista as cores que os modelos DESTE produto têm — não o catálogo
        // inteiro de cores. Uma opção que não esconde nem mostra nada é uma
        // opção que faz o operador duvidar do filtro.
        const chaveDaCaixa = `${osId}::${prodId}`;

        // Cor que sumiu da caixa (o modelo mudou de cor, ou o pedido é outro)
        // deixaria a lista inteira escondida, sem nada na tela explicando por
        // quê. Some com o filtro junto.
        if (filtroDeCorDaFila()[chaveDaCaixa] && !coresDosModelos.has(filtroDeCorDaFila()[chaveDaCaixa])) {
            filtroDeCorDaFila()[chaveDaCaixa] = '';
        }

        const corEscolhida = filtroDeCorDaFila()[chaveDaCaixa] || '';

        const coresFiltroOptions = Array.from(coresDosModelos.entries())
            .sort((a, b) => String(a[1].rotulo).localeCompare(String(b[1].rotulo), 'pt-BR'))
            .map(([chave, info]) => {
                const sel = chave === corEscolhida ? 'selected' : '';
                const optStyle = info.hex ? `background-color: ${info.hex}; color: #000000; font-weight: bold;` : '';
                return `<option value="${chave}" ${sel} style="${optStyle}">${escHtmlSimples(info.rotulo)} (${info.n})</option>`;
            }).join('');

        // Os botões "📄 PDF Sel." e "🖨️ Imp. Sel." moravam aqui e saíram em
        // 18/08/2026. Eles chamavam `runImposition` — a função da ABA IMPOSIÇÃO —
        // e pediam de volta um PDF que ela nunca devolve: o `returnBlob` só pula
        // a janela de "onde salvar". A lista de arquivos ficava vazia, o modal de
        // impressão nunca abria por ali, e quem tratava a resposta do motor era a
        // outra função, salvando os arquivos um a um. Com "cada modelo em folha
        // própria" o motor devolve VÁRIOS arquivos, e só o primeiro chegava ao
        // operador: marcar dois modelos imprimia um.
        //
        // Não foi consertado, foi removido: as mesmas duas ações já existem no
        // painel, em "Gerar PDF" e "Imprimir", pelo caminho que a gráfica usa
        // todo dia. Dois caminhos para a mesma coisa foi o que produziu o
        // defeito, e o segundo não tinha nada a mais.
        // O SELETOR DE FORMATO DO PRODUTO SAIU DAQUI (29/08/2026, pedido do
        // usuario). Ele so' era editavel quando o produto NAO tinha formato
        // padrao; com formato padrao — o caso normal — nascia desabilitado e
        // servia de rotulo, mostrando "Triband" numa caixa cinza que ninguem
        // podia mexer. O formato continua vindo do ERP e continua sendo aplicado
        // a cada modelo logo acima, no `formatoPadraoId`; o que saiu foi a
        // caixinha, nao a regra.
        //
        // Os botões "📄 PDF Sel." e "🖨️ Imp. Sel." também moravam aqui e saíram
        // em 18/08/2026. Eles chamavam `runImposition` — a função da ABA
        // IMPOSIÇÃO — e pediam de volta um PDF que ela nunca devolve. Com "cada
        // modelo em folha própria" o motor devolve VÁRIOS arquivos, e só o
        // primeiro chegava ao operador: marcar dois modelos imprimia um. Não foi
        // consertado, foi removido: as mesmas duas ações já existem em "Gerar
        // PDF" e "Imprimir", pelo caminho que a gráfica usa todo dia.
        const headerDropdowns = `
            <div style="display:flex; gap:10px; align-items:center;" onclick="event.stopPropagation()">
                <select style="${selectHeaderStyle}" onchange="filtrarFilaPorCor('${chaveDaCaixa}', this.value)" title="Mostrar só os modelos desta cor">
                    <option value="">— Todas as cores —</option>
                    ${coresFiltroOptions}
                </select>
                <span id="box-arrow-${prodId}-renderPedOSQueue" style="color:var(--text-dim); font-size:0.8rem; transition: transform 0.2s; margin-left:5px; cursor:pointer;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">▼</span>
            </div>
        `;

        // ── O CABECALHO DE COLUNA ───────────────────────────────────────────
        //
        // Ate 28/08/2026 cada linha carregava os proprios rotulos: QTD, NI, NF,
        // Bloco, COR, Num., Verso e Status escritos DENTRO de cada celula, em
        // cada linha. Oito rotulos vezes N linhas empurravam a largura da linha
        // para ~2.130 px, e era isso que obrigava a pagina a abrir com zoom de
        // 0,8 — encolhendo 20% tudo o que foi feito grande de proposito para
        // leitura em pe, na frente da impressora.
        //
        // CAIXA MISTURADA CONTINUA COM OS ROTULOS NA LINHA. As quatro colunas do
        // meio mudam de significado no CAMAROTE (Q_CAM, L_CAM, C_INI no lugar de
        // QTD, NI, NF): um cabecalho so mentiria para metade das linhas. E' raro,
        // e vale mais um cabecalho ausente do que um cabecalho errado.
        const temCamarote = groupItens.some(it => modeloEhCamarote(it));
        const temComum = groupItens.some(it => !modeloEhCamarote(it));
        const comRotulosNaLinha = temCamarote && temComum;

        // ── A REPARTICAO DA LARGURA (29/08/2026) ────────────────────────────
        //
        // Pedido do usuario: os campos de Qtd, N. inicial, N. final, Bloco e Cor
        // a 65% da largura que tinham, e o que sobrar vai para o NOME DO MODELO.
        //
        // A conta faz sentido: aqueles campos guardam numeros de tres ou quatro
        // digitos e nunca precisaram do espaco que ocupavam, enquanto o nome do
        // modelo — que e' por onde o operador reconhece a peca — vinha cortado.
        // Os 230 px liberados vao inteiros para ele: 150 px viram 380.
        const L_NUM = 72;    // era 110 — os quatro campos numericos
        const L_COR = 124;   // era 190
        const L_NOME = 380;  // era 150

        const th = (txt, largura) =>
            `<th style="padding:3px 8px; width:${largura}px; font-size:0.72rem; font-weight:700; color:#94a3b8;
                        text-transform:uppercase; letter-spacing:0.06em; text-align:left; white-space:nowrap;">${txt}</th>`;

        const cabecalhoDaTabela = comRotulosNaLinha ? '' : `
                    <thead>
                        <tr>
                            ${th('', 34)}${th('Código', 84)}${th('Modelo', L_NOME)}
                            ${temCamarote
                                ? th('Q_CAM', L_NUM) + th('L_CAM', L_NUM) + th('C_INI', L_NUM) + th('Bloco', L_NUM)
                                : th('Qtd', L_NUM) + th('N. inicial', L_NUM) + th('N. final', L_NUM) + th('Bloco', L_NUM)}
                            ${th('Cor', L_COR)}${th('Numeração', 200)}${th('Verso', 120)}${th('Status', 150)}
                        </tr>
                    </thead>`;

        html += `
        <div class="card mb-3" style="background:#1e293b; border: 1px solid #918f8c; border-radius: 6px; overflow:hidden; margin-bottom: 6pt;" data-setor="${setorPcp}" data-caixa-cor="${chaveDaCaixa}">
            <div class="card-header" style="background:#0f172a; padding: 10px 15px; border-bottom:1px solid #918f8c; display:flex; align-items:center; gap:14px;">
                <div style="cursor:pointer; display:flex; align-items:center; flex:1 1 0; min-width:0;" onclick="toggleBox('box-body-${prodId}-renderPedOSQueue', 'box-arrow-${prodId}-renderPedOSQueue')">
                    <h5 class="mb-0" style="color: #facc15; font-size: calc(0.9rem + 2pt); font-weight:bold;">
                        ${nomeReal} ${setorBadge}
                    </h5>
                </div>
                <div style="flex:0 0 auto;">${resumoDoProduto}</div>
                <div style="flex:1 1 0; display:flex; justify-content:flex-end; min-width:0;">${headerDropdowns}</div>
            </div>
            <div class="table-responsive" id="box-body-${prodId}-renderPedOSQueue" style="padding: 0 3pt;">
                <table class="data-table table-dark table-sm mb-0 align-middle" style="font-size:0.85rem; margin:0; width:100%; table-layout: fixed; border-collapse: separate; border-spacing: 0 10pt;">
                    ${cabecalhoDaTabela}
                    <tbody>
        `;

        html += groupItens.map((item, idx) => {
            const isActive = !!activeItem && String(activeItem.itemId) === String(item.id);
            const isSelected = state.selectedOSItems && state.selectedOSItems.find(s => String(s.itemId) === String(item.id));
            const rawStatus = String(item.status_impressao || item.impressao || 'Aguardando').toUpperCase();

            let statusBg = '#3143c3'; // Aguardando
            if (rawStatus.includes('IMPRESSO')) {
                statusBg = '#090b19'; // Impresso
            }
            if (isSelected || isActive) {
                statusBg = '#2c1669'; // Selecionado / Aberto
            }

            // O contorno saiu do style inline e virou classe: `marcada` (entra na
            // folha combinada) e `aberta` (a janela esta logo abaixo) passaram a
            // ser estados DIFERENTES, e trocar de modelo aberto virou uma troca
            // de classe em duas linhas, sem redesenhar a fila. Ver o CSS em
            // style.css e a pintarLinhaAberta().
            const classesDaLinha = 'hover-row fila-linha'
                + (isSelected ? ' marcada' : '')
                + (isActive ? ' aberta' : '');
            const rowBg = `background: ${statusBg};`;

            let itemFmtId = boxFmtSel;

            const coresItem = coresDoFormato(itemFmtId);
            const numsItem  = numeracoesDoFormato(itemFmtId);

            // A cor já foi resolvida na volta que montou a conta do produto e a
            // lista do filtro — a bolinha da linha e o filtro do cabeçalho leem
            // a MESMA resposta, e ninguém paga o casamento aproximado duas vezes.
            const corDoItem = corPorItem.get(String(item.id)) || resolverCorDoModelo(item, coresItem);
            const selectedCorId = corDoItem.selectedCorId;
            const corRefHex = corDoItem.corRefHex;

            // SO A OPCAO ESCOLHIDA NASCE NO HTML. A lista inteira entra quando o
            // operador for abrir o seletor — ou pela rede de seguranca, 1,5 s
            // depois. Ver encherSeletorDaFila().
            const corEscolhidaObj = selectedCorId ? coresItem.find(c => String(c.id) === selectedCorId) : null;
            const coresOptions = corEscolhidaObj
                ? `<option value="${corEscolhidaObj.id}" selected>${corEscolhidaObj.name}</option>`
                : '';

            // O texto do seletor de Cor calcula claro ou escuro pela tinta. Ate
            // 28/08/2026 era preto fixo, e o nome de uma tinta escura sumia
            // dentro da propria caixa. Ver textoLegivelSobre().
            const corSelectBg = corRefHex || '#1e293b';
            const corSelectTexto = corRefHex ? textoLegivelSobre(corRefHex) : '#ffffff';
            const corSelectStyle = `${selectStyle}; background-color: ${corSelectBg} !important; color: ${corSelectTexto} !important; font-weight: bold;`;

            let selectedNumId = null;
            const numIdAtual = item.numeracao_id ? String(item.numeracao_id) : (item.amostra_num_id ? String(item.amostra_num_id) : null);
            const numValDisplay = item.gabarito_operacional || item.numeracao || '';
            if (numIdAtual) {
                const found = numsItem.find(n => String(n.id) === numIdAtual);
                if (found) selectedNumId = String(found.id);
            }
            if (!selectedNumId && numValDisplay) {
                const exactMatch = numsItem.find(n => globalNormStr(n.name || n.tipo || '') === globalNormStr(numValDisplay));
                if (exactMatch) {
                    selectedNumId = String(exactMatch.id);
                } else {
                    const fuzzyMatch = numsItem.find(n => globalFuzzyMatch(n.name || n.tipo || '', numValDisplay));
                    if (fuzzyMatch) {
                        selectedNumId = String(fuzzyMatch.id);
                    }
                }
            }
            const numEscolhidaObj = selectedNumId ? numsItem.find(n => String(n.id) === selectedNumId) : null;
            const numsOptions = numEscolhidaObj
                ? `<option value="${numEscolhidaObj.id}" selected>${numEscolhidaObj.name || numEscolhidaObj.tipo}</option>`
                : '';

            const niVal = item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || '');
            const qtdVal = item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || '');
            const blocoVal = item.bloco !== undefined && item.bloco !== null ? item.bloco : '';
            const nomeDoModelo = item.produto || '--';

            // Obter a numeração selecionada e resolver se é TICKET
            const selectedNum = (state.numeracoes || []).find(n => String(n.id) === String(selectedNumId));
            let ticket_qtd = 1;
            if (selectedNum && selectedNum.tipo === 'TICKET') {
                ticket_qtd = parseInt(selectedNum.ticket_qtd) || 1;
            }

            const niValNum = parseInt(niVal) || 1;
            const qtdValNum = parseInt(qtdVal) || 0;
            const nfCalculado = qtdValNum > 0 ? (niValNum + (qtdValNum * ticket_qtd) - 1) : '';

            // Detectar CAMAROTE
            const isCamarote = selectedNum && (selectedNum.tipo === 'CAMAROTE' || selectedNum.type === 'CAMAROTE');
            const qCamVal = item.q_cam || item.Q_CAM || item.qtd_locais || item.qtd_cam || '';
            const lCamVal = item.l_cam || item.L_CAM || item.lotacao_cam || item.lotacao || item.lotacao_por_local || '';
            const cIniVal = item.c_ini || item.C_INI || 1;
            // CAMAROTE: Bloco = L_CAM
            const blocoFinal = isCamarote ? (parseInt(lCamVal) || 1) : blocoVal;

            const jsItemId = item.id;
            const jsOsId = osId;

            // O rotulo dentro da celula so' sobrevive na caixa misturada, onde
            // nao ha cabecalho possivel. Ver o comentario do cabecalho acima.
            const rot = (txt, cor) => comRotulosNaLinha
                ? `<span style="font-size:0.84rem; font-weight:bold; color:${cor || '#ffffff'}; white-space:nowrap;">${txt}</span>`
                : '';

            // ── A TRAVA DA GERENCIA ─────────────────────────────────────────
            //
            // Vai em TODO campo que muda o que sai no papel ou o que o cliente
            // contratou. Fora dela, de proposito: o Status da impressao (marcar
            // o que ja saiu e' o trabalho normal) e a caixinha de marcar para a
            // folha combinada (escolhe o que imprimir, nao altera o modelo).
            const liberado = modeloEstaLiberado(item.id);
            const porteiro = `onmousedown="return travaDaGerencia(event, '${jsItemId}')"`
                + ` onkeydown="return travaDaGerencia(event, '${jsItemId}')"`;
            // `readonly` e nao `disabled`: campo desabilitado nao recebe evento
            // nenhum, e o operador clicaria nele sem a tela dizer por que nao
            // responde. Assim ele clica, o gesto e' barrado, e a caixa da senha
            // aparece explicando.
            const travaCampo = liberado ? '' : ` readonly data-trancado="1" ${porteiro}`;
            // Um so' conjunto de eventos por seletor: a porta trata a trava e o
            // preenchimento na ordem certa. Ver portaDoSeletor().
            const porta = `onmousedown="return portaDoSeletor(event, this, '${jsItemId}')"`
                + ` onfocus="return portaDoSeletor(event, this, '${jsItemId}')"`
                + ` onkeydown="return portaDoSeletor(event, this, '${jsItemId}')"`
                + ` ontouchstart="return portaDoSeletor(event, this, '${jsItemId}')"`;

            const cadeado = liberado
                ? `<span class="ped-cadeado liberado" title="Campos liberados neste modelo até fechar a janela dele.">&#128275;</span>`
                : `<span class="ped-cadeado" title="Qtd, N. inicial, Bloco, Cor, Numeração e Verso só mudam com a senha da gerência. Clique num deles para liberar." onclick="event.stopPropagation(); pedirSenhaDaGerencia('${jsItemId}')">&#128274;</span>`;

            return `
                <tr style="${rowBg} cursor: pointer; transition: background 0.2s;" class="${classesDaLinha}" id="ped-queue-row-${item.id}"
                    data-cor-chave="${corDoItem.chave}"
                    data-impresso="${normalizarStatusImpressao(item.status_impressao || item.impressao) === 'Impresso' ? 'sim' : 'nao'}"
                    onmouseenter="encherSeletoresDaLinha(this)"
                    onclick="alternarModeloAberto('${jsItemId}', '${jsOsId}')">
                    <td style="padding: 6px; width: 34px; text-align: center;">
                        <input type="checkbox" style="width: 16px; height: 16px; cursor: pointer;"
                               onclick="event.stopPropagation(); togglePedItemSelection('${jsItemId}', '${jsOsId}')"
                               ${isSelected ? 'checked' : ''} />
                    </td>
                    <td style="padding: 6px; font-size: 0.92rem; font-weight:600; color:#ffffff; min-width:84px;" title="Código do Modelo">
                        ${item.modelo || '--'}
                    </td>
                    <td style="padding: 6px; font-size: 0.92rem; font-weight:600; color:#ffffff; min-width:${L_NOME}px;" title="Nome do Modelo">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 18px; height: 18px; min-width: 18px; min-height: 18px; border-radius: 50%; background-color: ${corRefHex || 'transparent'}; border: ${corRefHex ? '2px solid rgba(255, 255, 255, 0.8)' : '2px dashed #918f8c'}; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.4);" title="Cor de referência: ${corRefHex || 'Nenhuma'}"></span>
                            <span>${nomeDoModelo}</span>
                            ${cadeado}
                        </div>
                    </td>
                    
                    ${isCamarote ? `
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Qtd. Locais (Q_CAM)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Q_CAM', '#f59e0b')}
                            <input type="number" min="0" value="${qCamVal}" style="${inputStyle}" placeholder="Q_CAM"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'q_cam', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Lotação por Local (L_CAM)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('L_CAM', '#f59e0b')}
                            <input type="number" min="1" value="${lCamVal}" style="${inputStyle}" placeholder="L_CAM"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'l_cam', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Início do Local (C_INI)">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('C_INI', '#f59e0b')}
                            <input type="number" min="1" value="${cIniVal}" style="${inputStyle}" placeholder="C_INI"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'c_ini', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Bloco = L_CAM">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Bloco', '#f59e0b')}
                            <input type="number" value="${blocoFinal}" style="${inputStyle}; opacity: 0.85;" placeholder="Bloco"
                                readonly
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    ` : `
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Quantidade">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('QTD')}
                            <input type="number" min="0" value="${qtdVal}" style="${inputStyle}" placeholder="Qtd"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'qtd', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Num. Inicial">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('NI')}
                            <input type="number" value="${niVal}" style="${inputStyle}" placeholder="N. inicial"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'num_inicial', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Num. Final">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('NF')}
                            <input type="number" value="${nfCalculado}" style="${inputStyle}; opacity: 0.85;" placeholder="N. final"
                                readonly
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    <td style="padding: 6px; width: ${L_NUM}px; min-width: ${L_NUM}px;" title="Ingressos por Bloco">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Bloco')}
                            <input type="number" value="${blocoVal}" style="${inputStyle}" placeholder="Bloco"
                                onchange="pedQueueUpdateField('${item.id}', '${osId}', 'bloco', this.value)"${travaCampo}
                                onclick="event.stopPropagation()" />
                        </div>
                    </td>
                    `}
                    <td style="padding: 6px; width: ${L_COR}px; min-width: ${L_COR}px;" title="Cor">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('COR')}
                            <select style="${corSelectStyle}" data-lista="cores" data-fmt="${itemFmtId || ''}"
                                    ${porta}
                                    onchange="pedQueueUpdateCor('${item.id}', '${osId}', this.value)" data-trancado="${liberado ? '' : '1'}" onclick="event.stopPropagation()">
                                ${coresOptions || '<option value="">— Cor —</option>'}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 6px; width: 200px; min-width: 200px;" title="Numeração">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Núm.')}
                            <select style="${selectStyle}" data-lista="nums" data-fmt="${itemFmtId || ''}"
                                    ${porta}
                                    onchange="pedQueueUpdateNum('${item.id}', '${osId}', this.value)" data-trancado="${liberado ? '' : '1'}" onclick="event.stopPropagation()">
                                ${numsOptions || '<option value="">— Numeração —</option>'}
                            </select>
                        </div>
                    </td>
                    <td style="padding: 6px; width: 120px; min-width: 120px;" title="Frente e Verso/Tipo de Verso">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Verso')}
                            <select style="${selectStyle}" ${liberado ? '' : porteiro} onchange="pedQueueUpdateField('${item.id}', '${osId}', 'verso_tipo', this.value)" data-trancado="${liberado ? '' : '1'}" onclick="event.stopPropagation()">
                                <option value="Frente" ${item.verso_tipo === 'Frente' || !item.verso_tipo ? 'selected' : ''}>Frente</option>
                                <option value="FxVerso" ${item.verso_tipo === 'FxVerso' ? 'selected' : ''}>FxVerso</option>
                            </select>
                        </div>
                    </td>
                    <td style="padding: 6px; width: 150px; min-width: 150px;" title="Status de Produção">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${rot('Status')}
                            <select style="${selectStyle}" onchange="pedQueueUpdateField('${item.id}', '${osId}', 'status_impressao', this.value)" onclick="event.stopPropagation()">
                                <option value="Aguardando" ${normalizarStatusImpressao(item.status_impressao) === 'Aguardando' ? 'selected' : ''}>Aguardando</option>
                                <option value="Impresso" ${normalizarStatusImpressao(item.status_impressao) === 'Impresso' ? 'selected' : ''}>Impresso</option>
                                <!-- O terceiro status (02/09/2026): a produção achou erro na
                                     arte e devolve o modelo ao designer. Trava a impressão
                                     DESTE modelo e traz o pedido de volta para o card "Em
                                     Arte". Ver STATUS_CORRIGIR_ARTE no script.js. -->
                                <option value="Corrigir Arte" ${typeof modeloEmCorrecaoDeArte === 'function' && modeloEmCorrecaoDeArte(item) ? 'selected' : ''}>🎨 Corrigir Arte</option>
                            </select>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    wrapper.innerHTML = html;
    aplicarFiltrosDaFila();

    // A janela volta para baixo do modelo aberto. Depois do filtro, de
    // propósito: se o filtro escondeu justamente o modelo aberto, a
    // aplicarFiltrosDaFila ja fechou a janela e nao ha para onde leva-la.
    if (state.activeOSItem) moverJanelaParaModelo(state.activeOSItem.itemId);

    updatePedImprimirButtonsVisibility();
    // Ver o comentário gêmeo em renderImpOSQueue: a barra é um nó fixo do HTML.
    if (typeof atualizarBarraDeSoma === 'function') atualizarBarraDeSoma();

}

function updatePedImprimirButtonsVisibility() {
    let activeIsImpresso = false;
    let activeEmCorrecaoDeArte = false;
    if (state.activeOSItem) {
        const itens = state.osItens[state.activeOSItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(state.activeOSItem.itemId));
        if (item) {
            const st = String(item.status_impressao || item.impressao || '').toUpperCase();
            if (st.includes('IMPRESSO')) {
                activeIsImpresso = true;
            }
            activeEmCorrecaoDeArte = typeof modeloEmCorrecaoDeArte === 'function'
                && modeloEmCorrecaoDeArte(item);
        }
    }

    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    const btnPreviewPrint = document.getElementById('ped-preview-btn-print');

    // O REFAZER MANDA MAIS QUE O "JA IMPRESSO".
    //
    // Modelo ja impresso perde o botao Imprimir, para nao duplicar tiragem por
    // engano. Mas com o Refazer ligado a regra se inverte: reimprimir uma faixa
    // de folhas so faz sentido depois que a tiragem saiu — a folha amassou.
    // Enquanto o Refazer tinha botao proprio isso se resolvia sozinho; agora
    // que existe UM par so, e' aqui que a excecao precisa morar, senao a
    // reimpressao ficaria inalcancavel justamente quando serve.
    //
    // "CORRIGIR ARTE" NAO TEM EXCECAO DE REFAZER (02/09/2026): o Refazer serve a
    // folha amassada, em que a arte esta certa. Aqui a arte esta ERRADA, e
    // reimprimir a faixa sairia com o mesmo erro. Por isso ele soma DEPOIS do
    // refazer, e nao antes. A trava do `runPedImposition` e' a ultima palavra;
    // esta so poupa o operador de descobrir clicando.
    const escondeImprimir = (activeIsImpresso && !(typeof refazerLigado === 'function' && refazerLigado()))
        || activeEmCorrecaoDeArte;

    if (btnImposePrint) {
        btnImposePrint.style.display = escondeImprimir ? 'none' : 'flex';
    }
    if (btnPreviewPrint) {
        btnPreviewPrint.style.display = escondeImprimir ? 'none' : 'flex';
    }

    // Trocar de modelo zera a caixa "Refazer" — uma faixa de folhas do modelo
    // anterior não quer dizer nada aqui, e deixá-la marcada leva a refazer a
    // coisa errada. Só dispara na troca, para não apagar o que está sendo
    // digitado a cada redesenho da lista.
    const chaveAtual = state.activeOSItem
        ? `${state.activeOSItem.osId}|${state.activeOSItem.itemId}`
        : '';
    if (window._pedRefazerUltimoItem !== chaveAtual) {
        const primeiraVez = window._pedRefazerUltimoItem === undefined;
        window._pedRefazerUltimoItem = chaveAtual;
        if (!primeiraVez && typeof resetRefazerControls === 'function') resetRefazerControls();
    }
}
window.updatePedImprimirButtonsVisibility = updatePedImprimirButtonsVisibility;






























window.renderPedOSQueue = renderPedOSQueue;

function togglePedOSQueue() {
    const body = document.getElementById('ped-os-queue-body');
    const arrow = document.getElementById('ped-os-queue-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
}
window.togglePedOSQueue = togglePedOSQueue;

window.togglePedCutStackOptions = function() {
    const schema = document.getElementById('ped-schema').value;
    const container = document.getElementById('ped-cut-stack-options');
    if (schema === 'cut_stack') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
};

window.togglePedMultiArtes = function() {

    const schema = document.getElementById('ped-schema').value;

    const isMulti = schema === 'multi_artes';

    const container = document.getElementById('ped-multi-artes-container');

    const startInput = document.getElementById('ped-start');

    const endInput = document.getElementById('ped-end');

    const dropArea = document.getElementById('ped-drop-area');

    const num1Select = document.getElementById('ped-numeracao');

    const num2Select = document.getElementById('ped-numeracao-2');



    if (isMulti) {

        container.style.display = 'block';

        if (startInput) startInput.parentElement.style.display = 'none';

        if (endInput) endInput.parentElement.style.display = 'none';

        if (dropArea) dropArea.style.display = 'none';

        const impInfo = document.getElementById('ped-file-info');

        if (impInfo) impInfo.style.display = 'none';

        if (num1Select) num1Select.parentElement.style.display = 'none';

        if (num2Select) num2Select.parentElement.style.display = 'none';

        

        if (state.impMultiArtes.length === 0) {

            addMultiArte(); // Add initial

        }

        renderMultiArtes();

    } else {

        container.style.display = 'none';

        if (startInput) startInput.parentElement.style.display = 'block';

        if (endInput) endInput.parentElement.style.display = 'block';

        if (dropArea) dropArea.style.display = 'flex'; // it's a flex container

        const impInfo = document.getElementById('ped-file-info');

        if (impInfo && impFile.files.length) impInfo.style.display = 'block';

        if (num1Select) num1Select.parentElement.style.display = 'block';

        if (num2Select) num2Select.parentElement.style.display = 'block';

    }

};

window.editPedidoCustomNumeracao = async function(fieldId) {
    const numSelect = document.getElementById(fieldId);
    if (!numSelect || !numSelect.value) {
        toast('Selecione uma numeração base primeiro antes de editar!', 'warning');
        return;
    }
    
    const impName = document.getElementById('ped-name').value.trim() || 'Modelo Imposição';
    const numId = numSelect.value;
    const baseNum = state.numeracoes.find(n => String(n.id) === String(numId));
    if (!baseNum) return;
    
    const activeOSItem = state.activeOSItem;
    console.log('[editPedidoCustomNumeracao] activeOSItem:', activeOSItem);
    let cliNum = null;
    if (activeOSItem) {
        const os = (state.ordens || []).find(o => String(o.id) === String(activeOSItem.osId) || String(o.id_int) === String(activeOSItem.osId));
        console.log('[editPedidoCustomNumeracao] Found OS:', os);
        if (os) cliNum = os.id_cliente;
    }
    console.log('[editPedidoCustomNumeracao] resolved cliNum:', cliNum);

    // Configura o state para que no saveNumeracao volte para Pedido
    window.customNumeracaoEditState = {
        view: 'pedido',
        fieldId: fieldId,
        modeloName: impName,
        cliNum: cliNum
    };
    
    // `await`: o `editNumeracao` espera o banco de dados da numeracao descer
    // (o catalogo vem sem ele desde 26/08/2026), e as linhas abaixo escrevem
    // no DOM que ele preenche.
    await editNumeracao(numId);
    
    // Força o nome no editor da numeração a ser o ID do modelo atual
    document.getElementById('num-name').value = String(activeOSItem.itemId);
    
    // Marca como um novo cadastro (clone)
    document.getElementById('num-id').value = '';
    toast(`Clonando base "${baseNum.name}" para edição customizada.`, 'info');
};

// `isRefazer` decide se a faixa da caixa "Refazer" entra no trabalho. Ele vem do
// botão clicado, NÃO do estado dos checkboxes: os botões principais (🚀 Gerar PDF
// e 🖨️ Imprimir) chamam sem ele e por isso sempre produzem o pedido inteiro.
// Antes, o payload lia os checkboxes diretamente, e uma caixa esquecida marcada
// fazia o botão principal imprimir só um pedaço da tiragem sem avisar ninguém.
/**
 * A ARTE DE UM MODELO, como a folha combinada da tela do Pedido a monta.
 *
 * Era o corpo do `tempMultiArtes` dentro da `runPedImposition`, e saiu de la
 * em 03/09/2026 sem mudar uma linha do que faz: a Montagem precisava montar a
 * MESMA arte para o mesmo modelo, e montava a sua propria — sem verso, sem o
 * filtro da amostra, sem a escala, sem a fatia do banco. Sete divergencias,
 * cada uma delas uma celula refeita diferente da original. Uma funcao so,
 * chamada pelas duas telas, e' o que impede a lista de crescer de novo.
 *
 * `s` e' `{ osId, itemId }`. `numIdReserva` e' a numeracao do seletor da tela,
 * que so' vale quando o modelo nao tem a sua. `opcoes.comPrevia === false`
 * pula o carregamento do PDF para a previa, que so' a tela do Pedido desenha.
 */
function arteDoModeloParaFolha(s, numIdReserva, opcoes) {
    const comPrevia = !opcoes || opcoes.comPrevia !== false;
    if (!state.multiArtesPdfCache) state.multiArtesPdfCache = {};
    if (!state.multiArtesPdfLoading) state.multiArtesPdfLoading = {};
    const sItem = state.osItens[s.osId]?.find(i => String(i.id) === String(s.itemId));
    const qt = sItem ? (parseInt(sItem.qtd !== undefined && sItem.qtd !== null ? sItem.qtd : (sItem.quantidade || 0))) : 0;

    const corObj = sItem && sItem.amostra_cor_id
        ? (state.cores || []).find(c => String(c.id) === String(sItem.amostra_cor_id))
        : (sItem ? (state.cores || []).find(c => globalFuzzyMatch(c.name, sItem.cor || sItem.padrao || '')) : null);
    // So arte de verdade vai ao motor. A amostra de aprovacao e a Cor
    // ficam de fora — ver frontend/arte-de-impressao.js. Sem arte, o
    // trabalho sai so com numeracao, que e o correto e o que sempre foi.
    //
    // Vale para a previa tambem, e de proposito: `itemArteUrl` alimenta
    // o cache de PDF que ela desenha. A previa tem de mostrar o que sai
    // no papel — se exibisse a amostra, prometeria o que nao sai.
    const itemArteUrl = arteParaImpor(sItem ? sItem.arte_url : null);

    const wantsDuplex = sItem ? (sItem.verso_tipo === 'FxVerso' || sItem.verso === true) : false;
    const itemArteVersoUrl = (sItem && wantsDuplex)
        ? arteParaImpor(sItem.verso_arte_url || sItem.url_arquivo_arte_verso)
        : null;

    let pdfDoc = null;
    if (itemArteUrl && state.multiArtesPdfCache[itemArteUrl]) {
        pdfDoc = state.multiArtesPdfCache[itemArteUrl];
    } else if (comPrevia && itemArteUrl && !state.multiArtesPdfLoading[itemArteUrl]) {
        state.multiArtesPdfLoading[itemArteUrl] = true;
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        fetch(itemArteUrl).then(r => r.arrayBuffer()).then(buf => {
            return pdfjsLib.getDocument({ data: buf }).promise;
        }).then(doc => {
            state.multiArtesPdfCache[itemArteUrl] = doc;
            if (typeof drawPedPreview === 'function') drawPedPreview();
        }).catch(e => {
            console.error('Error fetching PDF for multi arte preview:', e);
        }).finally(() => { delete state.multiArtesPdfLoading[itemArteUrl]; });
    }

    let pdfVersoDoc = null;
    if (itemArteVersoUrl && state.multiArtesPdfCache[itemArteVersoUrl]) {
        pdfVersoDoc = state.multiArtesPdfCache[itemArteVersoUrl];
    } else if (comPrevia && itemArteVersoUrl && !state.multiArtesPdfLoading[itemArteVersoUrl]) {
        state.multiArtesPdfLoading[itemArteVersoUrl] = true;
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        fetch(itemArteVersoUrl).then(r => r.arrayBuffer()).then(buf => {
            return pdfjsLib.getDocument({ data: buf }).promise;
        }).then(doc => {
            state.multiArtesPdfCache[itemArteVersoUrl] = doc;
            if (typeof drawPedPreview === 'function') drawPedPreview();
        }).catch(e => {
            console.error('Error fetching PDF VERSO for multi arte preview:', e);
        }).finally(() => { delete state.multiArtesPdfLoading[itemArteVersoUrl]; });
    }

    const filenameFromUrl = itemArteUrl && itemArteUrl.startsWith('http')
        ? decodeURIComponent(itemArteUrl.split('/').pop().split('?')[0])
        : null;
    const itemPdfName = filenameFromUrl || (sItem ? sItem.nome_arquivo_arte : null)
        || (corObj ? `${corObj.name}.pdf` : `Arte_${sItem ? sItem.modelo : 'Modelo'}.pdf`);

    return {
        qtd: qt,
        nome: sItem ? sItem.modelo : '',
        // Se este número chega ao papel ou não. Fica separado de `nome`
        // porque `nome` também alimenta as mensagens da tela ("o modelo
        // X não possui arte"), e essas continuam precisando do número.
        _imprimirNumero: (typeof imprimeNumeroDoModelo === 'function')
            ? imprimeNumeroDoModelo(sItem)
            : false,
        // A escala da arte é DE CADA MODELO: numa folha combinada o A
        // pode estar a 98% e o B a 100%. Ver `_escala_da_arte` no
        // engine.py, que lê estes dois campos por arte.
        _escalaH: (typeof escalaDaArteDoModelo === 'function')
            ? escalaDaArteDoModelo(sItem).h : 100,
        _escalaV: (typeof escalaDaArteDoModelo === 'function')
            ? escalaDaArteDoModelo(sItem).v : 100,
        // O pedido DESTE modelo, que entra na coluna do pool e no
        // conteudo do QR Ideal. Ver numeroDoPedidoDoItem() no script.js.
        _pedido: (typeof numeroDoPedidoDoItem === 'function')
            ? numeroDoPedidoDoItem(s.osId)
            : null,
        // Por onde a fatia do CSV chega ao payload. Ver o bloco que monta
        // `payloadMultiArtes`, mais abaixo.
        _itemId: s.itemId,
        _osId: s.osId,
        num1_id: sItem ? (sItem.amostra_num_id || sItem.numeracao_id || numIdReserva) : numIdReserva,
        num2_id: null,
        start: sItem ? parseInt(sItem.num_inicial !== undefined && sItem.num_inicial !== null ? sItem.num_inicial : (sItem.numeracao_inicio || 1)) : 1,
        has_raw_file: false,
        is_selected: true,
        amostra_cor_id: sItem ? sItem.amostra_cor_id : null,
        // O endereço da arte, que é o que o payload lê. Sem isto a folha
        // saía com a numeração e SEM arte nenhuma: o objeto trazia só o
        // `pdfDoc`, que serve à prévia e não ao motor. O gêmeo no
        // script.js sempre teve os três.
        pdf_url: itemArteUrl,
        pdf_verso_url: itemArteVersoUrl,
        pdf_name: itemPdfName,
        rawFile: null,
        nome_color: '#000000',
        pdfDoc: pdfDoc,
        pdfVersoDoc: pdfVersoDoc,
        bloco: sItem && sItem.bloco ? parseInt(sItem.bloco) : null,
        // `pedidos_modelos.id` — o modelo desta arte. O QR Ideal tira uma
        // coluna do pool por modelo; sem isto o motor recusa a folha.
        modelo: s.itemId || (sItem ? sItem.id : null)
    };
}
window.arteDoModeloParaFolha = arteDoModeloParaFolha;

/**
 * A arte como o MOTOR a recebe: numeracao resolvida pelo banco do pedido, a
 * fatia do modelo, a escala, o verso, o modelo e o pedido de cada arte.
 *
 * Era o corpo do `payloadMultiArtes` da `runPedImposition`; ver
 * `arteDoModeloParaFolha` logo acima para o motivo de ter saido de la.
 */
function arteParaOMotor(arte, isMultiSelected) {

    // Cada arte e um modelo do pedido, e cada modelo imprime a sua fatia
    // do banco. Sem isto, os oito modelos receberiam as mesmas linhas.
    // Espelha runImposition no script.js.
    const itArte = arte._itemId
        ? (state.osItens[arte._osId] || []).find(i => String(i.id) === String(arte._itemId))
        : null;

    // A ESCOLHA da numeracao continua pelo `num1_id` da arte; o que
    // entra e so a resolucao do banco do pedido (27/08/2026), que
    // devolve a propria numeracao quando o modelo nao tem vinculo.
    let numArte = state.numeracoes.find(n => String(n.id) === String(arte.num1_id)) || null;

    if (typeof resolverNumeracaoParaModelo === 'function') {
        numArte = resolverNumeracaoParaModelo(numArte, itArte);
    }

    let qtdArte = arte.qtd;

    if (numArte && numArte.csv_data && numArte.csv_data.length && arte._itemId
        && typeof fatiaCsvDoItem === 'function') {

        if (itArte && itArte.csv_selecao) {

            numArte = JSON.parse(JSON.stringify(numArte));

            numArte.csv_data = fatiaCsvDoItem(itArte, numArte);

            // So mexe na quantidade quando ha fatia: para o modelo movido
            // a CSV, quantos itens saem E quantas linhas ele leva.
            qtdArte = numArte.csv_data.length;

        } else if (itArte && typeof vinculoDeBancoDoModelo === 'function'
                   && typeof linhasDoModeloNoPayload === 'function'
                   && vinculoDeBancoDoModelo(itArte)) {
            // Sem distribuicao, o modelo com banco do PEDIDO leva a fatia
            // por coluna, limitada a quantidade (02/09/2026). Espelha o
            // script.js; ver `linhasDoModeloNoPayload` la.
            numArte = Object.assign({}, numArte,
                { csv_data: linhasDoModeloNoPayload(itArte, numArte) });
        }

    }

    return {

        qtd: qtdArte,

        pdf_url: arte.pdf_url,

        pdf_verso_url: arte.pdf_verso_url || null,

        pdf_name: arte.pdf_name,

        // O motor imprime este texto deitado na borda de cada item, e é
        // o único campo que decide se ele sai. Ao combinar modelos do
        // pedido quem manda é a opção do modelo, desmarcada por padrão.
        // Na Lista de Imposição (não é multi-seleção) o nome é digitado
        // à mão e continua valendo como sempre.
        nome: (isMultiSelected && !arte._imprimirNumero) ? '' : (arte.nome || ''),

        nome_color: arte.nome_color || '#000000',

        // A escala da arte DESTE modelo. Sem ela, o motor cairia na do
        // trabalho e todos os modelos da folha sairiam no mesmo tamanho.
        escala_h: arte._escalaH ?? 100,
        escala_v: arte._escalaV ?? 100,

        num1_id: arte.num1_id,

        num2_id: arte.num2_id,

        start: arte.start,

        numeracao: numArte,

        numeracao_2: state.numeracoes.find(n => String(n.id) === String(arte.num2_id)) || null,

        has_raw_file: !!arte.rawFile,

        q_cam: arte.q_cam || 0,

        l_cam: arte.l_cam || 1,

        // O modelo de CADA arte. Numa folha multi-artes o QR Ideal tira
        // uma coluna diferente do pool por modelo, então o motor precisa
        // saber de qual arte veio cada item. Sem isto ele recusa o
        // trabalho inteiro — e por isto o QR Ideal nunca imprimiu.
        modelo: arte.modelo || null,

        // E o pedido desta arte, pelo mesmo motivo: ele entra na coluna
        // do pool E no conteúdo do QR. Nulo significa "o pedido do
        // trabalho", que é o caso de toda folha de um pedido só.
        pedido: arte._pedido || null

    };
}
window.arteParaOMotor = arteParaOMotor;

window.runPedImposition = async function (mode, isRefazer) {

    // A gemea da linha que abre o `runImposition` no script.js. Sao duas telas
    // de imposicao, e toda regra de impressao precisa das duas -- esta garante
    // que o banco de dados das numeracoes esteja em maos antes do payload.
    if (typeof garantirCsvDoTrabalho === 'function') {
        await garantirCsvDoTrabalho(idsDeNumeracaoDoTrabalho('ped-numeracao'));
    }

    // E os bancos que sao do PEDIDO (01/09/2026). Esta era a tela do defeito do
    // 21460: ate aqui so a de Amostras os carregava, entao quem abrisse o pedido
    // e clicasse em Gerar PDF ou Imprimir mandava ao motor uma numeracao sem
    // linha nenhuma -- e o QR saia com o numero sequencial no lugar do codigo.
    // Ver `garantirBancosDoTrabalho` no script.js.
    if (typeof garantirBancosDoTrabalho === 'function' && typeof osIdsDoTrabalho === 'function') {
        await garantirBancosDoTrabalho(osIdsDoTrabalho());
        const semSaberDoBanco = typeof modelosComBancoNaoConferido === 'function'
            ? modelosComBancoNaoConferido() : [];
        if (semSaberDoBanco.length) {
            toast('Não consegui ler os bancos de dados deste pedido para: '
                + semSaberDoBanco.map((it, i) => rotuloDoModelo(it, i)).join(', ')
                + '. Imprimir agora sairia com número sequencial no lugar do código. '
                + 'Confira a conexão da estação e clique de novo.', 'error');
            return;
        }
    }

    // A mesma trava, do lado do banco que e do PEDIDO (27/08/2026): vinculo cujo
    // banco nao chegou imprimiria numero no lugar do nome, sem avisar.
    if (typeof modelosSemBancoDoTrabalho === 'function') {
        const semBancoDoPedido = modelosSemBancoDoTrabalho();
        if (semBancoDoPedido.length) {
            toast('O banco de dados não chegou para: '
                + semBancoDoPedido.map((it, i) => rotuloDoModelo(it, i)).join(', ')
                + '. Feche e abra o pedido de novo para baixá-lo — imprimir agora sairia '
                + 'com número no lugar do nome.', 'error');
            return;
        }
    }

    // E a trava da peca nova (28/08/2026), como no script.js: elemento de
    // banco sem coluna apontada imprime VAZIO, calado.
    if (typeof modelosComElementoSemColuna === 'function') {
        const semColuna = modelosComElementoSemColuna();
        if (semColuna.length) {
            toast('Há elemento de banco sem coluna apontada em: '
                + semColuna.map((it, i) => rotuloDoModelo(it, i)).join(', ')
                + '. Abra o 🔤 Colunas de cada um e aponte a coluna — imprimir agora '
                + 'sairia com o campo em branco.', 'error');
            return;
        }
    }

    // A gemea da trava de "Corrigir Arte" do runImposition (02/09/2026). Esta e
    // a tela por onde a gráfica imprime todo dia, entao ela precisa da trava
    // tanto quanto a outra. So o IMPRIMIR para; o PDF segue liberado.
    if (mode === 'print' && typeof modelosEmCorrecaoDeArte === 'function') {
        const emCorrecao = modelosEmCorrecaoDeArte();
        if (emCorrecao.length) {
            toast('Impressão travada — a arte está em correção em: '
                + emCorrecao.map((it, i) => rotuloDoModelo(it, i)).join(', ')
                + '. O pedido está no card "Em Arte" esperando o designer; quando ele '
                + 'marcar o modelo como PRONTO, a impressão libera sozinha.', 'error');
            return;
        }
    }

    if (window.isImposing) return;

    // Validar antes de bloquear a tela: uma faixa impossível tem de virar aviso
    // agora, não um PDF vazio três minutos depois.
    const refazer = typeof montarRefazerPayload === 'function'
        ? montarRefazerPayload(isRefazer === true)
        : { refazer_de: 0, refazer_ate: 0, refazer_set: 1, refazer_celulas: [], sufixo: '' };
    if (refazer.erro) {
        return toast(refazer.erro, 'error');
    }

    window.isImposing = true;
    window._printCancelRequested = false;

    const btnCancelPed = document.getElementById('ped-btn-cancel-print');
    if (btnCancelPed) btnCancelPed.style.display = 'inline-flex';
    const btnImpose = document.getElementById('ped-btn-impose');
    if (btnImpose) btnImpose.style.display = 'none';
    const btnImposePrint = document.getElementById('ped-btn-impose-print');
    if (btnImposePrint) btnImposePrint.style.display = 'none';

    // As validações abaixo desistem ANTES do try/finally que devolve a tela ao
    // normal. Sair delas com um `return` cru deixava `isImposing = true` e os
    // botões escondidos para sempre — só um F5 destravava. Toda desistência
    // daqui até o try passa por esta função.
    const desistir = (msg, tipo) => {
        window.isImposing = false;
        if (btnCancelPed) btnCancelPed.style.display = 'none';
        if (btnImpose) btnImpose.style.display = 'inline-flex';
        if (btnImposePrint) btnImposePrint.style.display = 'inline-flex';
        if (typeof updatePedImprimirButtonsVisibility === 'function') updatePedImprimirButtonsVisibility();
        if (msg) toast(msg, tipo || 'error');
    };


    let fmtId = document.getElementById('ped-formato').value;

    let numId = document.getElementById('ped-numeracao').value;

    let saiId = document.getElementById('ped-saida').value;

    let start = parseInt(document.getElementById('ped-start').value);

    let end = parseInt(document.getElementById('ped-end').value);

    let schema = document.getElementById('ped-schema').value;

    let isMultiSelected = false;
    let tempMultiArtes = null;

    if (!state.multiArtesPdfCache) state.multiArtesPdfCache = {};
    if (!state.multiArtesPdfLoading) state.multiArtesPdfLoading = {};

    if (state.selectedOSItems && state.selectedOSItems.length > 1) {
        isMultiSelected = true;
        // A mesma regra do runImposition, e a regra mora la: o modo salvo nos
        // modelos decide primeiro (Sequencial enche a folha na ordem), e dentro
        // de Blocado a barra escolhe entre folha propria e aproveitar a folha.
        // Ler daqui, e nao repetir a conta, e o que impede as duas telas de
        // divergirem de novo.
        schema = (typeof esquemaDaSelecaoCombinada === 'function')
            ? esquemaDaSelecaoCombinada()
            : 'cut_stack';
        tempMultiArtes = state.selectedOSItems.map(s => arteDoModeloParaFolha(s, numId));
    }

    const rotateEl = document.getElementById('ped-rotate-page');
    const rotatePage = rotateEl ? (parseInt(rotateEl.value) || 0) : 0;



    if (!fmtId) return desistir('Selecione um Formato.');

    if (!saiId) return desistir('Selecione uma Saída.');

    // Antes de abrir qualquer coisa: modelo sem nenhuma linha do banco cairia na
    // numeracao sequencial e sairia com numero no lugar do nome. A regra e a do
    // script.js — ver modeloSemLinhasDoBanco() la.
    // A mesma guarda do script.js: selecao de um pedido so, e todos carregados.
    if (typeof problemaNaSelecao === 'function') {
        const _selRuim = problemaNaSelecao();
        if (_selRuim) return desistir(_selRuim);
    }

    if (typeof recadoDeFatiaVazia === 'function') {
        const _semLinhas = recadoDeFatiaVazia(itensDaImposicao(isMultiSelected));
        if (_semLinhas) return desistir(_semLinhas);
    }

    // Linhas de MENOS que a quantidade do pedido (02/09/2026). Ver
    // `recadoDeLinhasDeMenos` no script.js.
    if (typeof recadoDeLinhasDeMenos === 'function') {
        const _linhasDeMenos = recadoDeLinhasDeMenos(itensDaImposicao(isMultiSelected));
        if (_linhasDeMenos) return desistir(_linhasDeMenos);
    }



    if (schema === 'multi_artes' || isMultiSelected) {

        // Valida se todas as artes da lista têm PDF carregado, caso não seja multi seleção virtual

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        if (!isMultiSelected) {
            for (let i = 0; i < artesList.length; i++) {

                if (!artesList[i].pdf_url || (artesList[i].pdf_url === 'local_file' && !artesList[i].rawFile)) {

                    return desistir(`Arte ${i + 1}: faça o upload do PDF da arte (necessário a cada sessão).`);

                }

            }
        } else {
            for (let i = 0; i < artesList.length; i++) {
                if (!artesList[i].pdf_url) {
                    return desistir(`O modelo "${artesList[i].nome}" não possui arte cadastrada nem cor vinculada.`);
                }
            }
        }

    } else {
        // Não exige arte, permite gerar apenas com a numeração
    }

    

    if (schema !== 'multi_artes' && schema !== 'pdf_multiple') {

        if (start > end) return desistir('Número inicial deve ser menor que o final.');

    }



    const formato = state.formatos.find(f => f.id === fmtId);

    const saida = state.saidas.find(s => s.id === saiId);



    // 1. SOLICITAR DESTINO DO ARQUIVO IMEDIATAMENTE (dentro do clique do usuário para manter o gesto ativo)

    let directoryHandle = null;
    let fileHandle = null;

    // Obter o código do modelo para usar no nome do arquivo
    let modeloNum = '';
    if (isMultiSelected && state.selectedOSItems && state.selectedOSItems.length > 0) {
        // Todos os modelos da folha, não só o primeiro: o arquivo tem o material
        // de vários, e quem o encontra na pasta precisa saber disso sem abrir.
        modeloNum = (typeof nomeDosModelosCombinados === 'function')
            ? nomeDosModelosCombinados(itensDaImposicao(true))
            : '';
    } else if (state.activeOSItem) {
        const itens = state.osItens[state.activeOSItem.osId] || [];
        const item = itens.find(i => String(i.id) === String(state.activeOSItem.itemId));
        if (item && item.modelo) {
            modeloNum = item.modelo;
        }
    }

    const suffix = schema === "pdf_multiple" ? "Paginado" : `${start}-${end}`;
    // O sufixo de refazer entra no nome porque o arquivo cai na mesma pasta do
    // trabalho original: sem ele, refazer 3 folhas gravava por cima do PDF da
    // tiragem inteira — e o motor deriva daqui também os nomes `_setN_02_miolo`.
    const baseFilename = modeloNum ? modeloNum : `VDP_${formato.name.replace(/\s+/g, '_')}_${suffix}`;
    const defaultFilename = `${baseFilename}${refazer.sufixo || ''}.pdf`;

    if (window.showDirectoryPicker && mode !== 'print') {
        try {
            directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                return desistir(null);
            }
            console.error("Erro ao abrir showDirectoryPicker:", err);
        }
    }

    // Fallback se showDirectoryPicker não estiver disponível
    if (!directoryHandle && window.showSaveFilePicker && mode !== 'print') {
        try {
            const options = {
                suggestedName: defaultFilename,
                types: [{
                    description: 'PDF Document',
                    accept: {
                        'application/pdf': ['.pdf'],
                    },
                }],
            };
            fileHandle = await window.showSaveFilePicker(options);
        } catch (err) {
            if (err.name === 'AbortError') {
                return desistir(null);
            }
            console.error("Erro ao abrir showSaveFilePicker no início:", err);
        }
    }



    let numeracao = numId ? state.numeracoes.find(n => String(n.id) === String(numId)) : null;

    // Um modelo so tambem le o banco do PEDIDO (28/08/2026), como no script.js:
    // sem resolver, a impressao de um modelo com vinculo sairia com a peca
    // crua. O multi_artes abaixo ja resolve arte a arte.
    //
    // O modelo ativo se acha pelo `itemId` (02/09/2026). `enviarParaPedido`
    // grava `{ itemId, osId }` e nada mais; ate hoje esta linha lia
    // o campo `idx` do modelo ativo, que e `undefined`: o item nunca era achado, a
    // resolucao era pulada e a peca ia CRUA ao motor -- zero linhas. Foi o
    // terceiro relato do 21460, ja com a carga dos bancos consertada: marcar os
    // cinco modelos funcionava, abrir um e mandar imprimir nao. Ver o gemeo no
    // script.js e `test_o_modelo_ativo_e_achado_pelo_itemId...`.
    if (numeracao && typeof resolverNumeracaoParaModelo === 'function'
        && typeof itemAtivoDoPedido === 'function'
        && state.activeOSItem && state.activeOSItem.osId !== undefined) {
        const itemAtivo = itemAtivoDoPedido();
        if (itemAtivo && typeof numeracaoIdDoItem === 'function'
            && String(numeracaoIdDoItem(itemAtivo)) === String(numId)) {
            numeracao = resolverNumeracaoParaModelo(numeracao, itemAtivo);
            // A fatia DESTE modelo, limitada a quantidade -- e nao o banco
            // inteiro (02/09/2026). Foi o quarto relato do 21460: o modelo de
            // 500 saiu com 3.000, e 2.500 delas com o QR em branco. Ver
            // `linhasDoModeloNoPayload` no script.js.
            if (numeracao && typeof linhasDoModeloNoPayload === 'function'
                && typeof vinculoDeBancoDoModelo === 'function' && vinculoDeBancoDoModelo(itemAtivo)
                && numeracao.csv_data && numeracao.csv_data.length) {
                numeracao = Object.assign({}, numeracao,
                    { csv_data: linhasDoModeloNoPayload(itemAtivo, numeracao) });
            }
        }
    }

    const num2Id = document.getElementById('ped-numeracao-2')?.value || '';

    const num2 = state.numeracoes.find(n => String(n.id) === String(num2Id)) || null;



    let payloadMultiArtes = [];

    if (schema === 'multi_artes' || isMultiSelected) {

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;

        payloadMultiArtes = artesList.map(arte => arteParaOMotor(arte, isMultiSelected));

    }



    let payloadNumeracao = numeracao ? JSON.parse(JSON.stringify(numeracao)) : null;
    if (payloadNumeracao && state.csvData) {
        payloadNumeracao.csv_data = state.csvData;
    }

    // A mesma conferencia final do script.js, sobre o payload pronto. Aqui o
    // modelo quase sempre e conhecido e ela nao dispara; ela existe para o caso
    // em que a resolucao nao aconteceu — numeracao escolhida na lista que nao e
    // a do modelo aberto, por exemplo. Ver `bancoVazioNoPayload`.
    // Sai por `desistir` — estamos ANTES do try/finally que devolve a tela ao
    // normal, e um `return` cru deixaria os botões escondidos para sempre.
    if (typeof bancoVazioNoPayload === 'function') {
        const semBancoNoPayload = bancoVazioNoPayload(payloadNumeracao, payloadMultiArtes);
        if (semBancoNoPayload.length) return desistir(recadoDeBancoVazio(semBancoNoPayload));
    }

    // Tirar do payload os elementos marcados como Layout — mesma razão da versão
    // do script.js: o engine.py também os ignora, mas o NewProd.exe carrega uma
    // cópia congelada dele. `numeracaoSemElementosDeLayout` devolve cópia rasa, o
    // que importa aqui porque as numerações de multi-artes e a `num2` são
    // referências vivas de `state.numeracoes`.
    const _semLayout = typeof numeracaoSemElementosDeLayout === 'function'
        ? numeracaoSemElementosDeLayout
        : (n => n);
    payloadNumeracao = _semLayout(payloadNumeracao);
    for (const ma of payloadMultiArtes) {
        if (ma.numeracao) ma.numeracao = _semLayout(ma.numeracao);
        if (ma.numeracao_2) ma.numeracao_2 = _semLayout(ma.numeracao_2);
    }

    // ── QR Ideal: o pedido e o modelo ───────────────────────────────────────
    //
    // `pedido` e `pedidos_modelos.id_int` (o numero da OS) e `modelo` e
    // `pedidos_modelos.id`. Sao os dois eixos da conta que tira o codigo do
    // pool, e so o frontend sabe de que pedido o trabalho veio — o motor
    // apenas calcula.
    //
    // Ficaram de fora do payload desde o inicio, e o efeito foi que TODO
    // trabalho com QR Ideal era recusado pelo motor. A tela desenhava o QR
    // normalmente, porque ali o codigo e calculado aqui mesmo; a falha so
    // aparecia ao impor.
    const _osDoTrabalho = state.activeOSItem && state.ordens
        ? state.ordens.find(o => String(o.id) === String(state.activeOSItem.osId))
        : null;
    const _pedidoQr = _osDoTrabalho ? _osDoTrabalho.numero : null;
    const _modeloQr = state.activeOSItem ? state.activeOSItem.itemId : null;

    const payload = {

        pedido: _pedidoQr,
        modelo: _modeloQr,

        formato_id: fmtId,

        suggested_filename: defaultFilename,

        stream: true,

        numeracao_id: numId || null,

        numeracao_2_id: num2Id || null,

        mapa_teatro_id: document.getElementById('ped-mapa-teatro')?.value || null,

        saida_id: saiId,

        formato: formato,

        saida: saida,

        numeracao: payloadNumeracao,

        numeracao_2: _semLayout(num2),

        seq_start: start,

        seq_end: end,

        seq_increment: 1,

        schema,

        print_mode: state.printMode,

        rotate_page: rotatePage,

        multi_artes: payloadMultiArtes,

        // Com vários modelos vale a blocagem salva neles — que, sem nada gravado,
        // devolve o mesmo 'strict_assembly' com as folhas do `bloco` do ERP que
        // esta tela já mandava. Com um modelo só nada muda: continuam os campos
        // da tela, exatamente como antes.
        cut_stack_mode: isMultiSelected && typeof modoCutStackDaSelecao === 'function'
            ? modoCutStackDaSelecao()
            : (document.getElementById('ped-cutstack-mode') ? document.getElementById('ped-cutstack-mode').value : 'independent'),

        sheets_per_block: isMultiSelected && typeof blocagemDaSelecao === 'function'
            ? blocagemDaSelecao().folhas
            : (document.getElementById('ped-sheets-per-block') ? parseInt(document.getElementById('ped-sheets-per-block').value) || 50 : 50),

        block_depth: document.getElementById('ped-block-depth') ? parseInt(document.getElementById('ped-block-depth').value) || 1 : 1,

        // ENTREGAR ENQUANTO GERA (27/08/2026). MARCADA por padrao, por decisao
        // do usuario -- ele viu a medicao do modelo 1000567 do pedido 21202
        // (primeira folha aos 4,2 s em vez de 534,6 s; trabalho inteiro em
        // 118 s em vez de 535 s) e pediu que fosse o padrao.
        //
        // Ela troca UM arquivo por N na mao de quem opera, inclusive nos
        // trabalhos pequenos. Quem quiser o arquivo unico desmarca aqui.
        //
        // Nao confundir com a "Folha a Folha" logo acima dela na tela: aquela
        // quebra o PDF DEPOIS de ele chegar pronto ao navegador, com o PDFLib,
        // e por isso nao evita o acumulo -- acrescenta mais um. Esta corta no
        // motor, antes, e cada lote ja sai entregue. Ver `_folhas_por_lote` no
        // engine.py.
        //
        // A IMPRESSÃO REVERSA DESLIGA O CORTE. Ela inverte as páginas DENTRO de
        // cada arquivo que chega à tela; com o trabalho inteiro num arquivo só
        // isso é a inversão do trabalho, mas cortado em lotes viraria "lote 1
        // invertido, depois lote 2 invertido" — a tiragem sairia na ordem
        // errada, e só o papel contaria a história. Enquanto a reversa estiver
        // marcada, o motor devolve o arquivo único de sempre.
        entregar_por_bloco: document.getElementById('ped-entregar-por-bloco')?.checked === true
            && !(mode === 'print' && document.getElementById('ped-print-reverse')?.checked === true),

        // CAMAROTE: C_INI, Q_CAM e L_CAM do item da OS (lidos automaticamente via campos hidden ou fallback do item ativo)
        c_ini: (state.activeOSItem ? parseInt(state.activeOSItem.c_ini) : null) || parseInt(document.getElementById('ped-c-ini')?.value || 1) || 1,
        q_cam: (state.activeOSItem ? parseInt(state.activeOSItem.q_cam) : null) || parseInt(document.getElementById('ped-q-cam')?.value || 0) || 0,
        l_cam: (state.activeOSItem ? parseInt(state.activeOSItem.l_cam) : null) || parseInt(document.getElementById('ped-l-cam')?.value || 1) || 1,

        // Vem de montarRefazerPayload(isRefazer) — já validado. Os botões
        // principais chamam sem `isRefazer` e por isso recebem tudo zerado.
        refazer_de: refazer.refazer_de,
        refazer_ate: refazer.refazer_ate,
        refazer_set: refazer.refazer_set,
        refazer_celulas: refazer.refazer_celulas,

        // A escala da camada de arte do modelo (31/08/2026). 100/100 é o
        // tamanho natural do arquivo — o que o motor sempre fez. Ver
        // `_arte_na_celula` no engine.py.
        arte_escala_h: (typeof escalaDaArteDoTrabalho === 'function')
            ? escalaDaArteDoTrabalho().h : 100,
        arte_escala_v: (typeof escalaDaArteDoTrabalho === 'function')
            ? escalaDaArteDoTrabalho().v : 100
    };



    const formData = new FormData();
    const isPedTab = document.getElementById('view-pedido')?.classList.contains('active');
    let selectedFile = null;
    if (isPedTab) {
        if (state.pedArtFile) {
            selectedFile = state.pedArtFile;
        } else {
            const pedFile = document.getElementById('ped-file');
            if (pedFile && pedFile.files.length > 0) {
                selectedFile = pedFile.files[0];
            }
        }
    } else {
        if (state.impArtFile) {
            selectedFile = state.impArtFile;
        } else {
            const impFile = document.getElementById('imp-file');
            if (impFile && impFile.files.length > 0) {
                selectedFile = impFile.files[0];
            }
        }
    }
    if (selectedFile) {
        formData.append('file', selectedFile);
    }

    // O arquivo do verso do FxVersoUnico (31/08/2026). Um modelo sozinho nao
    // passa por `multi_artes` -- manda a arte como upload --, entao o verso
    // precisa de um campo proprio. Nos outros modos o motor ignora este arquivo:
    // ali o verso sai das paginas do proprio arquivo da frente.
    if (versoUnico(payload.print_mode)) {
        const versoFile = state.pedArtVersoFile || state.impArtVersoFile;
        if (versoFile) formData.append('file_verso', versoFile);
    }

    if (state.csvFile) {

        formData.append('csv_file', state.csvFile);

    }

    if (schema === 'multi_artes' && !isMultiSelected) {

        state.impMultiArtes.forEach((arte, i) => { if (arte.rawFile) { formData.append('multi_artes_files', arte.rawFile); formData.append('ma_file_' + i, arte.rawFile); } });

    }



    formData.append('payload', JSON.stringify(payload, (key, value) => {

        // Filtrar propriedades internas do frontend (não-serializáveis ou irrelevantes ao backend)

        if (key === '_svgImage' || key === '_pdfPreview' || key === '_pdfCanvas' || key === '_pdfLoading' ||

            key === 'pdfDoc' || key === 'pagesCache' || key === 'pagesRendering' || key === 'rawFile') {

            return undefined;

        }

        return value;

    }));



    const overlay = document.getElementById('loading-overlay');

    const sub = document.getElementById('loading-sub');

    const pBar = document.getElementById('loading-progress-bar');

    const pText = document.getElementById('loading-progress-text');



    // Calcular o total correto de itens baseando-se no esquema

    const isPdfMultiple = schema === "pdf_multiple";

    let total = 1;

    if (isPdfMultiple) {

        const totalPages = state.pedArtPdfDoc ? state.pedArtPdfDoc.numPages : 1;

        total = state.printMode === 'duplex' ? Math.ceil(totalPages / 2) : totalPages;

    } else if (schema === 'multi_artes') {

        const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
        total = artesList.reduce((acc, a) => acc + (parseInt(a.qtd) || 0), 0);

    } else if (state.csvData) {

        total = (typeof linhasAtivasCsv === 'function')
            ? linhasAtivasCsv(state.csvData).length
            : state.csvData.length;

    } else {

        total = end - start + 1;

    }



    overlay.classList.add('active');

    sub.textContent = `Gerando ${total.toLocaleString('pt-BR')} itens...`;

    if (pBar) pBar.style.width = '0%';

    if (pText) pText.textContent = 'Iniciando... (0%)';

    document.getElementById('ped-btn-impose').disabled = true;



    // Instancia o AbortController e associa ao botão de cancelamento

    impositionAbortController = new AbortController();

    const cancelBtn = document.getElementById('btn-cancel-imposition');

    if (cancelBtn) {

        cancelBtn.onclick = () => {

            if (impositionAbortController) {

                impositionAbortController.abort();

            }

        };

    }



    let progress = 0;

    let progressInterval = setInterval(() => {

        if (progress < 90) {

            const increment = Math.max(1, Math.floor((90 - progress) * 0.1));

            progress += increment;

        } else if (progress < 98) {

            progress += 0.5;

        }

        if (pBar) pBar.style.width = `${progress}%`;

        if (pText) pText.textContent = `Processando... (${Math.floor(progress)}%)`;

    }, 300);



    try {

        let baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';

        // 1. Verificar primeiro se o servidor FastAPI principal está rodando localmente (porta 8080)

        let localApiActive = false;

        try {

            const controller8080 = new AbortController();

            const timeoutId8080 = setTimeout(() => controller8080.abort(), 500);

            const apiCheck = await fetch("http://localhost:8080/api/formatos", { 

                method: "GET",

                signal: controller8080.signal 

            }).catch(() => null);

            clearTimeout(timeoutId8080);

            if (apiCheck && (apiCheck.ok || apiCheck.status === 401 || apiCheck.status === 403)) {

                localApiActive = true;

            }

        } catch (_) {}



        // 2. Verificar se o Agente Local (porta 9000) esta ativo
        // Tenta 127.0.0.1 e localhost (HTTPS->HTTP mixed content e tratado como excecao para loopback)
        let localActive = false;
        let agentBaseUrl = "";

        if (!localApiActive) {
            // Testa / e /api/status para compatibilidade com todas as versoes do exe
            const agentBases = [window.location.origin, "http://127.0.0.1:9000", "http://localhost:9000"];
            outerLoop:
            for (const base of agentBases) {
                for (const path of ["/api/status", "/"]) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2000);
                        const agentCheck = await fetch(`${base}${path}`, {
                            method: "GET",
                            mode: "cors",
                            signal: controller.signal
                        }).catch(() => null);
                        clearTimeout(timeoutId);
                        if (agentCheck && agentCheck.ok) {
                            const ct = agentCheck.headers.get("content-type") || "";
                            if (ct.includes("application/json")) {
                                const checkData = await agentCheck.json().catch(() => ({}));
                                // Ver o comentario longo na sondagem do script.js:
                                // o primeiro endereco testado e o da propria pagina,
                                // e ate 17/08/2026 esse caminho, na Vercel, era
                                // desviado para uma copia do mesmo app.py na nuvem.
                                // Ela se apresentava como agente local e a imposicao
                                // ia parar la -- com o selo "AGENTE LOCAL" na tela e
                                // o QR Ideal impossivel de imprimir, porque o pool so
                                // existe na estacao. O desvio e a copia sairam; a
                                // conferencia fica, porque e ela que garante que so
                                // um agente de verdade e aceito.
                                if (checkData.status === "running" && checkData.onde !== "nuvem") {
                                    localActive = true;
                                    agentBaseUrl = base;
                                    break outerLoop;
                                }
                            }
                        }
                    } catch (_) {}
                }
            }
        }



        if (localApiActive) {

            baseUrl = "http://localhost:8080";

            console.log("[Imposition] Servidor local (porta 8080) detectado -- processando localmente para maxima velocidade");

            if (sub) sub.innerHTML = `Gerando ${total.toLocaleString('pt-BR')} itens... <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 2px 8px rgba(34,197,94,0.35);vertical-align:middle;">&#9889; SERVIDOR LOCAL</span>`;

        } else if (localActive) {

            baseUrl = agentBaseUrl;

            console.log("[Imposition] Processando via agente local (porta 9000)");

            if (sub) sub.innerHTML = `Gerando ${total.toLocaleString('pt-BR')} itens... <span style="display:inline-block;margin-left:8px;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 2px 8px rgba(34,197,94,0.35);vertical-align:middle;">&#9889; AGENTE LOCAL</span>`;

        } else {

            // 16/08/2026: nao existe mais caminho para a nuvem. Imposicao e
            // impressao so acontecem na estacao -- decisao de seguranca do
            // usuario. Ver
            // docs/superpowers/specs/2026-08-16-migrar-render-para-supabase-design.md
            //
            // Este bloco e copia do que esta no script.js, de proposito: sao
            // duas telas com sondagens separadas, e este projeto ja se queimou
            // tentando compartilhar esta parte. O teste le os DOIS arquivos.
            const recusaSemEstacao = (typeof explicarEstacaoNaoEncontrada === 'function'
                ? explicarEstacaoNaoEncontrada(window.location.origin) : '')
                || 'A estacao (NewProd) nao respondeu nesta maquina. Abra o NewProd e tente de novo.';
            if (sub) sub.innerHTML = `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#7f1d1d;color:#fee2e2;font-size:0.85rem;line-height:1.45;text-align:left;font-weight:600;">&#9888; ${recusaSemEstacao}</div>`;
            console.warn('[Imposition] ' + recusaSemEstacao);
            throw new Error(recusaSemEstacao);

        }

        

        const headers = {};

        if (typeof firebase !== 'undefined' && firebase.auth() && firebase.auth().currentUser) {

            try {

                const token = await firebase.auth().currentUser.getIdToken();

                headers['Authorization'] = `Bearer ${token}`;

            } catch (e) {

                console.error("Erro ao obter Firebase ID Token para imposição:", e);

            }

        }



        // O destino e sempre a estacao: endereco direto, sem a Vercel no caminho.
        // Se nao houvesse estacao, o ramo `else` da sondagem ja teria lancado.
        const urlImpose = `${baseUrl}/api/impose`;

        const res = await fetch(urlImpose, {

            method: 'POST',

            headers: headers,

            body: formData,

            signal: impositionAbortController.signal

        });

        if (!res.ok) {

            // A resposta de erro nem sempre é JSON — ver descreverErroHttp() no script.js.
            // Fazer res.json() aqui trocava a mensagem real por um erro de sintaxe de JSON.
            throw new Error(typeof descreverErroHttp === 'function'
                ? await descreverErroHttp(res, urlImpose)
                : `Erro ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200) || res.statusText}`);

        }

        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/event-stream")) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let currentEvent = null;
            // ENTREGAR AGORA, NÃO NO FIM (27/08/2026)
            //
            // Esta fila existia para juntar TODOS os arquivos do streaming e
            // só mandar para a impressora depois que o motor terminasse. Com a
            // entrega por bloco isso anulava o recurso: o motor soltava o
            // primeiro lote em 4 s e a impressora não via nada até a última das
            // 1.400 folhas ficar pronta.
            //
            // Agora cada lote é entregue assim que chega, dentro deste mesmo
            // laço. A `printBlobQueue` continua aqui como rede: se o
            // `criarEntregaDeImpressao` do script.js não estiver disponível, o
            // comportamento antigo volta inteiro em vez de o trabalho se
            // perder.
            const printBlobQueue = [];
            let entrega = null;
            let cancelouNoMeio = false;
            // Quantos arquivos o motor chegou a emitir. Zero é o sintoma de uma
            // faixa de refazer que não casou com folha nenhuma; sem esta conta a
            // tela terminava dizendo "concluído e arquivos salvos" sem arquivo.
            let arquivosRecebidos = 0;

            while (true) {
                if (cancelouNoMeio || window._printCancelRequested) break;
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                buffer = lines.pop();

                for (const line of lines) {
                    if (cancelouNoMeio) break;
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;

                    if (cleanLine.startsWith("event:")) {
                        currentEvent = cleanLine.substring(6).trim();
                    } else if (cleanLine.startsWith("data:")) {
                        const dataStr = cleanLine.substring(5).trim();
                        if (currentEvent === "file" && dataStr) {
                            try {
                                const fileObj = JSON.parse(dataStr);
                                const binStr = atob(fileObj.data);
                                const bytes = new Uint8Array(binStr.length);
                                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                                const fBlob = new Blob([bytes], {type: "application/pdf"});
                                arquivosRecebidos++;

                                // ATE ONDE JA SAIU PAPEL (27/08/2026).
                                //
                                // Com a entrega por bloco, cancelar no meio nao
                                // desfaz o que ja foi para a impressora. O motor
                                // manda a conta junto de cada lote, e a tela a
                                // guarda para poder dizer, no cancelamento,
                                // exatamente ate que folha o operador precisa
                                // conferir antes de remandar.
                                if (fileObj.folhas_entregues) {
                                    window._entregaEmCurso = {
                                        folhas: fileObj.folhas_entregues,
                                        total: fileObj.folhas_no_trabalho || null,
                                        lotes: arquivosRecebidos,
                                        ultimo: fileObj.name,
                                    };
                                }

                                const fallbackDownload = async () => {
                                    toast(`Baixando: ${fileObj.name}...`, 'info');
                                    const url = window.URL.createObjectURL(fBlob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = fileObj.name;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    window.URL.revokeObjectURL(url);
                                    await new Promise(r => setTimeout(r, 200));
                                };

                                if (mode === 'print') {
                                    if (!entrega && typeof criarEntregaDeImpressao === 'function') {
                                        // A validação de destino (impressora ou
                                        // hot folder) acontece aqui, no primeiro
                                        // lote — antes esperava o trabalho
                                        // inteiro para só então reclamar.
                                        entrega = criarEntregaDeImpressao();
                                        if (!entrega) {
                                            throw new Error('Escolha a impressora ou a pasta do HOT FOLDER antes de imprimir.');
                                        }
                                    }
                                    if (entrega) {
                                        await entrega.entregar([{ name: fileObj.name, blob: fBlob }]);
                                        if (entrega.cancelado) { cancelouNoMeio = true; break; }
                                    } else {
                                        printBlobQueue.push({ name: fileObj.name, blob: fBlob });
                                        toast(`Arquivo gerado: ${fileObj.name}`, 'info');
                                    }
                                } else if (directoryHandle) {
                                    try {
                                        toast(`Salvando: ${fileObj.name}...`, 'info');
                                        const fh = await directoryHandle.getFileHandle(fileObj.name, { create: true });
                                        const writable = await fh.createWritable();
                                        await writable.write(fBlob);
                                        await writable.close();
                                    } catch (saveErr) {
                                        console.warn(`[Fallback] Erro ao salvar "${fileObj.name}" na pasta. Tentando download normal...`, saveErr);
                                        await fallbackDownload();
                                    }
                                } else {
                                    await fallbackDownload();
                                }
                            } catch (e) {
                                console.error("Erro ao processar arquivo do stream:", e);
                                toast(`Erro ao salvar arquivo do lote: ${e.message}`, 'error');
                            }
                        } else if (currentEvent === "error" && dataStr) {
                            try {
                                const errObj = JSON.parse(dataStr);
                                throw new Error(errObj.message || "Erro desconhecido no processamento");
                            } catch (e) { throw e; }
                        }
                    }
                }
            }

            if (arquivosRecebidos === 0) {
                throw new Error(isRefazer
                    ? 'O motor não gerou nenhuma folha para esta seleção. Confira a faixa em "De/Até" e as células pedidas.'
                    : 'O motor terminou sem gerar nenhum arquivo.');
            }

            // Os lotes já foram entregues um a um laço acima; o que falta aqui é
            // fechar a entrega (relatório, conferência do hot folder, botões de
            // volta) e só então perguntar sobre o status de impresso.
            if (mode === 'print' && entrega) {
                if (overlay) overlay.classList.remove('active');
                // Refazer é reimpressão de uma parte: o modelo já estava impresso
                // (ou continua não estando). Ver a nota do bloco abaixo.
                const alvoImpressao = isRefazer ? [] : alvosDaImpressao(isMultiSelected);
                const ok = entrega.finalizar({ interrompido: cancelouNoMeio });
                if (ok && alvoImpressao.length) await confirmarImpressaoModelos(alvoImpressao);
                return;
            }

            if (mode === 'print' && printBlobQueue.length > 0) {
                if (overlay) overlay.classList.remove('active');
                toast(`Imposição concluída. Enviando ${printBlobQueue.length} arquivo(s) para a impressora...`, 'info');
                // Refazer é reimpressão de uma parte: o modelo já estava impresso
                // (ou continua não estando). Perguntar "marcar como impresso?"
                // depois de refazer três folhas confunde e leva a status errado.
                // Com vários modelos na folha, os alvos são todos os marcados —
                // ver alvosDaImpressao().
                const alvoImpressao = isRefazer ? [] : alvosDaImpressao(isMultiSelected);
                if (typeof sendPrintJobDirect === 'function') {
                    const ok = await sendPrintJobDirect(printBlobQueue);
                    // Não marca sozinho: pergunta ao operador antes de mudar o status
                    if (ok && alvoImpressao.length) await confirmarImpressaoModelos(alvoImpressao);
                } else {
                    if (typeof marcarConfirmacaoPendente === 'function') marcarConfirmacaoPendente(alvoImpressao);
                    await openPrintModalQueue(printBlobQueue);
                }
                return;
            }

            // Gerar/salvar PDF não altera o status de impressão
            toast(isRefazer
                ? `Refazer concluído: ${arquivosRecebidos} arquivo(s) salvo(s).`
                : 'Processo de imposição concluído e arquivos salvos!', 'success');
            return;
        }

        // Fallbacks caso não venha como stream (JSON ou blob de arquivo único direto)
        if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.type === "multi_file") {
                // Converter todos em blobs
                const multiBlobs = data.files.map(f => {
                    const binStr = atob(f.data);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    return { name: f.name, blob: new Blob([bytes], {type: "application/pdf"}) };
                });

                if (mode === 'print') {
                    if (overlay) overlay.classList.remove('active');
                    toast(`Imposição concluída. Enviando ${multiBlobs.length} arquivo(s) para a impressora...`, 'info');
                    // Mesma razão do caminho por stream: refazer não muda status.
                    const alvoImpressao = isRefazer ? [] : alvosDaImpressao(isMultiSelected);
                    if (typeof sendPrintJobDirect === 'function') {
                        const ok = await sendPrintJobDirect(multiBlobs);
                        // Não marca sozinho: pergunta ao operador antes de mudar o status
                        if (ok && alvoImpressao.length) await confirmarImpressaoModelos(alvoImpressao);
                    } else {
                        if (typeof marcarConfirmacaoPendente === 'function') marcarConfirmacaoPendente(alvoImpressao);
                        await openPrintModalQueue(multiBlobs);
                    }
                    return;
                }

                toast(`Salvando ${multiBlobs.length} arquivos...`, 'info');
                for (const item of multiBlobs) {
                    if (directoryHandle) {
                        try {
                            const fh = await directoryHandle.getFileHandle(item.name, { create: true });
                            const writable = await fh.createWritable();
                            await writable.write(item.blob);
                            await writable.close();
                        } catch (errSave) {
                            console.error(`Erro ao salvar ${item.name} na pasta:`, errSave);
                        }
                    } else {
                        const url = window.URL.createObjectURL(item.blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = item.name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
                // Gerar/salvar PDF não altera o status de impressão
                toast('Arquivos de imposição salvos com sucesso!', 'success');
                return;
            }
        }

        const blob = await res.blob();

        // Modo impressão direta: usar painel lateral sem abrir modal
        if (mode === 'print') {
            if (overlay) overlay.classList.remove('active');
            const alvoImpressao = alvosDaImpressao(isMultiSelected);
            if (typeof sendPrintJobDirect === 'function') {
                const queue = [{ name: defaultFilename, blob }];
                const ok = await sendPrintJobDirect(queue);
                // Não marca sozinho: pergunta ao operador antes de mudar o status
                if (ok && alvoImpressao.length) await confirmarImpressaoModelos(alvoImpressao);
            } else {
                if (typeof marcarConfirmacaoPendente === 'function') marcarConfirmacaoPendente(alvoImpressao);
                await openPrintModal(blob);
            }
            return;
        }

        if (directoryHandle) {
            try {
                const finalFilename = defaultFilename;
                const fh = await directoryHandle.getFileHandle(finalFilename, { create: true });
                const writable = await fh.createWritable();
                await writable.write(blob);
                await writable.close();

                // Gerar/salvar PDF não altera o status de impressão
                toast('PDF salvo com sucesso!', 'success');
                return;
            } catch (errSave) {
                console.error("Falha ao salvar PDF na pasta escolhida, usando fallback:", errSave);
            }
        }

        // Salvar os dados no fileHandle já escolhido pelo usuário
        if (fileHandle) {
            try {
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                // Gerar/salvar PDF não altera o status de impressão
                toast('PDF salvo com sucesso!', 'success');
                return;
            } catch (err) {
                console.error("Falha ao salvar no arquivo escolhido previamente, usando fallback:", err);
            }
        }




        // Modo impressao direta: abrir modal de seleção de impressora
        if (mode === 'print') {
            if (_printerAgentActive) {
                // Modo Cloud Relay: abrir modal do agente
                openPrintModal(blob);
                toast('PDF gerado! Selecione a impressora.', 'success');
            } else {
                // Modo Local Direto: abrir modal nativo de impressão
                openPrintModal(blob);
                toast('PDF gerado! Configure e envie para a impressora local.', 'success');
            }
            return;
        }

        // Fallback: Prompt para nome do arquivo + download convencional

        const filename = prompt('Digite o nome do arquivo para salvar o PDF:', defaultFilename);

        if (filename === null) return; // cancelado pelo usuario

        

        const finalFilename = filename.trim() || defaultFilename;

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        a.download = finalFilename.endsWith('.pdf') ? finalFilename : finalFilename + '.pdf';

        document.body.appendChild(a);

        a.click();

        URL.revokeObjectURL(url);

        document.body.removeChild(a);

        // Gerar/baixar PDF não altera o status de impressão
        toast('PDF baixado com sucesso!', 'success');

    } catch (err) {

        if (err.name === 'AbortError') {

            toast('Geração do PDF cancelada pelo usuário.', 'info');

        } else {

            // Ver o mesmo trecho no script.js: a recusa por falta de estacao ja
            // vem com a explicacao inteira dentro do proprio erro.
            toast(`Erro: ${err.message}`, 'error');

        }

    } finally {
        window.isImposing = false;
        // A entrega por lote acende `isPrinting` durante a geração, e não só no
        // envio do fim. Um erro no meio deixaria a tela achando que ainda está
        // imprimindo.
        window.isPrinting = false;
        if (progressInterval) clearInterval(progressInterval);

        if (pBar) pBar.style.width = '100%';

        if (pText) pText.textContent = 'Concluído! (100%)';

        setTimeout(() => {
            if (overlay) overlay.classList.remove('active');
            const btnCancelPed = document.getElementById('ped-btn-cancel-print');
            if (btnCancelPed) btnCancelPed.style.display = 'none';
            const btn = document.getElementById('ped-btn-impose');
            if (btn) {
                btn.style.display = 'inline-flex';
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
            const btnPrint = document.getElementById('ped-btn-impose-print');
            if (btnPrint) btnPrint.style.display = 'inline-flex';
        }, 400);
        impositionAbortController = null;
    }

};


window.toggleBox = function(bodyId, arrowId) {
    const body = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = '';
        if (arrow) arrow.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
};







// Helpers para gerar PDF e imprimir a partir da fila de itens no menu Pedido
async function pedQueueGerarPDF(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    // Gerar PDF não altera o status de impressão
    setTimeout(() => {
        // Clicar no botão da aba Pedido (ped-btn-impose)
        const btnGerar = document.getElementById('ped-btn-impose');
        if (btnGerar) {
            btnGerar.click();
        } else if (typeof runPedImposition === 'function') {
            runPedImposition();
        }
    }, 1200);
}

async function pedQueueImprimir(itemId, osId) {
    await enviarParaPedido(itemId, osId);
    // O status NÃO muda aqui. Só vira IMPRESSO depois que o operador confirmar
    // no popup exibido ao final do envio para a impressora.
    setTimeout(() => {
        // Clicar no botão de Imprimir da aba Pedido (ped-btn-impose-print)
        const btnImprimir = document.getElementById('ped-btn-impose-print');
        if (btnImprimir) {
            btnImprimir.removeAttribute('disabled');
            btnImprimir.style.opacity = '1';
            btnImprimir.click();
        } else if (typeof runPedImposition === 'function') {
            runPedImposition('print');
        }
    }, 1200);
}

async function pedQueueUpdateCor(itemId, osId, corId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const cor = (state.cores || []).find(c => String(c.id) === String(corId));
    if (cor) {
        item.cor = cor.name;
        item.padrao = cor.name;
        item.amostra_cor_id = cor.id;
        if (cor.formato_id) {
            const fmtSelect = document.getElementById('ped-formato');
            if (fmtSelect) {
                fmtSelect.value = cor.formato_id;
                fmtSelect.dispatchEvent(new Event('change'));
            }
        }
        autoSaveOSItemField(itemId, osId, 'amostra_cor_id', cor.id);
    }
    renderPedOSQueue();
    enviarParaPedido(itemId, osId);
}

async function pedQueueUpdateNum(itemId, osId, numId) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    const num = (state.numeracoes || []).find(n => String(n.id) === String(numId));
    if (num) {
        item.numeracao = num.name || num.tipo;
        // Os dois nomes locais da mesma coluna, juntos. Ver
        // `numeracaoIdDoItem` no script.js.
        if (typeof window.sincronizarNumeracaoDoItem === 'function') {
            window.sincronizarNumeracaoDoItem(item, num.id);
        } else {
            item.numeracao_id = num.id;
        }
        autoSaveOSItemField(itemId, osId, 'amostra_num_id', num.id);

        // O TEXTO DO PARCEIRO VAI JUNTO COM O ID (27/08/2026).
        //
        // `pedidos_modelos` guarda a numeracao do modelo DUAS vezes: o texto,
        // escrito pelo ERP (`gabarito_operacional`), e o id, derivado por este
        // painel (`amostra_num_id`). Quando os dois discordam, quem manda e o
        // texto -- essa e a regra do `cor-numeracao-do-modelo.js`, e ela existe
        // porque o parceiro troca a numeracao de um modelo e o id em cache
        // nunca mais deixaria a troca chegar a tela.
        //
        // Gravar so o id, como esta fila fazia, punha o operador num ciclo que
        // ele nao tinha como vencer: ele escolhia a numeracao certa, o id ia
        // para o banco, o texto ficava o antigo -- e na abertura seguinte a
        // reconciliacao devolvia o id ao que o texto dizia. No pedido 21202 o
        // modelo 1000563 (05/set CAMAROTE PATROCINADORES, Qtd 1.920) voltava
        // sozinho para "CAMAROTE PRESIDENTE 05", de 3.000 linhas: a tela pedia
        // 300 folhas onde cabiam 192, e o dado impresso seria de outro modelo.
        //
        // O card da tela de Amostras (`onItemNumSelect`) sempre gravou os dois.
        // Esta linha e as duas telas de fila passando a fazer o mesmo.
        item.gabarito_operacional = num.name || num.tipo || null;
        item.tipo_numeracao = item.gabarito_operacional;
        autoSaveOSItemField(itemId, osId, 'gabarito_operacional', item.gabarito_operacional);
        autoSaveOSItemField(itemId, osId, 'tipo_numeracao', item.tipo_numeracao);

        // Atualizar verso_tipo baseado no print_mode da numeração (fonte de verdade: producao_numeracoes)
        const isDuplex = typeof isNumeracaoDuplex === 'function' ? isNumeracaoDuplex(num) : temVerso(num.print_mode);
        const novoVersoTipo = isDuplex ? 'FxVerso' : 'Frente';
        item.verso_tipo = novoVersoTipo;
        item.verso = isDuplex;
        autoSaveOSItemField(itemId, osId, 'verso_tipo', novoVersoTipo);

        // Recalcular num_final
        let ticket_qtd = 1;
        if (num.tipo === 'TICKET') {
            ticket_qtd = parseInt(num.ticket_qtd) || 1;
        }
        const ni = parseInt(item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || 1)) || 1;
        const qtd = parseInt(item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0)) || 0;
        const nf = qtd > 0 ? (ni + (qtd * ticket_qtd) - 1) : '';

        item.num_final = nf;
        item.numeracao_fim = nf;
        autoSaveOSItemField(itemId, osId, 'num_final', nf);

        // Atualizar input de NF no DOM
        const row = document.getElementById(`ped-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
        }

        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('ped-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }

        const numSelect = document.getElementById('ped-numeracao');
        if (numSelect) {
            numSelect.value = numId;
            numSelect.dispatchEvent(new Event('change'));
        }
    }
    enviarParaPedido(itemId, osId);
}

async function pedQueueUpdateField(itemId, osId, field, value) {
    const itens = state.osItens[osId] || [];
    const item = itens.find(i => String(i.id) === String(itemId));
    if (!item) return;
    item[field] = value;
    autoSaveOSItemField(itemId, osId, field, value);

    // Recalcular num_final se qtd ou num_inicial mudar
    if (field === 'qtd' || field === 'num_inicial') {
        let ticket_qtd = 1;
        const numId = item.amostra_num_id || item.numeracao_id;
        if (numId) {
            const selectedNum = (state.numeracoes || []).find(n => String(n.id) === String(numId));
            if (selectedNum && selectedNum.tipo === 'TICKET') {
                ticket_qtd = parseInt(selectedNum.ticket_qtd) || 1;
            }
        }
        
        // Obter valores atualizados do item
        const ni = parseInt(item.num_inicial !== undefined && item.num_inicial !== null ? item.num_inicial : (item.numeracao_inicio || 1)) || 1;
        const qtd = parseInt(item.qtd !== undefined && item.qtd !== null ? item.qtd : (item.quantidade || 0)) || 0;
        const nf = qtd > 0 ? (ni + (qtd * ticket_qtd) - 1) : '';
        
        // Atualizar no estado local
        item.num_final = nf;
        item.numeracao_fim = nf;
        
        // Salvar no Supabase
        autoSaveOSItemField(itemId, osId, 'num_final', nf);
        
        // Atualizar input de NF no DOM
        const row = document.getElementById(`ped-queue-row-${itemId}`);
        if (row) {
            const nfInput = row.querySelector('td[title="Num. Final"] input');
            if (nfInput) {
                nfInput.value = nf;
            }
        }
        
        // Atualizar campo de numeração na imposição principal se for o item ativo
        if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
            const el = document.getElementById('ped-end');
            if (el) { el.value = nf; el.dispatchEvent(new Event('change')); }
        }
    }

    if (state.activeOSItem && String(state.activeOSItem.itemId) === String(itemId)) {
        if (field === 'num_inicial') {
            const el = document.getElementById('ped-start');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'num_final') {
            const el = document.getElementById('ped-end');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'qtd') {
            const el = document.getElementById('ped-qtd');
            if (el) { el.value = value; el.dispatchEvent(new Event('change')); }
        } else if (field === 'verso_tipo') {
            item.verso = (value === 'FxVerso');
            const printMode = document.getElementById('ped-print-mode');
            if (printMode) {
                // O `verso_tipo` do ERP só diz se TEM verso; qual dos dois modos
                // de verso vale é a numeração que sabe. Sem passar por aqui,
                // salvar qualquer campo do modelo rebaixava um FxVersoUnico a
                // FxVerso e a folha voltava a consumir o arquivo aos pares.
                printMode.value = (value === 'FxVerso') ? modoDeVersoDoModelo(item) : 'front';
                if (typeof updatePedSummary === 'function') {
                    updatePedSummary();
                }
            }
        }
    }
    enviarParaPedido(itemId, osId);

    if (field === 'status_impressao') {
        item.impressao = value;
        // Atualizar também no state.modelosGlobais
        const numOs = parseInt(osId.toString().replace('vibe_', ''));
        if (state.modelosGlobais && state.modelosGlobais[numOs]) {
            const mod = state.modelosGlobais[numOs].find(m => String(m.id) === String(itemId));
            if (mod) {
                mod.impressao = value;
                mod.status_impressao = value;
            }
        }
        renderPedOSQueue();
        updatePedImprimirButtonsVisibility();
        if (typeof avisarCorrecaoDeArte === 'function' && avisarCorrecaoDeArte(value)) {
            // A arte tem de sair de APROVADA junto, senão o card do designer
            // continua travado e ele não troca o arquivo — ver
            // `devolverArteParaAlteracao` no script.js, que é quem sabe a regra.
            if (typeof devolverArteParaAlteracao === 'function') {
                await devolverArteParaAlteracao(itemId, osId);
            }
            // A Lista de Arte reconta os cards agora: o pedido aparece em "Em
            // Arte" sem F5, que é o efeito que o aviso acabou de prometer.
            if (typeof renderOrdens === 'function') renderOrdens();
        }
    }
}

window.pedQueueGerarPDF = pedQueueGerarPDF;
window.pedQueueImprimir = pedQueueImprimir;

// ─── O PAR DE BOTOES DA JANELA — E' UM SO ────────────────────────────────────
//
// O Refazer tinha um par proprio de Gerar PDF / Imprimir, ao lado do daqui.
// Dois caminhos para a mesma acao ja produziram defeito nesta tela: em
// 18/08/2026 um segundo par ("PDF Sel." e "Imp. Sel.", no cabecalho do produto)
// chamava a funcao da OUTRA aba e imprimia um modelo quando dois estavam
// marcados. Agora existe UM par, e com o Refazer ligado ele passa a valer para
// a faixa escolhida — que e' exatamente o que o par do Refazer fazia.
window.pedPreviewGerarPDF = function() {
    if (!state.activeOSItem) {
        toast('Nenhum modelo selecionado para gerar PDF.', 'warning');
        return;
    }
    if (typeof runPedImposition === 'function') {
        runPedImposition('pdf', refazerLigado());
    }
};

window.pedPreviewImprimir = function() {
    if (!state.activeOSItem) {
        toast('Nenhum modelo selecionado para imprimir.', 'warning');
        return;
    }
    if (typeof runPedImposition === 'function') {
        runPedImposition('print', refazerLigado());
    }
};

window.pedQueueUpdateCor = pedQueueUpdateCor;
window.pedQueueUpdateNum = pedQueueUpdateNum;
window.pedQueueUpdateField = pedQueueUpdateField;
function buildStrictAssemblySets(artesList, isMulti, totItems, stackSize, posesPerSheet) {
    let multiMap = [];
    let curr_idx = 0;
    let hasArtes = artesList && artesList.length > 0;
    if (hasArtes) {
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            
            // Resolve ticket_qtd
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            let physical_q = q;
            
            for (let j = 0; j < physical_q; j++) {
                multiMap.push({ global_index: curr_idx + j, arte_index: i, local_index: j });
            }
            curr_idx += physical_q;
        }
    } else {
        for (let j = 0; j < totItems; j++) {
            multiMap.push({ global_index: j, arte_index: 0, local_index: j });
        }
    }
    let models_items = [];
    if (hasArtes) {
        let start = 0;
        for (let i = 0; i < artesList.length; i++) {
            let q = parseInt(artesList[i].qtd) || 0;
            let item_ticket_qtd = 1;
            if (artesList[i].num1_id) {
                const itemNum = state.numeracoes.find(n => String(n.id) === String(artesList[i].num1_id));
                if (itemNum && itemNum.tipo === "TICKET") {
                    item_ticket_qtd = parseInt(itemNum.ticket_qtd) || 1;
                }
            }
            let physical_q = q;
            models_items.push(multiMap.slice(start, start + physical_q));
            start += physical_q;
        }
    } else {
        models_items.push(multiMap);
    }
    let complete_blocks = [];
    let leftovers_by_model = models_items.map(() => []);
    for (let j = 0; j < models_items.length; j++) {
        let items = models_items[j];
        let num_blocks = Math.floor(items.length / stackSize);
        for (let b = 0; b < num_blocks; b++) {
            complete_blocks.push({ model_idx: j, block: items.slice(b * stackSize, (b + 1) * stackSize) });
        }
        leftovers_by_model[j] = items.slice(num_blocks * stackSize);
    }
    let total_blocks = complete_blocks.length;
    let set_definitions = [];
    let blocks_used = 0;
    if (total_blocks >= posesPerSheet) {
        let blocks_remaining = total_blocks - blocks_used;
        let depth = Math.floor(blocks_remaining / posesPerSheet);
        if (depth >= 1) {
            let num_blocks_in_set = depth * posesPerSheet;
            let set_blocks = complete_blocks.slice(blocks_used, blocks_used + num_blocks_in_set);
            
            for (let d = 0; d < depth; d++) {
                let layer_allocations = [];
                for (let P = 0; P < posesPerSheet; P++) {
                    let block_idx = P * depth + d;
                    if (block_idx < set_blocks.length) {
                        layer_allocations.push(set_blocks[block_idx].block);
                    } else {
                        layer_allocations.push([]);
                    }
                }
                set_definitions.push({ type: "strict", num_sheets: stackSize, cell_allocations: layer_allocations, depth: 1 });
            }
            blocks_used += num_blocks_in_set;
        }
    }
    let remaining_blocks = complete_blocks.slice(blocks_used);
    for (let i = 0; i < remaining_blocks.length; i++) {
        leftovers_by_model[remaining_blocks[i].model_idx] = leftovers_by_model[remaining_blocks[i].model_idx].concat(remaining_blocks[i].block);
    }
    for (let j = 0; j < leftovers_by_model.length; j++) {
        leftovers_by_model[j].sort((a, b) => a.local_index - b.local_index);
    }
    for (let j = 0; j < leftovers_by_model.length; j++) {
        let leftovers = leftovers_by_model[j];
        if (leftovers.length > 0) {
            let num_sheets = Math.ceil(leftovers.length / posesPerSheet);
            let cell_allocations = [];
            for (let P = 0; P < posesPerSheet; P++) {
                let cell_items = leftovers.slice(P * num_sheets, (P + 1) * num_sheets);
                if (cell_items.length < num_sheets) {
                    let diff = num_sheets - cell_items.length;
                    for (let k = 0; k < diff; k++) cell_items.push(null);
                }
                cell_allocations.push(cell_items);
            }
            set_definitions.push({ type: "assembly", num_sheets: num_sheets, cell_allocations: cell_allocations, depth: 1 });
        }
    }
    return set_definitions;
}
window.buildStrictAssemblySets = buildStrictAssemblySets;
