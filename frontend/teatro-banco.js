// Contrato do banco importado do teatro. Não altera mapas, modelos ou numerações.
(function (root) {
    'use strict';
    const ORIGEM = 'Mapa de Teatro';
    const HEADERS = ['Mapa', 'Mapa_ID', 'Revisao_Mapa', 'Setor', 'Setor_ID', 'Conjunto', 'Fila', 'Numero', 'Lugar', 'Bloco', 'Tipo', 'Posicao_X', 'Posicao_Y', 'Origem'];
    const canonico = v => Array.isArray(v) ? v.map(canonico) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
    const assinatura = v => JSON.stringify(canonico(v));
    const texto = v => String(v ?? '');
    const linhaDeMapa = r => !!r && (r.Origem === ORIGEM || !!(r.Mapa_ID && r.Setor_ID && r.Revisao_Mapa));
    function id(v) {
        if (typeof v !== 'string' || !v.trim() || v.startsWith('local_')) throw Error('O mapa e seus setores precisam ter IDs salvos.');
        return v;
    }
    async function revisao(mapa) {
        const bytes = new TextEncoder().encode(assinatura({ id: mapa.id, name: mapa.name, config: mapa.config }));
        const hash = await root.crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    function preparar(mapa, rev) {
        id(mapa?.id);
        if (!/^[a-f0-9]{64}$/.test(rev || '')) throw Error('Revisão do mapa inválida.');
        if (Object.keys(mapa.config?.cadeiras || {}).length) throw Error('Revise as cadeiras antigas sem setor antes de importar.');
        if (!Array.isArray(mapa.config?.setores)) throw Error('O mapa não tem setores cadastrados.');
        const ids = new Set();
        const tipos = new Map((mapa.config.tiposAssento || []).map(t => [t.id, t]));
        const setores = mapa.config.setores.map((s, idx) => {
            id(s.id);
            if (ids.has(s.id)) throw Error('Há IDs de setor repetidos no mapa.');
            ids.add(s.id);
            const nome = texto(s.nome || 'Setor ' + (idx + 1));
            const conjunto = texto(s.nomeConjunto || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Fila';
            const lugares = Object.entries(s.cadeiras || {}).filter(([, c]) => c && c.tipo !== 'Apagado' && !c.isErased).map(([key, c]) => {
                const xy = key.split(',');
                if (xy.length !== 2 || xy.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw Error('Posição inválida no setor ' + nome + '.');
                const fila = texto(c.prefixo ?? c.row_label), lugar = texto(c.num ?? c.col_label);
                if (!fila.trim() || !lugar.trim()) throw Error('Há lugar sem identificador de conjunto ou número no setor ' + nome + '.');
                return { key, x: Number(xy[0]), y: Number(xy[1]), fila, lugar, tipo: texto(c.tipo || 'Normal') };
            }).sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
            const grupos = new Map(), rotulos = new Set();
            for (const lugar of lugares) {
                const label = assinatura([lugar.fila, lugar.lugar]);
                if (rotulos.has(label)) throw Error('Lugar repetido no setor ' + nome + ': ' + lugar.fila + ' / ' + lugar.lugar + '.');
                rotulos.add(label);
                if (!grupos.has(lugar.fila)) grupos.set(lugar.fila, []);
                grupos.get(lugar.fila).push(lugar);
            }
            const rows = [];
            for (const [fila, lugaresDoGrupo] of grupos) {
                for (const p of lugaresDoGrupo) {
                    const sufixo = texto(tipos.get(p.tipo)?.sufixo).trim();
                    rows.push({ __id: assinatura([mapa.id, s.id, p.key]), Mapa: texto(mapa.name), Mapa_ID: mapa.id,
                        Revisao_Mapa: rev, Setor: nome, Setor_ID: s.id, Conjunto: conjunto, Fila: fila,
                        Numero: p.lugar + (sufixo ? ' ' + sufixo : ''), Lugar: p.lugar, Bloco: fila, Tipo: p.tipo,
                        Posicao_X: p.x, Posicao_Y: p.y, Origem: ORIGEM });
                }
            }
            return { id: s.id, nome, nomeConjunto: conjunto, quantidade: rows.length,
                blocos: [...grupos].map(([fila, ps]) => ({ fila, quantidade: ps.length })), rows,
                filename: 'mapa-teatro-' + rev + '-setor-' + (idx + 1) + '.csv', headers: HEADERS.slice() };
        });
        return { id: mapa.id, nome: texto(mapa.name), revisao: rev, setores,
            quantidade: setores.reduce((n, s) => n + s.quantidade, 0) };
    }
    function grupos(rows) {
        if (!Array.isArray(rows) || !rows.some(linhaDeMapa)) return null;
        const primeiro = rows[0], vistos = new Set(), blocos = [];
        for (const r of rows) {
            if (!r || r.Origem !== ORIGEM || !r.Mapa_ID || !r.Setor_ID || !/^[a-f0-9]{64}$/.test(r.Revisao_Mapa || '')
                || r.Mapa_ID !== primeiro.Mapa_ID || r.Setor_ID !== primeiro.Setor_ID || r.Revisao_Mapa !== primeiro.Revisao_Mapa
                || typeof r.Bloco !== 'string' || !r.Bloco.trim() || r.Bloco !== r.Fila || !texto(r.Numero).trim()) {
                throw Error('O banco do teatro está incompleto ou mistura setores. Importe novamente o setor.');
            }
            let bloco = blocos.at(-1);
            if (!bloco || bloco.fila !== r.Bloco) {
                if (vistos.has(r.Bloco)) throw Error('As linhas de um conjunto do teatro devem permanecer juntas no banco.');
                vistos.add(r.Bloco); bloco = { fila: r.Bloco, inicio: 0, quantidade: 0 };
                bloco.inicio = blocos.reduce((n, b) => n + b.quantidade, 0); blocos.push(bloco);
            }
            bloco.quantidade++;
        }
        return { mapaId: primeiro.Mapa_ID, setorId: primeiro.Setor_ID, revisao: primeiro.Revisao_Mapa,
            nomeMapa: primeiro.Mapa, nomeSetor: primeiro.Setor, nomeConjunto: primeiro.Conjunto || 'Fila', blocos };
    }
    function montarSets(modelos, poses) {
        const fontes = modelos.map(m => grupos(m.rows));
        if (!fontes.some(Boolean)) return null;
        if (fontes.some(f => !f)) throw Error('Combine o mapa de teatro somente com modelos que também leem setores de um mapa.');
        if (!Number.isSafeInteger(poses) || poses < 1) throw Error('Quantidade de poses inválida.');
        const blocos = [];
        modelos.forEach((m, idx) => {
            if (m.items.length !== m.rows.length) throw Error('A quantidade do modelo não corresponde aos lugares selecionados no banco do teatro.');
            fontes[idx].blocos.forEach(b => blocos.push({ items: m.items.slice(b.inicio, b.inicio + b.quantidade), fila: b.fila, modelo: idx }));
        });
        const sets = [];
        for (let inicio = 0; inicio < blocos.length; inicio += poses) {
            const lote = blocos.slice(inicio, inicio + poses), folhas = Math.max(...lote.map(b => b.items.length));
            const alocacoes = Array.from({ length: poses }, (_, i) => {
                const items = lote[i]?.items || [];
                return items.concat(Array(folhas - items.length).fill(null));
            });
            sets.push({ type: 'strict', num_sheets: folhas, cell_allocations: alocacoes, depth: 1, model_idx: null, teatro: true });
        }
        return sets;
    }
    function capa(rows, indice) {
        const fonte = grupos(rows);
        if (!fonte) return null;
        const bloco = fonte.blocos.find(b => indice >= b.inicio && indice < b.inicio + b.quantidade);
        if (!bloco) return null;
        return { titulo: fonte.nomeConjunto + ' ' + bloco.fila,
            detalhe: ' - ' + rows[bloco.inicio].Numero + ' a ' + rows[bloco.inicio + bloco.quantidade - 1].Numero + ' (' + bloco.quantidade + ' lugares)' };
    }
    function validarAssociacoes(plano, associacoes, itens, bloqueio) {
        const usados = new Set(), ativos = plano.setores.filter(s => s.quantidade);
        return ativos.map(s => {
            const modeloId = texto(associacoes[s.id]);
            const item = itens.find(i => texto(i.id) === modeloId);
            if (!item || /^vibe_item_|^local_/.test(modeloId)) throw Error('Escolha um modelo salvo para o setor ' + s.nome + '.');
            if (usados.has(modeloId)) throw Error('Cada setor precisa de um modelo diferente no pedido.');
            usados.add(modeloId);
            const impedimento = bloqueio?.(item);
            if (impedimento) throw Error(impedimento);
            if (Number(item.qtd ?? item.quantidade) !== s.quantidade) throw Error('O setor ' + s.nome + ' tem ' + s.quantidade + ' lugares, mas o modelo tem outra quantidade no ERP. Confira o pedido antes de associar.');
            return { setor: s, item };
        });
    }
    function bancoIgual(banco, setor) {
        return banco?.csv_filename === setor.filename && assinatura(banco.csv_headers) === assinatura(setor.headers)
            && assinatura(banco.csv_data) === assinatura(setor.rows);
    }
    async function importar(plano, associacoes, deps) {
        const alvos = validarAssociacoes(plano, associacoes, deps.itens(), deps.bloqueio);
        if (!alvos.length) throw Error('O mapa não tem lugares ativos para carregar.');
        let concluidos = 0;
        for (const { setor, item } of alvos) {
            deps.exigirAtivo();
            validarAssociacoes(plano, associacoes, deps.itens(), deps.bloqueio);
            let dados = await deps.consultar(); deps.exigirAtivo();
            let iguais = (dados.bancos || []).filter(b => bancoIgual(b, setor));
            if (iguais.length > 1) throw Error('Há mais de um banco idêntico para o setor ' + setor.nome + '. Confira os bancos do pedido.');
            let banco = iguais[0];
            if (!banco) {
                const resposta = await deps.chamar('criar', { id_int: deps.idInt, nome: (plano.nome + ' · ' + setor.nome).slice(0, 120),
                    csv_filename: setor.filename, csv_headers: setor.headers, csv_data: setor.rows, csv_url: '' });
                deps.exigirAtivo();
                if (!resposta.banco?.id) throw Error('A criação do banco não foi confirmada para ' + setor.nome + '.');
                dados = await deps.consultar(); deps.exigirAtivo();
                banco = (dados.bancos || []).find(b => texto(b.id) === texto(resposta.banco.id));
                if (!bancoIgual(banco, setor)) throw Error('Não foi possível conferir os lugares gravados no setor ' + setor.nome + '.');
            }
            let vinculo = (dados.vinculos || []).find(v => texto(v.modelo_id) === texto(item.id));
            if (texto(vinculo?.banco_id) !== texto(banco.id)) {
                validarAssociacoes(plano, associacoes, deps.itens(), deps.bloqueio);
                await deps.chamar('vincular', { id_int: deps.idInt, modelo_id: item.id, banco_id: banco.id, csv_mapa: null });
                deps.exigirAtivo();
                dados = await deps.consultar(); deps.exigirAtivo();
                vinculo = (dados.vinculos || []).find(v => texto(v.modelo_id) === texto(item.id));
                if (texto(vinculo?.banco_id) !== texto(banco.id)) throw Error('O vínculo do setor ' + setor.nome + ' não foi confirmado.');
            }
            if (item.csv_selecao) await deps.limparSelecao(item);
            deps.exigirAtivo(); deps.atualizar(dados);
            concluidos++; deps.progresso?.(concluidos, alvos.length);
        }
        return { setores: concluidos, lugares: plano.quantidade };
    }
    async function conferirMotor(formData, baseUrl, signal) {
        const payload = JSON.parse(formData.get('payload'));
        const numeracoes = payload.multi_artes?.length ? payload.multi_artes.map(a => a.numeracao) : [payload.numeracao];
        const fontes = numeracoes.map(n => grupos(n?.csv_data || []));
        if (!fontes.some(Boolean)) return;
        if (fontes.some(f => !f)) throw Error('Combine o mapa de teatro somente com modelos que também leem setores de um mapa.');
        for (const num of numeracoes) {
            if (!(num?.elements || []).some(el => /^TEATRO_(FILA|LUGAR|COMBO)$/.test(el.type))) throw Error('Escolha uma numeração com elementos de teatro para este setor.');
        }
        if (payload.schema !== 'cut_stack' || payload.cut_stack_mode !== 'strict_assembly') throw Error('O mapa exige modo Blocado com Montagem estrita.');
        const resposta = await root.fetch(baseUrl + '/api/version', { signal });
        const info = resposta.ok ? await resposta.json() : null;
        if (!info?.capabilities?.includes('mapa_teatro_blocos_v1')) throw Error('Atualize o NewProd desta estação para imprimir os blocos do mapa de teatro com quantidades diferentes.');
    }
    const api = { HEADERS, ORIGEM, linhaDeMapa, revisao, preparar, grupos, montarSets, capa, validarAssociacoes, bancoIgual, importar, conferirMotor };
    root.TeatroBanco = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
