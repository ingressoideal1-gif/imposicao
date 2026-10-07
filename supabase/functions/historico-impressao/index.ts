import { banco } from '../_compartilhado/banco.ts';
import { Recusa } from '../_compartilhado/sessao.ts';
import { segredo } from '../_compartilhado/segredos.ts';
import { iguaisEmTempoConstante } from '../_compartilhado/assinatura.ts';
import { conferirVinculoPiloto, operadorDaEstacaoPiloto } from '../_compartilhado/piloto_estacao.ts';
import { origemPermitida, comCors } from '../_compartilhado/cors.ts';
import { empresaHistorico, receberHistorico, consultarHistorico } from '../_compartilhado/historico_impressao.ts';

async function corpoLimitado(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Recusa(422, 'corpo necessario');
  const partes: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      total += value.length;
      if (total > 262144) { await reader.cancel(); throw new Recusa(413, 'lote excede limite'); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let pos = 0;
  for (const p of partes) { bytes.set(p,pos); pos += p.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Recusa(422, 'JSON invalido'); }
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin'), permitido = origemPermitida(origin);
  const responder = (status:number, dados:unknown) => comCors(new Response(JSON.stringify(dados), {status,
    headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}), permitido);
  if (origin && !permitido) return responder(403,{detail:'origem recusada'});
  if (req.method === 'OPTIONS') return comCors(new Response(null, {status:204, headers:{
    'Access-Control-Allow-Methods':'POST,OPTIONS', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'}}), permitido);
  if (req.method !== 'POST') return responder(405,{detail:'metodo recusado'});
  try {
    const acao = new URL(req.url).pathname.split('/').at(-1);
    const empresa = Deno.env.get('PILOTO_LOCAL_EMPRESA'), empresaId = Deno.env.get('PILOTO_LOCAL_EMPRESA_ID');
    if (acao === 'enviar') {
      const esperado = await segredo('ACESSO_AGENTE_SEGREDO'), recebido = req.headers.get('x-agente-segredo') || '';
      if (!esperado || !recebido || !iguaisEmTempoConstante(recebido,esperado)) throw new Recusa(401,'agente necessario');
      const corpo = await corpoLimitado(req);
      const operador = await operadorDaEstacaoPiloto(corpo.estacao, Deno.env.get('PILOTO_LOCAL_ESTACAO') || '', Deno.env.get('PILOTO_LOCAL_OPERADOR') || '');
      const vinculo = await conferirVinculoPiloto(operador, corpo.estacao, empresa);
      if (vinculo.perm_imprimir !== true || vinculo.perm_producao_view !== true) throw new Recusa(403,'estacao sem permissao');
      return responder(200, await receberHistorico(corpo, empresaHistorico(vinculo,empresa,empresaId)));
    }
    if (acao !== 'consultar') throw new Recusa(404,'operacao inexistente');
    const authorization = req.headers.get('authorization') || '';
    if (!/^Bearer \S+$/i.test(authorization)) throw new Recusa(401,'sessao necessaria');
    const r = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {headers:{Authorization:authorization,
      apikey:Deno.env.get('SUPABASE_ANON_KEY') || ''}, signal:AbortSignal.timeout(5000)});
    if (!r.ok) throw new Recusa(401,'sessao invalida');
    const user = await r.json();
    if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Recusa(401,'sessao invalida');
    const rows = await banco('GET', 'imposition_user_permissions?user_id=eq.' + user.id + '&select=*&limit=2');
    const p = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (p?.perm_admin_view !== true && p?.perm_admin_edit !== true) throw new Recusa(403,'permissao de gerenciamento necessaria');
    return responder(200, await consultarHistorico(await corpoLimitado(req), empresaHistorico(p,empresa,empresaId)));
  } catch (e) {
    return e instanceof Recusa ? responder(e.status,{detail:e.detail}) : responder(503,{detail:'historico indisponivel'});
  }
}
if (import.meta.main) Deno.serve(handler);
