import { strict as assert } from 'node:assert';
import { conferirPedidoPiloto } from './piloto_pedido.ts';
import { digestPiloto } from './piloto_local.ts';

const permissoes={perm_producao_view:true,perm_imprimir:true};
function ambiente() {
 const modelo={id:10,id_int:20,amostra_num_id:'num-5',id_produto_proposta_origem:30,
   status_arte:'APROVADO',status_impressao:'Aguardando',arte_url:'https://test.supabase.co/storage/v1/object/public/artes/a.pdf'};
 const numero={id:'num-5',elements:[{type:'METADATA',print_mode:'duplex'}],csv_data:[['Teste']]};
 const snapshot={modelos:[modelo],numeracoes:[numero],origens:[{id:30,id_int:20,id_produto:40}],
   produtos:[{id_produto:40,setor_pcp:'Laser'}],pedidos:[{id_int:20,status_interno:'EM PRODUCAO'}],
   prazos:[{data_termino:'2026-10-05'}],recursos:[{url:modelo.arte_url,objeto:{version:'v1',metadata:{eTag:'abc'}}}]};
 const consultas:any[]=[];
 const ler=async(m:string,q:string,b:any)=>{
   consultas.push([m,q,b]);assert.equal(m,'POST');assert.equal(q,'rpc/piloto_snapshot_pedido');
   return {pedido:'20',revisao:'a'.repeat(64),sem_mudanca:b.p_revisao==='a'.repeat(64),snapshot};
 };
 const chamar=(e:any={empresa:'teste',pedido:'20',revisao:''},p:any=permissoes)=>conferirPedidoPiloto(e,p,ler,'teste',undefined,'test.supabase.co');
 return {modelo,numero,snapshot,consultas,chamar};
}
Deno.test('pedido: uma RPC, digest integral, produto efetivo, verso e versao do arquivo',async()=>{
 const a=ambiente(),r:any=await a.chamar();assert.equal(a.consultas.length,1);
 assert.equal(r.itens.length,1);assert.equal(r.itens[0].setor,'Laser');
 assert.equal(r.itens[0].observacao.digest,await digestPiloto([a.modelo,[a.numero]]));
 assert.match(r.itens[0].versoes_fontes.frente.revisao,/^[a-f0-9]{64}$/);
 assert.equal(r.itens[0].versoes_fontes.frente.etag,'abc');assert.equal(r.execucao_offline,false);
});
Deno.test('pedido: revisao igual devolve apenas recibo; sem linhas de modelos/bancos',async()=>{
 const a=ambiente(),r:any=await a.chamar({empresa:'teste',pedido:'20',revisao:'a'.repeat(64)});
 assert.equal(r.sem_mudanca,true);assert.ok(!('itens' in r));assert.ok(!('snapshot' in r));
 assert.equal(a.consultas.length,1);
});
Deno.test('pedido: permissoes e entrada recusadas antes de consultar',async()=>{
 const a=ambiente();await assert.rejects(a.chamar(undefined,{}),{status:403});
 for(const pedido of ['0','20&x=y','2147483648']) await assert.rejects(a.chamar({empresa:'teste',pedido,revisao:''}),{status:422});
 await assert.rejects(a.chamar({empresa:'outra',pedido:'20',revisao:''}),{status:422});
 assert.equal(a.consultas.length,0);
});
Deno.test('pedido: banco ausente, outra empresa, duplicidade e pedido diferente bloqueiam',async()=>{
 for(const tipo of ['banco','empresa','duplicado','pedido']) {
   const a=ambiente();
   if(tipo==='banco')a.snapshot.numeracoes=[];
   if(tipo==='empresa')(a.numero as any).empresa_id='outra';
   if(tipo==='duplicado')a.snapshot.modelos.push(a.modelo);
   if(tipo==='pedido')a.modelo.id_int=21;
   await assert.rejects(a.chamar(),{status:tipo==='empresa'?403:409});
 }
});
Deno.test('pedido: prateleira/concluido fora da fila; impresso permitido sem modificar cadastro',async()=>{
 const a=ambiente();(a.snapshot.produtos[0] as any).is_estoque=true;
 assert.equal((await a.chamar() as any).itens.length,0);
 delete (a.snapshot.produtos[0] as any).is_estoque;a.modelo.status_impressao='Impresso';
 const antes=JSON.stringify(a.snapshot);assert.equal((await a.chamar() as any).itens.length,1);
 assert.equal(JSON.stringify(a.snapshot),antes);
 a.modelo.status_impressao='Concluido';assert.equal((await a.chamar() as any).itens.length,0);
});
Deno.test('pedido: URL sem objeto ou sem versao/ETag nunca dispensa revalidacao',async()=>{
 const a=ambiente();a.snapshot.recursos=[];
 assert.equal((await a.chamar() as any).itens[0].versoes_fontes.frente,null);
 a.snapshot.recursos=[{url:a.modelo.arte_url,objeto:{version:'',metadata:{eTag:'abc'}}}];
 assert.equal((await a.chamar() as any).itens[0].versoes_fontes.frente,null);
});

Deno.test('pedido v2: sinal persistido usa RPC propria, snapshot inicial e recibo compacto',async()=>{
 const a=ambiente();const chamadas:any[]=[];
 const snapshot={...a.snapshot,bancos:[],vinculos:[],artes:[],mapas:[]};
 const ler=async(m:string,q:string,b:any)=>{
  chamadas.push(q);assert.equal(q,'rpc/piloto_snapshot_pedido_v2');
  return {protocolo:2,pedido:'20',revisao:'a'.repeat(64),sem_mudanca:b.p_revisao==='a'.repeat(64),snapshot};
 };
 const abrir=(revisao:string)=>conferirPedidoPiloto({empresa:'teste',pedido:'20',revisao},permissoes,ler,'teste',undefined,'test.supabase.co',true);
 const inicial:any=await abrir('');assert.deepEqual(inicial.snapshot,snapshot);assert.equal(inicial.protocolo,2);
 const igual:any=await abrir('a'.repeat(64));assert.equal(igual.sem_mudanca,true);assert.ok(!('snapshot' in igual));
 assert.equal(chamadas.length,2);
 await assert.rejects(conferirPedidoPiloto({empresa:'teste',pedido:'20',revisao:''},permissoes,
  async()=>({pedido:'20',revisao:'a'.repeat(64),sem_mudanca:false,snapshot}),
  'teste',undefined,'test.supabase.co',true),{status:503});
});
