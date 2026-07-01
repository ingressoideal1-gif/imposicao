const fs = require('fs');
let html = fs.readFileSync('frontend/producao.html', 'utf8');

const tbodyIdx = html.indexOf('tbody-imp-os-queue');
const tableStart = html.lastIndexOf('<table', tbodyIdx);
const tableEnd = html.indexOf('</table>', tbodyIdx) + '</table>'.length;

const p = '                                        ';
const newTable = [
  p + '<table class="data-table" style="font-size:0.78rem; margin:0; width:100%;">',
  p + '    <thead>',
  p + '        <tr>',
  p + '            <th style="padding:6px 8px; text-align:center; width:40px;">Modelo</th>',
  p + '            <th style="padding:6px 8px; width:70px;">N\u00ba ID</th>',
  p + '            <th style="padding:6px 8px;">Nome</th>',
  p + '            <th style="padding:6px 8px; width:65px;">QTD</th>',
  p + '            <th style="padding:6px 8px; min-width:120px;">Cor</th>',
  p + '            <th style="padding:6px 8px; min-width:150px;">Numera\u00e7\u00e3o</th>',
  p + '            <th style="padding:6px 8px; width:65px;">NI</th>',
  p + '            <th style="padding:6px 8px; width:65px;">NF</th>',
  p + '            <th style="padding:6px 8px; text-align:center; width:50px;">Verso</th>',
  p + '            <th style="padding:6px 8px;">Status</th>',
  p + '            <th style="padding:6px 8px; min-width:190px;">A\u00e7\u00f5es</th>',
  p + '        </tr>',
  p + '    </thead>',
  p + '    <tbody id="tbody-imp-os-queue">',
  p + '    </tbody>',
  p + '</table>'
].join('\r\n');

html = html.substring(0, tableStart) + newTable + html.substring(tableEnd);
fs.writeFileSync('frontend/producao.html', html, 'utf8');

// Verify
const newHtml = fs.readFileSync('frontend/producao.html', 'utf8');
const ni = newHtml.indexOf('tbody-imp-os-queue');
const ns = newHtml.lastIndexOf('<table', ni);
const ne = newHtml.indexOf('</table>', ni) + 8;
const nt = newHtml.substring(ns, ne);
console.log('TH count:', (nt.match(/<th/g)||[]).length, '(esperado: 11)');
console.log('TR count in thead:', (nt.match(/<tr/g)||[]).length, '(esperado: 1)');
console.log('Done!');
