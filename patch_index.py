import io
import re

with io.open('frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''                <div id="mapa-setores-list" style="display:flex; flex-direction:column; gap:8px;">
                    <!-- Lista de setores dinâmicos -->
                </div>
                
                <div class="divider"></div>
                
                <div id="mapa-setor-props"'''

replacement1 = '''                <div id="mapa-setores-list" style="display:flex; flex-direction:column; gap:8px;">
                    <!-- Lista de setores dinâmicos -->
                </div>
                
                <div class="divider"></div>
                
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="font-size:0.95rem; margin:0;" title="Legenda e marcações especiais">Tipos / Legenda</h3>
                    <button class="btn btn-sm btn-secondary" onclick="adicionarTipoAssentoMapa()">+ Tipo</button>
                </div>
                
                <div id="mapa-tipos-assento-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                    <!-- Lista de tipos dinâmicos -->
                </div>
                
                <div class="divider"></div>
                
                <div id="mapa-setor-props"'''

target2 = '''<div style="width:1px; background:var(--border); margin:0 4px;"></div>
                    <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('PCD')" title="Marcar como PCD">♿</button>
                    <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Obeso')" title="Marcar como Obeso">💺</button>
                    <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Acompanhante')" title="Marcar como Acompanhante">👥</button>
                    <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Normal')" title="Remover Especial">✖️</button>
                </div>'''

replacement2 = '''<div style="width:1px; background:var(--border); margin:0 4px;"></div>
                    <div id="mapa-toolbar-tipos" style="display:flex; gap:8px;"></div>
                </div>'''

if target1 in content:
    content = content.replace(target1, replacement1)
    print('Replaced target 1')
else:
    print('Target 1 not found')

if target2 in content:
    content = content.replace(target2, replacement2)
    print('Replaced target 2')
else:
    print('Target 2 not found')

content = content.replace('mapas.js?v=6', 'mapas.js?v=9')
content = content.replace('mapas.js?v=8', 'mapas.js?v=9')

with io.open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
