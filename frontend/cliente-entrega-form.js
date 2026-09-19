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
            alterando: window.portalConfirmacoes.entrega === false
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
    r.valores[campo] = valor;
    r.erro = '';
    if (campo === 'cep') {
        consultaEntrega++;
        r.consultado = '';
        r.buscando = false;
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
    const cep = r.valores.cep.replace(/\D/g, '');
    const sequencia = ++consultaEntrega;
    r.consultado = '';
    r.erro = '';
    if (!/^\d{8}$/.test(cep)) {
        r.erro = 'Informe um CEP com 8 dígitos.';
        redesenharSecao('entrega');
        return;
    }
    r.buscando = true;
    redesenharSecao('entrega');
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
            redesenharSecao('entrega');
        }
    }
}

function formularioEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const confirmado = window.portalConfirmacoes.entrega === true;
    const alterando = r.alterando;
    const bloqueado = !alterando || window.portalGravandoConfirmacao || clienteState.pedidoFinalizado;
    const rotulos = { recebedor: 'Recebedor', cpf_recebedor: 'CPF ou CNPJ do recebedor', cep: 'CEP',
        endereco: 'Endereço', numero: 'Número (ou S/N)', complemento: 'Complemento (opcional)',
        bairro: 'Bairro', cidade: 'Cidade', uf: 'UF' };
    const limites = { recebedor: 150, cpf_recebedor: 18, cep: 9, endereco: 200, numero: 20,
        complemento: 150, bairro: 100, cidade: 100, uf: 2 };
    const campos = CAMPOS_ENTREGA.map(k => '<label style="display:block;margin:12px 0">'
        + escapeHtml(rotulos[k]) + '<input id="entrega-' + k + '" class="portal-caixa-de-texto" '
        + 'style="display:block;width:100%;box-sizing:border-box" type="text" maxlength="' + limites[k] + '" '
        + (['cep', 'cpf_recebedor'].includes(k) ? 'inputmode="numeric" ' : '')
        + (['cidade', 'uf'].includes(k) ? 'readonly ' : '')
        + 'value="' + escapeHtml(r.valores[k]) + '" oninput="editarCampoEntrega(\'' + k + '\',this.value)"></label>'
        + (k === 'cep' && alterando ? '<button type="button" class="portal-botao" onclick="buscarCepEntrega()" '
            + (r.buscando ? 'disabled' : '') + '>' + (r.buscando ? 'Consultando CEP...' : 'Buscar endereço pelo CEP') + '</button>' : '')).join('');
    return '<div class="portal-cartao"><h2>Endereço de entrega</h2>'
        + (!confirmado ? '<p>' + (alterando
            ? 'Digite o CEP, busque o endereço e complete os dados de quem vai receber. Informe rua e bairro se o CEP abranger toda a cidade.'
            : 'Confira os dados de entrega. Para modificar qualquer campo, use Alterar.') + '</p>' : '')
        + '<fieldset style="border:0;padding:0;margin:0;min-width:0" ' + (bloqueado ? 'disabled' : '') + '>' + campos + '</fieldset>'
        + (r.erro ? '<p role="alert" class="portal-aviso atencao">' + escapeHtml(r.erro) + '</p>' : '') + '</div>';
}

function enderecosCadastradosEntrega() {
    const enderecos = (window.portalDados && window.portalDados.enderecos_entrega) || [];
    return Array.isArray(enderecos) ? enderecos : [];
}

function modalEnderecosEntrega() {
    const enderecos = enderecosCadastradosEntrega();
    const cartoes = enderecos.length ? enderecos.map((e, indice) => {
        const linha = [e.endereco, e.numero].filter(Boolean).join(', ');
        const cidade = [e.bairro, e.cidade, e.uf].filter(Boolean).join(' · ');
        return '<button type="button" class="portal-endereco-opcao" onclick="selecionarEnderecoEntrega(' + indice + ')">'
            + '<b>' + escapeHtml(e.tipo_endereco || 'Endereço cadastrado') + '</b>'
            + '<span>' + escapeHtml(linha || 'Endereço sem logradouro') + '</span>'
            + '<span>' + escapeHtml(cidade) + '</span>'
            + '<span>CEP ' + escapeHtml(cepEmMascara(e.cep || '')) + '</span>'
            + '</button>';
    }).join('') : '<p class="portal-vazio">Não há outro endereço cadastrado para este cliente.</p>';
    return '<dialog id="portal-modal-enderecos" class="portal-modal-enderecos">'
        + '<div class="portal-modal-cabecalho"><h2>Endereços cadastrados</h2>'
        + '<button type="button" class="portal-modal-fechar" aria-label="Fechar" onclick="fecharEnderecosEntrega()">×</button></div>'
        + '<div class="portal-lista-enderecos">' + cartoes + '</div>'
        + '<button type="button" class="portal-botao" onclick="informarOutroEnderecoEntrega()">Informar outro endereço</button>'
        + '</dialog>';
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
    r.erro = '';
    fecharEnderecosEntrega();
    redesenharSecao('entrega');
}

async function informarOutroEnderecoEntrega() {
    if (!(await liberarEdicaoEntrega())) return;
    const r = dadosDoFormularioEntrega();
    ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(k => { r.valores[k] = ''; });
    r.consultado = '';
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
        + '<button type="button" class="portal-botao" ' + (gravando || r.alterando ? 'disabled ' : '')
        + 'onclick="liberarEdicaoEntrega()">' + icone('lapis', 17) + (r.alterando ? 'Alterando' : 'Alterar') + '</button></div>'
        + '<button type="button" class="portal-botao" style="margin-top:10px;width:100%" onclick="abrirEnderecosEntrega()">Ver endereços cadastrados</button>'
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
window.documentoDoRecebedorValido = documentoDoRecebedorValido;
window.cpfDaEntregaValido = documentoDoRecebedorValido;
window.cartaoDeDecisaoEntrega = cartaoDeDecisaoEntrega;
window.abrirEnderecosEntrega = abrirEnderecosEntrega;
window.fecharEnderecosEntrega = fecharEnderecosEntrega;
window.liberarEdicaoEntrega = liberarEdicaoEntrega;
window.selecionarEnderecoEntrega = selecionarEnderecoEntrega;
window.informarOutroEnderecoEntrega = informarOutroEnderecoEntrega;
window.concluirEdicaoEntrega = concluirEdicaoEntrega;
