(function () {
    'use strict';
    const contexto = window.IDGEN_CONTEXTO;
    const chave = contexto ? 'idgen_' + contexto.id : null;
    let sessao, catalogo, pronto = false;
    const clonar = v => structuredClone(v);
    const doc = () => sessao.pedido.documento;
    const node = (tag, texto, pai) => { const e = document.createElement(tag); e.textContent = texto; if (pai) pai.appendChild(e); return e; };
    const erro = e => { toast(e.message || String(e), 'error'); };
    function pedido(osId) {
        if (!pronto || String(osId) !== chave) return null;
        return { id: chave, numero: 'IdGen ' + contexto.id.slice(0, 8), cliente: sessao.pedido.cliente_nome || 'Cliente ERP ' + sessao.pedido.cliente_id,
            id_cliente: sessao.pedido.cliente_id, status: 'Em Arte', _source: 'idgen' };
    }
    function sincronizar() {
        if (!sessao?.pedido) return;
        const d = doc();
        for (const tipo of ['formatos', 'cores', 'numeracoes']) state[tipo] = clonar(d[tipo] || []);
        state.numeracoes.forEach(normalizarNumeracaoLida);
        const antigos = state.osItens[chave] || [];
        state.osItens[chave] = d.modelos.map(m => {
            const item = antigos.find(i => i.id === m.id) || {};
            for (const k of Object.keys(item)) delete item[k];
            Object.assign(item, clonar(m), { _source: 'idgen', _dbLoaded: true, id_int: contexto.id });
            const num = state.numeracoes.find(n => n.id === m.amostra_num_id);
            const versoTipo = VersoDoModelo.doModo(num?.print_mode);
            if (versoTipo) {
                item.verso_tipo = versoTipo;
                item.frente_verso = VersoDoModelo.temVerso(versoTipo);
            }
            item.numeracao_id = item.amostra_num_id;
            item.num_inicial = item.numeracao_inicio ?? item.num_inicial ?? 1;
            item.num_final = item.numeracao_fim ?? item.num_final;
            return item;
        });
        state.bancosDoPedido = clonar(d.bancos || []);
        state.vinculosDeBanco = Object.fromEntries((d.vinculos || []).map(v => [v.modelo_id, clonar(v)]));
        state._bancosPedidoDe = chave;
    }
    async function alterar(mudar) {
        try { const r = await sessao.alterar(mudar); sincronizar(); return r; }
        catch (e) { sincronizar(); throw e; }
    }
    async function salvar(itemId, osId, patch) {
        if (!pedido(osId)) throw new Error('Template IdGen não está aberto.');
        const item = doc().modelos.find(m => m.id === itemId);
        if (!item) throw new Error('Modelo não pertence ao template IdGen.');
        if (item.amostra_status === 'APROVADA') throw new Error('Lote aprovado: edição bloqueada.');
        const dados = clonar(patch);
        delete dados._isExplicitRemove;
        if ('amostra_num_id' in dados) {
            const num = doc().numeracoes.find(n => n.id === dados.amostra_num_id);
            if (dados.amostra_num_id && !num) throw new Error('Numeração não pertence ao template IdGen.');
            dados.numeracao = num?.name || '';
        }
        const numAtual = doc().numeracoes.find(n => n.id === ('amostra_num_id' in dados ? dados.amostra_num_id : item.amostra_num_id));
        const versoTipo = VersoDoModelo.doModo(numAtual?.print_mode);
        if (versoTipo) Object.assign(dados, { verso_tipo: versoTipo, frente_verso: VersoDoModelo.temVerso(versoTipo) });
        if (dados.amostra_cor_id && !doc().cores.some(c => c.id === dados.amostra_cor_id)) throw new Error('Cor não pertence ao template IdGen.');
        try { await sessao.salvarModelo(itemId, dados); sincronizar(); return { confirmado: true }; }
        catch (e) {
            sincronizar();
            if (document.getElementById('view-amostras')?.classList.contains('active')) desenhar();
            throw e;
        }
    }
    async function campo(itemId, osId, field, value) {
        const aliases = { num_inicial: 'numeracao_inicio', num_final: 'numeracao_fim', numeracao_id: 'amostra_num_id', qtd: 'quantidade', c_ini: 'C_INI', q_cam: 'Q_CAM', l_cam: 'L_CAM' };
        const nome = aliases[field] || field;
        if (['numeracao_inicio', 'numeracao_fim', 'quantidade', 'C_INI', 'Q_CAM', 'L_CAM'].includes(nome)) {
            value = Number(value); if (!Number.isSafeInteger(value) || value < 0) throw new Error('Informe um número inteiro válido.');
        }
        return salvar(itemId, osId, { [nome]: value, ...(nome === 'quantidade' ? { qtd: value } : {}) });
    }
    async function api(method, path, body) {
        const [, tipo, id] = path.split('/');
        if (method === 'GET' && tipo === 'saidas') return clonar(catalogo.saidas);
        if (!['formatos', 'cores', 'numeracoes'].includes(tipo)) throw new Error('Cadastro indisponível no editor IdGen.');
        const lista = doc()[tipo] || [];
        if (method === 'GET') {
            const registros = clonar(lista);
            if (tipo === 'numeracoes') registros.forEach(normalizarNumeracaoLida);
            return id ? registros.find(x => String(x.id) === id) : registros;
        }
        if (!['POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Operação inválida.');
        const alvo = id || crypto.randomUUID();
        await alterar(d => {
            const arr = d[tipo], index = arr.findIndex(x => String(x.id) === alvo);
            if (method !== 'POST' && index < 0) throw new Error('Cadastro não pertence ao template IdGen.');
            if (method === 'DELETE') {
                if (d.modelos.some(m => [m.formato_id, m.amostra_cor_id, m.amostra_num_id].includes(alvo))) throw new Error('Cadastro em uso neste pedido.');
                arr.splice(index, 1);
            } else {
                const registro = { ...(index >= 0 ? arr[index] : {}), ...clonar(body), id: alvo };
                if (index >= 0) arr[index] = registro; else arr.push(registro);
                if (tipo === 'numeracoes' && registro.print_mode) {
                    const verso = VersoDoModelo.doModo(registro.print_mode);
                    for (const m of d.modelos.filter(m => m.amostra_num_id === alvo)) {
                        m.verso_tipo = verso; m.frente_verso = VersoDoModelo.temVerso(verso);
                    }
                }
            }
        });
        return clonar(doc()[tipo].find(x => x.id === alvo) || {});
    }
    async function arquivo(content, name = 'arquivo.bin') {
        if (!content) return '';
        let blob;
        if (typeof content === 'string' && /^(data:|https:)/.test(content)) {
            const response = await fetch(content); if (!response.ok) throw new Error('Não foi possível ler o arquivo.');
            blob = await response.blob();
        } else if (content instanceof Blob) blob = content;
        else {
            const ext = name.split('.').pop().toLowerCase();
            const mime = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', csv: 'text/csv', json: 'application/json' }[ext] || 'application/octet-stream';
            blob = new Blob([content], { type: mime });
        }
        if (blob.size > 5 * 1024 * 1024) throw new Error('Este editor aceita arquivos de até 5 MB.');
        return new Promise((resolve, reject) => {
            const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Falha ao ler o arquivo.')); r.readAsDataURL(blob);
        });
    }
    async function bancos(acao, corpo) {
        if (String(corpo.id_int) !== contexto.id) throw new Error('Banco de dados não pertence ao template IdGen.');
        if (acao === 'consultar') return { bancos: clonar(doc().bancos || []), vinculos: clonar(doc().vinculos || []) };
        let resultado;
        await alterar(d => {
            d.bancos ||= []; d.vinculos ||= [];
            if (acao === 'criar') {
                const b = { ...clonar(corpo), id: crypto.randomUUID() }; d.bancos.push(b); resultado = { banco: b };
            } else if (acao === 'vincular') {
                if (!d.modelos.some(m => m.id === corpo.modelo_id)) throw new Error('Modelo inválido.');
                if (corpo.banco_id && !d.bancos.some(b => b.id === corpo.banco_id)) throw new Error('Banco inválido.');
                d.vinculos = d.vinculos.filter(v => v.modelo_id !== corpo.modelo_id);
                const v = corpo.banco_id ? clonar(corpo) : null; if (v) d.vinculos.push(v); resultado = { vinculo: v };
            } else {
                const index = d.bancos.findIndex(b => b.id === corpo.banco_id);
                if (index < 0) throw new Error('Banco inválido.');
                if (acao === 'excluir') {
                    if (d.vinculos.some(v => v.banco_id === corpo.banco_id)) throw new Error('Banco em uso.');
                    d.bancos.splice(index, 1); resultado = {};
                } else if (acao === 'atualizar') {
                    for (const k of ['nome', 'csv_filename', 'csv_headers', 'csv_data', 'csv_url']) if (k in corpo) d.bancos[index][k] = clonar(corpo[k]);
                    resultado = { banco: d.bancos[index] };
                } else throw new Error('Operação inválida.');
            }
        });
        return resultado;
    }
    function ajustarTela() {
        doc().modelos.forEach((modelo, idx) => {
            const header = document.getElementById('amostra-item-num-' + idx)?.closest('.card')?.querySelector('.card-header');
            if (!header || header.querySelector('[data-idgen-excluir]')) return;
            const b = node('button', 'Excluir modelo', header);
            b.type = 'button'; b.className = 'btn btn-secondary'; b.dataset.idgenExcluir = modelo.id;
            b.disabled = modelo.amostra_status === 'APROVADA';
            b.onclick = async () => {
                if (!confirm('Excluir o modelo "' + (modelo.nome_modelo || modelo.produto || 'Sem nome') + '" deste template IdGen? Esta ação não pode ser desfeita pela tela.')) return;
                b.disabled = true;
                try {
                    await sessao.excluirModelo(modelo.id);
                    sincronizar(); desenhar(); toast('Modelo excluído do template IdGen.', 'success');
                } catch (e) { erro(e); b.disabled = false; }
            };
        });
        // Fluxos comerciais do ERP não fazem parte de um template IdGen.
        const banner = document.getElementById('amostras-os-banner');
        for (const b of banner?.querySelectorAll('button') || []) {
            const acao = b.getAttribute('onclick') || '';
            if (/clearAmostrasOS/.test(acao)) { b.textContent = '← Templates IdGen'; b.onclick = sair; }
            else if (!/^exportarPdf/.test(acao) && b.id !== 'btn-import-pdf-arte') b.hidden = true;
        }
        banner?.querySelectorAll('.banner-grupo').forEach(g => {
            const botoes = [...g.querySelectorAll('button')];
            if (botoes.length && botoes.every(b => b.hidden)) g.hidden = true;
        });
        const vibe = document.getElementById('amostras-os-vibe'); if (vibe) vibe.replaceChildren();
        document.querySelectorAll('#amostras-itens-container button[onclick]').forEach(b => {
            if (/APROVADA|enviarParaImposicao|adicionarAoPedido/.test(b.getAttribute('onclick'))) b.hidden = true;
        });
        document.getElementById('ultimos-pedidos-container-' + chave)?.closest('.card')?.setAttribute('hidden', '');
        // Briefing continua no mesmo componente, com dados do documento próprio.
        state.pedidosArtesData ||= {};
        state.pedidosArtesData[pedido(chave).numero] = clonar(doc().briefing || {});
        updateBriefingUI(chave, pedido(chave).numero);
        anexos();
    }
    function anexos() {
        const container = document.getElementById('anexos-pedido-container-' + chave);
        if (!container) return;
        container.replaceChildren();
        if (!(doc().anexos || []).length) node('p', 'Nenhum anexo neste pedido.', container);
        for (const a of doc().anexos || []) {
            const linha = node('div', '', container); linha.style.cssText = 'display:flex;gap:12px;align-items:center';
            const selecionar = node('input', '', linha); selecionar.type = 'checkbox'; selecionar.className = 'anexo-checkbox-' + chave;
            selecionar.dataset.id = a.id; selecionar.dataset.url = a.url; selecionar.dataset.name = a.nome;
            const link = node('a', a.nome, linha); link.href = a.url; link.download = a.nome;
            const ocultar = node('button', a.oculto ? 'Reexibir' : 'Ocultar', linha); ocultar.className = 'btn btn-secondary';
            ocultar.onclick = () => ocultarAnexos([a.id], !a.oculto).catch(erro);
            if (a.oculto) link.style.opacity = '0.5';
        }
    }
    async function ocultarAnexos(ids, oculto) {
        await alterar(d => { for (const a of d.anexos || []) if (ids.includes(a.id)) a.oculto = oculto; }); anexos();
    }
    async function enviarAnexos(files) {
        const novos = [];
        for (const file of files) novos.push({ id: crypto.randomUUID(), nome: file.name, tamanho: file.size, url: await arquivo(file, file.name), oculto: false });
        await alterar(d => { d.anexos = [...(d.anexos || []), ...novos]; }); anexos();
    }
    function escolherAnexos() {
        const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
        input.onchange = () => enviarAnexos(Array.from(input.files)).catch(erro); input.click();
    }
    async function importarPdf(event) {
        const file = event.target.files?.[0]; if (!file) return;
        try {
            const origem = await PDFLib.PDFDocument.load(await file.arrayBuffer());
            const modelos = clonar(doc().modelos), paginas = modelos.reduce((n, m) => n + (modeloTemVerso(m) ? 2 : 1), 0);
            if (origem.getPageCount() !== paginas) throw new Error('O PDF deve ter exatamente ' + paginas + ' páginas, na ordem das frentes e versos.');
            let index = 0; const patches = [];
            for (const m of modelos) {
                const patch = {};
                for (const campo of modeloTemVerso(m) ? ['arte_url', 'verso_arte_url'] : ['arte_url']) {
                    const destino = await PDFLib.PDFDocument.create(); const [pagina] = await destino.copyPages(origem, [index++]); destino.addPage(pagina);
                    patch[campo] = await arquivo(new Blob([await destino.save()], { type: 'application/pdf' }), 'arte.pdf');
                }
                patches.push([m.id, patch]);
            }
            await alterar(d => { for (const [id, patch] of patches) { const m = d.modelos.find(x => x.id === id); if (!m) throw new Error('O pedido mudou.'); Object.assign(m, patch); } });
            desenhar(); toast('PDF importado no IdGen.', 'success');
        } catch (e) { erro(e); } finally { event.target.value = ''; }
    }
    function desenhar() { populateSelects(); renderAmostrasOSItens(chave); ajustarTela(); }
    async function sair() {
        await sessao?.fila;
        const u = new URL(location.href); u.searchParams.delete('idgen'); u.hash = '';
        // Uma nova página descarta callbacks e caches deste contexto de edição.
        location.assign(u.href);
    }
    function formulario() {
        const compativel = (tipo, registro, formatoId) => {
            if (!registro || !formatoId) return false;
            const ids = tipo === 'numeracoes' && Array.isArray(registro.formato_ids)
                ? registro.formato_ids : [registro.formato_id];
            return ids.some(id => id != null && String(id) === String(formatoId));
        };
        const view = document.getElementById('view-amostras');
        const caixa = node('div', '', null); caixa.className = 'card'; caixa.id = 'idgen-modelo-form';
        node('h2', 'IdGen — ' + sessao.pedido.nome, caixa);
        const sairBtn = node('button', '← Templates IdGen', caixa); sairBtn.className = 'btn btn-secondary'; sairBtn.onclick = sair;
        const liberar = node('a', 'Associar template ao cliente', caixa); liberar.className = 'btn btn-secondary';
        liberar.href = 'https://idgen-5kg.pages.dev/?template=' + encodeURIComponent(contexto.id);
        liberar.target = '_blank'; liberar.rel = 'noopener noreferrer';
        liberar.title = 'Disponibilize a versão salva do template para o cliente.';
        const f = node('form', '', caixa); f.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end;margin-top:16px';
        const label = node('label', 'Nome do modelo', f), nome = node('input', '', label); nome.required = true; nome.maxLength = 120; nome.id = 'idgen-modelo-nome';
        const campos = {};
        for (const [tipo, rotulo] of [['formatos', 'Formato'], ['cores', 'Cor'], ['numeracoes', 'Numeração']]) {
            const lab = node('label', rotulo, f), sel = node('select', '', lab); sel.required = true; sel.id = 'idgen-modelo-' + tipo;
            node('option', 'Selecione…', sel).value = '';
            if (tipo === 'formatos') for (const item of catalogo[tipo]) { const opt = node('option', item.name || item.nome || item.id, sel); opt.value = item.id; }
            campos[tipo] = sel;
        }
        function filtrar() {
            const formatoId = campos.formatos.value;
            for (const tipo of ['cores', 'numeracoes']) {
                const sel = campos[tipo], anterior = sel.value;
                const itens = catalogo[tipo].filter(item => compativel(tipo, item, formatoId));
                sel.replaceChildren();
                node('option', !formatoId ? 'Selecione o formato primeiro' : itens.length ? 'Selecione…' : 'Nenhuma opção compatível', sel).value = '';
                for (const item of itens) { const opt = node('option', item.name || item.nome || item.id, sel); opt.value = item.id; }
                sel.value = itens.some(item => String(item.id) === anterior) ? anterior : '';
                sel.disabled = !itens.length;
            }
        }
        campos.formatos.onchange = filtrar;
        filtrar();
        const adicionar = node('button', 'Adicionar modelo', f); adicionar.type = 'submit'; adicionar.className = 'btn btn-primary';
        f.querySelectorAll('label').forEach(e => { e.style.cssText = 'display:grid;gap:6px;font-size:0.85rem'; });
        f.querySelectorAll('input,select').forEach(e => { e.className = 'form-control'; e.style.minWidth = '0'; });
        node('p', 'Artes e anexos: até 5 MB por arquivo.', caixa).style.cssText = 'font-size:0.8rem;color:var(--text-dim);margin-top:12px';
        f.onsubmit = async e => {
            e.preventDefault(); adicionar.disabled = true;
            try {
                const formato = catalogo.formatos.find(x => String(x.id) === campos.formatos.value);
                if (!formato || !['cores', 'numeracoes'].every(tipo => compativel(tipo,
                    catalogo[tipo].find(x => String(x.id) === campos[tipo].value), formato.id))) {
                    throw new Error('Selecione uma cor e uma numeração compatíveis com o formato.');
                }
                // As listagens são enxutas; copiar as linhas completas antes de trocar os IDs.
                const [rc, rn] = await Promise.all([
                    supabaseClient.from('producao_cores').select('*').eq('id', campos.cores.value).single(),
                    supabaseClient.from('producao_numeracoes').select('*').eq('id', campos.numeracoes.value).single(),
                ]);
                if (rc.error || rn.error || !rc.data || !rn.data) throw new Error('Não foi possível copiar os cadastros selecionados.');
                const cor = clonar(rc.data), numeracao = clonar(rn.data);
                normalizarNumeracaoLida(numeracao);
                if (!compativel('cores', cor, formato.id) || !compativel('numeracoes', numeracao, formato.id)) {
                    throw new Error('O formato desses cadastros mudou. Atualize o pedido antes de adicionar o modelo.');
                }
                for (const [registro, camposArquivo] of [[cor, ['pdf_base64', 'pdf_verso_base64']], [numeracao, ['bg_url', 'preview_jpg']]]) {
                    for (const campo of camposArquivo) if (typeof registro[campo] === 'string' && registro[campo].startsWith('https:')) registro[campo] = await arquivo(registro[campo]);
                }
                await sessao.adicionarModelo({ nome: nome.value, formato, cor, numeracao,
                    versoTipo: VersoDoModelo.doModo(numeracao.print_mode) });
                sincronizar(); desenhar(); nome.value = ''; toast('Modelo adicionado ao IdGen.', 'success');
            } catch (e) { erro(e); } finally { adicionar.disabled = false; }
        };
        view.prepend(caixa);
    }
    async function iniciar() {
        try {
            if (!contexto.valido) throw new Error('Identificador IdGen inválido.');
            const { PedidosIdGen } = await import('./idgen-pedidos.mjs?v=20261026');
            sessao = new PedidosIdGen(window.IdGen.pedir);
            await sessao.abrir(contexto.id); // O servidor valida sessão e papel antes de abrir.
            const tipos = ['formatos', 'cores', 'numeracoes', 'saidas'];
            const listas = await Promise.all(tipos.map(t => window.api ? window.api('GET', '/' + t) : apiSemConfirmacao('GET', '/' + t)));
            catalogo = Object.fromEntries(tipos.map((t, i) => [t, listas[i]]));
            state.ordens = []; state.osItens = {}; state.saidas = clonar(catalogo.saidas);
            // Template has no client dataset yet. Scope overrides to this dedicated editor only.
            for (const name of ['distribuicaoOrfaDoModelo', 'divergenciaDeCelulasDoModelo', 'bancoDeDadosIncompletoDoModelo', 'fonteSemGlifoDoModelo']) {
                const original = window[name];
                if (typeof original === 'function') window[name] = function (...args) {
                    return pronto ? null : original.apply(this, args);
                };
            }
            pronto = true; sincronizar(); state.amostrasOSAtivo = chave;
            window._currentPerms = { perm_amostras_view: true, perm_numeracao_view: true, perm_cores_view: true, perm_formatos_view: true };
            document.querySelectorAll('.sidebar, .mobile-header').forEach(e => e.hidden = true);
            node('style', '.idgen-contexto [hidden],.idgen-contexto .sidebar,.idgen-contexto .drawer-trigger{display:none!important}.idgen-contexto .main-content{margin-left:0;width:100%}', document.head);
            for (const idView of ['view-numeracao', 'view-cores', 'view-formatos']) {
                const b = node('button', '← Voltar ao template IdGen'); b.className = 'btn btn-secondary';
                b.onclick = () => { window.showView('view-amostras'); desenhar(); };
                document.getElementById(idView).prepend(b);
            }
            window.NavegacaoPainel?.iniciar('view-amostras');
            window.showView('view-amostras'); formulario(); desenhar();
            document.getElementById('loading-overlay')?.classList.remove('active');
        } catch (e) {
            const root = document.querySelector('.main-content') || document.body;
            root.replaceChildren(); node('h2', 'Não foi possível abrir o template IdGen', root); node('p', e.message, root);
            const b = node('button', 'Voltar', root); b.onclick = sair;
        }
    }
    window.IdGenEditor = {
        abrir(id) { const u = new URL(location.href); u.searchParams.set('idgen', id); location.assign(u.href); },
        iniciar, pedido, salvar, campo, api, arquivo, bancos, sincronizar, ajustarTela, sair,
        anexos, escolherAnexos, enviarAnexos, ocultarAnexos, importarPdf,
        get ativo() { return pronto; },
        get chave() { return chave; },
        get documento() { return pronto ? clonar(doc()) : null; },
        async briefing(field, value, obs, itemId) { await alterar(d => { d.briefing ||= {}; if (obs) { d.briefing.observacoes ||= {}; d.briefing.observacoes[itemId] = value; } else d.briefing[field] = value; }); },
        async status(itemId, osId, status) {
            if (!['PENDENTE', 'PRONTO', 'REPROVADA'].includes(status)) throw new Error('A aprovação do IdGen é feita pelo cliente para o lote inteiro.');
            const item = state.osItens[chave].find(m => m.id === itemId);
            if (status === 'PRONTO') {
                await validarPaginasDoPdfParaPronto(item);
                // Dados e glifos do lote serao conferidos depois da importacao no portal.
            }
            await salvar(itemId, osId, { amostra_status: status }); desenhar(); return true;
        },
    };
}());
