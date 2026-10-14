const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
function extract(file, name) {
    const s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
    const i=s.indexOf('function '+name+'(');
    return (s.slice(i-6,i)==='async '?'async ':'')+s.slice(i,s.indexOf('\n}',i)+2);
}
(async()=>{
    const c={structuredClone,TextEncoder,Uint8Array,AbortSignal,crypto:webcrypto,
        state:{montagem:{gerando:true},numeracoes:[],ordens:[],osItens:{},activeOSItem:{osId:'outro',itemId:999}},
        toast:()=>{}, normalizarNumeracaoLida:x=>x, mesclarNumeracoesNoCatalogo:()=>{}, reads:[]};
    c.window=c;
    c.findOSInState=id=>c.state.ordens.find(o=>o.id===id);
    c.getOSItens=id=>c.state.osItens[id]||[];
    c.idIntDoPedido=id=>c.findOSInState(id)?.numero;
    c.PilotoOffline={carregarOrdens:async()=>{c.state.ordens=[{id:'a',numero:1},{id:'b',numero:2}];},aplicarConfirmacoes:async()=>{}};
    c.state.produtosGlobais=[{id_produto:3001}]; // Lista resumida sem id_formato.
    c.state.formatos=[{id:'F1',id_formato_num:3},{id:'F2',id_formato_num:18}];
    c.loadOSItens=async(id,opts)=>{assert.ok(opts.snapshotLocal);c.state.osItens[id]=opts.snapshotLocal.modelos.map(m=>({id:m.id,os_id:id,_vibe_id_produto:3001,_modeloOnline:m}));return true;};
    c.fetch=async(url,opts)=>{
        c.reads.push(url);
        if(url.includes('recurso-painel'))return {ok:true,headers:{get:()=> 'local'}};
        assert.equal(url,'/api/pacotes-locais/abrir-pedido-painel');
        const pedido=JSON.parse(opts.body).pedido;
        const row={id:Number(pedido)*10,id_int:Number(pedido)};
        const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row,[]])))).toString('hex');
        return {ok:true,json:async()=>({protocolo:2,pedido,revisao_pedido:'c'.repeat(64),sem_arte:[],
            snapshot:{modelos:[row],numeracoes:[],origens:[],produtos:[{id_produto:3001,id_formato:pedido==='1'?3:18}],bancos:pedido==='1'?[{id:'banco1'}]:[],vinculos:[],artes:[],mapas:[]},
            pacotes:[{modelo:String(row.id),digest,origem:'local',revisao:'b'.repeat(64),
                fontes:{frente:'https://synthetic.test/'+pedido},hashes:{frente:'f'.repeat(64)},
                recursos:{frente:'/api/pacotes-locais/recurso-painel/'+row.id+'/'+'b'.repeat(64)+'/frente'}}]})};
    };
    c.chamarBancosPedido=()=>{throw Error('Consulta remota proibida');};
    vm.createContext(c);
    vm.runInContext(fs.readFileSync('frontend/selecao-piloto.js','utf8')+'\n'+
        extract('frontend/montagem.js','_mtgPrepararPedidoLocal')+'\n'+
        extract('frontend/montagem.js','formatoDoItem')+'\n'+
        extract('frontend/montagem.js','porQueNaoCabeNaMontagem')+'\n'+
        extract('frontend/script.js','carregarBancosDoPedidoNovo')+'\n'+
        extract('frontend/script.js','garantirBancosDoTrabalho'),c);
    await c._mtgPrepararPedidoLocal('a');
    assert.equal(c.getOSItens('a')[0].formato_id,undefined);
    assert.equal(c.formatoDoItem(c.getOSItens('a')[0]).id,'F1');
    assert.equal(c.state.produtosGlobais[0].id_formato,undefined);
    // Uma revisao realmente diferente precisa continuar bloqueada.
    const produto=c.PilotoSelecao.snapshotPedido('a').produtos[0];
    produto.id_formato=18;
    assert.equal(c.porQueNaoCabeNaMontagem({formato_id:'F1'},
        {formato_id:c.formatoDoItem(c.getOSItens('a')[0]).id}),'o formato é outro');
    produto.id_formato=999;
    assert.equal(c.formatoDoItem(c.getOSItens('a')[0]),null);
    produto.id_formato=3;
    await c.garantirBancosDoTrabalho(['a']);
    assert.equal(c.state.bancosDoPedido[0].id,'banco1');
    assert.equal(c.state._bancosConsultados.a,true);
    await c._mtgPrepararPedidoLocal('b');
    assert.equal(c.formatoDoItem(c.getOSItens('b')[0]).id,'F2');
    assert.equal(c.formatoDoItem(c.getOSItens('a')[0]),null); // Nunca usar o snapshot do outro pedido.
    assert.equal(c.formatoDoItem({formato_id:'F1'}).id,'F1'); // Caminho legado.
    await c.garantirBancosDoTrabalho(['b']);
    assert.equal(c.state.bancosDoPedido.length,0);
    assert.equal(c.state._bancosConsultados.b,true);
    const alvos=[{osId:'a',itemId:10},{osId:'b',itemId:20}];
    assert.equal(c.PilotoSelecao.referencias(alvos).length,2);
    await c.PilotoSelecao.lerUrl('https://synthetic.test/1',{},alvos);
    await assert.rejects(c._mtgPrepararPedidoLocal('ausente'),/indisponível/);
    c.getOSItens('a')[0]._modeloOnline.id_int=99;
    assert.throws(()=>c.PilotoSelecao.referencias(alvos),/Reabra/);
    c.PilotoSelecao.iniciarPedido('b');
    assert.throws(()=>c.PilotoSelecao.referencias([{osId:'b',itemId:20}]),/Reabra/);
    console.log('OK: Montagem prepara pedidos locais, bancos vazios e multiplos modelos sem consulta remota.');
})().catch(e=>{console.error(e);process.exitCode=1;});
