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
  p + '            <th style="padding:4px 6px; width:32px; text-align:center;">M</th>',
  p + '            <th style="padding:4px 6px; width:80px;">Modelo</th>',
  p + '            <th style="padding:4px 6px;">Nome</th>',
  p + '            <th style="padding:4px 6px; width:60px;">QTD</th>',
  p + '            <th style="padding:4px 6px; min-width:110px;">COR</th>',
  p + '            <th style="padding:4px 6px; min-width:140px;">Numera\u00e7\u00e3o</th>',
  p + '            <th style="padding:4px 6px; width:60px;">NI</th>',
  p + '            <th style="padding:4px 6px; width:60px;">NF</th>',
  p + '            <th style="padding:4px 6px; width:44px; text-align:center;">Verso</th>',
  p + '            <th style="padding:4px 6px;">Status</th>',
  p + '        </tr>',
  p + '    </thead>',
  p + '    <tbody id="tbody-imp-os-queue">',
  p + '    </tbody>',
  p + '</table>'
].join('\r\n');

html = html.substring(0, tableStart) + newTable + html.substring(tableEnd);
fs.writeFileSync('frontend/producao.html', html, 'utf8');

// Verify
const h2 = fs.readFileSync('frontend/producao.html', 'utf8');
const ti = h2.indexOf('tbody-imp-os-queue');
const ts = h2.lastIndexOf('<table', ti);
const te = h2.indexOf('</table>', ti) + 8;
const seg = h2.substring(ts, te);
const ths = seg.match(/<th[^>]*>([^<]*)<\/th>/g) || [];
console.log('TH labels:', ths.map(t => t.replace(/<[^>]+>/g,'')).join(' | '));
console.log('Total TH:', ths.length);
