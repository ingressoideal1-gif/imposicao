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
        portalDados: { endereco: null, cliente: { nome: endereco.recebedor, documento: endereco.cpf_recebedor },
            pedido: { frete_escolhido: 'PAC' } },
        clienteState: { numero: '123', token: 'sintetico', osId: 'vibe_123', pedidoFinalizado: false },
        state: {}, escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
        documentoEmMascara: documento => {
            const d = String(documento || '').replace(/\D/g, '');
            if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
            if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
            return String(documento || '').trim();
        },
        cepEmMascara: cep => String(cep || '').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2'),
        tipoDaPessoa: () => 'juridica', ehRetirada: pedido => pedido.frete_escolhido === 'RETIRADA',
        entregaExigeRecebedor: () => true, redesenharSecao: () => {}, atualizarPainelDoPedido: () => {},
        abrirSecao: s => chamadas.push('avanco:' + s), SECOES: ['entrega', 'faturamento'],
        fetch: async url => ({ ok: true, json: async () => String(url).includes('/cnpj/')
            ? { cnpj: '11222333000181', razao_social: 'Empresa Recebedora', cep: '01001000',
                logradouro: 'Avenida Oficial', numero: '55', complemento: 'Sala 2', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP' }
            : { cep: '01001-000', logradouro: 'Praça de teste', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' } }),
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
    await c.informarOutroEnderecoEntrega();
    c.editarCampoEntrega('cpf_recebedor', endereco.cpf_recebedor);
    await c.continuarDocumentoEntrega();
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, endereco.recebedor);
    c.editarCampoEntrega('cep', '01001-000');
    await c.buscarCepEntrega();
    c.editarCampoEntrega('numero', endereco.numero);
    c.usarNovoEnderecoEntrega();
}
async function main() {
    let { c, chamadas } = ambiente();
    assert.ok(!c.formularioEnderecoEntrega().includes('<input'), 'endereço principal é somente leitura');
    assert.equal(c.cpfDaEntregaValido('11111111111'), false);
    assert.equal(c.cpfDaEntregaValido('529.982.247-25'), true);
    assert.equal(c.documentoDoRecebedorValido('11.222.333/0001-81'), true);
    assert.equal(c.documentoDoRecebedorValido('11.222.333/0001-82'), false);
    assert.equal(c.documentoDoRecebedorValido('11.111.111/1111-11'), false);
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('portal-correcao-entrega'));
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('Desfazer'));
    assert.ok(c.cartaoDeDecisaoEntrega().includes('Meus Endereços'));
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('>Alterar<'));
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.deepEqual(chamadas, []);
    assert.equal(c.portalGravandoConfirmacao, false);
    await preencher(c);
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, ['link_cliente_salvar_entrega', 'confirmacao', 'avanco:faturamento']);
    assert.equal(c.portalConfirmacoes.entrega, true);
    assert.equal(c.portalDados.endereco.recebedor, endereco.recebedor);
    assert.equal(c.portalDados.enderecos_entrega[0].recebedor, endereco.recebedor, 'novo endereço entra em Meus Endereços');
    c.editarCampoEntrega('numero', '999');
    assert.equal(c.dadosDoFormularioEntrega().valores.numero, '10', 'confirmado não é editável');

    ({ c, chamadas } = ambiente());
    await c.informarOutroEnderecoEntrega();
    let formulario = c.cartaoDeDecisaoEntrega();
    assert.ok(formulario.includes('1. CPF ou CNPJ'));
    assert.ok(!formulario.includes('Nome do recebedor'), 'nome so aparece depois da consulta do documento');
    c.editarCampoEntrega('cpf_recebedor', endereco.cpf_recebedor);
    await c.continuarDocumentoEntrega();
    formulario = c.cartaoDeDecisaoEntrega();
    assert.match(formulario, /id="entrega-recebedor"[^>]*readonly/);
    assert.match(formulario, /id="entrega-endereco"[^>]*readonly/);
    const nomeConsultado = c.dadosDoFormularioEntrega().valores.recebedor;
    const ruaConsultada = c.dadosDoFormularioEntrega().valores.endereco;
    c.editarCampoEntrega('recebedor', 'Nome adulterado');
    c.editarCampoEntrega('endereco', 'Rua adulterada');
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, nomeConsultado);
    assert.equal(c.dadosDoFormularioEntrega().valores.endereco, ruaConsultada);

    ({ c, chamadas } = ambiente());
    await c.informarOutroEnderecoEntrega();
    c.editarCampoEntrega('cpf_recebedor', '11144477735');
    await c.continuarDocumentoEntrega();
    assert.equal(c.dadosDoFormularioEntrega().documentoLiberado, false);
    assert.match(c.dadosDoFormularioEntrega().erro, /não localizado/);

    ({ c, chamadas } = ambiente());
    await preencher(c);
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, null, 'salvar endereço não antecipa confirmação');
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
        assert.equal(c.portalConfirmacoes.entrega, null);
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
    c.portalDados.enderecos_entrega = [
        { ...endereco, endereco: 'Rua Cadastrada', numero: '44', tipo_endereco: 'PRINCIPAL' },
        { ...endereco, recebedor: 'Empresa Recebedora', cpf_recebedor: '11222333000181',
            endereco: 'Avenida Cadastrada', numero: '55', tipo_endereco: 'ENTREGA' }
    ];
    const modal = c.cartaoDeDecisaoEntrega();
    assert.ok(modal.includes('<strong>Pessoa Teste</strong>'));
    assert.ok(modal.includes('529.982.247-25'));
    assert.ok(modal.includes('<strong>Empresa Recebedora</strong>'));
    assert.ok(modal.includes('11.222.333/0001-81'));
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().valores.endereco, 'Rua Cadastrada');
    assert.equal(c.dadosDoFormularioEntrega().valores.numero, '44');
    assert.equal(c.dadosDoFormularioEntrega().consultado, endereco.cep);
    assert.deepEqual(chamadas, [], 'selecionar apenas carrega; ainda não grava');
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, ['link_cliente_salvar_entrega', 'confirmacao', 'avanco:faturamento']);

    ({ c, chamadas } = ambiente());
    let responder;
    await c.informarOutroEnderecoEntrega();
    c.editarCampoEntrega('cpf_recebedor', '52998224725');
    await c.continuarDocumentoEntrega();
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
    assert.equal(c.portalConfirmacoes.entrega, null);
    concluir(); await salvando;
    assert.equal(c.portalConfirmacoes.entrega, true);

    ({ c, chamadas } = ambiente());
    await c.informarOutroEnderecoEntrega();
    c.editarCampoEntrega('cpf_recebedor', '11222333000181');
    await c.continuarDocumentoEntrega();
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, 'Empresa Recebedora');
    assert.equal(c.dadosDoFormularioEntrega().valores.endereco, 'Avenida Oficial');
    assert.equal(c.dadosDoFormularioEntrega().valores.numero, '55');
    assert.equal(c.dadosDoFormularioEntrega().origemCnpj, true);
    c.editarCampoEntrega('endereco', 'Endereço adulterado');
    assert.equal(c.dadosDoFormularioEntrega().valores.endereco, 'Avenida Oficial', 'endereço do CNPJ não é editável');
    assert.ok(c.cartaoDeDecisaoEntrega().includes('Este endereço veio do cadastro do CNPJ'));
    c.usarNovoEnderecoEntrega();
    assert.ok(c.formularioEnderecoEntrega().includes('Avenida Oficial, 55'));

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
    c.portalConfirmacoes.entrega = true;
    c.portalDados.enderecos_entrega = [{ ...endereco }];
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().alterando, false, 'falha ao desfazer mantém seleção bloqueada');
    c.gravarCorrecaoDoCliente = async () => ({ ok: true });
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().alterando, true, 'selecionar outro endereço desfaz a confirmação anterior');
    console.log('OK: endereço somente leitura, Meus Endereços, CPF/CEP, CNPJ bloqueado e gravação confirmada.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
