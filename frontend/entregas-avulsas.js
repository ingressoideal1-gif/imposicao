/* Cadastro de destinos reutilizaveis e entregas fora do ERP. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const botao = $('ve-adicionar-entrega');
    if (!botao) return;
    const dialog = document.createElement('dialog');
    dialog.id = 've-avulsa';
    dialog.setAttribute('aria-labelledby', 've-avulsa-titulo');
    dialog.innerHTML = `<form id="ve-avulsa-form">
      <header class="ve-avulsa-topo">
        <span class="ve-avulsa-etiqueta">NOVA ENTREGA</span>
        <h2 id="ve-avulsa-titulo">Adicionar entrega</h2>
        <p>Escolha um local salvo ou informe o endereço de destino.</p>
      </header>
      <div class="ve-avulsa-conteudo">
        <section class="ve-avulsa-busca" aria-labelledby="ve-local-busca-titulo">
          <h3 id="ve-local-busca-titulo">Já entregou neste local?</h3>
          <label for="ve-local-busca">Buscar por nome ou CEP</label>
          <div class="ve-avulsa-busca-linha">
            <input id="ve-local-busca" maxlength="120" autocomplete="off" placeholder="Digite o nome do local ou CEP">
            <button class="btn btn-secondary" type="button" id="ve-local-pesquisar">Buscar locais</button>
          </div>
          <div id="ve-local-resultados"></div>
        </section>
        <div class="ve-avulsa-endereco-topo">
          <h3>Endereço da entrega</h3>
          <button class="btn btn-ghost" type="button" id="ve-local-novo">Usar novo local</button>
        </div>
        <fieldset id="ve-local-campos" aria-label="Local da entrega">
          <label class="ve-avulsa-largo">Nome do local<input id="ve-local-nome" required minlength="2" maxlength="120" placeholder="Ex.: Recepção da empresa"></label>
          <label class="ve-avulsa-cep">CEP
            <span class="ve-avulsa-cep-linha"><input id="ve-local-cep" required inputmode="numeric" maxlength="9" pattern="[0-9]{5}-?[0-9]{3}" placeholder="00000-000"><button class="btn btn-secondary" type="button" id="ve-local-consultar-cep">Consultar CEP</button></span>
          </label>
          <label class="ve-avulsa-numero">Número<input id="ve-local-numero" required maxlength="20" placeholder="Nº"></label>
          <label class="ve-avulsa-largo">Rua / avenida<input id="ve-local-logradouro" required minlength="2" maxlength="180" placeholder="Preenchida ao consultar o CEP"></label>
          <label class="ve-avulsa-metade">Complemento <span class="ve-avulsa-opcional">opcional</span><input id="ve-local-complemento" maxlength="120" placeholder="Sala, andar ou referência"></label>
          <label class="ve-avulsa-metade">Bairro<input id="ve-local-bairro" maxlength="120"></label>
          <label class="ve-avulsa-cidade">Cidade<input id="ve-local-cidade" required minlength="2" maxlength="120"></label>
          <label class="ve-avulsa-uf">UF<input id="ve-local-uf" required maxlength="2" pattern="[A-Za-z]{2}" placeholder="RS"></label>
        </fieldset>
      </div>
      <footer class="ve-avulsa-rodape">
        <p id="ve-avulsa-msg" role="status" aria-live="polite"></p>
        <div class="ve-avulsa-acoes">
          <button class="btn btn-ghost" type="button" id="ve-avulsa-cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" id="ve-avulsa-salvar">Adicionar entrega</button>
        </div>
      </footer>
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
