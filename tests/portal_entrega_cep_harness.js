const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
const RPC_ENTREGA = 'link_cliente_definir_endereco_entrega';
const idAtual = '00000000-0000-0000-0000-000000000001';
const idSelecionado = '00000000-0000-0000-0000-000000000002';
const idCriado = '00000000-0000-0000-0000-000000000003';
const endereco = { recebedor: 'Pessoa Teste', cpf_recebedor: '52998224725', cep: '01001000',
    endereco: 'Praça de teste', numero: '10', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' };
function reciboEndereco(args, cadastrados = []) {
    const id = args.p_endereco_id || idCriado;
    const opcoes = cadastrados.some(e => e.id === id) ? cadastrados : [{ id, ...args.p_endereco }, ...cadastrados];
    return { ok: true, numero: '123', endereco: { ...args.p_endereco, do_cadastro: false },
        endereco_id: id, enderecos_entrega: opcoes };
}
function ambiente() {
    const chamadas = [];
    const requisicoes = [];
    const c = { console, setTimeout, clearTimeout, AbortController, confirm: () => true,
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
        supabaseClient: {
            rpc: async (nome, args) => {
                chamadas.push(nome);
                requisicoes.push(JSON.parse(JSON.stringify(args)));
                return { data: reciboEndereco(args, c.portalDados.enderecos_entrega) };
            },
            functions: { invoke: async (nome, opcoes) => {
                const d = opcoes.body.documento;
                if (d.length === 11) return { data: { ok: true, tipo: 'cpf', cpf: d, nome: 'Pessoa Teste' }, error: null };
                return { data: { ok: true, tipo: 'cnpj', cnpj: d, nome: 'Empresa Recebedora', cep: '01001000',
                    endereco: 'Avenida Oficial', numero: '55', complemento: 'Sala 2', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' }, error: null };
            } }
        }
    };
    c.window = c;
    vm.createContext(c);
    for (const arquivo of ['cliente-confirmacoes.js', 'cliente-entrega-form.js'])
        vm.runInContext(fs.readFileSync(path.join(raiz, 'frontend', arquivo), 'utf8'), c);
    return { c, chamadas, requisicoes };
}
async function preencher(c, usar = false) {
    await c.informarOutroEnderecoEntrega();
    c.editarCampoEntrega('cpf_recebedor', endereco.cpf_recebedor);
    await c.continuarDocumentoEntrega();
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, endereco.recebedor);
    c.editarCampoEntrega('cep', '01001-000');
    await c.buscarCepEntrega();
    c.editarCampoEntrega('numero', endereco.numero);
    if (usar) await c.usarNovoEnderecoEntrega();
}
async function main() {
    let { c, chamadas, requisicoes } = ambiente();
    assert.ok(!c.formularioEnderecoEntrega().includes('<input'), 'endereço principal é somente leitura');
    assert.equal(c.cpfDaEntregaValido('11111111111'), false);
    assert.equal(c.cpfDaEntregaValido('529.982.247-25'), true);
    assert.equal(c.documentoDoRecebedorValido('11.222.333/0001-81'), true);
    assert.equal(c.documentoDoRecebedorValido('11.222.333/0001-82'), false);
    assert.equal(c.documentoDoRecebedorValido('11.111.111/1111-11'), false);
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('portal-correcao-entrega'));
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('Desfazer'));
    assert.ok(c.cartaoDeDecisaoEntrega().includes('Alterar Endereço'));
    assert.ok(!c.cartaoDeDecisaoEntrega().includes('>Alterar<'));
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.deepEqual(chamadas, []);
    assert.equal(c.portalGravandoConfirmacao, false);
    await preencher(c);
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, [], 'só Usar este endereço solicita criação');
    await c.usarNovoEnderecoEntrega();
    assert.deepEqual(chamadas, [RPC_ENTREGA, 'confirmacao', 'avanco:faturamento']);
    assert.deepEqual(requisicoes[0], { p_numero: '123', p_token: 'sintetico', p_acao: 'criar',
        p_endereco_id: null, p_endereco: endereco, p_anterior: null });
    assert.equal(c.portalConfirmacoes.entrega, true);
    assert.equal(c.portalDados.endereco.recebedor, endereco.recebedor);
    assert.equal(c.portalDados.enderecos_entrega[0].recebedor, endereco.recebedor, 'novo endereço entra em Alterar Endereço');
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
    assert.match(formulario, /id="entrega-numero"[^>]*required[^>]*aria-required="true"/,
        'número ou S/N é obrigatório');
    await c.usarNovoEnderecoEntrega();
    assert.match(c.dadosDoFormularioEntrega().erro, /dados obrigatórios/,
        'não permite usar endereço sem número ou S/N');
    const nomeConsultado = c.dadosDoFormularioEntrega().valores.recebedor;
    const ruaConsultada = c.dadosDoFormularioEntrega().valores.endereco;
    c.editarCampoEntrega('recebedor', 'Nome adulterado');
    c.editarCampoEntrega('endereco', 'Rua adulterada');
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, nomeConsultado);
    assert.equal(c.dadosDoFormularioEntrega().valores.endereco, ruaConsultada);

    ({ c, chamadas } = ambiente());
    await c.informarOutroEnderecoEntrega();
    c.supabaseClient.functions.invoke = async () => ({ data: null, error: { message: 'não encontrado' } });
    c.editarCampoEntrega('cpf_recebedor', '11144477735');
    await c.continuarDocumentoEntrega();
    assert.equal(c.dadosDoFormularioEntrega().documentoLiberado, false);
    assert.match(c.dadosDoFormularioEntrega().erro, /consultar o nome/);

    ({ c, chamadas, requisicoes } = ambiente());
    await preencher(c);
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.usarNovoEnderecoEntrega();
    assert.equal(c.portalConfirmacoes.entrega, null, 'salvar endereço não antecipa confirmação');
    assert.ok(c.portalDados.endereco);
    assert.ok(!chamadas.some(x => x.startsWith('avanco')));
    c.gravarCorrecaoDoCliente = async () => ({ ok: true });
    await c.decidirDados('entrega', true);
    assert.equal(c.portalConfirmacoes.entrega, true, 'falha parcial permite repetir');
    assert.deepEqual(requisicoes.map(r => [r.p_acao, r.p_endereco_id]), [['criar', null], ['confirmar', idCriado]]);
    assert.deepEqual(requisicoes[1].p_anterior, { ...endereco, do_cadastro: false });

    for (const recibo of [null, [], { ...reciboEndereco({ p_endereco: endereco }), numero: '456' },
        { ...reciboEndereco({ p_endereco: endereco }), endereco: { ...endereco, numero: '999' } },
        { ...reciboEndereco({ p_endereco: endereco }), enderecos_entrega: null }]) {
        ({ c, chamadas } = ambiente());
        await preencher(c);
        c.supabaseClient.rpc = async () => ({ data: recibo });
        await c.usarNovoEnderecoEntrega();
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

    ({ c, chamadas, requisicoes } = ambiente());
    c.portalDados.endereco_entrega_id = idAtual;
    c.portalDados.endereco = { ...endereco, do_cadastro: true };
    const outroRecebedor = { ...endereco, recebedor: 'Empresa Recebedora', cpf_recebedor: '11.222.333/0001-81',
        cep: '01001-000', complemento: null };
    c.portalDados.enderecos_entrega = [
        { id: idAtual, ...endereco, tipo_endereco: 'PRINCIPAL' },
        { id: idSelecionado, ...outroRecebedor, tipo_endereco: 'ENTREGA' }
    ];
    const modal = c.cartaoDeDecisaoEntrega();
    assert.ok(modal.includes('<strong>Pessoa Teste</strong>'));
    assert.ok(modal.includes('529.982.247-25'));
    assert.ok(modal.includes('<strong>Empresa Recebedora</strong>'));
    assert.ok(modal.includes('11.222.333/0001-81'));
    await c.selecionarEnderecoEntrega(1);
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, outroRecebedor.recebedor);
    assert.equal(c.dadosDoFormularioEntrega().valores.cpf_recebedor, outroRecebedor.cpf_recebedor);
    assert.equal(c.dadosDoFormularioEntrega().consultado, endereco.cep);
    assert.equal(c.portalConfirmacoes.entrega, true, 'selecionar confirma automaticamente');
    assert.deepEqual(chamadas, [RPC_ENTREGA, 'confirmacao', 'avanco:faturamento']);
    assert.deepEqual(requisicoes[0], { p_numero: '123', p_token: 'sintetico', p_acao: 'selecionar',
        p_endereco_id: idSelecionado, p_endereco: outroRecebedor, p_anterior: { ...endereco, do_cadastro: true } });
    assert.equal(c.portalDados.endereco_entrega_id, idSelecionado);
    assert.equal(c.portalDados.enderecos_entrega.length, 2);
    assert.equal(c.dadosDoFormularioEntrega().anterior.complemento, null);

    ({ c, chamadas } = ambiente());
    c.portalDados.endereco_entrega_id = idAtual;
    c.portalDados.endereco = { ...endereco, do_cadastro: false };
    c.portalDados.enderecos_entrega = [{ ...endereco }];
    await c.selecionarEnderecoEntrega(0);
    assert.deepEqual(chamadas, [], 'opção sem ID não herda o ID atual, mesmo com os mesmos dados');
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.match(c.cartaoDeDecisaoEntrega(), /Reabra o link/);

    ({ c, chamadas } = ambiente());
    c.portalDados.endereco_entrega_id = idAtual;
    c.portalDados.endereco = { ...endereco, do_cadastro: false };
    const enderecoAnterior = { ...endereco, id: idAtual };
    const enderecoNovo = { ...outroRecebedor, id: idSelecionado };
    c.portalDados.enderecos_entrega = [enderecoAnterior, enderecoNovo];
    c.supabaseClient.rpc = async (nome, args) => ({ data: reciboEndereco(args, [enderecoNovo]) });
    await c.selecionarEnderecoEntrega(1);
    assert.deepEqual(c.portalDados.enderecos_entrega, [enderecoNovo], 'a lista do recibo remove opções que deixaram de ser elegíveis');

    for (const falha of [
        { error: { message: 'o endereço mudou; reabra o link antes de salvar' } },
        { error: { message: 'endereço indisponível para este pedido' } },
        { data: { ...reciboEndereco({ p_endereco: outroRecebedor, p_endereco_id: idSelecionado }), endereco_id: idAtual } }
    ]) {
        ({ c, chamadas } = ambiente());
        c.portalDados.endereco = endereco;
        c.portalDados.endereco_entrega_id = idAtual;
        c.portalDados.enderecos_entrega = [enderecoNovo];
        c.supabaseClient.rpc = async () => falha;
        await c.selecionarEnderecoEntrega(0);
        assert.equal(c.portalConfirmacoes.entrega, null);
        assert.equal(c.portalDados.endereco_entrega_id, idAtual);
        assert.deepEqual(chamadas, []);
        if (falha.error) assert.match(c.cartaoDeDecisaoEntrega(), /Reabra o link/);
    }

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
        concluir = () => resolve({ data: reciboEndereco(args) });
    }); };
    const salvando = c.usarNovoEnderecoEntrega();
    await c.usarNovoEnderecoEntrega();
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
    await c.usarNovoEnderecoEntrega();
    assert.ok(c.formularioEnderecoEntrega().includes('Avenida Oficial, 55'));

    ({ c, chamadas, requisicoes } = ambiente());
    c.portalDados.endereco = { ...endereco, do_cadastro: true };
    c.portalDados.endereco_entrega_id = idAtual;
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
    assert.deepEqual(requisicoes[0], { p_numero: '123', p_token: 'sintetico', p_acao: 'confirmar',
        p_endereco_id: idAtual, p_endereco: endereco, p_anterior: { ...endereco, do_cadastro: true } });

    ({ c, chamadas } = ambiente());
    c.tipoDaPessoa = () => 'fisica';
    c.portalDados.endereco = { ...endereco, recebedor: null, cpf_recebedor: null };
    c.portalDados.endereco_entrega_id = idAtual;
    assert.equal(c.dadosDoFormularioEntrega().valores.recebedor, endereco.recebedor, 'exibição de legado mantém o fallback');
    await c.decidirDados('entrega', true);
    assert.deepEqual(chamadas, [], 'dados de recebedor inferidos não são gravados implicitamente');
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.match(c.cartaoDeDecisaoEntrega(), /Alterar Endereço para selecionar ou cadastrar um endereço com recebedor/);

    ({ c, chamadas } = ambiente());
    c.portalConfirmacoes.entrega = true;
    c.portalDados.enderecos_entrega = [{ ...endereco, id: idSelecionado }];
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().alterando, false, 'falha ao desfazer mantém seleção bloqueada');
    c.gravarCorrecaoDoCliente = async () => ({ ok: true });
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().alterando, false, 'selecionar outro endereço conclui edição');
    assert.equal(c.portalConfirmacoes.entrega, true);

    ({ c, chamadas } = ambiente());
    c.portalDados.endereco = { ...endereco, cidade: 'São Paulo' };
    c.portalDados.pagamentos = [{ status: 'PAID' }, { status: 'A_RECEBER' }];
    c.portalDados.enderecos_entrega = [
        { ...endereco, id: idAtual, cidade: '  SAO   PAULO ' },
        { ...endereco, id: idSelecionado, cidade: 'Campinas' }
    ];
    let avisos = [];
    c.confirm = texto => { avisos.push(texto); return false; };
    await c.selecionarEnderecoEntrega(0);
    assert.equal(avisos.length, 0, 'mesma cidade não exibe aviso mesmo com cobrança paga');
    assert.equal(c.dadosDoFormularioEntrega().valores.cidade, '  SAO   PAULO ');
    await c.selecionarEnderecoEntrega(c.portalDados.enderecos_entrega.findIndex(e => e.cidade === 'Campinas'));
    assert.equal(avisos.length, 1, 'cidade diferente exibe aviso quando há cobrança paga');
    assert.equal(avisos[0], 'Este pedido já possui uma cobrança paga. A alteração de endereço gerará uma diferença no valor do frete e será cobrada à parte.');
    assert.equal(c.dadosDoFormularioEntrega().valores.cidade, '  SAO   PAULO ', 'cancelar mantém o endereço selecionado');
    c.confirm = texto => { avisos.push(texto); return true; };
    await c.selecionarEnderecoEntrega(c.portalDados.enderecos_entrega.findIndex(e => e.cidade === 'Campinas'));
    assert.equal(c.dadosDoFormularioEntrega().valores.cidade, 'Campinas', 'confirmar permite mudar a cidade');

    ({ c, chamadas } = ambiente());
    c.portalDados.endereco = { ...endereco, cidade: 'São Paulo' };
    c.portalDados.pagamentos = [{ status: 'A_RECEBER' }];
    c.portalDados.enderecos_entrega = [{ ...endereco, id: idSelecionado, cidade: 'Campinas' }];
    c.confirm = texto => { throw new Error('não deveria avisar sem cobrança paga: ' + texto); };
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.dadosDoFormularioEntrega().valores.cidade, 'Campinas', 'sem cobrança paga permite outra cidade');
    // A seleção e o cadastro usam os mesmos recibos e não confirmam em falha.
    ({ c, chamadas } = ambiente());
    c.portalDados.enderecos_entrega = [{ ...endereco, id: idSelecionado }];
    c.supabaseClient.rpc = async () => ({ error: { message: 'offline' } });
    await c.selecionarEnderecoEntrega(0);
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.equal(c.portalErroConfirmacao.entrega, true);
    assert.deepEqual(chamadas, []);

    ({ c, chamadas } = ambiente());
    c.gravarCorrecaoDoCliente = async () => ({ ok: false });
    await preencher(c, true);
    assert.equal(c.portalConfirmacoes.entrega, null);
    assert.equal(c.portalErroConfirmacao.entrega, true);
    assert.ok(!chamadas.some(x => x.startsWith('avanco')));

    ({ c, chamadas } = ambiente());
    c.portalDados.enderecos_entrega = [{ ...endereco, id: idSelecionado }];
    await Promise.all([c.selecionarEnderecoEntrega(0), c.selecionarEnderecoEntrega(0)]);
    assert.deepEqual(chamadas, [RPC_ENTREGA, 'confirmacao', 'avanco:faturamento']);

    console.log('OK: endereço somente leitura, Alterar Endereço, CPF/CEP, CNPJ bloqueado e gravação confirmada.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
