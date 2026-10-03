// Regressões do editor e das duas telas consumidoras. Somente dados sintéticos; nenhuma rede.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const raiz = path.join(__dirname, '..');
const mapasFonte = fs.readFileSync(path.join(raiz, 'frontend/mapas.js'), 'utf8');
const scriptFonte = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const pedidoFonte = fs.readFileSync(path.join(raiz, 'frontend/pedido.js'), 'utf8');
const consumidor = scriptFonte.slice(scriptFonte.indexOf('function populateImpMapasTeatro('), scriptFonte.indexOf('function onImpNumeracaoSelect()'));
const copia = v => JSON.parse(JSON.stringify(v));
const cadeira = (num, prefixo = 'A') => ({ num, prefixo, tipo: 'Normal' });
const mapa = (id = 'm1', cadeiras = { '0,0': cadeira(1) }) => ({
    id, name: 'Teatro Sintético', config: { setores: [{ id: 's1', nome: 'Plateia', fileiras: [], cadeiras }] }
});

function montar(comConsumidor = false) {
    const nodes = new Map(), eventos = {}, storage = new Map(), frames = new Map(), timers = [];
    const avisos = [], confirmacoes = []; let frameId = 0;
    const ctxCanvas = new Proxy({ measureText: texto => ({ width: texto.length * 6 }) }, {
        get(obj, k) { return k in obj ? obj[k] : (() => {}); }
    });
    function elemento(tag = 'DIV') {
        let html = '';
        const el = { tagName: tag.toUpperCase(), style: {}, dataset: {}, value: '', children: [], disabled: false,
            files: [], clientWidth: 800, clientHeight: 600, className: '',
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren() { this.children = []; html = ''; },
            get options() { return this.children; },
            querySelectorAll(selector) {
                if (selector === 'button') return this._botoes || [];
                if (selector === 'button, input, select') return [get('mapa-nome'), get('botao-salvar')];
                return [];
            },
            addEventListener() {}, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
            getBoundingClientRect() { return { left: 0, top: 0 }; }, getContext() { return ctxCanvas; }
        };
        Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) {
            html = v; this.children = []; this._botoes = Array.from(v.matchAll(/<button\b/g), () => elemento('button'));
        } });
        return el;
    }
    function get(id) { if (!nodes.has(id)) nodes.set(id, elemento()); return nodes.get(id); }
    const c = { console: { log() {}, error() {}, warn() {} }, Set, Map, JSON, Date, Math,
        alert(msg) { avisos.push({ msg, tipo: 'alert' }); }, confirm() { return true; },
        toast(msg, tipo) { avisos.push({ msg, tipo }); },
        async confirmarPopup(opcoes) { confirmacoes.push(opcoes); return true; },
        addEventListener(tipo, fn) { (eventos[tipo] ||= []).push(fn); },
        setTimeout(fn) { timers.push(fn); }, requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
        cancelAnimationFrame(id) { frames.delete(id); },
        fetch() { throw Error('Rede proibida no teste'); },
        localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, v); } },
        document: { getElementById: get, createElement: elemento, querySelectorAll() { return []; }, querySelector() { return null; },
            addEventListener(tipo, fn) { (eventos[tipo] ||= []).push(fn); } },
        drawPreview() {}, drawPedPreview() {}, updateImpSummary() {}, updatePedSummary() {}
    };
    c.window = c; vm.createContext(c); vm.runInContext(mapasFonte, c);
    if (comConsumidor) {
        vm.runInContext('const state = { csvData: null, numeracoes: [{id:"n1",tipo:"TEATRO"}] };', c);
        vm.runInContext(consumidor, c);
    }
    const producao = comConsumidor ? vm.runInContext('state', c) : null;
    c.state.mapaAtual = mapa(); c.state.mapas = [copia(c.state.mapaAtual)];
    c.setorSelecionadoIdx = 0; c.cadeirasSelecionadas = new Set();
    get('modal-mapa-teatro').style.display = 'flex';
    get('mapa-nome').value = c.state.mapaAtual.name;
    get('imp-mapa-teatro').value = 'm1'; get('ped-mapa-teatro').value = 'm1';
    get('imp-numeracao').value = 'n1'; get('ped-numeracao').value = 'n1';
    storage.set('vibe_mapas_teatro', JSON.stringify(c.state.mapas));
    function tecla(key) {
        for (const fn of eventos.keydown || []) fn({ key, target: { tagName: 'BODY' }, preventDefault() {} });
    }
    function grid() { vm.runInContext('mapCanvas = document.getElementById("mapa-canvas"); camera = {x:0,y:0,zoom:1};', c); }
    return { c, producao, get, storage, frames, timers, avisos, confirmacoes, eventos, tecla, grid };
}

function clienteSimulado(t, opcoes = {}) {
    const rows = new Map(t.c.state.mapas.filter(m => !String(m.id).startsWith('local_')).map(m => [m.id, copia(m)]));
    const chamadas = []; let numero = 0;
    t.c.supabaseClient = { from(tabela) {
        assert.equal(tabela, 'producao_mapas_teatro');
        let acao = 'select', payload, id, range;
        const q = { select() { return q; }, order() { return q; }, eq(campo, valor) { assert.equal(campo, 'id'); id = valor; return q; },
            update(p) { acao = 'update'; payload = copia(p); return q; }, insert(p) { acao = 'insert'; payload = copia(p[0]); return q; },
            delete() { acao = 'delete'; return q; }, range(a, b) { range = [a, b]; return executar('range'); },
            single() { return executar('single'); }, maybeSingle() { return executar('maybeSingle'); },
            then(ok, erro) { return executar('then').then(ok, erro); }
        };
        async function executar(tipo) {
            chamadas.push({ acao, id, payload, tipo, range });
            if (payload && opcoes.colunas && Object.keys(payload).some(k => !opcoes.colunas.includes(k))) {
                return { data: null, error: { code: 'PGRST204', message: 'Coluna ausente na tabela simulada' } };
            }
            if (opcoes.responder) return opcoes.responder({ acao, id, payload, tipo, range, rows, chamadas });
            if (opcoes.falhar === acao) return { data: null, error: { message: 'Falha sintética' } };
            if (acao === 'insert') { id = 'novo' + (++numero); rows.set(id, { id, ...payload }); }
            if (acao === 'update' && rows.has(id)) rows.set(id, { id, ...payload });
            if (acao === 'delete') { const existe = rows.delete(id); return { data: existe ? [{ id }] : [], error: null }; }
            if (acao !== 'select') return { data: copia(rows.get(id) || null), error: null };
            if (id) return { data: copia(rows.get(id) || null), error: null };
            const lista = [...rows.values()];
            return { data: copia(range ? lista.slice(range[0], range[1] + 1) : lista), error: null };
        }
        return q;
    } };
    return { rows, chamadas };
}

let passou = 0;
async function teste(nome, fn) {
    try { await fn(); passou++; }
    catch (e) { console.error('FALHOU:', nome); throw e; }
}

(async () => {
    await teste('mapa antigo mostra Fila sem alterar configuração nem pedir salvamento', () => {
        const t = montar(); t.c.editarMapaTeatro('m1');
        const antes = copia(t.c.state.mapaAtual.config);
        assert.equal(t.get('mapa-conjunto-nome').value, 'Fila');
        t.c.atualizarNomeConjuntoMapa(true);
        assert.deepEqual(copia(t.c.state.mapaAtual.config), antes);
        assert.equal(t.c.mapaTemAlteracoes(), false);
    });
    await teste('nome do conjunto salva por setor e reaparece ao editar', async () => {
        const t = montar(); const b = clienteSimulado(t); t.c.editarMapaTeatro('m1');
        t.get('mapa-conjunto-nome').value = 'Mesa'; t.c.atualizarNomeConjuntoMapa();
        assert.equal(t.get('mapa-adicionar-conjunto').textContent, 'Adicionar Mesa no Mapa');
        assert.equal(t.c.mapaTemAlteracoes(), true);
        t.c.adicionarSetorMapa();
        assert.equal(t.get('mapa-conjunto-nome').value, 'Fila');
        t.get('mapa-conjunto-nome').value = 'Sala'; t.c.atualizarNomeConjuntoMapa();
        assert.equal(await t.c.salvarMapaTeatro(), true);
        assert.deepEqual(b.rows.get('m1').config.setores.map(s => s.nomeConjunto), ['Mesa', 'Sala']);
        t.c.editarMapaTeatro('m1');
        assert.equal(t.get('mapa-conjunto-nome').value, 'Mesa');
        t.c.setorSelecionadoIdx = 1; t.c.carregarSetorNoSidebar();
        assert.equal(t.get('mapa-conjunto-nome').value, 'Sala');
    });
    await teste('desfazer nome restaura campo e preserva posições e numeração', () => {
        const t = montar(); t.c.editarMapaTeatro('m1');
        const antes = copia(t.c.state.mapaAtual.config);
        t.get('mapa-conjunto-nome').value = 'Camarote'; t.c.atualizarNomeConjuntoMapa();
        t.c.undoMapHistory();
        assert.deepEqual(copia(t.c.state.mapaAtual.config), antes);
        assert.equal(t.get('mapa-conjunto-nome').value, 'Fila');
        assert.equal(t.get('mapa-adicionar-conjunto').textContent, 'Adicionar Fila no Mapa');
    });
    await teste('nome livre normaliza espaços e campo vazio retorna a Fila', () => {
        const t = montar(); t.c.editarMapaTeatro('m1');
        t.get('mapa-conjunto-nome').value = '  Área   VIP  '; t.c.atualizarNomeConjuntoMapa(true);
        assert.equal(t.get('mapa-conjunto-nome').value, 'Área VIP');
        assert.equal(t.c.state.mapaAtual.config.setores[0].nomeConjunto, 'Área VIP');
        t.get('mapa-conjunto-nome').value = '   '; t.c.atualizarNomeConjuntoMapa(true);
        assert.equal(t.get('mapa-conjunto-nome').value, 'Fila');
        assert.equal(t.c.state.mapaAtual.config.setores[0].nomeConjunto, 'Fila');
    });
    await teste('salvar confirma mapa antes de persistir PDFs e informa envio concluído', async () => {
        const t = montar(); const b = clienteSimulado(t); let recebido;
        t.c.MapasTeatroPdf = { async gerar() { return { revisao: 'sintetica' }; }, abrir() {} };
        t.c.MapasTeatroPdfStorage = { async persistir(m) { recebido = copia(m); assert.deepEqual(recebido, b.rows.get('m1')); return { estado: 'pronto' }; } };
        await t.c.salvarMapaTeatro();
        assert.match(t.confirmacoes.at(-1).mensagem, /arquivos também foram salvos para o ERP/);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
    });
    await teste('falha de upload mantém salvamento confirmado e PDFs locais', async () => {
        const t = montar(); const b = clienteSimulado(t); let aberto;
        t.c.MapasTeatroPdf = { async gerar() { return { revisao: 'sintetica' }; }, abrir(r) { aberto = r; } };
        t.c.MapasTeatroPdfStorage = { async persistir() { throw Error('Upload interrompido'); } };
        assert.equal(await t.c.salvarMapaTeatro(), true);
        assert.match(t.confirmacoes.at(-1).mensagem, /envio dos PDFs para o ERP está pendente: Upload interrompido/);
        assert.equal(aberto.persistencia.estado, 'pendente'); assert.equal(t.c.state.mapaAtual, null);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
    });
    await teste('abrir PDFs consulta persistência sem iniciar upload nem regravar mapa', async () => {
        const t = montar(); const b = clienteSimulado(t); let aberto, consultas = 0;
        t.c.MapasTeatroPdf = { async gerar() { return { revisao: 'sintetica' }; }, abrir(r) { aberto = r; } };
        t.c.MapasTeatroPdfStorage = { async consultar() { consultas++; return { estado: 'pendente' }; }, persistir() { throw Error('Upload indevido'); } };
        await t.c.abrirPdfsMapaTeatro('m1');
        assert.equal(consultas, 1); assert.equal(aberto.mapaPersistido.id, 'm1');
        assert.equal(b.chamadas.filter(x => x.acao !== 'select').length, 0);
    });
    await teste('salvar gera PDFs somente do mapa confirmado e oferece os arquivos', async () => {
        const t = montar(); const b = clienteSimulado(t); let origem, aberto = false;
        t.c.MapasTeatroPdf = { async gerar(m) { origem = copia(m); return { revisao: 'sintetica' }; }, abrir() { aberto = true; } };
        t.get('mapa-nome').value = 'Mapa com PDF'; await t.c.salvarMapaTeatro();
        assert.deepEqual(origem, b.rows.get('m1')); assert.ok(aberto);
        assert.equal(t.confirmacoes.at(-1).textoOk, 'Ver PDFs');
    });
    await teste('falha de PDF mantém o mapa salvo e permite gerar novamente sem regravar', async () => {
        const t = montar(); const b = clienteSimulado(t); let falhar = true, aberto = false;
        t.c.MapasTeatroPdf = { async gerar() { if (falhar) throw Error('PDF indisponível'); return {}; }, abrir() { aberto = true; } };
        assert.equal(await t.c.salvarMapaTeatro(), true); assert.equal(t.c.state.mapaAtual, null);
        assert.match(t.confirmacoes.at(-1).mensagem, /PDFs ainda não estão prontos/);
        falhar = false; await t.c.abrirPdfsMapaTeatro('m1'); assert.ok(aberto);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
    });
    await teste('gravação negada não inicia geração de PDF', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'update' }); let gerou = false;
        t.c.MapasTeatroPdf = { async gerar() { gerou = true; } };
        await t.c.salvarMapaTeatro(); assert.equal(gerou, false);
    });
    await teste('botão PDFs relê mapa existente e usa a versão atual do servidor', async () => {
        const t = montar(); const b = clienteSimulado(t); b.rows.get('m1').name = 'Servidor atualizado'; let origem;
        t.c.MapasTeatroPdf = { async gerar(m) { origem = m; return {}; }, abrir() {} };
        t.c.renderTabelaMapas(); assert.equal(t.get('tbody-mapas').children[0]._botoes.length, 4);
        await t.get('tbody-mapas').children[0]._botoes[3].onclick();
        assert.equal(origem.name, 'Servidor atualizado'); assert.equal(b.chamadas.filter(x => x.acao !== 'select').length, 0);
    });
    await teste('PDF de rascunho ou leitura negada não usa cache antigo nem grava', async () => {
        const t = montar(); const b = clienteSimulado(t, { falhar: 'select' }); let gerou = false;
        t.c.MapasTeatroPdf = { async gerar() { gerou = true; } };
        await t.c.abrirPdfsMapaTeatro('local_rascunho'); await t.c.abrirPdfsMapaTeatro('m1');
        assert.equal(gerou, false); assert.equal(b.chamadas.filter(x => x.acao !== 'select').length, 0);
        assert.equal(t.confirmacoes.at(-1).titulo, 'PDF não disponível');
    });
    await teste('salvar funciona na tabela que possui somente name e config para gravação', async () => {
        const t = montar(); const b = clienteSimulado(t, { colunas: ['name', 'config'] });
        t.get('mapa-nome').value = 'Mapa gravado';
        await t.c.salvarMapaTeatro();
        assert.equal(t.get('modal-mapa-teatro').style.display, 'none');
        assert.equal(b.rows.get('m1').name, 'Mapa gravado');
        assert.ok(b.chamadas.some(x => x.acao === 'select' && x.id === 'm1'));
    });
    await teste('cancelar confirmação de salvar não envia dados nem fecha o editor', async () => {
        const t = montar(); const b = clienteSimulado(t); t.get('mapa-nome').value = 'Nome pendente';
        t.c.confirmarPopup = async o => { t.confirmacoes.push(o); return false; };
        assert.equal(await t.c.salvarMapaTeatro(), false);
        assert.equal(b.chamadas.length, 0); assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
        assert.equal(t.get('mapa-nome').value, 'Nome pendente');
    });
    await teste('confirmação pendente bloqueia duplo clique e saída antes da resposta', async () => {
        const t = montar(); const b = clienteSimulado(t); let responder;
        t.c.confirmarPopup = o => { t.confirmacoes.push(o); return o.somenteOk ? Promise.resolve(true) : new Promise(r => { responder = r; }); };
        const salvamento = t.c.salvarMapaTeatro();
        await t.c.salvarMapaTeatro(); await t.c.fecharModalMapaTeatro();
        assert.equal(b.chamadas.length, 0); assert.equal(t.confirmacoes.length, 1);
        responder(true); assert.equal(await salvamento, true);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
        assert.equal(t.confirmacoes.at(-1).titulo, 'Mapa salvo');
    });
    await teste('fechar mapa existente sem alterações dispensa confirmação', async () => {
        const t = montar(); t.c.editarMapaTeatro('m1');
        assert.equal(await t.c.fecharModalMapaTeatro(), true);
        assert.equal(t.confirmacoes.length, 0); assert.equal(t.c.state.mapaAtual, null);
    });
    await teste('alteração apenas no nome exige confirmação e cancelamento preserva a edição', async () => {
        const t = montar(); t.c.editarMapaTeatro('m1'); t.get('mapa-nome').value = 'Nome não salvo';
        t.c.confirmarPopup = async o => { t.confirmacoes.push(o); return false; };
        assert.equal(await t.c.fecharModalMapaTeatro(), false);
        assert.equal(t.confirmacoes[0].titulo, 'Sair sem salvar?'); assert.equal(t.confirmacoes[0].focoCancelar, true);
        assert.equal(t.get('mapa-nome').value, 'Nome não salvo'); assert.equal(t.c.state.mapas[0].name, 'Teatro Sintético');
    });
    await teste('alterações de assentos exigem confirmação; descarte não altera o mapa cadastrado', async () => {
        const t = montar(); t.c.editarMapaTeatro('m1'); t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'] = cadeira('B');
        assert.equal(await t.c.fecharModalMapaTeatro(), true); assert.equal(t.confirmacoes.length, 1);
        assert.equal(Object.keys(t.c.state.mapas[0].config.setores[0].cadeiras).length, 1);
        assert.equal(t.c.state.mapaAtual, null);
    });
    await teste('desfazer até o estado inicial permite sair sem alerta de alteração', async () => {
        const t = montar(); t.c.editarMapaTeatro('m1'); t.c.pushToMapHistory();
        t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'] = cadeira(2); t.c.undoMapHistory();
        await t.c.fecharModalMapaTeatro(); assert.equal(t.confirmacoes.length, 0);
    });
    await teste('mapa novo ainda não gravado pede confirmação antes de sair', async () => {
        const t = montar(); t.c.novoMapaTeatro(); t.c.confirmarPopup = async o => { t.confirmacoes.push(o); return false; };
        await t.c.fecharModalMapaTeatro(); assert.equal(t.confirmacoes.length, 1);
        assert.equal(t.get('modal-mapa-teatro').style.display, 'flex'); assert.ok(!t.c.state.mapaAtual.id);
    });
    await teste('recarregar avisa somente quando existe alteração pendente', () => {
        const t = montar(); t.c.editarMapaTeatro('m1'); let bloqueios = 0;
        const evento = { preventDefault() { bloqueios++; } };
        t.eventos.beforeunload[0](evento); assert.equal(bloqueios, 0);
        t.get('mapa-nome').value = 'Outro nome'; t.eventos.beforeunload[0](evento);
        assert.equal(bloqueios, 1); assert.equal(evento.returnValue, '');
        t.get('mapa-nome').value = 'Teatro Sintético'; t.eventos.beforeunload[0](evento); assert.equal(bloqueios, 1);
    });
    await teste('gravação em andamento impede saída e recarregamento mesmo sem alteração anterior', async () => {
        const t = montar(); t.c.editarMapaTeatro('m1'); let responder;
        clienteSimulado(t, { responder({ acao, id, payload, rows }) {
            if (acao === 'update') return new Promise(resolve => { responder = () => { rows.set(id, { id, ...payload }); resolve({ data: rows.get(id), error: null }); }; });
            return { data: rows.get(id), error: null };
        } });
        const salvamento = t.c.salvarMapaTeatro(); await new Promise(r => setImmediate(r));
        assert.equal(await t.c.fecharModalMapaTeatro(), false); assert.equal(t.get('mapa-nome').disabled, true);
        let bloqueado = false; t.eventos.beforeunload[0]({ preventDefault() { bloqueado = true; } }); assert.ok(bloqueado);
        responder(); await salvamento; assert.equal(t.get('mapa-nome').disabled, false);
    });
    await teste('erro de gravação abre popup visível e não oferece sucesso', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'update' }); await t.c.salvarMapaTeatro();
        assert.deepEqual(t.confirmacoes.map(o => o.titulo), ['Salvar mapa de teatro?', 'Mapa não salvo']);
        assert.equal(t.confirmacoes[1].zIndex, 1000000); assert.equal(t.confirmacoes[1].somenteOk, true);
        assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
    });
    await teste('confirmação indisponível não grava nem descarta os dados', async () => {
        const t = montar(); const b = clienteSimulado(t); delete t.c.confirmarPopup;
        await t.c.salvarMapaTeatro(); await t.c.fecharModalMapaTeatro(); assert.equal(b.chamadas.length, 0);
        assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
    });
    await teste('mapa novo com ID recebido e confirmação de leitura falha continua protegido ao sair', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'select' }); t.c.novoMapaTeatro();
        await t.c.salvarMapaTeatro(); assert.equal(t.c.state.mapaAtual.id, 'novo1');
        t.c.confirmarPopup = async o => { t.confirmacoes.push(o); return false; };
        assert.equal(await t.c.fecharModalMapaTeatro(), false);
        assert.equal(t.confirmacoes.at(-1).titulo, 'Sair sem salvar?');
        let bloqueado = false; t.eventos.beforeunload[0]({ preventDefault() { bloqueado = true; } }); assert.ok(bloqueado);
    });
    await teste('lista conta cadeiras e ignora assentos apagados', () => {
        const t = montar(); t.c.state.mapas[0].config.setores[0] = {
            nome: 'Plateia', fileiras: [{ inicio: 1, fim: 10, padrao: 'impar' }],
            cadeiras: { '0,0': cadeira(1), '1,0': cadeira(3), '2,0': { ...cadeira(5), isErased: true } }
        };
        t.c.renderTabelaMapas(''); assert.match(t.get('tbody-mapas').children[0].innerHTML, /2 Assentos/);
    });
    await teste('busca literal e nomes não inserem HTML', () => {
        const t = montar(); t.c.state.mapas[0].name = '[<img src=x onerror=alert(1)>]';
        t.c.renderTabelaMapas('['); const html = t.get('tbody-mapas').children[0].innerHTML;
        assert.ok(html.includes('<mark')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img'));
    });
    await teste('clicar e arrastar não usam função indefinida', () => {
        const t = montar(); t.grid();
        assert.doesNotThrow(() => t.c.onMapMouseDown({ button: 0, clientX: 1, clientY: 1 }));
        assert.ok(t.c.cadeirasSelecionadas.has('0,0'));
        t.c.setMapTool('pan'); t.c.onMapMouseDown({ button: 0, clientX: 1, clientY: 1 });
        assert.doesNotThrow(() => t.c.onMapMouseMove({ buttons: 1, clientX: 2, clientY: 2 }));
    });
    await teste('movimento bloqueia colisão sem perder cadeira ou histórico', () => {
        const t = montar(); const s = t.c.state.mapaAtual.config.setores[0];
        s.cadeiras['1,0'] = cadeira(2); t.c.cadeirasSelecionadas.add('0,0'); t.tecla('ArrowRight');
        assert.equal(Object.keys(s.cadeiras).length, 2); assert.equal(s.cadeiras['1,0'].num, 2);
        assert.equal(t.c.state.mapaHistory.length, 0); assert.equal(t.avisos[0].tipo, 'warning');
    });
    await teste('grupo move simultaneamente e desfaz preservando assentos', () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'] = cadeira(2);
        t.c.cadeirasSelecionadas = new Set(['0,0', '1,0']); t.tecla('ArrowRight');
        const s = t.c.state.mapaAtual.config.setores[0]; assert.equal(s.cadeiras['1,0'].num, 1); assert.equal(s.cadeiras['2,0'].num, 2);
        t.c.undoMapHistory(); assert.equal(t.c.state.mapaAtual.config.setores[0].cadeiras['0,0'].num, 1);
    });
    await teste('borracha inicia histórico mesmo com mousedown em espaço vazio', () => {
        const t = montar(); t.grid(); t.c.setMapTool('erase');
        t.c.onMapMouseDown({ button: 0, clientX: 65, clientY: 1 });
        t.c.onMapMouseMove({ buttons: 1, clientX: 1, clientY: 1 });
        assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length, 0);
        t.c.undoMapHistory(); assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length, 1);
    });
    await teste('filas numéricas 1-4 com assentos A-D geram os dezesseis rótulos', () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras = {};
        for (const [k, v] of [['prefix', '1-4'], ['inicio', 'A'], ['fim', 'D'], ['padrao', 'sequencial']]) t.get('mapa-fileira-' + k).value = v;
        t.c.gerarFileiraNoCanvas();
        const cadeiras = Object.values(t.c.state.mapaAtual.config.setores[0].cadeiras);
        assert.equal(cadeiras.length, 16);
        assert.deepEqual(cadeiras.map(c => `${c.prefixo}:${c.num}`), ['1:A','1:B','1:C','1:D','2:A','2:B','2:C','2:D','3:A','3:B','3:C','3:D','4:A','4:B','4:C','4:D']);
    });
    for (const [fila, inicio, fim, prefixos, lugares] of [
        ['A-C', '1', '3', ['A','B','C'], [1,2,3]],
        ['1-4', '1', '3', ['1','2','3','4'], [1,2,3]],
        ['A-C', 'A', 'D', ['A','B','C'], ['A','B','C','D']],
        ['9-11', 'A', 'B', ['9','10','11'], ['A','B']],
        ['AA-AC', 'Y', 'AB', ['AA','AB','AC'], ['Y','Z','AA','AB']],
        ['C-A', '1', '2', ['C','B','A'], [1,2]],
        ['4-1', 'A', 'B', ['4','3','2','1'], ['A','B']],
        ['a-c', ' a ', ' d ', ['A','B','C'], ['A','B','C','D']]
    ]) await teste(`faixa ${fila} / ${inicio}-${fim} preserva todos os prefixos e lugares`, () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras = {};
        for (const [k,v] of [['prefix',fila],['inicio',inicio],['fim',fim],['padrao','sequencial']]) t.get('mapa-fileira-'+k).value=v;
        t.c.gerarFileiraNoCanvas();
        const s=t.c.state.mapaAtual.config.setores[0];
        assert.deepEqual(Object.values(s.cadeiras).map(c=>[c.prefixo,c.num]), prefixos.flatMap(p=>lugares.map(n=>[p,n])));
        assert.equal(s.fileiras.length,prefixos.length);
    });
    for (const [inicio,fim] of [['A','3'],['1','D'],['D','A'],['0','3'],['','D'],['A1','D'],['A','!'],['1','999999999']]) {
        await teste(`intervalo inválido ${inicio}-${fim} não altera configuração ou histórico`, () => {
            const t=montar();t.get('mapa-fileira-prefix').value='A';t.get('mapa-fileira-inicio').value=inicio;t.get('mapa-fileira-fim').value=fim;
            const antes=JSON.stringify(t.c.state.mapaAtual.config);t.c.gerarFileiraNoCanvas();
            assert.equal(JSON.stringify(t.c.state.mapaAtual.config),antes);assert.equal(t.c.state.mapaHistory.length,0);assert.equal(t.avisos.at(-1).tipo,'warning');
        });
    }
    await teste('assentos alfabéticos usam sequência completa e impedem duplicações sem confundir A com 1', () => {
        const t=montar();for(const [k,v]of [['prefix','A'],['inicio','A'],['fim','D'],['padrao','impar']])t.get('mapa-fileira-'+k).value=v;
        t.c.gerarFileiraNoCanvas();assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length,5);
        assert.equal(t.get('mapa-fileira-padrao').value,'sequencial');assert.equal(t.get('mapa-fileira-padrao').disabled,true);
        const antes=JSON.stringify(t.c.state.mapaAtual.config);t.c.gerarFileiraNoCanvas();assert.equal(JSON.stringify(t.c.state.mapaAtual.config),antes);
        t.get('mapa-fileira-inicio').value='5';t.get('mapa-fileira-fim').value='6';t.c.atualizarPadraoDaFileira();assert.equal(t.get('mapa-fileira-padrao').disabled,false);
    });
    await teste('intervalos numéricos preservam os padrões par e ímpar após voltar de letras', () => {
        for(const [padrao,esperado]of [['par',[2,4,6]],['impar',[1,3,5]]]){
            const t=montar();t.c.state.mapaAtual.config.setores[0].cadeiras={};
            t.get('mapa-fileira-inicio').value='A';t.get('mapa-fileira-fim').value='D';t.c.atualizarPadraoDaFileira();
            t.get('mapa-fileira-inicio').value='1';t.get('mapa-fileira-fim').value='6';t.c.atualizarPadraoDaFileira();
            t.get('mapa-fileira-prefix').value='1';t.get('mapa-fileira-padrao').value=padrao;t.c.gerarFileiraNoCanvas();
            assert.deepEqual(Object.values(t.c.state.mapaAtual.config.setores[0].cadeiras).map(c=>c.num),esperado);
            assert.equal(t.get('mapa-fileira-padrao').disabled,false);
        }
    });
    await teste('filas sobrepostas rejeitam toda inclusão alfabética e desfazer restaura mapa', () => {
        const t=montar();t.c.state.mapaAtual.config.setores[0].cadeiras={};
        for(const[k,v]of [['prefix','A-C,B'],['inicio','A'],['fim','D'],['padrao','sequencial']])t.get('mapa-fileira-'+k).value=v;
        t.c.gerarFileiraNoCanvas();assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length,0);assert.equal(t.c.state.mapaHistory.length,0);
        t.get('mapa-fileira-prefix').value='1-4';t.c.gerarFileiraNoCanvas();assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length,16);
        t.c.undoMapHistory();assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length,0);
    });
    await teste('seleção e arraste de assentos alfabéticos preenchem a próxima letra, inclusive Z-AA', () => {
        const t=montar();t.c.state.mapaAtual.config.setores[0].cadeiras={'0,0':cadeira('Z','1'),'1,0':cadeira('AA','1')};t.grid();
        t.c.onMapMouseDown({button:0,clientX:1,clientY:1});assert.equal(t.get('mapa-fileira-inicio').value,'AA');
        t.c.onMapMouseMove({buttons:1,clientX:33,clientY:1});assert.equal(t.get('mapa-fileira-inicio').value,'AB');
        assert.equal(t.get('mapa-fileira-prefix').value,'1');
    });
    await teste('restauração completa a lacuna alfabética e impede rótulo repetido', () => {
        const t=montar();t.c.state.mapaAtual.config.setores[0].cadeiras={'0,0':cadeira('A'),'2,0':cadeira('C')};t.grid();t.c.setMapTool('restore');
        t.c.onMapMouseDown({button:0,clientX:33,clientY:1});assert.equal(t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'].num,'B');
        t.c.state.mapaAtual.config.setores[0].cadeiras={'0,0':cadeira('A'),'5,0':cadeira('B')};
        t.c.onMapMouseDown({button:0,clientX:33,clientY:1});assert.equal(t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'],undefined);assert.match(t.avisos.at(-1).msg,/já existe/);
    });
    await teste('restauração antes de A não inventa rótulo e inclusão de letras não sobrescreve posição ocupada', () => {
        const t=montar();t.c.state.mapaAtual.config.setores[0].cadeiras={'1,0':cadeira('A')};t.grid();t.c.setMapTool('restore');
        t.c.onMapMouseDown({button:0,clientX:1,clientY:1});assert.equal(t.c.state.mapaAtual.config.setores[0].cadeiras['0,0'],undefined);
        t.c.state.mapaAtual.config.setores[0].cadeiras={'0,0':cadeira('A'),'1,0':cadeira('X','Outro')};
        for(const[k,v]of [['prefix','A'],['inicio','B'],['fim','C'],['padrao','sequencial']])t.get('mapa-fileira-'+k).value=v;
        const antes=JSON.stringify(t.c.state.mapaAtual.config);t.c.gerarFileiraNoCanvas();assert.equal(JSON.stringify(t.c.state.mapaAtual.config),antes);
    });
    await teste('salvamento e reabertura preservam letras, filas numéricas e total real', async () => {
        const t=montar();const b=clienteSimulado(t);t.c.state.mapaAtual.config.setores[0].cadeiras={};
        for(const[k,v]of [['prefix','1-4'],['inicio','A'],['fim','D'],['padrao','sequencial']])t.get('mapa-fileira-'+k).value=v;
        t.c.gerarFileiraNoCanvas();await t.c.salvarMapaTeatro();assert.equal(Object.keys(b.rows.get('m1').config.setores[0].cadeiras).length,16);
        assert.equal(b.rows.get('m1').config.setores[0].fileiras[0].inicio,'A');assert.equal(b.rows.get('m1').config.setores[0].fileiras[0].fim,'D');
        t.c.editarMapaTeatro('m1');assert.deepEqual(Object.values(t.c.state.mapaAtual.config.setores[0].cadeiras).slice(0,4).map(c=>c.num),['A','B','C','D']);
    });
    await teste('abrir mapa existente mostra propriedades do primeiro setor', () => {
        const t = montar(); t.c.editarMapaTeatro('m1');
        assert.equal(t.get('mapa-setor-props').style.display, 'flex'); assert.equal(t.get('mapa-setor-nome').value, 'Plateia');
        assert.equal(t.get('mapa-fileira-padrao').value, 'sequencial');
    });
    await teste('desfazer criação do setor não acessa índice inexistente', () => {
        const t = montar(); t.c.adicionarSetorMapa(); t.c.undoMapHistory();
        assert.equal(t.c.setorSelecionadoIdx, 0); assert.equal(t.get('mapa-setor-nome').value, 'Plateia');
    });
    await teste('adicionar e editar tipos não inicia novos loops de animação', async () => {
        const t = montar(); t.c.initMapCanvas(); assert.equal(t.frames.size, 1);
        t.c.adicionarTipoAssentoMapa(); t.c.atualizarTipoAssento(0, 'nome', 'Teste'); assert.equal(t.frames.size, 1);
        await t.c.fecharModalMapaTeatro(); assert.equal(t.frames.size, 0);
    });
    await teste('remover todos os tipos não quebra desenho com assentos', () => {
        const t = montar(); t.c.state.mapaAtual.config.tiposAssento = []; assert.doesNotThrow(() => t.c.initMapCanvas());
    });
    await teste('fileira ímpar conta cinco assentos e impede duplicação', () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras = {};
        for (const [k, v] of [['prefix', 'A'], ['inicio', '1'], ['fim', '10'], ['padrao', 'impar']]) t.get('mapa-fileira-' + k).value = v;
        t.c.gerarFileiraNoCanvas(); assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length, 5);
        t.c.gerarFileiraNoCanvas(); assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length, 5);
        assert.equal(t.c.state.mapaHistory.length, 1);
    });
    await teste('intervalo inválido não altera configuração', () => {
        const t = montar(); t.get('mapa-fileira-inicio').value = '10'; t.get('mapa-fileira-fim').value = '1';
        const antes = JSON.stringify(t.c.state.mapaAtual.config); t.c.gerarFileiraNoCanvas();
        assert.equal(JSON.stringify(t.c.state.mapaAtual.config), antes);
    });
    await teste('adicionar fileira bloqueia posição ocupada sem aplicar parcialmente', () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'] = cadeira(1, 'B');
        for (const [k, v] of [['prefix', 'A'], ['inicio', '2'], ['fim', '3'], ['padrao', 'sequencial']]) t.get('mapa-fileira-' + k).value = v;
        const antes = JSON.stringify(t.c.state.mapaAtual.config); t.c.gerarFileiraNoCanvas();
        assert.equal(JSON.stringify(t.c.state.mapaAtual.config), antes); assert.equal(t.c.state.mapaHistory.length, 0);
    });
    await teste('inserir a partir da cadeira selecionada desloca vizinhos sem perda', () => {
        const t = montar(); t.c.state.mapaAtual.config.setores[0].cadeiras['1,0'] = cadeira(1, 'B');
        for (const [k, v] of [['prefix', 'A'], ['inicio', '2'], ['fim', '3'], ['padrao', 'sequencial']]) t.get('mapa-fileira-' + k).value = v;
        t.c.cadeirasSelecionadas.add('0,0'); t.c.gerarFileiraNoCanvas();
        const assentos = t.c.state.mapaAtual.config.setores[0].cadeiras;
        assert.equal(Object.keys(assentos).length, 4); assert.equal(assentos['3,0'].prefixo, 'B');
        assert.equal(assentos['1,0'].num, 2); assert.equal(assentos['2,0'].num, 3);
    });
    await teste('restaurar não cria rótulo de assento já existente', () => {
        const t = montar(); t.grid(); t.c.state.mapaAtual.config.setores[0].cadeiras['2,0'] = cadeira(2);
        t.get('mapa-fileira-prefix').value = 'A'; t.get('mapa-fileira-padrao').value = 'sequencial';
        t.c.setMapTool('restore'); t.c.onMapMouseDown({ button: 0, clientX: 33, clientY: 1 });
        assert.equal(Object.keys(t.c.state.mapaAtual.config.setores[0].cadeiras).length, 2);
        assert.equal(t.c.state.mapaHistory.length, 0);
    });
    await teste('rascunho local vira cadastro remoto sem deixar cópia após falha de confirmação', async () => {
        const t = montar(); t.c.state.mapaAtual.id = 'local_1'; t.c.state.mapas = [copia(t.c.state.mapaAtual)];
        let falhou = false;
        clienteSimulado(t, { responder({ acao, id, payload, rows }) {
            if (acao === 'insert') { rows.set('novo', { id: 'novo', ...payload }); return { data: rows.get('novo'), error: null }; }
            if (acao === 'select' && !falhou) { falhou = true; return { data: null, error: { message: 'Falha de confirmação' } }; }
            if (acao === 'update') rows.set(id, { id, ...payload });
            return { data: rows.get(id), error: null };
        } });
        await t.c.salvarMapaTeatro(); assert.equal(t.c.state.mapas[0].id, 'local_1');
        await t.c.salvarMapaTeatro(); assert.equal(t.c.state.mapas.length, 1); assert.equal(t.c.state.mapas[0].id, 'novo');
    });
    await teste('update negado mantém editor e alterações, sem sucesso falso', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'update' }); t.get('mapa-nome').value = 'Alterado';
        await t.c.salvarMapaTeatro(); assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
        assert.equal(t.c.state.mapaAtual.name, 'Alterado'); assert.equal(t.c.state.mapas[0].name, 'Teatro Sintético');
        assert.ok(!t.avisos.some(a => a.tipo === 'success')); assert.equal(t.get('mapa-nome').disabled, false);
    });
    await teste('update zero linhas não é sucesso', async () => {
        const t = montar(); const b = clienteSimulado(t); b.rows.clear();
        await t.c.salvarMapaTeatro(); assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
        assert.ok(!t.avisos.some(a => a.tipo === 'success'));
    });
    await teste('update confirmado preserva assentos e confirma por releitura sem colunas ausentes', async () => {
        const t = montar(); const b = clienteSimulado(t); t.get('mapa-nome').value = 'Alterado';
        await t.c.salvarMapaTeatro(); assert.equal(t.get('modal-mapa-teatro').style.display, 'none');
        assert.equal(t.c.state.mapas[0].name, 'Alterado'); assert.equal(Object.keys(b.rows.get('m1').config.setores[0].cadeiras).length, 1);
        assert.deepEqual(Object.keys(b.chamadas.find(x => x.acao === 'update').payload).sort(), ['config', 'name']);
        assert.ok(b.chamadas.some(x => x.acao === 'select' && x.id === 'm1'));
    });
    await teste('duplo clique em salvar não duplica gravação', async () => {
        const t = montar(); const b = clienteSimulado(t);
        await Promise.all([t.c.salvarMapaTeatro(), t.c.salvarMapaTeatro()]);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
    });
    await teste('insert com falha na releitura preserva ID e repete somente update', async () => {
        const t = montar(); delete t.c.state.mapaAtual.id; let falhou = false;
        const b = clienteSimulado(t, { responder({ acao, id, payload, rows }) {
            if (acao === 'insert') { rows.set('novo', { id: 'novo', ...payload }); return { data: rows.get('novo'), error: null }; }
            if (acao === 'select' && !falhou) { falhou = true; return { data: null, error: { message: 'falha de confirmação' } }; }
            if (acao === 'update') rows.set(id, { id, ...payload });
            return { data: rows.get(id), error: null };
        } });
        await t.c.salvarMapaTeatro(); assert.equal(t.c.state.mapaAtual.id, 'novo');
        await t.c.salvarMapaTeatro(); assert.equal(b.chamadas.filter(x => x.acao === 'insert').length, 1);
        assert.equal(b.chamadas.filter(x => x.acao === 'update').length, 1);
    });
    await teste('confirmação divergente mantém editor aberto', async () => {
        const t = montar(); clienteSimulado(t, { responder({ acao, payload }) {
            return { data: { id: 'm1', ...payload, name: acao === 'select' ? 'Outra versão' : payload.name }, error: null };
        } });
        await t.c.salvarMapaTeatro(); assert.equal(t.get('modal-mapa-teatro').style.display, 'flex');
    });
    await teste('falha ao excluir mantém mapa no cache', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'delete' }); await t.c.excluirMapaTeatro('m1');
        assert.equal(t.c.state.mapas.length, 1); assert.ok(!t.avisos.some(a => a.tipo === 'success'));
    });
    await teste('exclusão confirmada remove cadastro e cache', async () => {
        const t = montar(); const b = clienteSimulado(t); await t.c.excluirMapaTeatro('m1');
        assert.equal(t.c.state.mapas.length, 0); assert.equal(b.rows.size, 0);
    });
    await teste('falha ao copiar não anuncia cópia salva; abre editor recuperável', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'insert' }); await t.c.duplicarMapaTeatro('m1');
        assert.equal(t.c.state.mapas.length, 1); assert.equal(t.c.state.mapaAtual.name, 'Cópia de Teatro Sintético');
        assert.ok(!t.avisos.some(a => a.tipo === 'success'));
    });
    await teste('cópia confirmada preserva configuração e totais', async () => {
        const t = montar(); clienteSimulado(t); await t.c.duplicarMapaTeatro('m1');
        assert.equal(t.c.state.mapas.length, 2); const salvo = t.c.state.mapas.find(x => x.id !== 'm1');
        const original = t.c.state.mapas.find(x => x.id === 'm1');
        assert.deepEqual(copia(salvo.config), copia(original.config)); assert.equal(Object.keys(salvo.config.setores[0].cadeiras).length, 1);
        salvo.config.setores[0].cadeiras['0,0'].num = 9;
        assert.equal(original.config.setores[0].cadeiras['0,0'].num, 1);
    });
    await teste('servidor vazio elimina cache antigo e preserva rascunhos locais', async () => {
        const t = montar(); const b = clienteSimulado(t); b.rows.clear();
        t.storage.set('vibe_mapas_teatro', JSON.stringify([mapa(), mapa('local_rascunho')]));
        await t.c.fetchMapasTeatro(); assert.deepEqual(copia(t.c.state.mapas.map(x => x.id)), ['local_rascunho']);
    });
    await teste('falha de leitura preserva cache', async () => {
        const t = montar(); clienteSimulado(t, { falhar: 'select' }); await t.c.fetchMapasTeatro(); assert.equal(t.c.state.mapas.length, 1);
    });
    await teste('sincronização completa lê mais de uma página', async () => {
        const t = montar(); const b = clienteSimulado(t); b.rows.clear();
        for (let i = 0; i < 501; i++) b.rows.set('m' + i, mapa('m' + i));
        await t.c.fetchMapasTeatro(); assert.equal(t.c.state.mapas.length, 501);
        assert.equal(b.chamadas.filter(x => x.range).length, 2);
    });
    await teste('cache inválido não impede leitura do servidor', async () => {
        const t = montar(); clienteSimulado(t); t.storage.set('vibe_mapas_teatro', '{inválido');
        await t.c.fetchMapasTeatro(); assert.equal(t.c.state.mapas.length, 1);
    });
    await teste('API local usa configuração existente e exige releitura', async () => {
        const t = montar(); const chamadas = []; let salvo;
        t.c.api = async (method, path, payload) => {
            chamadas.push([method, path]); if (method === 'PUT') { salvo = { id: 'm1', ...copia(payload) }; return { status: 'success' }; }
            return salvo;
        };
        await t.c.salvarMapaTeatro(); assert.deepEqual(chamadas.map(x => x[0]), ['PUT', 'GET']);
        assert.equal(t.get('modal-mapa-teatro').style.display, 'none');
    });
    await teste('seletores Imp e Pedido recebem novas opções e preservam seleção', () => {
        const t = montar(true); t.c.populateImpMapasTeatro('ped'); t.c.populateImpMapasTeatro('imp');
        t.c.state.mapas.push(mapa('m2')); t.c.populateImpMapasTeatro('ped');
        assert.equal(t.get('ped-mapa-teatro').options.length, 3); assert.equal(t.get('ped-mapa-teatro').value, 'm1');
        t.c.state.mapas = []; t.c.populateImpMapasTeatro('ped'); assert.equal(t.get('ped-mapa-teatro').value, '');
    });
    await teste('mesmo ID editado atualiza os assentos da prévia', async () => {
        const t = montar(true); await t.c.loadMapaTeatroData('m1'); assert.equal(t.producao.csvData.length, 1);
        t.c.state.mapas[0].config.setores[0].cadeiras['1,0'] = cadeira(2);
        await t.c.loadMapaTeatroData('m1'); assert.equal(t.producao.csvData.length, 2);
    });
    await teste('carregamento do Pedido atualiza a própria tela', async () => {
        const t = montar(true); let imp = 0, ped = 0;
        t.c.updateImpSummary = () => imp++; t.c.updatePedSummary = () => ped++;
        await t.c.loadMapaTeatroData('m1', 'ped'); assert.equal(imp, 0); assert.equal(ped, 1);
    });
    await teste('falha de carregamento pode ser repetida sem trava por ID', async () => {
        const t = montar(true); t.c.state.mapas = []; let vezes = 0;
        t.c.api = async () => { if (++vezes === 1) throw Error('falha sintética'); return mapa(); };
        assert.equal(await t.c.loadMapaTeatroData('m1'), false);
        assert.equal(await t.c.loadMapaTeatroData('m1'), true); assert.equal(vezes, 2);
    });
    await teste('troca de seleção descarta resposta atrasada do mapa anterior', async () => {
        const t = montar(true); t.c.state.mapas = []; const pendentes = {};
        t.c.api = (method, path) => new Promise(resolve => { pendentes[path.split('/').pop()] = resolve; });
        const a = t.c.loadMapaTeatroData('m1'); t.get('imp-mapa-teatro').value = 'm2'; const b = t.c.loadMapaTeatroData('m2');
        pendentes.m2(mapa('m2', { '0,0': cadeira(2) })); await b;
        pendentes.m1(mapa()); assert.equal(await a, false); assert.equal(t.producao.csvData[0].Numero, '2');
    });
    await teste('retirar seleção invalida carregamento pendente', async () => {
        const t = montar(true); t.c.state.mapas = []; let resolver;
        t.c.api = () => new Promise(resolve => { resolver = resolve; });
        const carga = t.c.loadMapaTeatroData('m1'); t.get('imp-mapa-teatro').value = ''; await t.c.loadMapaTeatroData('');
        resolver(mapa()); assert.equal(await carga, false); assert.equal(t.producao.csvData, null);
    });
    await teste('prévia não duplica consulta nem recursa no resumo', async () => {
        const t = montar(true); t.c.state.mapas = []; let resolver, consultas = 0, resumos = 0;
        t.c.api = () => { consultas++; return new Promise(resolve => { resolver = resolve; }); };
        t.c.updateImpSummary = () => { if (++resumos > 2) throw Error('recursão'); t.c.loadMapaTeatroData('m1'); };
        const a = t.c.loadMapaTeatroData('m1'), b = t.c.loadMapaTeatroData('m1');
        resolver(mapa()); await Promise.all([a, b]); assert.equal(consultas, 1); assert.equal(resumos, 1);
    });
    await teste('pré geração relê o servidor e bloqueia mapa vazio ou indisponível', async () => {
        const t = montar(true); const b = clienteSimulado(t); b.rows.set('m1', mapa('m1', { '0,0': cadeira(1), '1,0': cadeira(2) }));
        await t.c.loadMapaTeatroData('m1'); assert.equal(t.producao.csvData.length, 1);
        assert.equal(await t.c.garantirMapaTeatroDoTrabalho('imp'), true); assert.equal(t.producao.csvData.length, 2);
        b.rows.set('m1', mapa('m1', {})); assert.equal(await t.c.garantirMapaTeatroDoTrabalho('imp'), false);
        b.rows.clear(); assert.equal(await t.c.garantirMapaTeatroDoTrabalho('imp'), false);
    });
    await teste('modelos comuns passam sem consultar mapas', async () => {
        const t = montar(true); t.producao.numeracoes[0].tipo = 'SEQUENCIAL';
        assert.equal(await t.c.garantirMapaTeatroDoTrabalho('imp'), true);
    });
    await teste('trocar tipo durante consulta não injeta assentos no modelo comum', async () => {
        const t = montar(true); t.c.state.mapas = []; let resolver;
        t.c.api = () => new Promise(resolve => { resolver = resolve; });
        const carga = t.c.loadMapaTeatroData('m1'); t.producao.numeracoes[0].tipo = 'SEQUENCIAL';
        t.producao.csvData = [{ Codigo: 'Banco do outro modelo' }];
        resolver(mapa()); assert.equal(await carga, false);
        assert.equal(t.producao.csvData[0].Codigo, 'Banco do outro modelo');
    });
    await teste('sair de Teatro preserva o banco recém-carregado de outro modelo', async () => {
        const t = montar(true); await t.c.loadMapaTeatroData('m1');
        const banco = [{ Codigo: 'Outro banco' }]; t.producao.csvData = banco;
        t.c.liberarMapaTeatroDaTela('imp'); assert.equal(t.producao.csvData, banco);
    });
    await teste('migração legada não sobrescreve posições nem descarta setor ausente', async () => {
        const t = montar(); t.c.state.mapaAtual.config.cadeiras = {
            '0,0': { ...cadeira(2), setorIdx: 0 }, '3,0': { ...cadeira(3), setorIdx: 9 }
        };
        t.c.migrarDadosAntigos(); assert.equal(t.c.state.mapaAtual.config.setores[0].cadeiras['0,0'].num, 1);
        assert.equal(Object.keys(t.c.state.mapaAtual.config.cadeiras).length, 2);
        await assert.rejects(t.c.persistirMapaTeatro(t.c.state.mapaAtual));
    });
    await teste('gravação confirmada invalida consulta de lista iniciada antes dela', async () => {
        const t = montar(); let resolver;
        clienteSimulado(t, { responder() { return new Promise(resolve => { resolver = resolve; }); } });
        const carga = t.c.fetchMapasTeatro(); const salvo = { ...mapa(), name: 'Depois' };
        t.c.registrarMapaSalvo(salvo, 'm1'); resolver({ data: [mapa()], error: null }); await carga;
        assert.equal(t.c.state.mapas[0].name, 'Depois');
    });
    await teste('geração real do Pedido usa mapa relido e bloqueia falha antes do transporte', async () => {
        const { fixture } = require('./impressao_combinada_fluxo_harness.js');
        for (const falhar of [false, true]) {
            const f = fixture(); f.c.state.selectedOSItems = [f.c.state.selectedOSItems[0]];
            Object.assign(f.items[0], { qtd: 2, quantidade: 2, num_inicial: 1, num_final: 2 });
            f.c.state.numeracoes[0].tipo = 'TEATRO'; f.elements['ped-mapa-teatro'] = { value: 'm1' };
            f.c.updatePedSummary = () => {}; f.c.drawPedPreview = () => {};
            f.c.supabaseClient = { from(tabela) {
                assert.equal(tabela, 'producao_mapas_teatro');
                return { select() { return this; }, eq() { return this; }, single: async () => ({
                    data: falhar ? null : mapa('m1', { '0,0': cadeira(1), '1,0': cadeira(2) }),
                    error: falhar ? { message: 'Falha sintética' } : null
                }) };
            } };
            await f.c.runPedImposition('pdf');
            assert.equal(f.calls.requests.length, falhar ? 0 : 1, JSON.stringify(f.calls.notices));
            if (!falhar) {
                assert.equal(f.calls.requests[0].mapa_teatro_id, 'm1');
                assert.equal(f.c.state.csvData.length, 2);
            }
        }
    });
    await teste('geração das duas telas usa preflight e respeita ordem de dados', () => {
        const imp = scriptFonte.slice(scriptFonte.indexOf('window.runImposition = async function'), scriptFonte.indexOf('window.runImposition = async function') + 2500);
        const ped = pedidoFonte.slice(pedidoFonte.indexOf('async function executarPedImposition('), pedidoFonte.indexOf('async function executarPedImposition(') + 3500);
        assert.match(imp, /if \(!await garantirMapaTeatroDoTrabalho\('imp'\)\) return/);
        assert.match(ped, /if \(!await garantirMapaTeatroDoTrabalho\('ped'\)\) return/);
        assert.match(pedidoFonte, /populateImpMapasTeatro\('ped'\)/);
    });
    console.log('OK: ' + passou + ' regressões de Mapas de Teatro.');
})().catch(e => { console.error(e); process.exitCode = 1; });
