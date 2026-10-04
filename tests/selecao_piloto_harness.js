const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const src = fs.readFileSync('frontend/pedido.js','utf8').replace(/\r\n/g,'\n');
const nome = 'async function enviarParaPedido(';
const i = src.indexOf(nome), func = src.slice(i,src.indexOf('\n}',i)+2);
const script = fs.readFileSync('frontend/script.js','utf8').replace(/\r\n/g,'\n');
const normalizadorInicio = script.indexOf('function normalizarNumeracaoLida(');
const normalizador = script.slice(normalizadorInicio, script.indexOf('\n}',normalizadorInicio)+2);
function montar() {
    const item = {id:10,_modeloOnline:{id:10},arte_url:'https://test.invalid/a.pdf'};
    const c = {Promise,TextEncoder,Uint8Array,AbortSignal,structuredClone,crypto:webcrypto,state:{numeracoes:[]},
        mensagens:[], cargas:[], chamadas:[], falha:false, esperar:null,
        findOSInState:()=>({numero:99}), getOSItens:()=>[item], loadOSItens:async()=>true};
    c.window = c;
    c.toast=s=>c.mensagens.push(s);
    c.fetch=async(url,opts)=>{
        c.chamadas.push(url);
        if(url.endsWith('preparar-pedido-painel')){
            const body=JSON.parse(opts.body); if(c.esperar)await c.esperar;
            if(c.falha)return {ok:false};
            return {ok:true,json:async()=>({pedido:'99',sem_arte:[],pacotes:[{modelo:'10',digest:body.modelos[0].digest,revisao:'b'.repeat(64),origem:'local',atualizado:true,
                fontes:{frente:item.arte_url},recursos:{frente:'/api/pacotes-locais/recurso-painel/10/'+'b'.repeat(64)+'/frente'}}]})};
        }
        assert.ok(url.startsWith('/api/pacotes-locais/recurso-painel/'));
        return {ok:true,headers:{get:()=> 'local'}};
    };
    c.carregarModeloParaPedido=async(id,os,ctx)=>{
        await c.PilotoSelecao.lerArte(ctx.pacoteLocal,'frente',item.arte_url);
        if(ctx.aindaAtual())c.cargas.push(id);
    };
    vm.createContext(c);vm.runInContext(normalizador+'\n'+fs.readFileSync('frontend/selecao-piloto.js','utf8')+'\n'+func,c);
    return c;
}
(async()=>{
    // A linha bruta pertence ao digest; a forma normalizada pertence à tela
    // e à conferência final. Não apagar METADATA antes de conferir a origem.
    const met=montar();met.getOSItens()[0]._modeloOnline.amostra_num_id=7;
    const raw={id:7,print_mode:'front',elements:[{type:'METADATA',print_mode:'duplex'},{type:'TEXT',text:'Teste'}],csv_data:[]};
    const antes=JSON.stringify(raw);let digestRecebido;
    met.supabaseClient={from(){return{select(){return this;},in(){return this;},abortSignal(){return this;}};}};
    met.lerDadosLista=async()=>({data:[raw]});
    const fetchOriginal=met.fetch;
    met.fetch=async(u,o)=>{if(u.endsWith('preparar-pedido-painel'))digestRecebido=JSON.parse(o.body).modelos[0].digest;return fetchOriginal(u,o);};
    await met.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    assert.equal(JSON.stringify(raw),antes);
    assert.equal(met.state.numeracoes[0].print_mode,'duplex');
    assert.equal(met.state.numeracoes[0].elements.length,1);
    const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
    const esperado=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canon([met.getOSItens()[0]._modeloOnline,[raw]]))));
    assert.equal(digestRecebido,Buffer.from(esperado).toString('hex'));
    const copia=met.normalizarNumeracaoLida(structuredClone(raw));
    assert.equal(JSON.stringify(met.state.numeracoes[0]),JSON.stringify(copia));
    const c=montar();let liberar;c.esperar=new Promise(r=>liberar=r);
    const p=c.PilotoSelecao.conferirPedido('vibe_99',()=>true);await new Promise(r=>setImmediate(r));
    await assert.rejects(c.enviarParaPedido(10,'vibe_99'));assert.equal(c.cargas.length,0);
    liberar();await p;await c.enviarParaPedido(10,'vibe_99');assert.equal(c.cargas.length,1);assert.equal(c.state.pedidoSelecaoCarregando,null);
    c.state.activeOSItem={itemId:10,osId:'vibe_99'};
    c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]);
    await c.PilotoSelecao.lerUrl('https://test.invalid/a.pdf');
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([{itemId:11,osId:'vibe_99'}]));
    c.getOSItens()[0]._modeloOnline.quantidade=3;
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    delete c.getOSItens()[0]._modeloOnline.quantidade;
    assert.ok(c.chamadas.every(u=>u.startsWith('/api/pacotes-locais/')));
    await c.enviarParaPedido(10,'vibe_99');assert.equal(c.chamadas.filter(u=>u.endsWith('preparar-pedido-painel')).length,1);
    assert.equal(c.PilotoSelecao.referencias([c.state.activeOSItem])[0].modelo,'10');
    c.falha=true;await assert.rejects(c.PilotoSelecao.conferirPedido('vibe_99',()=>true));
    await assert.rejects(c.enviarParaPedido(10,'vibe_99'));assert.ok(c.state.pedidoSelecaoErro);assert.equal(c.cargas.length,2);
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    const d=montar();let fim;d.esperar=new Promise(r=>fim=r);const antigo=d.PilotoSelecao.conferirPedido('vibe_99',()=>true);
    await new Promise(r=>setImmediate(r));d.PilotoSelecao.iniciarPedido('outro');fim();await antigo;
    await assert.rejects(d.enviarParaPedido(10,'vibe_99'));assert.equal(d.cargas.length,0);
    await assert.rejects(d.PilotoSelecao.lerArte({modelo:'10',revisao:'b'.repeat(64),fontes:{frente:'outra'},recursos:{}},'frente','https://test.invalid/a.pdf'));
    console.log('OK: conferência por pedido, troca sem rede, reabertura, bloqueio, revisão alterada e resposta abandonada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
