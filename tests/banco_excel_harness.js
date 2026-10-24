const assert = require('node:assert/strict');
const XLSX = require('../frontend/vendor/sheetjs-0.20.3/xlsx.full.min.js');
require('../frontend/banco-excel.js');
const converter = globalThis.BancoExcel.converter;
for (const bookType of ['xlsx', 'xls']) {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Nome', 'Código', 'Data'], ['João', 42, 46000], ['', '', ''], ['Maria', '0007', '22/10/2026']]);
    sheet.B2.z = '00000';
    sheet.C2.z = 'dd/mm/yyyy';
    XLSX.utils.book_append_sheet(wb, sheet, 'Pessoas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Outra'], ['Aba']]), 'Outra aba');
    const read = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType }), { type: 'buffer', cellText: true });
    const result = converter(XLSX, read.Sheets.Pessoas);
    assert.deepEqual(result.headers, ['Nome', 'Código', 'Data']);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0]['Código'], '00042');
    assert.equal(result.rows[1]['Código'], '0007');
    assert.match(result.rows[0].Data, /^\d\d\/\d\d\/\d{4}$/);
    assert.equal(result.rows[0].Nome, 'João');
    assert.deepEqual(converter(XLSX, read.Sheets['Outra aba']).rows, [{ Outra: 'Aba' }]);
}
for (const [rows, error] of [
    [[['Nome', 'Nome'], ['a', 'b']], /repetidos/],
    [[['Nome', ''], ['a', 'b']], /nome de todas/],
    [[['__id'], ['1']], /reservado/],
    [[['__proto__'], ['x']], /reservado/],
    [[['Nome']], /pelo menos/]
]) assert.throws(() => converter(XLSX, XLSX.utils.aoa_to_sheet(rows)), error);
assert.throws(() => converter(XLSX, {}), /vazia/);
assert.throws(() => converter(XLSX, { '!ref': 'A1:A2', '!fullref': 'A1:A60000' }), /50.000/);
console.log('Excel: XLSX, XLS, abas, acentos, zeros, datas, cabeçalhos inválidos e limite OK.');
