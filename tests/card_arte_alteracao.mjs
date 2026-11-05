// Banco em memoria: node tests/card_arte_alteracao.mjs <PGlite dist/index.js>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
const frontendOnly = process.argv[2] === '--frontend';
const { PGlite } = frontendOnly ? {} : await import(pathToFileURL(process.argv[2]).href);
const db = frontendOnly ? null : new PGlite();
const src = fs.readFileSync(new URL('../frontend/script.js', import.meta.url), 'utf8');
const ctx = { state: {} };
vm.createContext(ctx);
for (const name of ['SINAIS_SAIU_DA_ARTE','SINAIS_CANCELADO','ARTE_REPROVADOS','ARTE_APROVADOS','ARTE_EM_APROVACAO','ARTE_COM_O_DESIGNER']) {
  vm.runInContext(src.match(new RegExp('const '+name+' = \\[[^;]+;'))[0], ctx);
}
vm.runInContext(src.match(/const STATUS_CORRIGIR_ARTE = [^;]+;/)[0], ctx);
for (const name of ['normalizarStatusImpressao','pedidoSaiuDaArte','pedidoCancelado','modeloEmCorrecaoDeArte','classificarPedidoNaArte']) {
  const start = src.indexOf('function '+name+'(');
  assert.ok(start >= 0, name);
  vm.runInContext(src.slice(start, src.indexOf('\n}', start)+2), ctx);
}
const cases = [
  ['pedido 24537','Em Alteração','Enviar Arte',false,'NOVO',null,Array(24).fill('REPROVADA_CLIENTE'),'fila'],
  ['link aberto','Em Alteração','Enviar Arte',true,'NOVO',null,['REPROVADA_CLIENTE'],'fila'],
  ['aprovacao antiga','APROVADO','APROVADO',true,'NOVO','APROVADO',['REPROVADA_CLIENTE'],'fila'],
  ['parcial com correcao','Em Alteração','Enviar Arte',false,'NOVO',null,['APROVADA_CLIENTE','REPROVADA_CLIENTE'],'fila'],
  ['pronta','Enviar Arte','Enviar Arte',false,'NOVO',null,['PRONTO'],'aprovacao'],
  ['aguarda cliente','Em Aprovação','Enviar Arte',true,'NOVO',null,['PRONTO'],'aprovacao'],
  ['aprovadas superam global antigo','Em Alteração','Enviar Arte',false,'NOVO','APROVADO',['APROVADA_CLIENTE'],'aprovados'],
  ['cancelado','Em Alteração','Enviar Arte',false,'CANCELADO',null,['REPROVADA_CLIENTE'],'concluidos'],
  ['producao','Em Alteração','Enviar Arte',false,'EM PRODUCAO',null,['REPROVADA_CLIENTE'],'concluidos'],
];
try {
  if (db) await db.exec(fs.readFileSync(new URL('../sql/card_arte_alteracao.sql', import.meta.url),'utf8'));
  for (const [name,global,status,opened,internal,delivery,arts,expected] of cases) {
    const models = arts.map(status_arte=>({status_arte}));
    ctx.state = {todasArtes:[{id_int:24537,status:global,entrega_dados:delivery}],modelosGlobais:{24537:models},osItens:{},linksClienteData:{test:{cliente_abriu_em:opened?'2026-11-05':null}}};
    assert.equal(ctx.classificarPedidoNaArte({id:'test',numero:24537,status,status_interno:internal}).fila,expected,'frontend: '+name);
    if (db) {
      const result = await db.query('SELECT public.imposition_card_arte_calcular($1,$2,$3,$4,$5,$6::jsonb) card',[global,delivery,status,internal,opened,JSON.stringify(models)]);
      assert.equal(result.rows[0].card,expected,'SQL: '+name);
    }
  }
  console.log(`${cases.length*(db ? 2 : 1)} verificacoes passaram (${db ? 'frontend e SQL' : 'frontend'}).`);
} finally { if (db) await db.close(); }
