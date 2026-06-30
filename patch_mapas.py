import io
import re

with io.open('frontend/mapas.js', 'r', encoding='utf-8') as f:
    code = f.read()

defaultTipos = """
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
"""

code = code.replace('const GRID_SIZE = SEAT_SIZE + SEAT_GAP;', 'const GRID_SIZE = SEAT_SIZE + SEAT_GAP;\n' + defaultTipos)

code = code.replace('renderSetoresList();\n    carregarSetorNoSidebar();', 'renderSetoresList();\n    carregarSetorNoSidebar();\n    if(window.renderTiposAssentoList) window.renderTiposAssentoList();\n    if(window.renderToolbarTipos) window.renderToolbarTipos();')

old_render_loop_match = re.search(r'function renderCanvasLoop\(\) \{.*?window\.requestAnimFrameId = requestAnimationFrame\(renderCanvasLoop\);\n\}', code, re.DOTALL)

new_render_loop = """function renderCanvasLoop() {
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
}"""

if old_render_loop_match:
    code = code.replace(old_render_loop_match.group(0), new_render_loop)
else:
    print("Warning: old render loop not found")

uiCode = """
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
"""

code += uiCode

with io.open('frontend/mapas.js', 'w', encoding='utf-8') as f:
    f.write(code)
print('Patched mapas.js')
