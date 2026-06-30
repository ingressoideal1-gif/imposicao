$content = [System.IO.File]::ReadAllText("frontend\index.html", [System.Text.Encoding]::UTF8)

$oldSidebar = @"
                            <div id="mapa-setores-list" style="display:flex; flex-direction:column; gap:8px;">
                                <!-- Lista de setores dinâmicos -->
                            </div>
                            
                            <div class="divider"></div>
                            
                            <div id="mapa-setor-props" style="display:none; flex-direction:column; gap:12px;">
"@

$newSidebar = @"
                            <div id="mapa-setores-list" style="display:flex; flex-direction:column; gap:8px;">
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
                            
                            <div id="mapa-setor-props" style="display:none; flex-direction:column; gap:12px;">
"@

$oldToolbar = @"
                                <div style="width:1px; background:var(--border); margin:0 4px;"></div>
                                <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('PCD')" title="Marcar como PCD">♿</button>
                                <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Obeso')" title="Marcar como Obeso">💺</button>
                                <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Acompanhante')" title="Marcar como Acompanhante">👥</button>
                                <button class="btn btn-sm btn-secondary" onclick="marcarAssentoEspecial('Normal')" title="Remover Especial">✖️</button>
                            </div>
"@

$newToolbar = @"
                                <div style="width:1px; background:var(--border); margin:0 4px;"></div>
                                <div id="mapa-toolbar-tipos" style="display:flex; gap:8px;"></div>
                            </div>
"@

# Replace the text using string replacement
$content = $content.Replace($oldSidebar, $newSidebar)
$content = $content.Replace($oldToolbar, $newToolbar)
$content = $content.Replace("mapas.js?v=6", "mapas.js?v=9")
$content = $content.Replace("mapas.js?v=7", "mapas.js?v=9")
$content = $content.Replace("mapas.js?v=8", "mapas.js?v=9")

[System.IO.File]::WriteAllText("frontend\index.html", $content, [System.Text.Encoding]::UTF8)
Write-Output "Patch applied!"
