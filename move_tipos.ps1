$content = [System.IO.File]::ReadAllText("frontend\index.html", [System.Text.Encoding]::UTF8)

# Bloco antigo: Tipos antes de setor-props (linhas 1758-1769)
$tiposBloco = @"

                            <div class="divider"></div>
                             
                             <div style="display:flex; justify-content:space-between; align-items:center;">
                                 <h3 style="font-size:0.95rem; margin:0;" title="Legenda e marcações especiais">Tipos / Legenda</h3>
                                 <button class="btn btn-sm btn-secondary" onclick="adicionarTipoAssentoMapa()">+ Tipo</button>
                             </div>
                             
                             <div id="mapa-tipos-assento-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                                 <!-- Lista de tipos dinâmicos -->
                             </div>
                             
                             <div class="divider"></div>
"@

$semTipos = @"

                            <div class="divider"></div>
"@

# Bloco onde fica o final do setor-props
$fimSetorProps = '                                <button class="btn btn-sm btn-primary" style="width:100%" onclick="gerarFileiraNoCanvas()">Adicionar Fileira no Mapa</button>' + "`r`n" + '                             </div>' + "`r`n" + '                         </div>'

$fimSetorPropsComTipos = '                                <button class="btn btn-sm btn-primary" style="width:100%" onclick="gerarFileiraNoCanvas()">Adicionar Fileira no Mapa</button>' + "`r`n" + '                             </div>' + "`r`n`r`n" + '                            <div class="divider"></div>' + "`r`n`r`n" + '                            <div style="display:flex; justify-content:space-between; align-items:center;">' + "`r`n" + '                                <h3 style="font-size:0.95rem; margin:0;">Tipos / Legenda</h3>' + "`r`n" + '                                <button class="btn btn-sm btn-secondary" onclick="adicionarTipoAssentoMapa()">+ Tipo</button>' + "`r`n" + '                            </div>' + "`r`n`r`n" + '                            <div id="mapa-tipos-assento-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">' + "`r`n" + '                                <!-- Lista de tipos dinâmicos -->' + "`r`n" + '                            </div>' + "`r`n" + '                        </div>'

# Remove o bloco de tipos da posição antiga
if ($content.Contains($tiposBloco)) {
    $content = $content.Replace($tiposBloco, $semTipos)
    Write-Output "Removeu Tipos do lugar errado!"
} else {
    Write-Output "Bloco antigo de Tipos nao encontrado"
}

# Adiciona o bloco de tipos depois do setor-props
if ($content.Contains($fimSetorProps)) {
    $content = $content.Replace($fimSetorProps, $fimSetorPropsComTipos)
    Write-Output "Adicionou Tipos depois do setor-props!"
} else {
    Write-Output "Fim do setor-props nao encontrado"
}

[System.IO.File]::WriteAllText("frontend\index.html", $content, [System.Text.Encoding]::UTF8)
