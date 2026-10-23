(function () {
    'use strict';
    const URL_API = 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/idgen-interno';
    let montado = false, cliente = null, criacaoId = null, sequencia = 0;
    const el = id => document.getElementById(id);
    function texto(pai, tag, valor, classe) {
        const node = document.createElement(tag); node.textContent = valor;
        if (classe) node.className = classe;
        pai.appendChild(node); return node;
    }
    async function pedir(acao, dados = {}) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error('Entre no Imposition para acessar o IdGen.');
        const res = await fetch(URL_API, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
            body: JSON.stringify({ acao, dados }), signal: AbortSignal.timeout(30000),
        });
        let body;
        try { body = await res.json(); } catch { throw new Error('O serviço IdGen não respondeu. Tente novamente.'); }
        if (!res.ok) throw new Error(body.erro || 'Não foi possível acessar o IdGen.');
        return body;
    }
    function mensagem(msg) { el('idgen-mensagem').textContent = msg; }
    async function listar() {
        const turno = ++sequencia;
        try {
            const pedidos = await pedir('listar');
            if (turno !== sequencia) return;
            if (!Array.isArray(pedidos)) throw new Error('Lista de pedidos inválida.');
            const lista = el('idgen-pedidos'); lista.replaceChildren();
            if (!pedidos.length) texto(lista, 'p', 'Nenhum pedido IdGen cadastrado.');
            for (const p of pedidos) {
                const linha = texto(lista, 'div', '', 'card');
                texto(linha, 'h3', p.nome);
                texto(linha, 'p', 'Cliente ERP: ' + p.cliente_id);
                const abrir = texto(linha, 'button', 'Abrir pedido', 'btn btn-primary');
                abrir.type = 'button';
                abrir.onclick = async () => {
                    abrir.disabled = true;
                    try {
                        // A integração só é habilitada pelo adaptador específico. Nunca
                        // encaminhar UUID IdGen ao carregador de pedidos do ERP.
                        if (!window.IdGenEditor?.abrir) throw new Error('A abertura do editor IdGen ainda não está habilitada nesta versão.');
                        await window.IdGenEditor.abrir(p.id, pedir);
                    } catch (e) { mensagem(e.message); } finally { abrir.disabled = false; }
                };
            }
        } catch (e) { if (turno === sequencia) mensagem(e.message); }
    }
    function montar() {
        if (montado) return; montado = true;
        el('idgen-busca-form').onsubmit = async e => {
            e.preventDefault();
            const busca = el('idgen-busca').value.trim();
            if (busca.length < 2) return mensagem('Informe ao menos dois caracteres.');
            const botao = el('idgen-buscar'); botao.disabled = true;
            try {
                const clientes = await pedir('clientes', { busca });
                const lista = el('idgen-clientes'); lista.replaceChildren();
                for (const c of clientes) {
                    const b = texto(lista, 'button', (c.fantasia || c.nome) + ' — ' + c.id_cliente, 'btn btn-secondary');
                    b.type = 'button'; b.onclick = () => {
                        cliente = c; criacaoId = null;
                        el('idgen-cliente-selecionado').textContent = (c.fantasia || c.nome) + ' — ' + c.id_cliente;
                        el('idgen-criar').disabled = false;
                        lista.replaceChildren();
                    };
                }
                mensagem(clientes.length ? '' : 'Nenhum cliente encontrado.');
            } catch (e) { mensagem(e.message); } finally { botao.disabled = false; }
        };
        el('idgen-nome').oninput = () => { criacaoId = null; };
        el('idgen-criar-form').onsubmit = async e => {
            e.preventDefault(); if (!cliente) return mensagem('Selecione um cliente.');
            const nome = el('idgen-nome').value.trim(); if (!nome) return;
            const botao = el('idgen-criar'); botao.disabled = true;
            try {
                criacaoId ||= crypto.randomUUID();
                const p = await pedir('criar', { id: criacaoId, cliente_id: cliente.id_cliente, nome });
                if (p?.id !== criacaoId) throw new Error('O servidor não confirmou o pedido.');
                criacaoId = null; el('idgen-nome').value = '';
                mensagem('Pedido IdGen criado.'); await listar();
            } catch (e) { mensagem(e.message); } finally { botao.disabled = false; }
        };
        el('idgen-atualizar').onclick = listar;
    }
    window.IdGen = { pedir, async iniciar() { montar(); await listar(); } };
}());
