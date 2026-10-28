import { strict as assert } from 'node:assert';
import { conferirPiloto, digestPiloto, fontesPiloto } from './piloto_local.ts';

Deno.test('piloto: origem de importacao nao vira recurso quando linhas estao no snapshot', () => {
  const foto = 'https://storage.invalid/foto.jpg';
  const fonte = 'https://storage.invalid/fonte.ttf';
  const origem = 'https://docs.google.com/spreadsheets/d/sintetico/edit?usp=sharing';
  const banco = {csv_url:origem, csv_data:[{foto, csv_url:foto}], elements:[{font_url:fonte}]};
  const antes = JSON.stringify(banco);
  const recursos = Object.values(fontesPiloto({arte_url:'https://storage.invalid/frente.pdf'}, [banco]));
  assert.ok(!recursos.includes(origem));
  assert.ok(recursos.includes(foto));
  assert.ok(recursos.includes(fonte));
  assert.equal(JSON.stringify(banco), antes);
  // Sem linhas importadas, nao ocultar uma dependencia nao resolvida.
  assert.ok(Object.values(fontesPiloto({}, [{csv_url:origem}])).includes(origem));
});

const permitido = { perm_producao_view: true, perm_imprimir: true };
Deno.test('piloto: gabarito sem base confere online e bloqueia revisao ou aprovacao alterada', async () => {
  const a = ambiente(); a.modelo.arte_url = null;
  a.nums[0].elements = [{type:'TEXT',x_mm:10,y_mm:10}];
  const entrada = {empresa:'Ingresso Ideal',modelo:'10',
    digest:await digestPiloto([a.modelo,a.nums]),fontes:{}};
  const r = await conferirPiloto(entrada, permitido, a.consultar, 'Ingresso Ideal');
  assert.equal(r.execucao_offline,false);
  a.nums[0].elements[0].x_mm = 20;
  await assert.rejects(conferirPiloto(entrada, permitido, a.consultar, 'Ingresso Ideal'),{status:409});
  a.nums[0].elements[0].x_mm = 10; a.modelo.status_arte = 'EM ARTE';
  await assert.rejects(conferirPiloto(entrada, permitido, a.consultar, 'Ingresso Ideal'),{status:409});
});
Deno.test('piloto: PDF de frente do gabarito prepara modelo sem arte_url e preserva todos os recursos', () => {
  const frente = 'https://storage.invalid/frente.pdf', verso = 'https://storage.invalid/verso.pdf';
  const num = {elements:[{type:'PDF',face:'back',pdf_content:verso},
    {type:'PDF',face:'both',pdf_content:frente}, {type:'FOTO',url:'https://storage.invalid/foto.jpg'}]};
  const antes = JSON.stringify(num);
  const fontes = fontesPiloto({}, [num]);
  assert.equal(fontes.frente, frente);
  assert.ok(Object.values(fontes).includes(verso));
  assert.ok(Object.values(fontes).includes('https://storage.invalid/foto.jpg'));
  assert.equal(Object.values(fontes).filter(u => u === frente).length, 1);
  assert.equal(JSON.stringify(num), antes);
  assert.equal(fontesPiloto({arte_url:verso}, [num]).frente, verso);
});
Deno.test('piloto: foto, fonte, verso isolado e PDF inline nao viram arquivo de frente', () => {
  for (const num of [
    {elements:[{type:'FOTO',url:'https://storage.invalid/foto.jpg'}]},
    {elements:[{type:'TEXT',font_url:'https://storage.invalid/fonte.ttf'}]},
    {elements:[{type:'PDF',face:'back',pdf_content:'https://storage.invalid/verso.pdf'}]},
    {elements:[{type:'PDF',face:'front',pdf_content:'data:application/pdf;base64,JVBERg=='}]},
  ]) assert.equal(fontesPiloto({}, [num]).frente, undefined);
});
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
