// Sem rede ou banco: executa as funções reais com respostas controladas.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(process.argv[2] || 'frontend/script.js', 'utf8').replace(/\r\n/g, '\n');
function extrair(nome) {
    const inicio = src.search(new RegExp('(?:async )?function ' + nome + '\\('));
    if (inicio < 0) return '';
    return src.slice(inicio, src.indexOf('\n}', inicio) + 2);
}
const codigo = ['mapVibecodeProdutoToOSItem', 'loadOrdensFromVibecode', 'loadOSItens', 'abrirImposicaoDoPedido'].map(extrair).join('\n');
const produtos = [{id:71,id_int:99001,id_produto:1,nome_produto:'Cordão',qtd:12}, {id:72,id_int:99001,id_produto:2,nome_produto:'Crachá',qtd:12}];
const modelos = [
    {id:101,id_int:99001,id_produto_proposta_origem:71,nome_modelo:'PADRÃO',quantidade:12,bloco:50},
    {id:102,id_int:99001,id_produto_proposta_origem:72,nome_modelo:'NOMINAIS',quantidade:10,status_impressao:'Aguardando'},
    {id:103,id_int:99001,id_produto_proposta_origem:72,nome_modelo:'PADRÃO',quantidade:2,bloco:50,status_impressao:'IMPRESSO'}
];
function contexto() {
    const os = {id:'vibe_99001',numero:99001,_source:'vibecode'};
    const c = { console:{log(){},warn(){},error(){}}, Promise, Map, Set,
        state:{ordens:[os],osItens:{},formatos:[],cores:[],numeracoes:[],produtosGlobais:[],todasArtes:[]},
        localStorage:{getItem(){return null;}}, consultas:0, escritas:0, desenhos:0, avisos:[],
        retorno: {data:modelos}, erroProduto:null, espera:Promise.resolve(),
        document:{getElementById(){return null;},querySelector(){return null;}},
        podeAbrirView:()=>true, isNumeracaoDuplex:()=>false,
        aplicarRegraProdutoPrateleira(){}, resolveItemCorNumIds(){}, renderOSItens(){},
        normalizarStatusImpressao:s=>s || 'Aguardando',
        atualizarQuantidadesDoERP:async()=>{}, recarregarNumeracoesDoPedido:async()=>{},
        lerDadosLista:async v=>typeof v==='function'?v():v,
        lerLotesDaLista:async(ids,consulta)=>consulta(ids),
        consultarPropostas:async()=>({data:[{id_int:99001}]}),
        aplicarNomesPreferenciaisDasPropostas:async()=>{}, carregarHorasDosPrazos:async()=>({}),
        SINAIS_SAIU_DA_ARTE:[], pedidosJaNaGrafica:()=>new Set(), pedidoEntraNoPainel:()=>true,
        arteFoiLancada:()=>true, lerStatusOverride:()=>null, nomePreferencialDaProposta:()=>'',
    };
    c.window = {location:{hostname:'127.0.0.1',protocol:'http:'}};
    c.findOSInState=id=>c.state.ordens.find(o=>String(o.id)===String(id)||String(o.numero)===String(id));
    c.getOSItens=id=>c.state.osItens[c.findOSInState(id)?.id || id];
    c.toast=s=>c.avisos.push(s);
    c.renderPedOSQueue=()=>c.desenhos++;
    c.supabaseClient = c.vibeClient = {from(tabela) {
        const q = {select(){return q;},eq(){return q;},order(){return q;},in(){return q;},
            insert(){c.escritas++;return q;},
            then(ok,erro) {return (async()=>{
                if(tabela==='pedidos_modelos'){c.consultas++;await c.espera;return c.retorno;}
                if(tabela==='produtos_proposta') return {data:produtos,error:c.erroProduto};
                return {data:[]};
            })().then(ok,erro);}};
        return q;
    }};
    c.VersoDoModelo = require('../frontend/cor-numeracao-do-modelo.js').VersoDoModelo;
    vm.createContext(c); vm.runInContext(codigo,c);
    c.state.osItens[os.id]=produtos.map(p=>c.mapVibecodeProdutoToOSItem(p,os.id));
    return c;
}
const testes=[];
function teste(nome,fn){testes.push([nome,fn]);}
teste('abertura carrega três modelos e conserva divisão 10 + 2 impressos',async()=>{
    const c=contexto(); await c.abrirImposicaoDoPedido('vibe_99001');
    assert.deepEqual(Array.from(c.getOSItens('vibe_99001'),i=>[i.id,i.qtd,i.impressao]),[[101,12,'Aguardando'],[102,10,'Aguardando'],[103,2,'IMPRESSO']]);
    assert.equal(c.desenhos,1); assert.equal(c.escritas,0);
});
teste('atualização comercial não apaga modelos já carregados',async()=>{
    const c=contexto(); await c.loadOSItens('vibe_99001');
    assert.equal(await c.loadOrdensFromVibecode([],produtos),true);
    assert.deepEqual(Array.from(c.getOSItens('vibe_99001'),i=>i.id),[101,102,103]);
});
teste('aberturas concorrentes aguardam consulta; aliases compartilham carga',async()=>{
    const c=contexto(); let liberar; c.espera=new Promise(r=>liberar=r);
    const op={atualizar:true,exigirModelos:true};
    const primeira=c.loadOSItens('vibe_99001',op); let acabou=false;
    const segunda=c.loadOSItens(99001,op).then(()=>acabou=true);
    await new Promise(r=>setImmediate(r));
    assert.equal(acabou,false); assert.equal(c.consultas,1);
    liberar(); await Promise.all([primeira,segunda]);
    assert.equal(c.getOSItens('vibe_99001').length,3);
});
teste('reabrir consulta novamente e reflete alterações do modelo',async()=>{
    const c=contexto(); await c.abrirImposicaoDoPedido('vibe_99001');
    c.retorno={data:modelos.map(m=>m.id===102?{...m,quantidade:9}:m)};
    await c.abrirImposicaoDoPedido('vibe_99001');
    assert.equal(c.consultas,2); assert.equal(c.getOSItens('vibe_99001')[1].qtd,9);
});
for(const tipo of ['rede','vazio','produto','sem-cliente']) teste('falha '+tipo+' não abre itens comerciais nem escreve modelos',async()=>{
    const c=contexto();
    if(tipo==='rede') c.retorno={error:{message:'sem rede'}};
    if(tipo==='vazio') c.retorno={data:[]};
    if(tipo==='produto') c.erroProduto={message:'sem acesso'};
    if(tipo==='sem-cliente') c.supabaseClient=null;
    await c.abrirImposicaoDoPedido('vibe_99001');
    assert.equal(c.desenhos,0); assert.equal(c.escritas,0); assert.ok(c.avisos.length);
});
teste('nova tentativa recupera após falha',async()=>{
    const c=contexto(); c.retorno={error:{message:'falha'}};
    await c.abrirImposicaoDoPedido('vibe_99001'); c.retorno={data:modelos};
    await c.abrirImposicaoDoPedido('vibe_99001'); assert.equal(c.desenhos,1);
});
teste('consulta simples em andamento não dispensa atualização da abertura',async()=>{
    const c=contexto(); await c.loadOSItens('vibe_99001');
    c.retorno={data:modelos.map(m=>m.id===102?{...m,quantidade:8}:m)};
    await Promise.all([c.loadOSItens('vibe_99001'),c.abrirImposicaoDoPedido('vibe_99001')]);
    assert.equal(c.getOSItens('vibe_99001')[1].qtd,8);
});
(async()=>{let falhas=0;for(const[nome,fn]of testes){try{await fn();console.log('OK '+nome);}catch(e){falhas++;console.error('FALHA '+nome+': '+e.message);}}if(falhas)process.exitCode=1;})();
