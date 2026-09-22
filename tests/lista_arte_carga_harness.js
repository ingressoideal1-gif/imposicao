// Carregadores reais, relógio controlado e integrações sintéticas; sem rede.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const config = fs.readFileSync('frontend/supabase-config.js', 'utf8');
function extrair(nome, texto = source) {
    let inicio = texto.indexOf('function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    if (texto.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    return texto.slice(inicio, texto.indexOf('\n}', inicio) + 2);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function ambiente() {
    const timers = new Map(), requests = [], estados = [];
    let numeroTimer = 0;
    const c = {
        state: { ordens: [{ id: 'anterior', numero: 99 }], osItens: { anterior: [] }, todasArtes: [{ id_int: 99 }], modelosGlobais: { 99: [] } },
        console: { log() {}, warn() {}, error() {} }, AbortController,
        setTimeout: (fn, ms) => { const id = ++numeroTimer; timers.set(id, {fn, ms}); return id; },
        clearTimeout: id => timers.delete(id),
        bloqueada: '', falharProdutos: false, cargas: 0, renders: 0,
        mostrarEstadoCargaLista: (mensagem, erro) => estados.push({mensagem, erro}),
        renderOrdens: () => c.renders++, toast() {}, conferirNovosPedidosDoUsuario() {},
        carregarLinksExistentes: async () => {}, carregarTemposNoCard: async () => {},
        carregarPagamentosGlobais: async () => {}, sincronizarStatusOrdensDinamico: async () => {},
        garantirLinksDosPedidosNaListaArte: async () => {},
        sincronizarAprovacaoProdutosPrateleira: () => new Promise(() => {}),
        aplicarRegraProdutoPrateleira() {}, normalizarStatusImpressao: x => x,
        conferirColunasQrIdealDosPedidos() {}, populateDesignerFilter() {}, populateAtendenteFilter() {},
        loadOrdensFromVibecode: async () => { c.state.ordens = [{id:'novo',numero:1}]; return true; }
    };
    const cliente = {from: tabela => {
        const q = {
            select() { return this; }, order() { return this; }, in() { return this; }, eq() { return this; },
            abortSignal(signal) { this.signal = signal; return this; },
            then(resolve, reject) {
                const dados = tabela === 'produtos_proposta' ? [{id:1,id_int:1}] : [];
                if (tabela === 'produtos_proposta') c.cargas++;
                if (tabela === c.bloqueada) return new Promise(r => {
                    requests.push({tabela, signal:q.signal, resolver:data => { resolve({data}); r(); }});
                }).then(undefined, reject);
                resolve(c.falharProdutos && tabela === 'produtos_proposta' ? {error:Error('Offline')} : {data:dados});
                return Promise.resolve();
            }
        };
        return q;
    }};
    c.supabaseClient = cliente; c.vibeClient = cliente;
    vm.createContext(c);
    vm.runInContext('let _cargaOrdensEmAndamento=null;\n' + [
        'lerDadosLista','iniciarComplementoLista','completarDadosDaLista','loadOrdens',
        'carregarOrdensDados','carregarArtesGlobais','loadUsuarios','carregarModelosGlobais'
    ].map(n => extrair(n)).join('\n'), c);
    return {c,timers,requests,estados};
}
(async () => {
    for (const tabela of ['pedidos_artes','usuarios','produtos_proposta','pedidos_modelos']) {
        const {c,timers,requests,estados} = ambiente();
        const anterior = c.state.ordens;
        const modelosAnteriores = c.state.modelosGlobais;
        c.bloqueada = tabela;
        const carga = c.loadOrdens();
        assert.equal(c.loadOrdens(),carga,'cliques simultâneos compartilham a leitura');
        await tick();
        assert.equal(requests.length,1,tabela);
        const guardas = [...timers.values()];
        assert.equal(guardas.length,1,'somente a leitura pendente mantém seu relógio');
        assert.equal(guardas[0].ms,30000);
        guardas[0].fn();
        assert.equal(await carga,false);
        assert.equal(requests[0].signal.aborted,true,'cancela a requisição pendente');
        assert.equal(c.state.ordens,anterior,'preserva os pedidos anteriores');
        assert.equal(c.state.modelosGlobais,modelosAnteriores,'preserva os modelos anteriores');
        assert.equal(estados.at(-1).erro,true);
        c.bloqueada = '';
        assert.equal(await c.loadOrdens(),true,'retry funciona sem recarregar a página');
        const novasOrdens = c.state.ordens, novasArtes = c.state.todasArtes, novosModelos = c.state.modelosGlobais;
        requests[0].resolver([{id:999,id_int:999,nome_usuario:'Resposta atrasada'}]);
        await tick();
        assert.equal(c.state.ordens,novasOrdens);
        assert.equal(c.state.todasArtes,novasArtes,'resposta vencida não entra no estado');
        assert.equal(c.state.modelosGlobais,novosModelos);
        assert.equal(timers.size,0);
    }
    {
        const {c} = ambiente(); c.falharProdutos=true;
        const anteriores=c.state.ordens;
        assert.equal(await c.loadOrdens(),false);
        assert.equal(c.state.ordens,anteriores,'erro de produtos não vira lista vazia/fallback');
    }
    {
        const {c} = ambiente(); let ultimaPintura;
        c.renderOrdens=()=>{ ultimaPintura=c.state.pagamentosGlobais; };
        c.carregarPagamentosGlobais=async()=>{ c.state.pagamentosGlobais={1:['sintético']}; };
        await c.loadOrdens(); await tick();
        assert.equal(ultimaPintura,c.state.pagamentosGlobais,'complemento rápido também é desenhado');
    }
    {
        const {c} = ambiente();
        const pendentes={}; const chamadas={};
        for (const nome of ['carregarPagamentosGlobais','sincronizarStatusOrdensDinamico','garantirLinksDosPedidosNaListaArte','carregarTemposNoCard']) {
            chamadas[nome]=0;
            c[nome]=()=>{ chamadas[nome]++; return new Promise(r=>{pendentes[nome]=r;}); };
        }
        assert.equal(await c.loadOrdens(),true);
        assert(c.renders>0);
        const artes=c.state.todasArtes, modelos=c.state.modelosGlobais;
        const inicio=source.indexOf("    if (viewId === 'view-lista-arte') {");
        const hook=source.slice(inicio,source.indexOf('\n    }',inicio)+6);
        vm.runInContext("const viewId='view-lista-arte';"+hook,c);
        assert.equal(c.state.todasArtes,artes,'reabrir não zera artes');
        assert.equal(c.state.modelosGlobais,modelos,'reabrir não zera modelos');
        await c.loadOrdens();
        assert.equal(c.cargas,2,'nova leitura não espera os complementos');
        Object.values(chamadas).forEach(n=>assert.equal(n,1,'não duplica manutenção pendente'));
        Object.values(pendentes).forEach(r=>r()); await tick();
    }
    {
        let ativas=0,max=0;
        const c={requisitarPropostas:async (_acao,body,_recurso,sinal)=>{
            assert.equal(sinal?.aborted,false);
            ativas++;max=Math.max(max,ativas);await tick();ativas--;
            return body.offset ? [] : [{id_int:body.numeros[0]}];
        }};
        vm.createContext(c);vm.runInContext(extrair('consultarPropostas',config),c);
        const controle=new AbortController();
        const resposta=await c.consultarPropostas({tipo:'numeros',numeros:Array.from({length:801},(_,i)=>i+1)},undefined,'consultar',controle.signal);
        assert.equal(resposta.error,null);assert.equal(max,3);
        assert.deepEqual(Array.from(resposta.data,r=>r.id_int),[1,201,401,601,801],'ordem estável apesar do paralelismo');
        controle.abort();
        const cancelada=await c.consultarPropostas({tipo:'numeros',numeros:[1]},undefined,'consultar',controle.signal);
        assert.equal(cancelada.data,null);assert(cancelada.error);
        let leituras=0;
        c.requisitarPropostas=async (_acao,body)=>{
            leituras++;
            return body.offset ? [] : body.numeros.slice(0,body.limite).map(id_int=>({id_int}));
        };
        const limitada=await c.consultarPropostas({tipo:'numeros',numeros:Array.from({length:801},(_,i)=>i+1)},250);
        assert.equal(limitada.data.length,250,'limite total preservado');
        assert.equal(leituras,3,'duas páginas do primeiro lote, uma do segundo');
        c.requisitarPropostas=async (_acao,body)=>{
            if(body.numeros[0]===201) throw Error('Lote recusado');
            return body.offset ? [] : [{id_int:body.numeros[0]}];
        };
        const parcial=await c.consultarPropostas({tipo:'numeros',numeros:Array.from({length:401},(_,i)=>i+1)});
        assert.equal(parcial.data,null,'falha de um lote não vira lista parcial');
        assert.match(parcial.error.message,/Lote recusado/);
    }
    const puppeteer=require('puppeteer');
    const browser=await puppeteer.launch({headless:true});
    try {
        const page=await browser.newPage();
        await page.setViewport({width:390,height:800});
        await page.setContent('<section id="view-lista-arte"><p>Pedido anterior</p></section>');
        await page.addScriptTag({content:'window.tentativas=0;function loadOrdens(){tentativas++;}\n'+extrair('mostrarEstadoCargaLista')});
        await page.evaluate(()=>mostrarEstadoCargaLista('Falha de leitura. Dados anteriores preservados.',true));
        await page.click('#lista-arte-estado-carga button');
        assert.equal(await page.evaluate(()=>tentativas),1);
        assert.equal(await page.$eval('#view-lista-arte p',el=>el.textContent),'Pedido anterior');
        await page.evaluate(()=>mostrarEstadoCargaLista('Carregando pedidos…'));
        assert.equal(await page.$eval('#lista-arte-estado-carga button',el=>el.hidden),true);
        await page.evaluate(()=>mostrarEstadoCargaLista(''));
        assert.equal(await page.$eval('#lista-arte-estado-carga',el=>getComputedStyle(el).display),'none');
        assert.equal(await page.$$eval('#lista-arte-estado-carga',els=>els.length),1);
    } finally { await browser.close(); }
    console.log('OK: timeout nas quatro fontes, abort, retry, resposta tardia descartada, dados preservados, navegação, complementos sem duplicação e propostas em até três lotes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
