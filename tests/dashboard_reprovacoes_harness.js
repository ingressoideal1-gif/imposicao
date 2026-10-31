const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js','utf8');
function fn(name) {
    const start=source.indexOf('async function '+name+'(');
    assert(start>=0,name);
    return source.slice(start,source.indexOf('\n}',start)+2);
}
(async () => {
    const eventos=Array.from({length:1201},(_,i)=>({id:i+1,pedido:i+1}));
    const consultas=[];
    const c={state:{},console:{warn(){}},lerDadosLista:async q=>q,
        supabaseClient:{from(tabela){
            let cursor=0;
            return {select(){return this;},eq(){return this;},single(){return this;},
                gte(){return this;},lte(){return this;},gt(_k,v){cursor=v;return this;},
                order(k){assert.equal(k,'id');return this;},limit(n){assert.equal(n,500);return this;},
                then(resolve){
                    if(tabela.endsWith('_inicio'))return resolve({data:{iniciado_em:'2026-10-31T00:00:00Z'}});
                    consultas.push(cursor);
                    resolve(c.falha && cursor===500 ? {error:Error('falha simulada')} : {data:eventos.filter(e=>e.id>cursor).slice(0,500)});
                }
            };
        }}
    };
    vm.createContext(c);vm.runInContext(fn('carregarReprovacoesDashboardArte'),c);
    await c.carregarReprovacoesDashboardArte();
    assert.equal(c.state.reprovacoesArte.eventos.length,1201);
    assert.deepEqual(consultas,[0,500,1000]);
    c.falha=true;await c.carregarReprovacoesDashboardArte();
    assert.equal(c.state.reprovacoesArte.disponivel,false);
    assert.equal(c.state.reprovacoesArte.eventos.length,0,'nao publica metade da consulta');
    c.falha=false;await c.carregarReprovacoesDashboardArte();
    assert.equal(c.state.reprovacoesArte.disponivel,true,'recupera no refresh seguinte');

    // Executa a acao de lote real; mesmas chamadas individuais, uma identidade.
    const chamadas=[];
    const itens=[{id:1},{id:2},{id:3}];
    const lote={state:{osItens:{vibe_1:itens}},crypto:require('node:crypto').webcrypto,
        ROTULO_DA_ACAO_EM_LOTE:{REPROVADA:'Alterar'},podeAgirEmLoteNoPedido:()=>true,
        podeDestravarModeloAprovado:()=>true,planoDaAcaoEmLote:()=>({aplicar:itens,pulados:[]}),
        prompt:()=> 'alteracao sintetica',confirm:()=>true,textoDoPlanoEmLote:()=>'',
        toast(){},nomeDoModeloParaLista:()=>'',decisionAmostraItem:async (id,os,acao,opts)=>{chamadas.push({...opts});return id!==2;},
        loadOSItens:async()=>{},sincronizarStatusConsolidadoPedidoArte:async()=>{},renderAmostrasOSItens(){},console};
    lote.window=lote;vm.createContext(lote);
    const start=source.indexOf('window.acaoEmLoteNoPedido = async function(');
    vm.runInContext(source.slice(start,source.indexOf('\n};',start)+3),lote);
    await lote.acaoEmLoteNoPedido('vibe_1','REPROVADA');
    assert.equal(chamadas.length,3);assert(chamadas[0].reprovacaoAcao);
    assert.equal(new Set(chamadas.map(c=>c.reprovacaoAcao)).size,1,'falha parcial nao fragmenta a identidade do lote');
    await lote.acaoEmLoteNoPedido('vibe_1','REPROVADA');
    assert.notEqual(chamadas[0].reprovacaoAcao,chamadas[3].reprovacaoAcao,'novo clique, nova acao');
    console.log('OK: 1201 eventos, falha parcial, recuperacao e identidade compartilhada do lote real.');
})().catch(e=>{console.error(e);process.exitCode=1;});
