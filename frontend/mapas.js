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
    if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
    window.requestAnimationFrame(() => {
        if (typeof renderCanvasLoop !== 'undefined' && canvasCtx) {
            // will render automatically if loop is running
        }
    });
}

// ==========================================
// INICIALIZAÇÃO E FETCH
// ==========================================
async function fetchMapasTeatro() {
    let success = false;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        const { data, error } = await supabaseClient.from('producao_mapas_teatro').select('*').order('name', { ascending: true });
        if (!error && data) {
            window.state.mapas = data;
            success = true;
        }
    } else {
        // Fallback para api local se rodando em env dev sem supabase
        try {
            const res = await fetch('/api/mapas_teatro');
            if (res.ok) {
                window.state.mapas = await res.json();
                success = true;
            }
        } catch(e) {}
    }
    
    // Fallback/Cache em localStorage e Merge para evitar sumiço por RLS do Supabase
    const localData = JSON.parse(localStorage.getItem('vibe_mapas_teatro') || '[]');
    
    if (success) {
        // Se a API retornou, fazemos merge com os locais (para não perder os mapas que salvamos mas a API não retornou)
        const merged = [...window.state.mapas];
        localData.forEach(localMap => {
            if (!merged.find(x => x.id === localMap.id)) {
                merged.push(localMap);
            }
        });
        window.state.mapas = merged;
        localStorage.setItem('vibe_mapas_teatro', JSON.stringify(window.state.mapas));
    } else {
        // Se falhou, usa 100% o que está local
        window.state.mapas = localData;
    }
    
    renderTabelaMapas();
}

function renderTabelaMapas() {
    const tbody = document.getElementById('tbody-mapas');
    const empty = document.getElementById('empty-mapas');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!window.state.mapas || window.state.mapas.length === 0) {
        if(empty) empty.style.display = 'flex';
        return;
    }
    
    if(empty) empty.style.display = 'none';
    
    window.state.mapas.forEach(mapa => {
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

        tr.innerHTML = `
            <td><strong>${mapa.name}</strong></td>
            <td>${setores.length} Setores</td>
            <td>${totalAssentos} Assentos</td>
            <td class="text-right">
                <button class="btn btn-sm" onclick="editarMapaTeatro('${mapa.id}')">✏️ Editar</button>
                <button class="btn btn-sm" onclick="excluirMapaTeatro('${mapa.id}')">🗑️ Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
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

window.salvarMapaTeatro = async function() {
    const m = window.state.mapaAtual;
    m.name = document.getElementById('mapa-nome').value || 'Mapa sem nome';
    
    let backendSuccess = false;
    
    if (m.id) {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const {error} = await supabaseClient.from('producao_mapas_teatro').update({
                name: m.name,
                config: m.config
            }).eq('id', m.id);
            if(!error) backendSuccess = true;
        } else {
            try {
                const res = await fetch(`/api/mapas_teatro/${m.id}`, {
                    method: 'PUT',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify(m)
                });
                if(res.ok) backendSuccess = true;
            } catch(e) {}
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
            try {
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
            } catch(e) {}
        }
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
    
    window.setorSelecionadoIdx = null;
    window.cadeirasSelecionadas = new Set();
    window.cadeiraSelecionada = null;
    window.state.mapaHistory = []; // Reset history when opening a map
    
    renderSetoresList();
    
    setTimeout(initMapCanvas, 100);
}

window.fecharModalMapaTeatro = function() {
    document.getElementById('modal-mapa-teatro').style.display = 'none';
    window.state.mapaAtual = null;
    if(window.requestAnimFrameId) cancelAnimationFrame(window.requestAnimFrameId);
}

window.adicionarSetorMapa = function() {
    window.pushToMapHistory();
    window.state.mapaAtual.config.setores.push({
        nome: 'Novo Setor',
        fileiras: []
    });
    window.setorSelecionadoIdx = window.state.mapaAtual.config.setores.length - 1;
    renderSetoresList();
    carregarSetorNoSidebar();
}

function renderSetoresList() {
    const list = document.getElementById('mapa-setores-list');
    list.innerHTML = '';
    const setores = window.state.mapaAtual.config.setores;
    
    setores.forEach((s, idx) => {
        const div = document.createElement('div');
        div.style.padding = '8px 12px';
        div.style.background = idx === window.setorSelecionadoIdx ? 'var(--blue)' : 'rgba(255,255,255,0.05)';
        div.style.border = '1px solid var(--border)';
        div.style.borderRadius = '6px';
        div.style.cursor = 'pointer';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        const textSpan = document.createElement('span');
        textSpan.innerText = s.nome || `Setor ${idx+1}`;
        div.appendChild(textSpan);
        
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '❌';
        delBtn.style.background = 'transparent';
        delBtn.style.border = 'none';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '0.8rem';
        delBtn.style.padding = '4px';
        delBtn.title = 'Excluir Setor e suas cadeiras';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Tem certeza que deseja excluir o setor "${s.nome || 'Setor '+(idx+1)}" e todas as cadeiras vinculadas a ele?`)) {
                window.excluirSetor(idx);
            }
        };
        div.appendChild(delBtn);
        
        div.onclick = () => {
            window.setorSelecionadoIdx = idx;
            renderSetoresList();
            carregarSetorNoSidebar();
        };
        list.appendChild(div);
    });
}

window.excluirSetor = function(idx) {
    window.pushToMapHistory();
    const setorId = window.state.mapaAtual.config.setores[idx].id;
    
    // Remove as cadeiras desse setor
    const cadeiras = window.state.mapaAtual.config.cadeiras;
    for (const key in cadeiras) {
        if (cadeiras[key].setorIdx === idx || cadeiras[key].setorId === setorId) {
            delete cadeiras[key];
        }
    }
    
    // Remove o setor
    window.state.mapaAtual.config.setores.splice(idx, 1);
    
    // Reajusta o setorIdx das cadeiras restantes
    for (const key in cadeiras) {
        if (cadeiras[key].setorIdx > idx) {
            cadeiras[key].setorIdx--;
        }
    }
    
    if (window.setorSelecionadoIdx === idx) {
        window.setorSelecionadoIdx = null;
    } else if (window.setorSelecionadoIdx > idx) {
        window.setorSelecionadoIdx--;
    }
    
    renderSetoresList();
    carregarSetorNoSidebar();
    window.requestAnimationFrame(renderMapa);
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
    
    // Cadeiras
    const cadeiras = window.state.mapaAtual.config.cadeiras || {};
    for (const key in cadeiras) {
        const c = cadeiras[key];
        const [cx, cy] = key.split(',').map(Number);
        
        if (c.tipo === 'PCD') canvasCtx.fillStyle = '#f1c40f';
        else if (c.tipo === 'Obeso') canvasCtx.fillStyle = '#e67e22';
        else if (c.tipo === 'Acompanhante') canvasCtx.fillStyle = '#2ecc71';
        else canvasCtx.fillStyle = '#3498db'; 
        
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.has(key)) {
            canvasCtx.fillStyle = '#9b59b6'; // Purple for selected
        }

        canvasCtx.fillRect(cx * gSize, cy * gSize, SEAT_SIZE, SEAT_SIZE);
        
        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.font = '10px Arial';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.fillText(c.prefixo + c.num, cx * gSize + SEAT_SIZE/2, cy * gSize + SEAT_SIZE/2);
    }
    
    canvasCtx.restore();
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
        const cadeiras = window.state.mapaAtual.config.cadeiras;
        
        let changed = false;
        if (mapTool === 'erase') {
            if (cadeiras[key]) {
                window.pushToMapHistory();
                delete cadeiras[key];
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
                // Seleciona automaticamente o setor da cadeira clicada
                if (cadeiras[key].setorIdx !== undefined && window.setorSelecionadoIdx !== cadeiras[key].setorIdx) {
                    window.setorSelecionadoIdx = cadeiras[key].setorIdx;
                    renderSetoresList();
                    carregarSetorNoSidebar();
                }
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
        const cadeiras = window.state.mapaAtual.config.cadeiras;
        
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
    
    // Suporte para múltiplas fileiras separadas por vírgula (ex: A, B, C)
    const prefixos = prefixoRaw.split(',').map(p => p.trim()).filter(p => p.length > 0);
    if (prefixos.length === 0) prefixos.push('A');
    
    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    const cadeiras = window.state.mapaAtual.config.cadeiras;
    
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
            if (selChair && selChair.setorIdx === window.setorSelecionadoIdx && selChair.prefixo === prefixo) {
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
                if (c.setorIdx === window.setorSelecionadoIdx && c.prefixo === prefixo) {
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
                setorIdx: window.setorSelecionadoIdx,
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
    
    const cadeiras = window.state.mapaAtual.config.cadeiras;
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
});

// ==========================================
// EVENTOS GLOBAIS DE TECLADO
// ==========================================
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('modal-mapa-teatro');
    if (!modal || modal.style.display !== 'flex') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        window.undoMapHistory();
        return;
    }

    // Deleta as cadeiras selecionadas ao pressionar X ou Delete
    if (e.key.toLowerCase() === 'x' || e.key === 'Delete') {
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.size > 0) {
            window.pushToMapHistory();
            const cadeiras = window.state.mapaAtual.config.cadeiras;
            window.cadeirasSelecionadas.forEach(key => {
                delete cadeiras[key];
            });
            window.cadeirasSelecionadas.clear();
            if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();
            
            // Re-render
            if (typeof renderCanvasLoop !== 'undefined' && canvasCtx) {
                // We just need a dirty flag or one frame because renderCanvasLoop might be running
                // but actually renderCanvasLoop uses requestAnimationFrame constantly.
            }
        }
    }
    
    // Move as cadeiras selecionadas com as setas do teclado
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (window.cadeirasSelecionadas && window.cadeirasSelecionadas.size > 0) {
            e.preventDefault();
            window.pushToMapHistory();
            const cadeiras = window.state.mapaAtual.config.cadeiras;
            
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
