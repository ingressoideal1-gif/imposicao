import { strict as assert } from 'node:assert';
import { listarPiloto } from './piloto_catalogo.ts';

const permissoes = {perm_producao_view:true,perm_imprimir:true};
function ambiente() {
  const modelos:any[] = [{id:10,id_int:20,amostra_num_id:5,id_produto_proposta_origem:30,
    status_arte:'APROVADO',status_impressao:'Aguardando',arte_url:'https://test.invalid/a'}];
  const consultas:string[] = [];
  const ler = async (metodo:string,query:string)=>{
    assert.equal(metodo,'GET');consultas.push(query);
    if(query.startsWith('pedidos_modelos?'))return modelos;
    if(query.startsWith('propostas?'))return [{id_int:20,status_interno:'EM PRODUCAO'}];
    if(query.startsWith('producao_numeracoes?'))return [{id:5}];
    if(query.startsWith('propostas_os?'))return [{data_termino:'2026-09-27'}];
    if(query.startsWith('produtos_proposta?'))return [{id_produto:40}];
    if(query.startsWith('produtos?'))return [{setor_pcp:'Laser'}];
    throw new Error('Consulta inesperada');
  };
  return {modelos,consultas,ler};
}
Deno.test('catalogo autonomo: modelo, setor, prazo ERP e digest sem dados comerciais',async()=>{
  const a=ambiente();const r=await listarPiloto({empresa:'teste',cursor:0},permissoes,a.ler,'teste');
  assert.equal(r.fim,true);assert.equal(r.proximo,0);assert.equal(r.itens.length,1);
  assert.equal(r.itens[0].setor,'Laser');assert.equal(r.itens[0].prazo_erp,'2026-09-27');
  assert.match(r.itens[0].observacao.digest,/^[a-f0-9]{64}$/);
  assert.ok(!('cliente' in r.itens[0]));assert.ok(a.consultas[0].includes('id=gt.0'));
});
Deno.test('catalogo autonomo: permissao, empresa e cursor recusados antes de ler',async()=>{
  const a=ambiente();
  await assert.rejects(listarPiloto({empresa:'teste',cursor:0},{},a.ler,'teste'),{status:403});
  await assert.rejects(listarPiloto({empresa:'outra',cursor:0},permissoes,a.ler,'teste'),{status:422});
  await assert.rejects(listarPiloto({empresa:'teste',cursor:'0'},permissoes,a.ler,'teste'),{status:422});
  assert.equal(a.consultas.length,0);
});
Deno.test('catalogo autonomo: pagina fora de ordem, outra empresa e modelo concluido',async()=>{
  const a=ambiente();a.modelos[0].id=0;
  await assert.rejects(listarPiloto({empresa:'teste',cursor:0},permissoes,a.ler,'teste'),{status:503});
  a.modelos[0].id=10;a.modelos[0].empresa_id='outra';
  await assert.rejects(listarPiloto({empresa:'teste',cursor:0},permissoes,a.ler,'teste','empresa'),{status:403});
  delete a.modelos[0].empresa_id;a.modelos[0].status_impressao='Impresso';
  assert.equal((await listarPiloto({empresa:'teste',cursor:0},permissoes,a.ler,'teste')).itens.length,0);
});

Deno.test('preferencial: filtra pedido e aceita impresso sem alterar status', async()=>{
  const a=ambiente();a.modelos[0].status_impressao='Impresso';
  const r=await listarPiloto({empresa:'teste',cursor:0,pedido:'20'},permissoes,a.ler,'teste');
  assert.equal(r.itens.length,1);assert.equal(r.itens[0].pedido,'20');
  assert.ok(a.consultas[0].includes('&id_int=eq.20'));
  assert.equal(a.modelos[0].status_impressao,'Impresso');
  await assert.rejects(listarPiloto({empresa:'teste',cursor:0,pedido:'1&x=y'},permissoes,a.ler,'teste'),{status:422});
  await assert.rejects(listarPiloto({empresa:'teste',cursor:0,pedido:'21'},permissoes,a.ler,'teste'),{status:503});
});

Deno.test('prateleira fica excluida mesmo com arte e pedido preferencial',async()=>{
 const a=ambiente();
 const ler=async(m:string,q:string)=>q.startsWith('produtos?')?[{is_estoque:true}]:await a.ler(m,q);
 assert.equal((await listarPiloto({empresa:'teste',cursor:0,pedido:'20'},permissoes,ler,'teste')).itens.length,0);
});
