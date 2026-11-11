'use strict';
const assert = require('node:assert/strict');
const { reconciliarCorNumDoModelo: resolver } = require('../frontend/cor-numeracao-do-modelo.js');
const nums = [
    { id: 'frente', name: 'Cartão Só Frente', print_mode: 'front' },
    { id: 'verso', name: 'Cartão Frente e Verso', print_mode: 'duplex' },
];
for (const [id, antigo, categoria] of [
    ['verso', 'frente', 'FRENTE E VERSO'], ['frente', 'verso', 'SÓ FRENTE'],
]) {
    const linha = { amostra_num_id: id, gabarito_operacional: nums.find(n => n.id === antigo).name,
        verso_tipo: categoria };
    const original = structuredClone(linha);
    assert.equal(resolver(linha, [], nums).numId, id, 'reabrir preserva a escolha compatível');
    assert.equal(resolver({ ...linha, amostra_num_id: null }, [], nums).numId, null,
        'não vincula automaticamente gabarito incompatível');
    assert.deepEqual(linha, original);
    assert.equal(resolver({ ...linha, amostra_num_id: antigo,
        gabarito_operacional: nums.find(n => n.id === id).name }, [], nums).numId, id,
        'gabarito compatível ainda corrige vínculo antigo');
}
assert.equal(resolver({ amostra_num_id: 'ausente', gabarito_operacional: nums[0].name,
    verso_tipo: 'SÓ FRENTE' }, [], nums).numId, 'ausente', 'catálogo parcial preserva vínculo');
console.log('OK: reabertura preserva frente/verso e não muda dados comerciais');
