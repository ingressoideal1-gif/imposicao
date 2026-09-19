const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const codigo = fs.readFileSync('frontend/cliente-faturamento-form.js', 'utf8');
const chamadas = [];
const contexto = {
    console, setTimeout: fn => fn(), clearTimeout() {},
    window: {
        portalDados: {
            pedido: { id_cliente: 20 },
            cliente: { nome: 'Maria', documento: '52998224725', email: 'maria@example.com' },
            endereco_faturamento: { cep: '01001000', endereco: 'Praça da Sé', numero: 'S/N', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
            cadastros_faturamento: [
                { id_cliente: 20, nome: 'Maria', documento: '52998224725', endereco: { cep: '01001000', endereco: 'Praça da Sé', numero: 'S/N', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' } },
                { id_cliente: 21, nome: 'Empresa Exemplo', documento: '11222333000181', tipo_relacao: 'Vínculo comercial', endereco: { cep: '01310100', endereco: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' } }
            ]
        },
        portalConfirmacoes: { faturamento: null }, portalErroConfirmacao: { faturamento: false },
        portalGravandoConfirmacao: false
    },
    clienteState: { numero: 123, token: 'token', pedidoFinalizado: false },
    supabaseClient: {
        rpc: async (nome, args) => { chamadas.push([nome, args]); return { data: { ok: true, id_cliente: 21,
            cliente: { nome: 'Empresa Exemplo', documento: '11222333000181' }, endereco_faturamento: { cep: '01310100' }, cadastros_faturamento: [] }, error: null }; },
        functions: { invoke: async (nome, opcoes) => ({ data: {
            ok: true, tipo: 'cpf', cpf: opcoes.body.documento, nome: 'Nome Consultado pela API'
        }, error: null }) }
    },
    escapeHtml: x => String(x == null ? '' : x), documentoEmMascara: x => String(x || ''), cepEmMascara: x => String(x || ''),
    tipoDaPessoa: d => String(d || '').replace(/\D/g, '').length === 11 ? 'fisica' : 'juridica',
    tipoDoDocumentoEntrega: d => [11, 14].includes(String(d || '').replace(/\D/g, '').length)
        ? (String(d || '').replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj') : '',
    consultarDocumentoNoPortal: async documento => ({
        ok: true, tipo: 'cpf', cpf: documento, nome: 'Nome Consultado pela API'
    }),
    redesenharSecao() {}, decidirDados: async () => {}, iconeCliente: () => '',
    document: { getElementById: () => null }
};
contexto.window.window = contexto.window;
vm.createContext(contexto);
vm.runInContext(codigo, contexto);

const cartao = contexto.window.cartaoDeDecisaoFaturamento();
assert.ok(cartao.includes('Confirmar'));
assert.ok(cartao.includes('Meus Dados'));
assert.ok(!cartao.includes('>Alterar<'));
assert.ok(cartao.includes('selecionarCadastroFaturamento(0)'));
assert.ok(cartao.includes('editarCadastroFaturamento(0)'));
assert.ok(!cartao.includes('editarCadastroFaturamento(1)'), 'CNPJ nao oferece edicao');
assert.ok(cartao.includes('Vínculo comercial'), 'mostra o tipo de vínculo fiscal vindo do ERP');

(async () => {
    await contexto.window.novoCadastroFaturamento();
    contexto.window.editarCampoFaturamento('documento', '52998224725');
    await contexto.window.continuarDocumentoFaturamento();
    assert.equal(contexto.window.dadosDoFormularioFaturamento().valores.nome, 'Nome Consultado pela API');
    assert.equal(contexto.window.dadosDoFormularioFaturamento().documentoLiberado, true);
    assert.match(contexto.window.cartaoDeDecisaoFaturamento(), /Nome completo<\/span><input[^>]*readonly/);
    await contexto.window.selecionarCadastroFaturamento(1);
    await contexto.window.persistirFaturamento();
    assert.equal(chamadas[0][0], 'link_cliente_salvar_faturamento');
    assert.equal(chamadas[0][1].p_id_cliente, 21);
    assert.equal(chamadas[0][1].p_novo, false);
    assert.equal(contexto.window.portalDados.pedido.id_cliente, 21);

    const r = contexto.window.dadosDoFormularioFaturamento();
    Object.assign(r, { alterando: true, novo: false, origemCnpj: true, idCliente: 21, anteriorId: 21 });
    const antes = chamadas.length;
    await contexto.window.persistirFaturamento();
    assert.equal(chamadas.length, antes, 'mesmo CNPJ somente leitura não gera atualização redundante');
    assert.equal(r.alterando, false);
    console.log('OK: Nota com Confirmar, Meus Dados, CPF editavel, CNPJ leitura e RPC confirmada.');
})().catch(e => { console.error(e); process.exit(1); });
