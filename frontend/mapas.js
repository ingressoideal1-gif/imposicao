// mapas.js - Lógica para o módulo Mapas de Teatro

// ==========================================
// ESTADO DO MÓDULO
// ==========================================
window.state = window.state || {};
window.state.mapas = [];
window.state.mapaAtual = null;

let mapTool = 'select'; // 'select', 'erase'
let canvasCtx = null;
let mapCanvas = null;
let mapaSalvando = false;
let mapasCargaVersao = 0;

// Sistema de Câmera (Pan/Zoom)
let camera = { x: 0, y: 0, zoom: 1 };
let isDraggingMap = false;
let dragStart = { x: 0, y: 0 };
let cameraStart = { x: 0, y: 0 };

// Grid e Assentos
const SEAT_SIZE = 24;
const SEAT_GAP = 8;
const GRID_SIZE = SEAT_SIZE + SEAT_GAP;

const DEFAULT_TIPOS_ASSENTO = [
    { id: 'Normal', nome: 'Normal', sufixo: '', cor: '#3498db', icone: '💺' },
    { id: 'PCD', nome: 'Cadeirante', sufixo: 'Cad', cor: '#f1c40f', icone: '♿' },
    { id: 'Obeso', nome: 'Obeso', sufixo: 'PNE', cor: '#e67e22', icone: '💺' },
    { id: 'Acompanhante', nome: 'Acompanhante', sufixo: 'Acc', cor: '#2ecc71', icone: '👥' }
];

window.getTiposAssento = function() {
    if (!window.state.mapaAtual) return DEFAULT_TIPOS_ASSENTO;
    if (!window.state.mapaAtual.config.tiposAssento) {
        window.state.mapaAtual.config.tiposAssento = JSON.parse(JSON.stringify(DEFAULT_TIPOS_ASSENTO));
    }
    return window.state.mapaAtual.config.tiposAssento;
};


// Histórico (Undo)
window.state.mapaHistory = [];

window.pushToMapHistory = function() {
    if (!window.state.mapaAtual || !window.state.mapaAtual.config) return;
    window.state.mapaHistory.push(JSON.parse(JSON.stringify(window.state.mapaAtual.config)));
    if (window.state.mapaHistory.length > 50) {
        window.state.mapaHistory.shift();
    }
}

window.undoMapHistory = function() {
    if (!window.state.mapaAtual || !window.state.mapaHistory || window.state.mapaHistory.length === 0) return;
    const previousConfig = window.state.mapaHistory.pop();
    window.state.mapaAtual.config = previousConfig;
    window.cadeirasSelecionadas = new Set();
    const setores = previousConfig.setores || [];
    window.setorSelecionadoIdx = setores.length ? Math.min(window.setorSelecionadoIdx ?? 0, setores.length - 1) : null;
    
    renderSetoresList();
    if (typeof carregarSetorNoSidebar === 'function') carregarSetorNoSidebar();
    if (typeof atualizarHeaderSetor === 'function') atualizarHeaderSetor();
    if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
    renderTiposAssentoList();
    renderToolbarTipos();
    window.requestAnimationFrame(renderMapa);
}


// ==========================================
// HELPERS POR SETOR
// ==========================================

/** Retorna o setor atualmente selecionado */
function getSetorAtual() {
    if (window.setorSelecionadoIdx === null || window.setorSelecionadoIdx === undefined) return null;
    const setores = window.state.mapaAtual && window.state.mapaAtual.config && window.state.mapaAtual.config.setores;
    if (!setores) return null;
    return setores[window.setorSelecionadoIdx] || null;
}

/** Retorna o objeto cadeiras do setor ativo (criando se necessário) */
function getCadeirasSetor(setor) {
    if (!setor) return {};
    if (!setor.cadeiras) setor.cadeiras = {};
    return setor.cadeiras;
}

/** Migra dados antigos: cadeiras em config.cadeiras global → setor.cadeiras */
function migrarDadosAntigos() {
    if (!window.state.mapaAtual || !window.state.mapaAtual.config) return;
    const config = window.state.mapaAtual.config;
    const global = config.cadeiras;
    if (!global || Object.keys(global).length === 0) return;

    // Garante que cada setor tenha cadeiras: {}
    (config.setores || []).forEach((s, idx) => {
        if (!s.cadeiras) s.cadeiras = {};
        if (!s.id) s.id = 'setor_' + idx + '_' + Date.now();
    });

    // Redistribui sem sobrescrever cadeiras nem descartar um setor legado ausente.
    const restantes = {};
    for (const key in global) {
        const c = global[key];
        const idx = c.setorIdx !== undefined ? c.setorIdx : 0;
        const setor = config.setores[idx];
        if (setor && !setor.cadeiras[key]) {
            setor.cadeiras[key] = c;
        } else restantes[key] = c;
    }

    config.cadeiras = restantes;
    console.log('[Migração] Cadeiras migradas para setores individuais.');
}

// ==========================================
// INICIALIZAÇÃO E FETCH
// ==========================================
function avisarMapa(mensagem, tipo = 'error') {
    if (typeof window.toast === 'function') window.toast(mensagem, tipo);
    else alert(mensagem);
}

function lerCacheMapas() {
    try {
        const mapas = JSON.parse(localStorage.getItem('vibe_mapas_teatro') || '[]');
        return Array.isArray(mapas) ? mapas : [];
    } catch (e) {
        console.error('[Mapas] Cache inválido:', e);
        return [];
    }
}

function gravarCacheMapas() {
    try {
        localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
    } catch (e) {
        console.error('[Mapas] Não foi possível atualizar o cache:', e);
        avisarMapa('Os dados do servidor foram recebidos, mas o cache deste navegador não pôde ser atualizado.', 'warning');
    }
}

function contarCadeirasMapa(mapa) {
    return (mapa.config?.setores || []).map(s => ({
        setor: s.nome || 'Sem Nome',
        quantidade: Object.values(s.cadeiras || {}).filter(c => c && c.tipo !== 'Apagado' && !c.isErased).length
    }));
}

async function apiMapa(method, path = '', body) {
    // Reutiliza a configuração do agente local já adotada pelo painel.
    if (typeof api === 'function') return api(method, `/mapas_teatro${path}`, body);
    const res = await fetch(`/api/mapas_teatro${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function notificarMapasAtualizados() {
    if (typeof populateImpMapasTeatro === 'function') {
        populateImpMapasTeatro('imp');
        populateImpMapasTeatro('ped');
    }
    for (const [prefixo, atualizar] of [['imp', window.updateImpSummary], ['ped', window.updatePedSummary]]) {
        const grupo = document.getElementById(`${prefixo}-mapa-teatro-group`);
        if (grupo && grupo.style.display === 'block' && (!grupo.getClientRects || grupo.getClientRects().length)
            && typeof atualizar === 'function') {
            try { atualizar(); } catch (e) { console.error('[Mapas] Erro ao atualizar a prévia:', e); }
        }
    }
}

async function fetchMapasTeatro() {
    const cargaVersao = ++mapasCargaVersao;
    // 1. Carrega o cache local IMEDIATAMENTE
    const localData = lerCacheMapas();
    window.state.mapas = [...localData];
    
    // 2. Renderiza na tela para o usuário não ficar esperando ou ver tela vazia
    renderTabelaMapas();
    
    // 3. Tenta sincronizar com o backend
    try {
        let success = false;
        let backendData = [];
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            // Só remover entradas antigas após ler a lista completa, sem o limite padrão do PostgREST.
            const tamanho = 500;
            for (let inicio = 0; ; inicio += tamanho) {
                const { data, error } = await supabaseClient.from('producao_mapas_teatro').select('*')
                    .order('name', { ascending: true }).order('id', { ascending: true }).range(inicio, inicio + tamanho - 1);
                if (error) throw error;
                if (!Array.isArray(data)) throw new Error('Resposta inválida ao carregar mapas.');
                backendData.push(...data);
                if (data.length < tamanho) break;
            }
            success = true;
        } else {
            // Fallback para api local se rodando em env dev sem supabase
            backendData = await apiMapa('GET');
            success = Array.isArray(backendData);
        }
        
        if (success && cargaVersao === mapasCargaVersao) {
            // O servidor define os cadastros existentes; preserva apenas rascunhos locais legados.
            const mergedMap = new Map();
            
            backendData.forEach(m => mergedMap.set(m.id, m));
            
            lerCacheMapas().forEach(m => {
                if (String(m.id).startsWith('local_') && !mergedMap.has(m.id)) {
                    mergedMap.set(m.id, m);
                }
            });
            
            window.state.mapas = Array.from(mergedMap.values());
            gravarCacheMapas();
            
            renderTabelaMapas();
            notificarMapasAtualizados();
        }
    } catch(e) {
        console.error("Erro ao sincronizar mapas com backend (mantendo cache local):", e);
    }
}

function escaparMapaHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTabelaMapas(filtro) {
    const tbody = document.getElementById('tbody-mapas');
    const empty = document.getElementById('empty-mapas');
    if (!tbody) return;
    
    // Usa o filtro passado ou lê o campo de busca
    const termo = (filtro !== undefined ? filtro : (document.getElementById('input-busca-mapa') || {}).value || '').toLowerCase().trim();
    
    tbody.innerHTML = '';
    
    const mapasFiltrados = (window.state.mapas || []).filter(m =>
        !termo || String(m.name || '').toLowerCase().includes(termo)
    );
    
    if (mapasFiltrados.length === 0) {
        if(empty) empty.style.display = 'flex';
        return;
    }
    
    if(empty) empty.style.display = 'none';
    
    mapasFiltrados.forEach(mapa => {
        const tr = document.createElement('tr');
        const config = mapa.config || {};
        const setores = config.setores || [];
        
        const totalAssentos = contarCadeirasMapa(mapa).reduce((total, s) => total + s.quantidade, 0)
            + Object.values(config.cadeiras || {}).filter(c => c && c.tipo !== 'Apagado' && !c.isErased).length;

        // Destaca o termo pesquisado no nome
        const nome = String(mapa.name || 'Mapa sem nome');
        const termoLiteral = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nomeFinal = termo
            ? nome.split(new RegExp(`(${termoLiteral})`, 'gi')).map((parte, idx) => idx % 2
                ? `<mark style="background:rgba(59,130,246,0.35); color:inherit; border-radius:2px;">${escaparMapaHtml(parte)}</mark>`
                : escaparMapaHtml(parte)).join('')
            : escaparMapaHtml(nome);

        tr.innerHTML = `
            <td><strong>${nomeFinal}</strong></td>
            <td>${setores.length} Setores</td>
            <td>${totalAssentos} Assentos</td>
            <td class="text-right">
                <button class="btn btn-sm">✏️ Editar</button>
                <button class="btn btn-sm btn-secondary" title="Duplicar mapa com todas as configurações">📋 Copiar</button>
                <button class="btn btn-sm">🗑️ Excluir</button>
            </td>
        `;
        const botoes = tr.querySelectorAll('button');
        botoes[0].onclick = () => editarMapaTeatro(mapa.id);
        botoes[1].onclick = () => duplicarMapaTeatro(mapa.id);
        botoes[2].onclick = () => excluirMapaTeatro(mapa.id);
        tbody.appendChild(tr);
    });
}

window.filtrarMapas = function(valor) {
    renderTabelaMapas(valor);
}

// ==========================================
// AÇÕES CRUD BÁSICAS
// ==========================================
window.novoMapaTeatro = function() {
    window.state.mapaAtual = {
        name: 'Novo Teatro',
        config: {
            setores: [],
            cadeiras: {} // dict { "x,y": { setorIdx, fileira, num, tipo } }
        }
    };
    abrirModalMapaTeatro();
}

window.editarMapaTeatro = function(id) {
    const m = window.state.mapas.find(x => x.id === id);
    if (!m) return;
    window.state.mapaAtual = JSON.parse(JSON.stringify(m));
    if (!window.state.mapaAtual.config.cadeiras) {
        window.state.mapaAtual.config.cadeiras = {};
    }
    abrirModalMapaTeatro();
}

function valorDoMapaConfere(atual, esperado) {
    if (esperado && typeof esperado === 'object') {
        if (!atual || typeof atual !== 'object' || Array.isArray(atual) !== Array.isArray(esperado)) return false;
        const chaves = Object.keys(esperado);
        return Object.keys(atual).length === chaves.length && chaves.every(k => valorDoMapaConfere(atual[k], esperado[k]));
    }
    return atual === esperado;
}

async function persistirMapaTeatro(mapa) {
    if (Object.keys(mapa.config.cadeiras || {}).length) {
        const erro = new Error('Há cadeiras antigas sem setor ou com posições conflitantes. Elas foram preservadas; revise essa configuração antes de salvar.');
        erro.code = 'MAPA_LEGADO';
        throw erro;
    }
    const lugares_por_setor = contarCadeirasMapa(mapa);
    const payload = {
        name: mapa.name,
        config: JSON.parse(JSON.stringify(mapa.config)),
        total_lugares: lugares_por_setor.reduce((total, s) => total + s.quantidade, 0),
        lugares_por_setor
    };
    const existente = mapa.id && !String(mapa.id).startsWith('local_');
    let salvo;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        const query = existente
            ? supabaseClient.from('producao_mapas_teatro').update(payload).eq('id', mapa.id)
            : supabaseClient.from('producao_mapas_teatro').insert([payload]);
        const { data, error } = await query.select('*').single();
        if (error) throw error;
        if (!data?.id || (existente && String(data.id) !== String(mapa.id))) {
            throw new Error('O salvamento não confirmou exatamente um mapa.');
        }
        // Guarda o ID antes da releitura: falha de confirmação não deve causar outro INSERT na tentativa seguinte.
        if (String(mapa.id).startsWith('local_')) mapa._idLocalAnterior = mapa.id;
        mapa.id = data.id;
        const confirmado = await supabaseClient.from('producao_mapas_teatro').select('*').eq('id', mapa.id).single();
        if (confirmado.error) throw confirmado.error;
        salvo = confirmado.data;
    } else {
        const resposta = await apiMapa(existente ? 'PUT' : 'POST', existente ? '/' + encodeURIComponent(mapa.id) : '', payload);
        if (!existente) {
            if (!resposta?.id) throw new Error('O salvamento não retornou o ID do mapa.');
            if (String(mapa.id).startsWith('local_')) mapa._idLocalAnterior = mapa.id;
            mapa.id = resposta.id;
        }
        salvo = await apiMapa('GET', '/' + encodeURIComponent(mapa.id));
    }
    if (!salvo || String(salvo.id) !== String(mapa.id)
        || !Object.keys(payload).every(campo => valorDoMapaConfere(salvo[campo], payload[campo]))) {
        throw new Error('Não foi possível confirmar os dados gravados. Suas alterações continuam no editor.');
    }
    return salvo;
}

function registrarMapaSalvo(salvo, idAnterior) {
    ++mapasCargaVersao; // invalida consultas anteriores à gravação
    window.state.mapas = (window.state.mapas || []).filter(m => m.id !== salvo.id && m.id !== idAnterior);
    window.state.mapas.push(JSON.parse(JSON.stringify(salvo)));
    window.state.mapas.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    gravarCacheMapas();
    renderTabelaMapas();
    notificarMapasAtualizados();
}

const mapasExcluindo = new Set();
window.excluirMapaTeatro = async function(id) {
    if (mapasExcluindo.has(id) || !confirm('Deseja realmente excluir este mapa?')) return;
    mapasExcluindo.add(id);
    try {
        if (!String(id).startsWith('local_')) {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data, error } = await supabaseClient.from('producao_mapas_teatro').delete().eq('id', id).select('id');
                if (error) throw error;
                if (!Array.isArray(data) || data.length !== 1 || String(data[0].id) !== String(id)) {
                    throw new Error('A exclusão não confirmou exatamente um mapa. Atualize a lista antes de repetir.');
                }
                const confirmado = await supabaseClient.from('producao_mapas_teatro').select('id').eq('id', id).maybeSingle();
                if (confirmado.error) throw confirmado.error;
                if (confirmado.data) throw new Error('O mapa ainda existe no servidor.');
            } else {
                await apiMapa('DELETE', '/' + encodeURIComponent(id));
                const restantes = await apiMapa('GET');
                if (!Array.isArray(restantes) || restantes.some(m => String(m.id) === String(id))) {
                    throw new Error('Não foi possível confirmar a exclusão do mapa.');
                }
            }
        }
        ++mapasCargaVersao;
        window.state.mapas = window.state.mapas.filter(x => x.id !== id);
        gravarCacheMapas();
        renderTabelaMapas();
        notificarMapasAtualizados();
        avisarMapa('Mapa excluído.', 'success');
    } catch (e) {
        console.error('[Mapas] Erro ao excluir:', e);
        avisarMapa('Não foi possível confirmar a exclusão. O mapa foi mantido na lista; atualize antes de repetir.');
    } finally {
        mapasExcluindo.delete(id);
    }
};

const mapasDuplicando = new Set();
window.duplicarMapaTeatro = async function(id) {
    const original = window.state.mapas.find(m => m.id === id);
    if (!original || mapasDuplicando.has(id)) return;
    const novoNome = 'Cópia de ' + original.name;
    if (!confirm('Duplicar o mapa "' + original.name + '" como "' + novoNome + '"?')) return;
    mapasDuplicando.add(id);
    const copia = { name: novoNome, config: JSON.parse(JSON.stringify(original.config || {})) };
    try {
        const salvo = await persistirMapaTeatro(copia);
        registrarMapaSalvo(salvo);
        avisarMapa('Mapa duplicado como "' + novoNome + '"!', 'success');
    } catch (e) {
        console.error('[Mapas] Erro ao duplicar:', e);
        window.state.mapaAtual = copia;
        abrirModalMapaTeatro();
        avisarMapa('Não foi possível confirmar a cópia. Confira os dados no editor e tente Salvar Mapa novamente.');
    } finally {
        mapasDuplicando.delete(id);
    }
};

window.salvarMapaTeatro = async function() {
    const mapa = window.state.mapaAtual;
    if (!mapa || mapaSalvando) return;
    mapa.name = document.getElementById('mapa-nome').value.trim() || 'Mapa sem nome';
    const idAnterior = mapa._idLocalAnterior || mapa.id;
    const controles = Array.from(document.getElementById('modal-mapa-teatro').querySelectorAll('button, input, select'))
        .map(el => ({ el, disabled: el.disabled }));
    mapaSalvando = true;
    controles.forEach(({ el }) => { el.disabled = true; });
    let salvo;
    try {
        salvo = await persistirMapaTeatro(mapa);
        registrarMapaSalvo(salvo, idAnterior);
    } catch (e) {
        console.error('[Mapas] Erro ao salvar:', e);
        avisarMapa(e.code === 'MAPA_LEGADO' ? e.message
            : 'Não foi possível confirmar o salvamento. Suas alterações continuam no editor; tente novamente.');
    } finally {
        mapaSalvando = false;
        controles.forEach(({ el, disabled }) => { el.disabled = disabled; });
    }
    if (salvo) {
        fecharModalMapaTeatro();
        avisarMapa('Mapa salvo e confirmado.', 'success');
    }
};

// ==========================================
// MODAL E SIDEBAR
// ==========================================
function abrirModalMapaTeatro() {
    document.getElementById('modal-mapa-teatro').style.display = 'flex';
    document.getElementById('mapa-nome').value = window.state.mapaAtual.name;
    
    // Limpar campos de fileira
    if(document.getElementById('mapa-fileira-prefix')) document.getElementById('mapa-fileira-prefix').value = 'A';
    if(document.getElementById('mapa-fileira-inicio')) document.getElementById('mapa-fileira-inicio').value = '1';
    if(document.getElementById('mapa-fileira-fim')) document.getElementById('mapa-fileira-fim').value = '30';
    if(document.getElementById('mapa-fileira-padrao')) document.getElementById('mapa-fileira-padrao').value = 'sequencial';
    atualizarPadraoDaFileira();
    // Atualiza header do canvas com o nome do mapa
    const nomeEl = document.getElementById('mapa-header-nome-val');
    if (nomeEl) nomeEl.textContent = window.state.mapaAtual.name;

    // Garante estrutura por setor
    const config = window.state.mapaAtual.config;
    if (!config.setores) config.setores = [];
    config.setores.forEach((s, idx) => {
        if (!s.id) s.id = 'setor_' + idx + '_' + Date.now();
        if (!s.cadeiras) s.cadeiras = {};
    });

    // Migra dados antigos (config.cadeiras global) se existir
    migrarDadosAntigos();

    window.setorSelecionadoIdx = config.setores.length > 0 ? 0 : null;
    window.cadeirasSelecionadas = new Set();
    window.cadeiraSelecionada = null;
    window.state.mapaHistory = [];
    window._camerasPorSetor = {}; // câmera independente por setor
    isDraggingMap = false;
    window.setMapTool('select');

    renderSetoresList();
    carregarSetorNoSidebar();
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
    atualizarHeaderSetor();

    setTimeout(initMapCanvas, 100);
}

window.fecharModalMapaTeatro = function() {
    if (mapaSalvando) return;
    document.getElementById('modal-mapa-teatro').style.display = 'none';
    window.state.mapaAtual = null;
    if(window.requestAnimFrameId) cancelAnimationFrame(window.requestAnimFrameId);
    window.requestAnimFrameId = null;
}

window.adicionarSetorMapa = function() {
    window.pushToMapHistory();
    
    // Limpar campos de fileira ao criar novo setor
    if(document.getElementById('mapa-fileira-prefix')) document.getElementById('mapa-fileira-prefix').value = 'A';
    if(document.getElementById('mapa-fileira-inicio')) document.getElementById('mapa-fileira-inicio').value = '1';
    if(document.getElementById('mapa-fileira-fim')) document.getElementById('mapa-fileira-fim').value = '30';
    if(document.getElementById('mapa-fileira-padrao')) document.getElementById('mapa-fileira-padrao').value = 'sequencial';
    atualizarPadraoDaFileira();
    const novoIdx = window.state.mapaAtual.config.setores.length;
    window.state.mapaAtual.config.setores.push({
        id: 'setor_' + novoIdx + '_' + Date.now(),
        nome: 'Novo Setor',
        fileiras: [],
        cadeiras: {}
    });
    window.setorSelecionadoIdx = novoIdx;
    window.cadeirasSelecionadas = new Set();
    renderSetoresList();
    carregarSetorNoSidebar();
    atualizarHeaderSetor();
    selecionarSetorComTransicao(novoIdx);
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
}

function renderSetoresList() {
    const list = document.getElementById('mapa-setores-list');
    list.innerHTML = '';
    const setores = window.state.mapaAtual.config.setores;

    setores.forEach((s, idx) => {
        const ativo = idx === window.setorSelecionadoIdx;
        const numAssentos = Object.values(s.cadeiras || {}).filter(c => c && c.tipo !== 'Apagado' && !c.isErased).length;

        const div = document.createElement('div');
        div.style.cssText = `
            padding: 8px 12px;
            background: ${ativo ? 'var(--blue)' : 'rgba(255,255,255,0.05)'};
            border: 1px solid ${ativo ? 'var(--blue)' : 'var(--border)'};
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s, border-color 0.2s;
        `;

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; flex-direction:column; gap:2px; min-width:0;';

        const nome = document.createElement('span');
        nome.style.cssText = 'font-size:0.88rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        nome.innerText = s.nome || `Setor ${idx+1}`;
        left.appendChild(nome);

        const meta = document.createElement('span');
        meta.style.cssText = `font-size:0.72rem; color:${ativo ? 'rgba(255,255,255,0.75)' : 'var(--text-dim)'};`;
        meta.innerText = numAssentos + ' assento' + (numAssentos !== 1 ? 's' : '');
        left.appendChild(meta);

        div.appendChild(left);

        const delBtn = document.createElement('button');
        delBtn.innerHTML = '❌';
        delBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; font-size:0.8rem; padding:4px; flex-shrink:0;';
        delBtn.title = 'Excluir Setor e suas cadeiras';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Excluir o setor "${s.nome || 'Setor '+(idx+1)}" e todas as ${numAssentos} cadeiras?`)) {
                window.excluirSetor(idx);
            }
        };
        div.appendChild(delBtn);

        div.onclick = () => {
            selecionarSetorComTransicao(idx);
        };
        list.appendChild(div);
    });
}

function selecionarSetorComTransicao(idx) {
    if (window.setorSelecionadoIdx === idx) return;

    const canvas = document.getElementById('mapa-canvas');

    // ── Fade OUT ──────────────────────────────────────────────
    if (canvas) {
        canvas.style.transition = 'opacity 0.18s ease';
        canvas.style.opacity = '0';
    }

    setTimeout(() => {
        if (!window.state.mapaAtual || !window.state.mapaAtual.config.setores[idx]) return;
        // Salva câmera do setor que estava ativo
        if (!window._camerasPorSetor) window._camerasPorSetor = {};
        if (window.setorSelecionadoIdx !== null) {
            window._camerasPorSetor[window.setorSelecionadoIdx] = { ...camera };
        }

        // Troca o setor
        window.setorSelecionadoIdx = idx;
        window.cadeirasSelecionadas = new Set();

        // Restaura câmera do novo setor (ou centraliza)
        if (window._camerasPorSetor[idx]) {
            Object.assign(camera, window._camerasPorSetor[idx]);
        } else if (mapCanvas) {
            camera.x = mapCanvas.width / 2;
            camera.y = mapCanvas.height / 2;
            camera.zoom = 1;
        }

        renderSetoresList();
        carregarSetorNoSidebar();
        atualizarHeaderSetor();
        if(window.renderTiposAssentoList) window.renderTiposAssentoList();
        if(window.renderToolbarTipos) window.renderToolbarTipos();

        // ── Fade IN ───────────────────────────────────────────
        if (canvas) {
            // Pequeno delay para o browser processar o novo frame antes do fade-in
            requestAnimationFrame(() => {
                canvas.style.opacity = '1';
            });
        }
    }, 180); // espera o fade-out completar
}

function atualizarHeaderSetor() {
    const el = document.getElementById('mapa-header-setor');
    if (!el) return;
    if (window.setorSelecionadoIdx !== null && window.state.mapaAtual) {
        const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
        el.textContent = s ? (' › ' + (s.nome || 'Setor ' + (window.setorSelecionadoIdx + 1))) : '';
    } else {
        el.textContent = '';
    }
}

window.excluirSetor = function(idx) {
    window.pushToMapHistory();
    // Simplesmente remove o setor (cadeiras ficam dentro do objeto do setor)
    window.state.mapaAtual.config.setores.splice(idx, 1);
    window.cadeirasSelecionadas = new Set();
    window._camerasPorSetor = {};

    const total = window.state.mapaAtual.config.setores.length;
    if (window.setorSelecionadoIdx === idx) {
        window.setorSelecionadoIdx = total > 0 ? Math.min(idx, total - 1) : null;
    } else if (window.setorSelecionadoIdx > idx) {
        window.setorSelecionadoIdx--;
    }

    renderSetoresList();
    carregarSetorNoSidebar();
    atualizarHeaderSetor();
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
}

function carregarSetorNoSidebar() {
    const props = document.getElementById('mapa-setor-props');
    const s = getSetorAtual();
    if (!s) {
        props.style.display = 'none';
        return;
    }
    props.style.display = 'flex';
    document.getElementById('mapa-setor-nome').value = s.nome || '';
}

window.atualizarSetorAtual = function() {
    if (window.setorSelecionadoIdx === null) return;
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    s.nome = document.getElementById('mapa-setor-nome').value;
    renderSetoresList(); 
    atualizarHeaderSetor();
}

window.setMapTool = function(tool) {
    mapTool = tool;
    document.getElementById('tool-select').style.background = tool === 'select' ? 'var(--blue)' : '';
    document.getElementById('tool-select').className = tool === 'select' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
    
    const panBtn = document.getElementById('tool-pan');
    if (panBtn) {
        panBtn.style.background = tool === 'pan' ? 'var(--blue)' : '';
        panBtn.className = tool === 'pan' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
    }
    
    document.getElementById('tool-erase').style.background = tool === 'erase' ? 'var(--blue)' : '';
    document.getElementById('tool-erase').className = tool === 'erase' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';

    const restoreBtn = document.getElementById('tool-restore');
    if (restoreBtn) {
        restoreBtn.style.background = tool === 'restore' ? 'var(--blue)' : '';
        restoreBtn.className = tool === 'restore' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
    }
}

// ==========================================
// MOTOR DO CANVAS
// ==========================================
function initMapCanvas() {
    if (!window.state.mapaAtual) return;
    if (window.requestAnimFrameId) cancelAnimationFrame(window.requestAnimFrameId);
    mapCanvas = document.getElementById('mapa-canvas');
    const container = document.getElementById('mapa-canvas-container');
    
    mapCanvas.width = mapCanvas.clientWidth || container.clientWidth;
    mapCanvas.height = mapCanvas.clientHeight || container.clientHeight;
    
    canvasCtx = mapCanvas.getContext('2d');
    
    camera.x = mapCanvas.width / 2;
    camera.y = mapCanvas.height / 2;
    camera.zoom = 1;
    
    mapCanvas.onmousedown = onMapMouseDown;
    mapCanvas.onmousemove = onMapMouseMove;
    mapCanvas.onmouseup = onMapMouseUp;
    mapCanvas.onwheel = onMapWheel;
    mapCanvas.onmouseleave = () => { isDraggingMap = false; };
    
    renderCanvasLoop();
}

function renderCanvasLoop() {
    if (!canvasCtx || !window.state.mapaAtual) return;
    renderMapa();
    window.requestAnimFrameId = requestAnimationFrame(renderCanvasLoop);
}

function renderMapa() {
    if (!canvasCtx || !window.state.mapaAtual) return;
    
    canvasCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    
    canvasCtx.save();
    canvasCtx.translate(camera.x, camera.y);
    canvasCtx.scale(camera.zoom, camera.zoom);
    
    // Grid
    canvasCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    canvasCtx.lineWidth = 1;
    const gSize = GRID_SIZE;
    const viewW = mapCanvas.width / camera.zoom;
    const viewH = mapCanvas.height / camera.zoom;
    const startX = Math.floor(-camera.x / camera.zoom / gSize) * gSize;
    const startY = Math.floor(-camera.y / camera.zoom / gSize) * gSize;
    
    canvasCtx.beginPath();
    for (let x = startX; x < startX + viewW + gSize; x += gSize) {
        canvasCtx.moveTo(x, startY);
        canvasCtx.lineTo(x, startY + viewH + gSize);
    }
    for (let y = startY; y < startY + viewH + gSize; y += gSize) {
        canvasCtx.moveTo(startX, y);
        canvasCtx.lineTo(startX + viewW + gSize, y);
    }
    canvasCtx.stroke();
    
    // Cadeiras do setor ativo
    const _setorAtivo = getSetorAtual();
    const cadeiras = _setorAtivo ? (_setorAtivo.cadeiras || {}) : {};

    // Mensagem quando nenhum setor selecionado
    if (!_setorAtivo) {
        canvasCtx.restore();
        canvasCtx.fillStyle = 'rgba(255,255,255,0.2)';
        canvasCtx.font = '16px Inter, Arial';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.fillText('Selecione ou crie um Setor na barra lateral', mapCanvas.width/2, mapCanvas.height/2);
        return;
    }
    const tipos = window.getTiposAssento();
    const tiposMap = new Map();
    tipos.forEach(t => tiposMap.set(t.id, t));

    for (const key in cadeiras) {
        const c = cadeiras[key];
        if (!c || c.tipo === 'Apagado' || c.isErased) continue;
        const [cx, cy] = key.split(',').map(Number);
        
        // Mantém compatibilidade com mapas velhos que usavam string c.tipo
        let tipoObj = tiposMap.get(c.tipo) || tiposMap.get('Normal') || tipos[0] || DEFAULT_TIPOS_ASSENTO[0];
        
        canvasCtx.fillStyle = tipoObj.cor;
        
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.has(key)) {
            canvasCtx.fillStyle = '#9b59b6'; // Purple for selected
        }

        canvasCtx.fillRect(cx * gSize, cy * gSize, SEAT_SIZE, SEAT_SIZE);
        
        canvasCtx.fillStyle = '#ffffff';
        
        const text = (c.prefixo || '') + (c.num || '') + (tipoObj.sufixo ? ' ' + tipoObj.sufixo : '');
        if (text.length > 4) {
            canvasCtx.font = '8px Arial';
        } else {
            canvasCtx.font = '10px Arial';
        }
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.fillText(text, cx * gSize + SEAT_SIZE/2, cy * gSize + SEAT_SIZE/2);
    }
    
    canvasCtx.restore();
    
    // Draw Legend fixed on screen bottom
    const legendTipos = window.getTiposAssento();
    let legX = 20;
    let legY = mapCanvas.height - 20;
    canvasCtx.font = '11px Arial';
    canvasCtx.textAlign = 'left';
    canvasCtx.textBaseline = 'middle';
    
    // Background for legend
    canvasCtx.fillStyle = 'rgba(0,0,0,0.6)';
    canvasCtx.fillRect(10, legY - 14, mapCanvas.width - 20, 28);
    
    legendTipos.forEach(t => {
        canvasCtx.fillStyle = t.cor;
        canvasCtx.fillRect(legX, legY - 5, 10, 10);
        canvasCtx.fillStyle = '#ffffff';
        let label = t.nome;
        if (t.sufixo) label += ' (' + t.sufixo + ')';
        canvasCtx.fillText(label, legX + 16, legY);
        legX += canvasCtx.measureText(label).width + 32;
    });

}

function atualizarEstatisticasMapa() {
    if (window.state.mapaAtual) renderSetoresList();
}

function getGridPos(evt) {
    const rect = mapCanvas.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) * (rect.width ? mapCanvas.width / rect.width : 1);
    const my = (evt.clientY - rect.top) * (rect.height ? mapCanvas.height / rect.height : 1);
    
    const worldX = (mx - camera.x) / camera.zoom;
    const worldY = (my - camera.y) / camera.zoom;
    
    const gx = Math.floor(worldX / GRID_SIZE);
    const gy = Math.floor(worldY / GRID_SIZE);
    return { gx, gy, mx, my };
}

function onMapMouseDown(e) {
    if (mapaSalvando) return;
    window._borrachaComHistorico = false;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && mapTool === 'pan')) {
        isDraggingMap = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        cameraStart.x = camera.x;
        cameraStart.y = camera.y;
        return;
    }
    
    if (e.button === 0) {
        const pos = getGridPos(e);
        const key = `${pos.gx},${pos.gy}`;
        const _s = getSetorAtual();
        if (!_s) return; // nenhum setor selecionado
        const cadeiras = getCadeirasSetor(_s);

        let changed = false;
        if (mapTool === 'erase') {
            if (cadeiras[key]) {
                window.pushToMapHistory();
                window._borrachaComHistorico = true;
                delete cadeiras[key];
                changed = true;
            }
        } else if (mapTool === 'restore') {
            if (!cadeiras[key]) {
                
                // Tenta pegar o prefixo da mesma fileira
                let refPrefixo = document.getElementById('mapa-fileira-prefix').value || 'A';
                refPrefixo = refPrefixo.split(',')[0].split('-')[0].trim();
                
                for (let k in cadeiras) {
                    if (k.endsWith(',' + pos.gy)) {
                        refPrefixo = cadeiras[k].prefixo;
                        break;
                    }
                }
                
                // Tenta calcular o número com base no vizinho esquerdo ou direito
                const padrao = document.getElementById('mapa-fileira-padrao').value;
                const esquerdo = cadeiras[`${pos.gx - 1},${pos.gy}`];
                const direito = cadeiras[`${pos.gx + 1},${pos.gy}`];
                const referencia = lerEtiquetaDoMapa(esquerdo?.num ?? direito?.num
                    ?? document.getElementById('mapa-fileira-inicio').value);
                if (!referencia) {
                    avisarMapa('Informe um início numérico ou alfabético válido antes de restaurar.', 'warning');
                    return;
                }
                const passo = referencia.tipo === 'numero' && (padrao === 'par' || padrao === 'impar') ? 2 : 1;
                const valor = referencia.valor + (esquerdo ? passo : direito ? -passo : 0);
                if (valor < 1 || !Number.isSafeInteger(valor)) {
                    avisarMapa('Não há um rótulo válido antes deste assento. Ajuste o início antes de restaurar.', 'warning');
                    return;
                }
                const refNum = referencia.tipo === 'letra' ? letrasDoMapa(valor) : valor;
                if (Object.values(cadeiras).some(c => c && c.tipo !== 'Apagado' && !c.isErased
                    && String(c.prefixo ?? '') === String(refPrefixo)
                    && chaveEtiquetaDoMapa(c.num) === chaveEtiquetaDoMapa(refNum))) {
                    avisarMapa(`O assento ${refPrefixo}${refNum} já existe. Ajuste o início ou o padrão antes de restaurar.`, 'warning');
                    return;
                }
                window.pushToMapHistory();
                
                cadeiras[key] = {
                    prefixo: refPrefixo,
                    num: refNum,
                    tipo: 'Normal'
                };
                changed = true;
            }
        } else if (mapTool === 'select') {
            window.cadeirasSelecionadas = window.cadeirasSelecionadas || new Set();
            if (cadeiras[key]) {
                if (!e.shiftKey && !e.ctrlKey) window.cadeirasSelecionadas.clear();
                window.cadeirasSelecionadas.add(key);
                changed = true;
                
                // Preenche formulário para facilitar adição na mesma fila
                document.getElementById('mapa-fileira-prefix').value = cadeiras[key].prefixo || '';
                document.getElementById('mapa-fileira-inicio').value = proximaEtiquetaDoMapa(cadeiras[key].num);
                atualizarPadraoDaFileira();
                // cadeiras já pertencem ao setor ativo
            } else {
                window.cadeirasSelecionadas.clear();
                changed = true;
            }
        }
        
        if (changed) {
            window.requestAnimationFrame(renderMapa);
            if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
        }
    }
}

function onMapMouseMove(e) {
    if (mapaSalvando) return;
    if (isDraggingMap) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        camera.x = cameraStart.x + dx;
        camera.y = cameraStart.y + dy;
        window.requestAnimationFrame(renderMapa);
    }
    
    if (e.buttons === 1) {
        const pos = getGridPos(e);
        const key = `${pos.gx},${pos.gy}`;
        const _sm = getSetorAtual();
        if (!_sm) return;
        const cadeiras = getCadeirasSetor(_sm);

        if (mapTool === 'erase') {
            if (cadeiras[key]) {
                if (!window._borrachaComHistorico) {
                    window.pushToMapHistory();
                    window._borrachaComHistorico = true;
                }
                delete cadeiras[key];
                window.requestAnimationFrame(renderMapa);
                if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
            }
        } else if (mapTool === 'select') {
            if (cadeiras[key]) {
                window.cadeirasSelecionadas = window.cadeirasSelecionadas || new Set();
                window.cadeirasSelecionadas.add(key);
                window.requestAnimationFrame(renderMapa);
                
                // Preenche formulário para facilitar adição na mesma fila
                document.getElementById('mapa-fileira-prefix').value = cadeiras[key].prefixo || '';
                document.getElementById('mapa-fileira-inicio').value = proximaEtiquetaDoMapa(cadeiras[key].num);
                atualizarPadraoDaFileira();
            }
        }
    }
}

function onMapMouseUp(e) {
    isDraggingMap = false;
    window._borrachaComHistorico = false;
}

function onMapWheel(e) {
    e.preventDefault();
    const rect = mapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (rect.width ? mapCanvas.width / rect.width : 1);
    const my = (e.clientY - rect.top) * (rect.height ? mapCanvas.height / rect.height : 1);

    const zoomFactor = 1.1;
    let newZoom = camera.zoom;
    
    if (e.deltaY < 0) newZoom *= zoomFactor;
    else newZoom /= zoomFactor;
    
    newZoom = Math.max(0.1, Math.min(newZoom, 5));
    
    camera.x = mx - (mx - camera.x) * (newZoom / camera.zoom);
    camera.y = my - (my - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
}

// ==========================================
// FUNÇÕES DE CRIAÇÃO EM MASSA
// ==========================================
// Limite por operação para não travar o editor; não limita o total de um mapa.
const MAX_ASSENTOS_POR_INCLUSAO_MAPA = 50000;

function lerEtiquetaDoMapa(entrada, permitirZero = false) {
    const texto = String(entrada ?? '').trim().toUpperCase();
    if (/^\d+$/.test(texto)) {
        const valor = Number(texto);
        return Number.isSafeInteger(valor) && valor >= (permitirZero ? 0 : 1)
            ? { tipo: 'numero', valor, texto: String(valor) } : null;
    }
    if (!/^[A-Z]+$/.test(texto)) return null;
    let valor = 0;
    for (const letra of texto) {
        valor = valor * 26 + letra.charCodeAt(0) - 64;
        if (!Number.isSafeInteger(valor)) return null;
    }
    return { tipo: 'letra', valor, texto };
}

function letrasDoMapa(valor) {
    let texto = '';
    while (valor > 0) {
        valor--;
        texto = String.fromCharCode(65 + valor % 26) + texto;
        valor = Math.floor(valor / 26);
    }
    return texto;
}

function chaveEtiquetaDoMapa(entrada) {
    const etiqueta = lerEtiquetaDoMapa(entrada);
    return etiqueta ? `${etiqueta.tipo}:${etiqueta.valor}` : `texto:${String(entrada ?? '').trim()}`;
}

function proximaEtiquetaDoMapa(entrada) {
    const etiqueta = lerEtiquetaDoMapa(entrada);
    if (!etiqueta || !Number.isSafeInteger(etiqueta.valor + 1)) return '';
    return etiqueta.tipo === 'letra' ? letrasDoMapa(etiqueta.valor + 1) : etiqueta.valor + 1;
}

function expandirFaixaDoMapa(primeiro, ultimo, permitirInvertida = false, permitirZero = false) {
    const inicio = lerEtiquetaDoMapa(primeiro, permitirZero), fim = lerEtiquetaDoMapa(ultimo, permitirZero);
    if (!inicio || !fim || inicio.tipo !== fim.tipo) {
        throw new Error('Informe início e fim do mesmo tipo: números positivos (1 até 3) ou letras (A até D).');
    }
    if (!permitirInvertida && fim.valor < inicio.valor) {
        throw new Error('O fim deve ser maior ou igual ao início, na ordem numérica ou alfabética.');
    }
    if (Math.abs(fim.valor - inicio.valor) + 1 > MAX_ASSENTOS_POR_INCLUSAO_MAPA) {
        throw new Error('O intervalo é grande demais para uma inclusão. Divida a criação em intervalos menores.');
    }
    const passo = fim.valor >= inicio.valor ? 1 : -1, valores = [];
    for (let valor = inicio.valor; passo > 0 ? valor <= fim.valor : valor >= fim.valor; valor += passo) {
        valores.push(inicio.tipo === 'letra' ? letrasDoMapa(valor) : valor);
    }
    return { tipo: inicio.tipo, inicio: valores[0], fim: valores[valores.length - 1], valores };
}

function expandirFilasDoMapa(entrada) {
    const prefixos = [];
    for (const parte of String(entrada).split(',').map(p => p.trim()).filter(Boolean)) {
        const faixa = parte.match(/^([A-Za-z]+)\s*-\s*([A-Za-z]+)$/) || parte.match(/^(\d+)\s*-\s*(\d+)$/);
        if (faixa) prefixos.push(...expandirFaixaDoMapa(faixa[1], faixa[2], true, true).valores.map(String));
        else prefixos.push(/^[A-Za-z]$/.test(parte) ? parte.toUpperCase() : parte);
        if (prefixos.length > MAX_ASSENTOS_POR_INCLUSAO_MAPA) throw new Error('Há filas demais para uma inclusão. Divida a criação em intervalos menores.');
    }
    return prefixos.length ? prefixos : ['A'];
}

window.atualizarPadraoDaFileira = function() {
    const select = document.getElementById('mapa-fileira-padrao');
    if (!select) return;
    const alfabeto = ['inicio', 'fim'].some(campo => lerEtiquetaDoMapa(document.getElementById('mapa-fileira-' + campo)?.value)?.tipo === 'letra');
    select.disabled = alfabeto || mapaSalvando;
    if (alfabeto) select.value = 'sequencial';
};

window.gerarFileiraNoCanvas = function() {
    if (window.setorSelecionadoIdx === null) {
        alert("Selecione ou crie um Setor primeiro!");
        return;
    }
    
    let intervalo, prefixos;
    try {
        intervalo = expandirFaixaDoMapa(document.getElementById('mapa-fileira-inicio').value,
            document.getElementById('mapa-fileira-fim').value);
        prefixos = expandirFilasDoMapa(document.getElementById('mapa-fileira-prefix').value || 'A');
    } catch (erro) {
        avisarMapa(erro.message, 'warning');
        return;
    }
    atualizarPadraoDaFileira();
    const { inicio, fim } = intervalo;
    const padrao = intervalo.tipo === 'letra' ? 'sequencial' : document.getElementById('mapa-fileira-padrao').value;
    const lugares = intervalo.valores.filter(i => (padrao !== 'impar' || i % 2 !== 0) && (padrao !== 'par' || i % 2 === 0));
    if (prefixos.length * lugares.length > MAX_ASSENTOS_POR_INCLUSAO_MAPA) {
        avisarMapa('Há assentos demais para uma inclusão. Divida a criação em intervalos menores.', 'warning');
        return;
    }
    
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    // Prepara a inclusão em uma cópia; uma colisão não pode deixar meia fileira aplicada.
    const cadeiras = JSON.parse(JSON.stringify(s.cadeiras || {}));
    const fileiras = [...(s.fileiras || [])];
    // O rótulo Fila + Número identifica o assento dentro do setor.
    const rotulos = new Set(Object.values(cadeiras).filter(c => c && c.tipo !== 'Apagado' && !c.isErased)
        .map(c => JSON.stringify([String(c.prefixo ?? ''), chaveEtiquetaDoMapa(c.num)])));
    for (const prefixo of prefixos) {
        for (const i of lugares) {
            const rotulo = JSON.stringify([prefixo, chaveEtiquetaDoMapa(i)]);
            if (rotulos.has(rotulo)) {
                avisarMapa(`O assento ${prefixo}${i} já existe neste setor. Ajuste a fila ou o intervalo.`, 'warning');
                return;
            }
            rotulos.add(rotulo);
        }
    }
    
    const numSeatsToAdd = lugares.length;
    
    for (let pIdx = 0; pIdx < prefixos.length; pIdx++) {
        const prefixo = prefixos[pIdx];
        fileiras.push({ prefixo, inicio, fim, padrao });
        
        let startY = null; 
        let startX = null; 
        let referenceChairKey = null;
        
        // Verifica se há UMA cadeira selecionada que pertença a este setor e prefixo.
        // Se sim, inserimos a partir dela!
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.size === 1) {
            const selKey = Array.from(window.cadeirasSelecionadas)[0];
            const selChair = cadeiras[selKey];
            if (selChair && selChair.prefixo === prefixo) {
                referenceChairKey = selKey;
                let [gx, gy] = selKey.split(',').map(Number);
                startX = gx;
                startY = gy;
            }
        }
        
        if (referenceChairKey === null) {
            // Verifica se já existe a fileira com este prefixo no setor (vai pro final)
            for (let k in cadeiras) {
                const c = cadeiras[k];
                if (c.prefixo === prefixo) {
                    let [gx, gy] = k.split(',').map(Number);
                    if (startY === null) startY = gy;
                    if (startX === null || gx > startX) startX = gx;
                }
            }
        }
        
        let currentX;
        if (startY !== null) {
            if (referenceChairKey !== null) {
                // Desloca todas as cadeiras existentes à direita do startX para abrir espaço
                const chairsToShift = [];
                for (let k in cadeiras) {
                    let [gx, gy] = k.split(',').map(Number);
                    if (gy === startY && gx > startX) {
                        chairsToShift.push({ key: k, gx, gy, c: cadeiras[k] });
                    }
                }
                chairsToShift.sort((a, b) => b.gx - a.gx); // da direita para a esquerda
                for (const item of chairsToShift) {
                    const newKey = `${item.gx + numSeatsToAdd},${item.gy}`;
                    cadeiras[newKey] = item.c;
                    delete cadeiras[item.key];
                }
            }
            
            // Continua a fileira
            currentX = startX + 1;
        } else {
            // Fileira nova, acha a linha de baixo
            let maxGy = -999;
            for(let k in cadeiras) {
                let gy = parseInt(k.split(',')[1]);
                if(gy > maxGy) maxGy = gy;
            }
            startY = (maxGy !== -999) ? maxGy + 2 : 0;
            currentX = -15; 
        }
        
        for (const i of lugares) {
            let key = `${currentX},${startY}`;
            if (cadeiras[key]) {
                avisarMapa('Há uma cadeira no espaço da nova fileira. Selecione uma cadeira para inserir a partir dela ou mova a cadeira existente.', 'warning');
                return;
            }
            cadeiras[key] = {
                prefixo: prefixo,
                num: i,
                tipo: 'Normal'
            };
            currentX++;
        }
    }
    window.pushToMapHistory();
    s.cadeiras = cadeiras;
    s.fileiras = fileiras;
    atualizarEstatisticasMapa();
    window.requestAnimationFrame(renderMapa);
}

window.marcarAssentoEspecial = function(tipo) {
    if (!window.cadeirasSelecionadas || window.cadeirasSelecionadas.size === 0) {
        alert("Selecione uma ou mais cadeiras com a ferramenta 'Selecionar' primeiro.");
        return;
    }
    
    const _sm2 = getSetorAtual();
    if (!_sm2) return;
    const cadeiras = getCadeirasSetor(_sm2);
    let count = 0;

    window.pushToMapHistory();

    window.cadeirasSelecionadas.forEach(key => {
        if (cadeiras[key]) {
            cadeiras[key].tipo = tipo;
            count++;
        }
    });
    
    if (count > 0) {
        window.cadeirasSelecionadas.clear();
        window.requestAnimationFrame(renderMapa);
        if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
    }
}

// ==========================================
// INIT ROUTER
// ==========================================
const originalShowView = window.showView;
window.showView = function(viewId) {
    if (originalShowView) originalShowView(viewId);
    
    // Highlight the sidebar button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (btn) btn.classList.add('active');
    
    // Hide all sections, show target
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    const sec = document.getElementById(viewId);
    if (sec) sec.style.display = 'block';
    
    if (viewId === 'view-mapas') {
        fetchMapasTeatro();
    }
}

// Initial trigger via DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('nav-mapas');
    if (btn) {
        btn.addEventListener('click', () => {
            window.showView('view-mapas');
        });
    }
    
    // Carrega os mapas do localStorage imediatamente (para não mostrar tabela vazia no F5)
    const localData = lerCacheMapas();
    if (localData.length > 0) {
        window.state.mapas = [...localData];
        // Aguarda o DOM estar pronto para renderizar a tabela
        setTimeout(() => {
            if (typeof renderTabelaMapas === 'function') renderTabelaMapas();
        }, 100);
    }
    
    // Após o DOM e scripts carregarem, sincroniza com o backend
    // Maior delay para garantir que supabaseClient já foi inicializado
    setTimeout(() => {
        fetchMapasTeatro();
    }, 800);
});

// ==========================================
// EVENTOS GLOBAIS DE TECLADO
// ==========================================
window.deletarSelecionadas = function() {
    if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.size > 0) {
        window.pushToMapHistory();
        const _s = getSetorAtual();
        if (!_s) return;
        const cadeiras = getCadeirasSetor(_s);
        window.cadeirasSelecionadas.forEach(key => {
            delete cadeiras[key];
        });
        window.cadeirasSelecionadas.clear();
        if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
    }
};

document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('modal-mapa-teatro');
    if (!modal || modal.style.display !== 'flex' || mapaSalvando) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
    
    // Spacebar: ativa ferramenta Mover (pan) enquanto pressionado
    if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (mapTool !== 'pan') {
            window._toolAntesDoSpace = mapTool; // guarda a ferramenta atual
        }
        window.setMapTool('pan');
        const canvas = document.getElementById('mapa-canvas');
        if (canvas) canvas.style.cursor = 'grab';
        return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        window.undoMapHistory();
        return;
    }

    // Deleta as cadeiras selecionadas ao pressionar X ou Delete
    if (e.key.toLowerCase() === 'x' || e.key === 'Delete') {
        window.deletarSelecionadas();
    }
    
    // Move as cadeiras selecionadas com as setas do teclado
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.size > 0) {
            e.preventDefault();
            const _sarrow = getSetorAtual();
            if (!_sarrow) return;
            const cadeiras = getCadeirasSetor(_sarrow);

            let dx = 0, dy = 0;
            if (e.key === 'ArrowUp') dy = -1;
            if (e.key === 'ArrowDown') dy = 1;
            if (e.key === 'ArrowLeft') dx = -1;
            if (e.key === 'ArrowRight') dx = 1;
            
            const toMove = [];
            window.cadeirasSelecionadas.forEach(key => {
                let [gx, gy] = key.split(',').map(Number);
                if (cadeiras[key]) toMove.push({ key, gx, gy, c: cadeiras[key] });
            });
            const chavesMovidas = new Set(toMove.map(item => item.key));
            if (toMove.some(item => {
                const destino = `${item.gx + dx},${item.gy + dy}`;
                return cadeiras[destino] && !chavesMovidas.has(destino);
            })) {
                avisarMapa('Há uma cadeira no destino. Escolha um espaço livre para mover a seleção.', 'warning');
                return;
            }
            if (!toMove.length) return;
            window.pushToMapHistory();
            
            toMove.forEach(item => delete cadeiras[item.key]);
            
            window.cadeirasSelecionadas.clear();
            toMove.forEach(item => {
                const newKey = `${item.gx + dx},${item.gy + dy}`;
                cadeiras[newKey] = item.c;
                window.cadeirasSelecionadas.add(newKey);
            });
            window.requestAnimationFrame(renderMapa);
        }
    }
});

// Ao soltar o Spacebar, volta para a ferramenta anterior
document.addEventListener('keyup', function(e) {
    const modal = document.getElementById('modal-mapa-teatro');
    if (!modal || modal.style.display !== 'flex') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.code === 'Space') {
        const ferramentaAnterior = window._toolAntesDoSpace || 'select';
        window._toolAntesDoSpace = null;
        window.setMapTool(ferramentaAnterior);
    }
});

// ==========================================
// TIPOS DE ASSENTO (LEGENDA E SUFIXOS)
// ==========================================

window.renderTiposAssentoList = function() {
    const container = document.getElementById('mapa-tipos-assento-list');
    if (!container) return;
    container.innerHTML = '';
    
    const tipos = window.getTiposAssento();
    tipos.forEach((t, i) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px; position:relative;';
        
        const cor = /^#[\da-f]{6}$/i.test(t.cor || '') ? t.cor : '#3498db';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:12px; height:12px; background:${cor}; border-radius:3px;"></span>
                    ${escaparMapaHtml(t.nome)}
                </strong>
                <button class="btn btn-sm btn-secondary" onclick="removerTipoAssento(${i})" style="color:red; padding:2px 6px;" title="Remover Tipo">✖</button>
            </div>
            <div style="display:flex; gap:6px;">
                <input type="text" class="form-control" value="${escaparMapaHtml(t.nome)}" placeholder="Nome" onchange="atualizarTipoAssento(${i}, 'nome', this.value)" style="flex:1; min-width:0; padding:4px 8px; font-size:0.8rem;">
                <input type="text" class="form-control" value="${escaparMapaHtml(t.sufixo)}" placeholder="Sufixo" onchange="atualizarTipoAssento(${i}, 'sufixo', this.value)" style="width:60px; padding:4px 8px; font-size:0.8rem;" title="Sufixo (ex: Cad)">
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <input type="color" value="${cor}" onchange="atualizarTipoAssento(${i}, 'cor', this.value)" style="width:30px; height:24px; padding:0; border:none; cursor:pointer;" title="Cor no Mapa">
                <input type="text" class="form-control" value="${escaparMapaHtml(t.icone)}" placeholder="Ícone" onchange="atualizarTipoAssento(${i}, 'icone', this.value)" style="width:40px; padding:4px 8px; font-size:0.8rem; text-align:center;" title="Ícone">
            </div>
        `;
        container.appendChild(div);
    });
}

window.renderToolbarTipos = function() {
    const toolbar = document.getElementById('mapa-toolbar-tipos');
    if (!toolbar) return;
    toolbar.innerHTML = '';
    
    const tipos = window.getTiposAssento();
    tipos.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-secondary';
        btn.onclick = () => marcarAssentoEspecial(t.id);
        btn.title = `Marcar como ${t.nome}`;
        btn.textContent = `${t.icone || '💺'} ${t.nome}`;
        toolbar.appendChild(btn);
    });
}

window.adicionarTipoAssentoMapa = function() {
    window.pushToMapHistory();
    const tipos = window.getTiposAssento();
    const novoId = 'tipo_' + Math.random().toString(36).substr(2, 6);
    tipos.push({
        id: novoId,
        nome: 'Novo Tipo',
        sufixo: 'Suf',
        cor: '#95a5a6',
        icone: '💺'
    });
    renderTiposAssentoList();
    renderToolbarTipos();
    renderMapa();
}

window.atualizarTipoAssento = function(idx, field, value) {
    window.pushToMapHistory();
    const tipos = window.getTiposAssento();
    if(tipos[idx]) {
        tipos[idx][field] = value;
    }
    renderTiposAssentoList();
    renderToolbarTipos();
    renderMapa();
}

window.removerTipoAssento = function(idx) {
    if(!confirm('Remover este tipo de assento?')) return;
    window.pushToMapHistory();
    const tipos = window.getTiposAssento();
    tipos.splice(idx, 1);
    renderTiposAssentoList();
    renderToolbarTipos();
    renderMapa();
}
