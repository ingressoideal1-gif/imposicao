const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const dados = {
    pedidos_modelos: [
        {id:1,id_int:10,id_produto_proposta_origem:100,amostra_num_id:5,status_arte:'APROVADO',status_producao:'PENDENTE',arte_url:'https://test.invalid/a.pdf'},
        {id:2,id_int:10,id_produto_proposta_origem:100,status_arte:'EM ARTE',arte_url:'https://test.invalid/b.pdf'},
        {id:3,id_int:10,id_produto_proposta_origem:100,status_arte:'APROVADO',status_impressao:'Impresso',arte_url:'https://test.invalid/c.pdf'},
        {id:4,id_int:11,id_produto_proposta_origem:101,status_arte:'APROVADO',status_impressao:'Aguardando',arte_url:'https://test.invalid/d.pdf'}],
    propostas_os: [{id_int:10,data_termino:'2026-09-27'}, {id_int:11,data_termino:'2026-09-26'}],
    produtos_proposta: [{id:100,id_int:10,id_produto:7}, {id:101,id_int:11,id_produto:8}],
    produtos: [{id_produto:7,setor_pcp:'Laser'}, {id_produto:8,setor_pcp:'Offset'}],
    producao_numeracoes: [{id:5, elements:[{font_url:'https://test.invalid/f.ttf'}], csv_data:[{foto:'https://test.invalid/p.jpg'}]}]
};
let logado = true, divergir = false, leituras = 0;
const client = {auth:{getUser:async()=>({data:{user:logado ? {id:'sintetico'} : null}})},from:tabela=>{
    let ids, coluna, inicio, fim;
    const q = {select(){return q},in(c,v){coluna=c;ids=v;return q},order(){return q},
        range(a,b){inicio=a;fim=b;return q},abortSignal(signal){
            if(signal.aborted) return Promise.reject(new Error('abort'));
            const r=dados[tabela].filter(x=>ids.some(id=>String(id)===String(x[coluna]))).slice(inicio,fim+1).map(x=>structuredClone(x));
            if(tabela==='pedidos_modelos' && coluna==='id' && divergir && r[0]) r[0].status_arte='EM ARTE';
            leituras++;return Promise.resolve({data:r});
        }};return q;
}};
const ctx={crypto:webcrypto,TextEncoder,Date,Set,Map,structuredClone,
    SINAIS_NA_GRAFICA:['EM PRODUCAO'],pedidoNaGrafica:p=>p.status_interno==='EM PRODUCAO',
    pedidoJaPassouDaGrafica:()=>false,pedidoIgnoradoNosPaineis:()=>false};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('frontend/antecipacao-pedidos.js','utf8'),ctx);
const api=ctx.AntecipacaoPedidos;
const consultar=opts=>api.consultar({cliente:client,empresa:'Ingresso Ideal',setor:'laser',
    propostas:async()=>({data:[{id_int:10,status_interno:'EM PRODUCAO'},{id_int:11,status_interno:'EM PRODUCAO'}]}),
    signal:new AbortController().signal,...opts});
(async()=>{
    const r=await consultar();
    assert.deepEqual(Array.from(r.itens,x=>x.modelo),['1','4']);
    assert.equal(r.itens[0].setor,'Laser');
    assert.equal(r.itens[0].prazo,api.prazo('2026-09-27'));
    assert.equal(Object.keys(r.itens[0].fontes).length,3);
    assert.match(r.itens[0].observacao.digest,/^[a-f0-9]{64}$/);
    assert.equal(r.itens[0].observacao.aprovacao,'APROVADO');
    const lote=await consultar({limite:1});
    assert.equal(lote.proximo,1);
    assert.equal((await consultar({limite:1,inicio:lote.proximo})).itens[0].modelo,'4');
    const entregues=[];let proximo=0;
    await assert.rejects(consultar({receber: async item=>{
        if(item.modelo==='4') throw new Error('Sem recibo');
        entregues.push(item.modelo);
    }, avancar:v=>{proximo=v}}),/Sem recibo/);
    assert.deepEqual(entregues,['1'],'uma falha tardia não descarta recibos anteriores');
    assert.equal(proximo,1,'retoma pelo primeiro candidato ainda sem recibo');
    divergir=true;await assert.rejects(consultar(),/mudaram/);divergir=false;
    logado=false;const antes=leituras;await assert.rejects(consultar(),/Entre no painel/);
    assert.equal(leituras,antes,'sem sessão não deve ler tabelas');
    logado=true;const controle=new AbortController();controle.abort();await assert.rejects(consultar({signal:controle.signal}));
    assert.equal(dados.pedidos_modelos[0].status_arte,'APROVADO','fonte não foi alterada');
    console.log('OK: coleta somente leitura, prazo ERP, prioridade, paginação, sessão e alteração concorrente');
})().catch(e=>{console.error(e);process.exitCode=1});
