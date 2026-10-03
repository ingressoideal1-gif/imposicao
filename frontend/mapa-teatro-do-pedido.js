// Seleção e associação de mapas aos modelos existentes do pedido.
(function (root) {
    'use strict';
    let fecharAtual;
    const normalizar = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function abrir(deps) {
        if (fecharAtual && fecharAtual() === false) return;
        const foco = document.activeElement;
        const overlay = document.createElement('div');
        overlay.id = 'mapa-teatro-pedido-popup';
        overlay.style.cssText = 'position:fixed;inset:0;background:#0009;z-index:1000000;display:flex;align-items:center;justify-content:center;padding:20px';
        const painel = document.createElement('section');
        painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true');
        painel.setAttribute('aria-labelledby', 'mapa-teatro-pedido-titulo');
        painel.style.cssText = 'background:var(--card-bg,#161e2e);color:var(--text,#fff);border:1px solid var(--border,#455);border-radius:12px;padding:24px;width:780px;max-width:100%;max-height:90vh;overflow:auto';
        overlay.append(painel);
        const el = (tag, text, parent = painel) => {
            const n = document.createElement(tag); if (text !== undefined) n.textContent = text;
            if (tag === 'input' || tag === 'select') n.className = 'form-control';
            parent.append(n); return n;
        };
        el('h2', 'Mapa de Teatro').id = 'mapa-teatro-pedido-titulo';
        el('p', 'Associe cada setor a um modelo existente. Cada fila, mesa ou outro conjunto será um bloco com sua quantidade exata de lugares.');
        const labelBusca = el('label', 'Pesquisar mapa');
        const busca = el('input', undefined, labelBusca); busca.type = 'search'; busca.placeholder = 'Nome do mapa';
        busca.id = 'mapa-teatro-pedido-busca';
        const labelMapa = el('label', 'Mapa cadastrado');
        const select = el('select', undefined, labelMapa); select.id = 'mapa-teatro-pedido-select';
        const setores = el('div'); setores.id = 'mapa-teatro-pedido-setores';
        const nota = el('p', 'O banco escolhido em “Vem de:” será substituído pelo banco do setor. Configure os elementos de numeração de teatro. A montagem TEATRO calcula as folhas pela quantidade do modelo dividida pelas posições do formato e preenche os lugares verticalmente. Filas e mesas não dividem a pilha de impressão.');
        nota.style.cssText = 'color:var(--text-dim,#aab);font-size:.9rem';
        const mensagem = el('p', 'Carregando mapas…'); mensagem.setAttribute('role', 'status');
        mensagem.id = 'mapa-teatro-pedido-status'; mensagem.setAttribute('aria-live', 'polite');
        const botoes = el('div'); botoes.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;margin-top:20px';
        const cancelar = el('button', 'Cancelar', botoes); cancelar.className = 'btn btn-secondary';
        const concluir = el('button', 'Carregar mapa', botoes); concluir.className = 'btn btn-primary'; concluir.disabled = true;
        for (const n of [busca, select]) n.style.cssText = 'display:block;width:100%;margin:8px 0 16px;padding:10px';
        let aberto = true, ocupado = false, token = 0, mapas = [], plano = null, carregados = 0;
        const associacoes = {};
        const exigirAtivo = () => {
            if (!aberto || !deps.ativo()) throw Error('O pedido mudou. Reabra o mapa no pedido correto.');
        };
        const fechar = () => {
            if (ocupado) return false;
            aberto = false; ++token; overlay.remove();
            document.removeEventListener('keydown', teclado);
            if (fecharAtual === fechar) fecharAtual = null;
            if (foco?.isConnected) foco.focus();
            return true;
        };
        function teclado(e) {
            if (e.key === 'Escape') { e.preventDefault(); fechar(); }
            if (e.key === 'Tab') {
                const controles = [...painel.querySelectorAll('input,select,button')].filter(n => !n.disabled);
                if (!controles.length) return;
                const primeiro = controles[0], ultimo = controles.at(-1);
                if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
                if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
            }
        }
        function filtrar() {
            const escolhido = select.value;
            select.replaceChildren();
            el('option', 'Selecione um mapa', select).value = '';
            mapas.filter(m => normalizar(m.name).includes(normalizar(busca.value))).forEach(m => {
                el('option', m.name || 'Mapa sem nome', select).value = m.id;
            });
            select.value = escolhido;
            if (!select.value && plano) { plano = null; setores.replaceChildren(); concluir.disabled = true; }
        }
        async function selecionar() {
            const minhaVez = ++token, id = select.value;
            plano = null; carregados = 0; setores.replaceChildren(); concluir.disabled = true;
            for (const k of Object.keys(associacoes)) delete associacoes[k];
            if (!id) { mensagem.textContent = 'Selecione um mapa.'; return; }
            mensagem.textContent = 'Lendo os setores e lugares salvos…';
            try {
                const mapa = await deps.lerMapa(id);
                const rev = await root.TeatroBanco.revisao(mapa);
                exigirAtivo(); if (minhaVez !== token || select.value !== id) return;
                plano = root.TeatroBanco.preparar(mapa, rev);
                for (const setor of plano.setores) {
                    const card = el('div', undefined, setores);
                    card.style.cssText = 'border:1px solid var(--border,#455);border-radius:8px;margin:12px 0;padding:14px';
                    el('strong', setor.nome + ' — ' + setor.quantidade + ' lugares', card);
                    el('p', setor.blocos.map(b => setor.nomeConjunto + ' ' + b.fila + ': ' + b.quantidade).join(' · ') || 'Sem lugares ativos; este setor não será importado.', card);
                    if (!setor.quantidade) continue;
                    const label = el('label', 'Modelo do pedido', card), modelos = el('select', undefined, label);
                    modelos.dataset.setorId = setor.id; modelos.style.cssText = 'display:block;width:100%;padding:10px;margin-top:8px';
                    el('option', 'Selecione um modelo existente', modelos).value = '';
                    for (const item of deps.itens()) {
                        const q = Number(item.qtd ?? item.quantidade);
                        const impedimento = deps.bloqueio(item);
                        const op = el('option', (item.nome || item.descricao || 'Modelo ' + item.id) + ' — ' + q + ' unidades' + (impedimento ? ' (bloqueado)' : q !== setor.quantidade ? ' (quantidade diferente)' : ''), modelos);
                        op.value = String(item.id); op.disabled = !!impedimento || q !== setor.quantidade;
                    }
                    modelos.onchange = () => { associacoes[setor.id] = modelos.value; mensagem.textContent = ''; };
                }
                concluir.disabled = !plano.quantidade;
                mensagem.textContent = plano.quantidade + ' lugares. Escolha um modelo diferente, com quantidade correspondente, para cada setor.';
            } catch (e) {
                if (aberto && minhaVez === token) mensagem.textContent = e.message;
            }
        }
        concluir.onclick = async () => {
            if (!plano || ocupado) return;
            try {
                exigirAtivo();
                root.TeatroBanco.validarAssociacoes(plano, associacoes, deps.itens(), deps.bloqueio);
                ocupado = true;
                painel.querySelectorAll('input,select,button').forEach(n => n.disabled = true);
                mensagem.textContent = 'Conferindo o mapa antes de carregar…';
                const atualizado = await deps.lerMapa(plano.id);
                const rev = await root.TeatroBanco.revisao(atualizado); exigirAtivo();
                if (rev !== plano.revisao || atualizado.name !== plano.nome) throw Error('O mapa foi alterado. Selecione-o novamente antes de carregar.');
                const resultado = await root.TeatroBanco.importar(plano, associacoes, {
                    ...deps, exigirAtivo,
                    progresso(n, total) { carregados = n; mensagem.textContent = n + ' de ' + total + ' setores conferidos e associados.'; }
                });
                exigirAtivo(); await deps.concluido(resultado); ocupado = false; fechar();
            } catch (e) {
                ocupado = false;
                if (aberto) {
                    painel.querySelectorAll('input,select,button').forEach(n => n.disabled = false);
                    // Reaplica as opções bloqueadas após liberar os controles.
                    setores.querySelectorAll('select').forEach(n => [...n.options].forEach(o => {
                        const item = deps.itens().find(i => String(i.id) === o.value);
                        const setor = plano?.setores.find(s => s.id === n.dataset.setorId);
                        if (item) o.disabled = !!deps.bloqueio(item) || Number(item.qtd ?? item.quantidade) !== setor?.quantidade;
                    }));
                    mensagem.textContent = (carregados ? carregados + ' setores concluídos. ' : '') + e.message + ' Os bancos já gravados serão reaproveitados ao tentar novamente.';
                }
            }
        };
        cancelar.onclick = fechar; busca.oninput = filtrar; select.onchange = selecionar;
        document.body.append(overlay); document.addEventListener('keydown', teclado); fecharAtual = fechar; busca.focus();
        deps.listarMapas().then(dados => {
            exigirAtivo(); mapas = dados; filtrar(); mensagem.textContent = mapas.length ? 'Selecione um mapa.' : 'Nenhum mapa cadastrado disponível.';
        }).catch(e => { if (aberto) mensagem.textContent = e.message; });
    }
    root.MapaTeatroDoPedido = { abrir };
})(typeof window !== 'undefined' ? window : globalThis);
