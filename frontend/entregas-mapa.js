/* Mapa ADM: consulta independente da tabela; nenhuma gravacao de rotas/pedidos. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const origem = 'Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, 90660-130, Brasil';
    const permitido = () => window.EntregasAcesso?.consultar===true;
    const node = (tag, value, cls) => { const n = document.createElement(tag); n.textContent = value; if (cls) n.className = cls; return n; };
    let geracao = 0, popupGeracao = 0, mapa, api, loader, info, bounds, config = {}, marcadores = [], linhas = [], selecionado = null;
    const cores = new Map(), locais = new Map(), caminhos = new Map();
    const palette = ['#8b3fd6', '#e8590c', '#00856a', '#ce3067', '#b18200', '#007eaa', '#783f23'];
    const situacao = row => row.entregador_id ? row.entregador || 'Atribuído' : row.status_erp === 'EXPEDICAO' ? 'Pronto para expedir' : row.status_erp === 'EM TRANSITO' ? 'Em deslocamento' : row.status_erp === 'EM PRODUCAO' ? 'Em produção' : 'Em preparação';
    const corPedido = row => row.entregador_id ? cor(row.entregador_id) : ['EXPEDICAO', 'EM TRANSITO'].includes(row.status_erp) ? '#2563eb' : '#64748b';
    function cor(id) {
        if (!id) return '#64748b';
        if (!cores.has(id)) cores.set(id, palette[cores.size] || `hsl(${(cores.size * 137.508) % 360} 65% 40%)`);
        return cores.get(id);
    }
    function apagarDesenho() {
        popupGeracao++;
        marcadores.forEach(m => { m.marker.map = null; }); linhas.forEach(l => l.line.setMap(null));
        marcadores = []; linhas = []; info?.close(); bounds = null; selecionado = null;
    }
    function limpar() {
        geracao++; apagarDesenho(); locais.clear(); caminhos.clear(); cores.clear(); config = {};
        if (mapa) { mapa = null; $('ve-mapa').replaceChildren(); }
        for (const id of ['ve-mapa-legenda', 've-mapa-erros']) $(id)?.replaceChildren();
        for (const id of ['ve-total', 've-sem-entregador', 've-total-rotas']) if ($(id)) $(id).textContent = '—';
        if ($('ve-mapa-status')) $('ve-mapa-status').textContent = '';
        if ($('ve-mapa-pendencias')) $('ve-mapa-pendencias').hidden = true;
    }
    function falha(texto) {
        $('ve-mapa-status').textContent = texto;
        if (!mapa) { const n = node('div', '', 've-mapa-vazio'); n.append(node('strong', 'Mapa ainda indisponível'), node('p', texto)); $('ve-mapa').replaceChildren(n); }
    }
    async function carregarGoogle() {
        if (!window.google?.maps?.importLibrary) {
            const key = config.apiKey;
            if (!key) throw new Error('Aguardando ativação do Google Maps. Os pedidos e a gestão de rotas continuam disponíveis abaixo.');
            if (!loader) loader = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                const timer = setTimeout(() => { script.remove(); loader = null; reject(new Error('O mapa demorou para responder. Tente atualizar.')); }, 20000);
                window.__veMapaPronto = () => { clearTimeout(timer); resolve(); };
                script.onerror = () => { clearTimeout(timer); script.remove(); loader = null; reject(new Error('Não foi possível carregar o Google Maps.')); };
                script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: '__veMapaPronto', language: 'pt-BR', region: 'BR' });
                script.async = true; document.head.append(script);
            });
            await loader;
        }
        if (!api) {
            const [maps, marker, geocoding, routes] = await Promise.all(['maps', 'marker', 'geocoding', 'routes'].map(n => google.maps.importLibrary(n)));
            api = { ...maps, ...marker, ...geocoding, ...routes };
        }
        return api;
    }
    async function localizar(endereco, turno) {
        if (locais.has(endereco)) return locais.get(endereco);
        // Complementos identificam a unidade, mas podem impedir o Google de localizar o prédio.
        // Preserve o endereço exibido e remova apenas segmentos reconhecidos após rua/número.
        const partes = endereco.split(',').map(p => p.trim());
        const semComplemento = partes.filter((p, i) => i < 2 || !/^(?:t[eé]rreo|conj(?:unto)?|ap(?:to|artamento)?|sala|loja|bloco|fundos|andar)\b\.?/i.test(p)).join(', ');
        for (const address of [...new Set([endereco, semComplemento])]) {
            if (turno !== geracao || !permitido()) throw new Error('Consulta cancelada');
            let results;
            try {
                ({ results } = await new api.Geocoder().geocode({ address, componentRestrictions: { country: 'BR' } }));
            } catch (e) {
                if (e.code === 'ZERO_RESULTS') continue;
                throw e;
            }
            const r = results?.[0];
            if (!r || results.length !== 1 || r.partial_match || !['ROOFTOP', 'RANGE_INTERPOLATED'].includes(r.geometry?.location_type)) continue;
            const pos = r.geometry.location.toJSON();
            if (turno === geracao && permitido()) locais.set(endereco, pos);
            return pos;
        }
        throw new Error('Endereço sem localização precisa');
    }
    function enquadrar(id) {
        if (!mapa || !bounds) return;
        selecionado = selecionado === id ? null : id;
        const b = new google.maps.LatLngBounds();
        for (const m of marcadores) {
            const visivel = selecionado === null || m.id === selecionado || m.ids?.includes(selecionado) || m.origem;
            m.marker.map = visivel ? mapa : null;
            if (visivel) b.extend(m.pos);
        }
        for (const l of linhas) { const on = selecionado === null || l.id === selecionado; l.line.setMap(on ? mapa : null); if (on) l.path.forEach(p => b.extend(p)); }
        for (const el of $('ve-mapa-legenda').querySelectorAll('[data-entregador]')) el.setAttribute('aria-pressed', String(selecionado === el.dataset.entregador));
        if (!b.isEmpty()) mapa?.fitBounds(b, 50);
    }
    function marcar(pos, row, label, color) {
        const badge = node('span', label, 've-map-pin'); badge.style.background = color;
        const marker = new api.AdvancedMarkerElement({ map: mapa, position: pos, content: badge, title: row ? `Pedido ${row.pedido} · ${situacao(row)}` : 'Ideal · saída das rotas' });
        const abrir = async () => {
            if (!row || !permitido()) return;
            const turno = geracao, popupAtual = ++popupGeracao;
            const box = node('div', '', 've-map-popup');
            box.append(node('strong', row.grupo ? `${row.modalidade==='veppo'?'Veppo':'Aéreo'} · ${row.grupo.length} pedido(s)` : `Pedido ${row.pedido}`), node('p', row.cliente || ''), node('p', row.endereco), node('p', situacao(row)));
            if (row.prevista_em) box.append(node('p', 'Previsão: ' + new Date(row.prevista_em).toLocaleString('pt-BR')));
            const b = node('button', 'Ver pedido na lista', 'btn btn-primary'); b.type = 'button'; b.hidden = !row.entregador_id && !['EXPEDICAO','EM TRANSITO'].includes(row.status_erp);
            b.onclick = () => { $('ve-busca').value = String(row.pedido); $('ve-status').value = row.entregador_id ? 'minha' : 'disponivel'; $('ve-filtros').requestSubmit(); $('ve-filtros').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
            const atribuicao = node('div', '', 've-map-atribuicao');
            const mensagem = node('p', 'Carregando entregadores…'); mensagem.setAttribute('role', 'status');
            atribuicao.append(mensagem); box.append(atribuicao, b); info.setContent(box); info.open({ map: mapa, anchor: marker });
            try {
                const ctx = await window.EntregasGestao?.contextoLinhas();
                if (turno !== geracao || popupAtual !== popupGeracao || !permitido()) return;
                for(const pedido of row.grupo || [row]) {
                    const select = window.EntregasGestao?.seletor(pedido, ctx, texto => { mensagem.textContent = texto; });
                    if (!select) throw new Error('Seleção de entregador indisponível. Consulte a lista de pedidos.');
                    const label = node('label', row.grupo?`Pedido ${pedido.pedido} · ${pedido.cliente} · ${situacao(pedido)}`:'Atribuir entregador'); label.append(select); atribuicao.append(label);
                }
                mensagem.textContent = 'Ao selecionar, o pedido entra na rota do entregador.';
                if (!ctx.editar) mensagem.textContent = 'Seu acesso permite somente consultar.';
            } catch { if (turno === geracao && popupAtual === popupGeracao && permitido()) mensagem.textContent = 'Não foi possível consultar os entregadores. Feche e abra o pedido para tentar novamente.'; }
        };
        if (row) marker.addListener('click', abrir);
        marcadores.push({ ids: row?.grupo?.map(p=>p.entregador_id || ''), marker, pos, abrir, chave: row?.chave, id: row?.entregador_id || '', origem: !row }); bounds.extend(pos);
    }
    function legenda(rows) {
        const grupos = new Map([['', rows]]);
        for (const row of rows) { const id = row.entregador_id; if (!id) continue; if (!grupos.has(id)) grupos.set(id, []); grupos.get(id).push(row); }
        $('ve-mapa-legenda').replaceChildren();
        const todos = node('button', 'Mostrar todas as entregas', 've-mapa-todos'); todos.type = 'button'; todos.onclick = () => { selecionado = null; enquadrar(null); }; $('ve-mapa-legenda').append(todos);
        for (const [id, paradas] of grupos) {
            const card = node('article', '', 've-mapa-entregador'), b = node('button', '', 've-mapa-grupo'); b.type = 'button'; b.dataset.entregador = id; b.setAttribute('aria-pressed', 'false');
            const ponto = node('span', '', 've-cor-rota'); ponto.style.background = cor(id);
            const txt = node('span', ''); txt.append(node('strong', id ? paradas[0].entregador || 'Entregador' : 'Todas as entregas'), node('small', `${paradas.length} entrega(s) · ${!id ? 'Todos os pedidos pendentes' : paradas.some(p => p.iniciada_em) ? 'Em deslocamento' : id ? 'Planejado' : 'Disponíveis'}`));
            b.append(ponto, txt); b.onclick = () => { if (!id) selecionado = null; enquadrar(id || null); }; card.append(b);
            const pedidos = node('p', paradas.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(p => '#' + p.pedido).join(' · '), 've-mapa-pedidos'); card.append(pedidos);
            if (!id) {
                pedidos.remove();
                const lista = node('div', '', 've-mapa-todas-lista');
                for (const row of paradas) {
                    const pedido = node('button', '', 've-mapa-item'); pedido.type = 'button';
                    const pontoPedido = node('span', '', 've-cor-rota'); pontoPedido.style.background = corPedido(row);
                    const descricao = node('span', ''); descricao.append(node('strong', '#' + row.pedido), node('small', situacao(row)));
                    pedido.append(pontoPedido, descricao);
                    pedido.onclick = () => { const m = marcadores.find(m => m.chave === row.chave); if (m) { selecionado = null; enquadrar(null); mapa?.panTo?.(m.pos); m.abrir(); } else $('ve-mapa-status').textContent = `Pedido ${row.pedido}: localização ainda indisponível. Confira as pendências de endereço.`; };
                    lista.append(pedido);
                }
                card.append(lista);
            }
            const rota = id ? paradas.find(p => p.rota_id) : null;
            if (rota && !rota.iniciada_em) { const editar = node('button', 'Editar sequência', 'btn btn-ghost'); editar.type = 'button'; editar.onclick = () => window.EntregasGestao?.editarRota(rota.rota_id); card.append(editar); }
            $('ve-mapa-legenda').append(card);
        }
        if (!rows.length) $('ve-mapa-legenda').append(node('p', 'Nenhuma entrega pendente.'));
    }
    async function atualizar() {
        if (!$('ve-mapa') || !permitido()) { limpar(); return; }
        const turno = ++geracao, atual = () => turno === geracao && permitido();
        apagarDesenho(); $('ve-mapa-legenda').replaceChildren(); $('ve-mapa-erros').replaceChildren(); $('ve-mapa-pendencias').hidden = true;
        $('ve-mapa-status').textContent = 'Consultando todos os pedidos pendentes…';
        for (const id of ['ve-total', 've-sem-entregador', 've-total-rotas']) $(id).textContent = '—';
        try {
            const c = typeof vibeClient !== 'undefined' ? vibeClient : null;
            if (!c) throw new Error('Entre com sua conta ADM para abrir o mapa.');
            const rows = [], ids = new Set(); let cursor = null;
            do {
                const { data, error } = await c.rpc('ve_admin_mapa_modalidades', { p_apos: cursor, p_modalidade: window.EntregasModalidade?.atual || 'motoboy' });
                if (!atual()) return;
                if (error || !Array.isArray(data)) throw new Error('Consulta do mapa indisponível. Confira sua sessão e a implantação da consulta ADM.');
                for (const row of data.slice(0, 200)) { if (!row.chave || ids.has(row.chave)) throw new Error('A lista mudou durante a consulta. Atualize o mapa.'); ids.add(row.chave); rows.push(row); }
                cursor = data.length > 200 ? data[199].chave : null;
            } while (cursor);
            $('ve-total').textContent = rows.length; $('ve-sem-entregador').textContent = rows.filter(p => p.status_erp === 'EXPEDICAO').length;
            $('ve-total-rotas').textContent = '0'; legenda(rows);
            const { data: configuracao, error: erroConfig } = await c.rpc('ve_admin_mapa_config');
            if (!atual()) return;
            if (erroConfig) throw new Error('Configuração do mapa indisponível. Confira sua sessão ADM.');
            config = configuracao || {};
            await carregarGoogle(); if (!atual()) return;
            if (!mapa) { $('ve-mapa').replaceChildren(); mapa = new api.Map($('ve-mapa'), { center: { lat: -30.05, lng: -51.2 }, zoom: 12, mapId: config.mapId || 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false, gestureHandling: 'cooperative' }); info = new api.InfoWindow(); }
            bounds = new google.maps.LatLngBounds();
            $('ve-mapa-status').textContent = 'Localizando a Ideal e os endereços das entregas…';
            const inicio = await localizar(origem, turno); if (!atual()) return;
            marcar(inicio, null, 'IDEAL', '#182b49');
            const erros = [], posicoes = new Map(), gruposMarcados = new Set();
            for (const row of rows) {
                if (!atual()) return;
                try {
                    if (!row.endereco_completo) throw new Error('Endereço incompleto');
                    const pos = await localizar(row.endereco, turno); if (!atual()) return;
                    posicoes.set(row.chave, pos);
                    if(['veppo','aereo'].includes(row.modalidade)){
                        if(!gruposMarcados.has(row.modalidade)){gruposMarcados.add(row.modalidade);const grupo=rows.filter(p=>p.modalidade===row.modalidade);marcar(pos,{...row,grupo},`${row.modalidade==='veppo'?'Veppo':'Aéreo'} · ${grupo.length}`,grupo.every(p=>p.entregador_id===row.entregador_id)?corPedido(row):'#64748b');}
                    }else marcar(pos, row, '#' + row.pedido, corPedido(row));
                } catch { if (!atual()) return; erros.push(`Pedido ${row.pedido}: confira o endereço no ERP (${row.endereco || 'não informado'}).`); }
            }
            const rotas = new Map();
            for (const row of rows) {
                if (row.rota_id) { if (!rotas.has(row.rota_id)) rotas.set(row.rota_id, []); rotas.get(row.rota_id).push(row); }
                else if (row.entregador_id) erros.push(`Pedido ${row.pedido}: atribuído, mas sem sequência em uma rota ativa.`);
            }
            let desenhadas = 0;
            for (const paradas of rotas.values()) {
                if (!atual()) return;
                paradas.sort((a, b) => a.ordem - b.ordem);
                const d = paradas[0], pontos = paradas.filter((p,i)=>!i||!['veppo','aereo'].includes(p.modalidade)||paradas[i-1].modalidade!==p.modalidade).map(p => posicoes.get(p.chave));
                if (pontos.some(p => !p)) { erros.push(`${d.entregador}: rota não desenhada porque há endereço para conferir.`); continue; }
                try {
                    const request = { origin: inicio, destination: d.retorno ? inicio : pontos[pontos.length - 1], intermediates: (d.retorno ? pontos : pontos.slice(0, -1)).map(location => ({ location })), travelMode: 'DRIVING', optimizeWaypointOrder: false, fields: ['path'] };
                    const key = JSON.stringify(request); let path = caminhos.get(key);
                    if (!path) { const { routes } = await api.Route.computeRoutes(request); path = routes?.[0]?.path; if (!path?.length) throw new Error('Sem trajeto'); if (atual()) caminhos.set(key, path); }
                    if (!atual()) return;
                    const line = new api.Polyline({ map: mapa, path, strokeColor: cor(d.entregador_id), strokeOpacity: .85, strokeWeight: 5 });
                    linhas.push({ line, path, id: d.entregador_id }); path.forEach(p => bounds.extend(p)); desenhadas++;
                } catch { if (!atual()) return; erros.push(`${d.entregador}: não foi possível calcular o trajeto. A sequência planejada foi preservada.`); }
            }
            if (!atual()) return;
            $('ve-total-rotas').textContent = desenhadas;
            erros.forEach(e => $('ve-mapa-erros').append(node('li', e))); $('ve-mapa-pendencias').hidden = !erros.length;
            $('ve-mapa-pendencias-titulo').textContent = `${erros.length} pendência(s) para conferir`;
            mapa.fitBounds(bounds, 50);
            $('ve-mapa-status').textContent = `${posicoes.size} de ${rows.length} entrega(s) localizada(s) · ${desenhadas} rota(s) pelas ruas · saída na Ideal. ${erros.length ? 'Confira as pendências ao lado.' : 'Clique em uma parada para ver o pedido.'}`;
        } catch (e) { if (atual()) falha(e.message); }
    }
    function iniciar() { if ($('ve-mapa-atualizar')) $('ve-mapa-atualizar').onclick = atualizar; }
    window.EntregasMapa = { atualizar, limpar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
