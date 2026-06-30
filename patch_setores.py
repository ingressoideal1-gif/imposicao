import io, re

with io.open('frontend/mapas.js', 'r', encoding='utf-8') as f:
    src = f.read()

# ─────────────────────────────────────────────
# 1. Helper: get current sector cadeiras
# ─────────────────────────────────────────────
helper = """
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

"""

# Insert helper before the INICIALIZAÇÃO section
src = src.replace(
    '// ==========================================\n// INICIALIZAÇÃO E FETCH',
    helper + '// ==========================================\n// INICIALIZAÇÃO E FETCH'
)

# ─────────────────────────────────────────────
# 2. abrirModalMapaTeatro: garantir IDs e migrar + câmera por setor
# ─────────────────────────────────────────────
old_abrir = """function abrirModalMapaTeatro() {
    document.getElementById('modal-mapa-teatro').style.display = 'flex';
    document.getElementById('mapa-nome').value = window.state.mapaAtual.name;
    
    window.setorSelecionadoIdx = null;
    window.cadeirasSelecionadas = new Set();
    window.cadeiraSelecionada = null;
    window.state.mapaHistory = []; // Reset history when opening a map
    
    renderSetoresList();
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
    
    setTimeout(initMapCanvas, 100);
}"""

new_abrir = """function abrirModalMapaTeatro() {
    document.getElementById('modal-mapa-teatro').style.display = 'flex';
    document.getElementById('mapa-nome').value = window.state.mapaAtual.name;

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
}"""

if old_abrir in src:
    src = src.replace(old_abrir, new_abrir)
    print("abrirModalMapaTeatro: OK")
else:
    print("ERRO: abrirModalMapaTeatro não encontrado")

# ─────────────────────────────────────────────
# 3. adicionarSetorMapa: garante id e cadeiras
# ─────────────────────────────────────────────
old_add = """window.adicionarSetorMapa = function() {
    window.pushToMapHistory();
    window.state.mapaAtual.config.setores.push({
        nome: 'Novo Setor',
        fileiras: []
    });
    window.setorSelecionadoIdx = window.state.mapaAtual.config.setores.length - 1;
    renderSetoresList();
    carregarSetorNoSidebar();
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
}"""

new_add = """window.adicionarSetorMapa = function() {
    window.pushToMapHistory();
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
}"""

if old_add in src:
    src = src.replace(old_add, new_add)
    print("adicionarSetorMapa: OK")
else:
    print("ERRO: adicionarSetorMapa não encontrado")

# ─────────────────────────────────────────────
# 4. excluirSetor: usa setor.cadeiras
# ─────────────────────────────────────────────
old_excluir = """window.excluirSetor = function(idx) {
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
    if(window.renderTiposAssentoList) window.renderTiposAssentoList();
    if(window.renderToolbarTipos) window.renderToolbarTipos();
    window.requestAnimationFrame(renderMapa);
}"""

new_excluir = """window.excluirSetor = function(idx) {
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
}"""

if old_excluir in src:
    src = src.replace(old_excluir, new_excluir)
    print("excluirSetor: OK")
else:
    print("ERRO: excluirSetor não encontrado")

# ─────────────────────────────────────────────
# 5. renderSetoresList: tabs com transição + atualizarHeaderSetor
# ─────────────────────────────────────────────
old_render_setores = """function renderSetoresList() {
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
}"""

new_render_setores = """function renderSetoresList() {
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

    // Salva câmera do setor atual
    if (!window._camerasPorSetor) window._camerasPorSetor = {};
    if (window.setorSelecionadoIdx !== null) {
        window._camerasPorSetor[window.setorSelecionadoIdx] = { ...camera };
    }

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
}"""

if old_render_setores in src:
    src = src.replace(old_render_setores, new_render_setores)
    print("renderSetoresList: OK")
else:
    print("ERRO: renderSetoresList não encontrado")

# ─────────────────────────────────────────────
# 6. renderCanvasLoop: usa setor.cadeiras com fade
# ─────────────────────────────────────────────
old_cadeiras_line = "    // Cadeiras\n    const cadeiras = window.state.mapaAtual.config.cadeiras || {};"
new_cadeiras_line = """    // Cadeiras do setor ativo
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
    }"""

if old_cadeiras_line in src:
    src = src.replace(old_cadeiras_line, new_cadeiras_line)
    print("renderCanvasLoop cadeiras: OK")
else:
    print("ERRO: renderCanvasLoop cadeiras não encontrado")

# ─────────────────────────────────────────────
# 7. onMapMouseDown: usa setor.cadeiras
# ─────────────────────────────────────────────
old_mouse_cadeiras = "        const cadeiras = window.state.mapaAtual.config.cadeiras;\n        \n        let changed = false;\n        if (mapTool === 'erase') {"
new_mouse_cadeiras = """        const _s = getSetorAtual();
        if (!_s) return; // nenhum setor selecionado
        const cadeiras = getCadeirasSetor(_s);

        let changed = false;
        if (mapTool === 'erase') {"""

if old_mouse_cadeiras in src:
    src = src.replace(old_mouse_cadeiras, new_mouse_cadeiras)
    print("onMapMouseDown cadeiras: OK")
else:
    print("ERRO: onMapMouseDown cadeiras não encontrado")

# Remove the old setorIdx auto-select in mousedown (no longer needed)
old_setor_auto = """                // Seleciona automaticamente o setor da cadeira clicada
                if (cadeiras[key].setorIdx !== undefined && window.setorSelecionadoIdx !== cadeiras[key].setorIdx) {
                    window.setorSelecionadoIdx = cadeiras[key].setorIdx;
                    renderSetoresList();
                    carregarSetorNoSidebar();
                }"""
new_setor_auto = """                // cadeiras já pertencem ao setor ativo"""

if old_setor_auto in src:
    src = src.replace(old_setor_auto, new_setor_auto)
    print("setor auto-select: OK")
else:
    print("AVISO: setor auto-select não encontrado (pode já estar diferente)")

# ─────────────────────────────────────────────
# 8. onMapMouseMove: usa setor.cadeiras
# ─────────────────────────────────────────────
old_move_cadeiras = "        const cadeiras = window.state.mapaAtual.config.cadeiras;\n        \n        if (mapTool === 'erase') {"
new_move_cadeiras = """        const _sm = getSetorAtual();
        if (!_sm) return;
        const cadeiras = getCadeirasSetor(_sm);

        if (mapTool === 'erase') {"""

if old_move_cadeiras in src:
    src = src.replace(old_move_cadeiras, new_move_cadeiras)
    print("onMapMouseMove cadeiras: OK")
else:
    print("ERRO: onMapMouseMove cadeiras não encontrado")

# ─────────────────────────────────────────────
# 9. gerarFileiraNoCanvas: usa setor.cadeiras
# ─────────────────────────────────────────────
old_gerar = """    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    const cadeiras = window.state.mapaAtual.config.cadeiras;"""
new_gerar = """    const s = window.state.mapaAtual.config.setores[window.setorSelecionadoIdx];
    if (!s.cadeiras) s.cadeiras = {};
    const cadeiras = s.cadeiras;"""

if old_gerar in src:
    src = src.replace(old_gerar, new_gerar)
    print("gerarFileiraNoCanvas: OK")
else:
    print("ERRO: gerarFileiraNoCanvas não encontrado")

# Fix the reference chair check (no longer uses setorIdx)
old_ref = "            if (selChair && selChair.setorIdx === window.setorSelecionadoIdx && selChair.prefixo === prefixo) {"
new_ref = "            if (selChair && selChair.prefixo === prefixo) {"
if old_ref in src:
    src = src.replace(old_ref, new_ref)
    print("gerarFileiraNoCanvas ref check: OK")

# Fix the maxGy iteration (over setor cadeiras, already done by using s.cadeiras)
old_gy = """            for (let k in cadeiras) {
                const c = cadeiras[k];
                if (c.setorIdx === window.setorSelecionadoIdx && c.prefixo === prefixo) {"""
new_gy = """            for (let k in cadeiras) {
                const c = cadeiras[k];
                if (c.prefixo === prefixo) {"""
if old_gy in src:
    src = src.replace(old_gy, new_gy)
    print("gerarFileiraNoCanvas gy check: OK")

# Remove setorIdx from cadeira object when adding
old_seat_obj = """            cadeiras[key] = {
                setorIdx: window.setorSelecionadoIdx,
                prefixo: prefixo,
                num: i,
                tipo: 'Normal'
            };"""
new_seat_obj = """            cadeiras[key] = {
                prefixo: prefixo,
                num: i,
                tipo: 'Normal'
            };"""
if old_seat_obj in src:
    src = src.replace(old_seat_obj, new_seat_obj)
    print("gerarFileiraNoCanvas seat obj: OK")

# ─────────────────────────────────────────────
# 10. marcarAssentoEspecial: usa setor.cadeiras
# ─────────────────────────────────────────────
old_marcar = """    const cadeiras = window.state.mapaAtual.config.cadeiras;
    let count = 0;
    
    window.pushToMapHistory();
    
    window.cadeirasSelecionadas.forEach(key => {
        if (cadeiras[key]) {
            cadeiras[key].tipo = tipo;
            count++;
        }
    });"""
new_marcar = """    const _sm2 = getSetorAtual();
    if (!_sm2) return;
    const cadeiras = getCadeirasSetor(_sm2);
    let count = 0;

    window.pushToMapHistory();

    window.cadeirasSelecionadas.forEach(key => {
        if (cadeiras[key]) {
            cadeiras[key].tipo = tipo;
            count++;
        }
    });"""

if old_marcar in src:
    src = src.replace(old_marcar, new_marcar)
    print("marcarAssentoEspecial: OK")
else:
    print("ERRO: marcarAssentoEspecial não encontrado")

# ─────────────────────────────────────────────
# 11. Undo/Redo: atualiza header setor
# ─────────────────────────────────────────────
old_undo = """    renderSetoresList();
    if (typeof carregarSetorNoSidebar === 'function') carregarSetorNoSidebar();
    if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();"""
new_undo = """    renderSetoresList();
    if (typeof carregarSetorNoSidebar === 'function') carregarSetorNoSidebar();
    if (typeof atualizarHeaderSetor === 'function') atualizarHeaderSetor();
    if (typeof atualizarEstatisticasMapa === 'function') atualizarEstatisticasMapa();"""
if old_undo in src:
    src = src.replace(old_undo, new_undo)
    print("undoMapHistory: OK")

# ─────────────────────────────────────────────
# 12. Keyboard move arrows: usa setor.cadeiras
# ─────────────────────────────────────────────
old_arrow = """            const cadeiras = window.state.mapaAtual.config.cadeiras;
            
            let dx = 0, dy = 0;"""
new_arrow = """            const _sarrow = getSetorAtual();
            if (!_sarrow) return;
            const cadeiras = getCadeirasSetor(_sarrow);

            let dx = 0, dy = 0;"""
if old_arrow in src:
    src = src.replace(old_arrow, new_arrow)
    print("keyboard arrows: OK")

with io.open('frontend/mapas.js', 'w', encoding='utf-8') as f:
    f.write(src)

print("\n✅ mapas.js atualizado com sucesso!")
