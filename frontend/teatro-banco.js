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
    const usa = num => num?.tipo === 'TEATRO' || (num?.csv_data || []).some(linhaDeMapa);
    function id(v) {
        if (typeof v !== 'string' || !v.trim() || v.startsWith('local_')) throw Error('O mapa e seus setores precisam ter IDs salvos.');
        return v;
    }
    async function revisao(mapa) {
        const calculo = root.MapaTeatroRevisao || (typeof module !== 'undefined' && module.exports ? require('./mapa-teatro-revisao.js') : null);
        if (!calculo) throw Error('O cálculo da revisão não carregou. Atualize a página.');
        return calculo.revisao(mapa.config);
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
        const ativos = modelos.map((m, i) => m.tipo === 'TEATRO' || !!fontes[i]);
        if (!ativos.some(Boolean)) return null;
        if (ativos.some(f => !f)) throw Error('Combine os modelos de teatro somente com outros modelos de teatro.');
        if (!Number.isSafeInteger(poses) || poses < 1) throw Error('Quantidade de poses inválida.');
        return modelos.map((m, idx) => {
            if (m.items.length !== m.rows.length) throw Error('A quantidade do modelo não corresponde aos lugares selecionados no banco do teatro.');
            if (!m.items.length) throw Error('O modelo de teatro não tem lugares para imprimir.');
            const folhas = Math.ceil(m.items.length / poses);
            const alocacoes = Array.from({ length: poses }, (_, p) => {
                const items = m.items.slice(p * folhas, (p + 1) * folhas);
                return items.concat(Array(folhas - items.length).fill(null));
            });
            const plano = { type: 'strict', num_sheets: folhas, cell_allocations: alocacoes, depth: 1, model_idx: idx, teatro: true };
            if (fontes[idx]) plano.cover_items = fontes[idx].blocos.map(b =>
                [m.items[b.inicio], m.items[b.inicio + b.quantidade - 1]]);
            return plano;
        });
    }
    function capa(rows, indice, folhas, descricao) {
        const fonte = grupos(rows);
        if (!fonte) return null;
        if (!Number.isSafeInteger(folhas) || folhas < 1 || indice < 0 || indice >= rows.length) return null;
        const bloco = fonte.blocos.find(b => indice >= b.inicio && indice < b.inicio + b.quantidade);
        const primeiro = rows[bloco.inicio], ultimo = rows[bloco.inicio + bloco.quantidade - 1];
        return { titulo: (descricao?.nomeConjunto || primeiro.Conjunto || 'Fila') + ' ' + primeiro.Fila,
            detalhe: ' - ' + (fonte.nomeSetor || 'Teatro') + ' - de ' + primeiro.Numero + ' a ' + ultimo.Numero
                + ' (' + bloco.quantidade + ' lugares)' };
    }
    function configurarMontagem(payload) {
        if (payload.schema === 'pdf_multiple') return false;
        const numeracoes = payload.multi_artes?.length ? payload.multi_artes.map(a => a.numeracao) : [payload.numeracao];
        const ativos = numeracoes.map(usa);
        if (!ativos.some(Boolean)) return false;
        if (ativos.some(f => !f)) throw Error('Combine os modelos de teatro somente com outros modelos de teatro.');
        // TEATRO determina a montagem; BLOCO comercial e limites de fila não a dividem.
        payload.schema = 'cut_stack';
        payload.cut_stack_mode = 'strict_assembly';
        return true;
    }
    function configurarTela(prefixo, numeracoes) {
        if (!numeracoes.length || !numeracoes.every(usa)) return false;
        for (const [campo, valor] of [['schema', 'cut_stack'], ['cutstack-mode', 'strict_assembly']]) {
            const input = root.document?.getElementById(prefixo + '-' + campo);
            if (input) input.value = valor;
        }
        return true;
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
        if (!configurarMontagem(payload)) return;
        const numeracoes = payload.multi_artes?.length ? payload.multi_artes.map(a => a.numeracao) : [payload.numeracao];
        for (const num of numeracoes) {
            if (num?.erro_mapa_teatro || num?.teatro_snapshot_erro) throw Error(num.erro_mapa_teatro || num.teatro_snapshot_erro);
            if (num?.mapa_teatro_snapshot_erp && !num.csv_data?.length) throw Error('O snapshot do mapa não tem lugares para imprimir.');
            if (num?.mapa_teatro_snapshot_erp && num.csv_data.length !== num.mapa_teatro_quantidade) throw Error('Use todos os lugares do snapshot do mapa, sem seleção parcial.');
            if (num?.teatro_modelo) {
                const aviso = await root.TeatroSnapshot.conferir(num, async id => {
                    const cliente = typeof supabaseClient !== 'undefined' ? supabaseClient : root.supabaseClient;
                    if (cliente) {
                        const { data, error } = await cliente.from('producao_mapas_teatro').select('id,config').eq('id', id).single();
                        if (error) throw Error('Não foi possível conferir o mapa atual antes da geração.');
                        return data;
                    }
                    return root.api('GET', '/mapas_teatro/' + encodeURIComponent(id));
                });
                if (aviso) root.toast?.(aviso, 'warning');
            }
            grupos(num?.csv_data || []);
            if (!(num?.elements || []).some(el => /^TEATRO_(FILA|LUGAR|COMBO)$/.test(el.type))) throw Error('Escolha uma numeração com elementos de teatro para este setor.');
        }
        const resposta = await root.fetch(baseUrl + '/api/version', { signal });
        const info = resposta.ok ? await resposta.json() : null;
        if (!info?.capabilities?.includes('teatro_vertical_modelo_v1')) throw Error('Atualize o NewProd desta estação para imprimir TEATRO com preenchimento vertical por modelo.');
        if (payload.formato?.has_cover && numeracoes.some(n => grupos(n?.csv_data || []))
                && !info?.capabilities?.includes('teatro_capas_fila_v1')) throw Error('Atualize o NewProd desta estação para gerar uma capa por conjunto do mapa de teatro.');
        if (numeracoes.some(n => n?.teatro_modelo) && !info?.capabilities?.includes('teatro_snapshot_v1')) throw Error('Atualize o NewProd desta estação para gerar pelos snapshots do ERP.');
        if (payload.formato?.has_cover && numeracoes.some(n => n?.teatro_modelo)
                && !info?.capabilities?.includes('teatro_capa_descricao_atual_v1')) throw Error('Atualize o NewProd desta estação para usar a descrição editada nas capas dos mapas do ERP.');
        formData.set('payload', JSON.stringify(payload));
    }
    const api = { HEADERS, ORIGEM, linhaDeMapa, usa, revisao, preparar, grupos, montarSets, capa, configurarMontagem, configurarTela, validarAssociacoes, bancoIgual, importar, conferirMotor };
    root.TeatroBanco = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
