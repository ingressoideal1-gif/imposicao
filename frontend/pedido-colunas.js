/* Editor simples de bancos do pedido. Dados e vínculos passam pela API existente. */
(function (root) {
    'use strict';
    const copiar = x => JSON.parse(JSON.stringify(x));
    const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Clipboard de planilhas é TSV. Vírgulas e ponto e vírgula são conteúdo.
    // Não passa por cabeçalhos de CSV: a primeira linha é dado, inclusive repetido.
    function lerColagem(texto) {
        const linhas = [[]];
        let valor = '', aspas = false;
        texto = String(texto).replace(/\r\n?/g, '\n');
        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (c === '"' && aspas && texto[i + 1] === '"') { valor += '"'; i++; }
            else if (c === '"' && (aspas || valor === '')) aspas = !aspas;
            else if (!aspas && (c === '\t' || c === '\n')) {
                linhas[linhas.length - 1].push(valor); valor = '';
                if (c === '\n') linhas.push([]);
            } else valor += c;
        }
        if (aspas) throw new Error('Há aspas sem fechamento no conteúdo colado. Confira a seleção e cole novamente.');
        linhas[linhas.length - 1].push(valor);
        if (texto.endsWith('\n') && linhas.length > 1 && linhas.at(-1).length === 1 && linhas.at(-1)[0] === '') linhas.pop();
        return linhas;
    }

    function rascunho(banco) {
        const headers = (banco?.csv_headers || []).slice();
        if (new Set(headers).size !== headers.length || headers.some(h => !nomeValido(h))) {
            throw new Error('Este banco tem cabeçalhos vazios, repetidos ou reservados. Corrija-os em Conferir antes de abrir aqui.');
        }
        return { nome: banco?.nome || 'Colunas do pedido', headers,
            originais: headers.slice(), rows: copiar(banco?.csv_data || []), alterado: false };
    }
    function nomeValido(nome) {
        return typeof nome === 'string' && nome.trim() && !nome.startsWith('__') && !['constructor', 'prototype'].includes(nome);
    }
    function novaColuna(d) {
        let n = 1;
        while (d.headers.includes('Coluna ' + n) || d.originais.includes('Coluna ' + n)) n++;
        const nome = 'Coluna ' + n;
        d.headers.push(nome); d.originais.push(null);
        d.rows.forEach(r => { r[nome] = ''; }); d.alterado = true;
        return d.headers.length - 1;
    }
    function completarLinhas(d, quantidade) {
        let id = d.rows.reduce((max, r) => Math.max(max, Number(r.__id) || 0), 0);
        while (d.rows.length < quantidade) {
            const r = { __id: ++id };
            d.headers.forEach(h => { r[h] = ''; }); d.rows.push(r);
        }
        root.CsvEditor.garantirIds(d.rows);
    }
    function renomear(d, indice, nome) {
        nome = nome.trim();
        const antigo = d.headers[indice];
        if (nome === antigo) return;
        if (!nomeValido(nome)) throw new Error('Informe um nome de coluna válido, sem começar com __.');
        if (d.headers.includes(nome) || d.originais.some((h, i) => h === nome && i !== indice)) {
            throw new Error('Esse nome já pertence a outra coluna. Escolha um nome diferente.');
        }
        d.rows.forEach(r => {
            r[nome] = r[antigo] ?? ''; delete r[antigo];
            if (r.__fotos && proprio(r.__fotos, antigo)) { r.__fotos[nome] = r.__fotos[antigo]; delete r.__fotos[antigo]; }
        });
        d.headers[indice] = nome; d.alterado = true;
    }
    function escrever(d, linha, coluna, valor) {
        if (linha >= d.rows.length) completarLinhas(d, linha + 1);
        const h = d.headers[coluna];
        if (String(d.rows[linha][h] ?? '') === valor && !(valor === '' && d.rows[linha].__fotos?.[h])) return;
        d.rows[linha][h] = valor;
        // Conteúdo trocado não pode continuar imprimindo a foto anterior.
        if (d.rows[linha].__fotos) delete d.rows[linha].__fotos[h];
        d.alterado = true;
    }
    function colar(d, linha, coluna, texto) {
        const matriz = lerColagem(texto);
        const largura = matriz.reduce((n, r) => Math.max(n, r.length), 0);
        while (d.headers.length < coluna + largura) novaColuna(d);
        completarLinhas(d, linha + matriz.length);
        matriz.forEach((r, i) => r.forEach((v, j) => escrever(d, linha + i, coluna + j, v)));
        return matriz.length;
    }
    function carga(d) {
        const nome = d.nome.trim();
        if (!nome) throw new Error('Informe o nome do banco.');
        if (!d.headers.length) throw new Error('Adicione pelo menos uma coluna.');
        completarLinhas(d, 1);
        return { nome, csv_headers: d.headers.slice(), csv_data: copiar(d.rows),
            renomeacoes: d.originais.flatMap((h, i) => h && h !== d.headers[i] ? [{ de: h, para: d.headers[i] }] : []) };
    }
    function mapaRenomeado(mapa, trocas) {
        const novo = copiar(mapa || {});
        Object.keys(novo).forEach(k => {
            const troca = trocas.find(t => t.de === String(novo[k] ?? '').trim());
            if (troca) novo[k] = troca.para;
        });
        // Inclui vínculos implícitos de numerações antigas, sem alterar a numeração.
        trocas.forEach(t => { if (!String(mapa?.[t.de] ?? '').trim()) novo[t.de] = t.para; });
        return novo;
    }
    function canonico(x) {
        if (Array.isArray(x)) return x.map(canonico);
        if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonico(x[k])]));
        return x;
    }
    const igual = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
    const conteudo = b => ({ nome: b.nome, csv_headers: b.csv_headers, csv_data: b.csv_data, csv_filename: b.csv_filename || '', csv_url: b.csv_url || '' });

    /**
     * A API existente não oferece transação de banco + mapas. Durante renomeações,
     * mantém os dois nomes até TODOS os vínculos confirmarem a gravação. Falha deixa
     * aliases compatíveis e a tentativa pendente no editor; repetir não recalcula mapas.
     * A consulta prévia detecta alterações já concluídas, mas não é um lock de servidor.
     */
    function sessaoSalvar(api, idInt, banco, bancosIniciais) {
        let atual = banco ? copiar(banco) : null, plano = null, criando = null;
        const idsIniciais = new Set((bancosIniciais || []).map(b => String(b.id)));
        return async function salvar(dados) {
            const lido = await api('consultar', { id_int: idInt });
            if (!atual) {
                if (!criando) criando = { nome: dados.nome, csv_headers: dados.csv_headers, csv_data: dados.csv_data, csv_filename: 'colunas.csv', csv_url: '' };
                // Resposta perdida após criar: recuperar o registro exato antes de repetir.
                const achados = (lido.bancos || []).filter(b => !idsIniciais.has(String(b.id)) && igual(conteudo(b), criando));
                if (achados.length > 1) throw new Error('Há mais de um banco com este conteúdo. Reabra o pedido para conferir antes de salvar.');
                if (achados.length === 1) atual = achados[0];
                else {
                    const r = await api('criar', { id_int: idInt, ...criando });
                    if (!r.banco?.id) throw new Error('O servidor não confirmou o banco. Tente salvar novamente para conferir.');
                    atual = r.banco;
                }
                // O usuário pode ter corrigido o rascunho entre tentativas.
                if (igual({ nome: atual.nome, csv_headers: atual.csv_headers, csv_data: atual.csv_data },
                    { nome: dados.nome, csv_headers: dados.csv_headers, csv_data: dados.csv_data })) {
                    const conferencia = await api('consultar', { id_int: idInt });
                    const salvo = (conferencia.bancos || []).find(b => String(b.id) === String(atual.id));
                    if (!salvo || !igual(conteudo(salvo), conteudo(atual))) throw new Error('Não foi possível confirmar o banco criado. Tente novamente.');
                    return salvo;
                }
            }
            const remoto = (lido.bancos || []).find(b => String(b.id) === String(atual.id)) || (criando ? atual : null);
            if (!remoto) throw new Error('Este banco foi removido. O conteúdo continua aberto para você copiar.');
            if (plano && !igual(dados, plano.dados)) throw new Error('Conclua a tentativa de salvamento pendente antes de alterar o conteúdo.');
            if (!plano) {
                if (!igual(conteudo(remoto), conteudo(atual))) throw new Error('O banco foi alterado em outra tela. Copie suas alterações e reabra o editor para conferir a versão atual.');
                const final = { nome: dados.nome, csv_headers: dados.csv_headers, csv_data: dados.csv_data,
                    csv_filename: atual.csv_filename || 'colunas.csv', csv_url: atual.csv_url || '' };
                const etapa = copiar(final);
                dados.renomeacoes.forEach(t => {
                    etapa.csv_headers.push(t.de);
                    etapa.csv_data.forEach(r => {
                        r[t.de] = r[t.para];
                        if (r.__fotos && proprio(r.__fotos, t.para)) r.__fotos[t.de] = copiar(r.__fotos[t.para]);
                    });
                });
                plano = { dados: copiar(dados), final, etapa,
                    antes: conteudo(atual), vinculos: (lido.vinculos || []).filter(v => String(v.banco_id) === String(atual.id)).map(v => ({
                        modelo_id: v.modelo_id, antes: v.csv_mapa,
                        depois: mapaRenomeado(v.csv_mapa, dados.renomeacoes)
                    })) };
            }
            if (![plano.antes, plano.etapa, plano.final].some(c => igual(conteudo(remoto), c))) {
                throw new Error('O banco foi alterado durante o salvamento. Reabra o pedido para conferir; seu conteúdo permanece neste editor.');
            }
            if (dados.renomeacoes.length && !igual(
                (lido.vinculos || []).filter(v => String(v.banco_id) === String(atual.id)).map(v => String(v.modelo_id)).sort(),
                plano.vinculos.map(v => String(v.modelo_id)).sort())) {
                throw new Error('Os modelos que usam o banco mudaram. Reabra o pedido para conferir antes de continuar.');
            }
            for (const v of plano.vinculos) {
                const r = (lido.vinculos || []).find(x => String(x.modelo_id) === String(v.modelo_id));
                if (!r || String(r.banco_id) !== String(atual.id) || (!igual(r.csv_mapa, v.antes) && !igual(r.csv_mapa, v.depois))) {
                    throw new Error('Os vínculos de um modelo mudaram. Reabra o pedido para conferir antes de continuar.');
                }
            }
            const atualizar = async registro => {
                const r = await api('atualizar', { id_int: idInt, banco_id: atual.id, ...registro });
                if (!r.banco?.id) throw new Error('O servidor não confirmou a atualização. Tente salvar novamente.');
                atual = r.banco;
            };
            if (!igual(conteudo(remoto), plano.final)) await atualizar(plano.etapa);
            if (dados.renomeacoes.length) {
                for (const v of plano.vinculos) {
                    const r = await api('vincular', { id_int: idInt, modelo_id: v.modelo_id, banco_id: atual.id, csv_mapa: v.depois });
                    if (!r.vinculo) throw new Error('O servidor não confirmou as colunas do modelo. Tente salvar novamente.');
                }
                await atualizar(plano.final);
            }
            const conferido = await api('consultar', { id_int: idInt });
            const salvo = (conferido.bancos || []).find(b => String(b.id) === String(atual.id));
            if (!salvo || !igual(conteudo(salvo), plano.final)) throw new Error('Não foi possível confirmar o conteúdo salvo. Tente novamente.');
            if (dados.renomeacoes.length && plano.vinculos.some(v => !(conferido.vinculos || []).some(r =>
                String(r.modelo_id) === String(v.modelo_id) && String(r.banco_id) === String(atual.id) && igual(r.csv_mapa, v.depois)))) {
                throw new Error('Não foi possível confirmar as colunas dos modelos. Tente novamente.');
            }
            atual = salvo; plano = null;
            return salvo;
        };
    }

    let aberto = false;
    function abrir(opts) {
        if (aberto) return;
        const focoAnterior = document.activeElement;
        const ov = document.createElement('div'); ov.className = 'pedido-colunas-overlay';
        ov.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="pc-titulo" class="pedido-colunas-modal">
            <h2 id="pc-titulo">Criar colunas — pedido ${esc(opts.pedido)}</h2>
            <label>Banco do pedido<select id="pc-banco" class="form-control"><option value="">Criar banco novo</option>${opts.bancos.map(b => `<option value="${esc(b.id)}">Acrescentar / editar: ${esc(b.nome || b.csv_filename)}</option>`).join('')}</select></label>
            <div id="pc-aviso" role="status"></div>
            <fieldset id="pc-campos"><label>Nome do banco<input id="pc-nome" maxlength="120" class="form-control"></label>
            <p>Cole na célula inicial: cada linha colada ocupa uma linha. Tabulações separam colunas. A primeira linha é conteúdo. Células vazias não repetem valores.</p>
            <div class="pedido-colunas-acoes"><button type="button" id="pc-adicionar" class="btn btn-secondary">＋ Coluna</button><button type="button" id="pc-linha" class="btn btn-secondary">＋ Linha</button></div>
            <div id="pc-grade" class="pedido-colunas-grade"></div>
            <div class="pedido-colunas-acoes"><button type="button" id="pc-anterior" class="btn btn-secondary">← Anterior</button><span id="pc-contagem"></span><button type="button" id="pc-proxima" class="btn btn-secondary">Próxima →</button></div></fieldset>
            <p id="pc-erro" role="alert"></p><div class="pedido-colunas-acoes"><button type="button" id="pc-cancelar" class="btn btn-secondary">Cancelar</button><button type="button" id="pc-copiar" class="btn btn-secondary">Copiar dados</button><button type="button" id="pc-salvar" class="btn btn-primary">Salvar colunas</button></div>
        </section>`;
        document.body.appendChild(ov); aberto = true;
        const el = id => ov.querySelector('#pc-' + id);
        let d, banco, salvar, pagina = 0, ocupado = false, pendente = false, iniciouEscrita = false;
        const tamanho = 50;
        function erro(e) { el('erro').textContent = e?.message || String(e || ''); }
        function grade() {
            const inicio = pagina * tamanho;
            el('grade').innerHTML = `<table><thead><tr><th scope="col">Linha</th>${d.headers.map((h, c) => `<th scope="col"><input class="form-control" data-coluna="${c}" aria-label="Nome da coluna ${c + 1}" value="${esc(h)}"></th>`).join('')}</tr></thead><tbody>${d.rows.slice(inicio, inicio + tamanho).map((r, i) => `<tr><th scope="row">${inicio + i + 1}</th>${d.headers.map((h, c) => `<td><div class="pedido-colunas-celula"><textarea class="form-control" rows="1" data-linha="${inicio + i}" data-celula="${c}" aria-label="${esc(h)}, linha ${inicio + i + 1}">${esc(r[h] ?? '')}</textarea><button type="button" data-limpar="${c}" data-linha="${inicio + i}" title="Limpar célula, sem deslocar valores" aria-label="Limpar ${esc(h)}, linha ${inicio + i + 1}">×</button></div></td>`).join('')}</tr>`).join('')}</tbody></table>`;
            el('contagem').textContent = `${d.headers.length} coluna(s) · ${d.rows.length} linha(s) · exibindo ${inicio + 1}–${Math.min(inicio + tamanho, d.rows.length)}`;
            el('anterior').disabled = pagina === 0;
            el('proxima').disabled = inicio + tamanho >= d.rows.length;
        }
        function escolher(id) {
            const selecionado = opts.bancos.find(b => String(b.id) === String(id)) || null;
            if (id && !selecionado) throw new Error('Este banco não está mais disponível neste pedido. Reabra o pedido para conferir.');
            const novo = rascunho(selecionado);
            banco = selecionado; d = novo; iniciouEscrita = false;
            if (!d.headers.length) novaColuna(d);
            completarLinhas(d, 1); d.alterado = false;
            salvar = sessaoSalvar((acao, corpo) => {
                if (acao !== 'consultar') iniciouEscrita = true;
                return opts.api(acao, corpo);
            }, opts.idInt, banco, opts.bancos);
            pagina = 0; el('nome').value = d.nome; el('banco').value = banco?.id || '';
            el('aviso').textContent = banco
                ? 'As alterações valem para todos os modelos que usam este banco.' + (banco.csv_url ? ' Atenção: atualizar pela Planilha poderá substituir as edições manuais.' : '')
                : 'O banco será criado neste pedido. Depois, escolha-o em “Vem de” e associe as colunas no modelo.';
            grade(); erro('');
        }
        function fechar() {
            if (ocupado) return;
            if ((d.alterado || pendente) && !root.confirm(pendente ? 'Há uma tentativa de salvamento pendente. Fechar e conferir o banco ao reabrir o pedido?' : 'Descartar as alterações que ainda não foram salvas?')) return;
            ov.remove(); aberto = false; document.removeEventListener('keydown', tecla, true);
            document.removeEventListener('focusin', manterFoco, true);
            root.removeEventListener('beforeunload', antesDeSair);
            if (focoAnterior?.isConnected) focoAnterior.focus();
        }
        function antesDeSair(e) { if (d.alterado || ocupado || pendente) { e.preventDefault(); e.returnValue = ''; } }
        function manterFoco(e) { if (!ov.contains(e.target)) el('cancelar').focus(); }
        function tecla(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fechar(); }
            if (e.key !== 'Tab') return;
            const itens = Array.from(ov.querySelectorAll('button, input, textarea, select')).filter(n => !n.matches(':disabled'));
            if (e.shiftKey && document.activeElement === itens[0]) { e.preventDefault(); itens.at(-1).focus(); }
            else if (!e.shiftKey && document.activeElement === itens.at(-1)) { e.preventDefault(); itens[0].focus(); }
        }
        el('banco').onchange = () => {
            if (d.alterado && !root.confirm('Descartar as alterações para escolher outro banco?')) { el('banco').value = banco?.id || ''; return; }
            try { escolher(el('banco').value); } catch (e) { el('banco').value = banco?.id || ''; erro(e); }
        };
        el('nome').oninput = e => { d.nome = e.target.value; d.alterado = true; };
        el('adicionar').onclick = () => { const c = novaColuna(d); grade(); ov.querySelector(`[data-coluna="${c}"]`).focus(); };
        el('linha').onclick = () => { completarLinhas(d, d.rows.length + 1); d.alterado = true; pagina = Math.floor((d.rows.length - 1) / tamanho); grade(); };
        el('anterior').onclick = () => { pagina--; grade(); };
        el('proxima').onclick = () => { pagina++; grade(); };
        el('grade').addEventListener('change', e => {
            if (!e.target.matches('[data-coluna]')) return;
            const c = Number(e.target.dataset.coluna);
            try { renomear(d, c, e.target.value); erro(''); grade(); }
            catch (ex) { erro(ex); e.target.value = d.headers[c]; }
        });
        el('grade').addEventListener('input', e => {
            if (e.target.matches('[data-celula]')) escrever(d, Number(e.target.dataset.linha), Number(e.target.dataset.celula), e.target.value);
        });
        el('grade').addEventListener('click', e => {
            const b = e.target.closest('[data-limpar]'); if (!b) return;
            const r = Number(b.dataset.linha), c = Number(b.dataset.limpar);
            escrever(d, r, c, ''); grade(); ov.querySelector(`[data-linha="${r}"][data-celula="${c}"]`).focus();
        });
        el('grade').addEventListener('paste', e => {
            if (!e.target.matches('[data-celula]')) return;
            const texto = e.clipboardData?.getData('text/plain');
            if (!texto || !/[\t\r\n]/.test(texto)) return;
            e.preventDefault();
            try { colar(d, Number(e.target.dataset.linha), Number(e.target.dataset.celula), texto); grade(); erro(''); }
            catch (ex) { erro(ex); }
        });
        el('cancelar').onclick = fechar;
        el('copiar').onclick = async () => {
            const campo = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
            const texto = [d.headers, ...d.rows.map(r => d.headers.map(h => r[h]))].map(r => r.map(campo).join('\t')).join('\r\n');
            try { await navigator.clipboard.writeText(texto); el('aviso').textContent = 'Dados copiados com os nomes das colunas na primeira linha.'; }
            catch (_) { erro('Não foi possível copiar. Permita o acesso à área de transferência e tente novamente.'); }
        };
        el('salvar').onclick = async () => {
            if (ocupado) return;
            let dados;
            try { dados = carga(d); } catch (e) { erro(e); return; }
            ocupado = true; pendente = true; erro('');
            el('campos').disabled = true; el('banco').disabled = true; el('cancelar').disabled = true;
            el('salvar').disabled = true; el('salvar').textContent = 'Salvando…';
            try {
                const salvo = await salvar(dados);
                pendente = false; d.alterado = false; ocupado = false; fechar();
                await opts.aoSalvar(salvo);
            } catch (e) {
                erro(e); ocupado = false;
                if (!iniciouEscrita) { pendente = false; el('campos').disabled = false; el('banco').disabled = false; }
                // Conteúdo fica bloqueado para repetir a MESMA operação sem reaplicar renomeações.
                el('cancelar').disabled = false; el('salvar').disabled = false;
                el('salvar').textContent = 'Tentar salvar novamente';
            }
        };
        try { escolher(opts.bancoId || ''); }
        catch (e) { ov.remove(); aberto = false; throw e; }
        document.addEventListener('keydown', tecla, true);
        document.addEventListener('focusin', manterFoco, true);
        root.addEventListener('beforeunload', antesDeSair);
        el('banco').focus();
    }
    root.PedidoColunas = { abrir, lerColagem, rascunho, novaColuna, completarLinhas, renomear, escrever, colar, carga, mapaRenomeado, sessaoSalvar };
})(typeof window !== 'undefined' ? window : globalThis);
