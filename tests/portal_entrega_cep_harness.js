const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const endereco = { recebedor: 'Pessoa Teste', cpf_recebedor: '52998224725', cep: '01001000',
    endereco: 'Praça de teste', numero: '10', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' };
function ambiente() {
    const chamadas = [];
    const c = { console, setTimeout, clearTimeout, AbortController,
        document: { getElementById: () => null },
        portalDados: { endereco: null, cliente: null, pedido: { frete_escolhido: 'PAC' } },
        clienteState: { numero: '123', token: 'sintetico', osId: 'vibe_123', pedidoFinalizado: false },
        state: {}, escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
        tipoDaPessoa: () => 'juridica', ehRetirada: pedido => pedido.frete_escolhido === 'RETIRADA',
        entregaExigeRecebedor: () => true, redesenharSecao: () => {}, atualizarPainelDoPedido: () => {},
        abrirSecao: s => chamadas.push('avanco:' + s), SECOES: ['entrega', 'faturamento'],
        fetch: async () => ({ ok: true, json: async () => ({ cep: '01001-000', logradouro: 'Praça de teste', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' }) }),
        gravarCorrecaoDoCliente: async () => { chamadas.push('confirmacao'); return { ok: true }; },
        supabaseClient: { rpc: async (nome, args) => { chamadas.push(nome); return { data: { ok: true, numero: '123', endereco: { ...args.p_endereco, do_cadastro: false } } }; } }
    };
    c.window = c;
    vm.createContext(c);
    for (const arquivo of ['cliente-confirmacoes.js', 'cliente-entrega-form.js'])
        vm.runInContext(fs.readFileSync(path.join(raiz, 'frontend', arquivo), 'utf8'), c);
    return { c, chamadas };
}
async function preencher(c) {
    c.portalConfirmacoes.entrega = false;
    c.editarCampoEntrega('cep', '01001-000');
    await c.buscarCepEntrega();
    for (const campo of ['recebedor', 'cpf_recebedor', 'numero']) c.editarCampoEntrega(campo, endereco[campo]);
}
async function main() {
    let { c, chamadas } = ambiente();
    assert.ok(c.formularioEnderecoEntrega().includes('id="entrega-recebedor"'));
    assert.equal(c.cpfDaEntregaValido('11111111111'), false);
    assert.equal(c.cpfDaEntregaValido('529.982.247-25'), true);
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.deepEqual(chamadas, []);
    assert.equal(c.portalGravandoConfirmacao, false);
    await preencher(c);
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, ['link_cliente_salvar_entrega', 'confirmacao', 'avanco:faturamento']);
    assert.equal(c.portalConfirmacoes.entrega, true);
    assert.equal(c.portalDados.endereco.recebedor, endereco.recebedor);
    c.editarCampoEntrega('numero', '999');
    assert.equal(c.dadosDoFormularioEntrega().valores.numero, '10', 'confirmado não é editável');

    ({ c, chamadas } = ambiente());
    await preencher(c);
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, false, 'salvar endereço não antecipa confirmação');
    assert.ok(c.portalDados.endereco);
    assert.ok(!chamadas.some(x => x.startsWith('avanco')));
    c.gravarCorrecaoDoCliente = async () => ({ ok: true });
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, true, 'falha parcial permite repetir');

    for (const recibo of [null, [], { ok: true, numero: '456', endereco },
        { ok: true, numero: '123', endereco: { ...endereco, numero: '999' } }]) {
        ({ c, chamadas } = ambiente());
        await preencher(c);
        c.supabaseClient.rpc = async () => ({ data: recibo });
        await c.decidirDados('entrega', true);
        assert.equal(c.portalConfirmacoes.entrega, false);
        assert.equal(c.portalDados.endereco, null);
        assert.deepEqual(chamadas, []);
    }
    ({ c, chamadas } = ambiente());
    await preencher(c);
    c.editarCampoEntrega('cep', '123');
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, [], 'alterar CEP invalida a busca anterior');
    c.editarCampoEntrega('cep', '99999999');
    c.fetch = async () => ({ ok: true, json: async () => ({ erro: true }) });
    await c.buscarCepEntrega();
    assert.equal(c.dadosDoFormularioEntrega().consultado, '');
    assert.ok(c.dadosDoFormularioEntrega().erro);
    c.fetch = async () => { throw new Error('offline'); };
    await c.buscarCepEntrega();
    assert.equal(c.dadosDoFormularioEntrega().buscando, false);

    ({ c, chamadas } = ambiente());
    let responder;
    c.portalConfirmacoes.entrega = false;
    c.fetch = () => new Promise(resolve => { responder = resolve; });
    c.editarCampoEntrega('cep', '01001000');
    const busca = c.buscarCepEntrega();
    c.editarCampoEntrega('cep', '22222222');
    responder({ ok: true, json: async () => ({ cep: '01001-000', logradouro: 'ANTIGA', localidade: 'Cidade', uf: 'SP' }) });
    await busca;
    assert.equal(c.dadosDoFormularioEntrega().valores.cep, '22222222');
    assert.equal(c.dadosDoFormularioEntrega().consultado, '', 'resposta atrasada não valida outro CEP');

    ({ c, chamadas } = ambiente());
    await preencher(c);
    let concluir;
    c.supabaseClient.rpc = (nome, args) => { chamadas.push(nome); return new Promise(resolve => {
        concluir = () => resolve({ data: { ok: true, numero: '123', endereco: args.p_endereco } });
    }); };
    const salvando = c.decidirDados('entrega', true);
    await c.decidirDados('entrega', true);
    assert.equal(chamadas.length, 1);
    assert.equal(c.portalConfirmacoes.entrega, false);
    concluir(); await salvando;
    assert.equal(c.portalConfirmacoes.entrega, true);
    ({ c, chamadas } = ambiente());
    c.portalDados.endereco = { ...endereco };
    let consultas = 0;
    c.fetch = async () => { consultas++; throw new Error('consulta indevida'); };
    assert.equal(c.dadosDoFormularioEntrega().valores.cep, endereco.cep);
    c.editarCampoEntrega('cep', '22222222');
    await c.buscarCepEntrega();
    assert.equal(c.dadosDoFormularioEntrega().valores.cep, endereco.cep);
    assert.equal(consultas, 0, 'CEP bloqueado não consulta API');
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, true, 'endereço cadastrado confirma sem redigitar CEP');
    assert.equal(consultas, 0);

    ({ c, chamadas } = ambiente());
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.decidirDados('entrega', false);
    c.editarCampoEntrega('cep', '01001000');
    assert.equal(c.dadosDoFormularioEntrega().valores.cep, '', 'falha ao solicitar alteração mantém CEP bloqueado');
    c.gravarCorrecaoDoCliente = async () => ({ ok: true });
    await c.decidirDados('entrega', false);
    c.editarCampoEntrega('cep', '01001000');
    assert.equal(c.dadosDoFormularioEntrega().valores.cep, '01001000', 'Alterar habilita CEP');
    console.log('OK: formulário, CEP, CPF, concorrência, falhas de recibo e avanço após as duas gravações.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
