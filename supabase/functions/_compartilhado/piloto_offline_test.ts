import { strict as assert } from 'node:assert';
import { catalogosOffline, confirmarOffline } from './piloto_offline.ts';

Deno.test('offline: catalogos paginados filtram empresa e recusam operador sem permissao',async()=>{
 const op={perm_producao_view:true,perm_imprimir:true,empresa_id:'1'};
 const consultar=async()=>[{id:1,empresa_id:'1'},{id:2,empresa_id:'2'},{id:3}];
 const r=await catalogosOffline({empresa:'teste'},op,consultar,'teste','1');
 assert.equal(r.formatos.length,2);
 await assert.rejects(()=>catalogosOffline({empresa:'teste'},{},consultar,'teste','1'));
});

function ambiente(){
 const entrada={id:'12345678-1234-4234-9234-123456789012',empresa:'teste',pedido:'99',revisao:'a'.repeat(64),modelos:['10'],operador:'op'};
 const m={id:10,id_int:99,status_impressao:'AGUARDANDO',updated_at:'2026-10-12T12:00:00Z'};
 const escritas:any[]=[];
 const conferir:any=async()=>({revisao:'a'.repeat(64),itens:[{modelo:'10'}],snapshot:{modelos:[{...m}]}});
 const banco:any=async(method:string,path:string,body:any)=>{
  if(method==='PATCH'){escritas.push({path,body});Object.assign(m,body);return [{...m}];}
  return [{...m}];
 };
 return {entrada,m,escritas,conferir,banco};
}
Deno.test('offline: confirmacao reentregue e idempotente, filtro tem pedido e versao observada',async()=>{
 const a=ambiente();
 assert.equal((await confirmarOffline(a.entrada,{},a.banco,a.conferir)).estado,'sincronizado');
 assert.equal((await confirmarOffline(a.entrada,{},a.banco,a.conferir)).estado,'sincronizado');
 assert.equal(a.escritas.length,1);
 assert.match(a.escritas[0].path,/id_int=eq.99.*status_impressao=eq.AGUARDANDO.*updated_at=/);
 assert.deepEqual(a.escritas[0].body,{status_impressao:'IMPRESSO'});
});
Deno.test('offline: revisao diferente nao sobrescreve modelo',async()=>{
 const a=ambiente();a.entrada.revisao='b'.repeat(64);
 assert.equal((await confirmarOffline(a.entrada,{},a.banco,a.conferir)).estado,'conflito');
 assert.equal(a.escritas.length,0);
});
Deno.test('offline: recusa de autorizacao, ID estranho e corrida nao viram sucesso',async()=>{
 const a=ambiente();
 await assert.rejects(()=>confirmarOffline(a.entrada,{},a.banco,async()=>{throw Error('recusado');}));
 await assert.rejects(()=>confirmarOffline({...a.entrada,modelos:['10&outro=1']},{},a.banco,a.conferir));
 assert.equal((await confirmarOffline(a.entrada,{},async()=>[],a.conferir)).estado,'conflito');
 assert.equal(a.escritas.length,0);
});
