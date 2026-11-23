const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
require('../frontend/csv-editor.js');
const script = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
const nomes = ['agruparBancoPorViaDeTicket', 'subirBancoPeloBox', 'subirBancoDoPedido'];
const funcoes = nomes.map(nome => {
    const assinatura = (nome === 'subirBancoDoPedido' ? 'async ' : '') + 'function ' + nome + '(';
    const inicio = script.indexOf(assinatura);
    assert(inicio >= 0, nome);
    return script.slice(inicio, script.indexOf('\n}', inicio) + 2);
});

async function verificarImportacao() {
    const num = { tipo: 'TICKET', id: 'gabarito-sintetico', ticket_qtd: 5 };
    const modelo = { id: 101, quantidade: 2 };
    const state = { osItens: { pedido: [modelo] } };
    const arquivo = { name: 'vias.csv', texto: '' };
    const input = { files: [arquivo], click() {} };
    const chamadas = [];
    const documento = { getElementById: () => input };
    class FileReader {
        readAsText(file) { this.onload({ target: { result: file.texto } }); }
    }
    const criar = async (idInt, nome, headers, rows, filename) => {
        chamadas.push({ idInt, nome, headers, rows, filename });
        return { nome };
    };
    const teste = new Function('window', 'state', 'document', 'FileReader', 'pecaDoModelo',
        'quantidadeContratada', 'criarBancoDoPedido', 'idIntDoPedido', '_inputDoBancoDoPedido',
        'toast', 'renderAmostrasOSItens',
        `let _bancoPedidoPendente; ${funcoes.join('\n')} return { ${nomes.join(', ')} };`)(
        window, state, documento, FileReader, item => item ? num : null,
        item => item?.quantidade || 0, criar, () => 321, () => input, () => {}, () => {});
    const importar = (texto, modeloId = '101') => {
        arquivo.texto = texto;
        teste.subirBancoPeloBox('pedido', modeloId);
        return teste.subirBancoDoPedido();
    };
    const linhas = Array.from({ length: 10 }, (_, i) => `QR-${i + 1};00${i + 1}`);
    const csv = registros => ['QR;Texto', ...registros].join('\n') + '\n';
    await assert.rejects(importar(csv(linhas.slice(0, -1))), /exige 10 linhas.*tem 9/);
    await assert.rejects(importar(csv([...linhas, 'QR-11;0011'])), /exige 10 linhas.*tem 11/);
    await assert.rejects(importar(csv([...linhas.slice(0, 2), '', ...linhas.slice(3)])), /linha de dados 3 .*vazia/);
    assert.equal(chamadas.length, 0);

    teste.subirBancoPeloBox('pedido', '101');
    modelo.quantidade = 3;
    await assert.rejects(teste.subirBancoDoPedido(), /quantidade ou a numeração.*mudou/);
    modelo.quantidade = 2;
    await importar(csv(linhas));
    assert.equal(chamadas.length, 1);
    const [banco] = chamadas;
    assert.equal(banco.idInt, 321);
    assert.equal(banco.rows.length, 2);
    assert.equal(banco.headers.length, 10);
    assert.equal(banco.rows[0]['Ticket 1 · Texto'], '001');
    assert.equal(banco.rows[0]['Ticket 5 · QR'], 'QR-5');
    assert.equal(banco.rows[1]['Ticket 1 · QR'], 'QR-6');
    assert.equal(banco.rows[1]['Ticket 5 · QR'], 'QR-10');

    arquivo.texto = csv(['QR-1;001', '', 'QR-2;002']);
    teste.subirBancoPeloBox('pedido');
    await teste.subirBancoDoPedido();
    assert.deepEqual(chamadas[1].headers, ['QR', 'Texto']);
    assert.equal(chamadas[1].rows.length, 2);

    for (const [celulas, vias] of [[1000, 7], [8000, 5]]) {
        const total = celulas * vias;
        const agrupado = teste.agruparBancoPorViaDeTicket({
            headers: ['QR'],
            rows: Array.from({ length: total }, (_, i) => ({ QR: String(i + 1) }))
        }, celulas, vias);
        assert.equal(agrupado.rows.length, celulas);
        assert.equal(agrupado.rows.at(-1)[`Ticket ${vias} · QR`], String(total));
    }
    process.stdout.write(JSON.stringify(banco));
}

verificarImportacao().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
