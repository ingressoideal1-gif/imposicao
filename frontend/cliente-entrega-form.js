// Rascunho da entrega: sobrevive aos redesenhos e só vira dado do pedido após recibo.
let rascunhoEntrega = null;
let consultaEntrega = 0;
const CAMPOS_ENTREGA = ['recebedor', 'cpf_recebedor', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

function dadosDoFormularioEntrega() {
    if (!rascunhoEntrega) {
        const dados = window.portalDados || {};
        const anterior = dados.endereco || {};
        const fisica = dados.cliente && tipoDaPessoa(dados.cliente.documento) === 'fisica';
        rascunhoEntrega = { valores: {}, consultado: '', buscando: false, erro: '', anterior: dados.endereco || null };
        CAMPOS_ENTREGA.forEach(k => { rascunhoEntrega.valores[k] = String(anterior[k] || ''); });
        rascunhoEntrega.valores.recebedor ||= fisica ? dados.cliente.nome || '' : '';
        rascunhoEntrega.valores.cpf_recebedor ||= fisica ? dados.cliente.documento || '' : '';
        // O cliente digita o CEP para conferir o destino, mesmo havendo endereço cadastrado.
        if (window.portalConfirmacoes.entrega !== true) rascunhoEntrega.valores.cep = '';
    }
    return rascunhoEntrega;
}

function editarCampoEntrega(campo, valor) {
    if (!CAMPOS_ENTREGA.includes(campo) || window.portalGravandoConfirmacao
        || window.portalConfirmacoes.entrega === true || clienteState.pedidoFinalizado) return;
    const r = dadosDoFormularioEntrega();
    r.valores[campo] = valor;
    r.erro = '';
    if (campo === 'cep') {
        consultaEntrega++;
        r.consultado = '';
        r.buscando = false;
    }
}

function cpfDaEntregaValido(valor) {
    const cpf = String(valor || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let n = 9; n <= 10; n++) {
        let soma = 0;
        for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
        const digito = (soma * 10 % 11) % 10;
        if (digito !== Number(cpf[n])) return false;
    }
    return true;
}

async function buscarCepEntrega() {
    if (window.portalGravandoConfirmacao || window.portalConfirmacoes.entrega === true
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
        // Só o CEP é enviado ao serviço. Nome e CPF permanecem no pedido.
        const resposta = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: controller.signal });
        if (!resposta.ok) throw new Error('consulta');
        const endereco = await resposta.json();
        if (sequencia !== consultaEntrega) return;
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
    const bloqueado = confirmado || window.portalGravandoConfirmacao || clienteState.pedidoFinalizado;
    const rotulos = { recebedor: 'Recebedor', cpf_recebedor: 'CPF do recebedor', cep: 'CEP',
        endereco: 'Endereço', numero: 'Número (ou S/N)', complemento: 'Complemento (opcional)',
        bairro: 'Bairro', cidade: 'Cidade', uf: 'UF' };
    const limites = { recebedor: 150, cpf_recebedor: 14, cep: 9, endereco: 200, numero: 20,
        complemento: 150, bairro: 100, cidade: 100, uf: 2 };
    const campos = CAMPOS_ENTREGA.map(k => '<label style="display:block;margin:12px 0">'
        + escapeHtml(rotulos[k]) + '<input id="entrega-' + k + '" class="portal-caixa-de-texto" '
        + 'style="display:block;width:100%;box-sizing:border-box" type="text" maxlength="' + limites[k] + '" '
        + (['cep', 'cpf_recebedor'].includes(k) ? 'inputmode="numeric" ' : '')
        + (['cidade', 'uf'].includes(k) ? 'readonly ' : '')
        + 'value="' + escapeHtml(r.valores[k]) + '" oninput="editarCampoEntrega(\'' + k + '\',this.value)"></label>'
        + (k === 'cep' && !confirmado ? '<button type="button" class="portal-botao" onclick="buscarCepEntrega()" '
            + (r.buscando ? 'disabled' : '') + '>' + (r.buscando ? 'Consultando CEP...' : 'Buscar endereço pelo CEP') + '</button>' : '')).join('');
    return '<div class="portal-cartao"><h2>Endereço de entrega</h2>'
        + (!confirmado ? '<p>Digite o CEP, busque o endereço e complete os dados de quem vai receber. Informe rua e bairro se o CEP abranger toda a cidade.</p>' : '')
        + (r.anterior && r.anterior.cep && !confirmado ? '<p>CEP cadastrado: ' + escapeHtml(r.anterior.cep) + '</p>' : '')
        + '<fieldset style="border:0;padding:0;margin:0;min-width:0" ' + (bloqueado ? 'disabled' : '') + '>' + campos + '</fieldset>'
        + (r.erro ? '<p role="alert" class="portal-aviso atencao">' + escapeHtml(r.erro) + '</p>' : '') + '</div>';
}

async function persistirEnderecoEntrega() {
    const r = dadosDoFormularioEntrega();
    const valores = Object.fromEntries(CAMPOS_ENTREGA.map(k => [k, r.valores[k].trim()]));
    valores.cep = valores.cep.replace(/\D/g, '');
    valores.cpf_recebedor = valores.cpf_recebedor.replace(/\D/g, '');
    if (r.buscando || !r.consultado || r.consultado !== valores.cep)
        throw new Error('Digite o CEP e use Buscar endereço pelo CEP antes de confirmar.');
    if (!valores.recebedor || !cpfDaEntregaValido(valores.cpf_recebedor))
        throw new Error('Informe o nome do recebedor e um CPF válido.');
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

window.formularioEnderecoEntrega = formularioEnderecoEntrega;
window.persistirEnderecoEntrega = persistirEnderecoEntrega;
window.editarCampoEntrega = editarCampoEntrega;
window.buscarCepEntrega = buscarCepEntrega;
