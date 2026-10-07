import { strict as assert } from 'node:assert';
import { operadorDaEstacaoPiloto, conferirVinculoPiloto } from './piloto_estacao.ts';
const id='11111111-1111-4111-8111-111111111111';
const grade={piloto_estacao:'LASER-TESTE',piloto_usuario_id:id,piloto_empresa:'teste',
  piloto_instalacao_autorizada:true,perm_producao_view:true,perm_imprimir:true,perm_admin_edit:false};
Deno.test('nova estacao exige cadastro exato e conserva permissao restrita', async()=>{
  const r=await operadorDaEstacaoPiloto('LASER-TESTE','ORIGINAL','ABC123',async(m,q)=>{
    assert.equal(m,'GET');assert.ok(q.includes('ativo=eq.true'));
    assert.ok(q.includes('piloto_estacao=eq.LASER-TESTE'));
    assert.ok(q.includes('piloto_instalacao_autorizada=eq.true'));
    return [{role:'impressor',permissoes:grade}];
  });
  assert.equal(r.perm_admin_edit,false);
  const v=await conferirVinculoPiloto(r,'LASER-TESTE','teste',async()=>[
    {user_id:id,perm_producao_view:true,perm_imprimir:true}]);
  assert.equal(v.piloto_estacao,'LASER-TESTE');
});
Deno.test('cadastro ausente, ambiguo, revogado ou trocado nao habilita estacao',async()=>{
  for(const rows of [[],[{permissoes:grade},{permissoes:grade}],
    ...[{piloto_instalacao_autorizada:false},{piloto_estacao:'OUTRA'},
       {piloto_usuario_id:null},{perm_imprimir:false}].map(x=>[{permissoes:{...grade,...x}}])]) {
    await assert.rejects(()=>operadorDaEstacaoPiloto('LASER-TESTE','ORIGINAL','ABC123',async()=>rows));
  }
  await assert.rejects(()=>operadorDaEstacaoPiloto('x&ativo=eq.false','ORIGINAL','ABC123',async()=>{
    assert.fail('entrada invalida nao consulta');
  }));
  await assert.rejects(()=>operadorDaEstacaoPiloto('LASER-TESTE','ORIGINAL','ABC123',async()=>{throw Error('sigiloso');}),/indisponivel/);
});
Deno.test('estacao original conserva o codigo legado sem consultar outras estacoes',async()=>{
  const r=await operadorDaEstacaoPiloto('ORIGINAL','ORIGINAL','ABC123',async(m,q)=>{
    assert.ok(q.includes('codigo=eq.ABC123'));return [{role:'impressor',permissoes:grade}];
  });
  assert.equal(r.perm_imprimir,true);
});
