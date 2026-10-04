const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const src = fs.readFileSync('frontend/pedido.js','utf8').replace(/\r\n/g,'\n');
const nome = 'async function enviarParaPedido(';
const i = src.indexOf(nome), func = src.slice(i,src.indexOf('\n}',i)+2);
function montar() {
    const item = {id:10,_modeloOnline:{id:10},arte_url:'https://test.invalid/a.pdf'};
    const c = {Promise,TextEncoder,Uint8Array,AbortSignal,crypto:webcrypto,state:{numeracoes:[]},
        mensagens:[], cargas:[], chamadas:[], falha:false, esperar:null,
        findOSInState:()=>({numero:99}), getOSItens:()=>[item], loadOSItens:async()=>true};
    c.window = c;
    c.toast=s=>c.mensagens.push(s);
    c.fetch=async(url,opts)=>{
        c.chamadas.push(url);
        if(url.endsWith('selecionar-painel')){
            const body=JSON.parse(opts.body); if(c.esperar)await c.esperar;
            if(c.falha)return {ok:false};
            return {ok:true,json:async()=>({modelo:'10',digest:body.digest,revisao:'b'.repeat(64),origem:'local',atualizado:true,
                fontes:{frente:item.arte_url},recursos:{frente:'/api/pacotes-locais/recurso-painel/10/'+'b'.repeat(64)+'/frente'}})};
        }
        assert.ok(url.startsWith('/api/pacotes-locais/recurso-painel/'));
        return {ok:true,headers:{get:()=> 'local'}};
    };
    c.carregarModeloParaPedido=async(id,os,ctx)=>{
        await c.PilotoSelecao.lerArte(ctx.pacoteLocal,'frente',item.arte_url);
        if(ctx.aindaAtual())c.cargas.push(id);
    };
    vm.createContext(c);vm.runInContext(fs.readFileSync('frontend/selecao-piloto.js','utf8')+'\n'+func,c);
    return c;
}
(async()=>{
    const c=montar();let liberar;c.esperar=new Promise(r=>liberar=r);
    const p=c.enviarParaPedido(10,'vibe_99');await new Promise(r=>setImmediate(r));
    assert.ok(c.state.pedidoSelecaoCarregando);assert.equal(c.cargas.length,0);
    liberar();await p;assert.equal(c.cargas.length,1);assert.equal(c.state.pedidoSelecaoCarregando,null);
    c.state.activeOSItem={itemId:10,osId:'vibe_99'};
    c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]);
    await c.PilotoSelecao.lerUrl('https://test.invalid/a.pdf');
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([{itemId:11,osId:'vibe_99'}]));
    c.getOSItens()[0]._modeloOnline.quantidade=3;
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    delete c.getOSItens()[0]._modeloOnline.quantidade;
    assert.ok(c.chamadas.every(u=>u.startsWith('/api/pacotes-locais/')));
    await c.enviarParaPedido(10,'vibe_99');assert.equal(c.chamadas.filter(u=>u.endsWith('selecionar-painel')).length,2);
    c.falha=true;await assert.rejects(c.enviarParaPedido(10,'vibe_99'));assert.ok(c.state.pedidoSelecaoErro);assert.equal(c.cargas.length,2);
    assert.throws(()=>c.PilotoSelecao.validarTrabalho([c.state.activeOSItem]));
    const d=montar();let fim;d.esperar=new Promise(r=>fim=r);const antigo=d.enviarParaPedido(10,'vibe_99');
    await new Promise(r=>setImmediate(r));d.state.pedidoSelecaoCarregando={};fim();await antigo;assert.equal(d.cargas.length,0);
    await assert.rejects(d.PilotoSelecao.lerArte({modelo:'10',revisao:'b'.repeat(64),fontes:{frente:'outra'},recursos:{}},'frente','https://test.invalid/a.pdf'));
    console.log('OK: bloqueio, rechecagem por seleção, atualização local, erro, resposta abandonada e URL divergente.');
})().catch(e=>{console.error(e);process.exitCode=1;});
