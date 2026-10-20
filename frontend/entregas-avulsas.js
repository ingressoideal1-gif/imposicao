/* Cadastro de destinos reutilizaveis e entregas fora do ERP. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const botao = $('ve-adicionar-entrega');
    if (!botao) return;
    const dialog = document.createElement('dialog');
    dialog.id = 've-avulsa';
    dialog.innerHTML = `<form id="ve-avulsa-form">
      <h2>Adicionar entrega</h2>
      <p>Use um local salvo ou cadastre um novo endereço. Esta entrega não cria um pedido no ERP.</p>
      <label>Buscar local salvo (nome ou CEP)<input id="ve-local-busca" maxlength="120" autocomplete="off"></label>
      <button type="button" id="ve-local-pesquisar">Buscar locais</button>
      <div id="ve-local-resultados"></div><button type="button" id="ve-local-novo">Usar novo local</button>
      <fieldset id="ve-local-campos"><legend>Local da entrega</legend>
        <label>Nome do local<input id="ve-local-nome" required minlength="2" maxlength="120"></label>
        <label>CEP<input id="ve-local-cep" required inputmode="numeric" maxlength="9" pattern="[0-9]{5}-?[0-9]{3}"></label>
        <button type="button" id="ve-local-consultar-cep">Consultar CEP</button>
        <label>Número<input id="ve-local-numero" required maxlength="20"></label>
        <label>Rua / avenida<input id="ve-local-logradouro" required minlength="2" maxlength="180"></label>
        <label>Complemento<input id="ve-local-complemento" maxlength="120"></label>
        <label>Bairro<input id="ve-local-bairro" maxlength="120"></label>
        <label>Cidade<input id="ve-local-cidade" required minlength="2" maxlength="120"></label>
        <label>UF<input id="ve-local-uf" required maxlength="2" pattern="[A-Za-z]{2}"></label>
      </fieldset>
      <p id="ve-avulsa-msg" role="status" aria-live="polite"></p>
      <button type="submit" id="ve-avulsa-salvar">Adicionar entrega</button>
      <button type="button" id="ve-avulsa-cancelar">Cancelar</button>
    </form>`;
    $('view-entregas').append(dialog);
    const campos = ['nome','cep','numero','logradouro','complemento','bairro','cidade','uf'];
    let local = null, operacao = null, geracao = 0, pesquisa = 0, consultaCep = 0, salvando = false;
    const podeEditar = () => window.EntregasAcesso?.editar === true;
    const msg = texto => { $('ve-avulsa-msg').textContent = texto; };
    async function rpc(nome, args) {
        if (!podeEditar()) throw Error('Seu acesso permite somente consultar.');
        const c = typeof vibeClient !== 'undefined' ? vibeClient : null;
        if (!c) throw Error('Entre novamente no Imposition.');
        const { data, error } = await c.rpc(nome, args);
        if (error) throw Error(error.message || 'Não foi possível salvar. Tente novamente.');
        if (data == null) throw Error('Servidor não confirmou a operação.');
        return data;
    }
    function limpar() {
        geracao++; pesquisa++; consultaCep++;
        dialog.close(); $('ve-avulsa-form').reset();
        $('ve-local-resultados').replaceChildren(); $('ve-local-campos').disabled = false;
        local = null; operacao = null; msg('');
    }
    window.EntregasAvulsas = { limpar };
    botao.onclick = () => {
        if (!podeEditar() || salvando) return;
        limpar(); operacao = crypto.randomUUID(); dialog.showModal();
        $('ve-local-busca').focus();
    };
    $('ve-avulsa-cancelar').onclick = () => { if (!salvando) limpar(); };
    dialog.addEventListener('cancel', e => { if (salvando) e.preventDefault(); else limpar(); });
    $('ve-local-novo').onclick = () => {
        if (salvando) return;
        pesquisa++; consultaCep++; local = null; $('ve-local-campos').disabled = false;
        campos.forEach(c => { $('ve-local-'+c).value = ''; }); msg('Informe o nome, CEP e número.'); $('ve-local-nome').focus();
    };
    $('ve-local-pesquisar').onclick = async () => {
        if (salvando) return;
        const turno = geracao, id = ++pesquisa;
        $('ve-local-resultados').replaceChildren(); msg('Buscando locais…');
        try {
            const locais = await rpc('ve_admin_buscar_locais', { p_busca: $('ve-local-busca').value.trim(), p_offset: 0 });
            if (turno !== geracao || id !== pesquisa || !podeEditar()) return;
            for (const item of locais.slice(0,20)) {
                const b = document.createElement('button'); b.type = 'button';
                b.textContent = `${item.nome} · ${item.logradouro}, ${item.numero} · ${item.cidade}/${item.uf}`;
                b.onclick = () => {
                    if (salvando || !podeEditar()) return;
                    consultaCep++; local = item.id;
                    campos.forEach(c => { $('ve-local-'+c).value = item[c] || ''; });
                    $('ve-local-campos').disabled = true; msg('Local selecionado. Confira o endereço e adicione a entrega.');
                };
                $('ve-local-resultados').append(b);
            }
            msg(locais.length > 20 ? 'Mostrando 20 locais. Refine a busca pelo nome ou CEP.' : locais.length ? 'Selecione o local desejado.' : 'Nenhum local encontrado. Cadastre um novo endereço.');
        } catch (e) { if (turno === geracao && id === pesquisa) msg(e.message); }
    };
    $('ve-local-cep').oninput = () => {
        consultaCep++;
        for (const c of ['logradouro','bairro','cidade','uf']) $('ve-local-'+c).value = '';
    };
    $('ve-local-consultar-cep').onclick = async () => {
        const cep = $('ve-local-cep').value.replace(/\D/g,'');
        if (!/^\d{8}$/.test(cep)) { msg('Informe um CEP com 8 dígitos.'); return; }
        const turno = geracao, id = ++consultaCep; msg('Consultando CEP…');
        try {
            const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(10000) });
            if (!r.ok) throw Error('Consulta de CEP indisponível. Preencha o endereço e confira antes de salvar.');
            const data = await r.json();
            if (turno !== geracao || id !== consultaCep || !podeEditar() || local) return;
            if (data.erro) throw Error('CEP não encontrado. Confira o número informado.');
            for (const [campo, origem] of [['logradouro','logradouro'],['bairro','bairro'],['cidade','localidade'],['uf','uf']]) $('ve-local-'+campo).value = data[origem] || '';
            msg(data.logradouro ? 'Endereço localizado. Confira e informe o número.' : 'CEP geral: informe a rua e o número.');
        } catch (e) { if (turno === geracao && id === consultaCep) msg(e.name === 'TimeoutError' ? 'Consulta demorou. Tente novamente ou preencha o endereço.' : e.message); }
    };
    $('ve-avulsa-form').onsubmit = async e => {
        e.preventDefault();
        if (salvando || !podeEditar()) return;
        const turno = geracao;
        const dados = local ? null : Object.fromEntries(campos.map(c => [c,$('ve-local-'+c).value.trim()]));
        salvando = true; $('ve-avulsa-salvar').disabled = true; msg('Adicionando entrega…');
        try {
            const r = await rpc('ve_admin_criar_avulsa', { p_operacao: operacao, p_local: local, p_dados: dados });
            if (r.confirmado !== true || !r.id) throw Error('Entrega não confirmada. Tente novamente.');
            if (turno !== geracao || !podeEditar()) return;
            limpar();
            $('ve-busca').value = `AV-${r.numero}`; $('ve-status').value = 'disponivel';
            if (window.EntregasModalidade) window.EntregasModalidade.atual = 'todas';
            document.querySelectorAll('[data-ve-modalidade]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.veModalidade === 'todas')));
            await window.EntregasPainel?.abrir();
            $('ve-mensagem').textContent = `Entrega AV-${r.numero} adicionada. Selecione o entregador para incluí-la em uma rota.`;
        } catch (e) { if (turno === geracao) msg(e.message); }
        finally { salvando = false; $('ve-avulsa-salvar').disabled = false; }
    };
})();
