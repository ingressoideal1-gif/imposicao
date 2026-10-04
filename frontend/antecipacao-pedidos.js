// Leitura isolada: não abre Pedido, não altera state e não envia impressão.
(function (raiz) {
    'use strict';
    const aprovados = new Set(['APROVADO', 'APROVADA', 'APROVADA_CLIENTE', 'LIBERADA', 'ARTE_APROVADA', 'ARTE APROVADA']);
    const normal = v => String(v || '').trim().toUpperCase();
    const canonico = v => Array.isArray(v) ? v.map(canonico) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
    async function digest(v) {
        const bytes = new TextEncoder().encode(JSON.stringify(canonico(v)));
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
            b => b.toString(16).padStart(2, '0')).join('');
    }
    async function linhas(cliente, tabela, colunas, ids, coluna, signal) {
        const unicos = [...new Set(ids.filter(v => v != null))], todas = [];
        for (let i = 0; i < unicos.length; i += 100) {
            for (let offset = 0; ; ) {
                if (signal.aborted) throw new Error('Coleta cancelada.');
                let query = cliente.from(tabela).select(colunas)
                    .in(coluna, unicos.slice(i, i + 100)).order(coluna, { ascending: true });
                if (['pedidos_modelos', 'produtos_proposta'].includes(tabela) && coluna !== 'id') {
                    query = query.order('id', { ascending: true });
                }
                if (tabela === 'propostas_os') query = query.order('data_termino', { ascending: true });
                const { data, error } = await query.range(offset, offset + 199).abortSignal(signal);
                if (error || !Array.isArray(data)) throw new Error('Não foi possível atualizar o catálogo do piloto.');
                if (!data.length) break;
                todas.push(...data); offset += data.length;
                if (todas.length > 4000) throw new Error('Catálogo excede o limite do piloto.');
            }
        }
        return todas;
    }
    function prazo(valor) {
        if (!valor) return null;
        if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(valor)) return null;
        const d = new Date(valor.length === 10 ? valor + 'T00:00:00' : valor);
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    function ordenar(itens, setor, agora = Date.now()) {
        const chave = i => [Number(normal(i.setor) !== normal(setor)),
            Number(!i.prazo || Date.parse(i.prazo) > agora + 86400000),
            i.prazo ? Date.parse(i.prazo) : Infinity];
        return [...itens].sort((a, b) => {
            const x = chave(a), y = chave(b);
            for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
            return String(a.modelo).localeCompare(String(b.modelo));
        });
    }
    function fontes(modelo, numeracao) {
        const saida = {}, extras = new Set();
        const frente = modelo.arte_url || modelo.url_arquivo_arte || modelo.url_arquivo;
        const verso = modelo.verso_arte_url || modelo.url_arquivo_arte_verso || modelo.verso_url_arquivo;
        if (typeof frente === 'string' && frente.startsWith('https://')) saida.frente = frente;
        if (typeof verso === 'string' && verso.startsWith('https://')) saida.verso = verso;
        let visitados = 0;
        function visitar(v) {
            if (++visitados > 100000) throw new Error('Recursos excedem o limite do piloto.');
            if (typeof v === 'string' && v.startsWith('https://')) extras.add(v);
            else if (Array.isArray(v)) v.forEach(visitar);
            else if (v && typeof v === 'object') Object.values(v).forEach(visitar);
        }
        visitar(numeracao);
        extras.delete(frente); extras.delete(verso);
        [...extras].sort().forEach((url, i) => { saida['recurso_' + i] = url; });
        if (Object.keys(saida).length > 256) throw new Error('Recursos excedem o limite do piloto.');
        return saida;
    }
    async function consultar({ cliente, propostas, empresa, setor = 'laser', signal, limite = 128, inicio = 0,
        receber, avancar }) {
        const sessao = await cliente.auth.getUser();
        if (sessao.error || !sessao.data?.user) throw new Error('Entre no painel para atualizar os pedidos locais.');
        if (!Array.isArray(raiz.SINAIS_NA_GRAFICA) || typeof raiz.pedidoNaGrafica !== 'function') {
            throw new Error('Fila de produção indisponível.');
        }
        const resposta = await propostas({ tipo: 'status', status: raiz.SINAIS_NA_GRAFICA }, 2001, 'consultar', signal);
        if (resposta.error || !Array.isArray(resposta.data)) throw new Error('Consulta de pedidos incompleta.');
        if (resposta.data.length > 2000) throw new Error('Pedidos excedem o limite do piloto.');
        const pedidos = resposta.data.filter(p => raiz.pedidoNaGrafica(p)
            && !raiz.pedidoJaPassouDaGrafica?.(p) && !raiz.pedidoIgnoradoNosPaineis?.(p));
        const ids = pedidos.map(p => p.id_int);
        const modelos = await linhas(cliente, 'pedidos_modelos', '*', ids, 'id_int', signal);
        const prazos = await linhas(cliente, 'propostas_os', 'id_int,data_termino', ids, 'id_int', signal);
        const produtos = await linhas(cliente, 'produtos_proposta', 'id,id_int,id_produto', ids, 'id_int', signal);
        const catalogo = await linhas(cliente, 'produtos', 'id_produto,setor_pcp', produtos.map(p => p.id_produto), 'id_produto', signal);
        const candidatos = modelos.filter(m => aprovados.has(normal(m.status_arte))
            && ['AGUARDANDO', 'PENDENTE', ''].includes(normal(m.status_impressao || m.status_producao)))
            .map(m => {
                const produto = produtos.find(p => String(p.id) === String(m.id_produto_proposta_origem)
                    && String(p.id_int) === String(m.id_int));
                const datas = prazos.filter(p => String(p.id_int) === String(m.id_int)).map(p => prazo(p.data_termino)).filter(Boolean).sort();
                return { modelo: String(m.id), linha: m, prazo: datas[0] || null,
                    setor: catalogo.find(p => String(p.id_produto) === String(produto?.id_produto ?? m.id_produto))?.setor_pcp || '' };
            });
        const ordenados = ordenar(candidatos, setor);
        const offset = ordenados.length ? inicio % ordenados.length : 0;
        const selecionados = ordenados.slice(offset, offset + limite), resultados = [];
        for (const [indice, item] of selecionados.entries()) {
            const proximo = offset + indice + 1 >= ordenados.length ? 0 : offset + indice + 1;
            const m = item.linha, numIds = [m.amostra_num_id || m.numeracao_id].filter(Boolean);
            const nums = await linhas(cliente, 'producao_numeracoes', '*', numIds, 'id', signal);
            if (nums.length !== numIds.length) throw new Error('Numeração incompleta na coleta.');
            const urls = fontes(m, nums);
            if (!Object.keys(urls).length) { avancar?.(proximo); continue; }
            const releitura = await linhas(cliente, 'pedidos_modelos', '*', [m.id], 'id', signal);
            const numerosAtuais = await linhas(cliente, 'producao_numeracoes', '*', numIds, 'id', signal);
            const original = await digest([m, nums]);
            if (releitura.length !== 1 || original !== await digest([releitura[0], numerosAtuais])) {
                throw new Error('Dados mudaram durante a coleta; nova tentativa no próximo ciclo.');
            }
            const candidato = { empresa, modelo: item.modelo, setor: item.setor, prazo: item.prazo,
                fontes: urls, observacao: { digest: original, aprovacao: normal(m.status_arte) } };
            if (signal.aborted) throw new Error('Coleta cancelada.');
            if (receber) await receber(candidato);
            resultados.push(candidato);
            avancar?.(proximo);
        }
        return { itens: resultados, candidatos: candidatos.length, limitados: candidatos.length > limite,
            proximo: offset + selecionados.length >= ordenados.length ? 0 : offset + selecionados.length };
    }
    raiz.AntecipacaoPedidos = { consultar, ordenar, fontes, prazo };
})(typeof window !== 'undefined' ? window : globalThis);
