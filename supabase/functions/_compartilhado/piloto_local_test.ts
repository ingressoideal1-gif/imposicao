import { strict as assert } from 'node:assert';
import { conferirPiloto, digestPiloto } from './piloto_local.ts';

const permitido = { perm_producao_view: true, perm_imprimir: true };
function ambiente() {
  const modelo: any = { id: 10, id_int: 20, amostra_num_id: 5, status_arte: 'APROVADO',
    status_impressao: 'Aguardando', arte_url: 'https://storage.invalid/frente.pdf' };
  const nums: any[] = [{ id: 5, elements: [{ font_url: 'https://storage.invalid/fonte.ttf' }] }];
  const proposta: any = { id_int: 20, status_interno: 'EM PRODUCAO' };
  const chamadas: string[] = [];
  const consultar = async (metodo: string, caminho: string) => {
    assert.equal(metodo, 'GET'); chamadas.push(caminho);
    if (caminho.startsWith('pedidos_modelos?')) return structuredClone([modelo]);
    if (caminho.startsWith('producao_numeracoes?')) return structuredClone(nums);
    if (caminho.startsWith('propostas?')) return structuredClone([proposta]);
    throw new Error('Consulta inesperada');
  };
  const entrada = async () => ({empresa: 'Ingresso Ideal', modelo: '10', digest: await digestPiloto([modelo, nums]),
    fontes: { frente: modelo.arte_url, recurso_0: nums[0].elements[0].font_url }});
  return { modelo, nums, proposta, chamadas, consultar, entrada };
}
Deno.test('piloto: servidor confere dados e fontes, sem liberar offline', async () => {
  const a = ambiente();
  const r = await conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal');
  assert.equal(r.empresa, 'Ingresso Ideal'); assert.equal(r.modelo, '10');
  assert.equal(r.execucao_offline, false); assert.equal(r.aprovacao_versionada, false);
  assert.equal(a.chamadas.length, 6);
});
for (const permissoes of [null, {}, {perm_producao_view:true}, {perm_imprimir:true}]) {
  Deno.test('piloto: login sem ambas permissoes nao le modelos ' + JSON.stringify(permissoes), async () => {
    const a = ambiente();
    await assert.rejects(conferirPiloto(await a.entrada(), permissoes, a.consultar, 'Ingresso Ideal'), {status:403});
    assert.equal(a.chamadas.length, 0);
  });
}
Deno.test('piloto: empresa desconhecida, digest falso e fonte trocada recusados', async () => {
  const a = ambiente(), entrada = await a.entrada();
  await assert.rejects(conferirPiloto(entrada, permitido, a.consultar, ''), {status:503});
  await assert.rejects(conferirPiloto({...entrada,empresa:'Outra'}, permitido, a.consultar, 'Ingresso Ideal'), {status:422});
  await assert.rejects(conferirPiloto({...entrada,modelo:['10']}, permitido, a.consultar, 'Ingresso Ideal'), {status:422});
  await assert.rejects(conferirPiloto({...entrada,digest:'b'.repeat(64)}, permitido, a.consultar, 'Ingresso Ideal'), {status:409});
  await assert.rejects(conferirPiloto({...entrada,fontes:{frente:'https://outro.invalid/a'}}, permitido, a.consultar, 'Ingresso Ideal'), {status:409});
});
Deno.test('piloto: coluna de empresa exige vinculo explicitamente configurado', async () => {
  const a = ambiente(); a.modelo.empresa_id = 'empresa-1';
  await assert.rejects(conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal'), {status:403});
  await assert.rejects(conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal', 'empresa-2'), {status:403});
  assert.equal((await conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal', 'empresa-1')).modelo, '10');
  const antes = a.chamadas.length;
  await assert.rejects(conferirPiloto(await a.entrada(), {...permitido, empresa_id:'empresa-2'}, a.consultar,
    'Ingresso Ideal', 'empresa-1'), {status:403});
  assert.equal(a.chamadas.length, antes);
});
Deno.test('piloto: alteracao durante consulta, pedido encerrado e arte revogada', async () => {
  const a = ambiente();
  const consultar = async (metodo:string, caminho:string) => {
    if (a.chamadas.length >= 3) a.modelo.status_arte = 'EM ARTE';
    return await a.consultar(metodo, caminho);
  };
  await assert.rejects(conferirPiloto(await a.entrada(), permitido, consultar, 'Ingresso Ideal'), {status:409});
  await assert.rejects(conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal'), {status:409});
  a.modelo.status_arte = 'APROVADO'; a.proposta.status_interno = 'ENTREGUE';
  await assert.rejects(conferirPiloto(await a.entrada(), permitido, a.consultar, 'Ingresso Ideal'), {status:409});
});

Deno.test('impresso: conferencia somente leitura autorizada apenas no canal autonomo', async()=>{
  const a=ambiente();a.modelo.status_impressao='Impresso';a.proposta.status_interno='ENTREGUE';
  await assert.rejects(conferirPiloto(await a.entrada(),permitido,a.consultar,'Ingresso Ideal'),{status:409});
  const r=await conferirPiloto(await a.entrada(),permitido,a.consultar,'Ingresso Ideal',undefined,true);
  assert.equal(r.execucao_offline,false);assert.equal(a.modelo.status_impressao,'Impresso');
  a.modelo.status_arte='EM ARTE';
  await assert.rejects(conferirPiloto(await a.entrada(),permitido,a.consultar,'Ingresso Ideal',undefined,true),{status:409});
});
