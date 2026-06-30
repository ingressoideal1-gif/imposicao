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
    
    renderSetoresList();
    if (typeof carregarSetorNoSidebar === 'function') carregarSetorNoSidebar();
    if (typeof atualizarHeaderSetor === 'function') atualizarHeaderSetor();
    if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
    window.requestAnimationFrame(() => {
        if (typeof renderCanvasLoop !== 'undefined' && canvasCtx) {
            // will render automatically if loop is running
        }
    });
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

    // Redistribui
    for (const key in global) {
        const c = global[key];
        const idx = c.setorIdx !== undefined ? c.setorIdx : 0;
        const setor = config.setores[idx];
        if (setor) {
            setor.cadeiras[key] = c;
        }
    }

    config.cadeiras = {}; // esvazia o global
    console.log('[Migração] Cadeiras migradas para setores individuais.');
}

// ==========================================
// INICIALIZAÇÃO E FETCH
// ==========================================
async function fetchMapasTeatro() {
    // 1. Carrega o cache local IMEDIATAMENTE
    const localData = JSON.parse(localStorage.getItem('vibe_mapas_teatro') || '[]');
    window.state.mapas = [...localData];
    
    // 2. Renderiza na tela para o usuário não ficar esperando ou ver tela vazia
    renderTabelaMapas();
    
    // 3. Tenta sincronizar com o backend
    try {
        let success = false;
        let backendData = [];
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient.from('producao_mapas_teatro').select('*').order('name', { ascending: true });
            if (!error && data) {
                backendData = data;
                success = true;
            }
        } else {
            // Fallback para api local se rodando em env dev sem supabase
            const res = await fetch('/api/mapas_teatro');
            if (res.ok) {
                backendData = await res.json();
                success = true;
            }
        }
        
        if (success) {
            // Merge robusto: Backend tem prioridade, mas mantemos o que só existe localmente
            const mergedMap = new Map();
            
            backendData.forEach(m => mergedMap.set(m.id, m));
            
            localData.forEach(m => {
                if (!mergedMap.has(m.id)) {
                    mergedMap.set(m.id, m);
                }
            });
            
            window.state.mapas = Array.from(mergedMap.values());
            localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
            
            renderTabelaMapas();
        }
    } catch(e) {
        console.error("Erro ao sincronizar mapas com backend (mantendo cache local):", e);
    }
}

function renderTabelaMapas(filtro) {
    const tbody = document.getElementById('tbody-mapas');
    const empty = document.getElementById('empty-mapas');
    if (!tbody) return;
    
    // Usa o filtro passado ou lê o campo de busca
    const termo = (filtro !== undefined ? filtro : (document.getElementById('input-busca-mapa') || {}).value || '').toLowerCase().trim();
    
    tbody.innerHTML = '';
    
    const mapasFiltrados = (window.state.mapas || []).filter(m =>
        !termo || m.name.toLowerCase().includes(termo)
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
        
        let totalAssentos = 0;
        setores.forEach(s => {
            (s.fileiras || []).forEach(f => {
                const count = Math.max(0, parseInt(f.fim) - parseInt(f.inicio) + 1);
                const pulos = (f.pulos || []).length;
                totalAssentos += (count - pulos);
            });
        });

        // Destaca o termo pesquisado no nome
        const nomeFinal = termo
            ? mapa.name.replace(new RegExp(`(${termo})`, 'gi'), '<mark style="background:rgba(59,130,246,0.35); color:inherit; border-radius:2px;">$1</mark>')
            : mapa.name;

        tr.innerHTML = `
            <td><strong>${nomeFinal}</strong></td>
            <td>${setores.length} Setores</td>
            <td>${totalAssentos} Assentos</td>
            <td class="text-right">
                <button class="btn btn-sm" onclick="editarMapaTeatro('${mapa.id}')">✏️ Editar</button>
                <button class="btn btn-sm btn-secondary" onclick="duplicarMapaTeatro('${mapa.id}')" title="Duplicar mapa com todas as configurações">📋 Copiar</button>
                <button class="btn btn-sm" onclick="excluirMapaTeatro('${mapa.id}')">🗑️ Excluir</button>
            </td>
        `;
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

window.excluirMapaTeatro = async function(id) {
    if (!confirm('Deseja realmente excluir este mapa?')) return;
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        await supabaseClient.from('producao_mapas_teatro').delete().eq('id', id);
    } else {
        try {
            await fetch(`/api/mapas_teatro/${id}`, { method: 'DELETE' });
        } catch(e){}
    }
    
    // Atualiza localstorage
    window.state.mapas = window.state.mapas.filter(x => x.id !== id);
    localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
    
    await fetchMapasTeatro();
}

window.duplicarMapaTeatro = async function(id) {
    const original = window.state.mapas.find(m => m.id === id);
    if (!original) return;
    
    const novoNome = `Cópia de ${original.name}`;
    if (!confirm(`Duplicar o mapa "${original.name}" como "${novoNome}"?`)) return;
    
    // Deep copy da config completa
    const copia = {
        name: novoNome,
        config: JSON.parse(JSON.stringify(original.config || {}))
    };
    // Não copiamos o ID para que seja gerado um novo
    
    let novoId = null;
    
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('producao_mapas_teatro')
                .insert([{ name: copia.name, config: copia.config }])
                .select();
            if (data && data.length > 0) {
                novoId = data[0].id;
                copia.id = novoId;
            } else if (error) {
                console.error('Erro ao duplicar no Supabase:', error);
            }
        } else {
            const res = await fetch('/api/mapas_teatro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(copia)
            });
            if (res.ok) {
                const saved = await res.json();
                copia.id = saved.id;
                novoId = saved.id;
            }
        }
    } catch(e) {
        console.error('Erro ao duplicar mapa:', e);
    }
    
    // Salva no cache local mesmo sem backend
    if (!copia.id) copia.id = 'local_' + Date.now();
    window.state.mapas.push(copia);
    localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
    
    await fetchMapasTeatro();
    
    if (typeof window.showToast === 'function') {
        window.showToast(`Mapa duplicado como "${novoNome}"!`, 'success');
    }
}

window.salvarMapaTeatro = async function() {
    const m = window.state.mapaAtual;
    m.name = document.getElementById('mapa-nome').value || 'Mapa sem nome';
    
    // Calcula totais de cadeiras por setor
    let total_lugares = 0;
    let lugares_por_setor = [];
    if (m.config && m.config.setores) {
        m.config.setores.forEach(s => {
            const qtd = Object.keys(s.cadeiras || {}).length;
            total_lugares += qtd;
            lugares_por_setor.push({
                setor: s.nome || 'Sem Nome',
                quantidade: qtd
            });
        });
    }
    m.total_lugares = total_lugares;
    m.lugares_por_setor = lugares_por_setor;
    
    let backendSuccess = false;
    
    try {
        if (m.id) {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const {error} = await supabaseClient.from('producao_mapas_teatro').update({
                    name: m.name,
                    config: m.config
                }).eq('id', m.id);
                if(!error) backendSuccess = true;
            } else {
                const res = await fetch(`/api/mapas_teatro/${m.id}`, {
                    method: 'PUT',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify(m)
                });
                if(res.ok) backendSuccess = true;
            }
        } else {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data, error } = await supabaseClient.from('producao_mapas_teatro').insert([{
                    name: m.name,
                    config: m.config
                }]).select();
                if(data && data.length > 0) {
                    m.id = data[0].id;
                    backendSuccess = true;
                }
            } else {
                const res = await fetch(`/api/mapas_teatro`, {
                    method: 'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify(m)
                });
                if(res.ok) {
                    const data = await res.json();
                    if(data.id) m.id = data.id;
                    backendSuccess = true;
                }
            }
        }
    } catch(e) {
        console.error("Erro ao salvar mapa no backend:", e);
    }
    
    // Atualiza o cache local SEMPRE, mesmo se deu sucesso no backend (garantia máxima)
    if (!m.id) {
        m.id = 'local_' + Math.random().toString(36).substr(2, 9);
    }
    window.state.mapas = window.state.mapas || [];
    const idx = window.state.mapas.findIndex(x => x.id === m.id);
    if (idx >= 0) {
        window.state.mapas[idx] = JSON.parse(JSON.stringify(m));
    } else {
        window.state.mapas.push(JSON.parse(JSON.stringify(m)));
    }
    localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
    
    fecharModalMapaTeatro();
    await fetchMapasTeatro();
}

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
    if(document.getElementById('mapa-fileira-padrao')) document.getElementById('mapa-fileira-padrao').value = 'seq';


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

    renderSetoresList();
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
    atualizarHeaderSetor();

    setTimeout(initMapCanvas, 100);
}

window.fecharModalMapaTeatro = function() {
    document.getElementById('modal-mapa-teatro').style.display = 'none';
    window.state.mapaAtual = null;
    if(window.requestAnimFrameId) cancelAnimationFrame(window.requestAnimFrameId);
}

window.adicionarSetorMapa = function() {
    window.pushToMapHistory();
    
    // Limpar campos de fileira ao criar novo setor
    if(document.getElementById('mapa-fileira-prefix')) document.getElementById('mapa-fileira-prefix').value = 'A';
    if(document.getElementById('mapa-fileira-inicio')) document.getElementById('mapa-fileira-inicio').value = '1';
    if(document.getElementById('mapa-fileira-fim')) document.getElementById('mapa-fileira-fim').value = '30';
    if(document.getElementById('mapa-fileira-padrao')) document.getElementById('mapa-fileira-padrao').value = 'seq';
    const novoIdx = window.state.mapaAtual.config.setores.length;
    window.state.mapaAtual.config.setores.push({
        id: 'setor_' + novoIdx + '_' + Date.now(),
        nome: 'Novo Setor',
        fileiras: [],
        cadeiras: {}
    });
    window.setorSelecionadoIdx = novoIdx;
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
        const numAssentos = Object.keys(s.cadeiras || {}).length;

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
    if (window.setorSelecionadoIdx === null) {
        props.style.display = 'none';
        return;
    }
    props.style.display = 'flex';
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    document.getElementById('mapa-setor-nome').value = s.nome || '';
}

window.atualizarSetorAtual = function() {
    if (window.setorSelecionadoIdx === null) return;
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    s.nome = document.getElementById('mapa-setor-nome').value;
    renderSetoresList(); 
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
    mapCanvas = document.getElementById('mapa-canvas');
    const container = document.getElementById('mapa-canvas-container');
    
    mapCanvas.width = container.clientWidth;
    mapCanvas.height = container.clientHeight;
    
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
        window.requestAnimFrameId = requestAnimationFrame(renderCanvasLoop);
        return;
    }
    const tipos = window.getTiposAssento();
    const tiposMap = new Map();
    tipos.forEach(t => tiposMap.set(t.id, t));

    for (const key in cadeiras) {
        const c = cadeiras[key];
        const [cx, cy] = key.split(',').map(Number);
        
        // Mantém compatibilidade com mapas velhos que usavam string c.tipo
        let tipoObj = tiposMap.get(c.tipo) || tiposMap.get('Normal') || tipos[0];
        
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

    window.requestAnimFrameId = requestAnimationFrame(renderCanvasLoop);
}

function getGridPos(evt) {
    const rect = mapCanvas.getBoundingClientRect();
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    
    const worldX = (mx - camera.x) / camera.zoom;
    const worldY = (my - camera.y) / camera.zoom;
    
    const gx = Math.floor(worldX / GRID_SIZE);
    const gy = Math.floor(worldY / GRID_SIZE);
    return { gx, gy, mx, my };
}

function onMapMouseDown(e) {
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
                delete cadeiras[key];
                changed = true;
            }
        } else if (mapTool === 'restore') {
            if (!cadeiras[key]) {
                window.pushToMapHistory();
                
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
                let refNum = parseInt(document.getElementById('mapa-fileira-inicio').value) || 1;
                let padrao = document.getElementById('mapa-fileira-padrao').value;
                let step = (padrao === 'par' || padrao === 'impar') ? 2 : 1;
                
                if (cadeiras[`${pos.gx - 1},${pos.gy}`]) {
                    refNum = parseInt(cadeiras[`${pos.gx - 1},${pos.gy}`].num) + step;
                } else if (cadeiras[`${pos.gx + 1},${pos.gy}`]) {
                    refNum = parseInt(cadeiras[`${pos.gx + 1},${pos.gy}`].num) - step;
                }
                
                cadeiras[key] = {
                    prefixo: refPrefixo,
                    num: refNum > 0 ? refNum : 1,
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
                document.getElementById('mapa-fileira-inicio').value = parseInt(cadeiras[key].num || 0) + 1;
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
                // To avoid pushing to history 60 times a second while dragging erase, 
                // we'll just push once if the mouse is down, but that's tricky here.
                // It's ok, we can just push on mouse down, and here we just delete.
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
                document.getElementById('mapa-fileira-inicio').value = parseInt(cadeiras[key].num || 0) + 1;
            }
        }
    }
}

function onMapMouseUp(e) {
    isDraggingMap = false;
}

function onMapWheel(e) {
    e.preventDefault();
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

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
window.gerarFileiraNoCanvas = function() {
    if (window.setorSelecionadoIdx === null) {
        alert("Selecione ou crie um Setor primeiro!");
        return;
    }
    
    window.pushToMapHistory();
    
    const prefixoRaw = document.getElementById('mapa-fileira-prefix').value || 'A';
    const inicio = parseInt(document.getElementById('mapa-fileira-inicio').value) || 1;
    const fim = parseInt(document.getElementById('mapa-fileira-fim').value) || 30;
    const padrao = document.getElementById('mapa-fileira-padrao').value;
    
    // Suporte para múltiplas fileiras separadas por vírgula (ex: A, B, C) e ranges (ex: B-H ou 1-5)
    const parts = prefixoRaw.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const prefixos = [];
    
    parts.forEach(part => {
        const rangeMatch = part.match(/^([A-Za-z0-9])\s*-\s*([A-Za-z0-9])$/);
        if (rangeMatch) {
            const startChar = rangeMatch[1];
            const endChar = rangeMatch[2];
            
            // Se ambos são letras
            if (/[a-zA-Z]/.test(startChar) && /[a-zA-Z]/.test(endChar)) {
                const sCode = startChar.toUpperCase().charCodeAt(0);
                const eCode = endChar.toUpperCase().charCodeAt(0);
                if (sCode <= eCode) {
                    for (let i = sCode; i <= eCode; i++) prefixos.push(String.fromCharCode(i));
                } else {
                    for (let i = sCode; i >= eCode; i--) prefixos.push(String.fromCharCode(i));
                }
            } 
            // Se ambos são números (single digit apenas, mas é um bônus)
            else if (/[0-9]/.test(startChar) && /[0-9]/.test(endChar)) {
                const sNum = parseInt(startChar);
                const eNum = parseInt(endChar);
                if (sNum <= eNum) {
                    for (let i = sNum; i <= eNum; i++) prefixos.push(i.toString());
                } else {
                    for (let i = sNum; i >= eNum; i--) prefixos.push(i.toString());
                }
            } else {
                prefixos.push(part);
            }
        } else {
            prefixos.push(part);
        }
    });
    
    if (prefixos.length === 0) prefixos.push('A');
    
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    if (!s.cadeiras) s.cadeiras = {};
    const cadeiras = s.cadeiras;
    
    let numSeatsToAdd = 0;
    for (let i = inicio; i <= fim; i++) {
        if (padrao === 'impar' && i % 2 === 0) continue;
        if (padrao === 'par' && i % 2 !== 0) continue;
        numSeatsToAdd++;
    }
    
    for (let pIdx = 0; pIdx < prefixos.length; pIdx++) {
        const prefixo = prefixos[pIdx];
        s.fileiras.push({ prefixo, inicio, fim, padrao });
        
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
        
        for (let i = inicio; i <= fim; i++) {
            if (padrao === 'impar' && i % 2 === 0) continue;
            if (padrao === 'par' && i % 2 !== 0) continue;
            
            let key = `${currentX},${startY}`;
            cadeiras[key] = {
                prefixo: prefixo,
                num: i,
                tipo: 'Normal'
            };
            currentX++;
        }
    }
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
    const localData = JSON.parse(localStorage.getItem('vibe_mapas_teatro') || '[]');
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
    if (!modal || modal.style.display !== 'flex') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
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
            window.pushToMapHistory();
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
                toMove.push({ key, gx, gy, c: cadeiras[key] });
            });
            
            toMove.forEach(item => delete cadeiras[item.key]);
            
            window.cadeirasSelecionadas.clear();
            toMove.forEach(item => {
                const newKey = `${item.gx + dx},${item.gy + dy}`;
                cadeiras[newKey] = item.c;
                window.cadeirasSelecionadas.add(newKey);
            });
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
        
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:12px; height:12px; background:${t.cor}; border-radius:3px;"></span>
                    ${t.nome}
                </strong>
                <button class="btn btn-sm btn-secondary" onclick="removerTipoAssento(${i})" style="color:red; padding:2px 6px;" title="Remover Tipo">✖</button>
            </div>
            <div style="display:flex; gap:6px;">
                <input type="text" class="form-control" value="${t.nome}" placeholder="Nome" onchange="atualizarTipoAssento(${i}, 'nome', this.value)" style="flex:1; min-width:0; padding:4px 8px; font-size:0.8rem;">
                <input type="text" class="form-control" value="${t.sufixo}" placeholder="Sufixo" onchange="atualizarTipoAssento(${i}, 'sufixo', this.value)" style="width:60px; padding:4px 8px; font-size:0.8rem;" title="Sufixo (ex: Cad)">
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <input type="color" value="${t.cor}" onchange="atualizarTipoAssento(${i}, 'cor', this.value)" style="width:30px; height:24px; padding:0; border:none; cursor:pointer;" title="Cor no Mapa">
                <input type="text" class="form-control" value="${t.icone}" placeholder="Ícone" onchange="atualizarTipoAssento(${i}, 'icone', this.value)" style="width:40px; padding:4px 8px; font-size:0.8rem; text-align:center;" title="Ícone">
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
        btn.innerHTML = `${t.icone || '💺'} ${t.nome}`;
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
    renderCanvasLoop();
}

window.atualizarTipoAssento = function(idx, field, value) {
    window.pushToMapHistory();
    const tipos = window.getTiposAssento();
    if(tipos[idx]) {
        tipos[idx][field] = value;
    }
    renderTiposAssentoList();
    renderToolbarTipos();
    renderCanvasLoop();
}

window.removerTipoAssento = function(idx) {
    if(!confirm('Remover este tipo de assento?')) return;
    window.pushToMapHistory();
    const tipos = window.getTiposAssento();
    tipos.splice(idx, 1);
    renderTiposAssentoList();
    renderToolbarTipos();
    renderCanvasLoop();
}
