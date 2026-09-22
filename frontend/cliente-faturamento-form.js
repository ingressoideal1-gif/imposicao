// Selecao e cadastro dos dados fiscais usados pela nota do pedido.
let rascunhoFaturamento = null;
let consultaFaturamento = 0;
const CAMPOS_FATURAMENTO = ['nome', 'documento', 'ins_estadual', 'email', 'telefone',
    'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

function nomeDeExibicaoNoCadastroFaturamento(cliente, fallback) {
    if (typeof nomePreferencialClientePortal === 'function') {
        return nomePreferencialClientePortal(cliente, fallback);
    }
    return String(cliente && (cliente.fantasia || cliente.nome_fantasia || cliente.nome) || fallback || '').trim();
}

function cadastroAtualFaturamento() {
    const dados = window.portalDados || {};
    return Object.assign({}, dados.cliente || {}, dados.endereco_faturamento || {});
}

function dadosDoFormularioFaturamento() {
    if (!rascunhoFaturamento) {
        const dados = window.portalDados || {};
        const atual = cadastroAtualFaturamento();
        rascunhoFaturamento = {
            valores: {}, idCliente: dados.pedido && dados.pedido.id_cliente,
            anteriorId: dados.pedido && dados.pedido.id_cliente,
            fantasia: String(atual.fantasia || '').trim(),
            alterando: false, novo: false, tela: 'lista', documentoLiberado: false,
            origemCnpj: false, buscando: false, consultado: '', erro: ''
        };
        CAMPOS_FATURAMENTO.forEach(k => { rascunhoFaturamento.valores[k] = String(atual[k] || ''); });
    }
    return rascunhoFaturamento;
}

function cadastrosFaturamento() {
    const lista = (window.portalDados && window.portalDados.cadastros_faturamento) || [];
    return Array.isArray(lista) ? lista : [];
}

function atualizarTelaFaturamento(reabrir) {
    redesenharSecao('faturamento');
    if (reabrir) setTimeout(abrirMeusDados, 0);
}

function resumoFaturamento() {
    const r = dadosDoFormularioFaturamento();
    const v = r.valores;
    const rua = [v.endereco, v.numero].filter(Boolean).join(', ');
    const local = [v.bairro, [v.cidade, v.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
    const icone = (nome, px, cor) => typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
    return '<div class="portal-cartao portal-entrega-resumo"><h2>Dados para a nota fiscal</h2>'
        + '<div class="portal-entrega-bloco portal-entrega-recebedor"><span class="portal-entrega-icone">'
        + icone('pessoa', 22, '#2563eb') + '</span><div><span class="portal-entrega-legenda">Titular da nota</span>'
        + '<strong>' + escapeHtml(v.nome || 'Não informado') + '</strong>'
        + '<span>' + escapeHtml(documentoEmMascara(v.documento) || 'CPF ou CNPJ não informado') + '</span>'
        + (v.ins_estadual ? '<span>Inscrição estadual: ' + escapeHtml(v.ins_estadual) + '</span>' : '')
        + (v.email ? '<span>' + escapeHtml(v.email) + '</span>' : '')
        + (v.telefone ? '<span>' + escapeHtml(v.telefone) + '</span>' : '') + '</div></div>'
        + '<div class="portal-entrega-bloco"><span class="portal-entrega-icone">'
        + icone('pin', 22, '#16a34a') + '</span><div><span class="portal-entrega-legenda">Endereço fiscal</span>'
        + '<strong>' + escapeHtml(rua || 'Endereço não informado') + '</strong>'
        + (v.complemento ? '<span>' + escapeHtml(v.complemento) + '</span>' : '')
        + (local ? '<span>' + escapeHtml(local) + '</span>' : '')
        + '<span>CEP ' + escapeHtml(cepEmMascara(v.cep) || 'não informado') + '</span></div></div>'
        + (r.alterando
            ? '<div class="portal-aviso calmo">Cadastro selecionado. Confirme abaixo para usar estes dados na nota.</div>' : '')
        + '</div>';
}

function campoFaturamento(campo, rotulo, opcoes = {}) {
    const r = dadosDoFormularioFaturamento();
    const bloqueado = opcoes.bloqueado || r.buscando || (campo === 'nome' && r.documentoLiberado)
        || (r.origemCnpj && campo !== 'documento');
    return '<label class="portal-entrega-campo"><span>' + escapeHtml(rotulo) + '</span><input '
        + 'class="portal-caixa-de-texto" type="text" ' + (opcoes.numerico ? 'inputmode="numeric" ' : '')
        + (opcoes.maxlength ? 'maxlength="' + opcoes.maxlength + '" ' : '') + (bloqueado ? 'readonly ' : '')
        + 'value="' + escapeHtml(r.valores[campo]) + '" '
        + (bloqueado ? '' : 'oninput="editarCampoFaturamento(\'' + campo + '\',this.value)"') + '></label>';
}

function formularioCadastroFaturamento() {
    const r = dadosDoFormularioFaturamento();
    const tipo = tipoDoDocumentoEntrega(r.valores.documento);
    let dados = '';
    if (r.documentoLiberado) {
        dados = '<div class="portal-entrega-etapa"><h3>2. Dados da nota</h3>'
            + (r.origemCnpj ? '<p class="portal-aviso calmo">Os dados vieram do cadastro do CNPJ e não podem ser editados.</p>' : '')
            + campoFaturamento('nome', tipo === 'cnpj' ? 'Razão social' : 'Nome completo', { maxlength: 150 })
            + campoFaturamento('ins_estadual', 'Inscrição estadual (ou ISENTO)', { maxlength: 30 })
            + campoFaturamento('email', 'E-mail', { maxlength: 150 })
            + campoFaturamento('telefone', 'Telefone', { maxlength: 30 })
            + campoFaturamento('cep', 'CEP', { maxlength: 9, numerico: true })
            + (!r.origemCnpj ? '<button type="button" class="portal-botao" onclick="buscarCepFaturamento()">Buscar endereço pelo CEP</button>' : '')
            + campoFaturamento('endereco', 'Endereço', { maxlength: 200 })
            + '<div class="portal-entrega-campos-duplos">' + campoFaturamento('numero', 'Número (ou S/N)', { maxlength: 20 })
            + campoFaturamento('complemento', 'Complemento (opcional)', { maxlength: 150 }) + '</div>'
            + campoFaturamento('bairro', 'Bairro', { maxlength: 100 })
            + '<div class="portal-entrega-campos-duplos">' + campoFaturamento('cidade', 'Cidade', { bloqueado: !r.origemCnpj })
            + campoFaturamento('uf', 'UF', { bloqueado: !r.origemCnpj }) + '</div></div>';
    }
    return '<div class="portal-entrega-etapa"><h3>1. CPF ou CNPJ</h3>'
        + campoFaturamento('documento', 'CPF ou CNPJ', {
            maxlength: 18, numerico: true, bloqueado: !r.novo || r.documentoLiberado
        })
        + (!r.documentoLiberado ? '<button type="button" class="portal-botao principal" onclick="continuarDocumentoFaturamento()">'
            + (r.buscando ? 'Consultando...' : 'Continuar') + '</button>' : '') + '</div>' + dados;
}

function modalMeusDados() {
    const r = dadosDoFormularioFaturamento();
    if (r.tela !== 'lista') {
        return '<dialog id="portal-modal-faturamento" class="portal-modal-enderecos"><div class="portal-modal-cabecalho">'
            + '<div><span class="portal-entrega-legenda">Meus Dados</span><h2>' + (r.novo ? 'Novo cadastro' : 'Editar cadastro') + '</h2></div>'
            + '<button type="button" class="portal-modal-fechar" aria-label="Fechar" onclick="fecharMeusDados()">×</button></div>'
            + formularioCadastroFaturamento()
            + (r.erro ? '<p role="alert" class="portal-aviso atencao">' + escapeHtml(r.erro) + '</p>' : '')
            + '<div class="portal-modal-acoes"><button type="button" class="portal-botao" onclick="voltarMeusDados()">Voltar</button>'
            + (r.documentoLiberado && !r.buscando ? '<button type="button" class="portal-botao principal" onclick="usarCadastroFaturamento()">Usar estes dados</button>' : '')
            + '</div></dialog>';
    }
    const itens = cadastrosFaturamento().map((c, i) => {
        const e = c.endereco || {};
        const linha = [e.endereco, e.numero].filter(Boolean).join(', ');
        const cpf = tipoDaPessoa(c.documento) === 'fisica';
        return '<div class="portal-endereco-opcao"><span class="portal-endereco-tipo">'
            + escapeHtml(c.tipo_relacao || (cpf ? 'Pessoa física' : 'Pessoa jurídica')) + '</span><strong>'
            + escapeHtml(nomeDeExibicaoNoCadastroFaturamento(c, 'Nome não informado')) + '</strong><span>'
            + escapeHtml(documentoEmMascara(c.documento) || 'Documento não informado') + '</span>'
            + '<span class="portal-endereco-linha">' + escapeHtml(linha || 'Endereço não informado') + '</span>'
            + '<div class="portal-par-de-botoes"><button type="button" class="portal-botao" onclick="selecionarCadastroFaturamento(' + i + ')">Selecionar</button>'
            + (cpf ? '<button type="button" class="portal-botao" onclick="editarCadastroFaturamento(' + i + ')">Editar</button>' : '') + '</div></div>';
    }).join('') || '<p class="portal-vazio">Nenhum cadastro fiscal disponível.</p>';
    return '<dialog id="portal-modal-faturamento" class="portal-modal-enderecos"><div class="portal-modal-cabecalho">'
        + '<div><span class="portal-entrega-legenda">Nota fiscal</span><h2>Meus Dados</h2></div>'
        + '<button type="button" class="portal-modal-fechar" aria-label="Fechar" onclick="fecharMeusDados()">×</button></div>'
        + '<div class="portal-lista-enderecos">' + itens + '</div>'
        + '<button type="button" class="portal-botao principal" onclick="novoCadastroFaturamento()">Adicionar novo cadastro</button></dialog>';
}

function cartaoDeDecisaoFaturamento() {
    const confirmado = window.portalConfirmacoes.faturamento === true;
    const gravando = window.portalGravandoConfirmacao;
    const icone = (nome, px, cor) => typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
    return '<div class="portal-cartao"><h2>Estes dados para a nota fiscal estão corretos?</h2>'
        + (confirmado ? '<div class="portal-aviso ok">' + icone('check', 16, '#22c55e') + ' Dados confirmados.</div>' : '')
        + (window.portalErroConfirmacao.faturamento ? '<div class="portal-aviso atencao" role="alert">Não conseguimos salvar. Tente novamente.</div>' : '')
        + '<div class="portal-par-de-botoes"><button type="button" class="portal-botao' + (confirmado ? ' principal' : '') + '" '
        + (gravando || confirmado ? 'disabled ' : '') + 'onclick="decidirDados(\'faturamento\',true)">'
        + icone('check', 17) + (gravando === 'faturamento' ? 'Salvando...' : confirmado ? 'Confirmado' : 'Confirmar') + '</button>'
        + '<button type="button" class="portal-botao" ' + (gravando ? 'disabled ' : '') + 'onclick="abrirMeusDados()">'
        + icone('pessoa', 17) + 'Meus Dados</button></div></div>' + modalMeusDados();
}

function abrirMeusDados() { const m = document.getElementById('portal-modal-faturamento'); if (m && m.showModal) m.showModal(); }
function fecharMeusDados() { const m = document.getElementById('portal-modal-faturamento'); if (m && m.open) m.close(); }

async function liberarEdicaoFaturamento() {
    if (window.portalGravandoConfirmacao || clienteState.pedidoFinalizado) return false;
    if (window.portalConfirmacoes.faturamento !== null) {
        await decidirDados('faturamento', null);
        if (window.portalConfirmacoes.faturamento !== null || window.portalErroConfirmacao.faturamento) return false;
    }
    dadosDoFormularioFaturamento().alterando = true;
    return true;
}

function copiarCadastroFaturamento(c) {
    const r = dadosDoFormularioFaturamento();
    const e = c.endereco || {};
    CAMPOS_FATURAMENTO.forEach(k => { r.valores[k] = String((Object.prototype.hasOwnProperty.call(c, k) ? c[k] : e[k]) || ''); });
    r.idCliente = c.id_cliente;
    r.fantasia = String(c.fantasia || '').trim();
    r.documentoLiberado = true;
    r.origemCnpj = tipoDaPessoa(c.documento) === 'juridica';
    r.consultado = String(e.cep || '').replace(/\D/g, '');
    r.erro = '';
}

async function selecionarCadastroFaturamento(i) {
    const c = cadastrosFaturamento()[i];
    if (!c || !(await liberarEdicaoFaturamento())) return;
    copiarCadastroFaturamento(c); dadosDoFormularioFaturamento().novo = false;
    fecharMeusDados(); atualizarTelaFaturamento(false);
}

async function editarCadastroFaturamento(i) {
    const c = cadastrosFaturamento()[i];
    if (!c || tipoDaPessoa(c.documento) !== 'fisica' || !(await liberarEdicaoFaturamento())) return;
    copiarCadastroFaturamento(c); const r = dadosDoFormularioFaturamento(); r.novo = false; r.tela = 'editar';
    atualizarTelaFaturamento(true);
}

async function novoCadastroFaturamento() {
    if (!(await liberarEdicaoFaturamento())) return;
    const r = dadosDoFormularioFaturamento();
    CAMPOS_FATURAMENTO.forEach(k => { r.valores[k] = ''; });
    Object.assign(r, { idCliente: null, novo: true, tela: 'editar', documentoLiberado: false,
        origemCnpj: false, consultado: '', erro: '', fantasia: '' });
    atualizarTelaFaturamento(true);
}

function voltarMeusDados() { const r = dadosDoFormularioFaturamento(); consultaFaturamento++; r.buscando = false; r.erro = ''; r.tela = 'lista'; atualizarTelaFaturamento(true); }

function editarCampoFaturamento(campo, valor) {
    const r = dadosDoFormularioFaturamento();
    if (!CAMPOS_FATURAMENTO.includes(campo) || r.origemCnpj || r.buscando
        || (campo === 'nome' && r.documentoLiberado)) return;
    r.valores[campo] = valor; r.erro = '';
    if (campo === 'documento') { r.documentoLiberado = false; r.consultado = ''; }
    if (campo === 'cep') r.consultado = '';
}

async function continuarDocumentoFaturamento() {
    const r = dadosDoFormularioFaturamento();
    const documento = r.valores.documento.replace(/\D/g, '');
    const tipo = tipoDoDocumentoEntrega(documento);
    if (!tipo) { r.erro = 'Informe um CPF ou CNPJ válido para continuar.'; atualizarTelaFaturamento(true); return; }
    r.valores.documento = documento; r.documentoLiberado = false; r.origemCnpj = tipo === 'cnpj'; r.erro = '';
    r.buscando = true; atualizarTelaFaturamento(true); const seq = ++consultaFaturamento;
    try {
        const c = await consultarDocumentoNoPortal(documento);
        if (seq !== consultaFaturamento) return;
        r.valores.nome = String(c.nome || '').trim();
        if (!r.valores.nome) throw new Error('incompleto');
        r.documentoLiberado = true;
        if (tipo === 'cpf') { r.consultado = ''; return; }
        Object.assign(r.valores, { ins_estadual: '', email: '', telefone: '',
            cep: String(c.cep || '').replace(/\D/g, ''), endereco: c.endereco || '', numero: c.numero || '',
            complemento: c.complemento || '', bairro: c.bairro || '', cidade: c.cidade || '', uf: c.uf || '' });
        if (!/^\d{8}$/.test(r.valores.cep) || ['endereco','numero','bairro','cidade','uf'].some(k => !r.valores[k])) throw new Error('incompleto');
        r.consultado = r.valores.cep;
    } catch (e) {
        if (seq === consultaFaturamento) { r.documentoLiberado = false; r.origemCnpj = false;
            r.erro = tipo === 'cpf' ? 'Não foi possível consultar o nome deste CPF agora. Tente novamente.'
                : e.message === 'incompleto' ? 'O cadastro deste CNPJ não possui dados completos.'
                    : 'Não foi possível consultar o CNPJ agora. Tente novamente.'; }
    } finally { if (seq === consultaFaturamento) { r.buscando = false; atualizarTelaFaturamento(true); } }
}

async function buscarCepFaturamento() {
    const r = dadosDoFormularioFaturamento(); const cep = r.valores.cep.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) { r.erro = 'Informe um CEP com 8 dígitos.'; atualizarTelaFaturamento(true); return; }
    r.buscando = true; atualizarTelaFaturamento(true); const seq = ++consultaFaturamento;
    try { const resp = await fetch('https://viacep.com.br/ws/' + cep + '/json/'); const e = await resp.json();
        if (!resp.ok || e.erro || seq !== consultaFaturamento) throw new Error('cep');
        Object.assign(r.valores, { cep, endereco: e.logradouro || '', bairro: e.bairro || '', cidade: e.localidade || '', uf: e.uf || '' });
        r.consultado = cep;
    } catch (e) { if (seq === consultaFaturamento) r.erro = 'Não foi possível localizar o CEP. Confira e tente novamente.'; }
    finally { if (seq === consultaFaturamento) { r.buscando = false; atualizarTelaFaturamento(true); } }
}

function usarCadastroFaturamento() {
    const r = dadosDoFormularioFaturamento(); const v = r.valores;
    const obrigatorios = ['nome','documento','cep','endereco','numero','bairro','cidade','uf'];
    if (!tipoDoDocumentoEntrega(v.documento) || obrigatorios.some(k => !String(v[k] || '').trim())
        || (!r.origemCnpj && r.consultado !== v.cep.replace(/\D/g, ''))) {
        r.erro = 'Complete os dados obrigatórios e consulte o CEP antes de continuar.'; atualizarTelaFaturamento(true); return;
    }
    CAMPOS_FATURAMENTO.forEach(k => { v[k] = String(v[k] || '').trim(); });
    v.documento = v.documento.replace(/\D/g, ''); v.cep = v.cep.replace(/\D/g, '');
    r.tela = 'lista'; fecharMeusDados(); atualizarTelaFaturamento(false);
}

async function persistirFaturamento() {
    const r = dadosDoFormularioFaturamento();
    if (!r.alterando) return;
    // Selecionar novamente o mesmo CNPJ nao altera dado algum: CNPJ e endereco
    // sao somente leitura. Nesse caso a etapa seguinte precisa registrar apenas
    // a confirmacao, sem submeter uma atualizacao fiscal redundante ao ERP.
    if (!r.novo && r.origemCnpj && String(r.idCliente) === String(r.anteriorId)) {
        r.alterando = false;
        return;
    }
    const cadastro = Object.fromEntries(CAMPOS_FATURAMENTO.map(k => [k, String(r.valores[k] || '').trim()]));
    cadastro.documento = cadastro.documento.replace(/\D/g, ''); cadastro.cep = cadastro.cep.replace(/\D/g, '');
    const { data, error } = await supabaseClient.rpc('link_cliente_salvar_faturamento', {
        p_numero: String(clienteState.numero), p_token: clienteState.token, p_id_cliente: r.idCliente,
        p_cadastro: cadastro, p_novo: r.novo, p_anterior_id: r.anteriorId
    });
    if (error || !data || data.ok !== true || !data.cliente) throw new Error('O banco não confirmou os dados da nota.');
    window.portalDados.cliente = data.cliente;
    window.portalDados.endereco_faturamento = data.endereco_faturamento;
    window.portalDados.cadastros_faturamento = data.cadastros_faturamento || cadastrosFaturamento();
    window.portalDados.pedido.id_cliente = data.id_cliente;
    r.anteriorId = data.id_cliente; r.idCliente = data.id_cliente; r.alterando = false; r.novo = false;
}

window.dadosDoFormularioFaturamento = dadosDoFormularioFaturamento;
window.resumoFaturamento = resumoFaturamento;
window.cartaoDeDecisaoFaturamento = cartaoDeDecisaoFaturamento;
window.abrirMeusDados = abrirMeusDados; window.fecharMeusDados = fecharMeusDados;
window.selecionarCadastroFaturamento = selecionarCadastroFaturamento;
window.editarCadastroFaturamento = editarCadastroFaturamento; window.novoCadastroFaturamento = novoCadastroFaturamento;
window.voltarMeusDados = voltarMeusDados; window.editarCampoFaturamento = editarCampoFaturamento;
window.continuarDocumentoFaturamento = continuarDocumentoFaturamento; window.buscarCepFaturamento = buscarCepFaturamento;
window.usarCadastroFaturamento = usarCadastroFaturamento; window.persistirFaturamento = persistirFaturamento;
