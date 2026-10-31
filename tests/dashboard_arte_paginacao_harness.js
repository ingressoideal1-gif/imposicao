// Carregadores e guardas reais; fontes sintéticas, sem banco ou rede.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    let inicio = source.indexOf('function ' + nome + '(');
    assert(inicio >= 0, nome);
    if (source.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
const tick = () => new Promise(r => setImmediate(r));
function ambiente() {
    const dados = {
        pedidos_links_cliente: Array.from({length:1446}, (_,i) => ({id:i+1,os_id:`vibe_${i+1}`,numero_pedido:i+1,token:'sintetico'})),
        pedidos_artes: Array.from({length:1439}, (_,i) => ({id:i+1,id_int:i+1,created_at:'2026-10-25',designer_nome:'Designer sintético'})),
        produtos_proposta: Array.from({length:1205}, (_,i) => ({id:i+1,id_int:1,created_at:'2026-10-25'})),
        pedidos_modelos: Array.from({length:1205}, (_,i) => ({id:i+1,id_int:1,quantidade:1}))
    };
    const chamadas = [], pinturas = [], erros = [];
    const c = {
        state: {ordens:[{id:'anterior',numero:99}],osItens:{},todasArtes:[],linksCliente:{},linksClienteData:{},modelosGlobais:{},temposNoCard:{anterior:true}},
        console: {log(){},warn(){},error(){}}, setTimeout,clearTimeout,AbortController,
        CLIENTE_BASE_URL:'https://exemplo.invalid', temSessaoDoSupabase:async()=>true,
        recorteDaCargaDeOrdens:()=> 'dashboard-arte',
        carregarTemposNoCard:async()=>{c.state.temposNoCard={novo:true};},loadUsuarios:async()=>{},
        carregarDadosDoRecorteGrafica:()=>{throw Error('recorte inesperado');},
        loadOrdensFromVibecode:async(_pedidos,produtos)=>{
            c.state.produtosPropostaGlobais=produtos;
            c.state.ordens=[{id:'vibe_1',numero:1}];return true;
        },
        mostrarEstadoCargaLista:(mensagem,erro)=>{if(erro)erros.push(mensagem);},
        conferirNovosPedidosDoUsuario(){},iniciarComplementoLista(){},completarDadosDaLista(){},
        aplicarRegraProdutoPrateleira(){},normalizarStatusImpressao:x=>x,conferirColunasQrIdealDosPedidos(){},toast(){},
        document:{getElementById(){
            if(c.desenhando) pinturas.push({links:Object.keys(c.state.linksClienteData).length,artes:c.state.todasArtes.length,
                produtos:c.state.produtosPropostaGlobais?.length,modelos:c.state.modelosGlobais[1]?.length});
            return null;
        }}
    };
    c.window=c;
    c.supabaseClient=c.vibeClient={from(tabela){
        let inicio, fim, ids;const ordem=[];
        return {select(){return this;},eq(){return this;},abortSignal(){return this;},
            in(_col,values){ids=values;return this;},
            order(col,opcoes){ordem.push([col,opcoes?.ascending!==false]);return this;},
            range(a,b){inicio=a;fim=b;return this;},
            async then(resolve,reject){try {
                assert.notEqual(inicio,undefined,'toda consulta tem pagina');
                assert(ordem.some(([col])=>col==='id'),'desempate por chave unica');
                chamadas.push({tabela,inicio,fim});
                if(c.bloqueio?.tabela===tabela && c.bloqueio.inicio===inicio)await c.bloqueio.promessa;
                if(c.falha?.tabela===tabela && c.falha.inicio===inicio)return resolve({error:Error('falha sintética')});
                let linhas=dados[tabela].filter(l=>!ids||ids.includes(l.id_int));
                linhas=linhas.slice().sort((a,b)=>{
                    for(const [col,asc] of ordem){if(a[col]!==b[col])return (a[col]>b[col]?1:-1)*(asc?1:-1);}return 0;
                });
                resolve({data:linhas.slice(inicio,Math.min(fim+1,inicio+1000))});
            }catch(e){reject(e);}}
        };
    }};
    vm.createContext(c);
    vm.runInContext('let _cargaOrdensEmAndamento=null;\n'+[
        'lerDadosLista','loadOrdens','carregarOrdensDados','carregarLinksExistentes',
        'carregarArtesGlobais','carregarModelosGlobais','renderOrdens'
    ].map(extrair).join('\n'),c);
    vm.runInContext(fs.readFileSync('frontend/dashboard-arte.js','utf8'),c);
    for(const nome of ['renderOrdens','renderDashboardArte']){
        const desenhar=c[nome];
        c[nome]=()=>{c.desenhando=true;try{return desenhar();}finally{c.desenhando=false;}};
    }
    return {c,dados,chamadas,pinturas,erros};
}
(async()=>{
    const {c,dados,chamadas,pinturas,erros}=ambiente();
    let liberar;
    c.bloqueio={tabela:'pedidos_links_cliente',inicio:500,promessa:new Promise(r=>liberar=r)};
    const carga=c.loadOrdens();await tick();
    c.renderOrdens();c.renderDashboardArte();c.setPeriodoDashboardArte(30);
    assert.equal(pinturas.length,0,'nenhum desenho lê fontes parciais');
    assert.equal(Object.keys(c.state.linksClienteData).length,0,'links só substituídos após a última página');
    liberar();assert.equal(await carga,true);
    assert(pinturas.length>0,'desenha ao encerrar');
    for(const p of pinturas)assert.deepEqual(p,{links:1446,artes:1439,produtos:1205,modelos:1205});
    for(const tabela of Object.keys(dados))assert.deepEqual(chamadas.filter(x=>x.tabela===tabela).map(x=>x.inicio),[0,500,1000]);
    const ids=Object.keys(c.state.linksClienteData).sort();
    for(const linhas of Object.values(dados))linhas.reverse();
    pinturas.length=0;
    assert.equal(await c.loadOrdens(),true);
    assert.deepEqual(Object.keys(c.state.linksClienteData).sort(),ids,'ordem física diferente não muda o conjunto');
    for(const tabela of Object.keys(dados)){
        const anterior={ordens:c.state.ordens,links:c.state.linksClienteData,artes:c.state.todasArtes,
            modelos:c.state.modelosGlobais,produtos:c.state.produtosPropostaGlobais,tempos:c.state.temposNoCard};
        c.falha={tabela,inicio:500};pinturas.length=0;
        assert.equal(await c.loadOrdens(),false,'falha na segunda página não vira sucesso');
        assert.equal(c.state.ordens,anterior.ordens);assert.equal(c.state.linksClienteData,anterior.links);
        assert.equal(c.state.todasArtes,anterior.artes);assert.equal(c.state.modelosGlobais,anterior.modelos);
        assert.equal(c.state.produtosPropostaGlobais,anterior.produtos);assert.equal(c.state.temposNoCard,anterior.tempos);
        for(const p of pinturas)assert.deepEqual(p,{links:1446,artes:1439,produtos:1205,modelos:1205});
        c.falha=null;assert.equal(await c.loadOrdens(),true,'nova tentativa completa');
    }
    assert.equal(erros.length,4);
    dados.pedidos_links_cliente=[];
    assert.equal(await c.loadOrdens(),true);
    assert.equal(Object.keys(c.state.linksClienteData).length,0,'resposta vazia válida remove links antigos');
    console.log('OK: quatro fontes acima de 1000, ordem estável, falha intermediária, retry, vazio e desenho após carga completa.');
})().catch(e=>{console.error(e);process.exitCode=1;});
