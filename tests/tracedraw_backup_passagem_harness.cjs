const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function test(fail=false){
 let calls=0,toasts=[];
 const window={_currentPerms:{perm_lista_arte_edit:true},ImpositionTraceDraw:{configure:()=>{}}};
 vm.runInNewContext(fs.readFileSync('frontend/tracedraw-runtime.js','utf8'),{window,AbortController,clearTimeout,
  setTimeout:fn=>{queueMicrotask(fn);return 0;},toast:text=>toasts.push(text),state:{osItens:{o:[{id:7,id_int:123}]}},
  supabaseClient:{rpc:async(name,args)=>{assert.equal(name,'imposition_tracedraw_backup_estado');assert.equal(args.p_pedido,123);calls++;
   return fail?{error:true}:{data:{pending:calls<3}};}}});
 if(fail)await assert.rejects(window.aguardarBackupTraceDraw('o',7),/conferir/);
 else {await window.aguardarBackupTraceDraw('o',7);assert.equal(calls,3);assert.equal(toasts.length,1);}
}
(async()=>{await test();await test(true);console.log('Passagem: aguarda backup confirmado e recusa falha de consulta OK');})().catch(e=>{console.error(e);process.exitCode=1;});
