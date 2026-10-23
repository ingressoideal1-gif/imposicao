// Rede simulada: o mesmo banco atende duas estacoes; nenhum acesso externo.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const src=fs.readFileSync('frontend/script.js','utf8');
function extrair(n){const i=src.search(new RegExp('(?:async )?function '+n+'\\('));assert(i>=0);return src.slice(i,src.indexOf('\n}',i)+2);}
const clone=x=>JSON.parse(JSON.stringify(x));
function ambiente(banco){
 const eventos=[],avisos=[]; let semRede=false,zero=false,divergencia=false,contador=0;
 const modelos=[10,11].map(id=>({id,id_int:99,status_impressao:'Aguardando',status_impressao_registrado_em:'2026-10-23T10:00:00Z'}));
 const dados={pedidos:[],confirmacoes:[],lista:{lista:{pedidos:[{id_int:99}],modelos:clone(modelos),origens:[],produtos:[],prazos:[],artes:[]}}};
 const ctx={state:{ordens:[{id:'vibe_99',numero:99}],osItens:{vibe_99:clone(modelos)},modelosGlobais:{99:clone(modelos)}},
 STATUS_CORRIGIR_ARTE:'Corrigir Arte',crypto,console:{warn(){},error(){}},setTimeout(){},structuredClone:clone,
 findOSInState:()=>({id:'vibe_99',numero:99}),toast:(...a)=>avisos.push(a),renderOrdens(){},renderPedOSQueue(){},renderImpOSQueue(){},
 updatePedImprimirButtonsVisibility(){},CustomEvent:function(){},dispatchEvent(){},loadOSItens:async()=>{},
 loadOrdensFromVibecode:async()=>true,confirmarPopup:async()=>true,
 supabaseClient:{from(t){assert.equal(t,'pedidos_modelos');let payload=null,filters=[];
 const q={select(){return q;},update(p){payload=p;return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},
 then(ok,bad){return Promise.resolve().then(()=>{
 if(semRede)throw Error('Rede indisponivel');
 let rows=banco.filter(m=>filters.every(([k,v])=>Array.isArray(v)?v.map(String).includes(String(m[k])):v==null?m[k]==null:String(m[k])===String(v)));
 eventos.push(payload?'PATCH':'GET');
 if(payload){if(zero)return {data:[],error:null};for(const m of rows)Object.assign(m,payload,{status_impressao_registrado_em:new Date(Date.UTC(2026,9,23,12,0,++contador)).toISOString()});}
 let r=clone(rows);if(!payload && divergencia && eventos.includes('PATCH'))r=r.map(m=>({...m,status_impressao:'Aguardando'}));
 return {data:r,error:null};}).then(ok,bad);}};return q;}},
 fetch:async(path,options)=>{
 if(!options?.body)return {ok:true,json:async()=>clone(dados)};
 const d=JSON.parse(options.body);assert(path.endsWith('decisao-impressao-painel'),'nao enfileirar confirmacao no lugar da rede');
 if(d.acao==='iniciar'){eventos.push('reserva');dados.confirmacoes.unshift({id:d.id,dados:{pedido:d.pedido,modelos:[d.modelo],status:d.status},estado:'manual_pendente'});}
 else {eventos.push('recibo');const c=dados.confirmacoes.find(c=>c.id===d.id);c.estado='manual';c.dados.confirmado=d.confirmado;}
 return {ok:true,json:async()=>({registrado_localmente:true})};
 }};ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(['normalizarStatusImpressao','escHtmlSimples','updateItemImpressao','confirmarImpressaoModelos'].map(extrair).join('\n'),ctx);
 function reiniciar(){vm.runInContext(fs.readFileSync('frontend/offline-estacao.js','utf8'),ctx);}
 reiniciar();return {ctx,dados,eventos,avisos,reiniciar,rede(v){semRede=v;},zero(v){zero=v;},divergencia(v){divergencia=v;}};
}
(async()=>{
 const banco=[10,11].map(id=>({id,id_int:99,status_impressao:'Aguardando',status_impressao_em:null,status_impressao_registrado_em:'2026-10-23T10:00:00Z'}));
 const a=ambiente(banco),b=ambiente(banco);
 assert.equal(await a.ctx.updateItemImpressao('10','vibe_99','Impresso'),true);
 assert.deepEqual(a.eventos.slice(0,5),['reserva','GET','PATCH','GET','recibo']);
 assert.equal(banco[0].status_impressao,'Impresso');
 await b.ctx.PilotoOffline.carregarOrdens();assert.equal(b.ctx.state.modelosGlobais[99][0].status_impressao,'Impresso','outra estacao ve status da rede apesar de snapshot antigo');
 assert.equal(await a.ctx.confirmarImpressaoModelos([{itemId:'10',osId:'vibe_99'},{itemId:'11',osId:'vibe_99'}]),true);
 assert(banco.every(m=>m.status_impressao.toUpperCase()==='IMPRESSO'),'confirmar modelo anterior nao invalida os demais');
 banco[0].status_impressao='Aguardando';banco[0].status_impressao_registrado_em='2026-10-23T13:00:00Z';
 await a.ctx.PilotoOffline.carregarOrdens();assert.equal(a.ctx.state.modelosGlobais[99][0].status_impressao,'Impresso','sincronizacao nao rebaixa confirmacao local');
 a.reiniciar();await a.ctx.PilotoOffline.carregarOrdens();assert.equal(a.ctx.state.modelosGlobais[99][0].status_impressao,'Impresso','recibo sobrevive a reabertura');
 assert.equal(await a.ctx.updateItemImpressao('10','vibe_99','Aguardando'),true);
 a.reiniciar();await a.ctx.PilotoOffline.carregarOrdens();assert.equal(a.ctx.state.modelosGlobais[99][0].status_impressao,'Aguardando','retorno explicito permanece');
 // A protecao Impresso/Aguardando nao libera uma arte devolvida para correcao.
 banco[1].status_impressao='Corrigir Arte';banco[1].status_impressao_registrado_em='2026-10-23T18:00:00Z';
 await a.ctx.PilotoOffline.carregarOrdens();
 assert.equal(a.ctx.state.modelosGlobais[99][1].status_impressao,'Corrigir Arte');
 const c=ambiente(banco);c.rede(true);assert.equal(await c.ctx.updateItemImpressao('10','vibe_99','Impresso'),false);
 assert(!c.avisos.some(x=>x[1]==='success'));assert(!c.eventos.includes('PATCH'));
 c.rede(false);c.zero(true);assert.equal(await c.ctx.updateItemImpressao('10','vibe_99','Impresso'),false);assert(!c.avisos.some(x=>x[1]==='success'));
 c.zero(false);c.divergencia(true);assert.equal(await c.ctx.updateItemImpressao('10','vibe_99','Impresso'),false);assert(!c.avisos.some(x=>x[1]==='success'));
 banco[0].status_impressao='Corrigir Arte';const d=ambiente(banco);assert.equal(await d.ctx.updateItemImpressao('10','vibe_99','Impresso'),false);assert(!d.eventos.includes('PATCH'));
 // Uma resposta de bootstrap iniciada antes do clique chega depois da confirmacao.
 const bancoCorrida=[10,11].map(id=>({id,id_int:99,status_impressao:'Aguardando',status_impressao_em:null,status_impressao_registrado_em:'2026-10-23T10:00:00Z'}));
 const corrida=ambiente(bancoCorrida), fetchOriginal=corrida.ctx.fetch;
 let liberar, primeira=true;
 corrida.ctx.fetch=async(path,options)=>{
   if(!options?.body && primeira){primeira=false;const antiga=clone(corrida.dados);await new Promise(r=>liberar=r);return {ok:true,json:async()=>antiga};}
   return fetchOriginal(path,options);
 };
 const cargaAntiga=corrida.ctx.PilotoOffline.carregarOrdens();
 await Promise.resolve();
 assert.equal(await corrida.ctx.updateItemImpressao('10','vibe_99','Impresso'),true);
 corrida.rede(true);liberar();await cargaAntiga;
 assert.equal(corrida.ctx.state.modelosGlobais[99][0].status_impressao,'Impresso','resposta atrasada nao apaga gravacao posterior');
 const e=ambiente(banco);e.dados.confirmacoes=[{estado:'conflito',dados:{pedido:'99',modelos:['10'],revisao:'antiga'}}];e.rede(true);
 await e.ctx.PilotoOffline.carregarOrdens();assert.equal(e.ctx.state.modelosGlobais[99][0].status_impressao,'IMPRESSO');assert(e.ctx.state.modelosGlobais[99][0]._confirmacaoLocalPendente);
 console.log('OK: rede antes de sucesso; popup/seletor; duas estacoes; varios modelos; snapshot antigo; reinicio; retorno explicito; falha/zero/releitura divergente; Corrigir Arte; recibo legado preservado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
