const fs = require('fs');

let html = fs.readFileSync('frontend/producao.html', 'utf8');

// Find and replace the thead of imp-os-queue
const idx = html.indexOf('Nº ID</th>');
if (idx >= 0) {
    const trStart = html.lastIndexOf('<tr>', idx);
    const trEnd = html.indexOf('</tr>', idx) + '</tr>'.length;
    const oldTr = html.substring(trStart, trEnd);
    
    const newTr = `<tr>
                                                    <th style="padding: 6px 8px; text-align:center; width:40px;">Modelo</th>
                                                    <th style="padding: 6px 8px; width:70px;">Nº ID</th>
                                                    <th style="padding: 6px 8px;">Nome</th>
                                                    <th style="padding: 6px 8px; width:65px;">QTD</th>
                                                    <th style="padding: 6px 8px; min-width:120px;">Cor</th>
                                                    <th style="padding: 6px 8px; min-width:160px;">Numeração</th>
                                                    <th style="padding: 6px 8px; width:65px;">NI</th>
                                                    <th style="padding: 6px 8px; width:65px;">NF</th>
                                                    <th style="padding: 6px 8px; text-align:center;">Verso</th>
                                                    <th style="padding: 6px 8px;">Status</th>
                                                    <th style="padding: 6px 8px; min-width:200px;">Ações</th>
                                                </tr>`;
    
    html = html.substring(0, trStart) + newTr + html.substring(trEnd);
    console.log('Header updated OK');
} else {
    console.log('Header NOT FOUND (Nº ID not found)');
}

fs.writeFileSync('frontend/producao.html', html, 'utf8');
console.log('Done.');
