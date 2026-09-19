// Rascunho da entrega: sobrevive aos redesenhos e só vira dado do pedido após recibo.
let rascunhoEntrega = null;
let consultaEntrega = 0;
const CAMPOS_ENTREGA = ['recebedor', 'cpf_recebedor', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

function dadosDoFormularioEntrega() {
    if (!rascunhoEntrega) {
        const dados = window.portalDados || {};
        const anterior = dados.endereco || {};
        const fisica = dados.cliente && tipoDaPessoa(dados.cliente.documento) === 'fisica';
        rascunhoEntrega = {
            valores: {}, consultado: '', buscando: false, erro: '', anterior: dados.endereco || null,
            alterando: window.portalConfirmacoes.entrega === false,
            telaEnderecos: 'lista', documentoLiberado: false, origemCnpj: false
        };
        CAMPOS_ENTREGA.forEach(k => { rascunhoEntrega.valores[k] = String(anterior[k] || ''); });
        rascunhoEntrega.valores.recebedor ||= fisica ? dados.cliente.nome || '' : '';
        rascunhoEntrega.valores.cpf_recebedor ||= fisica ? dados.cliente.documento || '' : '';
        if (rascunhoEntrega.alterando) {
            rascunhoEntrega.consultado = rascunhoEntrega.valores.cep.replace(/\D/g, '');
        }
    }
    return rascunhoEntrega;
}

function editarCampoEntrega(campo, valor) {
    if (!CAMPOS_ENTREGA.includes(campo) || window.portalGravandoConfirmacao
        || !dadosDoFormularioEntrega().alterando || clienteState.pedidoFinalizado) return;
    const r = dadosDoFormularioEntrega();
    const editaveis = r.documentoLiberado ? ['cep', 'numero', 'complemento'] : ['cpf_recebedor'];
    if (!editaveis.includes(campo) || (r.origemCnpj && campo !== 'cpf_recebedor')) return;
    r.valores[campo] = valor;
    r.erro = '';
    if (campo === 'cpf_recebedor') {
        consultaEntrega++;
        r.documentoLiberado = false;
        r.origemCnpj = false;
        r.consultado = '';
        r.buscando = false;
        ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf']
            .forEach(k => { r.valores[k] = ''; });
    }
    if (campo === 'cep') {
        consultaEntrega++;
        r.consultado = '';
        r.buscando = false;
    }
}

function tipoDoDocumentoEntrega(valor) {
    const documento = String(valor || '').replace(/\D/g, '');
    if (!documentoDoRecebedorValido(documento)) return '';
    return documento.length === 14 ? 'cnpj' : 'cpf';
}

function reabrirMeusEnderecos() {
    redesenharSecao('entrega');
    setTimeout(abrirEnderecosEntrega, 0);
}

function atualizarTelaDaEntrega() {
    if (dadosDoFormularioEntrega().telaEnderecos === 'novo') reabrirMeusEnderecos();
    else redesenharSecao('entrega');
}

async function consultarDocumentoNoPortal(documento) {
    if (!supabaseClient || !supabaseClient.functions || typeof supabaseClient.functions.invoke !== 'function') {
        throw new Error('consulta indisponível');
    }
    const { data, error } = await supabaseClient.functions.invoke('consulta-documento-entrega', {
        body: { numero: String(clienteState.numero), token: clienteState.token, documento }
    });
    if (error || !data || data.ok !== true || data.cpf && data.cpf !== documento
        || data.cnpj && data.cnpj !== documento) throw new Error('consulta');
    return data;
}

async function continuarDocumentoEntrega() {
    if (window.portalGravandoConfirmacao || clienteState.pedidoFinalizado) return;
    const r = dadosDoFormularioEntrega();
    const documento = r.valores.cpf_recebedor.replace(/\D/g, '');
    const tipo = tipoDoDocumentoEntrega(documento);
    r.erro = '';
    if (!tipo) {
        r.erro = 'Informe um CPF ou CNPJ válido para continuar.';
        reabrirMeusEnderecos();
        return;
    }
    r.valores.cpf_recebedor = documento;
    r.origemCnpj = tipo === 'cnpj';
    const sequencia = ++consultaEntrega;
    r.buscando = true;
    reabrirMeusEnderecos();
    try {
        const cadastro = await consultarDocumentoNoPortal(documento);
        if (sequencia !== consultaEntrega || r.valores.cpf_recebedor !== documento) return;
        r.valores.recebedor = String(cadastro.nome || '').trim();
        if (!r.valores.recebedor) throw new Error('incompleto');
        r.documentoLiberado = true;
        if (tipo === 'cpf') {
            r.consultado = '';
            return;
        }
        const endereco = {
            cep: String(cadastro.cep || '').replace(/\D/g, ''),
            endereco: String(cadastro.endereco || '').trim(),
            numero: String(cadastro.numero || '').trim(),
            complemento: String(cadastro.complemento || '').trim(),
            bairro: String(cadastro.bairro || '').trim(),
            cidade: String(cadastro.cidade || '').trim(),
            uf: String(cadastro.uf || '').trim().toUpperCase()
        };
        if (!/^\d{8}$/.test(endereco.cep)
            || ['endereco', 'numero', 'bairro', 'cidade', 'uf'].some(k => !endereco[k])
            || !/^[A-Z]{2}$/.test(endereco.uf)) {
            throw new Error('incompleto');
        }
        Object.assign(r.valores, endereco);
        r.consultado = endereco.cep;
    } catch (e) {
        if (sequencia === consultaEntrega) {
            r.documentoLiberado = false;
            r.origemCnpj = false;
            r.erro = tipo === 'cpf'
                ? 'Não foi possível consultar o nome deste CPF agora. Confira o número e tente novamente.'
                : e && e.message === 'incompleto'
                    ? 'O cadastro deste CNPJ não possui um endereço completo. Fale com seu atendimento.'
                    : 'Não foi possível consultar o CNPJ agora. Confira o número e tente novamente.';
        }
    } finally {
        if (sequencia === consultaEntrega) {
            r.buscando = false;
            reabrirMeusEnderecos();
        }
    }
}

function documentoDoRecebedorValido(valor) {
    const documento = String(valor || '').replace(/\D/g, '');
    if (!/^\d{11}(\d{3})?$/.test(documento) || /^(\d)\1+$/.test(documento)) return false;
    if (documento.length === 11) {
        for (let n = 9; n <= 10; n++) {
            let soma = 0;
            for (let i = 0; i < n; i++) soma += Number(documento[i]) * (n + 1 - i);
            const digito = (soma * 10 % 11) % 10;
            if (digito !== Number(documento[n])) return false;
        }
        return true;
    }
    const pesos = [
        [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
        [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    ];
    for (let etapa = 0; etapa < 2; etapa++) {
        let soma = 0;
        for (let i = 0; i < pesos[etapa].length; i++) soma += Number(documento[i]) * pesos[etapa][i];
        const resto = soma % 11;
        const digito = resto < 2 ? 0 : 11 - resto;
        if (digito !== Number(documento[12 + etapa])) return false;
    }
    return true;
}

async function buscarCepEntrega() {
    if (window.portalGravandoConfirmacao || !dadosDoFormularioEntrega().alterando
        || clienteState.pedidoFinalizado) return;
    const r = dadosDoFormularioEntrega();
    if (!r.documentoLiberado || r.origemCnpj) return;
    const cep = r.valores.cep.replace(/\D/g, '');
    const sequencia = ++consultaEntrega;
    r.consultado = '';
    r.erro = '';
    if (!/^\d{8}$/.test(cep)) {
        r.erro = 'Informe um CEP com 8 dígitos.';
        atualizarTelaDaEntrega();
        return;
    }
    r.buscando = true;
    atualizarTelaDaEntrega();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        // Só o CEP é enviado ao serviço. Nome e documento permanecem no pedido.
        const resposta = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: controller.signal });
        if (!resposta.ok) throw new Error('consulta');
        const endereco = await resposta.json();
        if (sequencia !== consultaEntrega || !r.alterando) return;
        if (endereco.erro || String(endereco.cep || '').replace(/\D/g, '') !== cep
            || !endereco.localidade || !/^[A-Z]{2}$/.test(endereco.uf || '')) throw new Error('cep');
        Object.assign(r.valores, {
            cep, endereco: endereco.logradouro || '', bairro: endereco.bairro || '',
            cidade: endereco.localidade, uf: endereco.uf, numero: '', complemento: ''
        });
        r.consultado = cep;
    } catch (e) {
        if (sequencia === consultaEntrega) r.erro = 'Não foi possível localizar o CEP. Confira e tente novamente.';
    } finally {
        clearTimeout(timeout);
        if (sequencia === consultaEntrega) {
            r.buscando = false;
            atualizarTelaDaEntrega();
        }
    }
}

function formularioEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const v = r.valores;
    const rua = [v.endereco, v.numero].filter(Boolean).join(', ');
    const local = [v.bairro, [v.cidade, v.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
    const icone = (nome, px, cor) => typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
    return '<div class="portal-cartao portal-entrega-resumo"><h2>Endereço de entrega</h2>'
        + '<div class="portal-entrega-bloco portal-entrega-recebedor">'
        + '<span class="portal-entrega-icone">' + icone('pessoa', 22, '#2563eb') + '</span>'
        + '<div><span class="portal-entrega-legenda">Recebedor</span>'
        + '<strong>' + escapeHtml(v.recebedor || 'Não informado') + '</strong>'
        + '<span>' + escapeHtml(documentoEmMascara(v.cpf_recebedor) || 'CPF ou CNPJ não informado') + '</span></div></div>'
        + '<div class="portal-entrega-bloco">'
        + '<span class="portal-entrega-icone">' + icone('pin', 22, '#16a34a') + '</span>'
        + '<div><span class="portal-entrega-legenda">Destino</span>'
        + '<strong>' + escapeHtml(rua || 'Endereço não informado') + '</strong>'
        + (v.complemento ? '<span>' + escapeHtml(v.complemento) + '</span>' : '')
        + (local ? '<span>' + escapeHtml(local) + '</span>' : '')
        + '<span>CEP ' + escapeHtml(cepEmMascara(v.cep) || 'não informado') + '</span></div></div>'
        + (r.alterando ? '<div class="portal-aviso calmo">Endereço selecionado. Confirme abaixo para salvar no pedido.</div>' : '')
        + '</div>';
}

function enderecosCadastradosEntrega() {
    const enderecos = (window.portalDados && window.portalDados.enderecos_entrega) || [];
    return Array.isArray(enderecos) ? enderecos : [];
}

function modalEnderecosEntrega() {
    const r = dadosDoFormularioEntrega();
    if (r.telaEnderecos === 'novo') return modalNovoEnderecoEntrega();
    const enderecos = enderecosCadastradosEntrega();
    const cartoes = enderecos.length ? enderecos.map((e, indice) => {
        const linha = [e.endereco, e.numero].filter(Boolean).join(', ');
        const cidade = [e.bairro, e.cidade, e.uf].filter(Boolean).join(' · ');
        const recebedor = String(e.recebedor || '').trim();
        const documento = documentoEmMascara(e.cpf_recebedor || '');
        return '<div class="portal-endereco-opcao">'
            + '<span class="portal-endereco-tipo">' + escapeHtml(e.tipo_endereco || 'Endereço cadastrado') + '</span>'
            + '<strong>' + escapeHtml(recebedor || 'Recebedor não informado') + '</strong>'
            + '<span>' + escapeHtml(documento || 'CPF ou CNPJ não informado') + '</span>'
            + '<span class="portal-endereco-linha">' + escapeHtml(linha || 'Endereço sem logradouro') + '</span>'
            + (cidade ? '<span>' + escapeHtml(cidade) + '</span>' : '')
            + '<span>CEP ' + escapeHtml(cepEmMascara(e.cep || '') || 'não informado') + '</span>'
            + '<button type="button" class="portal-botao" onclick="selecionarEnderecoEntrega(' + indice + ')">Selecionar</button>'
            + '</div>';
    }).join('') : '<p class="portal-vazio">Não há outro endereço cadastrado para este cliente.</p>';
    return '<dialog id="portal-modal-enderecos" class="portal-modal-enderecos">'
        + '<div class="portal-modal-cabecalho"><div><span class="portal-entrega-legenda">Entrega</span><h2>Meus Endereços</h2></div>'
        + '<button type="button" class="portal-modal-fechar" aria-label="Fechar" onclick="fecharEnderecosEntrega()">×</button></div>'
        + '<div class="portal-lista-enderecos">' + cartoes + '</div>'
        + '<button type="button" class="portal-botao principal" onclick="informarOutroEnderecoEntrega()">Adicionar novo endereço</button>'
        + '</dialog>';
}

function campoNovoEndereco(campo, rotulo, opcoes = {}) {
    const r = dadosDoFormularioEntrega();
    const bloqueado = opcoes.bloqueado || r.buscando;
    return '<label class="portal-entrega-campo"><span>' + escapeHtml(rotulo) + '</span>'
        + '<input id="entrega-' + campo + '" class="portal-caixa-de-texto" type="text" '
        + (opcoes.maxlength ? 'maxlength="' + opcoes.maxlength + '" ' : '')
        + (opcoes.numerico ? 'inputmode="numeric" ' : '')
        + (bloqueado ? 'readonly ' : '')
        + 'value="' + escapeHtml(r.valores[campo]) + '" '
        + (bloqueado ? '' : 'oninput="editarCampoEntrega(\'' + campo + '\',this.value)"') + '></label>';
}

function modalNovoEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const tipo = tipoDoDocumentoEntrega(r.valores.cpf_recebedor);
    let etapaEndereco = '';
    if (r.documentoLiberado && tipo === 'cpf') {
        etapaEndereco = '<div class="portal-entrega-etapa"><h3>2. Recebedor e endereço</h3>'
            + '<p>O nome vem do cadastro do CPF. Informe o CEP para carregar o endereço.</p>'
            + campoNovoEndereco('recebedor', 'Nome do recebedor', { bloqueado: true, maxlength: 150 })
            + campoNovoEndereco('cep', 'CEP', { maxlength: 9, numerico: true })
            + '<button type="button" class="portal-botao" onclick="buscarCepEntrega()" '
            + (r.buscando ? 'disabled' : '') + '>' + (r.buscando ? 'Consultando CEP...' : 'Buscar endereço pelo CEP') + '</button>'
            + campoNovoEndereco('endereco', 'Endereço', { bloqueado: true, maxlength: 200 })
            + '<div class="portal-entrega-campos-duplos">'
            + campoNovoEndereco('numero', 'Número (ou S/N)', { maxlength: 20 })
            + campoNovoEndereco('complemento', 'Complemento (opcional)', { maxlength: 150 }) + '</div>'
            + campoNovoEndereco('bairro', 'Bairro', { bloqueado: true, maxlength: 100 })
            + '<div class="portal-entrega-campos-duplos">'
            + campoNovoEndereco('cidade', 'Cidade', { bloqueado: true })
            + campoNovoEndereco('uf', 'UF', { bloqueado: true }) + '</div></div>';
    } else if (r.documentoLiberado && tipo === 'cnpj' && r.buscando) {
        etapaEndereco = '<div class="portal-entrega-etapa"><p class="portal-aviso calmo">Consultando o endereço cadastrado para este CNPJ...</p></div>';
    } else if (r.documentoLiberado && tipo === 'cnpj' && r.consultado) {
        etapaEndereco = '<div class="portal-entrega-etapa"><h3>2. Endereço cadastrado no CNPJ</h3>'
            + '<p class="portal-aviso calmo">Este endereço veio do cadastro do CNPJ e não pode ser editado.</p>'
            + formularioEnderecoEntrega() + '</div>';
    }
    const podeUsar = r.documentoLiberado && !!r.consultado && !r.buscando;
    return '<dialog id="portal-modal-enderecos" class="portal-modal-enderecos">'
        + '<div class="portal-modal-cabecalho"><div><span class="portal-entrega-legenda">Meus Endereços</span><h2>Novo endereço</h2></div>'
        + '<button type="button" class="portal-modal-fechar" aria-label="Fechar" onclick="fecharEnderecosEntrega()">×</button></div>'
        + '<div class="portal-entrega-etapa"><h3>1. CPF ou CNPJ</h3>'
        + campoNovoEndereco('cpf_recebedor', 'CPF ou CNPJ do recebedor', {
            maxlength: 18, numerico: true, bloqueado: r.documentoLiberado
        })
        + (!r.documentoLiberado ? '<button type="button" class="portal-botao principal" onclick="continuarDocumentoEntrega()" '
            + (r.buscando ? 'disabled' : '') + '>' + (r.buscando ? 'Consultando CNPJ...' : 'Continuar') + '</button>' : '')
        + '</div>' + etapaEndereco
        + (r.erro ? '<p role="alert" class="portal-aviso atencao">' + escapeHtml(r.erro) + '</p>' : '')
        + '<div class="portal-modal-acoes"><button type="button" class="portal-botao" onclick="voltarListaEnderecosEntrega()">Voltar</button>'
        + (podeUsar ? '<button type="button" class="portal-botao principal" onclick="usarNovoEnderecoEntrega()">Usar este endereço</button>' : '')
        + '</div></dialog>';
}

function abrirEnderecosEntrega() {
    const modal = document.getElementById('portal-modal-enderecos');
    if (modal && typeof modal.showModal === 'function') modal.showModal();
}

function fecharEnderecosEntrega() {
    const modal = document.getElementById('portal-modal-enderecos');
    if (modal && modal.open) modal.close();
}

async function liberarEdicaoEntrega() {
    if (window.portalGravandoConfirmacao || clienteState.pedidoFinalizado) return false;
    const r = dadosDoFormularioEntrega();
    if (r.alterando) return true;
    window.portalErroConfirmacao.entrega = false;
    if (window.portalConfirmacoes.entrega !== null) {
        await decidirDados('entrega', null);
        if (window.portalConfirmacoes.entrega !== null || window.portalErroConfirmacao.entrega) return false;
    }
    r.alterando = true;
    r.consultado = r.valores.cep.replace(/\D/g, '');
    r.erro = '';
    redesenharSecao('entrega');
    return true;
}

async function selecionarEnderecoEntrega(indice) {
    const escolhido = enderecosCadastradosEntrega()[indice];
    if (!escolhido || !(await liberarEdicaoEntrega())) return;
    const r = dadosDoFormularioEntrega();
    CAMPOS_ENTREGA.forEach(k => { r.valores[k] = String(escolhido[k] || ''); });
    r.consultado = r.valores.cep.replace(/\D/g, '');
    r.documentoLiberado = true;
    r.origemCnpj = r.valores.cpf_recebedor.replace(/\D/g, '').length === 14;
    r.telaEnderecos = 'lista';
    r.erro = '';
    fecharEnderecosEntrega();
    redesenharSecao('entrega');
}

async function informarOutroEnderecoEntrega() {
    if (!(await liberarEdicaoEntrega())) return;
    const r = dadosDoFormularioEntrega();
    CAMPOS_ENTREGA.forEach(k => { r.valores[k] = ''; });
    r.consultado = '';
    r.documentoLiberado = false;
    r.origemCnpj = false;
    r.telaEnderecos = 'novo';
    r.erro = '';
    reabrirMeusEnderecos();
}

function voltarListaEnderecosEntrega() {
    const r = dadosDoFormularioEntrega();
    consultaEntrega++;
    r.buscando = false;
    r.erro = '';
    r.telaEnderecos = 'lista';
    reabrirMeusEnderecos();
}

function usarNovoEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const documento = r.valores.cpf_recebedor.replace(/\D/g, '');
    const valores = Object.fromEntries(CAMPOS_ENTREGA.map(k => [k, String(r.valores[k] || '').trim()]));
    if (!r.documentoLiberado || !r.consultado || r.buscando
        || !valores.recebedor || !documentoDoRecebedorValido(documento)
        || !/^\d{8}$/.test(valores.cep.replace(/\D/g, ''))
        || ['endereco', 'numero', 'bairro', 'cidade', 'uf'].some(k => !valores[k])) {
        r.erro = 'Complete os dados obrigatórios antes de usar este endereço.';
        reabrirMeusEnderecos();
        return;
    }
    r.valores.cpf_recebedor = documento;
    r.valores.cep = valores.cep.replace(/\D/g, '');
    r.telaEnderecos = 'lista';
    r.erro = '';
    fecharEnderecosEntrega();
    redesenharSecao('entrega');
}

function cartaoDeDecisaoEntrega() {
    const r = dadosDoFormularioEntrega();
    const confirmado = window.portalConfirmacoes.entrega === true;
    const gravando = window.portalGravandoConfirmacao;
    const icone = (nome, px, cor) => typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
    return '<div class="portal-cartao"><h2>Este endereço de entrega está correto?</h2>'
        + (confirmado ? '<div class="portal-aviso ok">' + icone('check', 16, '#22c55e') + ' Endereço confirmado.</div>' : '')
        + (window.portalErroConfirmacao.entrega ? '<div class="portal-aviso atencao" role="alert">Não conseguimos salvar. Tente novamente.</div>' : '')
        + '<div class="portal-par-de-botoes">'
        + '<button type="button" class="portal-botao' + (confirmado ? ' principal' : '') + '" '
        + (gravando || confirmado ? 'disabled ' : '') + 'onclick="decidirDados(\'entrega\', true)">'
        + icone('check', 17) + (gravando === 'entrega' ? 'Salvando...' : confirmado ? 'Confirmado' : 'Confirmar') + '</button>'
        + '<button type="button" class="portal-botao" ' + (gravando ? 'disabled ' : '')
        + 'onclick="abrirEnderecosEntrega()">' + icone('pin', 17) + 'Meus Endereços</button></div>'
        + '</div>' + modalEnderecosEntrega();
}

async function persistirEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const valores = Object.fromEntries(CAMPOS_ENTREGA.map(k => [k, r.valores[k].trim()]));
    valores.cep = valores.cep.replace(/\D/g, '');
    valores.cpf_recebedor = valores.cpf_recebedor.replace(/\D/g, '');
    if (r.alterando && (r.buscando || !r.consultado || r.consultado !== valores.cep))
        throw new Error('Digite o CEP e use Buscar endereço pelo CEP antes de confirmar.');
    if (!/^\d{8}$/.test(valores.cep))
        throw new Error('Use Alterar para informar e consultar o CEP da entrega.');
    if (!valores.recebedor || !documentoDoRecebedorValido(valores.cpf_recebedor))
        throw new Error('Informe o recebedor e um CPF ou CNPJ válido.');
    if (['endereco', 'numero', 'bairro', 'cidade', 'uf'].some(k => !valores[k]))
        throw new Error('Complete endereço, número (ou S/N) e bairro antes de confirmar.');
    const { data, error } = await supabaseClient.rpc('link_cliente_salvar_entrega', {
        p_numero: String(clienteState.numero), p_token: clienteState.token,
        p_endereco: valores, p_anterior: r.anterior
    });
    if (error || !data || data.ok !== true || String(data.numero) !== String(clienteState.numero)
        || !data.endereco || CAMPOS_ENTREGA.some(k => data.endereco[k] !== valores[k]))
        throw new Error('O banco não confirmou a gravação do endereço. Tente novamente.');
    window.portalDados.endereco = data.endereco;
    const cadastrados = enderecosCadastradosEntrega();
    const jaExiste = cadastrados.some(e => CAMPOS_ENTREGA.every(k => String(e[k] || '') === valores[k]));
    if (!jaExiste) {
        window.portalDados.enderecos_entrega = [Object.assign({ tipo_endereco: 'ENTREGA' }, valores), ...cadastrados];
    }
    r.anterior = data.endereco;
    r.erro = '';
}

function concluirEdicaoEntrega() {
    dadosDoFormularioEntrega().alterando = false;
}

window.formularioEnderecoEntrega = formularioEnderecoEntrega;
window.persistirEnderecoEntrega = persistirEnderecoEntrega;
window.editarCampoEntrega = editarCampoEntrega;
window.buscarCepEntrega = buscarCepEntrega;
window.continuarDocumentoEntrega = continuarDocumentoEntrega;
window.documentoDoRecebedorValido = documentoDoRecebedorValido;
window.consultarDocumentoNoPortal = consultarDocumentoNoPortal;
window.cpfDaEntregaValido = documentoDoRecebedorValido;
window.cartaoDeDecisaoEntrega = cartaoDeDecisaoEntrega;
window.abrirEnderecosEntrega = abrirEnderecosEntrega;
window.fecharEnderecosEntrega = fecharEnderecosEntrega;
window.liberarEdicaoEntrega = liberarEdicaoEntrega;
window.selecionarEnderecoEntrega = selecionarEnderecoEntrega;
window.informarOutroEnderecoEntrega = informarOutroEnderecoEntrega;
window.voltarListaEnderecosEntrega = voltarListaEnderecosEntrega;
window.usarNovoEnderecoEntrega = usarNovoEnderecoEntrega;
window.concluirEdicaoEntrega = concluirEdicaoEntrega;
