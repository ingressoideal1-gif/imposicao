// PostgreSQL em memoria, sem rede. Instancia descartavel com dados sinteticos.
const fs=require('node:fs'), assert=require('node:assert/strict'), vm=require('node:vm');
const { PGlite }=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const source=fs.readFileSync('frontend/script.js','utf8');
function fn(name){const i=source.indexOf('\nfunction '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);}
function constant(name){const i=source.indexOf('const '+name+' =');assert(i>=0);return source.slice(i,source.indexOf(';',i)+1);}
const ctx={state:{todasArtes:[],modelosGlobais:{},osItens:{},linksClienteData:{}},STATUS_CORRIGIR_ARTE:'Corrigir Arte'};
vm.createContext(ctx);
vm.runInContext(['ARTE_REPROVADOS','ARTE_APROVADOS','ARTE_EM_APROVACAO','ARTE_COM_O_DESIGNER','SINAIS_CANCELADO','SINAIS_SAIU_DA_ARTE'].map(constant).join('\n')+'\n'+['pedidoCancelado','pedidoSaiuDaArte','normalizarStatusImpressao','modeloEmCorrecaoDeArte','classificarPedidoNaArte'].map(fn).join('\n'),ctx);
(async()=>{
 const db=await PGlite.create();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
   CREATE TABLE pedidos_artes(id bigint PRIMARY KEY,id_int bigint,status text,entrega_dados text,created_at timestamptz DEFAULT now(),nome_evento text);
   CREATE TABLE pedidos_modelos(id bigint PRIMARY KEY,id_int bigint,status_arte text,status_impressao text);
   CREATE TABLE propostas(id_int bigint PRIMARY KEY,status_interno text);
   CREATE TABLE imposition_tempo_no_card(id_int bigint PRIMARY KEY,card text,desde timestamptz,credito_segundos int,atualizado_em timestamptz);
   CREATE TABLE pedidos_links_cliente(id bigint PRIMARY KEY,numero_pedido text,ativo boolean,status_arte text,cliente_abriu_em timestamptz,created_at timestamptz DEFAULT now());
   INSERT INTO pedidos_artes(id,id_int,status) VALUES(1,1,'Em Arte'),(2,2,'Em Aprovação');`);
  const preflight=await db.exec(fs.readFileSync('sql/tempo_etapas_servidor_preflight.sql','utf8'));
  const preview=preflight.flatMap(r=>r.rows || []).find(r=>r.preflight_tempo).preflight_tempo;
  assert.equal(preview.contexto.somente_leitura,'on');assert.equal(preview.pedidos_baseline,2);
  assert.equal(preview.tabela_nova_deve_ser_null,null);
  await db.exec(fs.readFileSync('sql/tempo_etapas_servidor.sql','utf8'));
  const verification=await db.exec(fs.readFileSync('sql/tempo_etapas_servidor_verificar.sql','utf8'));
  const verified=verification.flatMap(r=>r.rows || []).find(r=>r.verificacao_tempo).verificacao_tempo;
  assert.equal(verified.gatilhos.length,4);
  assert(verified.gatilhos.every(t=>t.tgenabled==='O' && t.tgdeferrable && t.tginitdeferred));
  assert.deepEqual(verified.permissoes,{painel_le:true,painel_pode_inserir:false,painel_pode_atualizar:false,painel_pode_excluir:false,painel_pode_reiniciar:false});
  assert.deepEqual(verified.resumo,{pedidos:2,com_inicio:0,sem_inicio:2});
  const clock=async n=>(await db.query('SELECT id_int,card,desde::text AS desde FROM imposition_etapas_arte WHERE id_int=$1',[n])).rows[0];
  const hist=async n=>(await db.query('SELECT * FROM imposition_etapas_arte_historico WHERE id_int=$1 ORDER BY id',[n])).rows;
  assert.equal((await clock(1)).desde,null,'migracao nao inicia todos juntos');
  assert.equal((await clock(2)).desde,null);
  await db.exec("UPDATE pedidos_artes SET nome_evento='Outro texto' WHERE id_int=1");
  assert.equal((await clock(1)).desde,null,'edicao irrelevante nao inventa inicio');
  await db.exec("INSERT INTO pedidos_artes(id,id_int,status) VALUES(3,3,'Em Arte')");
  const first=await clock(3);assert(first.desde);assert.equal(first.card,'fila');
  for(let i=0;i<5;i++){await db.exec("UPDATE pedidos_artes SET status='Em Arte' WHERE id_int=3");assert.deepEqual(await clock(3),first);}
  await db.exec("UPDATE pedidos_artes SET status='Enviar Arte' WHERE id_int=3");
  const sent=await clock(3);assert.equal(sent.card,'aprovacao');assert.notDeepEqual(sent,first);
  await db.exec("UPDATE pedidos_artes SET status='Em Aprovação' WHERE id_int=3");
  assert.deepEqual(await clock(3),sent,'mesmo card preserva inicio, apesar do texto de status diferente');
  await db.exec("UPDATE pedidos_artes SET status='Em Arte' WHERE id_int=3");
  const returned=await clock(3);assert.equal(returned.card,'fila');assert.notEqual(String(returned.desde),String(first.desde),'retorno inicia nova entrada');
  assert.equal((await hist(3)).length,3);assert((await hist(3))[0].saiu_em);
  await db.exec("BEGIN; UPDATE pedidos_artes SET status='Enviar Arte' WHERE id_int=3; UPDATE pedidos_artes SET status='Pendente Informação' WHERE id_int=3; COMMIT;");
  assert.equal((await clock(3)).card,'pendente');assert.equal((await hist(3)).length,4,'somente estado final da transacao');
  const before=await clock(3);
  await db.exec("BEGIN; UPDATE pedidos_artes SET status='Em Arte' WHERE id_int=3; ROLLBACK;");
  assert.deepEqual(await clock(3),before,'rollback do status nao deixa etapa fantasma');
  await db.exec("SET ROLE authenticated");
  assert.equal((await db.query('SELECT count(*)::int AS n FROM imposition_etapas_arte')).rows[0].n,3);
  await assert.rejects(db.exec("UPDATE imposition_etapas_arte SET desde=now() WHERE id_int=3"));
  await assert.rejects(db.exec("SELECT public.imposition_etapa_arte_registrar(3)"));
  await db.exec('RESET ROLE');
  await db.exec("UPDATE pedidos_artes SET status='Em Aprovação' WHERE id_int=3; INSERT INTO pedidos_modelos VALUES(1,3,'APROVADA','Aguardando'); UPDATE pedidos_artes SET entrega_dados='APROVADO' WHERE id_int=3;");
  assert.equal((await clock(3)).card,'aprovados');
  await db.exec("INSERT INTO propostas VALUES(3,'EM PRODUCAO')");assert.equal((await clock(3)).card,'concluidos');
  await db.exec("UPDATE pedidos_modelos SET status_impressao='Corrigir Arte' WHERE id_int=3");assert.equal((await clock(3)).card,'fila');
  // Paridade de classificacao com o codigo real do frontend.
  const globals=['Em Arte','AGUARDANDO','Enviar Arte','Em Aprovação','APROVADO','Dados Pendentes','Em Alteração','Pendente Informação','Apr Parcial',''];
  const internals=['','EM PRODUCAO','CANCELADO'];
  const models=[[],[{status_arte:'APROVADA'}],[{status_arte:'REPROVADA_CLIENTE'}],[{status_arte:'APROVADA'},{status_arte:'EM ARTE'}],[{status_arte:'APROVADA',status_impressao:'Corrigir Arte'}]];
  let cases=0;
  for(const g of globals)for(const e of ['','APROVADO','CORRIGIR'])for(const s of ['Em Arte','Enviar Arte','APROVADO'])for(const si of internals)for(const m of models)for(const abriu of [false,true]){
   ctx.state.todasArtes=[{id_int:9,status:g,entrega_dados:e}];ctx.state.modelosGlobais={9:m};
   ctx.state.linksClienteData={vibe_9:{cliente_abriu_em:abriu?'2026-09-30T09:00:00Z':null}};
   const expected=ctx.classificarPedidoNaArte({id:'vibe_9',numero:9,status:s,status_interno:si}).fila;
   const actual=(await db.query('SELECT public.imposition_card_arte_calcular($1,$2,$3,$4,$5,$6::jsonb) AS card',[g,e,s,si,abriu,JSON.stringify(m)])).rows[0].card;
   assert.equal(actual,expected,JSON.stringify({g,e,s,si,m,abriu}));cases++;
  }
  // Fontes persistidas: link aberto muda o card; renomear e reler nao reiniciam.
  await db.exec("INSERT INTO pedidos_artes(id,id_int,status) VALUES(4,4,'AGUARDANDO'); INSERT INTO pedidos_links_cliente(id,numero_pedido,ativo,status_arte) VALUES(4,'4',true,'Em Arte');");
  assert.equal((await clock(4)).card,'fila');
  await db.exec("UPDATE pedidos_links_cliente SET cliente_abriu_em=now() WHERE id=4");
  const opened=await clock(4);assert.equal(opened.card,'aprovacao');
  await db.exec("UPDATE pedidos_links_cliente SET cliente_abriu_em=now() WHERE id=4");
  assert.deepEqual(await clock(4),opened);
  await db.exec("UPDATE pedidos_artes SET status='Ignorar' WHERE id_int=4");
  assert.equal((await clock(4)).card,null);assert.equal((await clock(4)).desde,null);
  assert((await hist(4)).every(r=>r.saiu_em),'ignorar fecha a etapa anterior');
  await db.exec('SET ROLE anon');
  await assert.rejects(db.exec('SELECT * FROM imposition_etapas_arte'));
  await assert.rejects(db.exec('SELECT public.imposition_card_arte_ler(3)'));
  await db.exec('RESET ROLE');
  // O rollback operacional preserva todos os marcadores e entradas historicas.
  const saved=await clock(3), savedHistory=await hist(3);
  await db.exec(fs.readFileSync('sql/tempo_etapas_servidor_rollback.sql','utf8'));
  await db.exec("UPDATE pedidos_artes SET status='Pendente Informação' WHERE id_int=3");
  assert.deepEqual(await clock(3),saved);assert.deepEqual(await hist(3),savedHistory);
  console.log('OK: '+cases+' classificacoes, transicoes reais, retorno, mesmo card, rollback, baseline e bloqueio de escrita do browser.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
