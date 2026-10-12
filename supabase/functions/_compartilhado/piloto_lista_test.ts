import { strict as assert } from 'node:assert';
import { listaOffline } from './piloto_lista.ts';
const op={perm_producao_view:true,perm_imprimir:true,empresa_id:'1'};
function ambiente() {
  const chamadas:string[]=[];
  const banco:any=async(method:string,path:string)=> {
    assert.equal(method,'GET'); chamadas.push(path);
    if(path.startsWith('propostas?')) return Array.from({length:65},(_,i)=>({id:i+1,id_int:100+i,id_cliente:12,id_faturado:34,cliente:'Nome antigo',status_interno:'EM PRODUCAO'}));
    if(path.startsWith('clientes?')) return [{id_cliente:12,fantasia:'Cliente comercial'}];
    return [];
  };
  return {banco,chamadas};
}
Deno.test('lista: 65 pedidos sem modelos ou arquivos; nome e numero comerciais literais',async()=>{
  const a=ambiente(); const r=await listaOffline({empresa:'teste',revisao:''},op,a.banco,'teste','1');
  assert.equal(r.lista?.pedidos.length,65);
  assert.equal(r.lista?.pedidos[0].cliente_exibicao,'Cliente comercial');
  assert.equal(r.lista?.pedidos[0].id_cliente,12);assert.equal(r.lista?.pedidos[0].id_faturado,34);
  const mesma=await listaOffline({empresa:'teste',revisao:r.revisao},op,a.banco,'teste','1');
  assert(mesma.sem_mudanca);assert.equal(mesma.lista,undefined);
  assert(a.chamadas.every(c=>!c.startsWith('rpc/')));
});
Deno.test('lista: recusa permissao e empresa divergentes, falha nao vira lista vazia',async()=>{
  const a=ambiente();
  await assert.rejects(()=>listaOffline({empresa:'teste',revisao:''},{},a.banco,'teste','1'));
  await assert.rejects(()=>listaOffline({empresa:'teste',revisao:''},{...op,empresa_id:'2'},a.banco,'teste','1'));
  await assert.rejects(()=>listaOffline({empresa:'teste',revisao:''},op,async()=>{throw Error('sem rede');},'teste','1'));
});
