import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PedidosIdGen } from '../frontend/idgen-pedidos.mjs';

function ambiente() {
    let salvo = { id: 'pedido-a', revisao: 1, documento: { modelos: [{ id: 'modelo-a', nome: 'A' }], cores: [], formatos: [], numeracoes: [] } };
    const chamadas = [];
    const editor = new PedidosIdGen(async (acao, dados) => {
        chamadas.push({ acao, dados: structuredClone(dados) });
        if (acao === 'abrir') return structuredClone(salvo);
        assert.equal(dados.revisao, salvo.revisao);
        salvo = { ...salvo, revisao: salvo.revisao + 1, documento: structuredClone(dados.documento) };
        return structuredClone(salvo);
    });
    return { editor, chamadas };
}

test('exclusão remove só o modelo e seus vínculos, preservando recursos e outros modelos', async () => {
    const { editor } = ambiente(); await editor.abrir('pedido-a');
    await editor.alterar(d => {
        d.modelos.push({ id: 'modelo-b' }); d.bancos = [{ id: 'banco' }];
        d.cores = [{ id: 'cor' }]; d.anexos = [{ id: 'anexo' }];
        d.vinculos = [{ modelo_id: 'modelo-a', banco_id: 'banco' }, { modelo_id: 'modelo-b', banco_id: 'banco' }];
        d.briefing = { observacoes: { 'modelo-a': 'A', 'modelo-b': 'B' } };
    });
    await editor.excluirModelo('modelo-a');
    const d = editor.pedido.documento;
    assert.deepEqual(d.modelos, [{ id: 'modelo-b' }]);
    assert.deepEqual(d.vinculos, [{ modelo_id: 'modelo-b', banco_id: 'banco' }]);
    assert.deepEqual(d.briefing.observacoes, { 'modelo-b': 'B' });
    assert.deepEqual(d.bancos, [{ id: 'banco' }]); assert.deepEqual(d.cores, [{ id: 'cor' }]);
    assert.deepEqual(d.anexos, [{ id: 'anexo' }]);
});

test('exclusão recusa outro pedido e modelo aprovado; falha conserva modelo confirmado', async () => {
    const { editor, chamadas } = ambiente(); await editor.abrir('pedido-a');
    await assert.rejects(editor.excluirModelo('outro'), /não pertence/);
    assert.equal(chamadas.length, 1);
    await editor.salvarModelo('modelo-a', { amostra_status: 'APROVADA' });
    await assert.rejects(editor.excluirModelo('modelo-a'), /aprovado/);
    await editor.salvarModelo('modelo-a', { amostra_status: 'PENDENTE' });
    const antes = structuredClone(editor.pedido);
    editor.enviar = async () => { throw new Error('Conflito'); };
    await assert.rejects(editor.excluirModelo('modelo-a'), /Conflito/);
    assert.deepEqual(editor.pedido, antes);
});
test('salvamentos simultâneos preservam ambos os campos e incrementam revisão', async () => {
    const { editor, chamadas } = ambiente(); await editor.abrir('pedido-a');
    await Promise.all([editor.salvarModelo('modelo-a', { arte_escala_h: 110 }), editor.salvarModelo('modelo-a', { numeracao_inicio: 100 })]);
    assert.equal(editor.pedido.revisao, 3);
    assert.deepEqual(editor.pedido.documento.modelos[0], { id: 'modelo-a', nome: 'A', arte_escala_h: 110, numeracao_inicio: 100 });
    assert.deepEqual(chamadas.map(c => c.acao), ['abrir', 'salvar', 'salvar']);
});
test('modelo de outro pedido e alteração de identidade são recusados antes de enviar', async () => {
    const { editor, chamadas } = ambiente(); await editor.abrir('pedido-a');
    await assert.rejects(editor.salvarModelo('modelo-b', { nome: 'B' }), /não pertence/);
    assert.throws(() => editor.salvarModelo('modelo-a', { id_int: 123 }), /identidade/);
    assert.equal(chamadas.length, 1);
});
test('formato, cor e numeração são cópias completas com novos IDs', async () => {
    const { editor } = ambiente(); await editor.abrir('pedido-a');
    const originais = { nome: 'Credencial', formato: { id: 'f', width_mm: 54 },
        cor: { id: 'c', name: 'Azul', pdf_base64: 'sintetico' },
        numeracao: { id: 'n', name: 'N', elements: [{ type: 'TEXT', font_size: 12, face: 'back' }], ticket_qtd: 2 } };
    const antes = structuredClone(originais); await editor.adicionarModelo(originais);
    assert.deepEqual(originais, antes);
    const doc = editor.pedido.documento;
    assert.notEqual(doc.numeracoes[0].id, 'n');
    assert.equal(doc.numeracoes[0].formato_id, doc.formatos[0].id);
    assert.deepEqual(doc.numeracoes[0].elements, antes.numeracao.elements);
    assert.equal(doc.modelos[1].amostra_cor_id, doc.cores[0].id);
    assert.equal(doc.numeracoes[0].ticket_qtd, 2);
});
test('falha ou confirmação incompleta não altera o documento confirmado', async () => {
    const { editor } = ambiente(); await editor.abrir('pedido-a');
    const antes = structuredClone(editor.pedido);
    editor.enviar = async () => { throw new Error('Conflito de revisão'); };
    await assert.rejects(editor.salvarModelo('modelo-a', { nome: 'X' }), /Conflito/);
    assert.deepEqual(editor.pedido, antes);
    editor.enviar = async () => ({ ...antes, revisao: 2 });
    await assert.rejects(editor.salvarModelo('modelo-a', { nome: 'X' }), /não confirmou/);
    assert.deepEqual(editor.pedido, antes);
});
