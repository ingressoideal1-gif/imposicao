import { strict as assert } from 'node:assert';
import { operadorDaEstacaoPiloto, conferirVinculoPiloto } from './piloto_estacao.ts';
const id='11111111-1111-4111-8111-111111111111';
const grade={piloto_estacao:'LASER-TESTE',piloto_usuario_id:id,piloto_empresa:'teste',
  piloto_instalacao_autorizada:true,perm_producao_view:true,perm_imprimir:true,perm_admin_edit:false};
Deno.test('nova estacao exige cadastro exato e conserva permissao restrita', async()=>{
  const r=await operadorDaEstacaoPiloto('LASER-TESTE','ORIGINAL','ABC123',async(m,q)=>{
    assert.equal(m,'GET');assert.ok(q.includes('ativo=eq.true'));
    assert.ok(q.includes('piloto_estacao=ilike.LASER-TESTE'));
    assert.ok(q.includes('piloto_instalacao_autorizada=eq.true'));
    return [{role:'impressor',permissoes:grade}];
  });
  assert.equal(r.perm_admin_edit,false);
  const v=await conferirVinculoPiloto(r,'LASER-TESTE','teste',async()=>[
    {user_id:id,perm_producao_view:true,perm_imprimir:true}]);
  assert.equal(v.piloto_estacao,'LASER-TESTE');
});

Deno.test('mesma estacao em caixa mista conserva vinculo e permissoes', async()=>{
  const p={...grade,piloto_estacao:'GUSTAVO-PROD'};
  for (const nome of ['Gustavo-Prod','gustavo-prod','GUSTAVO-PROD']) {
    const r=await operadorDaEstacaoPiloto(nome,'ORIGINAL','ABC123',async(_m,q)=>{
      assert.ok(q.includes('piloto_estacao=ilike.'+nome));
      assert.ok(q.endsWith('limit=2'));
      return [{role:'impressor',permissoes:p}];
    });
    const v=await conferirVinculoPiloto(r,nome,'teste',async()=>[
      {user_id:id,perm_producao_view:true,perm_imprimir:true}]);
    assert.equal(v.perm_admin_edit,false);
    assert.equal(v.piloto_estacao,'GUSTAVO-PROD');
    await assert.rejects(()=>conferirVinculoPiloto(r,nome,'teste',async()=>[
      {user_id:id,perm_producao_view:true,perm_imprimir:false}]));
  }
});

Deno.test('caixa mista nao autoriza homonimos nem padroes', async()=>{
  await assert.rejects(()=>operadorDaEstacaoPiloto('Gustavo-Prod','ORIGINAL','ABC123',async()=>[
    {permissoes:{...grade,piloto_estacao:'GUSTAVO-PROD'}},
    {permissoes:{...grade,piloto_estacao:'Gustavo-Prod'}}]));
  for (const nome of ['GUSTAVO*','GUSTAVO%',' GUSTAVO-PROD','GUSTAVO-PROD ']) {
    await assert.rejects(()=>operadorDaEstacaoPiloto(nome,'ORIGINAL','ABC123',async()=>{
      assert.fail('nome invalido nao consulta');
    }));
  }
  const r=await operadorDaEstacaoPiloto('LASER_01','ORIGINAL','ABC123',async(_m,q)=>{
    assert.ok(q.includes('piloto_estacao=ilike.LASER%5C_01'));
    return [{permissoes:{...grade,piloto_estacao:'laser_01'}}];
  });
  assert.equal(r.piloto_estacao,'laser_01');
  await assert.rejects(()=>operadorDaEstacaoPiloto('LASER_01','ORIGINAL','ABC123',async()=>[
    {permissoes:{...grade,piloto_estacao:'LASERX01'}}]));
});

Deno.test('legada aceita caixa mista e consulta apenas operador legado', async()=>{
  const r=await operadorDaEstacaoPiloto('Original','ORIGINAL','ABC123',async(_m,q)=>{
    assert.ok(q.includes('codigo=eq.ABC123'));return [{role:'impressor',permissoes:grade}];
  });
  assert.equal(r.perm_imprimir,true);
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
