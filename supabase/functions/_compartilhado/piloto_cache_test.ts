import { strict as assert } from 'node:assert';
import { estadoCache } from './piloto_cache.ts';
const op={perm_producao_view:true,perm_imprimir:true,empresa_id:'1'};
const entrada={empresa:'teste',pedidos:['99']};

function ambiente(status:any[]=['Impresso','IMPRESSO']) {
  const chamadas:string[]=[];
  const consultar:any=async(method:string,path:string)=> {
    assert.equal(method,'GET'); chamadas.push(path);
    if(path.startsWith('propostas?'))return [{id_int:99,empresa_id:'1'}];
    assert(path.startsWith('pedidos_modelos?'));
    return status.map((s,i)=>({id:i+1,id_int:99,status_impressao:s}));
  };
  return {consultar,chamadas};
}

Deno.test('cache: somente pedido inteiro explicitamente Impresso autoriza descarte',async()=>{
  for(const [status,impresso] of [[['Impresso',' IMPRESSO '],true],[['Impresso','Aguardando'],false],[['Impresso',null],false],[[],false]] as [any[],boolean][]) {
    const a=ambiente(status);
    const r=await estadoCache(entrada,op,a.consultar,'teste','1');
    assert.equal(r.pedidos[0].impresso,impresso);
    assert.equal(r.empresa,'teste');assert(Number.isFinite(Date.parse(r.conferido_em)));
    assert.deepEqual(r.pedidos[0].modelos,status.map((_,i)=>String(i+1)));
    assert(a.chamadas.every(p=>p.includes('id_int=eq.99')));
  }
});

Deno.test('cache: pagina completa inclui modelo pendente na pagina seguinte',async()=>{
  let leituras=0;
  const a=ambiente();
  const consultar:any=async(method:string,path:string)=> {
    if(path.startsWith('propostas?'))return a.consultar(method,path);
    assert.equal(method,'GET');leituras++;
    if(path.includes('&id=gt.0&'))return Array.from({length:500},(_,i)=>({id:i+1,id_int:99,status_impressao:'Impresso'}));
    assert(path.includes('&id=gt.500&'));
    return [{id:501,id_int:99,status_impressao:'Aguardando'}];
  };
  const r=await estadoCache(entrada,op,consultar,'teste','1');
  assert.equal(leituras,2);assert.equal(r.pedidos[0].impresso,false);assert.equal(r.pedidos[0].modelos.length,501);
});

Deno.test('cache: falta de pedido nao prova impressao; nao usa status comercial',async()=>{
  const r=await estadoCache(entrada,op,(async()=>[]) as any,'teste','1');
  assert.deepEqual(r.pedidos,[{pedido:'99',impresso:false,modelos:[]}]);
  const consultar:any=async(_:string,path:string)=>path.startsWith('propostas?')?[{id_int:99,status_interno:'ENTREGUE'}]:[{id:1,id_int:99,status_producao:'IMPRESSO'}];
  assert.equal((await estadoCache(entrada,op,consultar,'teste','1')).pedidos[0].impresso,false);
});

Deno.test('cache: recusa permissoes, empresa, pedidos invalidos e resposta incompleta',async()=>{
  const a=ambiente();
  for(const e of [{...entrada,pedidos:['99','99']},{...entrada,pedidos:['1&x=y']},{...entrada,pedidos:[]},{...entrada,pedidos:Array(33).fill('99')},{...entrada,empresa:'outra'}])
    await assert.rejects(()=>estadoCache(e,op,a.consultar,'teste','1'));
  await assert.rejects(()=>estadoCache(entrada,{},a.consultar,'teste','1'));
  await assert.rejects(()=>estadoCache(entrada,{...op,empresa_id:'2'},a.consultar,'teste','1'));
  for(const resposta of [null,{},[{id_int:99,empresa_id:'2'}]])
    await assert.rejects(()=>estadoCache(entrada,op,(async()=>resposta) as any,'teste','1'));
  await assert.rejects(()=>estadoCache(entrada,op,(async()=>{throw Error('rede');}) as any,'teste','1'));
  for(const modelo of [{id:1,id_int:98,status_impressao:'IMPRESSO'},{id:0,id_int:99,status_impressao:'IMPRESSO'}]) {
    const consultar:any=async(m:string,p:string)=>p.startsWith('propostas?')?a.consultar(m,p):[modelo];
    await assert.rejects(()=>estadoCache(entrada,op,consultar,'teste','1'));
  }
});
