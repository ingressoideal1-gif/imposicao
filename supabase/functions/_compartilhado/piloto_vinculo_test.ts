import { strict as assert } from 'node:assert';
import { conferirVinculoPiloto } from './piloto_estacao.ts';

const id = '11111111-1111-4111-8111-111111111111';
const operador = {piloto_usuario_id:id,piloto_estacao:'ESTACAO-TESTE',piloto_empresa:'teste',
  perm_producao_view:true,perm_imprimir:true,perm_admin_edit:false};
const conta = {user_id:id,role:'admin',perm_producao_view:true,perm_imprimir:true};
Deno.test('vinculo consulta conta atual e conserva restricoes locais', async()=>{
  const consultar = async(m:string,q:string)=>{
    assert.equal(m,'GET'); assert.equal(q,`imposition_user_permissions?user_id=eq.${id}&select=*&limit=2`);
    return [conta];
  };
  const r=await conferirVinculoPiloto(operador,'ESTACAO-TESTE','teste',consultar);
  assert.equal(r.perm_admin_edit,false);
  assert.equal(r.perm_imprimir,true);
});
Deno.test('vinculo recusa revogacao, ambiguidade, falha de rede e identidade divergente',async()=>{
  for(const rows of [[],[conta,conta],[{...conta,perm_imprimir:false}], [{...conta,user_id:'outro'}]]) {
    await assert.rejects(()=>conferirVinculoPiloto(operador,'ESTACAO-TESTE','teste',async()=>rows));
  }
  await assert.rejects(()=>conferirVinculoPiloto(operador,'ESTACAO-TESTE','teste',async()=>{throw Error('segredo');}), /indisponivel/);
  for(const op of [{...operador,piloto_usuario_id:'invalido'},{...operador,piloto_estacao:'outra'},{...operador,piloto_empresa:'outra'}]) {
    await assert.rejects(()=>conferirVinculoPiloto(op,'ESTACAO-TESTE','teste',async()=>{assert.fail('nao deve consultar');}));
  }
});
Deno.test('vinculo preserva empresa da conta e recusa conflito com operador',async()=>{
  const r=await conferirVinculoPiloto(operador,'ESTACAO-TESTE','teste',async()=>[{...conta,empresa_id:'empresa-teste'}]);
  assert.equal(r.empresa_id,'empresa-teste');
  await assert.rejects(()=>conferirVinculoPiloto({...operador,empresa_id:'outra'},'ESTACAO-TESTE','teste',async()=>[{...conta,empresa_id:'empresa-teste'}]));
});
