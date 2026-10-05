/** Canal independente, somente leitura. Nao modifica funcoes da producao. */
import { banco } from '../_compartilhado/banco.ts';
import { Recusa } from '../_compartilhado/sessao.ts';
import { segredo } from '../_compartilhado/segredos.ts';
import { iguaisEmTempoConstante } from '../_compartilhado/assinatura.ts';
import { operarPilotoEstacao } from '../_compartilhado/piloto_estacao.ts';
import { conferirPiloto } from '../_compartilhado/piloto_local.ts';

async function conferirAgente(req: Request) {
  const esperado = await segredo('ACESSO_AGENTE_SEGREDO');
  const recebido = req.headers.get('x-agente-segredo') || '';
  if (!esperado || !recebido || !iguaisEmTempoConstante(recebido, esperado)) {
    throw new Recusa(401, 'identidade do agente necessaria');
  }
}

async function conferirSessao(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) throw new Recusa(401, 'sessao necessaria');
  // A funcao aceita tambem o agente, portanto nao usa claims de JWT sem validacao.
  const resposta = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
    method:'GET',
    headers: { Authorization:authorization, apikey:Deno.env.get('SUPABASE_ANON_KEY') || '' }
  });
  if (!resposta.ok) throw new Recusa(401, 'sessao invalida');
  const usuario = await resposta.json();
  if (typeof usuario.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(usuario.id)) {
    throw new Recusa(401, 'sessao invalida');
  }
  const linhas = await banco('GET', `imposition_user_permissions?user_id=eq.${usuario.id}&select=*&limit=2`);
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(403, 'permissoes indisponiveis');
  const reader = req.body?.getReader();
  const partes: Uint8Array[] = []; let tamanho = 0;
  if (reader) try {
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      tamanho += value.length;
      if (tamanho > 262144) { await reader.cancel(); throw new Recusa(413, 'solicitacao excede limite'); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(tamanho); let offset = 0;
  for (const parte of partes) { bytes.set(parte,offset); offset += parte.length; }
  const raw = new TextDecoder().decode(bytes);
  let corpo;
  try { corpo = JSON.parse(raw); } catch { throw new Recusa(422, 'JSON invalido'); }
  return await conferirPiloto(corpo, linhas[0]);
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const permitido = !origin || /^http:\/\/(127\.0\.0\.1|localhost):9001$/.test(origin);
  const headers: Record<string,string> = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin'};
  if (origin && permitido) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization,apikey,content-type,x-agente-segredo';
  headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS';
  const resposta = (status:number,body:unknown) => new Response(JSON.stringify(body),{status,headers});
  if (!permitido) return resposta(403,{detail:'origem recusada'});
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (req.method!=='POST') return resposta(405,{detail:'metodo recusado'});
  const acao = new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  try {
    if (acao==='listar' || acao==='conferir' || acao==='conferir-pedido') return resposta(200,await operarPilotoEstacao(acao,req,conferirAgente));
    if (acao==='conferir-sessao') return resposta(200,await conferirSessao(req));
    return resposta(404,{detail:'operacao inexistente'});
  } catch(e) {
    return e instanceof Recusa ? resposta(e.status,{detail:e.detail}) : resposta(503,{detail:'consulta do piloto indisponivel'});
  }
}
if (import.meta.main) Deno.serve(handler);
