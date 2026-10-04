import { salvarConfigAproveitamento as salvar } from './config_aproveitamento.ts';
import { Recusa } from './sessao.ts';
const admin={perm_admin_edit:true};
async function recusa(status:number, fn:()=>Promise<unknown>) {
  try { await fn(); } catch(e) { if(e instanceof Recusa && e.status===status) return; throw e; }
  throw new Error('Era esperada uma recusa.');
}
Deno.test('conta comum, codigo local e perfil sem permissao nao escrevem', async()=>{
  for(const identidade of [null,{role:'admin'},{perm_admin_edit:false}]) {
    await recusa(403,()=>salvar('limiar',{chave:'limiar_sobra',valor:.2},identidade,()=>{throw new Error('Nao pode acessar o banco');}));
  }
});
Deno.test('limiar conserva decimal e confirma escrita com releitura',async()=>{
  let registro:any; const chamadas:string[]=[];
  const r=await salvar('limiar',{chave:'limiar_sobra',valor:.275},admin,async(m,c,b,p)=>{
    chamadas.push(m+' '+c); if(m==='POST'){registro=b;if(p!=='resolution=merge-duplicates,return=representation')throw Error('Prefer incorreto');}return[registro];
  });
  if(r.configuracao.valor!==.275 || chamadas.length!==2)throw Error('Contrato divergente');
});
Deno.test('produto preserva liberacao e permite limpar excecao de limiar',async()=>{
  let registro:any;
  const r=await salvar('produto',{id_produto:'123',nome:'Produto sintético',liberado:true,limiar_sobra:null},admin,async(m,_c,b)=>{if(m==='POST')registro=b;return[registro];});
  if(r.configuracao.liberado!==true || r.configuracao.limiar_sobra!==null)throw Error('Campos foram alterados');
});
Deno.test('payload livre, SQL no identificador e limites invalidos sao recusados',async()=>{
  for(const corpo of [{chave:'outra',valor:.2},{chave:'limiar_sobra',valor:0},{chave:'limiar_sobra',valor:1.01},{chave:'limiar_sobra',valor:.2,role:'admin'}])await recusa(422,()=>salvar('limiar',corpo,admin));
  await recusa(422,()=>salvar('produto',{id_produto:'1,or=(true)',nome:null,liberado:true,limiar_sobra:null},admin));
});
Deno.test('escrita sem linha devolvida nao confirma sucesso',async()=>{
  await recusa(503,()=>salvar('limiar',{chave:'limiar_sobra',valor:.2},admin,async()=>[]));
});
Deno.test('releitura divergente recusa e nao repete a escrita',async()=>{
  let writes=0;
  await recusa(409,()=>salvar('limiar',{chave:'limiar_sobra',valor:.2},admin,async(m,_c,b)=>{if(m==='POST'){writes++;return[b];}return[{chave:'limiar_sobra',valor:.3}];}));
  if(writes!==1)throw Error('Escrita repetida');
});
