import { senhaTecnica } from '../_compartilhado/vibe_pin.ts';
import { comCors, origemPermitida, respostaDePreflight } from '../_compartilhado/cors.ts';

// Auth Admin permanece exclusivamente no servidor; nunca retorna senha ou chave.
export async function atender(req: Request, fetcher: typeof fetch = fetch, env=(n:string)=>Deno.env.get(n)) {
  const origem=origemPermitida(req.headers.get('origin'));
  const resposta=(body:unknown,status=200)=>comCors(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),origem);
  if(req.method==='OPTIONS')return respostaDePreflight(origem,'POST, OPTIONS','authorization,content-type,apikey,x-client-info');
  if(req.headers.has('origin')&&!origem)return resposta({erro:'Origem não permitida.'},403);
  if(req.method!=='POST')return resposta({erro:'Método não permitido.'},405);
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
  const pinSecret=env('VIBE_ENTREGAS_PIN_SECRET');
  if(!url||!anon||!service||!pinSecret||pinSecret.length<32)return resposta({erro:'Serviço indisponível.'},503);
  const token=req.headers.get('authorization')||'';
  if(!token.startsWith('Bearer '))return resposta({erro:'Entre com sua conta ADM.'},401);
  try {
    const usuario=await fetcher(url+'/auth/v1/user',{headers:{Authorization:token,apikey:anon},signal:AbortSignal.timeout(10000)});
    if(!usuario.ok || !(await usuario.json()).id)return resposta({erro:'Sessão inválida.'},401);
    const rpc=async(nome:string,body:unknown)=>fetcher(url+'/rest/v1/rpc/'+nome,{method:'POST',headers:{Authorization:token,apikey:anon,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const permissao=await rpc('ve_admin_edita',{});
    if(!permissao.ok||await permissao.json()!==true)return resposta({erro:'Edição restrita ao ADM autorizado.'},403);
    const raw=await req.text();if(raw.length>12000)return resposta({erro:'Solicitação muito grande.'},413);
    let body;try{body=JSON.parse(raw);}catch{return resposta({erro:'Solicitação inválida.'},400);}
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!body || typeof body.senha!=='string'||!/^[0-9]{4}$/.test(body.senha))return resposta({erro:'Use um PIN com exatamente 4 dígitos.'},400);
    const admin=async(path:string,method:string,dados:unknown)=>fetcher(url+'/auth/v1/admin/users'+path,{method,headers:{Authorization:'Bearer '+service,apikey:service,'Content-Type':'application/json'},body:JSON.stringify(dados),signal:AbortSignal.timeout(15000)});
    if(body.acao==='criar') {
      if(!uuid.test(body.operacao)||typeof body.nome!=='string'||body.nome.trim().length<2||body.nome.trim().length>120||typeof body.email!=='string'||body.email.length>254)return resposta({erro:'Confira nome e e-mail.'},400);
      const email=body.email.trim().toLowerCase();
      const reserva=await rpc('ve_admin_preparar_cadastro_geral',{p_operacao:body.operacao,p_email:email,p_nome:body.nome.trim()});
      if(!reserva.ok)return resposta({erro:'Cadastro recusado. Confira se o e-mail já pertence a outra conta. Para retomar, mantenha os mesmos dados.'},409);
      const pendente=await reserva.json();
      if(!pendente.usuario) {
        const criado=await admin('','POST',{email,password:await senhaTecnica(pinSecret,email,body.senha),email_confirm:true,app_metadata:{vibe_operacao:body.operacao},user_metadata:{name:body.nome.trim()}});
        if(!criado.ok)return resposta({erro:'Não foi possível criar o login. Confira o e-mail e a política de senha; tente novamente com os mesmos dados.'},409);
        const conta=await criado.json();if(!conta.id)return resposta({erro:'O servidor não confirmou o login. Tente novamente com os mesmos dados.'},502);
      }
      const final=await rpc('ve_admin_concluir_cadastro',{p_operacao:body.operacao});
      if(!final.ok)return resposta({erro:'Login reservado, mas acesso ainda não confirmado. Tente novamente com os mesmos dados.'},409);
      const salvo=await final.json();if(salvo.confirmado!==true)return resposta({erro:'Cadastro não confirmado.'},502);
      return resposta({confirmado:true,usuario:salvo.usuario});
    }
    if(body.acao==='senha'&&uuid.test(body.usuario)) {
      const alvo=await rpc('ve_admin_conta_senha',{p_usuario:body.usuario});
      const contaAlvo=alvo.ok?await alvo.json():null;
      if(contaAlvo?.usuario!==body.usuario||typeof contaAlvo.email!=='string')return resposta({erro:'Conta não gerenciada pelo Vibe Entregas.'},403);
      const alterado=await admin('/'+body.usuario,'PUT',{password:await senhaTecnica(pinSecret,contaAlvo.email,body.senha)});
      if(!alterado.ok||(await alterado.json()).id!==body.usuario)return resposta({erro:'Nova senha não confirmada. Confira a política de senha.'},409);
      return resposta({confirmado:true});
    }
    return resposta({erro:'Ação inválida.'},400);
  } catch {return resposta({erro:'Operação não confirmada. Atualize a consulta antes de tentar novamente.'},503);}
}
if(import.meta.main)Deno.serve(req=>atender(req));
